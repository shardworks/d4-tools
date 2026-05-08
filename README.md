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
| `BLIZZARD_CLIENT_ID` | — | For Battle.net import | OAuth2 client ID from `develop.battle.net`. |
| `BLIZZARD_CLIENT_SECRET` | — | For Battle.net import | OAuth2 client secret from `develop.battle.net`. |

In production, `DATA_DIR` must be set or the app will throw at startup.

#### Setting up Battle.net Import

1. Register an application at [develop.battle.net/access/clients](https://develop.battle.net/access/clients).
2. Add a redirect URI: `http://localhost:3000/api/auth/battlenet/callback` (for local dev).
3. Set `BLIZZARD_CLIENT_ID` and `BLIZZARD_CLIENT_SECRET` in your `.env.local`.
4. Visit `/settings` to pick your region and connect your Battle.net account.
5. Navigate to `/import` to browse your hero roster and import a character.

**Never commit `BLIZZARD_CLIENT_ID` or `BLIZZARD_CLIENT_SECRET` to the repository.**

## Architecture

**Stack:** Next.js 16 App Router · React 19 · Tailwind CSS v4 · shadcn/ui (stone, vendored) · Lucide React

**Styling:** Tailwind v4 `@theme` directive in `app/globals.css` — no `tailwind.config.js`. All design tokens are CSS custom properties at `:root`. Dark-only baseline; no `.dark` selector or `dark:` variants anywhere.

**Persistence:** File-based via Next.js Route Handlers (`app/api/characters/route.ts`). The `lib/persistence/` module reads/writes JSON files from `DATA_DIR`. No database dependency for v1. Includes `lib/persistence/settings.ts` for app settings (region) and `lib/blizzard/tokens.ts` for OAuth tokens (mode 0600).

**Battle.net Import:** `lib/blizzard/` houses the full import path: OAuth helpers (`oauth.ts`), token persistence (`tokens.ts`), typed API client (`client.ts`), catalog resolver primitive (`resolvers.ts`), and API-payload→canonical conversion (`import.ts`). Routes: `/api/auth/battlenet/{start,callback,disconnect}`, `/api/blizzard/{roster,import/[heroId]}`. UI: `/import` (roster picker), `/import/confirm` (preview + save), `/settings` (region + connection status).

**Entry point:** Visit `/` (redirects to `/builds`) to see the build list. Create a character from `/characters/new` or import one via Battle.net at `/import`.

## Foundational Docs

| Document | Purpose |
|----------|---------|
| `docs/vision.md` | Product vision, target users, non-goals |
| `docs/visual-spec.md` | Design system, color tokens, typography, layout |
| `docs/scoring-engine.md` | Build scoring algorithm spec (provisional) |
| `docs/data-sources/` | Catalog of D4 data sources available for integration |

## For Downstream Agents

Schemas in `lib/schema/` (Zod + inferred types) are the canonical shape for all domain types — `Character`, `Item`, `Affix`, `Build`, `D4Class`, `ItemRarity`. Persistence and route handlers in `lib/persistence/` and `app/api/` read/write through these schemas. Component prop types compose from `lib/schema` rather than inlining.
