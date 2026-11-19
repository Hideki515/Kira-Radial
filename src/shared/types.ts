import type { CustomTheme } from "./customTheme";
// Schema da configuração. Espelhado em src-tauri/src/config/schema.rs (serde).
// Ao mudar algo aqui, incremente `version` e adicione migração nos dois lados.

/** Discord (RPC local): mudo, ensurdecer e dispositivos de entrada/saída do próprio Discord. */
export type DiscordCmd = "toggleMute" | "mute" | "unmute" | "toggleDeafen" | "deafen" | "undeafen" | "setInput" | "setOutput";

export type MediaCmd = "playpause" | "next" | "prev" | "volup" | "voldown" | "mute";
export type SystemCmd =
  | "lock"
  | "sleep"
  | "shutdown"
  | "restart"
  | "signout"
  | "screenshot"
  | "taskmgr"
  | "settings";

export type WindowCmd = "topmost" | "nextMonitor" | "snapLeft" | "snapRight" | "maximize" | "minimize" | "minimizeAll";

export type Action =
  | { type: "launch"; path: string; args?: string; cwd?: string; admin?: boolean }
  | { type: "folder"; path: string }
  | {
      type: "url";
      url: string;
      /** Navegador (id do Windows, ex.: "Google Chrome"). Ausente = o geral; "system" = padrão do Windows. */
      browser?: string;
      /** Nome do navegador; usado se o id não for encontrado (ex.: reinstalado). */
      browserName?: string;
      /** Janela anônima / InPrivate. */
      private?: boolean;
      /** Pasta do perfil (Chrome, Edge, Brave, Vivaldi), ex.: "Profile 1". */
      profile?: string;
    }
  | {
      type: "keys";
      combo: string;
      /** Espera (ms) após o menu sumir, antes de enviar. */
      delayMs?: number;
      /** Abre uma ferramenta de print (ex.: ShareX): mostra o preview. PrtSc e Win+Shift+S já contam. */
      capture?: boolean;
    }
  | { type: "media"; cmd: MediaCmd }
  | { type: "system"; cmd: SystemCmd }
  | { type: "script"; shell: "powershell" | "cmd"; command: string; hidden: boolean }
  | { type: "openSettings" }
  | {
      type: "audioOutput";
      /** "cycle" = próxima saída ativa; "set" = dispositivo específico. */
      mode: "set" | "cycle";
      /** Id do endpoint (MMDevice). Pode mudar após reinstalar o driver. */
      deviceId?: string;
      /** Nome amigável; usado como alternativa quando o id não é encontrado. */
      deviceName?: string;
    }
  /** Traz uma janela para a frente (gerada pelo submenu "Janelas abertas"; não aparece no editor). */
  | { type: "focusWindow"; hwnd: number; title?: string }
  /** Controla a janela que estava ativa antes de o menu abrir. */
  | { type: "window"; cmd: WindowCmd }
  /** Ativa um plano de energia (gerada pelo submenu "Planos de energia"). */
  | { type: "powerPlan"; guid: string; name?: string }
  /** Brilho: "set" aplica `value` (0–100) em `target` ("all" = todas as telas); "up"/"down" = ±10%. */
  | {
      type: "brightness";
      mode: "set" | "up" | "down";
      value?: number;
      /** "all" (padrão) = todas; "cursor" = onde o menu abriu; "lcd"; "mon:<id>" (ou o antigo "ddc:N"). */
      target?: string;
      /** Nome da tela; usado se o id não for encontrado. */
      targetName?: string;
    }
  /** Liga/desliga Wi-Fi ou Bluetooth. */
  | { type: "radio"; kind: "wifi" | "bluetooth"; mode: "toggle" | "on" | "off" }
  /** Cola um item do histórico da área de transferência (gerada pelo submenu; não aparece no editor). */
  | { type: "paste"; index: number; preview?: string }
  /** Discord: setInput/setOutput usam o id do dispositivo no Discord (nome = reserva se o id mudar). */
  | { type: "discord"; cmd: DiscordCmd; deviceId?: string; deviceName?: string }
  /** Várias ações em ordem (2–10; sem sequência dentro de sequência nem desligar/reiniciar/sair). */
  | { type: "sequence"; steps: Action[]; /** Espera entre os passos (padrão 300, máx. 5000). */ delayMs?: number };

export const SEQUENCE_LIMITS = { min: 2, max: 10, defaultDelayMs: 300, maxDelayMs: 5000 } as const;
/** Comandos que pedem confirmação: não rodam encadeados nem pelo "Testar ação". */
export const DANGEROUS_SYSTEM: readonly SystemCmd[] = ["shutdown", "restart", "signout"];

