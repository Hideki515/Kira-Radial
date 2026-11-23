// Textos em português (idioma de origem). As chaves daqui definem o tipo `Key`:
// faltar uma chave em en.ts é erro de TypeScript.
import { ptSettings } from "./pt.settings";
import { ptShared } from "./pt.shared";

export const pt = {
  // --- comum
  "common.loading": "Carregando…",
  "common.cancel": "Cancelar",
  "common.close": "Fechar",

  // --- submenus automáticos (itens gerados)
  "dyn.none.outputs": "Sem saídas",
  "dyn.none.inputs": "Sem entradas",
  "dyn.none.windows": "Nenhuma janela",
  "dyn.none.power": "Sem planos",
  "dyn.none.brightness": "Sem suporte",
  "dyn.none.radios": "Sem rádios",
  "dyn.none.recent": "Nada recente",
  "dyn.none.clipboard": "Vazio",
  "dyn.none.vscode": "Nenhum projeto",
  "dyn.none.vpns": "Nenhuma VPN",
  "dyn.none.obs": "Nenhuma cena",
  "dyn.obs.closed": "OBS fechado",
  "dyn.obs.password": "Senha do OBS",
  "dyn.obs.error": "OBS sem resposta",
  "dyn.label.obsScenes": "Cenas do OBS",
  "dyn.hint.obsScenes": "as cenas do OBS, na mesma ordem dele. A atual aparece em verde; clique para trocar. Precisa ligar o servidor WebSocket do OBS (veja Configurações → OBS).",
  "dyn.radio.on": "{name} ligado",
  "dyn.radio.off": "{name} desligado",
  "dyn.discord.closed": "Discord fechado",
  "dyn.discord.notConnected": "Conectar nas Configurações",
  "dyn.discord.error": "Discord sem resposta",
  "dyn.discord.micOn": "Microfone ligado",
  "dyn.discord.micMuted": "Microfone mutado",
  "dyn.discord.audioOn": "Áudio ligado",
  "dyn.discord.deafened": "Ensurdecido",
  "dyn.discord.default": "Padrão",

  // --- nomes e explicações dos submenus automáticos (página Itens)
  "dyn.label.audioOutputs": "Saídas de áudio",
  "dyn.label.windows": "Janelas abertas",
  "dyn.label.powerPlans": "Planos de energia",
  "dyn.label.brightness": "Brilho da tela",
  "dyn.label.radios": "Wi-Fi e Bluetooth",
  "dyn.label.recentFiles": "Arquivos recentes",
  "dyn.label.clipboard": "Área de transferência",
  "dyn.label.discordVoice": "Discord: microfone e fone",
  "dyn.label.discordInput": "Discord: entrada (microfone)",
  "dyn.label.discordOutput": "Discord: saída (fone)",
  "dyn.label.vscodeProjects": "Projetos do VS Code",
  "dyn.label.vpns": "VPNs",
  "dyn.hint.audioOutputs": "as saídas de áudio reconhecidas pelo Windows. A saída em uso aparece em verde; clique em outra para trocar.",
  "dyn.hint.windows": "as janelas abertas mais recentes, com o ícone de cada app. Clique numa para trazê-la para a frente.",
  "dyn.hint.powerPlans": "os planos de energia do Windows. O plano ativo aparece em verde; clique em outro para trocar.",
  "dyn.hint.brightness": "níveis de brilho (10% a 100%) aplicados à tela escolhida abaixo — tela do notebook e monitores com DDC/CI. O nível mais próximo do atual aparece em verde.",
  "dyn.hint.radios": "o Wi-Fi e o Bluetooth do PC. Ligado aparece em verde; clique para ligar/desligar.",
  "dyn.hint.recentFiles": "os arquivos abertos recentemente no Windows (os mesmos de \"Recentes\" no Explorador). Clique para abrir.",
  "dyn.hint.clipboard": "os últimos textos copiados. Clique para colar no app que estava em uso. Precisa ligar o histórico em Configurações → Geral (fica só na memória).",
  "dyn.hint.discordVoice": "o microfone e o fone do Discord, com o estado atual (verde = ligado). Clique para mutar/desmutar ou ensurdecer. Precisa conectar em Configurações → Discord.",
  "dyn.hint.discordInput": "os microfones que o Discord reconhece (os do próprio Discord, não do Windows). O atual aparece em verde. Precisa conectar em Configurações → Discord.",
  "dyn.hint.discordOutput": "as saídas de áudio que o Discord reconhece (as do próprio Discord, não do Windows). A atual aparece em verde. Precisa conectar em Configurações → Discord.",
  "dyn.hint.vscodeProjects": "as pastas e workspaces abertos recentemente no VS Code (os mesmos de \"Abrir recente\"). Clique para abrir no VS Code.",
  "dyn.hint.vpns": "as VPNs salvas no Windows (Configurações → Rede → VPN). A conectada aparece em verde; clique para conectar ou desconectar. Usa o usuário e a senha salvos; sem eles, abre a janela de conexão do Windows.",

  // --- centro do menu
  "hub.back": "Voltar",
  "hub.search": "BUSCAR",
  "hub.results.none": "NENHUM",
  "hub.results.one": "{n} RESULTADO",
  "hub.results.many": "{n} RESULTADOS",
  "hub.escClears": "ESC LIMPA",
  "hub.timer": "TIMER",
  "hub.timerPaused": "PAUSADO",
  "hub.net": "REDE",

  // --- menu
  "menu.failed": "Falha em {label}: {error}",
  "menu.devHint": "Modo navegador · botão direito abre no cursor · Esc fecha · setas/roda navegam ·",
  "menu.devSettings": "configurações",
  "menu.aria": "Menu radial",
  "orb.aria": "Abrir o menu Kira",

  // --- confirmação
  "confirm.shutdown.title": "Desligar",
  "confirm.shutdown.message": "Tem certeza que deseja desligar o computador?",
  "confirm.shutdown.button": "Desligar",
  "confirm.restart.title": "Reiniciar",
  "confirm.restart.message": "Tem certeza que deseja reiniciar o computador?",
  "confirm.restart.button": "Reiniciar",
  "confirm.signout.title": "Encerrar sessão",
  "confirm.signout.message": "Tem certeza que deseja encerrar a sessão?",
  "confirm.signout.button": "Encerrar",

  // --- preview do print
  "shot.title": "Print · {w}×{h}",
  "shot.copy": "Copiar",
  "shot.copied": "Copiado!",
  "shot.saveAs": "Salvar como…",
  "shot.saveShort": "Salvar",
  "shot.savedTo": "Salvo em {path}",
  "shot.openFolder": "Abrir pasta",
  "shot.folderShort": "Pasta",
  "shot.edit": "Editar",
  "shot.pin": "Fixar na tela",
  "shot.pinShort": "Fixar",
  "shot.inClipboard": "Também está na área de transferência.",
  "shot.alt": "Print de {w}×{h}",
  "shot.pinAlt": "Print fixado de {w}×{h}",
  "shot.pinClose": "Fechar (Esc)",

  // --- erro na interface
  "error.title": "Algo deu errado.",
  "error.hint": "O erro foi registrado no log (Configurações → Diagnóstico).",
  "error.reload": "Recarregar",

  // --- idioma (Configurações → Geral)
  "lang.label": "Idioma / Language",
  "lang.hint": "Automático usa português se ele estiver na sua lista de idiomas do Windows.",
  "lang.auto": "Automático",
  "lang.pt": "Português",
  "lang.en": "English",

  // --- Configurações (pt.settings.ts)
  ...ptSettings,
  ...ptShared,
} as const;

export type Key = keyof typeof pt;
