// Ponte com o backend Tauri. No navegador (npm run dev) tudo cai em fallbacks,
// o que permite desenvolver o visual e a tela de configuração sem Rust.
import { cloneConfig, defaultConfig } from "./defaults";
import type { Action, Config } from "./types";

export const isTauri = (): boolean =>
  typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;

export interface MenuShowPayload {
  /** Centro do menu em pixels lógicos, relativo à janela (já ajustado para caber na tela). */
  cx: number;
  cy: number;
  profileId: string;
  /** Instante (ms desde 1970) em que o Rust emitiu o evento — para medir atraso de entrega. */
  sentAt?: number;
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
  if (isTauri()) return invoke<Config>("get_config");
  try {
    const s = localStorage.getItem(LS_KEY);
    if (s) return JSON.parse(s) as Config;
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

export async function pickPath(directory: boolean): Promise<string | null> {
  if (!isTauri()) return window.prompt(directory ? "Caminho da pasta" : "Caminho do arquivo");
  const { open } = await import("@tauri-apps/plugin-dialog");
  const r = await open({ directory, multiple: false });
  return typeof r === "string" ? r : null;
}

export async function onEvent<T>(name: string, cb: (payload: T) => void): Promise<() => void> {
  if (!isTauri()) return () => {};
  const { listen } = await import("@tauri-apps/api/event");
  return listen<T>(name, (e) => cb(e.payload));
}
