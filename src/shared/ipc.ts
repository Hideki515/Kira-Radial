// Ponte com o backend Tauri. No navegador (npm run dev) tudo cai em fallbacks,
// o que permite desenvolver o visual e a tela de configuração sem Rust.
import { cloneConfig, defaultConfig, withDefaults } from "./defaults";
import type { Action, Config, WindowCmd } from "./types";

export const isTauri = (): boolean =>
  typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;

export interface MenuShowPayload {
  /** Centro do menu em pixels lógicos, relativo à janela (já ajustado para caber na tela). */
  cx: number;
  cy: number;
  profileId: string;
  /** Instante (ms desde 1970) em que o Rust emitiu o evento — para medir atraso de entrega. */
  sentAt?: number;
  /** Aberto pelo ícone: ponto de onde o menu "nasce" (px lógicos relativos à janela). */
  originX?: number | null;
  originY?: number | null;
}

export interface StatsPayload {
  cpu: number;
  ram: number;
}

async function invoke<T>(cmd: string, args?: Record<string, unknown>): Promise<T> {
  const core = await import("@tauri-apps/api/core");
  return core.invoke<T>(cmd, args);
}

const MEDIA_LABEL: Record<string, string> = {
  playpause: "play/pause",
  next: "próxima faixa",
  prev: "faixa anterior",
  volup: "volume +",
  voldown: "volume −",
  mute: "mudo",
};

export const WINDOW_LABEL: Record<WindowCmd, string> = {
  topmost: "Sempre no topo (liga/desliga)",
  nextMonitor: "Mover para o próximo monitor",
  snapLeft: "Encaixar à esquerda",
  snapRight: "Encaixar à direita",
  maximize: "Maximizar / restaurar",
  minimize: "Minimizar",
  minimizeAll: "Minimizar todas as janelas",
};

export function describeAction(a: Action): string {
  switch (a.type) {
    case "launch": return `Executar ${a.path}`;
    case "folder": return `Abrir pasta ${a.path}`;
    case "url": return `Abrir ${a.url}`;
    case "keys": return `Enviar ${a.combo}`;
    case "media": return MEDIA_LABEL[a.cmd] ?? `Mídia: ${a.cmd}`;
    case "system": return `Sistema: ${a.cmd}`;
    case "script": return `Script (${a.shell})`;
    case "openSettings": return "Abrir configurações";
    case "window":
      return WINDOW_LABEL[a.cmd];
    case "paste":
      return `Colar "${a.preview ?? "texto"}"`;
    case "radio": {
      const what = a.kind === "wifi" ? "Wi-Fi" : "Bluetooth";
      return a.mode === "on" ? `Ligar ${what}` : a.mode === "off" ? `Desligar ${what}` : `Ligar/desligar ${what}`;
    }
    case "brightness":
      return a.mode === "up" ? "Aumentar brilho" : a.mode === "down" ? "Diminuir brilho" : `Brilho ${a.value ?? 100}%`;
    case "powerPlan":
      return `Plano de energia: ${a.name ?? a.guid}`;
    case "focusWindow":
      return `Ir para ${a.title ?? "a janela"}`;
    case "audioOutput":
      return a.mode === "cycle" ? "Alternar saída de áudio" : `Saída de áudio: ${a.deviceName ?? a.deviceId ?? "?"}`;
  }
}

export async function runAction(action: Action): Promise<void> {
  if (!isTauri()) {
    console.info("[kira-radial] ação (modo navegador):", action);
    if (action.type === "openSettings") window.open("/settings.html", "_blank");
    return;
  }
  await invoke("run_action", { action });
}

export async function hideMenu(): Promise<void> {
  if (isTauri()) await invoke("hide_menu");
}

const LS_KEY = "kira-radial:config";

export async function getConfig(): Promise<Config> {
  if (isTauri()) return withDefaults(await invoke<Config>("get_config"));
  try {
    const s = localStorage.getItem(LS_KEY);
    if (s) return withDefaults(JSON.parse(s) as Config);
  } catch {
    /* sem storage: usa padrão */
  }
  return cloneConfig(defaultConfig);
}

