import type { CustomTheme } from "./customTheme";
// Schema da configuração. Espelhado em src-tauri/src/config/schema.rs (serde).
// Ao mudar algo aqui, incremente `version` e adicione migração nos dois lados.

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
  | { type: "keys"; combo: string; /** Espera (ms) após o menu sumir, antes de enviar. */ delayMs?: number }
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
  | { type: "paste"; index: number; preview?: string };

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
}

export type DynamicKind = "audioOutputs" | "windows" | "powerPlans" | "brightness" | "radios" | "recentFiles" | "clipboard";
export const DYNAMIC_KINDS: readonly DynamicKind[] = ["audioOutputs", "windows", "powerPlans", "brightness", "radios", "recentFiles", "clipboard"];

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

export interface Config {
  version: 1;
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

export type Theme = "glass" | "holo" | "reactor" | "terminal" | "neon" | "cyber" | "steam" | "fluent" | "minimal";
export const THEMES: readonly Theme[] = ["glass", "holo", "reactor", "terminal", "neon", "cyber", "steam", "fluent", "minimal"];
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
};

export const LIMITS = { minSlices: 3, maxSlices: 10, maxChildren: 8 } as const;
