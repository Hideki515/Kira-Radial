# Baixa o msedgedriver da MESMA versao do WebView2 instalado (necessario para os testes E2E).
# Fonte oficial da Microsoft. Destino: tools/edgedriver/<versao>/msedgedriver.exe (ignorado pelo git).
# Uso: pwsh -NoProfile -File scripts/get-edgedriver.ps1   (imprime o caminho do driver)
$ErrorActionPreference = "Stop"
$guid = "{F3017226-FE2A-4295-8BDF-00C3A9A7E4C5}"
$version = $null
foreach ($k in "HKLM:\SOFTWARE\WOW6432Node\Microsoft\EdgeUpdate\Clients\$guid", "HKLM:\SOFTWARE\Microsoft\EdgeUpdate\Clients\$guid", "HKCU:\Software\Microsoft\EdgeUpdate\Clients\$guid") {
  $v = (Get-ItemProperty $k -Name pv -ErrorAction SilentlyContinue).pv
  if ($v -and $v -ne "0.0.0.0") { $version = $v; break }
}
if (-not $version) { Write-Error "WebView2 nao encontrado." }

$root = Split-Path -Parent $PSScriptRoot
$dir = Join-Path $root "tools\edgedriver\$version"
$exe = Join-Path $dir "msedgedriver.exe"
if (Test-Path $exe) { Write-Output $exe; exit 0 }

New-Item -ItemType Directory -Force $dir | Out-Null
$zip = Join-Path $dir "edgedriver_win64.zip"
$urls = @(
  "https://msedgedriver.microsoft.com/$version/edgedriver_win64.zip",
  "https://msedgedriver.azureedge.net/$version/edgedriver_win64.zip"
)
$ok = $false
foreach ($u in $urls) {
  try { Invoke-WebRequest -Uri $u -OutFile $zip -UseBasicParsing; $ok = $true; break } catch { Write-Host "falhou: $u" }
}
if (-not $ok) { Write-Error "Nao foi possivel baixar o msedgedriver $version." }
Expand-Archive -Path $zip -DestinationPath $dir -Force
Remove-Item $zip
if (-not (Test-Path $exe)) { Write-Error "msedgedriver.exe nao veio no pacote." }
Write-Output $exe
