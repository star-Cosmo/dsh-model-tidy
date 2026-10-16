# Publish dsh-model-tidy to npm.
#
# Usage:
#   npm login --registry=https://registry.npmjs.org/
#   pwsh -File .market\publish.ps1
#
# Credentials live in the user-level .npmrc; this script never asks for them.
# ASCII only, on purpose: Windows PowerShell reads .ps1 as the ANSI codepage
# unless the file carries a BOM, and a mis-decoded string is a syntax error.

$ErrorActionPreference = 'Stop'
$node = 'E:\node\nodejs\node.exe'
$npmcli = 'E:\node\nodejs\node_modules\npm\bin\npm-cli.js'
$registry = 'https://registry.npmjs.org/'

$repo = Split-Path -Parent $PSScriptRoot
Set-Location $repo

Write-Host '--- 1) whoami ---' -ForegroundColor Cyan
$who = & $node $npmcli whoami --registry=$registry 2>&1
if ($LASTEXITCODE -ne 0) {
  Write-Host "not logged in: $who" -ForegroundColor Red
  Write-Host "run first: npm login --registry=$registry" -ForegroundColor Yellow
  exit 1
}
Write-Host "logged in as: $who" -ForegroundColor Green

Write-Host ''
Write-Host '--- 2) package name ---' -ForegroundColor Cyan
$pkgName = (Get-Content 'package.json' -Raw | ConvertFrom-Json).name
$exists = & curl.exe -s -o NUL -w '%{http_code}' --max-time 20 "https://registry.npmjs.org/$pkgName"
if ($exists -eq '200') {
  Write-Host "warning: $pkgName already exists on the registry" -ForegroundColor Yellow
  Write-Host 'if you published it before, bump the version first' -ForegroundColor Yellow
} else {
  Write-Host "$pkgName is free (HTTP $exists)" -ForegroundColor Green
}

Write-Host ''
Write-Host '--- 3) pack dry run ---' -ForegroundColor Cyan
$json = & $node $npmcli pack --dry-run --json 2>&1 | Out-String
try {
  $packed = $json | ConvertFrom-Json
  foreach ($f in $packed[0].files) { Write-Host ('  {0,8}  {1}' -f $f.size, $f.path) }
  Write-Host "  total $($packed[0].entryCount) files"
} catch {
  Write-Host $json
}

Write-Host ''
Write-Host '--- 4) publish ---' -ForegroundColor Cyan
& $node $npmcli publish --registry=$registry --access public 2>&1
if ($LASTEXITCODE -ne 0) {
  Write-Host 'publish failed, see output above' -ForegroundColor Red
  exit 1
}

Write-Host ''
Write-Host '--- 5) verify ---' -ForegroundColor Cyan
Start-Sleep -Seconds 5
& $node $npmcli view $pkgName version --registry=$registry 2>&1

Write-Host ''
Write-Host 'done. install with:' -ForegroundColor Green
Write-Host "  dsh plugin --profile desktop add $pkgName"
