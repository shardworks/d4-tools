# screenshot-watcher.ps1

A PowerShell 5.1 foreground watcher that monitors your Diablo 4 screenshot
folder and uploads new screenshots to the d4-tools
[`POST /api/triage/upload`](../app/api/triage/upload/route.ts) endpoint.

Run it on your **gaming machine** (Windows). Leave it running in a terminal
while you play. Every time D4 saves a new screenshot, the watcher automatically
uploads it to the d4-tools host for vision-LLM parsing and then **deletes the
local copy** so that your watch directory stays clean.

> **v12 reversal (v16):** Previous versions of the watcher preserved local
> files after upload. As of v16, successful uploads (HTTP 2xx) cause the local
> file to be deleted from `WatchDir`. The d4-tools host's `SCREENSHOT_DIR` is
> now the canonical archive. Files are only preserved locally when the upload
> fails, so nothing is lost on a network error.

---

## Prerequisites

| Requirement | Notes |
|---|---|
| Windows 10 or 11 | PowerShell 5.1 ships with both by default — no install required |
| Network path to d4-tools host | LAN, Tailscale, or public URL — see [`docs/triage-deployment.md`](../docs/triage-deployment.md) |
| d4-tools running | `pnpm dev` or production deployment with `SCREENSHOT_DIR` and `ANTHROPIC_API_KEY` set |

To check your PowerShell version:
```powershell
$PSVersionTable.PSVersion
```
Version 5.1 or higher is required. If you see 5.1.x you are ready. PowerShell 7+ also works.

---

## Configuration

Edit `bin/screenshot-watcher.config.json` (sibling file in the same directory):

```json
{
  "WatchDir":     "C:\\Users\\YourName\\Documents\\Diablo IV\\Screenshots",
  "UploadUrl":    "http://192.168.1.50:3000/api/triage/upload",
  "UploadSecret": "your-shared-secret",
  "Filter":       "*.png,*.jpg,*.jpeg"
}
```

| Key | Required | Description |
|---|---|---|
| `WatchDir` | Yes | Absolute path to the folder D4 writes screenshots into. The typical path is `%USERPROFILE%\Documents\Diablo IV\Screenshots\`. |
| `UploadUrl` | Yes | Full URL of the upload endpoint on the d4-tools host, including port. |
| `UploadSecret` | No | Shared secret to include as the `X-Upload-Token` header. Must match `UPLOAD_SECRET` on the server. Leave empty (or omit) to disable auth. |
| `Filter` | No | Comma-separated glob patterns for files to watch. Defaults to `*.png,*.jpg,*.jpeg`. |

### Finding your D4 screenshot folder

In-game: **Options → Social → Screenshot Location** shows the current path.
The default is usually:
```
C:\Users\<username>\Documents\Diablo IV\Screenshots\
```

---

## Running the watcher

Open a PowerShell terminal (**not** as Administrator — not needed), navigate
to the `bin/` directory, and run:

```powershell
cd path\to\d4-tools\bin
.\screenshot-watcher.ps1
```

You should see output like:
```
[2026-05-08 21:00:00] screenshot-watcher starting.
[2026-05-08 21:00:00]   WatchDir : C:\Users\Sean\Documents\Diablo IV\Screenshots
[2026-05-08 21:00:00]   UploadUrl: http://192.168.1.50:3000/api/triage/upload
[2026-05-08 21:00:00]   Filter   : *.png,*.jpg,*.jpeg
[2026-05-08 21:00:00]   Auth     : enabled (UPLOAD_SECRET set)
[2026-05-08 21:00:00] Press Ctrl+C to stop.
[2026-05-08 21:00:00] ---
```

Press **Ctrl+C** to stop.

### Execution policy

If you see _"running scripts is disabled"_, run this once in an elevated terminal:

```powershell
Set-ExecutionPolicy -ExecutionPolicy RemoteSigned -Scope CurrentUser
```

---

## How it works

1. A `System.IO.FileSystemWatcher` monitors `WatchDir` for `Created` events.
2. On each new file whose extension matches `Filter`, the watcher waits until
   D4 has finished writing the file (retries every 250 ms if the file is still
   locked — no fixed sleep, no size-stable bookkeeping).
3. The file is uploaded as `multipart/form-data` to `UploadUrl`. The multipart
   boundary is constructed manually for PS 5.1 compatibility (PS 7's `-Form`
   parameter is not used).
4. If `UploadSecret` is set, the `X-Upload-Token` header is sent.
5. **On a successful upload (HTTP 2xx):** the local file is deleted from
   `WatchDir`. The d4-tools host's `SCREENSHOT_DIR` is the canonical archive.
   If the delete itself fails (e.g. permissions, race condition), a `WARN` line
   is logged and the upload is still considered successful — the operator is not
   interrupted.
6. **On a failed upload (non-2xx or network error):** the local file is
   preserved in `WatchDir` unchanged. Nothing is lost; the operator can
   investigate and re-upload manually.
7. Success, failure, and warnings are logged to stdout with timestamps.

---

## Troubleshooting

### File uploaded but parse shows `error`

The d4-tools server received the file but the LLM call failed. Check the
server's console for `[upload]` and `[crop]` log lines. Common causes:
`ANTHROPIC_API_KEY` not set, API key exhausted, network error to Anthropic.
You can re-parse from the `/triage` gallery's **Parse** button.

### 401 Unauthorized

`UploadSecret` in `screenshot-watcher.config.json` does not match `UPLOAD_SECRET`
on the server. Both must be identical strings. If you changed the server's
secret, update the config file and restart the watcher.

### File-lock retry warnings

D4 sometimes holds the file open for a moment after writing. The watcher
retries up to 40 times (10 seconds) before giving up. Warnings like
`"File still locked after 40 attempts"` are rare; if you see them frequently,
the file may be in use by another process.

### Nothing happens when I press the screenshot key

Verify that `WatchDir` is the correct path. Take a screenshot and check
Windows Explorer — if the file appears there, the watcher should detect it.
If not, D4 may be saving to a different folder (check **Options → Social →
Screenshot Location** in-game).

### Network errors

If `UploadUrl` points to a remote host (not `localhost`), verify network
connectivity:
```powershell
Test-NetConnection -ComputerName 192.168.1.50 -Port 3000
```

See [`docs/triage-deployment.md`](../docs/triage-deployment.md) for networking
topology guidance.

### Local file was not deleted after upload

If the delete fails (permissions, antivirus hold, etc.), the watcher logs a
`WARN` line and continues. The file remains in `WatchDir` and should be safe
to delete manually once the upload is confirmed successful on the server.
