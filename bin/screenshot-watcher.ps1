<#
.SYNOPSIS
    Watches a directory for new D4 screenshot files and uploads them to the
    d4-tools POST /api/triage/upload endpoint.

.DESCRIPTION
    Reads configuration from the sibling file screenshot-watcher.config.json,
    starts a FileSystemWatcher on WatchDir, and on each Created event uploads
    the new file via multipart/form-data to UploadUrl.

    Targets PowerShell 5.1 (default on Windows 10/11). Does NOT require
    PowerShell 7 or any external modules.

    Decisions implemented:
    - D7  PS 5.1 compat: multipart boundary assembled manually with byte arrays
    - D8  Config from sibling JSON file
    - D16 Local file is kept after upload (never deleted)
    - D17 Open-retry on IOException (file still being written by D4): short
          backoff loop until the file can be opened for read
    - D6/D18 UploadSecret sent as X-Upload-Token header when set
#>

#Requires -Version 5.1
Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

# ─── Load config ──────────────────────────────────────────────────────────────

$ScriptDir  = Split-Path -Parent $MyInvocation.MyCommand.Path
$ConfigPath = Join-Path $ScriptDir 'screenshot-watcher.config.json'

if (-not (Test-Path $ConfigPath)) {
    Write-Error "Config file not found: $ConfigPath`nCreate it by copying screenshot-watcher.config.json.example and filling in your values."
    exit 1
}

$Config = Get-Content $ConfigPath -Raw | ConvertFrom-Json

$WatchDir     = $Config.WatchDir
$UploadUrl    = $Config.UploadUrl
$UploadSecret = if ($Config.PSObject.Properties['UploadSecret']) { $Config.UploadSecret } else { '' }
$Filter       = if ($Config.PSObject.Properties['Filter'])       { $Config.Filter }       else { '*.png' }

if ([string]::IsNullOrWhiteSpace($WatchDir)) {
    Write-Error "WatchDir must be set in $ConfigPath"
    exit 1
}
if ([string]::IsNullOrWhiteSpace($UploadUrl)) {
    Write-Error "UploadUrl must be set in $ConfigPath"
    exit 1
}
if (-not (Test-Path $WatchDir)) {
    Write-Error "WatchDir does not exist: $WatchDir"
    exit 1
}

# ─── Helpers ──────────────────────────────────────────────────────────────────

function Write-Log {
    param([string]$Message)
    $ts = (Get-Date).ToString('yyyy-MM-dd HH:mm:ss')
    Write-Host "[$ts] $Message"
}

<#
.SYNOPSIS
    Waits until the file can be opened exclusively for reading (D17).
    Retries every 250 ms on IOException. No fixed timeout — D4 typically
    finishes writing within a few hundred milliseconds.
#>
function Wait-FileReady {
    param([string]$FilePath)
    $MaxAttempts = 40   # ~10 seconds total; increase for slow drives
    $Attempt     = 0
    while ($Attempt -lt $MaxAttempts) {
        try {
            $stream = [System.IO.File]::Open($FilePath, [System.IO.FileMode]::Open,
                                              [System.IO.FileAccess]::Read,
                                              [System.IO.FileShare]::Read)
            $stream.Close()
            $stream.Dispose()
            return $true
        }
        catch [System.IO.IOException] {
            $Attempt++
            Start-Sleep -Milliseconds 250
        }
        catch {
            # Any other error (file deleted, permissions) — stop retrying
            throw
        }
    }
    Write-Log "WARNING: File still locked after $MaxAttempts attempts, skipping: $FilePath"
    return $false
}

<#
.SYNOPSIS
    Builds a multipart/form-data request body as a byte array and returns
    both the body bytes and the Content-Type header value (including boundary).

    Targets PS 5.1: the -Form parameter for Invoke-WebRequest was added in PS 7,
    so we assemble the boundary manually here.
