# Changelog

## 0.14.0

- **Perfis por horário e por monitor** (Configurações → Perfis → "Quando usar"):
  - **Dias da semana**, com os atalhos "Dias úteis" e "Qualquer dia".
  - **Horário**, inclusive faixas que passam da meia-noite (ex.: 22:00–02:00, com "sexta à noite" valendo até a madrugada de sábado).
  - **Monitores**: lista com o nome de cada tela e o botão **Identificar**, que mostra o número em cada monitor por 2 s.
  - Ordem da escolha do perfil: primeiro o **app em primeiro plano**, depois o perfil cujo horário, dias ou monitor bate, e por fim o Padrão.
  - O cartão de cada perfil mostra o resumo (ex.: "Seg–Sex 09:00–18:00 · 2. LG").
- A página "Perfis por app" agora se chama **Perfis**.
- Correção: ícones extraídos em uso não são mais apagados se o caminho salvo tiver maiúsculas e minúsculas diferentes.
- Testes E2E: novo cenário "perfil por monitor" (9 cenários no total).

## 0.13.0

- **Ícones próprios nas fatias** (Itens → Ícone):
  - **Imagem própria…**: PNG, SVG, ICO ou WebP, até 512 KB.
  - **Usar ícone do programa**: para fatias "Abrir programa", extrai o mesmo ícone que o Explorador mostra. Funciona também com nomes soltos como `wt.exe` ou `notepad`, procurados no PATH.
  - O ícone aparece no menu e na pré-visualização. Se o arquivo sumir, volta para o ícone escolhido na lista.
  - Ícones extraídos que nenhuma fatia usa são apagados ao salvar.
- Testes E2E: novo cenário "Usar ícone do programa" (8 cenários no total).

## 0.12.0

- **Testes de ponta a ponta** (WebDriver + tauri-driver) rodando na Kira de teste. Clicam e digitam dentro das páginas, sem mexer no mouse ou teclado do Windows. São 7 cenários:
  1. As Configurações abrem e mostram a versão certa.
  2. Trocar o tema para Terminal e salvar grava a config e muda o menu; Esc fecha o menu.
  3. Renomear uma fatia, salvar e vê-la no menu.
  4. Submenu automático "Planos de energia" lista os planos (só leitura).
  5. Salvamentos geram versões anteriores e o diff abre.
  6. No modo Ícone, o menu nasce do ícone.
  7. Diagnóstico mostra o resumo e gera o relatório, sem ERROR ou panic no log.
- `npm run e2e` (build QA + testes) e `npm run e2e:run` (só os testes).
- `scripts/get-edgedriver.ps1` baixa o msedgedriver da mesma versão do WebView2 para `tools/`, pasta ignorada pelo git.

## 0.11.0

- **Configurações → Diagnóstico** (página nova):
  - Resumo: versão, Windows, WebView2, monitores, modo de abertura, tema, atalho (registrado ou não), memória e erros recentes.
  - Visualizador do log com filtro por nível e texto, atualização automática a cada 2 s e botões Copiar, Limpar e Abrir pasta.
  - **Gerar relatório**: cria um `.txt` com o resumo e o log para anexar em issue. Não leva a configuração, a área de transferência nem os arquivos recentes, e oculta o nome do usuário do Windows.
- **Log novo (`kira.log`)**:
  - Cada linha tem data/hora legível, nível (INFO/WARN/ERROR) e origem.
  - Rotação em 3 arquivos de 1 MB.
  - O `perf.log` antigo é migrado.
- **Falhas registradas**: pânicos do Rust e erros não tratados das três janelas vão para o log.
- **Sem tela branca**: se uma tela quebrar, aparece "Algo deu errado" com um botão Recarregar, e o erro fica registrado.

## 0.10.0

- **Backup automático da configuração**: sempre que você salva uma mudança, a versão anterior é guardada. As 10 mais recentes ficam guardadas, só neste PC.
- **Configurações → Backup → "Versões anteriores"**: mostra cada versão com a data ("há 5 min", "ontem 14:30") e o resumo dos perfis.
  - **Ver diferenças** compara a versão com a atual (atalho, aparência, fatias adicionadas, removidas ou alteradas).
  - **Restaurar no rascunho** carrega a versão para revisão; ela só vale depois de clicar em Salvar.
  - Uma config que não carregou também aparece na lista.
- Kira de teste:
  - Menu e configurações aparecem fora da tela desde o primeiro instante e sem ativar a janela; esconder também funciona.
  - O smoke começa com a pasta de dados de teste limpa.

## 0.9.0

