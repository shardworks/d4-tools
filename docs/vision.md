# Vision — D4 Build Tools

This document tells agents *what* this product is and *why* it exists, at a
level of detail that survives changes in implementation. The
[visual design spec](./visual-spec.md) governs how things look; this
document governs what the product is for.

---

## 1. Elevator pitch

A web tool for **off-meta Diablo IV build optimization**. Existing planners
(Maxroll, D4Builds, Mobalytics) assume the player is consuming someone
else's optimization target — copy this S-tier guide, mirror this paragon
board, target these affixes. This tool inverts that assumption. The user
defines the optimization target — class, skills, playstyle constraints —
and the tool derives the supporting decisions: which stats are worth
chasing, what paragon path serves the build, which aspects matter, how
found items rank against the goal.

It is built for a single user playing creative, off-meta builds who needs
fast loot triage and rich theorycrafting without bending their playstyle to
fit a published guide.

## 2. Audience

Single user (Sean). Elder Millennial, technically literate, experienced D4
player. Knows the game's vocabulary and mechanics; does not need
onboarding, hand-holding, or simplified explanations.

## 3. The problem

Published guides cover a narrow band of "top-tier" builds. When the user
wants to play creatively — using skills they prefer, leveraging mechanics
that aren't currently meta, imposing constraints of their own — guide
assumptions break and the supporting infrastructure (stat priorities,
paragon plans, aspect rankings) doesn't transfer.

The user currently triages dropped items by manual evaluation against a
mental model of their build, which is slow and error-prone. They want:

- Fast salvage / wear / keep decisions on found items.
- A framework for theorycrafting variations of their own builds.
- A way to translate "the build I want to play" into "the gear, paragon,
  and aspects I should chase."

## 4. Core use cases

1. **Author a build.** Pick a class, skills, and playstyle constraints.
   The tool derives the optimization targets that follow — stat
   priorities, paragon path, aspect priorities, gear targets.
2. **Triage a dropped item.** Look up or enter an item, see how it scores
   against the active build, decide salvage / wear / keep in seconds.
3. **Compare items.** Compare a candidate item against the one currently
   equipped in that slot, with build-impact deltas (not just raw stat
   differences).
4. **Theorycraft variations.** Clone a build, change one or two parameters
   (different aspect, swap a skill, adjust a constraint), see how the
   optimization target shifts.
5. **Plan acquisition.** For an active build, see the gap between current
   gear and optimal target so the user knows what to farm next.
6. **Paragon optimization.** The tool derives an optimal paragon path
   from the build's other inputs. Paragon is computed, not manually
   authored.
7. **Skill / combo evaluation.** In scope, but the precise shape — whether
   rotation is an input to scoring or an output the tool produces — is
   deferred until the scoring engine is being designed.

## 5. Key domain concepts

A short glossary so agents don't need to assume D4 fluency. Each
definition is one line; expand only when implementing a feature that
demands it.

- **Character** — a specific D4 character (class + level), the owner of
  builds.
- **Build** — a named optimization target: chosen skills, aspects, paragon
  direction, playstyle constraints, derived stat priorities.
- **Item** — a piece of gear with a slot, rarity, and a set of affixes.
- **Slot** — gear position (helm, chest, weapon, ring, etc.).
- **Affix** — a stat on an item (e.g. `+18% Critical Strike Damage`).
  Rolled within a min-max range.
- **Aspect** — a special modifier extracted from legendaries; can be
  imprinted onto rare items or used to upgrade gear.
- **Tempering / Masterworking** — D4's gear-modification systems; relevant
  to evaluating an item's full potential.