#>
function Build-MultipartBody {
    param(
        [string]$FilePath,
        [string]$Boundary
    )

    $FileName    = [System.IO.Path]::GetFileName($FilePath)
    $FileBytes   = [System.IO.File]::ReadAllBytes($FilePath)

    # Detect MIME type from extension
    $Ext = [System.IO.Path]::GetExtension($FileName).ToLower()
    $MimeType = switch ($Ext) {
        '.png'  { 'image/png'  }
        '.jpg'  { 'image/jpeg' }
        '.jpeg' { 'image/jpeg' }
        '.webp' { 'image/webp' }
        '.gif'  { 'image/gif'  }
        default { 'application/octet-stream' }
    }

    $Encoding = [System.Text.Encoding]::UTF8

    # Part 1: file field
    $FilePart = $Encoding.GetBytes(
        "--$Boundary`r`n" +
        "Content-Disposition: form-data; name=`"file`"; filename=`"$FileName`"`r`n" +
        "Content-Type: $MimeType`r`n`r`n"
    )

    # Part 2: filename field (separate form field; server uses this, not File.Name)
    $FilenamePart = $Encoding.GetBytes(
        "`r`n--$Boundary`r`n" +
        "Content-Disposition: form-data; name=`"filename`"`r`n`r`n" +
        $FileName
    )

    # Closing boundary
    $ClosingPart = $Encoding.GetBytes("`r`n--$Boundary--`r`n")

    # Concatenate all parts
    $TotalLength = $FilePart.Length + $FileBytes.Length + $FilenamePart.Length + $ClosingPart.Length
    $Body        = New-Object byte[] $TotalLength
    $Offset      = 0
    [Array]::Copy($FilePart,     0, $Body, $Offset, $FilePart.Length);     $Offset += $FilePart.Length
    [Array]::Copy($FileBytes,    0, $Body, $Offset, $FileBytes.Length);    $Offset += $FileBytes.Length
    [Array]::Copy($FilenamePart, 0, $Body, $Offset, $FilenamePart.Length); $Offset += $FilenamePart.Length
    [Array]::Copy($ClosingPart,  0, $Body, $Offset, $ClosingPart.Length)

    return @{
        Body        = $Body
        ContentType = "multipart/form-data; boundary=$Boundary"
    }
}

<#
.SYNOPSIS
    Uploads one file to the configured UploadUrl and logs the outcome.
    Returns $true on HTTP 2xx, $false otherwise.
#>
function Upload-Screenshot {
    param([string]$FilePath)

    $FileName  = [System.IO.Path]::GetFileName($FilePath)
    $Boundary  = [System.Guid]::NewGuid().ToString('N')
    $Multipart = Build-MultipartBody -FilePath $FilePath -Boundary $Boundary

    $Headers = @{
        'Accept' = 'application/json'
    }
    if (-not [string]::IsNullOrWhiteSpace($UploadSecret)) {
        $Headers['X-Upload-Token'] = $UploadSecret
    }

    try {
        $Response = Invoke-WebRequest `
            -Uri     $UploadUrl `
            -Method  POST `
            -Body    $Multipart.Body `
            -Headers $Headers `
            -ContentType $Multipart.ContentType `
            -UseBasicParsing

        $StatusCode = $Response.StatusCode
        if ($StatusCode -ge 200 -and $StatusCode -lt 300) {
            Write-Log "OK ($StatusCode) - $FileName uploaded successfully."
            # Attempt to extract parseStatus from JSON response
            try {
                $Json = $Response.Content | ConvertFrom-Json
                if ($Json.PSObject.Properties['parseStatus']) {
                    Write-Log "  parseStatus: $($Json.parseStatus)"
                }
            }
            catch { <# non-fatal; response may not be JSON #> }
            return $true
        }
        else {
            Write-Log "WARN: Unexpected status $StatusCode for $FileName"
            return $false
        }
    }
    catch {
        $StatusCode = $null
        if ($_.Exception.Response -ne $null) {
            $StatusCode = [int]$_.Exception.Response.StatusCode
        }
        if ($StatusCode -eq 401) {
            Write-Log "ERROR: 401 Unauthorized - check UploadSecret in $ConfigPath"
        }
        elseif ($StatusCode -ne $null) {
            Write-Log "ERROR: HTTP $StatusCode uploading $FileName - $($_.Exception.Message)"
        }
        else {
            Write-Log "ERROR: Network error uploading ${FileName}: $($_.Exception.Message)"
        }
        return $false
    }
}

# ─── FileSystemWatcher setup ──────────────────────────────────────────────────

$Watcher                     = New-Object System.IO.FileSystemWatcher
$Watcher.Path                = $WatchDir
$Watcher.IncludeSubdirectories = $false
$Watcher.EnableRaisingEvents  = $false   # enabled below after handler registered

# Support comma-separated filter patterns (e.g. "*.png,*.jpg,*.jpeg")
# FileSystemWatcher only accepts one filter, so for multi-extension support we
# use '*.*' and filter by extension in the handler.
$AllowedExtensions = ($Filter -split ',') | ForEach-Object { $_.Trim().TrimStart('*').ToLower() }
$Watcher.Filter = '*.*'

Write-Log "screenshot-watcher starting."
Write-Log "  WatchDir : $WatchDir"
Write-Log "  UploadUrl: $UploadUrl"
Write-Log "  Filter   : $Filter"
Write-Log "  Auth     : $(if ([string]::IsNullOrWhiteSpace($UploadSecret)) { 'disabled' } else { 'enabled (UPLOAD_SECRET set)' })"
Write-Log "Press Ctrl+C to stop."
Write-Log "---"

# ─── Event subscription (no -Action: handler runs in main loop where functions are in scope) ───

Register-ObjectEvent -InputObject $Watcher -EventName 'Created' -SourceIdentifier 'FSW.Created' | Out-Null

$Watcher.EnableRaisingEvents = $true

# ─── Foreground loop — runs until Ctrl+C ─────────────────────────────────────

try {
    while ($true) {
        $Events = Get-Event -SourceIdentifier 'FSW.Created' -ErrorAction SilentlyContinue
        if ($Events) {
            foreach ($Evt in $Events) {
                Remove-Event -EventIdentifier $Evt.EventIdentifier

                $FilePath = $Evt.SourceEventArgs.FullPath
                $FileName = $Evt.SourceEventArgs.Name
                $Ext      = [System.IO.Path]::GetExtension($FileName).ToLower()

                # Extension filter
                if ($AllowedExtensions -notcontains $Ext) { continue }

                Write-Log "Detected: $FileName"

                # Wait until D4 has finished writing the file (D17)
                if (-not (Wait-FileReady -FilePath $FilePath)) { continue }

                # Upload (D16: local file is kept regardless of outcome)
                $null = Upload-Screenshot -FilePath $FilePath
            }
        }
        Start-Sleep -Milliseconds 250
    }
}
finally {
    $Watcher.EnableRaisingEvents = $false
    Unregister-Event -SourceIdentifier 'FSW.Created' -ErrorAction SilentlyContinue
    $Watcher.Dispose()
    Write-Log "Watcher stopped."
}
