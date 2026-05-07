# Visual Design Spec — D4 Build Tools

This document is the source of truth for visual design and UX decisions on
this project. When implementation choices about look, behavior, or feel are
ambiguous, this document settles them.

---

## 0. Project Identity

- **Product.** Build analysis and planning tool for Diablo IV. Personal use,
  not public-facing.
- **Audience.** Single user (Sean). Elder Millennial, technical, gamer. Used
  to pre-decide gear selection so farming is more efficient.
- **Personality.** Impatient, precise, efficient.
- **Anti-references.** SaaS marketing pages, cute illustrations, emoji-led
  empty states, heavy Material Design.
- **Scope.** Single user, no auth, local run. Treat auth, onboarding,
  marketing chrome, multi-user concerns, and i18n as out of scope.

---

## 1. Technical Foundation

- **CSS strategy.** Tailwind CSS v4.
- **Component library.** shadcn/ui (Radix primitives + Tailwind, owned in
  the repo).
- **Design tokens.** CSS custom properties at `:root`, surfaced through the
  Tailwind theme config. The CSS-variable file is canonical; Tailwind reads
  from it.
- **Theming.** Dark-only single theme. No user toggle. No light mode.
- **Iconography.** Lucide for general UI. D4-domain glyphs (class icons,
  gear-slot icons, damage-type icons) sourced separately from game assets.

---

## 2. Color System

### App palette

- **Accent.** Warm amber, ~`oklch(70% 0.14 65)` — desaturated relative to
  legendary orange so accent and rarity don't collide.
- **Neutrals.** Warm (Tailwind `stone` family), 11 steps (50–950).
- **Dark surfaces.** Warm dim, not true black.
  - `--surface-0` ~`#14110f` (page background)
  - `--surface-1` ~`#1c1815` (panels)
  - `--surface-2` ~`#252019` (overlays / menus / modals)
- **Semantic colors.** Standard four (success / warning / danger / info)
  mapped to green / amber / red / blue, with collision-avoidance tuning:
  - Danger pulled cooler / pinker (`oklch(60% 0.20 25)`) so it doesn't read
    as legendary or mythic.
  - Warning pulled toward orange-amber so it doesn't read as rare-yellow.
- **Contrast target.** WCAG 2.2 AA across the board. AAA on body-copy
  contrast where reasonable.

### Game-canon rarity palette

Rarity colors are not brand choices — they are D4 game canon and should
match the in-game tooltip colors as closely as possible.

| Token | Rarity | In-game color |
|---|---|---|
| `--rarity-common` | Common | Off-white |
| `--rarity-magic` | Magic | Blue |
| `--rarity-rare` | Rare | Yellow |
| `--rarity-legendary` | Legendary | Saturated orange |
| `--rarity-unique` | Unique | Brown / dark amber-gold |
| `--rarity-mythic` | Mythic Unique | Red (warm side) |

Exact hex values for rarity tokens must be sampled from in-game screenshots
or game assets — do not invent them. The unique color is **brown / dark
amber-gold**, distinct from legendary's brighter orange.

### Ancestral treatment

Ancestral is a tier prefix, not a rarity. Render Ancestral items as a
**border / glow / sparkle layered over the underlying rarity color**, not as
a separate name color. Implement as a CSS treatment so it can be toggled
and themed.

---

## 3. Typography

- **Body / UI font.** Inter, with system-ui as fallback.
- **Monospace font.** JetBrains Mono.
- **Tabular numerics.** Apply `font-variant-numeric: tabular-nums` globally
  to numeric content (tables, stat lines, comparison columns), regardless
  of font family.
- **Base sizes.** 14px body, 12px UI labels and tabular content.
- **Type scale.** 11, 12, 13, 14, 16, 18, 22, 28. No oversized
  hero / marketing sizes.
  - H1: 22 · H2: 18 · H3: 16 · body: 14 · micro: 12 · micro-micro: 11
