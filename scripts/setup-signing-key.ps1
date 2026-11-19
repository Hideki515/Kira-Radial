# Gera (uma vez) a chave que assina as atualizações da Kira.
# - Chave privada: %USERPROFILE%\.tauri\kira-radial.key (FORA do repositório).
# - Senha: aleatória, guardada no Gerenciador de Credenciais do Windows (nunca em arquivo nem na tela).
# - Chave pública: impressa no fim — vai para plugins.updater.pubkey no tauri.conf.json.
# Não sobrescreve uma chave existente (perder a chave = as versões instaladas não aceitam mais atualizações).
$ErrorActionPreference = "Stop"
. "$PSScriptRoot\lib\credential.ps1"

$dir = Join-Path $env:USERPROFILE ".tauri"
$key = Join-Path $dir "kira-radial.key"
if (Test-Path $key) {
  Write-Host "Já existe uma chave em $key — nada foi alterado."
  Write-Host "Chave pública:"
  Get-Content "$key.pub" -Raw
  exit 0
}
New-Item -ItemType Directory -Force $dir | Out-Null

# 32 bytes aleatórios → senha em base64 (não aparece em nenhum lugar).
$bytes = New-Object byte[] 32
[System.Security.Cryptography.RandomNumberGenerator]::Create().GetBytes($bytes)
$password = [Convert]::ToBase64String($bytes)
[KiraCred]::Write($KiraSigningCredential, "kira-radial", $password)

$root = Split-Path $PSScriptRoot -Parent
Push-Location $root
try {
  # O "generate" só aceita a senha por argumento; a saída é descartada (nada vai para a tela).
  npx tauri signer generate --ci -w $key -p $password *> $null
  if ($LASTEXITCODE -ne 0) { throw "tauri signer generate falhou ($LASTEXITCODE)" }
} finally {
  Pop-Location
}

# Só o usuário atual (e o SYSTEM) pode ler a chave privada.
icacls $key /inheritance:r /grant:r "$($env:USERNAME):(R,W)" "SYSTEM:(F)" | Out-Null

Write-Host "Chave privada: $key (senha no Gerenciador de Credenciais: $KiraSigningCredential)"
Write-Host "Chave pública:"
Get-Content "$key.pub" -Raw
