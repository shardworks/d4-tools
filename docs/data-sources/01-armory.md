# 01 — Armory / Character Import

```
Verified against: Lord of Hatred expansion / Season 13 (Season of Reckoning) / 3.0.1c / accessed 2026-05-07
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
- Patch: Season 13 / 3.0.1c
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
  (redirected from `https://develop.battle.net/documentation/diablo-4`)
- Accessed: 2026-05-07
- Patch: Season 13 / 3.0.1c
- provenance: `official`
- verification: `requires credentials, reachability not verified` (documentation page is
  JavaScript-rendered; full endpoint listing requires authenticated developer-portal access)

**Authentication:** OAuth 2.0 Client Credentials (for game data) and Authorization Code flow
(for player profile data). A `client_id` and `client_secret` are required; register at
`https://develop.battle.net/access/clients`.

**Known D4 API endpoints (from community references; not verified against current docs):**

```
GET /profile/d4/en/profile/{realmSlug}/{characterId}/hero-items
GET /profile/d4/en/profile/{realmSlug}/{characterId}/hero
```

- `realmSlug`: `americas`, `europe`, `asia`
- `characterId`: numeric hero ID from profile
- Response: JSON (character equipment, stats, skills)

**Observed response shape (community-referenced, not canonical):**

```json
{
  "id": 12345678,
  "name": "MyChar",
  "class": "barbarian",
  "level": 100,
  "paragonLevel": 300,
  "equipment": {
    "head": {
      "id": "Helm_Uniq_Barb_001",
      "name": "Andariels Visage",
      "quality": "unique",
      "power": 925,
      "affixes": [...]
    }
  }
}
```

The `affixes` array contains display-text representations; numeric affix IDs for cross-referencing
with the datamine data may require additional lookups or are not directly exposed.

**ToS:** Use of the Game Data API is governed by the Blizzard API Terms of Use
(`https://develop.battle.net/documentation/diablo-4/game-data-apis`). Personal non-commercial
use is permitted. Rate limits apply (100 requests/second, 36,000/hour for typical tier).

---

## 2. Third-Party Planners with Battle.net Import

### 2.1 D4Builds.gg

D4Builds.gg is a build planner that offers character import via Battle.net authentication.

- URL: `https://d4builds.gg`
- Accessed: 2026-05-07
- Patch: Season 13 (all 10 classes including Paladin and Warlock)
- provenance: `planner`
- verification: `verified working` (site fully functional; season 13 content present)

**Battle.net import:** The build planner at `https://d4builds.gg/build-planner/` includes an
import workflow. Import status for Season 13 is not explicitly confirmed on the landing page;
verify via the planner UI.

**Observed features:**
- Meta build tier lists (Tower difficulty 110–145 rankings)
- Rob2628 S13 Cheat Sheet at `https://d4builds.gg/cheat-sheet/`
- D4Builds Desktop App on Overwolf (separate installable product)
- All 10 classes covered for Season 13

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
- Patch: Season 13 / May 6, 2026 (Hotfix 6 coverage)
- provenance: `planner`
- verification: `verified working`

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
- Patch: Season 13 (May 7, 2026 updates confirmed)
- provenance: `planner`
- verification: `verified working`

Features Mekuna-authored guides for all classes including Season 13 Paladin and Warlock.
Community build planner exists but Battle.net import capability is not confirmed.

**ToS:** Standard Mobalytics ToS. Personal use of public build data is acceptable; automated
scraping is not.

---

## 3. Representative Character Import Flow

A complete character import using the Blizzard Game Data API looks like:

1. **User authenticates** — OAuth Authorization Code flow; user grants permission at
   `https://us.battle.net/oauth/authorize?client_id=...&scope=d4.profile`
2. **Fetch character list** — `GET /profile/d4/en/profile/americas/{realmSlug}` returns
   the hero roster.
3. **Fetch hero detail** — `GET /profile/d4/en/profile/{realmSlug}/{heroId}/hero` returns
   class, level, paragon, stats.
4. **Fetch equipped items** — `GET /profile/d4/en/profile/{realmSlug}/{heroId}/hero-items`
   returns the equipment JSON shown in §1.2.
5. **Resolve display strings** — Cross-reference affix IDs against the datamine string tables
   (`08-datamine-extracts.md §4`) to get display text with interpolated values.

All API base URLs use `https://us.api.blizzard.com/` for the Americas region. The access token
from the OAuth flow is passed as `Authorization: Bearer <token>`.

---

## Open Items

- Verify that the Battle.net career profile URL with a full BattleTag path (e.g.,
  `https://us.battle.net/d4/en/profile/PlayerName-1234/`) actually loads character data.
- Confirm the exact D4 Game Data API endpoint paths from the developer portal — the paths in §1.2
  are community-referenced and may have changed with the Lord of Hatred expansion or Season 13.
- Confirm whether D4Builds.gg Battle.net import is functional for Season 13 characters.
- Determine the OAuth `scope` value required for D4 character profile access — `d4.profile` is an
  assumption; verify from `community.developer.battle.net`.
- Investigate whether the Blizzard API exposes numeric affix IDs (not just display strings) so
  that imported gear can be cross-referenced with the datamine affix catalog.
- Check whether `diablo4.life` (which has a build planner) also supports Battle.net character import.
- Survey Icy Veins — do they have a build planner with import, or only guides?
- Determine whether the Overwolf D4Builds Desktop App exposes any local API or hook for character
  data that bypasses the Battle.net OAuth flow.
