# Data Sources — D4 Build Tools

```
Verified against: Lord of Hatred expansion / Season 13 (Season of Reckoning) / patch number unconfirmed — see Open Items / accessed 2026-05-07
```

This directory catalogs all data sources that future implementers will use to power the D4 build
tool's character import, stat catalogs, affix data, crafting systems, damage formulas, skill data,
breakpoints, and visual assets. Every entry is reconnaissance — sources are documented as found,
not designed. Schema design, fetcher architecture, and storage choices are deferred to implementation
commissions.

---

## 1. Per-Area Files

| File | Area | Description |
|------|------|-------------|
| [01-armory.md](01-armory.md) | Armory / Character Import | Battle.net career profile, Blizzard OAuth APIs, third-party planners with Battle.net import (D4Builds.gg). How to fetch a live character's equipped gear and stats. |
| [02-stats.md](02-stats.md) | Game Stats Catalog | Primary stat definitions, secondary stats, damage types, rarity tiers, item-slot enumeration. Canonical enums and sources for the full stat catalog. |
| [03-affixes.md](03-affixes.md) | Affix Data | Item affixes, implicit/explicit breakdowns, affix pools per slot, affix IDs from datamine repos. Where to get affix tables and their observed JSON shapes. |
| [04-crafting.md](04-crafting.md) | Crafting Systems | Tempering, enchanting, masterworking, horadric crafting. Sources for recipes, material costs, and system mechanics. |
| [05-damage.md](05-damage.md) | Damage / DPS Formula | Multiplicative damage buckets, additive vs multiplicative stacking, DPS calculation. Theorycraft and datamine sources; community-disputed positions flagged. |
| [06-skills.md](06-skills.md) | Skill Data | Skill definitions, ranks, upgrades, damage values, scaling tags. Sources from datamine repos and wikis. |
| [07-breakpoints.md](07-breakpoints.md) | Breakpoints / Diminishing Returns | Attack-speed breakpoints, cooldown-reduction DR, critical-strike-chance DR, movement-speed caps. Theorycraft authority sources. |
| [08-datamine-extracts.md](08-datamine-extracts.md) | Datamine Extracts | GitHub repos and Discord communities that extract game data directly from D4's CASC archives. Cross-referenced by all other docs. |
| [09-visual-assets.md](09-visual-assets.md) | Visual Assets | Sources for item icons, class portraits, skill icons, gear renders, rarity color sampling, damage-type glyphs, gear-slot icons. |

---

## 2. Framework Conventions

Every per-area doc follows the conventions below. This section is authoritative; deviations in
per-area docs are bugs.

### 2.1 Front-matter version stamp

Every doc opens with a fenced code block in this form:

```
Verified against: <expansion> / <season> / <patch number> / <date>
```

Example: `Verified against: Vessel of Hatred / Season 8 / 2.2.0 / accessed 2026-05-07`

The stamp is load-bearing: D4 data goes stale on patches, not on calendar time. The git commit
date is insufficient; the patch tag is the primary staleness signal.

### 2.2 Citation format

Every cited source carries all four fields:

```
- URL: <full URL>
- Accessed: YYYY-MM-DD
- Patch: <patch or season tag, e.g. "Season 8 / 2.2.0">
- Provenance: <tag — see §2.3>
```

Inline references may compress to: `([Source Name](<url>), accessed YYYY-MM-DD, patch Season X)`.

### 2.3 Provenance tags

The `provenance:` field classifies the authority of the source:

| Tag | Meaning |
|-----|---------|
| `official` | Blizzard-published; game client, patch notes, official game guide |
| `datamined` | Extracted directly from game files (CASC/MPQ archives) |
| `wiki` | Community wiki (wiki.gg, Fandom, etc.) — may lag patches |
| `theorycraft` | Community reverse-engineering, spreadsheets, guides (Maxroll, Wudijo, Mekuna, etc.) |
| `planner` | Third-party build-planner site (D4Builds.gg, d4planner.io, etc.) |
| `forum` | Reddit posts, Discord threads — lowest authority; time-critical to verify |

