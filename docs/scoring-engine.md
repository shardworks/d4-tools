# Scoring Engine — Spec

> **Status: provisional.** This document captures the current best
> understanding of the scoring / optimization engine. Unlike the
> [vision](./vision.md) and [visual design](./visual-spec.md) specs —
> which are decisions about *intent* — this doc is an *engineering
> hypothesis*. It is expected to evolve as the engine is built and
> observed in use, and should be **versioned** when methodological
> decisions change.

---

## 1. What the engine is (and isn't)

The scoring engine is the analytical core of d4-tools. It turns a build
definition into:

- **Stat priorities** — which affixes / stats matter most for this build.
- **Item scores** — a numeric ranking of how good a specific item is for
  this build, expressed as a percentage delta vs. the equipped item.
- **Item delta breakdowns** — per-affix decomposition of *why* an item
  scored as it did.
- **Paragon paths** — recommended progression of nodes / glyphs across
  paragon boards.
- **Aspect priorities** — which legendary aspects matter most, with
  slot-allocation suggestions.

It is **not**:

- A UI layer. The engine is pure logic, runs on demand, returns data.
- A data source. The engine consumes the data layer (see
  [`docs/data-sources/`](./data-sources/)); it does not fetch.
- A persistence layer. Builds are stored elsewhere; the engine takes them
  as input and returns results.

---

## 2. Methodology

The engine is a **hybrid** of three approaches:

- **A — Damage-formula simulation.** The foundation. The engine encodes
  D4's damage formula (multiplicative buckets, breakpoints, conditional
  modifiers) and computes theoretical damage output for any build state.
  Stat priorities derive from the formula's gradient at the current point.
- **B — Stat weights.** A *derived view*. Once approach A produces a
  gradient, the engine exposes that gradient as a normalized weight table
  ("Crit Damage: 1.00, Vulnerable: 0.84, ..."). The user-facing stat
  priority output is approach B's surface; approach A is the engine
  underneath.
- **C — Constraint solver.** Layered on top. Playstyle constraints (§7)
  are applied as filters and penalties on top of the A/B optimization,
  not as core terms in the damage formula.

Combat simulation (approach D) is **deferred** as a future possibility.
v1 optimizes against theoretical stat throughput, not simulated combat
outcomes.

---

## 3. Build — formal input

What the engine sees as a "build":

- **Class** and **character level**.
- **Skills selected**, with skill ranks and tags.
- **Equipped items**, with rolled affix values, **plus** a parallel
  **target item** spec per slot (full hypothetical or partial constraint
  like *"must have aspect X"*). Builds carry both *current state* and
  *intent*.
- **Aspects equipped**, with rolled aspect values where applicable.
- **Paragon allocation** — current spending across boards, glyphs, nodes.
- **Playstyle constraints** (§7).

Character level and current paragon points are first-class inputs. Stat
priorities at level 60 differ from level 100 due to paragon access and
content-difficulty scaling.

---

## 4. Optimization objective

The engine maximizes **damage subject to survivability and utility
thresholds**. The user specifies minimum thresholds; the engine
maximizes DPS-equivalent throughput within them. If no thresholds are
set, the objective degenerates to pure damage maximization.

### Threshold dimensions

The four threshold candidates the engine supports:

- **Effective HP** — a combined survival metric (life + armor + DR
  sources + resistances).
- **Movement speed** — for content that demands mobility.
- **Resource sustain** — the build doesn't run dry on its primary
  resource (Spirit, Fury, Mana, etc.).
- **CC-break / unstoppable budget** — the build can reliably escape
  crowd control.

Thresholds are user-set; the engine does not infer them.

---

## 5. Damage model

The engine encodes D4's damage formula per the **Maxroll *In-Depth Damage
Guide*** (Position A) as the canonical baseline. Authoritative reference
is [`docs/data-sources/05-damage.md`](./data-sources/05-damage.md);
breakpoint and DR formulas in [`docs/data-sources/07-breakpoints.md`](./data-sources/07-breakpoints.md).
Bucket assignment is **data-driven** — encoded so that
community-disputed positions can be switched without touching the engine.

### Damage buckets

Damage decomposes into multiplicative buckets:

