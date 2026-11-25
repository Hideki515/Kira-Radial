# Changelog

## 0.45.0

- **Controle de videogame** (Geral → Controle de videogame): dá para usar um controle de Xbox, ou compatível com XInput, para abrir e navegar no menu.
  - **Abrir e fechar:** segure a combinação escolhida por meio segundo. As opções são LB + RB (padrão), View ou View + Menu. Escolha uma que seus jogos não usem.
  - **No menu:** o analógico esquerdo aponta a fatia, A escolhe (ou abre o submenu), B volta ou fecha e o direcional passa de uma em uma. A confirmação de desligar/reiniciar também funciona com A e B.
  - **Desligado por padrão:** a Kira só lê o controle de quem ligar a opção. Ligado, lê 10 vezes por segundo com o menu fechado e 30 vezes com ele aberto, com consumo mínimo. Controles desconectados são procurados só a cada 2 s.
  - As Configurações mostram se há controle conectado.

## 0.44.0

- **3 temas novos na seção Tecnologia** (Aparência → Tema), completando o pacote:
  - **Silício:** um chip ampliado, com blocos de trilhas microscópicas, pads dourados na borda e um reflexo iridescente. É totalmente parado e não gasta CPU com animação;
  - **Plasma:** uma esfera de plasma com o núcleo brilhando nas frestas entre as fatias e filamentos tremendo em volta. Um raio forte aponta para a fatia escolhida e acompanha o mouse e o teclado;
  - **Satélite:** a Terra vista de cima, em grade, com satélites girando em três órbitas de velocidades diferentes.
- **Mapa Térmico:** as manchas de calor não vazam mais um brilho fraco para fora do campo.

## 0.43.0

- **3 temas novos na seção Tecnologia** (Aparência → Tema):
  - **Chuva de Código:** colunas de caracteres descendo atrás do anel, em duas velocidades, com as fatias em vidro escuro;
  - **Scanner LiDAR:** nuvem de pontos (paredes em arco e pontos soltos) e um leque de varredura girando;
  - **Rack de Áudio:** painel de metal escovado com parafusos e 20 barras de LED (verde, amarelo e vermelho) que mudam de nível como num medidor de som.
- Como nos outros temas animados, são poucas animações, a 15 quadros/s. Com "reduzir movimento" do Windows, ficam parados.
- **Correções visuais da 0.42.0:**
  - Mapa Térmico: a régua de temperatura e os valores 38°/19° agora ficam dentro do campo (antes saíam da tela);
  - Display Vetorial: o triângulo e o fundo preto não são mais cortados nas bordas.

## 0.42.0

- **3 temas novos na seção Tecnologia** (Aparência → Tema):
  - **Display Vetorial:** linhas finas e brilhantes em fundo preto, com um túnel octogonal girando devagar e estrelas paradas, como nos fliperamas vetoriais dos anos 80;
  - **Mapa Térmico:** visão de câmera térmica, com fundo frio em roxo e manchas de calor. A fatia escolhida fica "quente", em laranja e amarelo;
  - **Glitch CRT:** monitor de tubo com linhas de varredura, vinheta, bordas com aberração cromática (vermelho e ciano), uma faixa clara descendo e falhas rápidas de vez em quando.
- Como os outros temas animados, cada um tem poucas animações, a 15 quadros/s. Com "reduzir movimento" do Windows, ficam parados.

## 0.41.0

- **Temas em seções:** em Aparência → Tema, os 24 temas ficam agrupados:
  - **Clássicos:** Vidro, Fluent Claro, Minimalista, Papel, Pixel;
  - **Ficção científica:** Holográfico, Arc Reactor, Terminal, Cyberpunk, Steampunk, Neon Synthwave;
  - **Cores e natureza:** Sakura, Oceano, Aurora, Magma;
  - **Tecnologia:** Circuito, Radar, Quântico, Blueprint, Data Center, Rede Neural, Osciloscópio, Fibra Óptica, Válvulas Nixie;
  - **Meus temas:** os temas personalizados e o botão "+ Criar tema".
- Nada muda nos temas em si nem no tema escolhido.

## 0.40.1

- **Menos CPU no tema Holográfico:** os meridianos da esfera giravam com redesenho na taxa da tela. Agora trocam de quadro a 15 quadros/s, junto com os outros giros do tema. O formato do giro (achatando como um cosseno) continua o mesmo.

## 0.40.0

- **Discord: sair do canal de voz.** No submenu automático "Discord: microfone e fone", quando você está num canal de voz aparece uma terceira fatia, **"Sair: <canal>"**, que desconecta da chamada. Fora de canal, ela não aparece.
- Também dá para usar como ação comum de uma fatia: Discord → "Sair do canal de voz".
- Não precisa autorizar o Discord de novo: a Kira já tinha a permissão de voz.

## 0.39.1

- **Temas claros (Fluent Claro e Papel):** no submenu automático, o ícone do item em uso fica numa versão mais escura da cor (verde, ou vermelho no Discord mutado), legível sobre o fundo branco. Antes, o verde puro quase sumia. Temas personalizados (que podem ter fatias escuras) continuam com a cor pura.

## 0.39.0