/** Grava a configuração. O backend valida, re-registra o atalho e notifica a janela do menu. */
export async function saveConfig(config: Config): Promise<void> {
  if (isTauri()) {
    await invoke("save_config", { config });
    return;
  }
  try {
    localStorage.setItem(LS_KEY, JSON.stringify(config));
  } catch {
    /* ignora */
  }
  window.dispatchEvent(new CustomEvent("kira:config-changed"));
}

/** Erro ao registrar o atalho global (ex.: já usado por outro programa), ou null. */
export async function getHotkeyError(): Promise<string | null> {
  return isTauri() ? invoke<string | null>("hotkey_error") : null;
}

/**
 * Gravação de atalho em nível de sistema: captura (e bloqueia) combinações com a
 * tecla Windows, que o Windows não entrega às páginas. Resultado chega pelos eventos
 * "keycapture:combo" (string) e "keycapture:cancel".
 */
export async function startKeyCapture(): Promise<void> {
  if (isTauri()) await invoke("start_key_capture");
}

export async function stopKeyCapture(): Promise<void> {
  if (isTauri()) await invoke("stop_key_capture");
}

/** Pausa o atalho global (usado enquanto o gravador de atalho está focado). */
export async function setHotkeyPaused(paused: boolean): Promise<void> {
  if (isTauri()) await invoke("set_hotkey_paused", { paused });
}

/** Nomes de executáveis com janela aberta (para associar perfis por aplicativo). */
export async function listProcesses(): Promise<string[]> {
  if (isTauri()) return invoke<string[]>("list_processes");
  return ["code.exe", "chrome.exe", "explorer.exe", "msedge.exe", "spotify.exe"];
}

export interface AudioDevice {
  id: string;
  name: string;
  isDefault: boolean;
}

/** Saídas de áudio ativas (alto-falantes, fones...). */
export async function listAudioOutputs(): Promise<AudioDevice[]> {
  if (isTauri()) return invoke<AudioDevice[]>("list_audio_outputs");
  return [
    { id: "{0.0.0.00000000}.{fake-speakers}", name: "Alto-falantes (Realtek Audio)", isDefault: true },
    { id: "{0.0.0.00000000}.{fake-headset}", name: "Headset (USB Audio)", isDefault: false },
  ];
}

export interface NowPlaying {
  title: string;
  artist: string;
  app: string;
  playing: boolean;
  /** Capa (data URL) ou null. */
  thumb: string | null;
}

/** Música/vídeo em reprodução no Windows, ou null. */
export async function nowPlaying(): Promise<NowPlaying | null> {
  if (isTauri()) return invoke<NowPlaying | null>("now_playing");
  return { title: "Back in Black", artist: "AC/DC", app: "Spotify", playing: true, thumb: null };
}

/** Volume da saída padrão (0–1). */
export async function getVolume(): Promise<{ level: number; muted: boolean }> {
  if (isTauri()) return invoke("get_volume");
  return { level: 0.42, muted: false };
}

/** Prévias do histórico da área de transferência (vazio se desligado). */
export async function clipboardList(): Promise<string[]> {
  if (isTauri()) return invoke<string[]>("clipboard_list");
  return ["texto copiado de exemplo", "https://github.com/Hideki515/Kira-Radial"];
}

export async function clipboardClear(): Promise<void> {
  if (isTauri()) await invoke("clipboard_clear");
}

export interface RecentFile {
  path: string;
  name: string;
  /** Extensão sem ponto, minúscula. */
  ext: string;
}

/** Arquivos abertos recentemente (até 8), do mais novo para o mais antigo. */
export async function listRecentFiles(): Promise<RecentFile[]> {
  if (isTauri()) return invoke<RecentFile[]>("list_recent_files");
  return [
    { path: "C:/Users/kira/Documents/Relatorio.docx", name: "Relatorio.docx", ext: "docx" },
    { path: "C:/Users/kira/Pictures/foto.png", name: "foto.png", ext: "png" },
  ];
}

export interface RadioInfo {
  kind: "wifi" | "bluetooth";
  name: string;
  on: boolean;
}

/** Wi-Fi e Bluetooth presentes, com o estado atual. */
export async function listRadios(): Promise<RadioInfo[]> {
  if (isTauri()) return invoke<RadioInfo[]>("list_radios");
  return [
    { kind: "wifi", name: "Wi-Fi", on: true },
    { kind: "bluetooth", name: "Bluetooth", on: false },
  ];
}

