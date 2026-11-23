# Gera o instalador NSIS e atualiza a cópia instalada do Kira Radial (instalação por usuário).
# Uso: pwsh -File scripts/update-installed.ps1 [-SkipBuild]
param([switch]$SkipBuild)
$ErrorActionPreference = 'Stop'
$root = Split-Path -Parent $PSScriptRoot
$installDir = Join-Path $env:LOCALAPPDATA 'Kira Radial'
$installedExe = Join-Path $installDir 'kira-radial.exe'

if (-not $SkipBuild) {
    Push-Location $root
    try {
        # Com a atualização automática ligada, o build com instalador assina a atualização:
        # usa a chave local (senha no Gerenciador de Credenciais) ou, sem ela, pula os artefatos.
        . "$PSScriptRoot\lib\credential.ps1"
        $keyPath = Join-Path $env:USERPROFILE ".tauri\kira-radial.key"
        $pass = if (Test-Path $keyPath) { [KiraCred]::Read($KiraSigningCredential) } else { $null }
        if ($pass) {
            $env:TAURI_SIGNING_PRIVATE_KEY = Get-Content $keyPath -Raw
            $env:TAURI_SIGNING_PRIVATE_KEY_PASSWORD = $pass
            try { npx tauri build --bundles nsis }
            finally { Remove-Item Env:TAURI_SIGNING_PRIVATE_KEY, Env:TAURI_SIGNING_PRIVATE_KEY_PASSWORD -ErrorAction SilentlyContinue }
        } else {
            npx tauri build --bundles nsis --config '{\"bundle\":{\"createUpdaterArtifacts\":false}}'
        }
        if ($LASTEXITCODE -ne 0) { throw "tauri build falhou ($LASTEXITCODE)" }
    } finally { Pop-Location }
}

$setup = Get-ChildItem (Join-Path $root 'src-tauri\target\release\bundle\nsis') -Filter '*-setup.exe' |
    Sort-Object LastWriteTime -Descending | Select-Object -First 1
if (-not $setup) { throw 'instalador não encontrado em bundle\nsis' }
Write-Host "Instalador: $($setup.FullName)"

# Processos kira-radial com o caminho do exe. Get-Process pode devolver .Path vazio (sem
# acesso ao processo), então lê pelo CIM. A Kira de teste (target-qa) fica de fora:
# tem identificador próprio e não atrapalha a instalação.
function Get-KiraProcs {
    Get-CimInstance Win32_Process -Filter "Name='kira-radial.exe'" |
        Where-Object { $_.ExecutablePath -notlike '*\target-qa\*' }
}

# Fecha a Kira aberta (instalada ou release), senão a instância única atrapalha e o exe fica travado.
$procs = @(Get-KiraProcs)
foreach ($p in $procs) {
    Write-Host "Encerrando kira-radial pid $($p.ProcessId) ($($p.ExecutablePath))"
    # O processo pode ter fechado entre a leitura do CIM e aqui.
    $gp = Get-Process -Id $p.ProcessId -ErrorAction SilentlyContinue
    if ($gp) { $gp.CloseMainWindow() | Out-Null }
}
Start-Sleep -Milliseconds 800
foreach ($p in @(Get-KiraProcs)) { Stop-Process -Id $p.ProcessId -Force -ErrorAction SilentlyContinue }
Start-Sleep -Milliseconds 500

$p = Start-Process -FilePath $setup.FullName -ArgumentList '/S' -Wait -PassThru
if ($p.ExitCode -ne 0) { throw "instalador saiu com código $($p.ExitCode)" }
if (-not (Test-Path $installedExe)) { throw "exe instalado não encontrado: $installedExe" }

$v = (Get-Item $installedExe).VersionInfo.ProductVersion
Write-Host "Instalado: $installedExe (versão $v, modificado $((Get-Item $installedExe).LastWriteTime))"
Start-Process -FilePath $installedExe
# Espera até 10 s a Kira instalada aparecer (o primeiro início pode demorar um pouco).
$running = $null
for ($i = 0; $i -lt 20 -and -not $running; $i++) {
    Start-Sleep -Milliseconds 500
    $running = @(Get-KiraProcs | Where-Object { $_.ExecutablePath -eq $installedExe })
    if (-not $running.Count) { $running = $null }
}
if ($running) { Write-Host "OK: Kira Radial instalado em execução (pid $($running.ProcessId -join ','))" }
else { throw 'Kira Radial instalado não ficou em execução' }