- **Estado mais visível nos submenus automáticos.** O item em uso fica com o fundo tingido e o ícone colorido, mesmo sem o ponteiro em cima:
  - o dispositivo de áudio atual;
  - o plano de energia ativo;
  - a VPN conectada;
  - a cena atual do OBS;
  - Wi-Fi e Bluetooth ligados.

  No Discord, o microfone mutado e o fone ensurdecido ficam tingidos de vermelho; ligados, de verde.
- **Selo de estado em fatias comuns.** Uma fatia (ou subitem) com uma ação do Discord ou do OBS mostra uma bolinha perto da borda:
  - **Discord mutar/ensurdecer:** verde quando ligado, vermelho quando mutado ou ensurdecido;
  - **OBS gravar/transmitir:** vermelha enquanto grava ou transmite.

  O estado é lido ao abrir o menu. Com o Discord ou o OBS fechado, a fatia não mostra selo.
- **Transição suave:** ao digitar na busca ou trocar de perfil, os ícones e nomes novos entram com um fade de 120 ms. Com "reduzir movimento" do Windows, não há fade.

## 0.38.0

- **Menos CPU no ícone flutuante:** parado, ele passa de 30 para 15 quadros/s, com todos os anéis, o brilho e o núcleo trocando de quadro juntos. Com o mouse em cima continua a 30 quadros/s.
- **Menos CPU com o menu aberto** nos temas animados:
  - giros lentos (Holográfico, Reator, Cyberpunk, Steampunk) deixam de redesenhar a 60 quadros/s;
  - o Quântico gira a 8 quadros/s e o Radar a 15;
  - no Circuito, na Rede Neural e no Osciloscópio os grupos animados trocam de quadro no mesmo instante, o que evita redesenhos extras.
- O visual dos temas não muda.

## 0.37.1

- **Discord: mutado fica vermelho.** No submenu "Discord: microfone e fone", a fatia do microfone mutado e a do fone ensurdecido ficam vermelhas (antes cinza). Ligado continua verde.

## 0.37.0

- **Medidor do centro escolhível** (Aparência → Medidor do centro): CPU (como antes), **RAM** ou **Rede**. A rede mostra o download e o upload atuais (↓ 1,2 MB/s, ↑ 35 KB/s). As leituras só são feitas com o menu aberto.
- **Ação "Timer / Pomodoro"**: iniciar, pausar, continuar ou zerar um timer (1 a 180 min, padrão 25).
  - O timer continua com o menu fechado. Ativo, o centro do menu mostra o tempo que falta, com o arco esvaziando.
  - No fim, toca o som do Windows e a dica do ícone da bandeja avisa.
  - Parado, ele não gasta nada: a thread do timer dorme até o fim.
- O teste do seletor de temas ganhou mais tempo-limite e conta só os cartões de tema.

## 0.36.0

- **Ação "Layout de janelas"**: arrume as janelas como quiser (lado a lado, cada uma num monitor, maximizadas) e clique em **Capturar janelas abertas agora**. A fatia devolve cada janela a esse lugar, com o tamanho, o monitor e o estado (normal, maximizada ou minimizada).
  - As janelas são reconhecidas pelo programa e pelo título. Com duas janelas do mesmo app, vale a de título mais parecido.
  - Opção **Abrir os apps que não estiverem abertos**: abre o programa e posiciona a janela quando ela aparece.
  - A lista do editor mostra cada janela capturada, e dá para tirar as que não interessam.
- **Ajustes da 0.35.0:**
  - os testes do texto pronto nunca colam nada de verdade;
  - a memória dos marcadores da área de transferência é liberada se o Windows recusar.

## 0.35.0

- **Ação "Texto pronto (colar)"**: cola um texto modelo no app que estava em uso. Bom para respostas e assinaturas.
  - Variáveis trocadas na hora: {data}, {datalonga}, {hora}, {datahora} e {clipboard} (em inglês também valem {date}, {longdate}, {time}, {datetime}). Os botões do editor inserem a variável no cursor.
  - Por padrão, o que estava na área de transferência volta logo depois de colar.
  - O texto colado não entra no histórico da Kira nem no Win+V.
- **Calculadora na busca**: com o menu aberto, digite "=" e a conta (ex.: =2*35, =(10+5)/3, =2^10, =15%4, com vírgula ou ponto). O resultado aparece como fatia, e Enter ou um clique cola o número no app que estava em uso.

## 0.34.0

- **Controle do OBS Studio** pelo servidor WebSocket local que já vem no OBS 28 ou mais novo. Nada passa pela internet.
  - **Página OBS** nas Configurações: porta e senha (guardada cifrada neste PC, fora do backup e da exportação), com o botão **Salvar e testar**, que mostra a versão do OBS e a cena atual.
  - **Submenu automático "Cenas do OBS"**: as cenas na ordem do OBS, com a atual em verde; clique para trocar.
  - **Ação "OBS Studio"**: trocar de cena, iniciar/parar/alternar gravação e transmissão, pausar a gravação, salvar o replay, ligar a câmera virtual e mutar uma fonte de áudio. O editor sugere as cenas e as fontes do OBS aberto.
  - Cada comando abre a conexão, executa e fecha: com o menu fechado, nada fica rodando. A Kira de teste usa um OBS de mentira e nunca toca no OBS de verdade.
