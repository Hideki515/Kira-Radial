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

export type Action =
  | { type: "launch"; path: string; args?: string; cwd?: string; admin?: boolean }
  | { type: "folder"; path: string }
  | { type: "url"; url: string }
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
    };

export interface MenuItem {
  id: string;
  label: string;
  /** Nome de um ícone registrado em shared/icons.ts */
  icon: string;
  /** Cor da borda no sub-anel (CSS color). */
  color?: string;
  action?: Action;
  children?: MenuItem[];
  /** Submenu gerado na hora (ignora children/action). "audioOutputs" = saídas de áudio detectadas. */
  dynamic?: "audioOutputs";
}

export interface Profile {
  id: string;
  name: string;
  /** Executáveis que ativam este perfil, ex.: ["code.exe"]. Vazio = perfil padrão. */
  matchExe?: string[];
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
  };
  appearance: {
    scale: number;
    accent: string;
    /** Visual do menu. Ausente = "glass". "holo" = HUD holográfico em wireframe. */
    theme?: Theme;
    showCpu: boolean;
    showClock: boolean;
  };
  profiles: Profile[];
}

export type Theme = "glass" | "holo";
export const THEMES: readonly Theme[] = ["glass", "holo"];
/** Cor de destaque sugerida ao escolher o tema holográfico. */
export const HOLO_ACCENT = "#ffb03a";

export const LIMITS ={ minSlices: 3, maxSlices: 10, maxChildren: 8 } as const;
