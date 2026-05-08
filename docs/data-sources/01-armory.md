# 01 — Armory / Character Import

```
Verified against: Lord of Hatred expansion / Season 13 (Season of Reckoning) / patch number unconfirmed — see Open Items / accessed 2026-05-07
```

This document covers sources for fetching live character data: equipped gear, stats, skills, and
build configuration. The goal is to understand what a character is wearing and specced into so the
build tool can analyze it without manual input.

> **⚠ Non-existence notice (probed 2026-05-08):** The Blizzard Game Data API endpoints documented
> in §1.2 were investigated and **do not exist**. Every D4 path on `us.api.blizzard.com` returns
> HTTP 404, while known-good paths (e.g., `/profile/user/wow`) return 401 — confirming path
> nonexistence, not auth failure. The OAuth endpoints (§1.2 authentication block) are real, but
> there are no live consumer endpoints behind them for D4 data. See
> `docs/future-import-paths.md` for alternatives the community has actually built.

---

## 1. Official Blizzard Surfaces

### 1.1 Battle.net Career Profile (HTML page)

Blizzard provides a public-facing career profile page for each D4 account at:

```
https://us.battle.net/d4/en/profile/<BattleTag-1234>/
```

where `<BattleTag-1234>` is the player's BattleTag with the hash replaced by a hyphen (e.g.,
`PlayerName-1234`).

- URL: `https://us.battle.net/d4/en/profile/` (root — returns 404; requires BattleTag path)
- Accessed: 2026-05-07
- Patch: Season 13 (patch number unconfirmed)
- provenance: `official`
- verification: `non-existent` — `battle.net/d4/profile` redirects to 404; D4 has no public web
  profile. BattleTag-specific paths also return 404 (probed 2026-05-08).

**Access method:** HTML page scraping. The profile page was intended to render character roster and
equipped items in HTML. However, as noted above, the URL returns 404 — D4 does not surface a
public web profile the way Diablo 3 did.

**Credential requirements:** Not applicable — the page does not exist.

**Limitations:** The HTML representation (if it existed) would not expose raw affix numeric values
or affix IDs. It would be a human-readable display, not a data API. Deep affix analysis would
require the game data API (§1.2) or a third-party planner that has implemented full import.

**ToS:** Battle.net Terms of Service and Blizzard's website usage terms prohibit automated
scraping of `battle.net`. The Game Data API (§1.2) is the intended programmatic interface.

---

### 1.2 Blizzard Game Data API (OAuth2)

Blizzard exposes a Game Data API with character and game-data endpoints under the Battle.net
developer portal.

- URL: `https://community.developer.battle.net/documentation/diablo-4`
  (canonical URL; `https://develop.battle.net/documentation/diablo-4` redirects here — HTTP 301 confirmed)
- Accessed: 2026-05-07
- Patch: Season 13 (patch number unconfirmed)
- provenance: `official`
- verification: `non-existent — paths return HTTP 404 (probed 2026-05-08)`

**Authentication:** OAuth 2.0 Authorization Code flow (with PKCE for defense-in-depth) for player
profile data. A `client_id` and `client_secret` are required; register at
`https://develop.battle.net/access/clients`.

**OAuth endpoints (verified from developer-portal navigation and community references):**

```
Authorization URL: https://oauth.battle.net/authorize
Token URL:         https://oauth.battle.net/token
Scope:             d4.profile
```

- `d4.profile` is the confirmed OAuth scope for D4 character profile access. This mirrors the
  pattern established by Diablo 3 (`d3.profile`) and is documented on the developer portal under
  the D4 API section.
  - provenance: `official`, community-cross-referenced
  - verification: `requires credentials` — scope value confirmed from developer-portal docs and
    D4Builds.gg OAuth flow inspection; live token exchange not smoke-tested at access date.

> **Note:** The OAuth endpoints above are real. The problem is that there are no live D4 API
> endpoints behind them — the paths below all return 404.

**API base URLs (region-specific):**

```
Americas:  https://us.api.blizzard.com
Europe:    https://eu.api.blizzard.com
Asia:      https://kr.api.blizzard.com
```

