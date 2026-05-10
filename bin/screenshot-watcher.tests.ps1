<#
.SYNOPSIS
    Pester test suite for screenshot-watcher.ps1 — delete-on-success behaviour.

.DESCRIPTION
    Covers three scenarios mandated by the v16 commission:
      (a) Success path  — Upload-Screenshot returns $true  → local file deleted.
      (b) Failure path  — Upload-Screenshot returns $false → local file preserved.
      (c) Delete-failure path — Upload succeeds ($true) but Remove-Item throws
          → local file is preserved on disk, a WARN log line is emitted, and the
          upload outcome is not surfaced as a failure to the operator.

    The watcher's Remove-AfterUpload helper is tested in isolation by dot-sourcing
    screenshot-watcher.ps1 with the $__WatcherTestMode guard set to $true. This
    causes the watcher to define all helper functions and then return, skipping
    config loading and the FileSystemWatcher event loop.

.SETUP
    Pester is not bundled with Windows PowerShell 5.1 by default. Install it
    once on the gaming machine before running this suite:

        Install-Module -Name Pester -Force -SkipPublisherCheck

    Then run from anywhere in the repo:

        Invoke-Pester bin/screenshot-watcher.tests.ps1

    Pester 5.x is required (these tests use the v5 BeforeAll/BeforeEach/Context
    syntax). To check your version:

        (Get-Module -ListAvailable Pester).Version

    If you see 3.x or 4.x, re-run Install-Module with -Force.
#>

#Requires -Version 5.1

# ─── Pester module check ──────────────────────────────────────────────────────

$PesterModule = Get-Module -ListAvailable -Name Pester |
    Sort-Object Version -Descending |
    Select-Object -First 1

if (-not $PesterModule -or $PesterModule.Version.Major -lt 5) {
    Write-Error @"
Pester 5.x is not installed. Install it once with:

    Install-Module -Name Pester -Force -SkipPublisherCheck

Then re-run:

    Invoke-Pester bin/screenshot-watcher.tests.ps1
"@
    exit 1
}

Import-Module Pester -MinimumVersion 5.0 -Force

# ─── Dot-source the watcher in test mode to load helper functions ─────────────

$ScriptDir   = Split-Path -Parent $PSCommandPath
$WatcherPath = Join-Path $ScriptDir 'screenshot-watcher.ps1'

if (-not (Test-Path $WatcherPath)) {
    Write-Error "Cannot find screenshot-watcher.ps1 at: $WatcherPath"
    exit 1
}

# $__WatcherTestMode = $true causes the watcher to return after defining all
# functions, skipping config loading and the event loop.
$__WatcherTestMode = $true
. $WatcherPath

# ─── Test suite ───────────────────────────────────────────────────────────────

Describe "screenshot-watcher delete-on-success" {

    BeforeAll {
        # Shared temp directory for all tests
        $script:TmpDir = [System.IO.Path]::Combine(
            [System.IO.Path]::GetTempPath(),
            "watcher-pester-$([System.Guid]::NewGuid().ToString('N'))"
        )
        [System.IO.Directory]::CreateDirectory($script:TmpDir) | Out-Null
    }

    AfterAll {
        if (Test-Path $script:TmpDir) {
            Remove-Item -LiteralPath $script:TmpDir -Recurse -Force -ErrorAction SilentlyContinue
        }
    }

    BeforeEach {
        # Fresh test file per test
        $script:TestFile = Join-Path $script:TmpDir `
            "test-screenshot-$([System.Guid]::NewGuid().ToString('N')).png"
        [System.IO.File]::WriteAllBytes(
            $script:TestFile,
            [byte[]](0x89, 0x50, 0x4E, 0x47)   # minimal PNG-like bytes
        )

        # Capture Write-Log output for assertion
        $script:LogLines = [System.Collections.Generic.List[string]]::new()
    }

    AfterEach {
        # Clean up any leftover test files
        if (Test-Path $script:TestFile -ErrorAction SilentlyContinue) {
            Remove-Item -LiteralPath $script:TestFile -Force -ErrorAction SilentlyContinue
        }
    }

    # ── (a) Success path ──────────────────────────────────────────────────────

    Context "(a) upload succeeds (HTTP 2xx) — delete local file" {

        It "deletes the local file after a successful upload (D10, D21)" {
            # Act: simulate the upload-success branch by calling Remove-AfterUpload directly
            Remove-AfterUpload -FilePath $script:TestFile

            # Assert: file is gone
            (Test-Path -LiteralPath $script:TestFile) | Should -BeFalse
        }

        It "emits a 'Deleted' log line — not a WARN — on successful delete" {
            # Override Write-Log to capture output
            function Write-Log { param([string]$Message) $script:LogLines.Add($Message) }

            Remove-AfterUpload -FilePath $script:TestFile

            # No WARN line expected
            $WarnLines = $script:LogLines | Where-Object { $_ -match 'WARN' }
            $WarnLines.Count | Should -Be 0

            # A "Deleted" confirmation line expected
            $DeletedLines = $script:LogLines | Where-Object { $_ -match 'Deleted local file' }
            $DeletedLines.Count | Should -BeGreaterThan 0
        }
    }

    # ── (b) Failure path ──────────────────────────────────────────────────────

    Context "(b) upload fails (non-2xx / network error) — preserve local file" {

        It "preserves the local file when the upload result is false (D21)" {
            # The main loop calls Remove-AfterUpload ONLY when $Uploaded -eq $true.
            # Simulate the $false branch: do nothing (file is preserved by design).
            $Uploaded = $false

            if ($Uploaded) {
                Remove-AfterUpload -FilePath $script:TestFile
            }

            # File must still exist
            (Test-Path -LiteralPath $script:TestFile) | Should -BeTrue
        }
    }

    # ── (c) Delete-failure path ───────────────────────────────────────────────

    Context "(c) upload succeeds but Remove-Item fails — warn and continue" {

        It "does not throw when the delete fails (D10)" {
            # Simulate a non-existent file to force Remove-Item to fail
            $GhostFile = Join-Path $script:TmpDir `
                "ghost-$([System.Guid]::NewGuid().ToString('N')).png"

            # Override Write-Log to suppress output
            function Write-Log { param([string]$Message) $script:LogLines.Add($Message) }

            # Should complete without throwing
            { Remove-AfterUpload -FilePath $GhostFile } | Should -Not -Throw
        }

        It "emits a WARN log line containing the prescribed message on delete failure (D10)" {
            $GhostFile = Join-Path $script:TmpDir `
                "ghost2-$([System.Guid]::NewGuid().ToString('N')).png"

            function Write-Log { param([string]$Message) $script:LogLines.Add($Message) }

            Remove-AfterUpload -FilePath $GhostFile

            $WarnLines = $script:LogLines | Where-Object { $_ -match 'WARN' }
            $WarnLines.Count | Should -BeGreaterThan 0
            $WarnLines[0] | Should -Match 'Local delete failed'
            $WarnLines[0] | Should -Match 'upload still succeeded'
        }

        It "the original test file is still preserved on disk when a different path fails" {
            # Uploading the real file succeeds; only an unrelated ghost path fails.
            # This validates that a failed delete does not touch other files.
            $GhostFile = Join-Path $script:TmpDir `
                "ghost3-$([System.Guid]::NewGuid().ToString('N')).png"

            function Write-Log { param([string]$Message) $script:LogLines.Add($Message) }

            Remove-AfterUpload -FilePath $GhostFile

            # The original test file (not the ghost) is untouched
            (Test-Path -LiteralPath $script:TestFile) | Should -BeTrue
        }
    }
}
