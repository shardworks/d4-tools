# Acceptance Test Suite

> ## ⛔ DISABLED — DO NOT RUN, DO NOT EXTEND
>
> The acceptance suite is **disabled**. The `pnpm test:acceptance` script and
> `vitest.acceptance.config.ts` config have been **removed** from this repo.
>
> **Reason:** the suite's `next build` precondition (Next.js 16 + Tailwind v4 /
> PostCSS) consumed >15 GB of RAM in an autonomous agent session and crashed
> the host. Until the agent runtime enforces per-session memory ceilings, any
> invocation of `next build` inside an agent session is unsafe and **will
> crash the server**.
>
> **Rules for agents:**
> - Do **not** add `test:acceptance` (or any equivalent launcher) back to
>   `package.json`.
> - Do **not** recreate `vitest.acceptance.config.ts` or wire up an alternate
>   runner for `__tests__/acceptance/`.
> - Do **not** author new tests under `__tests__/acceptance/`.
> - Do **not** invoke `next build` inside an agent session for any reason —
>   not for tests, not for verification, not "just to check."
> - The existing files in `__tests__/acceptance/` are retained as historical
>   reference only.
>
> The remainder of this document is preserved unchanged for archival
> reference. **None of the commands below should be executed.**

---

## Purpose

The acceptance suite exercises every `app/api/**/route.ts` route through a real, in-process Next.js server bound to an OS-assigned port. Tests issue `fetch()` calls against `http://localhost:<port>` and assert on HTTP status codes, response bodies, and filesystem side-effects. This gives high confidence that the entire stack — routing, middleware, persistence, and the triage pipeline — behaves correctly end-to-end.

The suite is intentionally **separate from** `pnpm test` (the unit/integration test path). It lives under `__tests__/acceptance/` and runs via `pnpm test:acceptance`.

## Running the suite

```bash
pnpm test:acceptance
```

This chains two steps:

1. **`next build`** — validates the TypeScript/Turbopack build before any test executes. Build errors surface here rather than mid-test.
2. **`vitest run -c vitest.acceptance.config.ts`** — boots an in-process Next.js dev server per test file and runs each file's tests against it.

> **Cost**: `next build` adds roughly 5–15 s. Never include `test:acceptance` in the inner-loop `pnpm test` path; keep it as an explicit step before commit or in CI.

## Preconditions

- `ANTHROPIC_API_KEY` is set to `"test-stub-key"` by the harness, and `ANTHROPIC_BASE_URL` points at a per-worker stub HTTP server (see "Stub Anthropic server" below). The stub defaults to returning a 401 error response, surfacing accidental cache misses as errors in triage parse/upload tests.
- `UPLOAD_SECRET` is managed per-test via `withUploadSecret(value, fn)` — it is cleared in `beforeAll` so tests that don't call `withUploadSecret` receive an unauthenticated server.

## Test file layout

| File | Routes covered |
|------|---------------|
| `harness.ts` | Shared setup (not a test file) |
| `active-build.test.ts` | `GET/PUT /api/active-build` |
| `builds.test.ts` | `GET/POST /api/builds`, `GET/PUT/DELETE /api/builds/[id]` |
| `characters.test.ts` | `GET/POST /api/characters`, `GET/PUT/DELETE /api/characters/[id]` |
| `triage-cache.test.ts` | `GET /api/triage/cache/[hash]` |
| `triage-cropped.test.ts` | `GET /api/triage/cropped/[hash]`, `GET /api/triage/cropped/[hash]/[index]` |
| `triage-parse.test.ts` | `POST /api/triage/parse` |
| `triage-screenshot-binary.test.ts` | `GET /api/triage/screenshots/[name]` |
| `triage-screenshot-delete.test.ts` | `DELETE /api/triage/screenshots/[name]` |
| `triage-screenshots.test.ts` | `GET /api/triage/screenshots` |
| `triage-upload.test.ts` | `POST /api/triage/upload` |

## Harness (`harness.ts`)

### Server lifecycle

Each test file calls `setupAcceptance()` at its top level. `setupAcceptance()` registers `beforeAll`/`afterAll` hooks that:

1. Create a per-file temp tree via `mkdtemp` (keyed by `VITEST_POOL_ID` for readable names), set `DATA_DIR` and `SCREENSHOT_DIR`.
2. Start the stub Anthropic HTTP server on port 0 and configure `ANTHROPIC_API_KEY` and `ANTHROPIC_BASE_URL`.
3. Boot an in-process Next.js dev server (`next({ dev: true })`) on port 0 (OS-assigned).
4. Expose `baseUrl`, `tmpDir`, and `screenshotDir` as live-binding ESM exports for use in test callbacks.

`afterAll` closes both HTTP listeners, restores environment variables, and removes the temp tree.

### Per-worker isolation