export interface MenuItem {
  id: string;
  label: string;
  /** Nome de um ícone registrado em shared/icons.ts */
  icon: string;
  /** Cor da borda no sub-anel (CSS color). */
  color?: string;
  action?: Action;
  children?: MenuItem[];
  /** Imagem no lugar do ícone (data URL; ex.: ícone do app nas "Janelas abertas"). */
  iconSrc?: string;
  /** Ícone próprio salvo (PNG/SVG/ICO/WebP ou o ícone extraído de um programa). Falha → usa `icon`. */
  iconFile?: string;
  /** Submenu gerado na hora (ignora children/action): saídas de áudio ou janelas abertas. */
  dynamic?: DynamicKind;
  /** Submenu "Brilho": tela alvo (como `target` da ação). Ausente = onde o menu abriu. */
  dynamicTarget?: string;
  dynamicTargetName?: string;
  /** Atalho global que executa a ação direto, sem abrir o menu (vale em qualquer perfil). */
  hotkey?: string;
}

export type DynamicKind = "audioOutputs" | "windows" | "powerPlans" | "brightness" | "radios" | "recentFiles" | "clipboard" | "discordVoice" | "discordInput" | "discordOutput";
export const DYNAMIC_KINDS: readonly DynamicKind[] = ["audioOutputs", "windows", "powerPlans", "brightness", "radios", "recentFiles", "clipboard", "discordVoice", "discordInput", "discordOutput"];

export interface ProfileWhen {
  days?: number[];
  from?: string;
  to?: string;
  /** Nomes de dispositivo do Windows (\\.\DISPLAY2). */
  monitors?: string[];
}

export interface Profile {
  id: string;
  name: string;
  /** Executáveis que ativam este perfil, ex.: ["code.exe"]. Vazio = perfil padrão. */
  matchExe?: string[];
  /** "Quando usar": dias (0=dom), horário (HH:MM, pode cruzar a meia-noite) e monitores. */
  when?: ProfileWhen;
  items: MenuItem[];
}

export type OrbAnimation = "full" | "hover" | "off";
export const ORB_ANIMATIONS: readonly OrbAnimation[] = ["full", "hover", "off"];

/** Controle dedicado: teclas que o knob de um teclado macro envia (F13–F15 por padrão). */
export interface KnobConfig {
  enabled: boolean;
  press: string;
  right: string;
  left: string;
  /** Girar com o menu fechado: nada ou volume do Windows. */
  closedTurn: "none" | "volume";
}

export type ShotCorner = "bottomRight" | "bottomLeft" | "topRight" | "topLeft";

/** Preview das capturas tiradas pela Kira. */
export interface ScreenshotConfig {
  preview: boolean;
  /** Tempo na tela (s). */
  seconds: number;
  corner: ShotCorner;
  /** Pastas extras observadas (ex.: a do Lightshot). A de capturas do Windows já entra. */
  folders: string[];
  /** Quanto tempo esperar pelo print depois da ação (s). */
  armSeconds: number;
}

export const DEFAULT_SCREENSHOT: ScreenshotConfig = { preview: true, seconds: 6, corner: "bottomRight", folders: [], armSeconds: 60 };

export function screenshotOf(c: Pick<Config, "screenshot">): ScreenshotConfig {
  return { ...DEFAULT_SCREENSHOT, ...(c.screenshot ?? {}) };
}

export const DEFAULT_KNOB: KnobConfig = { enabled: false, press: "F13", right: "F14", left: "F15", closedTurn: "none" };

/** Knob da config, com o padrão para o que faltar (configs antigas não têm). */
export function knobOf(c: Pick<Config, "knob">): KnobConfig {
  return { ...DEFAULT_KNOB, ...(c.knob ?? {}) };
}

export interface Config {
  version: 1;
  /** Ausente em configs antigas (= desligado). */
  knob?: KnobConfig;
  /** Ausente em configs antigas (= padrão: ligado). */
  screenshot?: ScreenshotConfig;
  hotkey: { accelerator: string; mode: "toggle" | "hold" };
  behavior: {
    openAt: "cursor" | "center";
    closeOnBlur: boolean;
    closeOnAction: boolean;
    deadZonePx: number;
    autostart: boolean;
    /** Guarda os últimos textos copiados (só na memória). Padrão: desligado. */
    clipboardHistory?: boolean;
    /** Navegador geral para "Abrir site" (id do Windows). Ausente = padrão do Windows. */
    browser?: string;
    browserName?: string;
  };
  appearance: {
    scale: number;
    accent: string;
    /** Visual do menu: um tema embutido ou "custom:<id>" (tema personalizado). Ausente = "glass". */
    theme?: ThemeRef;
    /** Temas personalizados (cores sobre as decorações de um tema embutido). */
    customThemes?: CustomTheme[];
    showCpu: boolean;
    showClock: boolean;
    /** Mostra o número (atalho 1–9) em cada fatia. */
    showNumbers?: boolean;
    /** Mostra a música em reprodução no centro (padrão: ligado). */
    showMedia?: boolean;
    /** Sons ao abrir/fechar/executar/passar por uma fatia. Ausente = desligado. */
    sounds?: SoundsConfig;
  };
  launcher: Launcher;
  profiles: Profile[];
}

