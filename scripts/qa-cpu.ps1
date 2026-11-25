# CPU (% de um núcleo) da Kira de TESTE (target-qa) e dos processos filhos (WebView2) em N s.
# Só lê contadores; não abre nem fecha nada. Saída: um número (ex.: 7.25). Uso: -Seconds 8
param([int]$Seconds = 8)
$all = Get-CimInstance Win32_Process
$root = $all | Where-Object { $_.Name -eq 'kira-radial.exe' -and $_.ExecutablePath -like '*\target-qa\*' } | Select-Object -First 1
if (-not $root) { Write-Error 'Kira de teste não está rodando'; exit 1 }
$ids = [System.Collections.Generic.List[int]]::new(); $ids.Add([int]$root.ProcessId)
$changed = $true
while ($changed) {
  $changed = $false
  foreach ($x in $all) { if ($ids.Contains([int]$x.ParentProcessId) -and -not $ids.Contains([int]$x.ProcessId)) { $ids.Add([int]$x.ProcessId); $changed = $true } }
}
$before = @{}
Get-Process -Id $ids -ErrorAction SilentlyContinue | ForEach-Object { $before[$_.Id] = $_.TotalProcessorTime.TotalSeconds }
Start-Sleep -Seconds $Seconds
$cpu = 0.0
foreach ($q in Get-Process -Id $ids -ErrorAction SilentlyContinue) { if ($before.ContainsKey($q.Id)) { $cpu += $q.TotalProcessorTime.TotalSeconds - $before[$q.Id] } }
# F2 + cultura invariante: sempre '12.34' (sem separador de milhar nem vírgula decimal).
[Console]::Out.WriteLine(($cpu / $Seconds * 100).ToString('F2', [Globalization.CultureInfo]::InvariantCulture))
