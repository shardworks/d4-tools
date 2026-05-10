# Triage Deployment Guide

This document explains the two-host topology introduced in v12: a gaming machine
running the PowerShell watcher produces screenshots; a d4-tools server running
Next.js consumes and parses them via `POST /api/triage/upload`.

---

## Topology overview

```
┌──────────────────────────────────┐       ┌────────────────────────────────────┐
│  Gaming machine (Windows)        │       │  d4-tools host (Linux/macOS/Win)   │
│                                  │       │                                    │
│  Diablo 4 ──────► Screenshots/   │       │  Next.js server                    │
│                        │         │       │    POST /api/triage/upload         │
│  screenshot-watcher.ps1          │  HTTP │    ↓                               │
│    (FileSystemWatcher)  ─────────┼──────►│  SCREENSHOT_DIR/<filename>         │
│                                  │       │    ↓                               │
│  Local screenshots deleted       │       │  Crop & Resize                     │
│  on successful upload            │       │    (tooltip detect + byte-budget)  │
│                                  │       │    ↓                               │
└──────────────────────────────────┘       │  Vision LLM (Anthropic)            │
                                           │    ↓                               │
                                           │  DATA_DIR/screenshot-cache/<hash>  │
                                           │    ↓                               │
                                           │  /triage gallery                   │
                                           └────────────────────────────────────┘
```

### Roles

| Component | Host | Purpose |
|---|---|---|
| `bin/screenshot-watcher.ps1` | Gaming machine (Windows) | Watches the D4 screenshot folder; uploads new files via multipart HTTP POST; deletes local file on successful upload |
| `POST /api/triage/upload` | d4-tools host | Receives the file, saves it atomically under `SCREENSHOT_DIR`, crops to detected tooltip, calls the LLM, caches the result |
| `/triage` gallery | d4-tools host (browser) | Displays uploaded screenshots with parse results; Parse button available as fallback |

Both machines can be the same computer (single-host setup). In that case
`UploadUrl: http://localhost:3000/api/triage/upload` and no auth is needed.

---

## Networking options

### Option 1: Same machine (simplest)

Run d4-tools and Diablo 4 on the same Windows machine. Point the watcher at
`http://localhost:3000/api/triage/upload`. No auth required.

```json
{
  "UploadUrl": "http://localhost:3000/api/triage/upload",
  "UploadSecret": ""
}
```

### Option 2: Private LAN (two machines, no external exposure)

The gaming machine and the d4-tools host are on the same home or office network.
Find the d4-tools host's LAN IP (e.g. `192.168.1.50`) and use it directly.

```json
{
  "UploadUrl": "http://192.168.1.50:3000/api/triage/upload",
  "UploadSecret": ""
}
```

Auth is optional on a trusted private LAN — no traffic leaves your network.
Setting `UPLOAD_SECRET` anyway adds defense-in-depth at negligible cost.

### Option 3: Tailscale (recommended for cross-location setups)

