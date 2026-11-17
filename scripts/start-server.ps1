# Runs the DueOra backend on this PC with SQLite and makes it reachable from phones through a free
# Cloudflare tunnel. The tunnel address changes on every start, so the script publishes it to
# docs/api.json in the GitHub repo; the app reads that file to find the server.
#
# Usage (from the repo root):  powershell -ExecutionPolicy Bypass -File scripts\start-server.ps1
# Stop with Ctrl+C. Keep this PC on and online: reminders are only sent while the server runs.

$ErrorActionPreference = 'Stop'
$Repo = Split-Path -Parent $PSScriptRoot
$Backend = Join-Path $Repo 'backend'
# Outside OneDrive on purpose: syncing a live SQLite file corrupts it and makes writes slow.
$Data = Join-Path $env:USERPROFILE 'DueOraServer'
$EnvFile = Join-Path $Data 'server.env'
$Logs = Join-Path $Data 'logs'
$Backups = Join-Path $Data 'backups'
$Cloudflared = Join-Path $env:LOCALAPPDATA 'cloudflared\cloudflared.exe'
$Port = 4000

New-Item -ItemType Directory -Force $Data, $Logs, $Backups | Out-Null

function New-Secret { node -e "process.stdout.write(require('crypto').randomBytes(48).toString('base64url'))" }

if (-not (Test-Path $EnvFile)) {
  $db = (Join-Path $Data 'dueora.db') -replace '\\', '/'
  $lines = @(
    '# DueOra server settings. Keep this file private and backed up.',
    '# ACCOUNT_REF_SECRET must never change once real data exists.',
    'NODE_ENV=production',
    "PORT=$Port",
    'RUN_WORKER_IN_API=true',
    "DATABASE_URL=file:$db",
    "JWT_ACCESS_SECRET=$(New-Secret)",
    "ACCOUNT_REF_SECRET=$(New-Secret)",
    'APP_URL=dueora://',
    'LOG_LEVEL=info',
    '# Optional - fill in when you have them:',
    'RESEND_API_KEY=',
    'EMAIL_FROM=',
    'GEMINI_API_KEY=',
    'EXPO_ACCESS_TOKEN=',
    'SENTRY_DSN='
  )
  [IO.File]::WriteAllLines($EnvFile, $lines)
  Write-Host "Created $EnvFile with new secrets."
}

foreach ($line in [IO.File]::ReadAllLines($EnvFile)) {
  if ($line -match '^\s*([A-Z0-9_]+)=(.*)$' -and $Matches[2] -ne '') {
    [Environment]::SetEnvironmentVariable($Matches[1], $Matches[2].Trim('"'), 'Process')
  }
}

# Daily backup, keep the last 14.
$dbFile = Join-Path $Data 'dueora.db'
if (Test-Path $dbFile) {
  $stamp = Get-Date -Format 'yyyy-MM-dd'
  $target = Join-Path $Backups "dueora-$stamp.db"
  if (-not (Test-Path $target)) { Copy-Item $dbFile $target }
  Get-ChildItem $Backups -Filter 'dueora-*.db' | Sort-Object Name -Descending | Select-Object -Skip 14 | Remove-Item
}

if (-not (Test-Path $Cloudflared)) { throw "cloudflared not found at $Cloudflared" }
if (-not (Test-Path (Join-Path $Backend 'dist\server.js'))) {
  Write-Host 'Building the backend...'
  Push-Location $Backend; npm run build; Pop-Location
}

Write-Host 'Starting the tunnel...'
$tunnelLog = Join-Path $Logs 'tunnel.log'
Remove-Item $tunnelLog -ErrorAction SilentlyContinue
$tunnel = Start-Process -FilePath $Cloudflared -ArgumentList @('tunnel', '--no-autoupdate', '--url', "http://localhost:$Port", '--logfile', $tunnelLog) -WindowStyle Hidden -PassThru

$url = $null
for ($i = 0; $i -lt 60 -and -not $url; $i++) {
  Start-Sleep -Seconds 1
  if (Test-Path $tunnelLog) {
    $m = Select-String -Path $tunnelLog -Pattern 'https://[a-z0-9-]+\.trycloudflare\.com' | Select-Object -First 1
    if ($m) { $url = $m.Matches[0].Value }
  }
}
if (-not $url) { Stop-Process -Id $tunnel.Id -ErrorAction SilentlyContinue; throw "The tunnel did not start; see $tunnelLog" }
Write-Host "Public address: $url"
$env:API_BASE_URL = $url

Write-Host 'Applying database migrations...'
Push-Location $Backend
npx prisma migrate deploy
Pop-Location

# git and node write progress to stderr; with 2>&1 PowerShell 5.1 would treat that as fatal.
$ErrorActionPreference = 'Continue'

# Publish the address for the app (only this file is committed).
$apiJson = Join-Path $Repo 'docs\api.json'
$updated = (Get-Date).ToUniversalTime().ToString('yyyy-MM-ddTHH:mm:ssZ')
[IO.File]::WriteAllText($apiJson, "{`n  `"apiUrl`": `"$url`",`n  `"updatedAt`": `"$updated`"`n}`n")
Push-Location $Repo
git add docs/api.json
git commit --only docs/api.json -m "chore: server address $updated [skip ci]" | Out-Null
git push origin HEAD:main 2>&1 | Out-Null
if ($LASTEXITCODE -ne 0) { Write-Warning 'Could not push docs/api.json; phones keep the previous address until it is pushed.' }
Pop-Location

Write-Host "DueOra API running at $url  (Ctrl+C to stop)"
try {
  # Run from the data folder so the dev backend/.env is not loaded into production.
  Push-Location $Data
  node (Join-Path $Backend 'dist\server.js') 2>&1 | Tee-Object -FilePath (Join-Path $Logs 'server.log') -Append
} finally {
  Pop-Location
  Stop-Process -Id $tunnel.Id -ErrorAction SilentlyContinue
}
