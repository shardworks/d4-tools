# Future Import Paths

> **Status: research summary, post v3 decommission.** This document captures
> the import-path landscape after the discovery that Blizzard has not shipped
> a public D4 profile API. v3 (Battle.net OAuth) was decommissioned as a
> result. This doc tracks the realistic alternatives so future commissions
> can pick them up with research already in hand.

---

## Why v3 was decommissioned

The v3 commission shipped an end-to-end Battle.net OAuth flow against
endpoint paths (`/profile/d4/v1/profile`, etc.) that the implementer
documented as "verified" but never actually probed. When Sean attempted
his first import after registering an OAuth client and completing the
auth code flow, the API call returned a 500.

Subsequent probing confirmed:

- Blizzard's API distinguishes path-existence (401 on valid path with bad
  auth) from path-nonexistence (404 for unknown path).
- The known-good `/profile/user/wow` returns 401 with a fake bearer token
  (path exists; auth required).
- Every D4 path probed (13 variations covering `/profile/d4/v1`,
  `/profile/d4`, `/d4/profile`, `/profile/user/d4`, with and without
  locale/namespace) returns 404 — meaning **no D4 profile API endpoint
  exists at `us.api.blizzard.com`**.
- The OAuth flow itself works (token exchange and `d4.profile` scope are
  real), but the consumer endpoints the token would access do not exist.
- D4 also has no public web profile page — `battle.net/d4/profile`
  redirects to a 404. Unlike WoW's armory, D4 has nothing public.

The data-sources doc `01-armory.md` §1.2 had honest-uncertainty language
("requires credentials, reachability not verified") that the v3
implementer did not close. The v3 commission shipped a non-functional
feature against unverified endpoints.

## The actual paths the community has built

Three real, working approaches exist for getting D4 character data into
external tools — none of them through an HTTP API.

### Path A — Build-URL imports

Community build-planner sites (D4Builds.gg, Maxroll.gg, Mobalytics.gg)
expose user-created builds via shareable URLs. The HTML at those URLs
contains the full build state (class, paragon, skills, equipped items,
affixes). Tools parse the HTML to extract structured data.