- **Ajustes da 0.33.0:**
  - a leitura dos projetos do VS Code usa um arquivo temporário diferente a cada vez;
  - um erro no VS Code comum não impede mais de tentar o Insiders;
  - a lista de VPNs conectadas não para mais em 8.

## 0.33.0

- **Dois submenus automáticos novos** (em Itens → fatia → Submenu automático):
  - **Projetos do VS Code**: as pastas e workspaces da lista "Abrir recente" do VS Code; clique abre o projeto no VS Code. Lê o histórico do VS Code atual e também o formato antigo, sem travar os arquivos dele.
  - **VPNs**: as VPNs salvas no Windows, com a conectada em verde; clique conecta ou desconecta. Usa o usuário e a senha salvos; sem eles, abre a janela de conexão do Windows.
- **Ação nova "VPN"**: conectar, desconectar ou alternar uma VPN pelo nome, para usar numa fatia, num atalho ou numa sequência. O campo sugere as VPNs salvas.
- A Kira de teste nunca conecta nem desconecta VPNs de verdade: ela só mostra uma VPN fingida.

## 0.32.0

- **Três temas novos (pacote "Tecnologia 2")**, em Aparência → Tema:
  - **Osciloscópio**: tela de fósforo verde com retícula e uma onda viva que gira devagar em volta das fatias;
  - **Fibra Óptica**: fios de luz azuis, violeta e rosa saindo do anel, com pulsos correndo para fora;
  - **Válvulas Nixie**: tubos de vidro com dígitos laranja em volta do anel, metal escuro com tela hexagonal, e relógio e CPU no estilo de válvula.
- Como nos outros temas, as animações são poucas e leves, param com o menu fechado e desligam com "reduzir movimento" do Windows.

## 0.31.3

- **Atualizar a cópia instalada** (`scripts/update-installed.ps1`):
  - não acusa mais "não ficou em execução" quando a Kira abriu normalmente; o caminho dos processos agora é lido de um jeito que funciona nesta máquina, e o script espera até 10 s;
  - não encerra mais uma Kira de teste aberta.
- **Kira de teste:** o gravador de atalho não instala mais o hook de teclado do sistema, que pegaria o teclado real. Os testes entregam a combinação pelo comando `qa_key_capture`. A Kira normal não muda.
- **Kira de teste:** salvar uma mudança de atalho ou de modo de abertura não registra mais o atalho de verdade no Windows. Ela só confere se a combinação é válida. A inicialização, as teclas do knob e os atalhos de fatia já tinham essa trava.

## 0.31.2

- **Interface em inglês (parte 3, final):** com o idioma em English, passam a sair em inglês também:
  - as mensagens de validação (a lista de problemas que impedem salvar);
  - as descrições automáticas das ações (busca, listas), os horários dos perfis ("Mon–Fri"), as cores do tema personalizado e as diferenças de backup;
  - as mensagens de erro vindas do sistema (ações, Discord, print, áudio, brilho, rádios, atualizações) e o menu da bandeja, que muda de idioma assim que você salva.
- O log de diagnóstico continua em português.

## 0.31.1

- **Interface em inglês (parte 2): as Configurações inteiras** seguem o idioma escolhido em Geral → Idioma / Language.
  - Isso inclui todas as páginas, os campos de cada tipo de ação, os avisos de salvar, a pré-visualização e o arrastar nela.
  - Nomes de temas embutidos e suas descrições também mudam de idioma.
- **Centro do menu:** a data agora segue o idioma (antes ficava sempre em português). A hora continua em 24 h.
- O rótulo de acessibilidade do menu e do ícone flutuante também segue o idioma.
- **Ainda em português (próxima versão):** mensagens de validação ("problemas que impedem salvar"), descrições automáticas de ações e de horários de perfil, e mensagens de erro vindas do sistema.

## 0.31.0

- **Interface em inglês (parte 1):** nova opção **Idioma / Language** em Configurações → Geral: **Automático** (padrão: português se ele estiver na sua lista de idiomas do Windows, mesmo que não seja o 1º; senão inglês), **Português** ou **English**.
  - A troca vale na hora, antes mesmo de salvar.
  - **Já traduzidos:** o menu (centro, busca, avisos de erro), os nomes dos submenus automáticos e os itens que eles geram, a confirmação de desligar/reiniciar/encerrar sessão, o preview e o print fixado, e a tela de erro.
  - **Ainda em português:** as páginas das Configurações (próxima versão) e as mensagens de erro vindas do sistema.
  - Nomes de fatias, perfis e temas criados por você não são traduzidos.
- Valor de idioma inválido no arquivo de configuração é ignorado (vira Automático) em vez de impedir a leitura da config.

## 0.30.0

- **Atualização automática:** a Kira procura versões novas no repositório público de releases (`Hideki515/Kira-Radial-releases`; o código continua privado).
  - **Quando procura:** 30 s depois de iniciar e uma vez por dia. Dá para desligar em Configurações → Geral → **Atualizações**, onde também há "Procurar agora".
  - **Quando há versão nova:**
    - aparece um aviso no topo das Configurações e a dica da bandeja muda;
    - a seção mostra o que mudou e o botão **"Atualizar e reiniciar"**, que baixa, instala e reabre a Kira.
  - **Nada é instalado sem um clique seu**, e só são aceitas versões **assinadas** pela chave da Kira (a chave pública vem embutida no app).
