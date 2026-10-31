# Collects the two Neon connection strings without showing them, validates them, and saves them to
# .env.neon.local (gitignored) for scripts/neon.mjs. Nothing is printed, nothing goes to .env.
#
#   powershell -ExecutionPolicy Bypass -File scripts\neon-env.ps1
#
# In the Neon console: your project > Connect > branch "production", database "neondb", role (owner).
#   1. Turn "Connection pooling" ON  -> copy the string (host contains "-pooler")  -> first prompt
#   2. Turn "Connection pooling" OFF -> copy the string (no "-pooler")              -> second prompt
# Copy only the connection string that starts with postgresql:// (not the "psql '...'" snippet).

$ErrorActionPreference = 'Stop'
Set-Location (Split-Path -Parent $PSScriptRoot)
$file = '.env.neon.local'

git check-ignore -q $file
if ($LASTEXITCODE -ne 0) { Write-Host "Refusing: $file is not gitignored." -ForegroundColor Red; exit 1 }
if (Test-Path $file) {
  $answer = Read-Host "$file already exists. Replace it? (y/N)"
  if ($answer -notin @('y', 'Y', 'yes')) { Write-Host 'Kept the existing file.'; exit 0 }
}

function Read-ConnectionString([string]$prompt) {
  $secure = Read-Host -Prompt $prompt -AsSecureString
  # Convert the SecureString to text correctly. Assigning a SecureString to $env: directly stores the
  # literal "System.Security.SecureString" – the cause of Prisma P1013 ("scheme is not recognized").
  return [System.Net.NetworkCredential]::new('', $secure).Password
}

$pooled = Read-ConnectionString 'POOLED connection string (pooling ON, host contains -pooler)'
$direct = Read-ConnectionString 'DIRECT connection string (pooling OFF, no -pooler)'

# Validate in a child process; only this script's process sees the values.
$env:DATABASE_URL = $pooled
$env:DIRECT_URL = $direct
node scripts/neon.mjs validate --from-env
$ok = ($LASTEXITCODE -eq 0)
Remove-Item Env:DATABASE_URL, Env:DIRECT_URL -ErrorAction SilentlyContinue

if (-not $ok) {
  Write-Host 'Not saved. Fix the problem above and run this script again.' -ForegroundColor Red
  exit 1
}
$content = "DATABASE_URL=`"$pooled`"`nDIRECT_URL=`"$direct`"`n"
[System.IO.File]::WriteAllText((Join-Path (Get-Location) $file), $content, (New-Object System.Text.UTF8Encoding $false))
$pooled = $null; $direct = $null
Write-Host "Saved $file (gitignored, never printed). Delete it after setup with: Remove-Item $file" -ForegroundColor Green