Multiple tags are allowed: e.g. `provenance: datamined, wiki` for a wiki page citing datamine data.

### 2.4 Verification tags

Every public-web source carries one of:

| Tag | Meaning |
|-----|---------|
| `verified working` | Smoke-tested and reachable as of the cited access date |
| `broken / stale` | URL unreachable or content clearly outdated |
| `requires credentials, reachability not verified` | Behind OAuth or account wall; existence is documented but live access not confirmed |
| `unverified — see Open Items` | Not yet smoke-tested; listed in the doc's Open Items section |

### 2.5 Terms-of-service callout

Every source section carries a one-paragraph ToS/legality callout. Format:

> **ToS:** [One paragraph. Cover: whether scraping is explicitly prohibited, whether an API ToS
> exists, whether the data is copyright Blizzard, and the practical risk posture for a personal
> non-commercial build tool.]

ToS varies meaningfully per source; per-source callouts are required because aggregating them loses
fidelity.

### 2.6 Schema-deferral posture

Per-area docs document **observed shapes** from each source only. Canonical TypeScript interfaces,
JSON schemas, and data-layer designs are deferred to implementation commissions. The distinction:

- ✅ Allowed: `Maxroll's affix JSON looks like { id, name, ranges: [...] }`
- ❌ Forbidden: `interface Affix { id: string; name: string; ranges: AffixRange[] }`

### 2.7 Disagreement handling

Where competing sources disagree on load-bearing facts (damage buckets, breakpoint thresholds,
affix pools), both positions are cited and the entry is flagged:

```
⚠️ community-disputed — see both positions above; do not pick a winner
```

Do not re-derive math or adjudicate between positions. The doc's job is to surface the disagreement,
not resolve it.

### 2.8 Inline data carve-out

Volatile data stays at-source. The only data inlined in docs is **small stable canonical enums** —
damage types, rarity tiers, item-slot enumeration — that are useful at-a-glance and change rarely
across patches. Full affix tables, stat catalogs, skill values, and breakpoint curves are not inlined.

### 2.9 Open Items convention

Every per-area doc ends with an `## Open Items` section. This section lists:

- Unverified leads (sources discovered but not smoke-tested)
- Known gaps in coverage (data areas not found in any source)
- Questions requiring further investigation

The convention mirrors `docs/visual-spec.md`. Format: terse bullets, declarative voice, one item
per gap. Do not silently omit a lead because it wasn't verified; put it in Open Items instead.

---

## 3. What This Documentation Is Not

- **Not a maintenance commitment.** These docs capture the landscape as of the access date. No
  mechanism exists to keep them updated across patches; that is a future commission.
- **Not schema design.** Canonical data shapes are deferred; see §2.6.
- **Not build-planner design.** Fetcher architecture, storage choices, and damage calculators are
  out of scope here.
- **Not a ToS opinion.** The per-source ToS callouts describe the landscape; they are not legal
  advice and do not constitute permission to scrape or redistribute data.

---

## Open Items

- **Patch number for the version stamp** — season name (Season of Reckoning) and season number
  (13) are confirmed from live planner sites and Blizzard marketing. The specific patch version
  string (e.g. `3.0.1c`) has not been verified; the patch notes URL
  `https://diablo4.blizzard.com/en-us/news/patch-notes` returned HTTP 404 at access date.
  Obtain the current patch string from the game client or community Discord.
- Whether Blizzard has published a `data.diablo4` namespace in the Game Data API — not confirmed.
- Whether any datamine repo is actively tracking the current Season 13 patch cycle — repo freshness
  to be verified per `08-datamine-extracts.md`.
- Additional theorycraft authorities beyond Wudijo / Mekuna / RobBic / Northwar — needs community
  survey.
