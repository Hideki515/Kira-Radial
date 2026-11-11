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
    case "url": {
      const where = [a.browser && a.browser !== "system" ? `no ${a.browserName ?? a.browser}` : "", a.private ? "(anônima)" : ""].filter(Boolean).join(" ");
      return `Abrir ${a.url}${where ? ` ${where}` : ""}`;
    }
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
    {
      const what = a.mode === "up" ? "Aumentar brilho" : a.mode === "down" ? "Diminuir brilho" : `Brilho ${a.value ?? 100}%`;
      const where = a.target === "cursor" ? " (tela do menu)" : a.target && a.target !== "all" ? ` (${a.targetName ?? (a.target === "lcd" ? "notebook" : "monitor")})` : "";
      return what + where;
    }
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
  /** "lcd" (notebook), "mon:<id permanente>" ou "ddc:N" (monitor externo com DDC/CI). */
  id: string;
  name: string;
  /** "\\.\DISPLAY2" (vazio = desconhecido). */
  device?: string;
  /** Número do monitor (como em "Identificar"); 0 = desconhecido. */
  number?: number;
  /** 0–100 */
  level: number;
}

export type BrowserFamily = "chrome" | "edge" | "brave" | "vivaldi" | "opera" | "firefox" | "other";

export interface BrowserInfo {
  /** Nome da chave do Windows (ex.: "Google Chrome"). */
  id: string;
  name: string;
  exe: string;
  family: BrowserFamily;
  isDefault: boolean;
  /** Ícone do programa (data URL). */
  icon?: string;
}

export interface BrowserProfile {
  dir: string;
  name: string;
}

/** Navegadores com janela anônima conhecida. */
export const PRIVATE_FAMILIES: readonly BrowserFamily[] = ["chrome", "edge", "brave", "vivaldi", "opera", "firefox"];
/** Navegadores com perfis (Chromium). */
export const PROFILE_FAMILIES: readonly BrowserFamily[] = ["chrome", "edge", "brave", "vivaldi"];

/** Navegadores instalados (o padrão do Windows primeiro). */
export async function listBrowsers(): Promise<BrowserInfo[]> {
  if (isTauri()) return invoke<BrowserInfo[]>("list_browsers");
  return [
    { id: "Google Chrome", name: "Google Chrome", exe: "chrome.exe", family: "chrome", isDefault: true },
    { id: "Microsoft Edge", name: "Microsoft Edge", exe: "msedge.exe", family: "edge", isDefault: false },
    { id: "Firefox-1", name: "Mozilla Firefox", exe: "firefox.exe", family: "firefox", isDefault: false },
  ];
}

/** Perfis de um navegador Chromium. */
export async function listBrowserProfiles(id: string): Promise<BrowserProfile[]> {
  if (isTauri()) return invoke<BrowserProfile[]>("list_browser_profiles", { id });
  return id === "Google Chrome" ? [{ dir: "Default", name: "Pessoal" }, { dir: "Profile 1", name: "Trabalho" }] : [];
}

