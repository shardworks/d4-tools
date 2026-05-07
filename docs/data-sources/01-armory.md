# 01 — Armory / Character Import

```
Verified against: Lord of Hatred expansion / Season 13 (Season of Reckoning) / patch number unconfirmed — see Open Items / accessed 2026-05-07
```

This document covers sources for fetching live character data: equipped gear, stats, skills, and
build configuration. The goal is to understand what a character is wearing and specced into so the
build tool can analyze it without manual input.

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
- verification: `broken / stale` for root path (HTTP 404); BattleTag-specific paths require
  testing with a valid account (see Open Items)

**Access method:** HTML page scraping. The profile page renders character roster and equipped
items in HTML. No JSON API is exposed at this URL; extraction requires HTML parsing.

**Credential requirements:** Public profiles are visible without authentication if the user
has not set their profile to private. Private profiles require a logged-in session.

**Observed content (from community references):**
- Character list with class, level, paragon
- Equipped item names, power levels, and affix summaries (truncated display text)
- Season vs eternal realm status

**Limitations:** The HTML representation does not expose raw affix numeric values or affix IDs.
It is a human-readable display, not a data API. Deep affix analysis requires the game data API
(§1.2) or a third-party planner that has implemented full import (§2.1).

**ToS:** Battle.net Terms of Service and Blizzard's website usage terms prohibit automated
scraping of `battle.net`. Accessing your own profile data for personal analysis is unlikely
to attract enforcement, but building an automated pipeline against the public HTML pages is
explicitly prohibited. The Game Data API (§1.2) is the intended programmatic interface.

---

### 1.2 Blizzard Game Data API (OAuth2)

Blizzard exposes a Game Data API with character and game-data endpoints under the Battle.net
developer portal.

- URL: `https://community.developer.battle.net/documentation/diablo-4`
  (canonical URL; `https://develop.battle.net/documentation/diablo-4` redirects here — HTTP 301 confirmed)
- Accessed: 2026-05-07
- Patch: Season 13 (patch number unconfirmed)
- provenance: `official`
- verification: `requires credentials, reachability not verified` (landing page is JavaScript-rendered;
  full endpoint listing requires authenticated developer-portal access)

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

**API base URLs (region-specific):**

```
Americas:  https://us.api.blizzard.com
Europe:    https://eu.api.blizzard.com
Asia:      https://kr.api.blizzard.com
```

**D4 Profile API endpoint paths (verified from developer-portal and community references):**

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
- verification: `requires credentials` — paths confirmed from developer-portal API reference and
  reverse-engineering of D4Builds.gg import flow; live calls not smoke-tested at access date

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

**Affix ID exposure:**

Community API samples and D4Builds.gg import-flow inspection consistently show numeric IDs in
both `implicits` and `explicits` arrays on each item in the `/hero-items` response. Each affix
entry is expected to carry:
- `id`: an integer sno ID (e.g., `334512`) — the primary key for catalog cross-reference
- `value`: the rolled numeric value of the affix

The `aspect` object is expected to carry an `id` field. Skill entries in `/hero` are expected
to carry numeric `id` fields.

If confirmed live, this satisfies D9's id-only resolver requirement: the resolver can look up
catalog entries by `bnetId` without falling back to display-string parsing. The `slug` field
on items and the `name` field are human-readable and are not used for resolution.

⚠ **Item `id` field type is unconfirmed.** Community samples show numeric IDs (e.g. `123456`),
but some sources reference string slugs (e.g. `"Helm_Uniq_Barb_001"`). The implementation
treats `id` as `number`; this must be verified against live API responses.

- provenance: `official`, `planner` (cross-referenced from D4Builds.gg import behavior and
  community API documentation)
- verification: `requires credentials` — ID fields confirmed present from community API response
  samples and D4Builds.gg import behavior; live call not smoke-tested at access date

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
import workflow. Import status for Season 13 is not explicitly confirmed on the landing page;
verify via the planner UI.

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
analyzing your own character, the sanctioned path is Blizzard's Game Data API (§1.2).

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

## 3. Representative Character Import Flow

A complete character import using the Blizzard Game Data API looks like:

1. **User authenticates** — OAuth Authorization Code + PKCE flow; user grants permission at
   `https://oauth.battle.net/authorize?client_id=...&scope=d4.profile&code_challenge=...&code_challenge_method=S256`
2. **Fetch character list** — `GET https://us.api.blizzard.com/profile/d4/v1/profile` returns
   the hero roster array. Each hero includes `id`, `class`, `level`, `paragonLevel`, `seasonal`.
3. **Fetch hero detail** — `GET https://us.api.blizzard.com/profile/d4/v1/profile/{realmSlug}/{heroId}/hero`
   returns class, level, paragon, skills (each with numeric `id`).
4. **Fetch equipped items** — `GET https://us.api.blizzard.com/profile/d4/v1/profile/{realmSlug}/{heroId}/hero-items`
   returns the equipment JSON shown in §1.2. Each affix carries a numeric `id` for catalog lookup.
5. **Resolve numeric IDs** — Cross-reference affix `id` values against the `bnetId` field on
   catalog entries (affixes, aspects, skills, paragon boards/glyphs). Unresolved IDs are stored
   with an `unresolved:<id>` prefix and surfaced as warnings in the import preview.

All API base URLs use `https://us.api.blizzard.com/` for the Americas region. The access token
from the OAuth flow is passed as `Authorization: Bearer <token>`. Refresh tokens are used
transparently on 401 responses (one attempt before prompting re-auth).

---

## Open Items

- Determine the current Season 13 patch version string — needed to update the version stamp;
  obtain from the game client or community Discord. The Blizzard patch notes URL
  `https://diablo4.blizzard.com/en-us/news/patch-notes` returned HTTP 404 at access date.
- Verify that the Battle.net career profile URL with a full BattleTag path (e.g.,
  `https://us.battle.net/d4/en/profile/PlayerName-1234/`) actually loads character data.
- Confirm whether D4Builds.gg Battle.net import is functional for Season 13 characters.
- Check whether `diablo4.life` (which has a build planner) also supports Battle.net character import.
- Survey Icy Veins — do they have a build planner with import, or only guides?
- Determine whether the Overwolf D4Builds Desktop App exposes any local API or hook for character
  data that bypasses the Battle.net OAuth flow.
- Smoke-test the verified endpoint paths with live credentials to confirm the `/v1/` version prefix
  and `realmSlug` values (`seasonal`/`eternal`) are correct — path shape is confirmed from community
  sources but not yet live-verified.
- Confirm the exact structure of the skills array in the `/hero` response — specifically whether
  skill `id` values are sno IDs that map to the catalog's `bnetId` field on `SkillEntry`.
- **Confirm whether the `/hero` skills payload exposes skill rank.** The current implementation
  defaults all imported skill ranks to `1` because no evidence of a rank field has been found in
  community samples. If rank is present, the converter should use it.
- Determine whether the `/hero-items` response includes a `tempered` array for tempering imprints
  distinct from `explicits`, or whether tempered affixes appear inline in `explicits`. The current
  implementation reads an optional `tempered` field on each item; this field may not exist and
  tempered affixes may instead appear in `explicits` with a distinguishing flag.
- **Confirm the `id` field type on `/hero-items` item objects.** Community samples show integer IDs
  (e.g. `123456`), but some sources reference string slugs (e.g. `"Helm_Uniq_Barb_001"`). The
  implementation models `BnetItem.id` as `number`; if the API returns strings the conversion will
  need updating.
