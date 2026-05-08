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

In production, `DATA_DIR` must be set or the app will throw at startup.

## Architecture

**Stack:** Next.js 16 App Router · React 19 · Tailwind CSS v4 · shadcn/ui (stone, vendored) · Lucide React

**Styling:** Tailwind v4 `@theme` directive in `app/globals.css` — no `tailwind.config.js`. All design tokens are CSS custom properties at `:root`. Dark-only baseline; no `.dark` selector or `dark:` variants anywhere.

**Persistence:** File-based via Next.js Route Handlers (`app/api/characters/route.ts`). The `lib/persistence/` module reads/writes JSON files from `DATA_DIR`. No database dependency for v1.

**Character import:** not currently shipped. Manual entry via /characters/new is the only path; see docs/future-import-paths.md for the import roadmap.

**Entry point:** Visit `/` (redirects to `/builds`) to see the build list. Create a character from `/characters/new`.

## Foundational Docs

| Document | Purpose |
|----------|---------|
| `docs/vision.md` | Product vision, target users, non-goals |
| `docs/visual-spec.md` | Design system, color tokens, typography, layout |
| `docs/scoring-engine.md` | Build scoring algorithm spec (provisional) |
| `docs/data-sources/` | Catalog of D4 data sources available for integration |

## For Downstream Agents

Schemas in `lib/schema/` (Zod + inferred types) are the canonical shape for all domain types — `Character`, `Item`, `Affix`, `Build`, `D4Class`, `ItemRarity`. Persistence and route handlers in `lib/persistence/` and `app/api/` read/write through these schemas. Component prop types compose from `lib/schema` rather than inlining.