- **"Kira de teste" para desenvolvimento e QA**: `npm run build:qa` gera uma variante isolada que roda ao lado da Kira instalada, sem interferir nela.
  - Usa o identifier `com.kira.radial.qa` e uma pasta de dados própria (`%APPDATA%\Kira-Radial-QA`).
  - Não registra o atalho, não cria ícone na bandeja e não ativa o início com o Windows.
  - Abre todas as janelas fora da tela e sem pegar o foco.
  - Tem comandos de automação (`qa_*`), que o build normal não contém (o CI confere isso).
  - `scripts/smoke-qa.ps1` abre a Kira de teste, faz as verificações e a encerra.
- Correção: ao iniciar (inclusive junto com o Windows), a Kira roubava o foco do app em uso para a janela de Configurações, que ficava invisível. Agora o foco não muda.

## 0.8.0

- **Cinco temas novos**, cada um com uma linguagem visual diferente:
  - **Neon Synthwave**: retrô anos 80, sol listrado em degradê, grade em perspectiva e aros neon rosa/ciano piscando.
  - **Cyberpunk**: amarelo e preto, moldura chanfrada, faixa de perigo girando, barras de status e texto com glitch na fatia ativa.
  - **Steampunk**: latão e cobre, placa de engrenagem e engrenagens girando, rebites e letras serifadas.
  - **Fluent Claro**: tema claro e translúcido no estilo do Windows 11, com sombra suave.
  - **Minimalista**: preto e branco, traços finos e sem enfeites.
- Agora são 9 temas. Paleta de cores com as sugestões dos temas novos.

## 0.7.0

- **Novos temas:**
  - **Arc Reactor**: anéis segmentados girando, bobinas em volta do núcleo, azul-ciano.
  - **Terminal**: verde fósforo, fonte monoespaçada, grade de pontos e linhas de varredura.
- **Seletor de tema com miniaturas** em Configurações → Aparência. Cada tema sugere a própria cor, mas uma cor personalizada é mantida.
- **Sons estilo HUD**, sintetizados pela própria Kira (sem arquivos de terceiros), para abrir, fechar, executar e passar por uma fatia.
  - Volume ajustável e botão ▶ para ouvir cada som.
  - Em cada evento dá para usar um arquivo próprio (WAV/MP3/OGG, até 2 MB) ou deixar sem som.
  - Vem desligado.

## 0.6.0

- **Reordenar fatias e subitens arrastando** pela alça ⋮⋮ na página Itens. Também funciona com Alt+↑/↓ na linha selecionada.
- **Ícone encaixa na borda:** solto perto de uma borda da tela, ele fica metade escondido e desliza para fora ao passar o mouse. Arrastar para longe desfaz o encaixe, e a posição encaixada continua depois de reiniciar.
- **Alerta de CPU alta no ícone:** acima de 85%, o núcleo fica avermelhado e pulsa mais rápido. Pode ser desligado em Configurações → Ícone.
- **Roda do mouse sobre o ícone** ajusta o volume e mostra um arco em volta dele.
- Correção: um submenu automático de tipo desconhecido (por exemplo, numa config de versão mais nova) não derruba mais o menu. Ele vira um sub-anel vazio e a validação avisa.

## 0.5.0

- **"Tocando agora" no centro**: capa, título e artista da mídia em reprodução, atualizados a cada 2 s com o menu aberto. A opção fica em Aparência e vem ligada.
- **Roda do mouse sobre o centro** ajusta o volume e mostra um arco com o "VOL %".
- **Novos submenus automáticos** (em "Ao selecionar → Submenu automático → Conteúdo"):
  - Planos de energia.
  - Brilho da tela, de 10% a 100%. Funciona na tela do notebook e em monitores com DDC/CI.
  - Wi-Fi e Bluetooth (ligar/desligar).
  - Arquivos recentes.
  - Área de transferência, que cola um dos últimos textos copiados.
- **Novas ações**: "Brilho da tela" (aumentar, diminuir ou definir) e "Wi-Fi / Bluetooth" (alternar, ligar ou desligar).
- **Histórico da área de transferência**: opcional e desligado por padrão. Fica só na memória (máx. 8 textos) e respeita os formatos de exclusão dos gerenciadores de senha.
- O seletor "Ao selecionar" ficou com 3 opções (ação, submenu, submenu automático) e uma lista de conteúdo.

## 0.4.0

- **Teclas 1–9**: com o menu aberto, escolhem a fatia (e o subitem, com o sub-anel aberto). Funcionam também no teclado numérico. A opção "Mostrar números nas fatias" fica em Aparência.
- **Submenu automático "Janelas abertas"**: as 8 janelas mais recentes, com o ícone de cada app. Clique para trazer a janela para a frente.
- **Ação "Controlar a janela ativa"**: sempre no topo, mover para o próximo monitor, encaixar à esquerda ou à direita, maximizar/restaurar, minimizar e minimizar todas. Tudo usa a API de janelas do Windows, sem simular teclas.

