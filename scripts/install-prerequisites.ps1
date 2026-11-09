# Instala os pré-requisitos listados em prerequisites.txt (via winget) e prepara o projeto.
# Uso (na raiz do projeto):
#   powershell -ExecutionPolicy RemoteSigned -File scripts\install-prerequisites.ps1
# Opções:
#   -SkipNpm   não roda "npm ci" no final
#   -DryRun    só mostra o que seria instalado
param(
    [switch]$SkipNpm,
    [switch]$DryRun
)

$ErrorActionPreference = "Stop"
$root = Split-Path -Parent $PSScriptRoot
$list = Join-Path $root "prerequisites.txt"

if (-not (Get-Command winget -ErrorAction SilentlyContinue)) {
    Write-Error "winget não encontrado. Instale o 'App Installer' pela Microsoft Store e rode de novo."
}
if (-not (Test-Path $list)) { Write-Error "Arquivo não encontrado: $list" }

# Lê "id [? comando] [| argumentos]" ignorando comentários e linhas vazias.
$packages = Get-Content $list -Encoding UTF8 |
    ForEach-Object { $_.Trim() } |
    Where-Object { $_ -and -not $_.StartsWith("#") } |
    ForEach-Object {
        $parts = $_ -split "\|", 2
        $head = $parts[0] -split "\?", 2
        [pscustomobject]@{
            Id    = $head[0].Trim()
            Check = if ($head.Count -gt 1) { $head[1].Trim() } else { "" }
            Args  = if ($parts.Count -gt 1) { $parts[1].Trim() } else { "" }
        }
    }

# WebView2 vem embutido no Windows 11 e não aparece no winget: detecta pelo registro.
function Test-WebView2 {
    $guid = "{F3017226-FE2A-4295-8BDF-00C3A9A7E4C5}"
    foreach ($k in @("HKLM:\SOFTWARE\WOW6432Node\Microsoft\EdgeUpdate\Clients\$guid",
                     "HKLM:\SOFTWARE\Microsoft\EdgeUpdate\Clients\$guid",
                     "HKCU:\Software\Microsoft\EdgeUpdate\Clients\$guid")) {
        $pv = (Get-ItemProperty $k -Name pv -ErrorAction SilentlyContinue).pv
        if ($pv -and $pv -ne "0.0.0.0") { return $true }
    }
    return $false
}

function Test-Installed($p) {
    if ($p.Check -and (Get-Command $p.Check -ErrorAction SilentlyContinue)) { return $true }
    if ($p.Id -eq "Microsoft.EdgeWebView2Runtime" -and (Test-WebView2)) { return $true }
    winget list --id $p.Id --exact --accept-source-agreements *> $null
    return ($LASTEXITCODE -eq 0)
}

$failed = @()
foreach ($p in $packages) {
    if (Test-Installed $p) {
        Write-Host "[ok]        $($p.Id) já instalado" -ForegroundColor DarkGray
        continue
    }
    Write-Host "[instalar]  $($p.Id) $($p.Args)" -ForegroundColor Cyan
    if ($DryRun) { continue }
    $cmd = "winget install --id $($p.Id) --exact --source winget --accept-package-agreements --accept-source-agreements $($p.Args)"
    Invoke-Expression $cmd
    if ($LASTEXITCODE -ne 0) {
        Write-Warning "Falha ao instalar $($p.Id) (código $LASTEXITCODE)."
        $failed += $p.Id
    }
}

if ($DryRun) { return }

# Recarrega o PATH para enxergar node/cargo recém-instalados nesta mesma janela.
$env:Path = [Environment]::GetEnvironmentVariable("Path", "Machine") + ";" + [Environment]::GetEnvironmentVariable("Path", "User")

if (Get-Command rustup -ErrorAction SilentlyContinue) {
    Write-Host "Configurando Rust (stable-x86_64-pc-windows-msvc + clippy)..." -ForegroundColor Cyan
    rustup default stable-x86_64-pc-windows-msvc
    rustup component add clippy
} else {
    Write-Warning "rustup ainda não está no PATH. Abra um terminal novo e rode: rustup default stable-x86_64-pc-windows-msvc"
}

if (-not $SkipNpm) {
    if (Get-Command npm -ErrorAction SilentlyContinue) {
        Write-Host "Instalando dependências do projeto (npm ci)..." -ForegroundColor Cyan
        Push-Location $root
        try { npm ci } finally { Pop-Location }
    } else {
        Write-Warning "npm ainda não está no PATH. Abra um terminal novo e rode: npm ci"
    }
}

if ($failed.Count) {
    Write-Warning "Não instalados: $($failed -join ', '). Tente instalar manualmente."
    exit 1
}
Write-Host "`nPronto! Rode 'npm run tauri dev' para abrir o app em modo de desenvolvimento." -ForegroundColor Green
