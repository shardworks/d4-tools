# E2E Testing Guide

This document covers the Playwright-based end-to-end test suite for d4-tools.

The suite runs Chromium against every UI-facing feature — Radix dialogs, react-hook-form state, optimistic-update patterns, the triage funnel — in an offline-safe environment backed by a local Anthropic API mock. The same spec files run in three modes: local development, CI, and a remote-monitored Docker UI.

---

## Prerequisites

- **pnpm** — install with `corepack enable && corepack prepare pnpm@latest --activate`
- **Node 24** — `engines.node` is `>=24.15.0 <25`
- **Chromium** (local dev only) — one-time install: `pnpm exec playwright install chromium`
- **Docker + Docker Compose** (UI/remote mode only)

---

## Run Modes

### 1. Local Development (headless)

Runs the full suite headlessly against per-spec `next dev` instances:

```bash
# One-time setup (first checkout only)
pnpm exec playwright install chromium

# Run all specs
pnpm test:e2e

# Run a single spec
pnpm exec playwright test e2e/builds-list.spec.ts

# Open the HTML report after a run
pnpm exec playwright show-report
```

**What happens:**
- Playwright spawns 2 workers in parallel (override via `PLAYWRIGHT_WORKERS`)
- Each spec file starts its own `next dev` on a random free port with isolated temp dirs
- The Anthropic Vision API is intercepted by an in-process HTTP stub — no real API calls
- Results write to `playwright-report/`

### 2. CI (headless)

Same as local dev — just set `CI=true` so Playwright enables retries and strict mode:

```bash
CI=true pnpm test:e2e
```

**CI steps (provider-agnostic):**

```yaml
# Install dependencies
- run: pnpm install

# Install Playwright browsers
- run: pnpm exec playwright install chromium

# Run the suite
- run: CI=true pnpm test:e2e

# Upload the HTML report (optional)
- uses: actions/upload-artifact@v4
  if: always()
  with:
    name: playwright-report
    path: playwright-report/
```

### 3. Remote Monitor (Docker UI)

Brings up a Docker container with Playwright's interactive UI accessible from any machine on the LAN:

```bash
pnpm e2e:ui
```

This runs `docker compose -f docker-compose.e2e.yml up`. The container:

1. Installs pnpm dependencies
2. Installs Playwright's Chromium browser
3. Starts Playwright UI on `0.0.0.0:$E2E_UI_PORT`

**Access URLs from a remote laptop:**

| Service | Default URL | Override |
|---------|-------------|----------|
| Playwright UI | `http://<host>:9323` | `E2E_UI_PORT` |
| HTML report | `http://<host>:9324` | `E2E_REPORT_PORT` |

**Watching test execution:**

Open `http://<host>:9323` in your laptop browser. From Playwright UI you can:
- Run individual tests or the full suite
- Watch tests execute step by step with DOM snapshots
- View screenshots taken on failure
- Inspect full traces (network, actions, DOM state at each step)

Per-spec `next dev` instances are bound to `0.0.0.0` on OS-assigned ephemeral ports inside the container. There is no fixed app port published to the host; the developer interacts with the app exclusively through Playwright UI traces and DOM snapshots rather than visiting the app directly.

To view the HTML report from a remote machine after a run:

```bash
# Inside the container
docker compose -f docker-compose.e2e.yml exec e2e \
  playwright show-report --host 0.0.0.0 --port 9324
```

Then open `http://<host>:9324` in your browser.

---

## Port Configuration

Two ports are published by the Docker setup:

| Port | Default | Override env var | Purpose |
|------|---------|-----------------|---------|
| 9323 | `9323` | `E2E_UI_PORT` | Playwright interactive UI |
| 9324 | `9324` | `E2E_REPORT_PORT` | HTML report server (post-run) |

Override ports by setting the env vars before starting:

```bash
E2E_UI_PORT=19323 E2E_REPORT_PORT=19324 pnpm e2e:ui
```

Or create `.env.e2e` from the template:

```bash
cp .env.e2e.example .env.e2e
# Edit .env.e2e to set port overrides
pnpm e2e:ui
```

---

## Per-Spec Isolation Model

Each spec file (`e2e/*.spec.ts`) owns its full environment:

- **DATA_DIR**: a `mkdtemp`'d directory under `./tmp/e2e/` with seeded characters, builds, and screenshots
- **SCREENSHOT_DIR**: a separate `mkdtemp`'d directory with fixture image files
- **Anthropic stub**: an in-process HTTP server that returns pre-recorded fixtures instead of calling the real API
- **next dev**: a dedicated process on an OS-assigned free port, bound to `0.0.0.0`