- **Line heights.** Body 1.5 · headings 1.2 · UI labels and tabular 1.3.
- **Weights.** 400 regular · 500 medium · 600 semibold. No light weights, no
  700.
- **Stat rendering rule.** Wherever a value-label pair is rendered (item
  rows, stat panels, comparisons), the **value** is in tabular monospace
  and the **label** is in regular sans.

Affix-rolled-number treatment (e.g. highlighting near-max rolls) is
deferred to component-level decisions when comparison UI is being designed.

---

## 4. Spacing & Layout

- **Base unit.** 4px, with 8px as the dominant rhythm.
- **Spacing scale.** 0, 1 (4px), 2 (8px), 3 (12px), 4 (16px), 6 (24px),
  8 (32px), 12 (48px). Larger sizes intentionally absent.
- **Container max widths.** No global max-width. Use the full viewport.
  Components self-constrain when they need to.
- **Breakpoints.** Tailwind defaults: sm 640, md 768, lg 1024, xl 1280,
  2xl 1536. Design target is desktop (lg+); see §11.
- **Grid.** Flexbox + CSS Grid as needed. No global 12-column grid.
- **Page padding.** 16px uniform.
- **Item-card padding.** Item cards and stat blocks follow a tighter rhythm
  than general UI:
  - `--item-card-row-gap` 6px (between affix lines)
  - `--item-card-padding` 8px (outer padding)

---

## 5. Shape & Elevation

- **Border radius scale.** 0, 2, 4, 6, 9999.
  - Item cards: 4px · Buttons / inputs: 4px · Panels / modals: 6px ·
    Pills / badges: 9999.
- **Elevation.** Two levels only:
  - **Surface** — no shadow, 1px border. Stack via slightly-lighter
    backgrounds (the `--surface-*` ladder), not shadows.
  - **Overlay** — subtle shadow + brighter background. For floating
    elements only (menus, modals, popovers).
- **Borders.** 1px, low-contrast warm-neutral (~`stone-800`). Borders
  define containers; shadows only define floating elements.

---

## 6. Iconography

- **General UI icons.** Lucide. Outline style, 1.5px stroke.
- **Sizes.** 14, 16, 20, 24.
  - 14 inline with 12px text · 16 default · 20 buttons · 24 nav.
  - No 32+ sizes (no illustrative empty states).
- **Color.** Inherit `currentColor` by default. Semantic icons take
  semantic color tokens (trash → danger, check → success).
- **D4 game-asset glyphs.** Class icons, gear-slot icons, damage-type
  icons, etc. Stored as SVG sprites. Render at the same 14 / 16 / 20 / 24
  sizes. Take `currentColor` where the asset is monochrome; preserve
  native color where the asset is intrinsically colored (e.g. element
  types).

---

## 7. Imagery

- **Imagery as design chrome.** None. No hero images, no illustration
  empty states, no decorative photography.
- **Game-asset imagery.** Item icons, class portraits, skill icons, gear
  renders sourced from game assets. Match container radius (4px on item
  cards). No border, no drop shadow.
- **Tier glow / sparkle.** CSS-driven (legendary glow, ancestral sparkle).
  Not baked into the asset, so they can be toggled and themed.

---

## 8. Motion

- **Philosophy.** Functional and quiet. Motion only to clarify state
  changes (open / close / appear / dismiss). No decorative animation.
- **Duration scale.** 75ms (instant) · 150ms (default). No 300ms tier.
- **Easing.** `ease-out` enter · `ease-in` exit · `ease-in-out`
  state-to-state. No custom springs.
- **Reduced motion.** Honor `prefers-reduced-motion` always; non-essential
  animation collapses to 0ms.
- **Stat-change motion.** On equipment swap, stat values update instantly.
  Rows that changed get a brief 150ms color flash (green for increase,
  red for decrease).
- **Comparison deltas.** Inline colored chips next to changed stats
  (e.g. `+2`, `−3`). No animation.