[Tailscale](https://tailscale.com) creates a private mesh VPN between your
devices. Each device gets a stable `100.x.y.z` IP. No port-forwarding or
dynamic-DNS required.

1. Install Tailscale on both machines and sign in with the same account.
2. Find the d4-tools host's Tailscale IP: `tailscale ip -4`
3. Configure the watcher:

```json
{
  "UploadUrl": "http://100.x.y.z:3000/api/triage/upload",
  "UploadSecret": "strong-random-secret"
}
```

Enable `UPLOAD_SECRET` — Tailscale traffic is encrypted but a shared secret
prevents other Tailscale network members from pushing uploads.

### Option 4: Direct internet exposure

Expose port 3000 directly via a reverse proxy (nginx, Caddy) with HTTPS.

**Strongly recommended when exposed to the internet:**
- HTTPS (TLS certificate via Let's Encrypt / Caddy automatic HTTPS)
- `UPLOAD_SECRET` set to a long random string

```bash
# Generate a secret (Linux/macOS)
openssl rand -hex 32
```

Set the same value in `.env.local` on the server and in
`screenshot-watcher.config.json` on the gaming machine.

---

## Server setup

### Environment variables

Set these in `.env.local` (development) or your production environment:

```
SCREENSHOT_DIR=/path/to/screenshots
ANTHROPIC_API_KEY=sk-ant-...
UPLOAD_SECRET=                      # optional; recommended for non-private networks
```

`SCREENSHOT_DIR` is the directory where uploaded files are saved.
After uploading, this directory is also read by the `/triage` gallery.

### Starting the server

```bash
# development
pnpm dev

# production
pnpm build && pnpm start
```

The upload endpoint is available at `POST /api/triage/upload` immediately.

---

## Watcher setup

See [`bin/screenshot-watcher.README.md`](../bin/screenshot-watcher.README.md)
for full watcher documentation. Quick start:

1. Copy `bin/screenshot-watcher.config.json` values and fill in:
   - `WatchDir`: path to your D4 Screenshots folder
   - `UploadUrl`: URL of the server endpoint
   - `UploadSecret`: shared secret (must match server's `UPLOAD_SECRET`)
2. Run on Windows: `.\bin\screenshot-watcher.ps1`

---

## When to use `UPLOAD_SECRET`

| Scenario | Recommendation |
|---|---|
| Single machine (localhost only) | Skip it — no external traffic |
| Private LAN (home network, both machines yours) | Optional, low-stakes; worth setting for habit |
| Tailscale VPN | Set it — protects against other VPN members |
| Internet-exposed endpoint | **Required** — set a long random secret |

An empty or absent `UPLOAD_SECRET` causes the server to log a one-time warning
and accept all uploads without authentication. This is intentional for
zero-config single-host setups.

---

## The parse flow in detail

1. Watcher detects a `Created` event in `WatchDir`.
2. Waits until the file is fully written (open-retry loop, 250 ms cadence).
3. POSTs the file as `multipart/form-data` to `UploadUrl` with the filename
   as a separate `filename` form field.
4. Server validates the `X-Upload-Token` header (if `UPLOAD_SECRET` is set).
5. Server checks the MIME type, rejects non-image files.
6. Server saves the file atomically under `SCREENSHOT_DIR` (collision suffix
   appended if a file with the same name already exists). The on-disk file
   is byte-identical to the upload and is never modified by later pipeline steps.
7. Server computes SHA-256 of the file bytes.
8. Server checks `DATA_DIR/screenshot-cache/<hash>.json` for a prior result.
   - **Cache hit**: returns the cached `CacheEntry` in the response. Steps 8a–8c
     and the LLM call are skipped entirely.
   - **Cache miss**: continue to step 8a.
8a. Server runs tooltip detection (title-anchored, frame-color-aware detection) on a
    downscaled working copy of the image to find tooltip title regions by rarity color.
8b. The detected region(s) (or the full image on detection failure) are cropped at
    full resolution. Each crop is then downscaled independently if needed to fit the
    Anthropic 5 MiB base64 input limit (JPEG fallback at quality 85).
8c. The cropped/resized bytes are sent to the Vision LLM. A single `[crop]`
    server log line is emitted with `detected`, `resized`, and `bytes` fields.
    Multiple tooltip crops are supported (e.g., comparison screenshots).
9. On LLM success: writes the result to the cache; returns HTTP 201 with the
   full `CacheEntry`.
10. On LLM failure: returns HTTP 200 (not 201) with `parseStatus: "error"` and
    the error message. The file remains on disk; the gallery's **Parse** button
    can retry.

After a successful upload (HTTP 2xx), the watcher deletes the local file from
`WatchDir`. On upload failure the local file is preserved. The d4-tools host's
`SCREENSHOT_DIR` is the canonical archive.

---

## Fallback: manual parse

The gallery at `/triage` lists all files under `SCREENSHOT_DIR`. Selecting any
image and pressing **Parse** triggers the existing `POST /api/triage/parse`
endpoint, which runs the same crop → LLM flow on demand. Use this as a fallback
when a watcher upload failed at the parse step.

---

## Triage HTTP surface

### Screenshot management

| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/api/triage/screenshots/[name]` | Stream a screenshot file |
| `DELETE` | `/api/triage/screenshots/[name]` | Delete a screenshot and its cached parse result. Returns 204 on success, 404 if neither the file nor the cache entry exists. Cache deletion is best-effort (logs a warning on failure but does not fail the request). |

### Crop inspection

| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/api/triage/cropped/[hash]?filename=...` | Returns `{ count, detected }` for the crop(s) that would be sent to the LLM. The cropper is re-run on demand (memory-only; no disk writes). |
| `GET` | `/api/triage/cropped/[hash]/[index]?filename=...` | Returns the binary crop image at position `[index]` (0-based). `Cache-Control: public, max-age=31536000, immutable` since URLs are content-hash addressed. |

The `[hash]` path segment is the SHA-256 hex of the source screenshot bytes. The `?filename=` query parameter identifies the source file; the server re-hashes it before serving to detect stale URLs.