`vitest.acceptance.config.ts` uses `pool: "forks"` with `fileParallelism: false`. Each test file runs in its own subprocess with isolated `process.env`. `fileParallelism: false` enforces sequential file execution so that only one in-process Next.js dev server exists at a time — Next.js enforces a single-instance lock file per project directory.

### Environment variable contract

| Variable | Set by harness | Notes |
|----------|---------------|-------|
| `DATA_DIR` | `beforeAll` | Per-file mkdtemp; restored in `afterAll` |
| `SCREENSHOT_DIR` | `beforeAll` | Subdirectory of DATA_DIR; restored in `afterAll` |
| `ANTHROPIC_API_KEY` | `"test-stub-key"` in `beforeAll` | Routes pass key check; stub validates via HTTP |
| `ANTHROPIC_BASE_URL` | stub server URL in `beforeAll` | Points at the per-worker stub Anthropic server |
| `UPLOAD_SECRET` | **deleted** in `beforeAll` | Set per-test via `withUploadSecret(value, fn)` |

### Stub Anthropic server

The harness starts a per-worker HTTP server that handles `POST /v1/messages` and acts as a drop-in replacement for the Anthropic API. `ANTHROPIC_BASE_URL` is set to point at this server and `ANTHROPIC_API_KEY` is set to `"test-stub-key"` so the route's key check passes.

**Default mode (error)**: Returns a 401 response simulating an invalid API key. Any test that accidentally triggers the LLM path without using `withAnthropicSuccess` will receive an error response, surfacing the mistake.

**Success mode**: Use `withAnthropicSuccess(items, fn)` to configure the stub to return a `tool_use` response with the given items for the duration of the callback.

### Fixtures

- `FAKE_PNG` — 8-byte minimal PNG magic bytes. Passes MIME type checks (`image/png`). The real `cropForVision` processes it successfully and returns `detected: false, count: 1`.
- `FAKE_PNG_B` — Distinct 8-byte buffer (different content → different SHA-256 hash). Used when a second unique image is needed.
- `defaultCropResult(bytes?)` — Canonical `CropResult` stub.
- `makeCacheEntry(overrides?)` — Canonical `CacheEntry` stub (`kind: "item"`, `model: "test-model"`).
- `makeCharacterBody(name)` — Minimal character creation body.
- `makeBuildBody(characterId, name)` — Minimal build creation body.

### Helpers

#### `expectFetch(url, init, expectedStatus, opts?)`

Fetches `url` with `init`, reads the response body, and asserts status. On mismatch throws an `Error` whose message names the HTTP method, route path, expected status, actual status, and a body excerpt — making failure messages actionable.

```ts
const { res, bodyText, json } = await expectFetch(
  `${baseUrl}/api/characters`,
  { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) },
  201
);
const character = json<{ id: string; name: string }>();
```

#### `withUploadSecret(value, fn)`

Sets `UPLOAD_SECRET` to `value`, runs `fn`, then restores the original value in `finally`. Allows individual tests to enable auth without polluting sibling tests.

```ts
await withUploadSecret("my-secret", async () => {
  await expectFetch(`${baseUrl}/api/triage/upload`, { ... }, 401);
});
```

#### `withAnthropicSuccess(items, fn)`

Configures the stub Anthropic server to return a successful `tool_use` response with the given items array for the duration of the callback. Use this for tests that exercise the LLM cache-miss happy path.

```ts
await withAnthropicSuccess([], async () => {
  // The route will call the stub LLM and get a no-item-detected response
  const { json } = await expectFetch(`${baseUrl}/api/triage/parse`, { ... }, 200);
  expect(json<{ cached: boolean }>().cached).toBe(false);
});
```

## vi.mock() and route handler interception

Next.js compiles route handlers through its own module evaluation system (independent of Node.js's `require()`). Vitest's `vi.mock()` patches Node.js's module registry, which is not reached by the Next.js module loader. As a result, `vi.mock()` **does not intercept** modules when loaded by a Next.js route handler.

### How triage tests control route behaviour without vi.mock()

Tests control route behaviour through filesystem state and the stub Anthropic server:

- **Cache hit path**: Pre-seed a `DATA_DIR/screenshot-cache/<hash>.json` entry before uploading/parsing. The route finds the entry and returns 201/200 (`cached: true`) without calling the LLM stub.
- **Cache miss path (LLM success)**: Use `withAnthropicSuccess(items, fn)` so the stub returns a valid LLM response. The route calls the stub, gets a response, writes the cache entry, and returns 200/201.
- **Cache miss path (LLM error)**: Use unique bytes with no pre-seeded cache and no `withAnthropicSuccess`. The stub returns 401, the route surfaces this as a 500 (parse) or 200 with `parseStatus: "error"` (upload).
- **Corrupted cache (D16)**: Pre-write `{` (truncated JSON) to the cache path. The route's `getCachedParse` throws on JSON parse, handles it as non-fatal (D16), and falls through to the LLM stub.
