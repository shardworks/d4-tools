# D4 Tools

A Next.js 16 web application for Diablo 4 build analysis. Provides a structured interface for viewing and evaluating character builds, gear, and stats.

## Running Locally

This project uses **pnpm**. Do not use `npm install` or `yarn install` — both `package-lock.json` and `yarn.lock` are gitignored.

```bash
pnpm install
cp .env.example .env.local
pnpm dev
```

The app runs at `http://localhost:3000`.

### Environment Variables

| Variable | Default (dev) | Required | Description |
|----------|--------------|----------|-------------|
| `DATA_DIR` | `./data/` | Production only | Directory for file-based character/build persistence. Required in production. |
| `SCREENSHOT_DIR` | _(none)_ | Always | Destination directory for uploaded screenshots and the `/triage` gallery source. The upload endpoint writes here; the gallery reads here. No dev fallback — the app throws if unset whenever `/triage` is used. |
| `ANTHROPIC_API_KEY` | _(none)_ | For `/triage` | Anthropic API key for Vision-LLM screenshot parsing. Server-side only — never exposed to the browser. |
| `ANTHROPIC_API_URL` | `https://api.anthropic.com/v1/messages` | No | Override the Anthropic API endpoint. Used by the e2e test suite to redirect Vision API calls to a local mock server. Do not set in production. |
| `ANTHROPIC_BASE_URL` | `https://api.anthropic.com` | No | Override the Anthropic API origin; the client appends `/v1/messages` to form the full endpoint. `ANTHROPIC_API_URL` wins when both are set. Used by the HTTP acceptance harness's stub server. Do not set in production. |
| `UPLOAD_SECRET` | _(none)_ | Recommended for non-LAN | Optional shared secret for `POST /api/triage/upload`. Set to any strong random string when the endpoint is reachable beyond a private LAN. The PowerShell watcher sends this as `X-Upload-Token`. |

In production, `DATA_DIR` must be set or the app will throw at startup. `SCREENSHOT_DIR` and `ANTHROPIC_API_KEY` are required to use the `/triage` workspace.

## Architecture

**Stack:** Next.js 16 App Router · React 19 · Tailwind CSS v4 · shadcn/ui (stone, vendored) · Lucide React

**Styling:** Tailwind v4 `@theme` directive in `app/globals.css` — no `tailwind.config.js`. All design tokens are CSS custom properties at `:root`. Dark-only baseline; no `.dark` selector or `dark:` variants anywhere.

**Persistence:** File-based via Next.js Route Handlers (`app/api/characters/route.ts`). The `lib/persistence/` module reads/writes JSON files from `DATA_DIR`. No database dependency for v1.

**Damage engine:** `lib/damage/` provides a pure-functional sustained boss DPS calculator encoding D4's multiplicative-bucket damage formula. Called at render-time (no I/O); results are wired to the build detail page (DPS chip in the header + per-skill breakdown table) and triage pane (DPS delta when previewing a new item). See `lib/damage/README.md`.

**Character import / Triage:** Screenshots arrive via the upload pipeline: the gaming machine runs a foreground PowerShell watcher (`bin/screenshot-watcher.ps1`) that watches the D4 screenshot folder and POSTs new files to `POST /api/triage/upload`. The server saves each image under `SCREENSHOT_DIR`, calls the Anthropic Vision API synchronously, caches the result, and returns the parse outcome. The `/triage` gallery displays all uploaded screenshots with their parse results and a fallback Parse button. Manual entry via `/characters/new` remains the primary character-setup path; triage is used for loot evaluation. See [`docs/triage-deployment.md`](docs/triage-deployment.md) for cross-host topology and networking options.

**Entry point:** Visit `/` (redirects to `/builds`) to see the build list. Create a character from `/characters/new`. Triage loot screenshots from `/triage`.

## Testing

```bash
# Unit + integration tests (fast inner loop — no Next.js server)
pnpm test

# HTTP-server acceptance tests (boots a real Next.js server per test file)
pnpm test:acceptance
```