```
Final = Base
      × (1 + Σ Additive bucket)
      × (1 + Crit% if crit)
      × (1 + Vulnerable% if target Vulnerable)
      × Π (Distinct multiplicative buckets)
      × Π (Conditional multipliers, weighted by uptime — see below)
      × (Enemy defense / armor / resistance reduction)
```

- **Vulnerable** baseline ×1.20 in Season 9; current Season 13 value
  unverified. Engine reads from data layer.
- **Critical Strike Damage** baseline 50%, scales with `+% CSD` affixes
  in its own bucket.
- **Overpower** is **not** a bucket on the normal chain — it is a
  separate damage event with its own formula based on Life + Fortify.
  The engine models overpower as a parallel damage track.
- **Distinct multiplicative `[×]` buckets** include aspects/uniques that
  use `[×]` notation in tooltips. Each `[×]` source is its own
  multiplicative bucket.

### Known dispute fork

Whether `+% Core Skill Damage` and `+% [Skill Name] Damage` share a
bucket (Position A) or split across buckets (Position B) is
community-disputed and patch-sensitive. The engine treats bucket
assignment as **data**, not code, so the dispute is resolvable by
updating the data layer, not the engine.

### Conditional damage

Conditional affixes (e.g. *"+24% damage to vulnerable enemies"*,
*"+18% while injured"*) use **build-tagged uptime modeling**:

- Each build declares uptime values for relevant conditions
  (`vulnerable_uptime: 0.9`, `cc_uptime: 0.6`, etc.).
- Sensible defaults per build archetype reduce manual entry burden.
- The engine multiplies a conditional affix's contribution by its
  declared uptime.
- A conditional with 0% uptime contributes nothing; with 100% uptime,
  contributes fully.

This pushes uptime modeling into the build definition rather than
forcing per-affix uptime estimation.

### Breakpoints and diminishing returns

The engine **must** treat the following as non-linear:

- **Attack speed.** D4 runs at 60 fps. AS breakpoints are per class /
  per weapon type (frame counts in `docs/data-sources/07-breakpoints.md`).
  All additive AS combines into one multiplier *before* the breakpoint
  lookup. Crossing a breakpoint with 3% AS outperforms 20% that doesn't.
  Stat priority for AS must annotate distance to next breakpoint.
- **Cooldown reduction.** Hyperbolic DR:
  `Effective CDR = CDR_stat / (CDR_stat + 1.0)` (Position A; Season 13
  formula unverified).
- **Movement speed.** Soft-capped at +200% from non-base sources.
- **Armor.** Diminishing returns scaling with monster level:
  `DR = Armor / (Armor + 0.5 × Monster_Level × 85)`.
- **Resistances.** Cap at 70% base; increasable via cap-affix sources
  in endgame.
- **Critical Strike Chance.** Hard cap at 100%; no DR below the cap.

### First-pass-will-be-wrong

The engine inherits the verification debt in `docs/data-sources/`.
Open items there (Season 13 patch verification, new-class breakpoint
tables, dispute resolutions) flow through to the engine. First-pass
stat priorities are expected to be partially wrong; iteration is
mandatory.

---

## 6. Output shapes

What the engine returns, given a build input.

### Stat priorities

Ranked list of affixes with relative weights, normalized so the top
stat = 1.0:

```
Critical Strike Damage:       1.00
Vulnerable Damage:            0.84
Attack Speed (next BP +3.2%): 0.71  ← annotated when a breakpoint is near
Critical Strike Chance:       0.62
...
```

Attack speed (and any other stat with breakpoint behavior) is
annotated with distance to the next breakpoint.

### Item score

Expressed as a **percentage delta vs. the currently equipped item** in
the same slot. Equipped = baseline (0%).

- `+12.4%` better than equipped → keep.
- `−3.1%` worse than equipped → salvage candidate.

Percentages are intuitive for fast triage and support the *"decide in
under 5 seconds"* success criterion.

### Item delta breakdown

The item score decomposed at the **affix level**:

```
+12.4% overall
├─ +8.1% from +60% Vulnerable Damage (new affix)
├─ +4.9% from +24 Strength (vs +12 on equipped)
├─ −0.4% from missing Crit Damage (equipped had +18%)
└─ −0.2% from lost socket
```

