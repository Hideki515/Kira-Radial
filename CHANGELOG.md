# Changelog

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