- **Publicação** (para o desenvolvedor):
  - `scripts/release.ps1` gera o instalador assinado e o `latest.json` e publica no repositório público; `-DryRun` confere tudo sem publicar;
  - a chave privada fica fora do repositório, com a senha no Gerenciador de Credenciais do Windows;
  - `update-installed.ps1` passou a assinar também.

## 0.29.1

- **Arrastar na pré-visualização:**
  - Esc cancela o arrasto sem mudar nada, assim como quando o Windows toma o ponteiro (ex.: a janela perde o foco no meio do arrasto);
  - a seleção depois de soltar passa a ser calculada antes de alterar o rascunho, o que deixa mais robusto o "o item continua escolhido onde caiu".

## 0.29.0

- **Editar arrastando na pré-visualização** (Configurações → Itens):
  - **clicar** numa fatia ou subitem do desenho escolhe o item para editar, como na lista;
  - **arrastar uma fatia** para outra posição do anel reordena;
  - **parar meio segundo sobre uma fatia com submenu** abre o sub-anel dela, e soltar lá **põe o item dentro do submenu**; soltar na própria fatia-mãe aberta põe no fim;
  - **arrastar um subitem para o anel principal** transforma ele em fatia;
  - um "fantasma" com o ícone acompanha o ponteiro, e uma dica diz o que vai acontecer ao soltar (ou por que não pode);
  - **limites respeitados:** de 3 a 10 fatias, até 8 subitens, sem submenu dentro de submenu e nada entra em submenu automático.
- A lista ao lado continua com arrastar pela alça, botões e Alt+↑/↓.

## 0.28.0

- **Busca por digitação:** com o menu aberto, comece a digitar e as fatias viram os resultados.
  - Procura fatias e subitens de **todos os perfis**, pelo nome e pelo que fazem (ex.: "github.com" acha a fatia do site).
  - Ignora acentos e maiúsculas e entende iniciais: "cs" acha "Configurações do Sistema".
  - Até 8 resultados. O 1º já vem escolhido: Enter executa. Setas, roda e knob navegam, e um resultado com subitens abre o sub-anel.
  - O centro mostra o texto digitado e quantos resultados há.
  - Backspace apaga uma letra, Esc limpa a busca e um 2º Esc fecha o menu.
  - Sem busca, as teclas 1–9 continuam escolhendo a fatia direto. Depois de começar a digitar, os números entram no texto.
  - Submenus automáticos (áudio, janelas etc.) ficam de fora, porque o conteúdo deles é gerado na hora.

## 0.27.0

- **Atalho global por fatia:** uma fatia (ou subitem) pode ter um atalho de teclado próprio, que executa a ação dela **sem abrir o menu**, de qualquer lugar do Windows e em qualquer perfil.
  - Fica no editor do item, em "Atalho global (opcional)", e a lista mostra um selo com o atalho.
  - Combina com as teclas livres de um teclado macro (ex.: F13–F24, que não digitam texto).
  - Atalhos de teclado, colar e "Controlar a janela" agem no app que está em foco na hora.
  - **Validação:**
    - o atalho precisa de Ctrl, Alt, Shift ou Win (ou ser uma tecla F);
    - não pode repetir entre fatias nem bater com o atalho do menu ou com as teclas do knob;
    - só fatias que executam uma ação aceitam atalho, e desligar, reiniciar e encerrar sessão não aceitam (para não desligar sem perguntar).
  - Se o Windows não deixar registrar (atalho em uso por outro programa), o erro aparece no editor.

## 0.26.0

- **Ação nova "Várias ações em sequência":** uma fatia faz várias coisas de uma vez, por exemplo abrir o VS Code, depois o terminal e mutar o Discord.
  - De 2 a 10 passos, cada um com o tipo e os campos de sempre. Dá para subir, descer, remover e adicionar passos.
  - Intervalo ajustável entre os passos (padrão 300 ms), para dar tempo de um app abrir antes do próximo.
  - Cada passo se comporta como sozinho: atalhos e colar devolvem o foco ao app anterior, o preview do print arma e o navegador geral vale para os sites.
  - Se um passo falha, os seguintes não rodam, e o aviso diz qual passo foi.
  - Desligar, reiniciar e encerrar sessão não entram numa sequência, e não dá para pôr sequência dentro de sequência.
- **Segurança:** o botão "Testar ação" das Configurações fica desabilitado para desligar, reiniciar e encerrar sessão. Antes ele executava esses comandos sem pedir confirmação.

## 0.25.3

Versão de manutenção, sem mudanças visíveis.

- **Testes de ponta a ponta confiáveis:**
  - a espera pela Kira de teste anterior voltou a funcionar (o caminho do exe agora vem pelo CIM);
  - o teste não falha mais quando há um aviso na tela;
  - cenários novos: rótulos dentro da fatia e confirmação de Desligar à prova de duplo clique (com a trava da Kira de teste conferida antes).