- **Paragon** — endgame progression: boards, glyphs, nodes.
- **Glyph** — a paragon-board socket modifier with its own leveling.
- **Rarity** — common / magic / rare / legendary / unique / mythic unique.
- **Tier** — D4's item-power tiering (e.g. ancestral).
- **Skill** — an ability the character casts.
- **Damage type** — physical / fire / cold / lightning / poison / shadow.
- **Playstyle constraint** — a user-imposed rule (e.g. "must use these two
  specific skills," "fire damage only," "no Pit-only items").

## 6. Scope

### In scope

- Single-character build optimization for any D4 class.
- Custom build authoring: skill + constraint inputs → derived stat,
  paragon, and aspect targets.
- Item triage against an active build (salvage / wear / keep).
- Item-vs-item comparison with build-impact deltas.
- Build cloning and variation for theorycrafting.
- Acquisition planning (gap between current gear and target).

### Out of scope

- Drop-rate simulation, RNG modeling, "how long to farm this item"
  probability tooling.
- Damage-per-second simulation against specific bosses. The tool
  optimizes stats; it doesn't simulate combat.
- Real-time / in-game integration (overlays, gear-on-the-fly
  recommendations during play).
- Group composition or multiplayer-coordination optimization.
- Leaderboards, ladders, comparison-to-other-players features.

## 7. Non-goals

These are temptations — things that *look* like they fit but aren't what
this product is.

- **Becoming a general-purpose D4 wiki or item database.** The tool
  consumes game data; it does not try to be the canonical source for it.
- **Becoming a build-sharing platform.** Builds are personal records, not
  published artifacts.
- **Catering to new-player onboarding.** The audience knows the game.
- **Competing with Maxroll for the meta-build user.** Maxroll serves a
  different problem well; this tool serves a different problem.
- **Mobile or phone-first experience.** Desktop tool.
- **Optimizing against published guides.** The tool optimizes against the
  user's own constraints. Importing a guide build to follow it is not a
  goal.

## 8. Data sources

D4 entity data (items, affixes, aspects, paragon nodes, skills, classes)
is sourced from **community datamine repositories and selected community
datasets** — not from Blizzard APIs (the documented D4 Game Data API
endpoints were probed and confirmed non-existent), not from local game
files, screenshot OCR, or runtime game integration.

The full data-sourcing strategy — which datasets, what each covers, how
they're refreshed, and what was investigated but found non-existent —
lives in [`docs/data-sources/`](./data-sources/). That directory is the
canonical reference; agents needing data should consult it rather than
reinventing the picture.

User-specific data (the actual rolls on items the user has found, build
definitions, character records) is entered manually for v1. Live game
integration is a future possibility but not in v1 scope.

## 9. Success criteria

The tool is working when:

- The user can decide whether to keep a dropped item — salvage, wear, or
  keep — in **under 5 seconds**.
- The user can compare two items' real impact on their build (not just
  raw stat differences) **at a glance**.
- The user can plan a build's complete gear targets — stats, aspects,
  paragon — **without referencing maxroll.gg**.

These are the criteria agents should evaluate proposals against. A
feature that doesn't move toward at least one of them is a candidate
for cutting.

## 10. Technical constraints & assumptions

Carries forward from the [visual design spec](./visual-spec.md):

- Web application, desktop-target (1024px+), modern browser.
- Runs locally, single user, no authentication, no server-side state
  required for normal operation.
- Dark-only theme.

Two architectural calls implicit in this product's goals:

- **Persistence is file-based.** Builds, characters, and item logs are
  stored as files on disk, not in browser-local storage. The user does
  not trust browser persistence; portability and Git-friendly storage
  are valued.
- **The scoring / optimization engine is a distinct subsystem.** The
  layer that turns a build definition into stat priorities, paragon
  recommendations, aspect rankings, and item scores is the analytical
  core of the product. It will be specified separately and is not
  treated as incidental implementation detail.

## 11. Adjacent tools & differentiation

| Tool | What they do | What we do differently |
|---|---|---|
| **Maxroll planner** | Author and share top-tier guide builds | We optimize off-meta builds where guide assumptions break |
| **D4Builds.gg** | Same as Maxroll, more community-driven | Same: we serve solo theorycrafters, not guide consumers |
| **Mobalytics / D4 companion sites** | Stat reference, item DB, leaderboards | We compute *what's good for your build*, not *what's good in general* |
| **In-game paragon planner** | Visual paragon board layout | We derive paragon as a function of the build, not as a manual layout exercise |

## 12. Future possibilities

Deliberately deferred. Worth knowing exist so architecture choices don't
foreclose them.

- **Live game integration.** Screenshot OCR for item entry, or — if a
  path becomes viable — reading game files directly.
- **Multi-character optimization.** Aspect / item sharing across alts;
  account-wide optimization.
- **Seasonal-mechanic modeling.** Each season's unique mechanic
  (vampiric powers, witchcraft, etc.) factored into build evaluation.
- **Drop-source planning.** "This affix is most likely to drop from
  boss X" — for guided farming.
- **Build journaling.** Snapshot a build as it evolves through a
  season.
- **Visual paragon-board rendering.** Render the recommended paragon
  path as a visual board layout, not just a list.
- Import paths beyond manual entry — build-URL parsing, screenshot OCR /
  vision-LLM, TTS-accessibility intercept, or a future official Blizzard
  API — are tracked in `docs/future-import-paths.md`.

## Open questions

- **Skill rotation / combo evaluation shape.** In scope (§4 #7), but
  whether rotation is an *input* to scoring or an *output* derived by
  the tool is deferred until the scoring engine is being designed.
- **Playstyle-constraint vocabulary.** §5 names "playstyle constraint"
  as a single concept; in practice it likely decomposes into several
  categories (must-use skills, damage-type preferences, content-target
  preferences, mechanic preferences). Categories will be settled when
  the build-authoring surface is being designed.