Setup/teardown happens in `beforeAll`/`afterAll`. Tests in the same spec share the server; cross-spec isolation is guaranteed by the separate processes.

**Seeding** uses `lib/persistence/*` helpers (Zod-validated atomic writes), never hand-crafted JSON. Parse cache entries are pre-seeded via `writeCachedParse()`.

**Concurrency safety**: when multiple `createTestContext()` calls run concurrently (e.g. in `Promise.all`), the seeder's env-var mutation (`DATA_DIR` / `SCREENSHOT_DIR`) is serialised via a module-level mutex. This prevents data-dir cross-contamination between concurrent seed operations.

**Screenshot ordering** is deterministic: `fs.utimes()` sets explicit mtimes on fixture files so the gallery's mtime-desc sort produces a stable test order.

**Temp dirs** are created inside `./tmp/e2e/` (workspace-local). The `tmp/` directory is excluded from `tsconfig.json` so any type-path entries written by Next.js for per-spec dist dirs are automatically ignored — no manual tsconfig cleanup is needed.

---

## Anthropic Mock Model

The Anthropic Vision API is intercepted at the URL level:

- The app server is started with `ANTHROPIC_API_URL=http://127.0.0.1:<mockPort>/v1/messages`
- An in-process HTTP stub serves that endpoint
- Before clicking Parse in a test, the spec calls `ctx.mockServer.expect("fixture-name")`
- The stub returns the corresponding `e2e/fixtures/screenshots/<name>-recorded.json` in Anthropic response format

**Fixture names and their fixtures:**

| Name | File | Parse result |
|------|------|-------------|
| `helm-sorcerer` | `helm-sorcerer-recorded.json` | `kind:"item"` — Magistrate's Cowl helm |
| `ring-aspect` | `ring-aspect-recorded.json` | `kind:"item"` — Serpentine Ring with Conceited Aspect |
| `ring-value-mismatch` | `ring-value-mismatch-recorded.json` | `kind:"item"` — ring with value-mismatch affix |
| `no-item` | `no-item-recorded.json` | `kind:"no-item-detected"` |
| `uncertain` | `uncertain-recorded.json` | `kind:"uncertain"` |
| `unique-harlequin` | `unique-harlequin-recorded.json` | `kind:"item"` — Harlequin Crest unique |
| `chest-synonym` | `chest-synonym-recorded.json` | `kind:"item"` — chest with synonym affix |

To simulate an API error: `ctx.mockServer.expectError()`.

The suite runs correctly with the network unplugged — it never contacts `api.anthropic.com`.

---

## Known Fixmes

**`e2e/navigation.spec.ts` — "Go to Build… navigates to /builds/<id>"**

This test is marked `test.fixme()` (tracked as obs-1). The bug: `CommandPalette.tsx` in `nav-build` mode calls `exportBuild()` instead of `router.push()`. Fix that component, then remove the `fixme` annotation and the TODO comment.

---

## Developing New Specs

1. Create `e2e/<surface>.spec.ts`
2. Import `createTestContext`, `destroyTestContext`, `dismissSoftGate` from `./fixtures`
3. Use `beforeAll`/`afterAll` for server lifecycle
4. Navigate with absolute URLs: `await page.goto(\`\${ctx.baseURL}/builds\`)`
5. Call `dismissSoftGate(page)` at the start of each test (or in a `beforeEach`)
6. For triage parse tests: call `ctx.mockServer.expect("fixture-name")` before clicking Parse

All Playwright specs use the `.spec.ts` suffix, which is excluded from vitest's `*.test.ts` include glob. Vitest and Playwright coexist without configuration.

---

## Troubleshooting

**`next dev` times out starting:**
The per-spec server has a 120-second startup timeout. On slow machines, increase it in `e2e/fixtures/server.ts` (`READY_TIMEOUT_MS`).

**Port conflicts:**
If a test server port is in use, the OS will assign a different one — conflicts are handled automatically by the `getFreePort()` helper.

**Flaky gallery ordering:**
Gallery sort is mtime-based. If flakiness appears in order-sensitive tests, verify that `seeder.seedScreenshot()` calls include explicit `mtime` options.

**Orphaned `next dev` processes:**
If a test run is killed mid-spec, orphaned `next dev` processes may linger. Kill them with: `pkill -f "next dev"`.

**Docker image doesn't build:**
The `mcr.microsoft.com/playwright:v1.59.1-jammy` base image requires Docker Hub access. Behind a corporate proxy, set `HTTP_PROXY` / `HTTPS_PROXY` in the build environment.