- **Código dividido,** sem mudar o comportamento:
  - o menu (`RadialApp`) passou de 491 para ~300 linhas; confirmação, mouse/teclado/roda, knob e pré-cálculo de rótulos viraram hooks próprios;
  - o editor de ações passou de 456 para 70 linhas, com cada tipo de ação no seu arquivo (`src/settings/actions/`);
  - a página Itens foi dividida em lista (`ItemTree`) e editor (`ItemEditor`).
- **Cobertura de testes:** linhas 87% → 90% e funções 77% → 81%.
  - Testes novos para a medida dos rótulos (com canvas falso), os campos de cada ação e adicionar, remover e editar itens.
  - `npm run coverage` agora falha abaixo de 85% de linhas ou 80% de funções.

## 0.25.2

- **Nomes que não cabiam na fatia** (ex.: "MICROFONE MUTADO" e "ENSURDECIDO" no sub-anel) agora se ajustam ao formato da fatia.
  - Cada rótulo é medido com a fonte real do tema contra o espaço livre dentro da fatia, na altura do texto. Nas fatias inclinadas, o texto se desloca para o trecho mais largo.
  - **Ordem dos ajustes:**
    1. se cabe, fica como está;
    2. senão, a fonte diminui um pouco;
    3. senão, o nome quebra em duas linhas e o ícone sobe para compensar;
    4. em último caso, o nome é cortado com "…", e o nome inteiro continua na dica do mouse.
  - A medida é feita uma vez por tema e nome e fica guardada, então reabrir o menu não mede de novo.

## 0.25.1

- **Confirmação de desligar, reiniciar e encerrar sessão:** em vez da caixa padrão do Windows, aparece um diálogo próprio sobre o menu, com ícone, título, pergunta e os botões **Desligar** (vermelho) e **Cancelar**.
  - **Mouse:** clicar fora cancela.
  - **Teclado:** Enter confirma o botão destacado, Esc cancela, e as setas ou o Tab trocam de botão. Segurar o Enter que escolheu a fatia não confirma sozinho.
  - **Knob:** girar troca o botão; apertar escolhe.
  - Com o diálogo aberto, o resto do menu não reage.
  - **Contra cliques acidentais:** nos primeiros 400 ms o diálogo ignora confirmações, para que o 2º clique de um duplo clique na fatia não desligue. O destaque dos botões só muda quando o mouse se move.
- **Segurança da Kira de teste:** desligar, reiniciar, encerrar sessão, suspender e bloquear nunca rodam de verdade na variante de testes.

## 0.25.0

- **Preview do print.** Depois de uma fatia que tira print (Captura de tela / Win+Shift+S, PrtSc do Lightshot e outros), a Kira mostra o print num canto da tela.
  - **Botões:** Copiar, Salvar como (PNG), Abrir pasta, Editar (Paint) e Fixar na tela. Abrir pasta só aparece quando o print foi salvo em arquivo.
  - **Fixar na tela:** janela "sempre no topo" com o print inteiro; arraste para mover, Esc ou × para fechar.
  - **Comportamento:**
    - some sozinho depois de 6 s, mas não enquanto o mouse estiver em cima;
    - um print novo substitui o anterior.
  - **Como o print é reconhecido:** a Kira espera até 1 min pelo print, que pode chegar pela área de transferência (Win+Shift+S, Ctrl+C do Lightshot) ou como arquivo novo na pasta de capturas do Windows e nas pastas que você adicionar. Fora desse intervalo nada é observado, e prints tirados fora da Kira não geram preview.
  - **Privacidade:** o print fica só na memória, até o próximo ou até fechar.
- **Configurações → Geral → "Preview de capturas":** liga e desliga, tempo na tela, canto, tempo de espera e pastas de prints.
- **Ação "Enviar atalho":** opção nova "É uma ferramenta de print", para atalhos próprios como o do ShareX. PrtSc e Win+Shift+S já são reconhecidos.

## 0.24.0

**6 temas tecnológicos novos** (agora são 21). Cada um tem poucas animações agrupadas, para gastar pouco com o menu aberto.

| Tema | Visual |
|---|---|
| Circuito | placa verde com trilhas douradas saindo do anel e vias acendendo |
| Radar | escopo com grade polar, varredura girando e alvos piscando |
| Quântico | órbitas atômicas em volta do centro, com elétrons de luz correndo |
| Blueprint | planta técnica azul com grade, cotas e carimbo, sem animação |
| Data Center | painel de rack grafite com LEDs de status verdes, âmbar e azuis |
| Rede Neural | camadas de neurônios ligados, com pulsos de ativação |

## 0.23.0

**6 temas novos** (agora são 15). Todos seguem a cor de destaque, servem de base para temas personalizados e respeitam "reduzir movimento" do Windows.

| Tema | Visual |
|---|---|
| Sakura | ameixa escuro e rosa-cerejeira, com flores e pétalas caindo |
| Oceano | azul profundo, ondas saindo do anel e bolhas subindo |
| Aurora | noite estrelada com faixas de aurora verde e roxa ondulando |
| Magma | preto vulcânico com rachaduras de lava pulsando e brasas subindo |
| Pixel | retrô 8-bit, com moldura em degraus, fonte monoespaçada e brilhos piscando |
| Papel | claro, folha de caderno com margem e letra à mão |

## 0.22.1