---

## 9. Components

### 9.1 Buttons

- Three variants: **primary** (filled accent), **secondary** (1px bordered
  neutral), **ghost** (no border, hover-only background).
- No "destructive" variant — destructive actions go through a confirmation
  modal.
- Default height 32px. Add sm (24px) and lg (40px) only when needed.
- Labels: sentence case, verb-led, ≤3 words, specific.

### 9.2 Inputs

- Bordered 1px, label above input, error border + message in red.
- Same height as buttons (32px).
- Numeric inputs: tabular-nums, right-aligned values.

### 9.3 Selects / dropdowns

- Custom (Radix). 32px height. Search-filterable above 8 items.

### 9.4 Toggles, checkboxes, radios

- Custom-styled (Radix).
- **Switches** for immediate-effect toggles (including filter panels).
- **Checkboxes** for apply-on-submit selections.
- Don't mix metaphors.

### 9.5 Cards

- **General card.** 1px border, no shadow, 12–16px padding, 6px radius.
- **Item card.** Inherits `--item-card-padding` rhythm (8px outer / 6px
  row gap) and 4px radius. Border tint picks up the rarity color subtly
  — e.g. legendary cards get a 1px legendary-orange border at reduced
  opacity.

### 9.6 Modals / dialogs

- Centered. Semi-transparent backdrop `rgb(0 0 0 / 0.6)`.
- Dismiss on outside-click + Escape. Focus-trapped.
- Max widths: 480px confirmations · 640px forms.
- **Item inspect overlay** is an exception: render as a **side sheet from
  the right (~520px wide)**, preserving the underlying list visibility.

### 9.7 Tooltips

- General UI tooltips: 300ms hover delay, instant dismiss, position-aware.
- **Item tooltips override to 150ms delay** — the tooltip *is* the point of
  hovering.

### 9.8 Toasts / notifications

- Bottom-right. Stack newest-on-top.
- Auto-dismiss 5s for info / success. Sticky for errors.
- Four variants mapped to semantic colors (success / info / warning /
  error).

### 9.9 Tables / data grids

Critical component for this product (item lists, affix breakdowns,
comparisons, build summaries).

- **Density:** compact, 28px row height.
- **Borders:** horizontal-only 1px. No vertical lines.
- **Sticky header** on scroll.
- **Row hover:** background tints one neutral step lighter.
- **Numerics:** tabular-nums, right-aligned. Text columns left-aligned.
  No center-aligned columns.
- **Sort indicators:** small caret on the active sort column header.
- **Item rows:** rarity color applies to the **item-name text** (matching
  in-game convention). No row tinting, no leftmost color stripe.

### 9.10 Forms

- Single column. 16px between fields. Submit bottom-right with cancel to
  its left.

### 9.11 Navigation

- **Sidebar** (collapsible to icons-only) for primary navigation.
- **Header bar** thin (40px), shows current character / build context.
- **No header search** — use the cmd-K command palette instead.
- **Command palette (cmd-K)** is a primary navigation mechanism. Treat it
  as core, not an enhancement.

Top-level sections TBD; will likely include characters, builds, items,
comparisons, settings.

### 9.12 Loading states

- Skeletons for known-shape content (item lists, stat panels).
- Spinners for buttons and short waits.
- Progress bars for long, known-duration operations.

Likely rare in this product since most data is local.

### 9.13 Empty states

- Short heading + one-line explanation + primary action (when applicable).
- No icon, no illustration.

### 9.14 Error states

- **Inline** for field-level validation.
- **Full-page** only for catastrophic page-load failure.
- **Toast** for action failures.
- Always include a recovery action.
- Tech-savvy audience: surfacing real error messages (e.g. file-system
  errors) is preferable to hiding them behind generic "Something went
  wrong" copy.

---

## 10. Interaction States

Every interactive element must define behavior for:

