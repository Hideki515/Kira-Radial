# Mede o consumo da "Kira de teste" parada (todas as janelas escondidas): CPU de toda a
# árvore de processos (kira-radial + WebView2) durante N segundos.
# Uso: pwsh -NoProfile -File scripts/idle-cpu-qa.ps1 [-Mode hotkey|orb] [-Seconds 15] [-MaxPercent 5]
#   -Mode hotkey (padrão): nada visível — mede o custo das janelas escondidas.
#   -Mode orb: só o ícone flutuante visível (fora da tela).
# Ajusta `launcher.mode` na config da Kira de teste (%APPDATA%\Kira-Radial-QA — nunca a do usuário).
# Sai com 1 se passar do limite (% de UM núcleo). Só abre/encerra a própria Kira de teste.
param([ValidateSet('hotkey', 'orb')][string]$Mode = 'hotkey', [int]$Seconds = 15, [double]$MaxPercent = 5, [int]$Warmup = 8)

$ErrorActionPreference = 'Stop'
$exe = Join-Path $PSScriptRoot '..\src-tauri\target-qa\release\kira-radial.exe'
if (-not (Test-Path $exe)) { Write-Error "Kira de teste não encontrada: rode 'npm run build:qa'"; exit 1 }
$cfgPath = Join-Path $env:APPDATA 'Kira-Radial-QA\config.json'
if (Test-Path $cfgPath) {
  $cfg = Get-Content $cfgPath -Raw | ConvertFrom-Json
  if ($cfg.launcher.mode -ne $Mode) {
    $cfg.launcher.mode = $Mode
    $cfg | ConvertTo-Json -Depth 32 | Set-Content $cfgPath -Encoding utf8
  }
}

$p = Start-Process $exe -PassThru
try {
  Start-Sleep -Seconds $Warmup
  $all = Get-CimInstance Win32_Process
  $ids = [System.Collections.Generic.List[int]]::new(); $ids.Add($p.Id)
  $changed = $true
  while ($changed) {
    $changed = $false
    foreach ($x in $all) {
      if ($ids.Contains([int]$x.ParentProcessId) -and -not $ids.Contains([int]$x.ProcessId)) { $ids.Add([int]$x.ProcessId); $changed = $true }
    }
  }
  $before = @{}
  Get-Process -Id $ids -ErrorAction SilentlyContinue | ForEach-Object { $before[$_.Id] = $_.TotalProcessorTime.TotalSeconds }
  Start-Sleep -Seconds $Seconds
  $cpu = 0.0; $mem = 0
  foreach ($q in Get-Process -Id $ids -ErrorAction SilentlyContinue) {
    $d = $q.TotalProcessorTime.TotalSeconds - $before[$q.Id]
    $cpu += $d; $mem += $q.WorkingSet64
    $type = (($all | Where-Object ProcessId -eq $q.Id).CommandLine -replace '.*--type=(\S+).*', '$1')
    if ($type -notmatch '^[a-z-]+$') { $type = 'principal' }
    '{0,-16} {1,-18} {2,5} MB  CPU {3:N2}s' -f $q.ProcessName, $type, [math]::Round($q.WorkingSet64 / 1MB), $d
  }
  $pct = $cpu / $Seconds * 100
  'TOTAL: {0:N2}% de um núcleo em {1}s · RAM {2:N0} MB (limite {3}%)' -f $pct, $Seconds, ($mem / 1MB), $MaxPercent
  if ($pct -gt $MaxPercent) { Write-Host "IDLE CPU ALTO"; exit 1 }
  Write-Host "IDLE CPU OK"
  exit 0
}
finally {
  if (-not $p.HasExited) { Stop-Process -Id $p.Id -Force }
  # Espera os processos do WebView2 da Kira de teste saírem (senão o próximo teste, ex. E2E,
  # pode pegar a pasta do WebView2 ainda em uso).
  if ($ids) {
    $deadline = (Get-Date).AddSeconds(10)
    while ((Get-Process -Id $ids -ErrorAction SilentlyContinue) -and (Get-Date) -lt $deadline) { Start-Sleep -Milliseconds 200 }
  }
}