**Reference implementation:** [Diablo4Companion](https://github.com/josdemmers/Diablo4Companion)
(289 stars) imports builds from D2Core, D4Builds, Maxroll, and Mobalytics
this way. Most adopted D4 community tool overall.

**What it imports:** A *build* — i.e., a planned or shared configuration.

**What it does not import:** *Your actual current character* unless you
have manually mirrored it onto one of those sites first. Build-share
URLs are authored, not auto-synced.

**ToS posture:** Each site's ToS prohibits automated extraction. Single
user-pasted URL parsed for personal use is a much grayer area than bulk
scraping. Community tools have operated in this gray area without
incident, but it is not unambiguously sanctioned.

**Implementation cost:** Modest. One HTML fetch + a parser per source
site, plus mapping to the canonical schema. Per-site parsers must be
maintained as the source HTML evolves.

### Path B — Screenshot OCR  ✅ Shipped (v11 + v12)

> **Status:** The vision-LLM variant (Path B') is the working manifestation,
> shipped in v11 (LLM extractor + triage gallery + parse-on-demand) and v12
> (upload-driven pipeline: Windows watcher → `POST /api/triage/upload` →
> synchronous LLM → cache). The dedicated-OCR variant (PaddleOCR / Tesseract)
> was not pursued. See [`docs/triage-deployment.md`](triage-deployment.md).

User takes screenshots of in-game UI (item tooltips, character sheet,
inventory) and the tool OCRs them into structured data.

**Reference implementations:**

- [d4-item-tooltip-ocr](https://github.com/mxtsdev/d4-item-tooltip-ocr)
  (38 stars). Uses PaddleOCR with a custom-trained D4 model. Outputs
  per-tooltip JSON: name, type, item-power, affixes, aspect, stats.
- [d4lf](https://github.com/d4lfteam/d4lf) (199 stars) does inventory-wide
  filtering using OCR plus the TTS path below.

**What it imports:** Per-screenshot granularity. One tooltip at a time,
or with appropriate UI capture, a full character / inventory / paragon
board.

**ToS posture:** No issue. The user is processing their own screenshots
locally. No automation against any external source.

**Implementation cost:** High. OCR pipeline (PaddleOCR / Tesseract / a
vision LLM), recognition model tuned for D4's font / UI, post-processing
to map OCR'd text to catalog entries. Custom-trained OCR models exist in
open source and can be reused.

**A modern variant: vision-LLM extraction.** Instead of dedicated OCR,
send the screenshot to a multi-modal LLM (Claude with vision, GPT-4V,
Gemini Pro Vision). The LLM extracts structured data from a screenshot
in one shot, including handling overlapping tooltips, scaling, and font
variations. Trades dedicated-OCR engineering for per-call API cost
($0.01 – $0.10 per image depending on model). Validation against the
canonical catalog (where every entry has `bnetId`) catches LLM
hallucinations.

### Path C — TTS accessibility intercept

D4 has an accessibility feature called **"3rd Party Screen Reader"**
(Options > Accessibility) that emits structured TTS data about hovered
items, equipped gear, paragon nodes, and other game-state surfaces. A
companion tool intercepts this TTS stream via a Windows DLL and parses
the text into structured records.

**Reference implementation:** [d4lf](https://github.com/d4lfteam/d4lf)
(199 stars) uses this as its primary item-info source, supplemented by
OCR for elements TTS doesn't cover.

**What it imports:** Real-time, structured, near-perfect-fidelity data
about anything the user interacts with in-game. Full character / build
state if the user systematically inspects each slot.

**ToS posture:** Minimal concern. The accessibility feature is a
sanctioned input-output channel meant for users; intercepting its output
locally is not a security bypass.

**Implementation cost:** Very high. Requires a Windows DLL (typically
C++ or Rust), OS-specific install procedure, optional admin/cert
prompts, communication channel between the DLL and the web app
(typically a local socket or named pipe). Windows-only by design.

**Why this is the most exciting path.** TTS is *event-driven* — it
fires the moment the user hovers an item in-game. That makes it a
real-time input source, not just an import path. Connected to the
scoring engine, this enables **live "salvage / wear / keep" decisions
overlaid on actual gameplay** — the primary use case from the vision
doc, but accelerated to real-time. None of the other paths support
this.

### Path D — Wait for an official Blizzard API

Blizzard is slow to publish public APIs (the WoW Game Data API took
years to mature). A D4 profile API may eventually exist. Until it does,
the only legitimate "fetch my actual character from authoritative
source" path is unavailable, and any commission claiming it is
fabricating an endpoint.

**No work is required for this path** — it is a watch-and-wait state.

## Local game files

D4 is online-only. Character state lives on Blizzard servers, not in
local CASC archives. The local game files contain *game data* (item
definitions, skill definitions — already extracted via
`DiabloTools/d4data` and consumed by the catalog) but not *character
data*. So "parse local game files" is **not viable for this product's
use case**.

## Memory reading

D4 has anti-cheat. Reading the game's process memory to extract
character state is technically possible but exposes the user to flagging
and account risk. Community tools have explicitly avoided this path. Not
recommended.

## Evaluation matrix

| Path | Imports | Cross-platform | Real-time | ToS | Cost |
|---|---|---|---|---|---|
| A. Build-URL | shared *builds* (not "my current") | ✓ | no | gray | low |
| B. Screenshot OCR (dedicated) | per-shot | ✓ | no | clean | high |
| B'. Screenshot OCR (vision-LLM) | per-shot | ✓ | no | clean | low engineering, per-call API cost |
| C. TTS accessibility | full state, real-time | Windows only | **yes** | clean | very high |
| D. Official API | full state | ✓ | no | clean | nothing required (waiting) |

## Implications for d4-tools

For **one-time character setup** (the bottleneck the user mostly
notices today):

- Build-URL parser is the cheapest per-feature commission and the most
  common community pattern. Solves a different problem than "import my
  actual character" but is useful for theorycrafting and seed-data.
- Vision-LLM screenshot import is the most "impatient-friendly" path —
  drop one screenshot, get full character setup in seconds.
  Implementation cost is modest (one API integration + catalog
  validation).
- Manual entry (v2) remains the always-available fallback.

For **real-time loot triage** (the product's stated success criterion —
"decide salvage / wear / keep in <5 seconds"):

- TTS accessibility intercept is the only path that supports the goal
  natively. Worth the very-high implementation cost if the project
  scales beyond personal use, or if the user is willing to invest in a
  Windows DLL companion.
- Vision-LLM applied to a hovered-item screenshot (alt-tab → snip →
  paste) is a lower-fidelity, lower-cost approximation. Slower than TTS
  but does not require a DLL.

## Open commission ideas

Documented here for future Coco sessions to evaluate, not yet in the
backlog:

- ~~**`vN: Vision-LLM screenshot import`**~~ **✅ Shipped in v11 + v12.**
  Upload pipeline: gaming machine runs `bin/screenshot-watcher.ps1`;
  `POST /api/triage/upload` receives, saves, and parses synchronously via
  the Anthropic Vision API; `/triage` gallery displays results. The
  dedicated-OCR variant was superseded by the vision-LLM approach.
- **`vN: Build-URL parser`** — paste a D4Builds.gg / Maxroll / Mobalytics
  URL, fetch and parse to v2 schema. Per-source parsers; ToS gray-area
  acknowledged.
- **`vN: TTS-accessibility companion`** — Windows DLL intercepts D4's TTS
  stream, exposes a local socket, web app subscribes for real-time item
  events. Supports real-time loot triage. Substantial multi-component
  effort.
- **`vN: Live-overlay loot triage`** — combines the TTS-accessibility
  companion with the scoring engine to produce real-time
  salvage/wear/keep decisions while playing. The product's reason for
  existing, accelerated to its real-time form.

## References

- v3 writ id `w-movyfv53-982477e109e3` — original (now-decommissioned)
  Battle.net OAuth implementation.
- `docs/data-sources/01-armory.md` — original speculative API
  documentation; will be updated alongside the v3 decommission to
  reflect the API's non-existence.
- `docs/scoring-engine.md` §6 — defines the item-score output that any
  real-time triage path consumes.
- [josdemmers/Diablo4Companion](https://github.com/josdemmers/Diablo4Companion)
- [mxtsdev/d4-item-tooltip-ocr](https://github.com/mxtsdev/d4-item-tooltip-ocr)
- [d4lfteam/d4lf](https://github.com/d4lfteam/d4lf)
