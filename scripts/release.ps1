# Publica uma versão da Kira no repositório PÚBLICO de releases (o código continua privado).
#   pwsh -File scripts/release.ps1            → gera, assina e publica a versão do package.json
#   pwsh -File scripts/release.ps1 -DryRun    → gera e assina, mas NÃO publica nada (confere tudo)
#
# Passos: árvore limpa → build assinado (NSIS + .sig) → latest.json → gh release no repo
# público → tag anotada no repo privado (o push da tag é com você).
# Só rode quando o usuário pedir a publicação.
param([switch]$DryRun)
$ErrorActionPreference = "Stop"
. "$PSScriptRoot\lib\credential.ps1"

$PublicRepo = "Hideki515/Kira-Radial-releases"
$root = Split-Path $PSScriptRoot -Parent
Push-Location $root
try {
  # --- 1. Conferências
  $version = (Get-Content package.json -Raw | ConvertFrom-Json).version
  $tag = "v$version"
  if (-not $DryRun) {
    if (git status --porcelain) { throw "Há mudanças não commitadas: commite antes de publicar." }
    if ((git rev-parse --abbrev-ref HEAD) -ne "main") { throw "Publique a partir de main." }
  }
  $changelog = Get-Content CHANGELOG.md -Raw
  $m = [regex]::Match($changelog, "(?ms)^## $([regex]::Escape($version))\s*\r?\n(.*?)(?=^## |\z)")
  if (-not $m.Success) { throw "CHANGELOG.md não tem a seção ## $version." }
  $notes = $m.Groups[1].Value.Trim()
  if (-not $DryRun) {
    $exists = gh release view $tag -R $PublicRepo 2>$null
    if ($LASTEXITCODE -eq 0) { throw "A release $tag já existe em $PublicRepo." }
  }

  # --- 2. Build assinado (a senha vem do Gerenciador de Credenciais, só neste processo)
  $keyPath = Join-Path $env:USERPROFILE ".tauri\kira-radial.key"
  if (-not (Test-Path $keyPath)) { throw "Chave não encontrada: rode scripts/setup-signing-key.ps1 uma vez." }
  $password = [KiraCred]::Read($KiraSigningCredential)
  if (-not $password) { throw "Senha da chave não encontrada no Gerenciador de Credenciais ($KiraSigningCredential)." }
  $env:TAURI_SIGNING_PRIVATE_KEY = Get-Content $keyPath -Raw
  $env:TAURI_SIGNING_PRIVATE_KEY_PASSWORD = $password
  try {
    npx tauri build
    if ($LASTEXITCODE -ne 0) { throw "tauri build falhou ($LASTEXITCODE)" }
  } finally {
    Remove-Item Env:TAURI_SIGNING_PRIVATE_KEY, Env:TAURI_SIGNING_PRIVATE_KEY_PASSWORD -ErrorAction SilentlyContinue
  }

  # --- 3. Artefatos com nome sem espaços (o GitHub troca espaço por ponto)
  $nsis = Join-Path $root "src-tauri\target\release\bundle\nsis"
  $setup = Get-ChildItem $nsis -Filter "*_${version}_x64-setup.exe" | Select-Object -First 1
  if (-not $setup) { throw "Instalador $version não encontrado em $nsis." }
  $sig = "$($setup.FullName).sig"
  if (-not (Test-Path $sig)) { throw "Assinatura não gerada ($sig): confira bundle.createUpdaterArtifacts." }
  $out = Join-Path $root "src-tauri\target\release\publish"
  New-Item -ItemType Directory -Force $out | Out-Null
  $fileName = "Kira-Radial_${version}_x64-setup.exe"
  Copy-Item $setup.FullName (Join-Path $out $fileName) -Force

  # --- 4. latest.json (lido pelo atualizador da Kira)
  $latest = [ordered]@{
    version   = $version
    notes     = $notes
    pub_date  = (Get-Date).ToUniversalTime().ToString("yyyy-MM-ddTHH:mm:ssZ")
    platforms = [ordered]@{
      "windows-x86_64" = [ordered]@{
        signature = (Get-Content $sig -Raw).Trim()
        url       = "https://github.com/$PublicRepo/releases/download/$tag/$fileName"
      }
    }
  }
  $latestPath = Join-Path $out "latest.json"
  $latest | ConvertTo-Json -Depth 5 | Set-Content $latestPath -Encoding utf8NoBOM
  $notesPath = Join-Path $out "notes.md"
  $notes | Set-Content $notesPath -Encoding utf8NoBOM

  if ($DryRun) {
    Write-Host "DryRun: nada publicado. Artefatos em $out"
    Get-ChildItem $out | Format-Table Name, Length -AutoSize
    exit 0
  }

  # --- 5. Publica no repositório público e marca a versão no privado
  gh release create $tag -R $PublicRepo --title "Kira Radial $tag" --notes-file $notesPath (Join-Path $out $fileName) $latestPath
  if ($LASTEXITCODE -ne 0) { throw "gh release create falhou ($LASTEXITCODE)" }
  git tag -a $tag -m $tag
  Write-Host "Publicado: https://github.com/$PublicRepo/releases/tag/$tag"
  Write-Host "Tag $tag criada localmente. Para enviar ao repositório privado: git push --follow-tags"
} finally {
  Pop-Location
}
