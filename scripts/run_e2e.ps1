param([string]$VideoPath)
$ErrorActionPreference = 'Stop'
$taskRepo = Split-Path -Parent $PSScriptRoot
$taskArtifacts = Join-Path $taskRepo '.local-test-artifacts'
$taskFixture = Join-Path $taskArtifacts 'e2e-fixture.json'
if (-not $VideoPath) { $VideoPath = Join-Path $taskArtifacts 'e2e-video.mp4' }
if (-not (Test-Path -LiteralPath $VideoPath -PathType Leaf)) {
    throw 'Supply -VideoPath with a small valid MP4 clip. See README for the E2E setup.'
}
Set-Location -LiteralPath $taskRepo
New-Item -ItemType Directory -Path $taskArtifacts -Force | Out-Null
$taskCreated = $false
try {
    docker compose cp $VideoPath backend:/tmp/e2e-video.mp4
    if ($LASTEXITCODE -ne 0) { throw 'Could not copy test video' }
    docker compose exec -T backend python -m scripts.learning_smoke --video /tmp/e2e-video.mp4 --keep-fixture /tmp/e2e-fixture.json
    if ($LASTEXITCODE -ne 0) { throw 'Could not create E2E fixture' }
    $taskCreated = $true
    docker compose cp backend:/tmp/e2e-fixture.json $taskFixture
    if ($LASTEXITCODE -ne 0) { throw 'Could not read E2E fixture' }
    $env:PLAYWRIGHT_BROWSERS_PATH = Join-Path $taskArtifacts 'browsers'
    Set-Location -LiteralPath (Join-Path $taskRepo 'frontend')
    npm run test:e2e
    if ($LASTEXITCODE -ne 0) { throw 'Browser E2E failed' }
} finally {
    Set-Location -LiteralPath $taskRepo
    if ($taskCreated) {
        docker compose exec -T backend python -m scripts.learning_smoke --cleanup /tmp/e2e-fixture.json
        if ($LASTEXITCODE -ne 0) { Write-Warning 'Temporary fixture cleanup failed; retry the cleanup command from README.' }
        elseif (Test-Path -LiteralPath $taskFixture) { Remove-Item -LiteralPath $taskFixture }
    }
}