- **Default**
- **Hover** — subtle background tint (one neutral step) or accent
  darkening. No size or position changes.
- **Focus-visible** — 2px outline in accent color, 2px offset. Never
  `outline: none`. Visible on every interactive element.
- **Active** (pressed)
- **Disabled** — 0.5 opacity, `cursor: not-allowed`. Tooltip on hover when
  the reason isn't obvious.
- **Loading** — inline spinner replacing button label. Button width
  preserved. Pointer-events disabled.
- **Selected** (table rows / list items) — 2px accent-color left-edge
  border, background tints one step lighter.

---

## 11. Responsive Behavior

- **Viewport target.** Desktop (lg+, 1024px and above).
- **Mobile and tablet.** Best-effort responsive. May degrade.
- **Sub-1024 gate.** Soft gate: show a "this tool is desktop-only"
  message but still render the app behind it. The user can dismiss the
  message and continue.
- **Touch targets, mobile nav.** N/A.

---

## 12. Accessibility

- **Conformance.** WCAG 2.2 AA. AAA on body-copy contrast where reasonable.
- **Keyboard navigation.** Tab order logical. Esc closes modals and menus.
  Modal focus trap. Beyond the baseline: cmd-K palette, single-key
  shortcuts (e.g. `g b` for builds, `g i` for items), `?` opens a
  shortcut cheatsheet.
- **Screen reader.** Semantic HTML first. ARIA only when HTML alone can't
  express the relationship. Live regions (`aria-live`) for toasts and
  validation messages.

---

## 13. Information Density

- **Default density.** Compact. Established through 28px table rows, 14px
  body type, tighter spacing scale, and item-card padding tokens.
- **User-controlled density toggle.** None.

---

## 14. Content Patterns & Microcopy

- **Tone.** Terse and direct. No "friendly" charm. No exclamation points,
  no "Oops!". Imperative voice for actions, declarative for status.
  Example: *"No items match these filters."* — not *"We couldn't find any
  items, sorry!"*
- **Button labels.** Verb-led, sentence case, ≤3 words, specific.
- **Empty-state copy.** One-sentence situation + next action. No
  decoration.
- **Error copy.** State what went wrong and what to do next. Never blame
  the user. Real error messages (e.g. `ENOENT`, stack-frame lines) may
  be surfaced — the audience is tech-savvy.
- **Number formatting.** Locale-aware via `Intl.*`. 1–2 decimals by
  default; more where precision matters (e.g. DPS to 3). Percentages to
  1 decimal.
- **Date and time.** Relative for recent (≤7d), absolute thereafter.
  24-hour time.

---

## 15. Page Templates

The list below is **non-exhaustive**. New archetypes will be added as use
cases surface (e.g. build creation wizard, loot-log view, skill-tree
visualizer, paragon planner).

- **List-detail (master-detail).** Side-by-side on desktop: list 30%,
  detail 70%. Used for characters, builds, items.
- **Comparison view.** Two or three columns side-by-side. Each column
  renders an item card and stat block. Diff chips between columns
  highlight changes. First-class, named archetype.
- **Build-summary view.** Single page, mostly tabular: equipped items
  rendered in a gear-slot grid (not a list), aggregated stat block,
  derived calculations (DPS, EHP, etc.). Header shows character + build
  name + total power score.
- **Filter panel.** Side rail (left or right), persistent on list views.
  Switches and range sliders. Collapsible per group.
- **Settings page.** Single tall scrollable page with anchor links.
- **404 / error page.** Centered message + "Go home" button. Plain.

Out of scope: auth pages, marketing pages, dashboard-of-charts.

---

## Open Items

- Reference products (look-and-feel anchors) — none chosen yet.
- Exact hex values for rarity color tokens — must be sampled from
  in-game screenshots or game assets.
- Affix-rolled-number visual treatment — deferred until comparison UI
  is being designed.
- Top-level navigation sections — to be settled as features land.
