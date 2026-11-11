param(
    [string]$VideoPath,
    [string]$ComposeProject,
    [string]$ComposeFile,
    [string]$Profile,
    [string]$BackendService = 'backend',
    [string]$MailpitUrl = 'http://localhost:8025',
    [string]$BrowserImage,
    [string[]]$TestFiles
)
# Windows PowerShell treats Docker progress on stderr as an ErrorRecord when
# redirected. Native command success is determined by LASTEXITCODE below.
$ErrorActionPreference = 'Continue'
$taskRepo = Split-Path -Parent $PSScriptRoot
if ($BrowserImage -and [Environment]::OSVersion.Platform -ne [PlatformID]::Unix) {
    throw 'BrowserImage uses Linux host networking; omit it on Windows.'
}
$taskArtifacts = Join-Path $taskRepo '.local-test-artifacts'
$taskFixture = Join-Path $taskArtifacts 'e2e-fixture.json'
if (-not $VideoPath) { $VideoPath = Join-Path $taskArtifacts 'e2e-video.mp4' }
if (-not (Test-Path -LiteralPath $VideoPath -PathType Leaf)) {
    throw 'Supply -VideoPath with a small valid MP4 clip. See README for the E2E setup.'
}
$taskCompose = @('compose')
if ($ComposeProject) { $taskCompose += @('-p', $ComposeProject) }
if ($ComposeFile) { $taskCompose += @('-f', $ComposeFile) }
if ($Profile) { $taskCompose += @('--profile', $Profile) }
$taskPreviousPassword = $env:RSL_E2E_PASSWORD
$taskPreviousMailpitUrl = $env:RSL_E2E_MAILPIT_URL
$taskPreviousBrowsers = $env:PLAYWRIGHT_BROWSERS_PATH
$taskCreated = $false
$taskFailed = $false
Set-Location -LiteralPath $taskRepo
New-Item -ItemType Directory -Path $taskArtifacts -Force | Out-Null
try {
    # Random per run; inherited by child processes, never persisted in artifacts.
    $env:RSL_E2E_PASSWORD = [guid]::NewGuid().ToString('N') + 'aA1'
    $env:RSL_E2E_MAILPIT_URL = $MailpitUrl
    docker @taskCompose cp $VideoPath "${BackendService}:/tmp/e2e-video.mp4"
    if ($LASTEXITCODE -ne 0) { throw 'Could not copy test video' }
    docker @taskCompose exec -T -e RSL_E2E_PASSWORD $BackendService python -m scripts.learning_smoke --video /tmp/e2e-video.mp4 --keep-fixture /tmp/e2e-fixture.json
    if ($LASTEXITCODE -ne 0) { throw 'Could not create E2E fixture' }
    $taskCreated = $true
    docker @taskCompose exec -T $BackendService python -m scripts.learning_smoke --validate-fixture /tmp/e2e-fixture.json
    if ($LASTEXITCODE -ne 0) { throw 'E2E manifest must contain only noncredential identifiers' }
    docker @taskCompose cp "${BackendService}:/tmp/e2e-fixture.json" $taskFixture
    if ($LASTEXITCODE -ne 0) { throw 'Could not read noncredential E2E manifest' }
    $taskPublic = Get-Content -LiteralPath $taskFixture -Raw -ErrorAction Stop | ConvertFrom-Json -ErrorAction Stop
    if ($taskPublic.PSObject.Properties.Name -contains 'password' -or $taskPublic.PSObject.Properties.Name -contains 'email') {
        throw 'Refusing a credential-bearing E2E manifest; rebuild backend first'
    }
    if (-not $env:PLAYWRIGHT_BROWSERS_PATH) { $env:PLAYWRIGHT_BROWSERS_PATH = Join-Path $taskArtifacts 'browsers' }
    Set-Location -LiteralPath (Join-Path $taskRepo 'frontend')
    if ($BrowserImage) {
        docker run --rm --network host --ipc=host --env RSL_E2E_PASSWORD --env RSL_E2E_MAILPIT_URL --env PLAYWRIGHT_CONSOLE_USER --env PLAYWRIGHT_CONSOLE_PASSWORD --env CI --env PLAYWRIGHT_BROWSERS_PATH=/ms-playwright --volume "${taskRepo}:/workspace" --workdir /workspace/frontend $BrowserImage npx playwright test @TestFiles
    } else {
        npx playwright test @TestFiles
    }
    if ($LASTEXITCODE -ne 0) { throw 'Browser E2E failed' }
} catch {
    $taskFailed = $true
    throw
} finally {
    Set-Location -LiteralPath $taskRepo
    $env:RSL_E2E_PASSWORD = $taskPreviousPassword
    $env:RSL_E2E_MAILPIT_URL = $taskPreviousMailpitUrl
    $env:PLAYWRIGHT_BROWSERS_PATH = $taskPreviousBrowsers
    if ($taskCreated) {
        docker @taskCompose exec -T $BackendService python -m scripts.learning_smoke --cleanup /tmp/e2e-fixture.json
        if ($LASTEXITCODE -ne 0) { throw 'Temporary fixture cleanup failed; retry the cleanup command from README.' }
        elseif (Test-Path -LiteralPath $taskFixture) { Remove-Item -LiteralPath $taskFixture }
    }
    # Cleanup may succeed after a failed child process. Keep the failure visible
    # to callers that inspect LASTEXITCODE, including GitHub's pwsh wrapper.
    if ($taskFailed) { $global:LASTEXITCODE = 1 }
}
