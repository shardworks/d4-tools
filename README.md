# D4 Tools

A Next.js 16 web application for Diablo 4 build analysis. Provides a structured interface for viewing and evaluating character builds, gear, and stats.

## Running Locally

```bash
npm install
cp .env.example .env.local
npm run dev
```

The app runs at `http://localhost:3000`. The demo character is at `/character/demo`.

### Environment Variables

| Variable | Default (dev) | Description |
|----------|--------------|-------------|
| `DATA_DIR` | `./data/` | Directory for file-based character persistence. Required in production. |

In production, `DATA_DIR` must be set or the app will throw at startup.

## Architecture

**Stack:** Next.js 16 App Router · React 19 · Tailwind CSS v4 · shadcn/ui (stone, vendored) · Lucide React

**Styling:** Tailwind v4 `@theme` directive in `app/globals.css` — no `tailwind.config.js`. All design tokens are CSS custom properties at `:root`. Dark-only baseline; no `.dark` selector or `dark:` variants anywhere.

**Persistence:** File-based via Next.js Route Handlers (`app/api/characters/route.ts`). The `lib/persistence/` module reads/writes JSON files from `DATA_DIR`. No database dependency for v1.

**Demo:** `/character/demo` renders a mock Sorcerer (Blizzard/Ice Shards, level 100/paragon 200) through the full component stack without hitting the API.

## Foundational Docs

| Document | Purpose |
|----------|---------|
| `docs/vision.md` | Product vision, target users, non-goals |
| `docs/visual-spec.md` | Design system, color tokens, typography, layout |
| `docs/scoring-engine.md` | Build scoring algorithm spec (provisional) |
| `docs/data-sources/` | Catalog of D4 data sources available for integration |

## For Downstream Agents

The component tree is intentionally flat. Prop types are inline within each component file — no shared types module. The mock character in `lib/mock/demo-character.ts` is the authoritative shape reference for the `Character`, `Item`, and `Affix` types until a shared schema is introduced.

Route handlers in `app/api/` are stubbed with file-based persistence and return mock-compatible shapes. Real data integration is out of scope for v1.
