# 部署并校验
#
# 为什么需要这个脚本：上一次部署后没有校验 DSH 实际加载的文件，结果装的是
# 旧版本而无人察觉。安装成功 ≠ 加载的是新代码，所以这里在安装后读取
# profile 里那份文件，核对指纹，并打印 DSH 进程的启动时间供人工确认是否需要
# 重启。
#
# 用法：
#   pwsh -File .market\deploy.ps1
#
# ASCII only on purpose: Windows PowerShell reads .ps1 as the ANSI codepage
# unless the file carries a BOM, and a mis-decoded string is a syntax error.

param(
  [string]$Profile = 'E:\AI agent\DeepseekHarness\dsh-data\.dsh\profiles\desktop'
)

$ErrorActionPreference = 'Continue'
$node = 'E:\node\nodejs\node.exe'
$pnpm = 'E:\AI agent\DeepseekHarness\resources\runtime\pnpm\bin\pnpm.cjs'
$repo = Split-Path -Parent $PSScriptRoot

Write-Host '--- 1) install from GitHub ---' -ForegroundColor Cyan
Set-Location $Profile
& $node $pnpm add 'github:star-Cosmo/dsh-model-tidy' 2>&1 | Select-Object -Last 4

$installed = Join-Path $Profile 'node_modules\dsh-model-tidy\lib\client.js'
if (-not (Test-Path $installed)) {
  Write-Host "FAIL: $installed not found" -ForegroundColor Red
  exit 1
}

Write-Host ''
Write-Host '--- 2) fingerprint the installed file ---' -ForegroundColor Cyan
$info = Get-Item $installed
Write-Host ("  size: {0} bytes" -f $info.Length)
Write-Host ("  mtime: {0}" -f $info.LastWriteTime)
Write-Host ("  sha256: {0}" -f (Get-FileHash $installed -Algorithm SHA256).Hash)

# The local checkout, for comparison: the deploy is only correct if the profile
# holds the same bytes as the repo being shipped.
$local = Join-Path $repo 'lib\client.js'
if (Test-Path $local) {
  $localHash = (Get-FileHash $local -Algorithm SHA256).Hash
  $installedHash = (Get-FileHash $installed -Algorithm SHA256).Hash
  if ($localHash -eq $installedHash) {
    Write-Host '  matches local checkout: YES' -ForegroundColor Green
  } else {
    Write-Host '  matches local checkout: NO  <-- profile is NOT the current code' -ForegroundColor Red
    Write-Host "    local:     $localHash"
    Write-Host "    installed: $installedHash"
  }
}

Write-Host ''
Write-Host '--- 3) markers that prove the new build is in place ---' -ForegroundColor Cyan
$src = Get-Content $installed -Raw
$ok = $true
$checks = @(
  @{ label = 'has Switch control';    pass = $src.Contains('dsh-mt-switch') },
  @{ label = 'has provider cards';    pass = $src.Contains('dsh-mt-card') },
  @{ label = 'has star link';         pass = $src.Contains('dsh-mt-star') },
  @{ label = 'reads list from form';  pass = $src.Contains('this.hiddenEntries()') },
  @{ label = 'no stale store.rows';   pass = -not $src.Contains('store.rows') }
)
foreach ($c in $checks) {
  $colour = if ($c.pass) { 'Green' } else { 'Red' }
  Write-Host ("  [{0}] {1}" -f $(if ($c.pass) { 'OK' } else { '!!' }), $c.label) -ForegroundColor $colour
  if (-not $c.pass) { $ok = $false }
}

# A profile holding different bytes than the checkout is the failure this script
# exists to catch, so it has to affect the verdict too.
if ((Test-Path $local) -and ((Get-FileHash $local -Algorithm SHA256).Hash -ne (Get-FileHash $installed -Algorithm SHA256).Hash)) {
  $ok = $false
}

Write-Host ''
Write-Host '--- 4) does DSH need a restart? ---' -ForegroundColor Cyan
$main = Get-Process -Name 'DeepSeek Harness' -ErrorAction SilentlyContinue |
  Sort-Object StartTime | Select-Object -First 1
if ($null -eq $main) {
  Write-Host '  DSH is not running'
} else {
  Write-Host ("  DSH started: {0}" -f $main.StartTime)
  Write-Host ("  file mtime:  {0}" -f $info.LastWriteTime)
  if ($main.StartTime -gt $info.LastWriteTime) {
    Write-Host '  the running process started AFTER this file was written -> already loaded' -ForegroundColor Green
  } else {
    Write-Host '  the running process predates this file -> RESTART DSH for it to take effect' -ForegroundColor Yellow
  }
}

Write-Host ''
if ($ok) {
  Write-Host 'deploy: checks passed' -ForegroundColor Green
} else {
  Write-Host 'deploy: SOME CHECKS FAILED - do not trust this install' -ForegroundColor Red
  exit 1
}
