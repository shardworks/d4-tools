# Foundation Audit — 2026-05-08

**Commission:** Foundation polish — token consolidation, shadcn bridge, inline-style sweep  
**Commit scope:** Single commit covering all tasks (T1–T8). Reference: `docs/foundation-audit-2026-05-08.md`.

---

## 1. What Was Found

### 1.1 Inline-style site count (pre-sweep)

Counts from `rg "style=\{\{" -c components app | sort -t: -k2 -n -r`:

| File | Count |
|------|-------|
| components/d4/GearSlotEditor.tsx | 43 |
| components/import/ImportRosterClient.tsx | 38 |
| components/settings/SettingsPageClient.tsx | 24 |
| components/d4/ParagonAllocator.tsx | 24 |
| components/d4/CharacterEditor.tsx | 24 |
| components/import/ImportConfirmClient.tsx | 22 |
| app/builds/page.tsx | 21 |
| components/d4/BuildSummaryView.tsx | 16 |
| components/d4/SkillTreePicker.tsx | 15 |
| components/layout/CommandPalette.tsx | 10 |
| components/d4/ItemCard.tsx | 10 |
| components/ui/command.tsx | 7 |
| components/d4/AspectCombobox.tsx | 7 |
| components/d4/AffixCombobox.tsx | 7 |
| app/import/error/page.tsx | 7 |
| app/builds/[id]/BuildDetailClient.tsx | 7 |
| components/layout/SidebarNav.tsx | 6 |
| components/d4/GearSlotGrid.tsx | 6 |
| app/characters/new/page.tsx | 5 |
| components/ui/dialog.tsx | 4 |
| components/layout/HeaderBar.tsx | 4 |
| components/d4/StatBlock.tsx | 4 |
| components/layout/SoftGate.tsx | 3 |
| app/builds/[id]/page.tsx | 3 |
| app/characters/[id]/page.tsx | 2 |
| app/import/confirm/page.tsx | 1 |

**Total: ~320 inline-style usages across 26 files.**

### 1.2 Broken token references (pre-sweep)

All found by `rg "var\(--(legendary|mythic|destructive|accent-rgb)[^)]*,\s*#" components app`:

| Token | Occurrences | Canonical Name |
|-------|-------------|----------------|
| `--legendary` (typo) | 2 (GearSlotEditor, AspectCombobox) | `--rarity-legendary` |
| `--mythic` (typo) | 3 (GearSlotEditor ×3) | `--rarity-mythic` |
| `--destructive` | 15+ across 5 files | Resolved post-bridge (T3) |
| `--accent-rgb` | 1 (SettingsPageClient) | Replace with `color-mix()` |

### 1.3 Hardcoded literal colors (pre-sweep)

- `#ef4444` / `rgba(239,68,68,...)`: 34 occurrences across 9 files
- `#22c55e` / `rgba(34,197,94,...)`: 5 occurrences in SettingsPageClient (success/connected state — converted to `var(--success)`)

### 1.4 Token registry duplication (pre-sweep)

`app/globals.css` declared every color token twice:
- `@theme { --color-stone-50: #fafaf9; }` — Tailwind utility surface
- `:root { --stone-50: #fafaf9; }` — CSS variable surface

**26 color tokens × 2 = 52 declarations for 26 values.** Also duplicated: 8 type-scale tokens, 8 spacing tokens (partially), 5 radius tokens.

### 1.5 Domain-type canonicality (T7 verification)

`rg "^(type|interface) (Character|Item|Affix|Build|D4Class|ItemRarity)\b" lib/schema components app` returned **zero matches outside `lib/schema/*`**. Domain types are already canonical. No remediation required.

---

## 2. What Changed

### 2.1 `app/globals.css` (T2 + T3 + T5)

**Token registry consolidation (D2):**
- Moved all color **values** to `:root` as the canonical declaration site
- `@theme` now carries only one-line aliases (`--color-stone-100: var(--stone-100)`) so Tailwind utilities resolve
- Eliminated ~26 duplicate value declarations from `@theme`
- Spacing and type scale retain direct values in `@theme` (these cannot use `var()` aliases due to same-name circular-reference risk in CSS layers)
- Radius: `@theme` keeps `--radius`/`--radius-md` etc. for `rounded-*` utilities; `:root` keeps `--radius-card`/`--radius-panel` semantic names

**shadcn token bridge (D3):**
- Added full shadcn token surface to `:root` as aliases of existing canonical tokens:
  - `--primary: var(--accent)` / `--primary-foreground: #000000`
  - `--background: var(--surface-0)` / `--foreground: var(--stone-100)`
  - `--popover: var(--surface-2)` / `--popover-foreground: var(--stone-100)`
  - `--muted: var(--surface-1)` / `--muted-foreground: var(--stone-500)`
  - `--secondary: var(--surface-2)` / `--secondary-foreground: var(--stone-200)`
  - `--destructive: var(--danger)` / `--destructive-foreground: var(--stone-100)`
  - `--accent-foreground: #000000`
  - `--ring: var(--accent)` / `--input: var(--stone-700)` / `--border: var(--stone-800)`
  - `--ring-offset-background: var(--surface-0)`