- **Ícone que "não aparecia":** depois de esconder o ícone (botão direito ou bandeja), trocar o modo de abertura para "Ícone" ou "Ícone + atalho" não fazia nada visível. Agora, ao escolher um modo com ícone vindo de um modo sem ícone, o ícone volta a aparecer. Esconder de propósito, com o ícone já ativo, continua valendo.
- **Knob:**
  - se uma tecla do knob não voltar a funcionar depois de gravar um atalho nas Configurações, o erro agora aparece na página, em vez de falhar em silêncio;
  - o registro das teclas não segura mais a trava interna durante a chamada ao Windows, o que evita um travamento possível no futuro.

## 0.22.0

- **Controle com knob (teclado macro):** o knob de um teclado macro, como os de 3 teclas + knob com o programa "MINI KeyBoard", vira um controle dedicado da Kira.
  - Apertar com a Kira fechada **abre o menu**.
  - Girar com o menu aberto **passa pelas fatias**.
  - Apertar de novo **executa a fatia escolhida**, ou abre o submenu já no 1º item.
  - No submenu, o giro inclui a posição **Voltar** (o centro), porque o knob não tem toque longo.
  - Opcional: girar com o menu fechado ajusta o volume.
- **Configurações → Atalho → "Controle com knob":**
  - liga e desliga o controle;
  - tem três caixas com detecção da tecla (gire e aperte o knob);
  - avisa sobre teclas repetidas, iguais ao atalho do menu ou já em uso por outro programa.
- **Teclas:** configure o knob para enviar F13, F14 e F15 (o padrão), que nenhum teclado comum tem. Se o programa do teclado não oferecer F13–F24, use combinações raras.

## 0.21.0

- **Controle do Discord** pelo RPC local do próprio Discord:
  - mutar e desmutar o microfone;
  - ensurdecer e reativar o áudio (fone);
  - trocar o dispositivo de entrada e o de saída **do Discord** (não os do Windows).
- **Submenus automáticos novos:**
  - "Discord: microfone e fone" mostra o estado atual (verde = ligado) e alterna ao clicar;
  - "Discord: entrada" e "Discord: saída" listam os dispositivos do Discord, com o atual em verde.
- **Ação nova "Discord"** para comandos diretos: alternar, mutar ou desmutar, ensurdecer, e usar um microfone ou uma saída específica.
- **Página nova Configurações → Discord:**
  - passo a passo para criar o app no portal do Discord (uma vez);
  - botões Conectar, Testar e Desconectar.
- **Segurança:**
  - o Client Secret e os tokens ficam cifrados (DPAPI) em `discord.bin`, fora do `config.json`, então não vão para backups, exportação nem relatório;
  - o token é renovado sozinho antes de vencer.
- **Consumo e testes:**
  - sem processo em segundo plano: a conexão só abre quando uma ação do Discord é usada;
  - a Kira de teste usa um Discord falso e nunca toca no Discord de verdade.

## 0.20.4

Versão de manutenção, sem mudanças visíveis.

- **Atualizações:** React 19, lucide-react 1.x (ícones) e TypeScript 7.
  - O lucide 1.x removeu os logotipos de marcas. Fatias com o ícone "github" agora mostram o ícone de Git, e a configuração continua valendo.
  - Com o React 19, o código do front ficou ~80 KB maior (lido do disco uma vez por janela).
- **Menu radial reorganizado,** sem mudança de comportamento: o `RadialApp.tsx` caiu de 484 para ~400 linhas.
  - "Tocando agora", volume pela roda, avisos e medições de abertura foram para `menuHooks.ts`.
  - As contas de navegação (setas, roda, teclas 1–9) foram para `navigation.ts`, com testes próprios.

## 0.20.3

- **Configurações:** o Ctrl+S agora só salva quando há mudanças, como o botão Salvar. Antes, ele regravava a configuração mesmo sem nada alterado.
- **Testes da janela de Configurações:**
  - salvar, descartar e Ctrl+S;
  - erros de validação e falha ao salvar;
  - aviso de atalho que não registrou;
  - página Ícone conforme o modo de abertura.
- A cobertura do front subiu para ~86% das linhas.

## 0.20.2

Versão de robustez, sem mudanças visíveis.

- **Um erro raro não derruba mais a Kira inteira.** As travas de dados compartilhados (config, área de transferência, atalho, captura de tecla etc.) agora se recuperam sozinhas. Antes, uma falha com uma delas presa fazia todas as operações seguintes falharem até reiniciar a Kira.
- **Política de segurança de conteúdo (CSP)** no menu, nas Configurações e no ícone:
  - as páginas só carregam scripts da própria Kira;
  - imagens e sons só da própria Kira ou embutidos;
  - nada de sites externos, formulários ou frames.
  - Qualquer bloqueio aparece no log (Configurações → Diagnóstico).
- **Testes de ponta a ponta novos (15 cenários):**
  - o ícone encostado na borda mantém o hover e recebe o clique em toda a parte visível, nas quatro bordas;
  - nenhuma janela teve algo bloqueado pela CSP, e ela está mesmo ativa.
- Testes do registro de erros e do monitor de quadros (`perf.ts`).

## 0.20.1