## 0.3.5

Correções:
- "Esconder ícone" (pelo botão direito ou pela bandeja) agora é lembrado depois de reiniciar. Configurações → Ícone avisa quando ele está escondido e tem o botão "Mostrar o ícone".
- O controle de tamanho do menu agora vai de 50% a 160%, a mesma faixa aceita pela validação.
- Modo "segurar e soltar": soltar o atalho depois de clicar numa mídia não repete mais a ação.
- O aviso rápido fica 2,2 s depois do último clique, e não mais do primeiro.
- Desligar e reiniciar avisam quando a conta não tem permissão de desligamento, em vez de falhar em silêncio.

## 0.3.4

- **Correção:** o ícone não sumia ao escolher "Esconder ícone" (no botão direito ou na bandeja), ao trocar o modo de abertura para "Atalho" nem em tela cheia.

## 0.3.3

- **Esconder o ícone em tela cheia**: o ícone some durante jogos, vídeos e apresentações em tela cheia e volta sozinho ao sair. A opção vem ligada e pode ser desligada em Configurações → Ícone.
- O menu do botão direito no ícone agora fecha ao clicar fora.

## 0.3.2

- **Página "Ícone" nas configurações**:
  - Pré-visualização animada.
  - Tamanho (56–160 px) e opacidade em repouso.
  - Botão "Voltar o ícone para o canto".
- **Imagem própria para o ícone** (GIF, WebP ou PNG animado, até 8 MB). Se a imagem não carregar, o orbe embutido é usado.
- **Botão direito no ícone**: Configurações e "Esconder ícone".
- **Bandeja**: item "Mostrar/esconder ícone".

## 0.3.1

- **Animação de abertura pelo ícone**: o menu nasce do ícone.
  - O núcleo cresce do tamanho do ícone, o fundo e os anéis se expandem girando e as fatias surgem em sequência no sentido horário.
  - Ao fechar (Esc, clique fora ou no centro), o menu se recolhe de volta para o ícone.
  - Pelo atalho, o menu continua abrindo e fechando como antes.
  - A animação é desligada quando o Windows está com "reduzir animações".

## 0.3.0

- **Ícone flutuante** (orbe holográfico animado) que abre o menu com um clique.
  - Pode ser arrastado para qualquer lugar da tela, inclusive para outro monitor; a posição fica salva.
  - O menu abre centrado no ícone.
- **Escolha como abrir o menu**: Atalho · Ícone · Ícone + atalho (em Configurações → Atalho). No modo "Ícone", o atalho global fica desligado.
- A versão exibida nas configurações agora vem do `package.json`.

## 0.2.0

- **Tema "Holográfico"**: HUD em wireframe.
  - Esfera com meridianos animados, órbitas inclinadas, réguas graduadas, varredura de radar e retícula no hub.
  - A cor segue o destaque, âmbar por padrão.
  - Escolha em Configurações → Aparência → Tema. O tema "Vidro" continua sendo o padrão.

## 0.1.0

Primeira versão.

- **Menu radial**
  - Visual "frosted glass", com abertura no cursor e ajuste ao monitor e DPI.
  - Até 10 fatias e sub-anéis de até 8 itens.
  - O sub-anel abre com clique ou Enter. Esc ou Backspace voltam para o anel principal.
  - Navegação por mouse, teclado e roda.
- **Atalho global**
  - Configurável, com padrão Ctrl+Alt+Q.
  - Modos pressionar/clicar e segurar/soltar.
  - Gravador aceita a tecla Win e teclados ABNT2.
- **Ações**
  - Programa, arquivo, pasta e URL.
  - Atalho de teclado com atraso opcional. O menu some da tela antes do envio.
  - Mídia, sem fechar o menu.
  - Sistema: bloquear, suspender, desligar, reiniciar, sair, print e Gerenciador de Tarefas.
  - Scripts PowerShell e CMD.
  - Troca da saída de áudio, para um dispositivo fixo ou alternando entre eles.
- **Submenu automático de saídas de áudio**: a saída em uso aparece destacada.
- **Perfis por aplicativo**, escolhidos pelo executável em primeiro plano.
- **Tela de configurações**
  - Pré-visualização ao vivo.
  - Backup e restauração da configuração.
  - Bandeja do sistema e início automático com o Windows.
- **Redução de falsos positivos de antivírus**
  - Metadados completos no executável.
  - O uso de CPU e RAM é lido sem varrer processos.
  - Desligar e reiniciar usam a API do Windows.
  - Scripts deixaram de usar `-ExecutionPolicy Bypass` e não ficam mais ocultos por padrão.
