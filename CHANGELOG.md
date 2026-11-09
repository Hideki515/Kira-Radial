# Changelog

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