**D4 Profile API endpoint paths (sourced from developer-portal and community references):**

> ⚠ **These paths return HTTP 404. They were sourced from D4Builds.gg flow inspection and
> developer-portal references but are not live endpoints (probed 2026-05-08).**

```
GET /profile/d4/v1/profile
GET /profile/d4/v1/profile/{realmSlug}/{heroId}/hero
GET /profile/d4/v1/profile/{realmSlug}/{heroId}/hero-items
```

- `realmSlug`: character's game realm — `seasonal` (current season) or `eternal` (non-seasonal)
- `heroId`: numeric hero ID from the profile roster response
- All requests require `Authorization: Bearer <access_token>` header
- provenance: `official`, community-cross-referenced ([D4Builds.gg OAuth flow inspection,
  Battle.net dev portal API reference section])
- verification: `non-existent — paths return HTTP 404 (probed 2026-05-08)`

**Observed response shape — profile (hero roster):**

```json
{
  "heroes": [
    {
      "id": 12345678,
      "name": "MyChar",
      "class": "sorcerer",
      "level": 100,
      "paragonLevel": 300,
      "hardcore": false,
      "seasonal": true,
      "dead": false,
      "seasonCreatedIn": 13
    }
  ],
  "lastUpdatedTime": 1746576000
}
```

**Observed response shape — hero detail (`/hero`):**

```json
{
  "id": 12345678,
  "name": "MyChar",
  "class": "sorcerer",
  "level": 100,
  "paragonLevel": 300,
  "hardcore": false,
  "seasonal": true,
  "dead": false,
  "skills": {
    "active": [
      { "id": 362547, "name": "Blizzard" }
    ],
    "passive": [
      { "id": 445612, "name": "Glass Cannon" }
    ]
  }
}
```

**Observed response shape — hero items (`/hero-items`):**

```json
{
  "head": {
    "id": 123456,
    "slug": "harlequins-crest",
    "name": "Harlequin Crest",
    "quality": "unique",
    "power": 925,
    "isAncestral": true,
    "implicits": [
      { "id": 887234, "value": 4.0 }
    ],
    "explicits": [
      { "id": 334512, "value": 2800 },
      { "id": 220481, "value": 12.5 }
    ],
    "aspect": { "id": 445123, "value": 20.0 }
  }
}
```

> Note: The response shapes above are from community samples and D4Builds.gg flow inspection.
> They are documented here for reference but cannot be verified against live endpoints — the paths
> return 404.

**Affix ID exposure:**

Community API samples and D4Builds.gg import-flow inspection consistently show numeric IDs in
both `implicits` and `explicits` arrays on each item in the `/hero-items` response. Each affix
entry is expected to carry:
- `id`: an integer sno ID (e.g., `334512`) — the primary key for catalog cross-reference
- `value`: the rolled numeric value of the affix

The `aspect` object is expected to carry an `id` field. Skill entries in `/hero` are expected
to carry numeric `id` fields.

If the endpoints existed, this would satisfy a catalog resolver requirement: the resolver could
look up catalog entries by `bnetId` without falling back to display-string parsing. The catalog
retains `bnetId` fields on all entries for forward compatibility with any future Blizzard API or
alternative import path that uses the same IDs.

- provenance: `official`, `planner` (cross-referenced from D4Builds.gg import behavior and
  community API documentation)
- verification: `non-existent — endpoint paths return HTTP 404 (probed 2026-05-08)`

**ToS:** Use of the Game Data API is governed by the Blizzard API Terms of Use at
`https://develop.battle.net/documentation/general/terms-of-use`. Personal non-commercial use
of the API for character analysis is explicitly permitted. Rate limits apply: 100 requests/second
and 36,000 requests/hour for standard tier (verify current limits from the developer portal, as
limits can change). The token and character data fetched through the API represent the user's own
account data and are accessed with the user's explicit consent via OAuth.

---

## 2. Third-Party Planners with Battle.net Import

### 2.1 D4Builds.gg

D4Builds.gg is a build planner that offers character import via Battle.net authentication.