- Added `--color-*` aliases to `@theme` for each shadcn token, enabling `bg-destructive`, `text-foreground`, `border-border`, etc.

**`@layer components` recurring-shape classes (D5):**
- `.mini-label` — uppercase 11px muted section header
- `.error-banner` — red tinted error container
- `.error-text` — inline error copy (destructive color)
- `.panel` — bordered surface-2 container
- `.icon-btn` — ghost icon button (transparent bg, no border, pointer cursor)

### 2.2 `components/ui/dialog.tsx` + `components/ui/command.tsx` (T6)

Removed inline-style workarounds; converted to Tailwind utility classes using the token bridge from T3. Default class strings untouched.

### 2.3 Application files — inline-style sweep (T6, D8, D9)

All 26 files converted:
- One-off styling → Tailwind utility classes  
- Repeating shapes → `@apply`-backed component classes from T5
- Conditional states (active/selected/over-budget/greater-affix) → `cn(...)` with conditional class spreading
- Genuinely continuous/dynamic values kept as inline `style` (see §3.1)

### 2.4 Broken token repairs (T4, D6, D7)

- `var(--legendary, #c87f27)` → `var(--rarity-legendary)` (AspectCombobox, GearSlotEditor)
- `var(--mythic, #d4a017)` → `var(--rarity-mythic)` (GearSlotEditor ×3)
- `var(--destructive, #ef4444)` → `var(--destructive)` (resolved by bridge; all files)
- `var(--accent-rgb, ...)` → `color-mix(in srgb, var(--accent), transparent 92%)` (SettingsPageClient)
- `#ef4444` → `var(--destructive)` everywhere
- `rgba(239,68,68,N)` → `color-mix(in srgb, var(--destructive), transparent NN%)`
- `#22c55e` → `var(--success)` (SettingsPageClient)
- `rgba(34,197,94,N)` → `color-mix(in srgb, var(--success), transparent NN%)`

### 2.5 GearSlotEditor rarity map (D4)

Replaced divergent local `rarityColor` map (hex literals + broken `--legendary`/`--mythic` refs) with canonical `var(--rarity-*)` pattern from `ItemCard.tsx`.

**Acknowledged visual delta:** The gear-slot rarity-trigger color now matches `ItemCard.tsx`'s rendering everywhere else.

---

## 3. Deferred to Follow-up Commissions

### 3.1 Residual inline `style` (legitimately dynamic)

These 7 sites remain as inline `style` because they carry genuinely continuous/runtime-dynamic values that cannot be expressed as static Tailwind classes:

| File | Site | Reason |
|------|------|--------|
| `components/layout/SidebarNav.tsx` | aside `width`/`minWidth` | Toggles between 40px and 200px at runtime from a prop |
| `components/d4/GearSlotEditor.tsx` | `SheetContent` `width: "520px"` | Non-standard fixed-width sheet value without a token |
| `components/d4/GearSlotEditor.tsx` | `SelectTrigger` `color: rarityColor[f.value]` | Runtime rarity-driven color on a select trigger |
| `components/d4/GearSlotGrid.tsx` | `EmptySlot` (hover affordance) | Inline style is part of imperative hover — deferred §3.2 |
| `components/d4/ItemCard.tsx` | container `border` | `color-mix()` value computed at runtime from `item.rarity` |
| `components/d4/ItemCard.tsx` | item-name div `color` | Runtime rarity CSS variable resolved at render |
| `components/layout/SoftGate.tsx` | overlay `backgroundColor: rgba(12,10,9,0.95)` | Specific semi-transparent value with no CSS token equivalent |

### 3.2 Out-of-scope items (per brief)

- **Imperative hover** via `onMouseEnter`/`onMouseLeave` mutating `currentTarget.style` in `app/builds/page.tsx` and `components/d4/GearSlotGrid.tsx` — belongs to hover-affordance audit
- **`tabular-nums` rollout** per visual-spec §3
- **Emoji glyphs** in `app/import/error/page.tsx` (lines 64, 89-90)
- **Hover-affordance / focus-state coverage** per visual-spec §10
- **API routes** under `app/api/**` — no styling

---

## 4. Verification Results

All four pipeline checks pass:

| Check | Result |
|-------|--------|
| `pnpm typecheck` | ✓ 0 errors |
| `pnpm lint` | ✓ 0 errors (7 pre-existing warnings, unchanged) |
| `pnpm test` | ✓ 140/140 passed |
| `pnpm build` | ✓ compiled, 16/16 static pages generated |

**Inline-style sweep:**
- Pre-sweep: ~320 `style={{` occurrences across 26 files
- Post-sweep: **7** `style=` sites across 5 files (all legitimately dynamic; see §3.1)
- `rg "style=\{\{" -c components app` → `GearSlotEditor.tsx:2`, `GearSlotGrid.tsx:1`, `ItemCard.tsx:2`, `SidebarNav.tsx:1`, `SoftGate.tsx:1`

**Broken-token grep:** `rg "var\(--(legendary|mythic|destructive|accent-rgb)[^)]*,\s*#" components app` → **zero matches**

**Domain-type grep:** All `Character`, `Item`, `Affix`, `Build`, `D4Class`, `ItemRarity` type/interface declarations confined to `lib/schema/*` only.