- **Removido o "brilho por software" da 0.20.0.** A Kira volta a ajustar só o brilho de verdade do aparelho: a tela do notebook e os monitores com DDC/CI. Monitores sem esse controle, como muitos portáteis ligados por USB-C, não aparecem na lista de brilho.
- Continua: o nome real de cada monitor (ex.: "ARZOPA") no lugar de "Monitor PnP genérico", no brilho, nos perfis por monitor e em "Identificar".

## 0.20.0

- **Brilho por software para monitores sem DDC/CI** (ex.: monitores portáteis como o Arzopa, por USB-C ou HDMI):
  - Monitores que não aceitam controle de brilho agora aparecem nas fatias de brilho e no submenu automático, com "(por software)" no nome.
  - A Kira põe uma camada escura sobre aquele monitor:
    - não bloqueia o mouse nem pega o foco;
    - não aparece em prints nem em compartilhamento de tela;
    - só escurece: 100% é o brilho configurado no próprio monitor;
    - o mínimo deixa a tela ~85% mais escura, ainda legível.
  - O nível de cada monitor fica salvo e volta ao abrir a Kira. A camada acompanha mudanças de resolução e posição, e some se o monitor for desconectado (volta ao reconectar).
  - Monitores com DDC/CI e a tela do notebook continuam com o controle de verdade.
- **Nomes reais dos monitores:** no lugar de "Monitor PnP genérico", aparece o nome gravado no próprio monitor (ex.: "ARZOPA") no brilho, nos perfis por monitor e em "Identificar".

## 0.19.3

- **Ícone encostado na borda da tela:** ao passar o mouse, o orbe aparecia cortado por uma linha reta.
  - Causa: a janela do ícone ficava metade para fora da tela, e o orbe saía dela ao deslizar para dentro.
  - Agora a janela fica inteira na tela, encostada na borda, e o orbe desliza dentro dela: em repouso continua com metade escondida e, ao passar o mouse, aparece inteiro, encostado na borda (não foge do cursor nem pisca com o mouse na beirada da tela).
  - O encaixe ficou mais tolerante: um arrasto curto não solta o ícone da borda, e ele continua encaixado em qualquer tamanho ou escala de tela.
  - Quem já tinha o ícone encostado é ajustado sozinho ao abrir a Kira.

## 0.19.2

Versão de manutenção, sem mudanças visíveis no app.

- **Ferramentas de desenvolvimento atualizadas:** vite 8, vitest 5, @vitejs/plugin-react 6, jsdom 31 e WebdriverIO 10.
  - O `npm audit` caiu de 28 alertas (2 críticos) para 14 moderados, todos no `glob`/`minimatch` usados pelo mocha dos testes E2E.
  - As dependências que vão no app continuam sem nenhum alerta.
- **Cobertura de testes:** `npm run coverage` mostra o resumo no terminal e grava o relatório em `coverage/index.html`.
  - Ponto de partida: ~81% das linhas do front.
  - Limite por teste subiu para 20 s: com cobertura e a CPU disputada, os testes de página inteira passavam de 5 s.
  - O relatório sai mesmo quando algum teste falha.