/** Como o menu é aberto: atalho global, ícone flutuante ou os dois. */
export type LauncherMode = "hotkey" | "orb" | "both";
export const LAUNCHER_MODES: readonly LauncherMode[] = ["hotkey", "orb", "both"];
export const wantsHotkey = (m: LauncherMode) => m !== "orb";
export const wantsOrb = (m: LauncherMode) => m !== "hotkey";

export interface OrbConfig {
  /** Posição salva (px físicos, canto superior esquerdo). null = canto inferior direito. Gerida pelo backend. */
  x: number | null;
  y: number | null;
  /** Diâmetro do orbe em px. */
  size: number;
  /** GIF/WebP/PNG próprio; null = orbe holográfico embutido. */
  image: string | null;
  /** Opacidade em repouso (passar o mouse deixa 100%). */
  opacityIdle: number;
  hideOnFullscreen: boolean;
  /** Escondido pelo usuário (botão direito no ícone / bandeja). Gerido pelo backend. */
  hidden: boolean;
  /** Borda onde o ícone está encaixado (metade para fora). Gerido pelo backend ao soltar. */
  docked?: OrbEdge | null;
  /** Núcleo avermelhado e pulsando mais rápido com CPU alta. */
  cpuAlert?: boolean;
  /** Animação do orbe: "full" (padrão), "hover" (só com o mouse em cima) ou "off" (parado). */
  animation?: OrbAnimation;
}

export type OrbEdge = "left" | "right" | "top" | "bottom";

export interface Launcher {
  mode: LauncherMode;
  orb: OrbConfig;
}

/** Escala do menu (igual ao clamp de Config::ui_scale no Rust). */
export const SCALE_LIMITS = { min: 0.5, max: 1.6 } as const;

export const ORB_LIMITS = { minSize: 56, maxSize: 160, minOpacity: 0.4, maxOpacity: 1 } as const;

export type SoundEvent = "open" | "close" | "execute" | "hover";
export interface SoundSource {
  /** "builtin" = som sintetizado da Kira; "file" = arquivo próprio; "off" = sem som. */
  mode: "builtin" | "file" | "off";
  file?: string;
}
export interface SoundsConfig {
  enabled: boolean;
  /** 0–1 */
  volume: number;
  events: Record<SoundEvent, SoundSource>;
}

/** Tema embutido ou personalizado ("custom:<id>"). */
export type ThemeRef = Theme | `custom:${string}`;

export type Theme =
  | "glass" | "holo" | "reactor" | "terminal" | "neon" | "cyber" | "steam" | "fluent" | "minimal"
  | "sakura" | "ocean" | "aurora" | "magma" | "pixel" | "paper"
  | "circuit" | "radar" | "quantum" | "blueprint" | "datacenter" | "neural";
export const THEMES: readonly Theme[] = [
  "glass", "holo", "reactor", "terminal", "neon", "cyber", "steam", "fluent", "minimal",
  "sakura", "ocean", "aurora", "magma", "pixel", "paper",
  "circuit", "radar", "quantum", "blueprint", "datacenter", "neural",
];
/** Cor de destaque sugerida ao escolher o tema holográfico. */
export const HOLO_ACCENT = "#ffb03a";
/** Cor sugerida para cada tema (aplicada ao trocar, se a cor atual for a sugerida do tema anterior). */
export const THEME_ACCENT: Record<Theme, string> = {
  glass: "#4ade9b",
  holo: HOLO_ACCENT,
  reactor: "#5ad1ff",
  terminal: "#39ff6a",
  neon: "#ff4fd8",
  cyber: "#fcee0a",
  steam: "#d4a24c",
  fluent: "#0067c0",
  minimal: "#f2f2f2",
  sakura: "#ff8fb5",
  ocean: "#4fd1e8",
  aurora: "#3dffb0",
  magma: "#ff6a1f",
  pixel: "#ffe14d",
  paper: "#2f6fd6",
  circuit: "#3ddc84",
  radar: "#2cf5c0",
  quantum: "#b388ff",
  blueprint: "#ffd23f",
  datacenter: "#36d399",
  neural: "#ff3d9a",
};

export const LIMITS = { minSlices: 3, maxSlices: 10, maxChildren: 8 } as const;