export interface DisplayInfo {
  /** "lcd" (notebook) ou "ddc:N" (monitor externo com DDC/CI). */
  id: string;
  name: string;
  /** 0–100 */
  level: number;
}

/** Telas com brilho ajustável (vazio = nenhuma aceita controle). */
export async function listDisplays(): Promise<DisplayInfo[]> {
  if (isTauri()) return invoke<DisplayInfo[]>("list_displays");
  return [{ id: "lcd", name: "Tela do notebook", level: 60 }];
}

export interface PowerPlan {
  guid: string;
  name: string;
  active: boolean;
}

/** Planos de energia do Windows, com o ativo marcado. */
export async function listPowerPlans(): Promise<PowerPlan[]> {
  if (isTauri()) return invoke<PowerPlan[]>("list_power_plans");
  return [
    { guid: "381b4222-f694-41f0-9685-ff5bb260df2e", name: "Equilibrado", active: true },
    { guid: "8c5e7fda-e8bf-4a96-9a85-a6e23a8c635c", name: "Alto desempenho", active: false },
  ];
}

export interface WindowInfo {
  hwnd: number;
  title: string;
  exe: string | null;
  /** Ícone do app (data URL PNG 32×32). */
  icon: string | null;
}

/** Janelas de app abertas, mais recentes primeiro (até 8). */
export async function listWindows(): Promise<WindowInfo[]> {
  if (isTauri()) return invoke<WindowInfo[]>("list_windows");
  return [
    { hwnd: 1, title: "Kira-Radial — Visual Studio Code", exe: "code.exe", icon: null },
    { hwnd: 2, title: "YouTube — Google Chrome", exe: "chrome.exe", icon: null },
    { hwnd: 3, title: "Downloads", exe: "explorer.exe", icon: null },
  ];
}

export async function pickPath(directory: boolean): Promise<string | null> {
  if (!isTauri()) return window.prompt(directory ? "Caminho da pasta" : "Caminho do arquivo");
  const { open } = await import("@tauri-apps/plugin-dialog");
  const r = await open({ directory, multiple: false });
  return typeof r === "string" ? r : null;
}

/** Clique no ícone flutuante: o backend abre (ou fecha) o menu centrado nele. */
export async function orbClicked(): Promise<void> {
  if (isTauri()) await invoke("orb_clicked");
}

/** Esconde/mostra o ícone flutuante (fica salvo). */
export async function orbSetHidden(hidden: boolean): Promise<void> {
  if (isTauri()) await invoke("orb_set_hidden", { hidden });
}

/** Volta o ícone flutuante para o canto inferior direito. */
export async function orbResetPosition(): Promise<void> {
  if (isTauri()) await invoke("orb_reset_position");
}

/** Imagem própria do ícone (GIF/WebP/PNG) como data URL. No navegador, usa o caminho direto. */
export async function readOrbImage(path: string): Promise<string> {
  if (!isTauri()) return path;
  return invoke<string>("read_orb_image", { path });
}

/** Menu do botão direito no ícone (Configurações / Esconder ícone). */
export async function orbContextMenu(): Promise<void> {
  if (isTauri()) await invoke("orb_context_menu");
}

/** Escolhe uma imagem para o ícone. */
export async function pickImage(): Promise<string | null> {
  if (!isTauri()) return window.prompt("Caminho da imagem (GIF/WebP/PNG)");
  const { open } = await import("@tauri-apps/plugin-dialog");
  const r = await open({ multiple: false, filters: [{ name: "Imagem animada", extensions: ["gif", "webp", "png", "apng"] }] });
  return typeof r === "string" ? r : null;
}

/** Arrasta a janela atual (ícone) com o mouse, até soltar o botão. */
export async function startWindowDrag(): Promise<void> {
  if (!isTauri()) return;
  const { getCurrentWindow } = await import("@tauri-apps/api/window");
  await getCurrentWindow().startDragging();
}

export async function onEvent<T>(name: string, cb: (payload: T) => void): Promise<() => void> {
  if (!isTauri()) return () => {};
  const { listen } = await import("@tauri-apps/api/event");
  return listen<T>(name, (e) => cb(e.payload));
}