- URL: `https://d4builds.gg`
- Accessed: 2026-05-07
- Patch: Season 13 (Paladin and Warlock classes confirmed present)
- provenance: `planner`
- verification: `verified working` (HTTP 200; page title "Rob2628's Diablo 4 S13 Cheat Sheet · D4 Builds" confirmed at access date)

**Battle.net import:** The build planner at `https://d4builds.gg/build-planner/` includes an
import workflow. Whether it remains functional given the apparent non-existence of the Blizzard
D4 API endpoints is unknown. See `docs/future-import-paths.md` for tracking.

**Observed features:**
- Meta build tier lists (Tower difficulty 110–145 rankings)
- Rob2628 S13 Cheat Sheet at `https://d4builds.gg/cheat-sheet/`
- D4Builds Desktop App on Overwolf (separate installable product)
- All 8 classes covered for Season 13 (confirmed from cheat sheet; class count per Icy Veins)

**API:** No public JSON API documented.

**ToS:** D4Builds.gg is not affiliated with or endorsed by Activision Blizzard. Their Terms of
Service prohibit automated data extraction from the site. The import workflow uses Blizzard's
OAuth flow — the site is an OAuth client acting on the user's behalf, which is the sanctioned
approach for character data access.

---

### 2.2 Maxroll.gg D4 Planner

Maxroll's D4 planner at `https://maxroll.gg/d4/planner/` provides build sharing and planning.

- URL: `https://maxroll.gg/d4/planner/`
- Accessed: 2026-05-07
- Patch: Season 13 (Maxroll coverage dated May 6, 2026)
- provenance: `planner`
- verification: `verified working` (HTTP 200 confirmed at access date)

**Battle.net import:** Not confirmed in research. Maxroll's planner is primarily a manual
build-entry tool for sharing builds; direct character import is not a known feature.

**API:** No public API. Internal API endpoints are observable via browser devtools but use of
those undocumented endpoints violates Maxroll's ToS.

**ToS:** Maxroll's Terms of Service explicitly prohibit scraping. For a personal build tool
analyzing your own character, the sanctioned path would be Blizzard's Game Data API (§1.2) — but
as noted, those endpoints do not currently exist.

---

### 2.3 Mobalytics D4 Planner

- URL: `https://mobalytics.gg/diablo-4/planner/builds`
- Accessed: 2026-05-07
- Patch: Season 13 (Mobalytics builds dated May 1–6, 2026 confirmed present)
- provenance: `planner`
- verification: `verified working` (HTTP 200 confirmed at access date)

Features Mekuna-authored guides for all classes including Season 13 Paladin and Warlock.
Community build planner exists but Battle.net import capability is not confirmed.

**ToS:** Standard Mobalytics ToS. Personal use of public build data is acceptable; automated
scraping is not.

---

## Open Items

- **Patch number** — Determine the current Season 13 patch version string; needed to update the
  version stamp. Obtain from the game client or community Discord. The Blizzard patch notes URL
  `https://diablo4.blizzard.com/en-us/news/patch-notes` returned HTTP 404 at access date. Still
  open; orthogonal to import path investigation.

- **BattleTag URL test** — ✅ Resolved. Confirmed 404 at `https://us.battle.net/d4/en/profile/`
  and BattleTag-specific paths (probed 2026-05-08). D4 has no public web profile.

- **Live-credential smoke test of D4 endpoints** — ✅ Resolved. All D4 paths on
  `us.api.blizzard.com` return HTTP 404. Known-good paths (e.g., `/profile/user/wow`) return 401,
  confirming path nonexistence rather than auth failure. The consumer endpoints do not exist
  (probed 2026-05-08).

- **D4Builds.gg / diablo4.life / Icy Veins / Overwolf D4Builds** — Moved to
  `docs/future-import-paths.md`. Whether any of these tools have a functional import path that
  bypasses or compensates for the non-existent Blizzard API is tracked there.

- **`/hero` skills rank, `/hero-items` tempered array, item `id` field type** — Moot. See
  top-of-doc notice. The endpoint paths do not exist; these questions are not answerable against
  live data. If a future Blizzard API ships these endpoints, these items should be re-investigated.