/** Telas com brilho ajustável (vazio = nenhuma aceita controle). */
export async function listDisplays(): Promise<DisplayInfo[]> {
  if (isTauri()) return invoke<DisplayInfo[]>("list_displays");
  return [
    { id: "lcd", name: "Tela do notebook", level: 60, device: "\\\\.\\DISPLAY1", number: 1 },
    { id: "mon:AOC", name: "Monitor 2 (AOC2402)", level: 40, device: "\\\\.\\DISPLAY2", number: 2 },
  ];
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

export interface Diagnostics {
  version: string;
  webview: string;
  windows: string;
  monitors: string[];
  launcherMode: string;
  theme: string;
  hotkey: string;
  hotkeyRegistered: boolean;
  hotkeyError: string | null;
  memoryMb: number;
  recentErrors: number;
  dataDir: string;
  qa: boolean;
}

/** Últimas linhas do log (kira.log), mais antigas primeiro. */
export async function readLog(lines = 500): Promise<string[]> {
  if (isTauri()) return invoke<string[]>("read_log", { lines });
  return ["2026-11-10 15:30:05.123 INFO [rust] abrir menu (modo navegador)", "2026-11-10 15:30:06.001 WARN [front] exemplo de aviso"];
}

export async function clearLog(): Promise<void> {
  if (isTauri()) await invoke("clear_log");
}

export async function openDataDir(): Promise<void> {
  if (isTauri()) await invoke("open_data_dir");
}

export async function getDiagnostics(): Promise<Diagnostics | null> {
  return isTauri() ? invoke<Diagnostics>("diagnostics") : null;
}

/** Gera o relatório na pasta de dados e devolve o caminho. */
export async function writeReport(): Promise<string> {
  if (isTauri()) return invoke<string>("write_report");
  throw new Error("relatório só existe no app");
}

export interface MonitorInfo {
  device: string;
  name: string;
  number: number;
  left: number;
  top: number;
  width: number;
  height: number;
  primary: boolean;
}

/** Monitores conectados (numerados da esquerda para a direita). */
export async function listMonitors(): Promise<MonitorInfo[]> {
  if (isTauri()) return invoke<MonitorInfo[]>("list_monitors");
  return [
    { device: "\\\\.\\DISPLAY1", name: "Monitor 1", number: 1, left: 0, top: 0, width: 1920, height: 1080, primary: true },
    { device: "\\\\.\\DISPLAY2", name: "LG ULTRAGEAR", number: 2, left: 1920, top: 0, width: 2560, height: 1440, primary: false },
  ];
}

/** Mostra o número de cada monitor por 2 s. */
export async function identifyMonitors(): Promise<void> {
  if (isTauri()) await invoke("identify_monitors");
}

export interface BackupInfo {
  name: string;
  /** ms desde 1970 */
  modified: number;
  size: number;
  valid: boolean;
  profiles: { name: string; items: number }[];
}

/** Versões anteriores da configuração (mais recente primeiro). */
export async function listBackups(): Promise<BackupInfo[]> {
  if (isTauri()) return invoke<BackupInfo[]>("list_backups");
  return [];
}

/** Conteúdo (JSON) de um backup. */
export async function readBackup(name: string): Promise<string> {
  if (isTauri()) return invoke<string>("read_backup", { name });
  throw new Error("backups só existem no app");
}

/** Ícone próprio de fatia como data URL. No navegador, usa o caminho direto. */
export async function readIcon(path: string): Promise<string> {
  if (!isTauri()) return path;
  return invoke<string>("read_icon", { path });
}

/** Extrai o ícone de um programa/atalho; devolve o caminho do PNG salvo pela Kira. */
export async function extractIcon(path: string): Promise<string> {
  if (!isTauri()) throw new Error("só no app");
  return invoke<string>("extract_icon", { path });
}

/** Escolhe uma imagem para o ícone de uma fatia. */
export async function pickIconImage(): Promise<string | null> {
  if (!isTauri()) return window.prompt("Caminho da imagem (PNG/SVG/ICO/WebP)");
  const { open } = await import("@tauri-apps/plugin-dialog");
  const r = await open({ multiple: false, filters: [{ name: "Ícone", extensions: ["png", "svg", "ico", "webp"] }] });
  return typeof r === "string" ? r : null;
}

/** Som próprio (WAV/MP3/OGG) como data URL. No navegador, usa o caminho direto. */
export async function readSound(path: string): Promise<string> {
  if (!isTauri()) return path;
  return invoke<string>("read_sound", { path });
}

/** Escolhe um arquivo de som. */
export async function pickSound(): Promise<string | null> {
  if (!isTauri()) return window.prompt("Caminho do som (WAV/MP3/OGG)");
  const { open } = await import("@tauri-apps/plugin-dialog");
  const r = await open({ multiple: false, filters: [{ name: "Som", extensions: ["wav", "mp3", "ogg"] }] });
  return typeof r === "string" ? r : null;
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
