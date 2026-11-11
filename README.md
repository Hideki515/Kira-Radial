# Kira Radial

Menu radial para Windows, com visual "frosted glass". Ele abre **onde o mouse está** ao pressionar um atalho global e executa ações que você configura: abrir programas, pastas e sites, enviar atalhos de teclado, controlar mídia, trocar a saída de áudio e mais.

Feito com **Tauri 2 (Rust) + React 18 + TypeScript + Vite**.

<!-- Opcional: adicione uma captura em docs/screenshot.png e descomente a linha abaixo. -->
<!-- ![Kira Radial](docs/screenshot.png) -->

## Recursos
- **Abre no cursor**, centralizado no mouse. Perto da borda, o menu é ajustado para caber no monitor (vários monitores e DPI).
- **Ícone flutuante opcional:** um orbe holográfico animado que abre o menu com um clique. Ele pode ser arrastado para qualquer lugar da tela. Escolha entre abrir pelo atalho, pelo ícone ou pelos dois.
- **Atalho global configurável** (padrão `Ctrl+Alt+Q`). Aceita a tecla Win, teclados ABNT2 e dois modos:
  - *pressionar e clicar*;
  - *segurar e soltar*.
- **Até 10 fatias** com submenus de até 8 itens. O submenu abre com **clique** ou **Enter**, e **Esc** volta para o anel principal.
- **Ações:**
  - abrir programa, arquivo ou pasta (opcionalmente como administrador);
  - abrir site, no navegador padrão ou num escolhido (inclusive em janela anônima e com perfil do Chrome/Edge);
  - enviar atalho de teclado (com atraso opcional, útil para apps de print como o Lightshot);
  - mídia (play/pause, faixas, volume, mudo). Essas ações **não fecham o menu**;
  - comandos do sistema (bloquear, suspender, desligar, reiniciar, sair, print, Gerenciador de Tarefas, Configurações do Windows);
  - scripts PowerShell e CMD;
  - **trocar a saída de áudio**, para um dispositivo fixo ou alternando entre eles.
- **Submenu automático de janelas abertas**, com o ícone de cada app, e **ações de janela**: sempre no topo, mover para outro monitor, encaixar, maximizar e minimizar.
- **Teclas 1–9** escolhem a fatia direto.
- **Submenu automático de áudio:** lista sozinho as saídas reconhecidas pelo Windows e destaca a que está em uso.
- **"Tocando agora" no centro do menu:** capa, título e artista do que estiver tocando (Spotify, YouTube…). Girar a roda do mouse sobre o centro ajusta o volume.
- **Mais submenus automáticos:** planos de energia, brilho (tela do notebook e monitores com DDC/CI), Wi-Fi/Bluetooth, arquivos recentes e área de transferência.
- **Privacidade do histórico da área de transferência:** vem desligado. Quando ligado, guarda só os 8 últimos textos e só na memória: nada vai para disco e tudo some ao fechar a Kira. Também ignora o que gerenciadores de senha marcam para não guardar.
- **9 temas:** Vidro, Holográfico, Arc Reactor, Terminal, Neon Synthwave, Cyberpunk, Steampunk, Fluent Claro e Minimalista, além de **temas personalizados** com editor de cores (exportar/importar). Há também **sons estilo HUD**, opcionais, com a opção de usar arquivos próprios.
- **Perfis por aplicativo:** fatias diferentes conforme o app em primeiro plano (ex.: `code.exe`).
- **Tela de configurações** com pré-visualização ao vivo, backup/restauração da configuração, ícone na bandeja e opção de iniciar com o Windows.

## Instalação
Baixe o `Kira Radial_x.y.z_x64-setup.exe` na página **Releases** do repositório e execute. A instalação é por usuário e não pede administrador.

As configurações ficam em `%APPDATA%\Kira-Radial\config.json`.

### Aviso sobre antivírus
O instalador e o executável **não têm assinatura digital**. Por isso:
- o SmartScreen pode avisar ao rodar o instalador ("Mais informações" → "Executar assim mesmo");
- o Windows Defender pode acusar um **falso positivo** heurístico (ex.: `Trojan:Win32/Bearfoos.A!ml`).

O alerta acontece porque o Kira usa recursos que malware também usa: hook de teclado (só enquanto você grava um atalho), envio de teclas a outros apps e início automático com o Windows. Para resolver:
- adicione uma exclusão para `%LOCALAPPDATA%\Kira Radial` no Windows Defender, ou
- reporte o falso positivo em <https://www.microsoft.com/en-us/wdsi/filesubmission>.

## Desenvolvimento

### Requisitos
Tudo está listado em [`prerequisites.txt`](prerequisites.txt). Para instalar o que faltar de uma vez (via winget), rode na raiz do projeto:

```powershell
powershell -ExecutionPolicy RemoteSigned -File scripts\install-prerequisites.ps1
```

O script pula o que já estiver instalado, configura o Rust e roda `npm ci`. Use `-DryRun` para só ver o que seria instalado e `-SkipNpm` para pular o `npm ci`.

Pré-requisitos:
- Windows 10 ou 11 com WebView2 (já vem no Windows 11)
- [Node.js](https://nodejs.org) 22 ou mais recente
- [Rust](https://rustup.rs), toolchain `stable-x86_64-pc-windows-msvc`
- Visual Studio Build Tools com a carga de trabalho "Desenvolvimento para desktop com C++"

### Comandos
```bash
npm install
npm run dev            # só o front no navegador (botão direito abre o menu)
npm run tauri dev      # app completo com hot reload
npm run typecheck      # tsc
npm test               # Vitest
cd src-tauri && cargo test
npm run tauri build    # instalador em src-tauri/target/release/bundle/nsis/
npm run build:qa       # "Kira de teste": roda ao lado da instalada, janelas fora da tela, dados em %APPDATA%\Kira-Radial-QA
npm run e2e            # testes de ponta a ponta (WebDriver) na Kira de teste
                       #   requer: cargo install tauri-driver (o msedgedriver é baixado sozinho)
```

### Estrutura
```
src/
  radial/     menu radial (SVG): geometria, fatias, sub-anel, hub central
  settings/   tela de configurações e editores de itens e ações
  shared/     schema da config, validação, IPC, atalhos, ícones
src-tauri/src/
  actions/    executor das ações (ShellExecute, SendInput, mídia, sistema, scripts)
  audio.rs    listagem e troca da saída de áudio padrão
  keycapture.rs  captura de atalhos (inclui Win) enquanto o gravador está ativo
  menu.rs     atalho global, mostrar e esconder o menu, estado
  positioning.rs posição no cursor com ajuste ao monitor e DPI
```

## Lançar uma versão
```bash
node scripts/bump-version.mjs 0.2.0   # package.json, Cargo.toml, tauri.conf.json e locks
# atualize o CHANGELOG.md
git commit -am "v0.2.0"
git tag -a v0.2.0 -m "v0.2.0"
git push --follow-tags
```
A tag dispara o workflow **Release**, que compila no GitHub e cria uma Release em **rascunho** com o instalador anexado. Revise e publique.

## Créditos
- Visual inspirado em [NakamuraIA/frosted-radial-menu](https://github.com/NakamuraIA/frosted-radial-menu) (MIT). O código deste projeto foi escrito do zero.
- Ícones: [Lucide](https://lucide.dev) (ISC).

## Licença
[MIT](LICENSE)