- Testes novos para a página **Perfis**: lista, executáveis associados, apps abertos, duplicar, excluir e renomear.
- `npm test` passa por `scripts/vitest.mjs`, que corrige a letra da unidade da pasta atual. No Git Bash ela vem como `d:\` e o Vitest 5 não acha nenhum teste.
- Código reorganizado, sem mudar o comportamento:
  - as ações de sistema foram para `actions/system.rs` e os testes para `actions/tests.rs`;
  - os textos das ações e do tempo de abertura foram para `shared/describe.ts`, ainda exportados por `ipc.ts`.

## 0.19.1

- **Submenu de brilho:** fechar o menu antes de os monitores responderem não deixa mais um nível antigo destacado na próxima abertura.
- **Perfis:** um "Quando usar" mal formado na config (editada à mão) é ignorado e não derruba mais a configuração inteira. Horário impossível (ex.: "25:00"), faixa vazia ou dia inexistente não fazem mais o perfil valer o tempo todo.
- **Temas personalizados:** cores ou entradas inválidas na config (editada à mão) não quebram mais o menu nem as Configurações. Cor inválida usa a cor padrão.
- Scripts de build sem o aviso DEP0190 do Node.
- Repositório com quebra de linha LF padronizada (`.gitattributes`), o que acaba com os avisos de CRLF a cada commit.
- Testes novos: leitura atrasada do brilho, invalidação do cache após a ação, `when` e temas mal formados.

## 0.19.0

- **Tempo de abertura do menu no Diagnóstico** (Configurações → Diagnóstico → "Abertura do menu"):
  - Mostra a média, 90% das aberturas, a pior e a última, nas últimas 50 aberturas da sessão.
  - A medida vai do atalho ou do clique no ícone até o primeiro quadro do menu na tela.
  - Fica só na memória e some ao fechar a Kira.
- **Submenus automáticos mais rápidos de reabrir:** as leituras lentas são reaproveitadas por alguns segundos, em vez de serem refeitas a cada abertura.
  - Brilho, que lê cada monitor por DDC/CI: 15 s.
  - Planos de energia: 10 s.
  - Wi-Fi/Bluetooth: 5 s.
  - Depois de uma ação que muda o próprio dado (trocar o brilho, o plano ou o rádio), a próxima abertura lê de novo.
  - Uma leitura que falha não é guardada.
  - Leituras com mais de 250 ms vão para o log.
- Testes E2E: o cenário "Diagnóstico" confere que as aberturas do menu foram medidas.
- E2E mais estável em rodadas seguidas: cada rodada espera a Kira de teste anterior fechar e o tauri-driver ficar pronto.

## 0.18.0

- **Desempenho: a Kira parada quase não gasta mais nada.** Antes, mesmo com tudo escondido, o WebView2 continuava desenhando as animações da janela de configurações, que ninguém via.
  - Medido na Kira de teste com todas as janelas escondidas: de **~57% de um núcleo para ~0,4%**.
  - Na Kira instalada, a medida de antes foi de ~1,4 núcleo.
  - **Configurações:** escondidas, não desenham. Ao fechar, a página é suspensa e devolve memória (o renderer caiu de ~170 para ~80 MB). Abrir de novo retoma de onde estava.
  - **Ícone flutuante:** quando escondido, também para de desenhar.
- **Ícone flutuante mais leve e com a opção "Animação"** (Configurações → Ícone):
  - **Sempre**: o orbe animado de sempre, agora limitado a ~30 quadros/s. O custo caiu de ~33% para ~17% de um núcleo.
  - **Só ao passar o mouse**: fica parado e anima quando o mouse passa por cima (~0,6%).
  - **Parado**: sem animação.
  - Nos três casos, com CPU alta o núcleo continua pulsando como alerta.
- As **miniaturas dos temas** (Aparência) só animam com o mouse em cima.
- As Configurações só deixam de desenhar depois de terminar de carregar e se ainda estiverem escondidas. Abrir logo após iniciar (ex.: atalho em conflito) continua normal.
- QA: nova medição `npm run perf:idle`, que reprova se a Kira de teste parada passar de 5% de um núcleo. Novo cenário E2E "fechar e reabrir as Configurações" (13 no total).

## 0.17.0

- **Brilho por monitor:**
  - A ação **Brilho da tela** ganhou o campo **Tela**, com estas opções:
    - **Todas as telas** (padrão da ação, como antes);
    - **Onde o menu abriu**;
    - um monitor específico, mostrado com número, nome e brilho atual (ex.: "2. Monitor 2 (AOC2402) — 50%").
  - O campo tem o botão **Identificar**. Aumentar e diminuir 10% também respeitam a tela escolhida.
  - O **submenu automático "Brilho"** tem a mesma escolha. O padrão agora é **Onde o menu abriu**, e o nível em destaque é o da tela escolhida.
  - Cada monitor é guardado pela identificação permanente do Windows, então a escolha não se perde quando os monitores mudam de ordem. Se o monitor não for encontrado, a Kira procura pelo nome. Configs antigas ("ddc:N") continuam valendo.
  - A tela do notebook agora é reconhecida pelo tipo de saída que o Windows informa.
- Correção: o limite de 2048 caracteres do endereço num navegador escolhido agora conta bytes, como no Rust, porque letras acentuadas ocupam mais de um byte.
- Testes E2E: novo cenário "submenu Brilho com tela escolhida" (12 cenários no total). Ele só abre o sub-anel e nunca muda o brilho.

## 0.16.0

- **Escolher o navegador** ao abrir sites:
  - Na ação **Abrir site** aparece o campo **Navegador**: "Navegador geral", "Padrão do Windows" ou um dos navegadores instalados (Chrome, Edge, Firefox, Brave, Opera, Vivaldi, Zen…), detectados sozinhos pelo registro do Windows.
  - **Abrir em janela anônima** (InPrivate no Edge).
  - **Perfil do navegador** (Pessoal, Trabalho…) no Chrome, Edge, Brave e Vivaldi. A Kira só lê a lista de perfis.
  - Configurações → Geral → **Navegador para sites**: o navegador usado por todas as fatias que não escolhem um próprio.
  - Se o navegador escolhido for desinstalado, o site abre no padrão do Windows e o log registra um aviso.
  - Segurança: o endereço vai como um único argumento para o navegador. Só são aceitos http(s) sem espaços nem aspas, então não dá para injetar opções.
- Testes E2E: novo cenário "navegador" (11 cenários no total), sem abrir nenhum navegador.

## 0.15.0

- **Editor de tema** (Configurações → Aparência):
  - **+ Criar tema**: escolha de qual tema embutido vêm as decorações (anéis, esfera, engrenagens…) e ajuste 10 cores: destaque, fundo, fatias, borda, texto, fatia ativa, texto ativo, centro, texto do centro e medidor.
  - Pré-visualização ao vivo, e o tema vira um cartão ao lado dos 9 embutidos.
  - **Duplicar**, **Excluir** e **Exportar/Importar** em JSON (`.kira-theme.json`) para compartilhar. A importação valida o formato, as cores e o tamanho.
  - Os temas personalizados são só cores (variáveis CSS), sem CSS livre.
- Correção ("Quando usar" dos perfis): numa faixa que passa da meia-noite, a madrugada agora conta como o dia anterior. "Sexta 22:00–02:00" vale às 01:00 de sábado e não às 01:00 de sexta.
- Testes E2E: novo cenário "editor de tema" (10 cenários no total).

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
