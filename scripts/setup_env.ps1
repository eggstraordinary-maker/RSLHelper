# Create a local Docker configuration from the published examples. Never overwrite env.
[CmdletBinding()]
param([string]$ProjectRoot = (Split-Path -Parent $PSScriptRoot))

$ErrorActionPreference = 'Stop'
$ProjectRoot = (Resolve-Path -LiteralPath $ProjectRoot).Path
$coreFiles = @('backend/.env', 'postgres/.env', 'seaweedfs/.env', 'seaweedfs/.env.admin')
$existing = @($coreFiles | Where-Object { Test-Path -LiteralPath (Join-Path $ProjectRoot $_) })
if ($existing.Count -gt 0 -and $existing.Count -lt $coreFiles.Count) {
    throw 'Partial env setup found. Existing files were preserved. Restore missing files from examples and keep database/S3 credentials consistent; see README.'
}

function New-LocalSecret([int]$Bytes = 32) {
    $buffer = New-Object byte[] $Bytes
    $generator = [Security.Cryptography.RandomNumberGenerator]::Create()
    try { $generator.GetBytes($buffer) } finally { $generator.Dispose() }
    return ([BitConverter]::ToString($buffer)).Replace('-', '').ToLowerInvariant()
}

function Set-EnvValue([string]$Text, [string]$Key, [string]$Value) {
    $pattern = '(?m)^' + [regex]::Escape($Key) + '=[^\r\n]*'
    if ([regex]::Matches($Text, $pattern).Count -ne 1) {
        throw "Invalid example field: $Key. No environment files were written."
    }
    return [regex]::Replace($Text, $pattern, ($Key + '=' + $Value))
}

$prepared = [ordered]@{}
if ($existing.Count -eq 0) {
    foreach ($name in $coreFiles) {
        $prepared[$name] = [IO.File]::ReadAllText((Join-Path $ProjectRoot ($name + '.example')))
    }
    $databasePassword = New-LocalSecret
    $accessKey = New-LocalSecret -Bytes 16
    $storageSecret = New-LocalSecret
    $databaseUser = [regex]::Match($prepared['postgres/.env'], '(?m)^POSTGRES_USER=([^\r\n]+)').Groups[1].Value
    $databaseName = [regex]::Match($prepared['postgres/.env'], '(?m)^POSTGRES_DB=([^\r\n]+)').Groups[1].Value
    if (-not $databaseUser -or -not $databaseName) { throw 'Database example fields missing. No environment files were written.' }
    $encodedUser = [Uri]::EscapeDataString($databaseUser)
    $encodedName = [Uri]::EscapeDataString($databaseName)
    $databaseTarget = "${encodedUser}:${databasePassword}@postgres:5432/${encodedName}"
    $prepared['postgres/.env'] = Set-EnvValue $prepared['postgres/.env'] 'POSTGRES_PASSWORD' $databasePassword
    $prepared['backend/.env'] = Set-EnvValue $prepared['backend/.env'] 'DATABASE_URL' "postgresql://${databaseTarget}"
    $prepared['backend/.env'] = Set-EnvValue $prepared['backend/.env'] 'DATABASE_URL_ASYNC' "postgresql+asyncpg://${databaseTarget}"
    $prepared['backend/.env'] = Set-EnvValue $prepared['backend/.env'] 'SECRET_KEY' (New-LocalSecret)
    foreach ($name in @('backend/.env', 'seaweedfs/.env')) {
        $prepared[$name] = Set-EnvValue $prepared[$name] 'AWS_ACCESS_KEY_ID' $accessKey
        $prepared[$name] = Set-EnvValue $prepared[$name] 'AWS_SECRET_ACCESS_KEY' $storageSecret
    }
    $prepared['seaweedfs/.env.admin'] = Set-EnvValue $prepared['seaweedfs/.env.admin'] 'WEED_ADMIN_PASSWORD' (New-LocalSecret)
}

# Vite uses this file outside Docker. Compose already supplies its local defaults.
if (-not (Test-Path -LiteralPath (Join-Path $ProjectRoot 'frontend/.env'))) {
    $prepared['frontend/.env'] = [IO.File]::ReadAllText((Join-Path $ProjectRoot 'frontend/.env.example'))
}

$encoding = New-Object System.Text.UTF8Encoding($false)
foreach ($name in $prepared.Keys) {
    $path = Join-Path $ProjectRoot $name
    # CreateNew also protects a file created by another process after preflight.
    $stream = [IO.File]::Open($path, [IO.FileMode]::CreateNew, [IO.FileAccess]::Write)
    try {
        $bytes = $encoding.GetBytes($prepared[$name])
        $stream.Write($bytes, 0, $bytes.Length)
    } finally { $stream.Dispose() }
}
Write-Output ('Created {0} env files. Existing files were preserved.' -f $prepared.Count)
Write-Output 'Set SMTP_USER, SMTP_PASSWORD and EMAIL_FROM in backend/.env for real mail, or use the documented Mailpit overlay.'
