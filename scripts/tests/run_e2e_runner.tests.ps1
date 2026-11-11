# Exercise the runner lifecycle without Docker, network or real credentials.
$ErrorActionPreference = 'Stop'
$taskRepo = Split-Path -Parent (Split-Path -Parent $PSScriptRoot)
$taskArtifacts = Join-Path $taskRepo '.local-test-artifacts'
$taskManifest = Join-Path $taskArtifacts 'e2e-fixture.json'
$taskVideo = Join-Path $taskArtifacts 'runner-test-video.mp4'
if ((Test-Path $taskManifest) -or (Test-Path $taskVideo)) { throw 'Test fixture paths are already occupied' }
New-Item -ItemType Directory -Force $taskArtifacts | Out-Null
$global:RslRunnerTestState = @{ manifest=$taskManifest; code=0; cleanup=$false; container=$false }
function docker {
    $state = $global:RslRunnerTestState
    $global:LASTEXITCODE = 0
    if ($args[0] -eq 'run') {
        $state.container = $true
        $global:LASTEXITCODE = $state.code
    } elseif (($args -contains 'cp') -and $args[-1] -eq $state.manifest) {
        '{"run_id":"runner-test","user_id":1,"lesson_ids":[],"objects":[]}' | Set-Content -LiteralPath $state.manifest
    } elseif ($args -contains '--cleanup') {
        $state.cleanup = $true
    }
}
function npx { $global:LASTEXITCODE = $global:RslRunnerTestState.code }
try {
    [IO.File]::WriteAllText($taskVideo, 'synthetic runner input')
    $cases = @(@{code=7; container=$false}, @{code=0; container=$false})
    if ([Environment]::OSVersion.Platform -eq [PlatformID]::Unix) { $cases += @{code=7; container=$true} }
    foreach ($case in $cases) {
        $global:RslRunnerTestState.code = $case.code
        $global:RslRunnerTestState.cleanup = $false
        $global:RslRunnerTestState.container = $false
        $caught = $false
        $options = @{ VideoPath=$taskVideo }
        if ($case.container) { $options.BrowserImage = 'mcr.microsoft.com/playwright:v1.65.0-noble' }
        try { & (Join-Path $taskRepo 'scripts/run_e2e.ps1') @options }
        catch { $caught = $true }
        $outcome = $LASTEXITCODE
        if (($caught -ne ($case.code -ne 0)) -or (($outcome -ne 0) -ne ($case.code -ne 0))) {
            throw 'Runner lost the child process outcome during cleanup'
        }
        if (-not $global:RslRunnerTestState.cleanup -or (Test-Path $taskManifest)) { throw 'Scoped cleanup did not complete' }
        if ($global:RslRunnerTestState.container -ne $case.container) { throw 'Wrong browser execution path' }
    }
    Write-Output 'Runner success, nonzero failure and cleanup regressions passed'
} finally {
    if (Test-Path $taskVideo) { Remove-Item -LiteralPath $taskVideo }
    if (Test-Path $taskManifest) { Remove-Item -LiteralPath $taskManifest }
    Remove-Variable -Name RslRunnerTestState -Scope Global
}
exit 0