This drives the comparison-view diff chips and the salvage / wear /
keep decision.

### Paragon path

A list of node allocations in recommended order, grouped by board.
First pass ships as a list; visual board-rendering is a future
possibility per the [vision doc](./vision.md#12-future-possibilities).

### Aspect priorities

Ranked list of aspects with relative weights and **slot-allocation
suggestions** (since aspects are mutually exclusive per slot):

```
1. Aspect of Adaptability  → 1H weapon (priority slot)
2. Aspect of Berserk Fury  → 2H weapon (alternative if 1H not built)
3. Aspect of Inner Calm    → chest
...
```

### Partial-build scoring

When a build has unallocated paragon points or empty aspect slots, the
engine scores items **against the build's optimization target**, not
its current state. Assumption: the user will eventually allocate
optimally. This makes "is this item worth keeping for my eventual
build?" the default question, which is more useful than "is this item
good for me right now?"

A *"score against current state only"* toggle is a future possibility,
not v1.

---

## 7. Constraint vocabulary

Playstyle constraints are formal inputs to the engine. Five categories:

- **Skill constraints** — must include / must exclude specific skills.
- **Damage-type constraints** — must / mostly / cannot use a specific
  damage type.
- **Mechanic constraints** — must leverage a specific mechanic
  (overpower, crowd control, lucky hit, fortify, etc.).
- **Content constraints** — optimization target (Pit pushing, Helltide
  farming, boss DPS, etc.).
- **Item constraints** — must use specific items / aspects, or must
  avoid certain item categories.

### Hard vs. soft

Both supported. **Hard is the default.**

- A **hard** constraint means the engine refuses to recommend
  violations. Example: with `damage-type: fire-only` set hard, the
  engine will not propose a cold aspect even if the math says it's a DPS
  upgrade.
- A **soft** constraint applies a score penalty but doesn't rule out
  alternatives. Useful for preferences rather than absolutes.

---

## 8. Comparison logic

When the user compares item A vs. item B (or candidate vs. equipped):

- **Score recomputation in full-build context.** Both items are scored
  as full-build alternatives — replace the slot's item, leave everything
  else identical, recompute the build score, report the delta.
- **Decomposition.** The score delta is broken down per affix
  (matches §6 *Item delta breakdown*).
- **No out-of-context scoring.** Items are always evaluated against a
  build. Scoring an item "in isolation" doesn't make sense in this model.
- **Aspect imprinting awareness.** When comparing items, the engine
  considers the best compatible aspect from the priority list for each
  candidate, not just the aspect currently on the item. A rare item
  with no aspect is not penalized for the missing aspect — the engine
  evaluates it assuming an aspect would be imprinted.

---

## 9. Provisionality and versioning

This document is expected to evolve. The expected revision pressure:

- The damage-model encoding will need iteration as Season 13
  verification items in `docs/data-sources/` are resolved.
- The constraint vocabulary will likely sprout categories we haven't
  named.
- The methodology choice (§2) may shift if the first attempt produces
  obviously-broken priorities.

When a methodological change happens, **document what changed and why**
in this file. Future agents need the history to understand why earlier
decisions were made and superseded.

---

## 10. Open questions

Carried forward as known unknowns. None block v1 design; all need
resolution at implementation time.

- **Paragon optimization is computationally hard.** Paragon boards have
  thousands of node combinations; brute force is infeasible. Strategy
  options: greedy heuristic, constrained search, or hand-curated
  templates with a fitting layer. Methodology choice deferred to
  implementation time.
- **Aspect optimization is a joint problem across slots.** Some aspects
  are mutually exclusive (one imprint per item). The engine must solve
  "which aspects on which slots" jointly, not per-slot.
- **Resource economy modeling.** Some builds are resource-constrained
  (Spirit, Fury, Mana, Lucky Hit procs). Theoretical DPS is meaningless
  if the build runs dry. Whether and how to model resource sustain as
  a first-class engine concern is open.
- **Skill rotation / combo evaluation.** Already deferred from the
  [vision doc](./vision.md#open-questions); carries forward here as an
  open question affecting the engine's scoring layer. Whether rotation
  is an *input* to scoring or an *output* the engine produces is not
  yet decided.