`pnpm test:acceptance` chains `next build` (catches build-time errors) then runs the acceptance suite under `vitest.acceptance.config.ts`. It is intentionally **not** part of `pnpm test` — the `next build` cost should not land on the inner loop.

The acceptance suite lives under `__tests__/acceptance/` and exercises every `app/api/**/route.ts` route via real `fetch()` calls against an in-process server. Each test file boots its own server on an OS-assigned port with an isolated temp directory for `DATA_DIR`/`SCREENSHOT_DIR`. `ANTHROPIC_API_KEY` is never set; routes are kept off the LLM path by pre-seeding filesystem cache entries.

See [`docs/testing-acceptance.md`](docs/testing-acceptance.md) for a full description of the suite architecture, harness contract, and mock/seeding strategy.

## Foundational Docs

| Document | Purpose |
|----------|---------|
| `docs/vision.md` | Product vision, target users, non-goals |
| `docs/visual-spec.md` | Design system, color tokens, typography, layout |
| `docs/scoring-engine.md` | Build scoring algorithm spec (provisional) |
| `docs/damage-engine-research-summary.md` | Damage engine research, decisions, and open items |
| `lib/damage/README.md` | Damage engine API, formula, config, and module layout |
| `docs/data-sources/` | Catalog of D4 data sources available for integration |
| `tools/datamine-import/README.md` | Datamine import tool — patch update workflow and curation guide |

## Data Sources

The game catalog (`lib/catalog/`) is regenerated from the [DiabloTools/d4data](https://github.com/DiabloTools/d4data) datamine using the import pipeline in `tools/datamine-import/`. **This is the supported path for all catalog updates** — do not edit `lib/catalog/*.json` directly.

Run the import tool to regenerate the catalog from a local datamine clone:

```bash
git clone https://github.com/DiabloTools/d4data.git /path/to/d4data
pnpm import:datamine --build 3.0.1.71747 --datamine /path/to/d4data
```

See `tools/datamine-import/README.md` for the full patch-update workflow, curation guide, and exit code reference.

> **Note:** The per-class skill and paragon catalog entries were previously verified by manual audit across v6–v9 (`docs/datamine-verification-*.md`). That manual audit pattern is now subsumed by the import tool, which regenerates skills and paragon alongside affixes, aspects, and uniques in a single idempotent pass.

## Testing

### Unit / Integration Tests (vitest)

```bash
pnpm test
```

Runs the 18-file vitest suite covering persistence, triage extraction, resolver, damage engine, and schema validation. Test files live under `__tests__/` and match `*.test.ts`.

### End-to-End Tests (Playwright)

```bash
# One-time browser install
pnpm exec playwright install chromium

# Run full suite headlessly
pnpm test:e2e

# Remote-monitor UI via Docker (opens browser on port 9323)
pnpm e2e:ui
```

The e2e suite (`e2e/*.spec.ts`) drives every UI-facing feature in a real Chromium browser — Radix dialogs, react-hook-form state, optimistic-update patterns, and the triage parse → resolve → wear → delete funnel. It runs offline-safe against a local Anthropic API mock; no real API key is needed for testing.

See [`docs/e2e-testing.md`](docs/e2e-testing.md) for the full guide: run modes, port configuration, the per-spec isolation model, the Anthropic mock, and known failing tests.

## For Downstream Agents

Schemas in `lib/schema/` (Zod + inferred types) are the canonical shape for all domain types — `Character`, `Item`, `Affix`, `Build`, `D4Class`, `ItemRarity`. Persistence and route handlers in `lib/persistence/` and `app/api/` read/write through these schemas. Component prop types compose from `lib/schema` rather than inlining.

The e2e fixture harness lives in `e2e/fixtures/` and exposes `createTestContext()` / `destroyTestContext()` for per-spec isolation. Tests that exercise the triage pipeline use `ctx.mockServer.expect("fixture-name")` to register mock Anthropic responses before triggering Parse actions.
