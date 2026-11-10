# Smoke da "Kira de teste" (gere antes com: npm run build:qa).
# Abre o exe QA, espera, confere e encerra SOMENTE o processo aberto aqui.
# Nao simula mouse/teclado, nao toca na Kira instalada nem na config do usuario.
# Saida 0 = ok; 1 = falhou (motivos listados).
param([int]$Seconds = 5)
$ErrorActionPreference = "Stop"

$root = Split-Path -Parent $PSScriptRoot
$exe = Join-Path $root "src-tauri\target-qa\release\kira-radial.exe"
if (-not (Test-Path $exe)) { Write-Host "FALHA: exe QA nao encontrado ($exe). Rode: npm run build:qa"; exit 1 }

$userCfg = Join-Path $env:APPDATA "Kira-Radial\config.json"
$qaDir = Join-Path $env:APPDATA "Kira-Radial-QA"
$hash = { param($p) if (Test-Path $p) { (Get-FileHash $p -Algorithm MD5).Hash } else { "-" } }
$userBefore = & $hash $userCfg

Add-Type @"
using System; using System.Collections.Generic; using System.Runtime.InteropServices; using System.Text;
public static class KiraSmoke {
  public delegate bool P(IntPtr h, IntPtr l);
  [DllImport("user32.dll")] static extern bool EnumWindows(P cb, IntPtr l);
  [DllImport("user32.dll")] public static extern uint GetWindowThreadProcessId(IntPtr h, out uint pid);
  [DllImport("user32.dll")] static extern bool IsWindowVisible(IntPtr h);
  [DllImport("user32.dll")] static extern bool GetWindowRect(IntPtr h, out RECT r);
  [DllImport("user32.dll")] public static extern IntPtr GetForegroundWindow();
  public struct RECT { public int L, T, R, B; }
  // Janelas visiveis do processo com area > 32x32 que aparecem na tela (x/y > -5000).
  public static List<string> OnScreen(uint pid) {
    var o = new List<string>();
    EnumWindows((h, l) => { uint p; GetWindowThreadProcessId(h, out p);
      if (p == pid && IsWindowVisible(h)) { RECT r; GetWindowRect(h, out r);
        if (r.R - r.L > 32 && r.B - r.T > 32 && r.L > -5000 && r.T > -5000) o.Add(r.L + "," + r.T + " " + (r.R - r.L) + "x" + (r.B - r.T)); }
      return true; }, IntPtr.Zero);
    return o;
  }
}
"@

$fails = @()
$p = Start-Process -FilePath $exe -PassThru
try {
  Start-Sleep -Seconds $Seconds
  if ($p.HasExited) { $fails += "processo QA fechou sozinho (codigo $($p.ExitCode))" }
  else {
    $on = [KiraSmoke]::OnScreen([uint32]$p.Id)
    if ($on.Count) { $fails += "janela(s) da Kira de teste na area visivel: $($on -join ' | ')" }
    [uint32]$fgPid = 0; [void][KiraSmoke]::GetWindowThreadProcessId([KiraSmoke]::GetForegroundWindow(), [ref]$fgPid)
    if ($fgPid -eq $p.Id) { $fails += "a Kira de teste pegou o foco do Windows" }
  }
  if (-not (Test-Path (Join-Path $qaDir "config.json"))) { $fails += "config da pasta QA nao foi criada" }
  if ((& $hash $userCfg) -ne $userBefore) { $fails += "config do USUARIO mudou (nao deveria)" }
  $log = Join-Path $qaDir "perf.log"
  if ((Test-Path $log) -and (Select-String -Path $log -Pattern "panic" -SimpleMatch -Quiet)) { $fails += "panic no perf.log da pasta QA" }
} finally {
  if (-not $p.HasExited) { Stop-Process -Id $p.Id -Force }
}

Write-Host "Kira de teste PID $($p.Id) aberta por $Seconds s e encerrada."
if ($fails.Count) { $fails | ForEach-Object { Write-Host "FALHA: $_" }; exit 1 }
Write-Host "SMOKE OK: viva, fora da tela, sem foco, pasta propria, config do usuario intacta."
exit 0
