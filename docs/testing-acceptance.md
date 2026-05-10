# Acceptance Test Suite

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

- `ANTHROPIC_API_KEY` must **not** be set. The harness deletes it in `beforeAll`. Any route code path that reaches the real `extractItemsFromImage` will throw (no API key), surfacing accidental cache misses as 500 responses in triage parse/upload tests.
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

Each test file calls `setupAcceptance()` at its top level (after any `vi.mock()` hoists and imports). `setupAcceptance()` registers `beforeAll`/`afterAll` hooks that:

1. Create a per-file temp tree via `mkdtemp` (keyed by `VITEST_POOL_ID` for readable names), set `DATA_DIR` and `SCREENSHOT_DIR`.
2. Boot an in-process Next.js dev server (`next({ dev: true })`) on port 0 (OS-assigned).
3. Expose `baseUrl`, `tmpDir`, and `screenshotDir` as live-binding ESM exports for use in test callbacks.
4. Run the URL-encoding probe (see below) and expose `nextDecodesEncodedSlash`.

`afterAll` closes the HTTP listener, restores environment variables, and removes the temp tree.

### Per-worker isolation

`vitest.acceptance.config.ts` uses `pool: "forks"` with `fileParallelism: false`. Each test file runs in its own subprocess with isolated `process.env`. `fileParallelism: false` enforces sequential file execution so that only one in-process Next.js dev server exists at a time — Next.js enforces a single-instance lock file per project directory.

### Environment variable contract

| Variable | Set by harness | Notes |
|----------|---------------|-------|
| `DATA_DIR` | `beforeAll` | Per-file mkdtemp; restored in `afterAll` |
| `SCREENSHOT_DIR` | `beforeAll` | Subdirectory of DATA_DIR; restored in `afterAll` |
| `ANTHROPIC_API_KEY` | **deleted** in `beforeAll` | Any accidental LLM call throws loudly |
| `UPLOAD_SECRET` | **deleted** in `beforeAll` | Set per-test via `withUploadSecret(value, fn)` |

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

## vi.mock() and route handler interception

Next.js compiles route handlers through its own module evaluation system (independent of Node.js's `require()`). Vitest's `vi.mock()` patches Node.js's module registry, which is not reached by the Next.js module loader. As a result:

- `vi.mock()` **does work** for modules imported directly in the test file (e.g., the mock is callable from the test).
- `vi.mock()` **does not intercept** the same module when loaded by a Next.js route handler.

### How triage tests control route behaviour without vi.mock()

Instead of mock return values, tests control route behaviour through filesystem state:

- **Cache hit path**: Pre-seed a `DATA_DIR/screenshot-cache/<hash>.json` entry before uploading/parsing. The route finds the entry and returns 201/200 (`cached: true`) without calling the LLM.
- **Cache miss path (LLM error)**: Use unique bytes (no pre-seeded cache). The route calls the real `extractItemsFromImage`, which throws immediately (`ANTHROPIC_API_KEY` not set). The route surfaces this as a 500 (parse) or 200 with `parseStatus: "error"` (upload).
- **Corrupted cache (D16)**: Pre-write `{` (truncated JSON) to the cache path. The route's `getCachedParse` throws on JSON parse, handles it as non-fatal (D16), and falls through to the LLM — which then throws the API key error.

The 201 (upload) / 200 cached:true (parse) status proves the cache-hit path was taken. A 200 with `parseStatus: "error"` (upload) or 500 (parse) proves the LLM-error path was reached. Since `ANTHROPIC_API_KEY` is not set, any route that reaches the real `extractItemsFromImage` is identifiable by the LLM error message in the response body.

## URL-encoding probe

`setupAcceptance()` probes whether Next.js decodes a percent-encoded slash (`%2F`) in a path segment:

```ts
const probeUrl = `${baseUrl}/api/triage/screenshots/${encodeURIComponent("../probe.png")}`;
// encodeURIComponent('../probe.png') = '..%2Fprobe.png'
```

The result is stored in `nextDecodesEncodedSlash` (a live-binding export). Both decoded and undecoded outcomes result in a 404/400 for path-traversal filenames; the flag is provided for documentation, not conditional assertions.
