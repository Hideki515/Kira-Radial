import type { AudioDevice, DisplayInfo, PowerPlan, RadioInfo, RecentFile, WindowInfo } from "../shared/ipc";
import { LIMITS, type DynamicKind, type MenuItem } from "../shared/types";

/** Cor do dispositivo em uso e dos demais no sub-anel. */
export const AUDIO_CURRENT_COLOR = "#4ade9b";
export const AUDIO_OTHER_COLOR = "#9aa5b8";
const MAX_LABEL = 14;

const trimLabel = (s: string) => {
  const t = s.replace(/[\s\-–_]+$/, "").trim();
  return t.length > MAX_LABEL ? `${t.slice(0, MAX_LABEL - 1)}…` : t;
};

/** "Speakers (Realtek(R) Audio)" → { main: "Speakers", detail: "Realtek(R) Audio" }. */
function splitName(name: string): { main: string; detail: string } {
  const i = name.indexOf(" (");
  if (i <= 0) return { main: name.trim(), detail: "" };
  return { main: name.slice(0, i).trim(), detail: name.slice(i + 2).replace(/\)\s*$/, "").trim() };
}

/** Rótulos curtos; se dois ficarem iguais, usa o detalhe entre parênteses para diferenciar. */
export function audioLabels(names: string[]): string[] {
  const parts = names.map(splitName);
  const count = new Map<string, number>();
  parts.forEach((p) => count.set(p.main.toLowerCase(), (count.get(p.main.toLowerCase()) ?? 0) + 1));
  return parts.map((p) =>
    trimLabel(count.get(p.main.toLowerCase())! > 1 && p.detail ? p.detail : p.main || p.detail),
  );
}

export function audioIcon(name: string): string {
  if (/head(set|phone)|fone|earphone|buds|airpods|auricular/i.test(name)) return "headphones";
  if (/monitor|display|hdmi|displayport|nvidia|\bamd\b|radeon|intel.*display|\btv\b/i.test(name)) return "monitor";
  return "speaker";
}

export function audioChildren(parentId: string, devices: AudioDevice[] | null): MenuItem[] {
  if (devices === null) return [{ id: `${parentId}:loading`, label: "Carregando…", icon: "volume-1" }];
  if (!devices.length) return [{ id: `${parentId}:none`, label: "Sem saídas", icon: "volume-x" }];
  const list = devices.slice(0, LIMITS.maxChildren);
  const labels = audioLabels(list.map((d) => d.name));
  return list.map((d, i) => ({
    id: `${parentId}:${d.id}`,
    label: labels[i],
    icon: audioIcon(d.name),
    color: d.isDefault ? AUDIO_CURRENT_COLOR : AUDIO_OTHER_COLOR,
    action: { type: "audioOutput", mode: "set", deviceId: d.id, deviceName: d.name },
  }));
}

/** "Documento.docx - Word" → "Documento.docx"; títulos longos são encurtados. */
export function windowLabel(title: string, exe: string | null): string {
  const parts = title.split(/\s[-—–|]\s/).map((p) => p.trim()).filter(Boolean);
  const main = parts[0] || exe?.replace(/\.exe$/i, "") || title;
  return trimLabel(main);
}

/** Ícone de reserva quando o app não fornece um. */
export function windowIcon(exe: string | null): string {
  const e = (exe ?? "").toLowerCase();
  if (/chrome|msedge|firefox|brave|opera|vivaldi/.test(e)) return "globe";
  if (e === "explorer.exe") return "folder-open";
  if (/code|devenv|idea|rider|pycharm|webstorm/.test(e)) return "code";
  if (/windowsterminal|^wt\.exe$|^cmd\.exe$|powershell|pwsh/.test(e)) return "terminal";
  return "app-window";
}

export function windowChildren(parentId: string, list: WindowInfo[] | null): MenuItem[] {
  if (list === null) return [{ id: `${parentId}:loading`, label: "Carregando…", icon: "app-window" }];
  if (!list.length) return [{ id: `${parentId}:none`, label: "Nenhuma janela", icon: "app-window" }];
  return list.slice(0, LIMITS.maxChildren).map((w) => ({
    id: `${parentId}:${w.hwnd}`,
    label: windowLabel(w.title, w.exe),
    icon: windowIcon(w.exe),
    iconSrc: w.icon ?? undefined,
    action: { type: "focusWindow", hwnd: w.hwnd, title: w.title },
  }));
}

/** Plano ativo em destaque (mesmo verde da saída de áudio atual). */
export function powerChildren(parentId: string, list: PowerPlan[] | null): MenuItem[] {
  if (list === null) return [{ id: `${parentId}:loading`, label: "Carregando…", icon: "zap" }];
  if (!list.length) return [{ id: `${parentId}:none`, label: "Sem planos", icon: "zap" }];
  return list.slice(0, LIMITS.maxChildren).map((p) => ({
    id: `${parentId}:${p.guid}`,
    label: trimLabel(p.name),
    icon: /desempenho|performance/i.test(p.name) ? "gauge" : /econom|saver/i.test(p.name) ? "leaf" : "zap",
    color: p.active ? AUDIO_CURRENT_COLOR : AUDIO_OTHER_COLOR,
    action: { type: "powerPlan", guid: p.guid, name: p.name },
  }));
}

/** Níveis oferecidos no submenu "Brilho" (aplicados a todas as telas). */
export const BRIGHTNESS_LEVELS = [10, 25, 50, 75, 100] as const;

export function brightnessChildren(parentId: string, displays: DisplayInfo[] | null): MenuItem[] {
  if (displays === null) return [{ id: `${parentId}:loading`, label: "Carregando…", icon: "sun" }];
  if (!displays.length) return [{ id: `${parentId}:none`, label: "Sem suporte", icon: "sun-dim" }];
  const avg = displays.reduce((s, d) => s + d.level, 0) / displays.length;
  const nearest = BRIGHTNESS_LEVELS.reduce((a, b) => (Math.abs(b - avg) < Math.abs(a - avg) ? b : a));
  return BRIGHTNESS_LEVELS.map((v) => ({
    id: `${parentId}:${v}`,
    label: `${v}%`,
    icon: v < 50 ? "sun-dim" : "sun",
    color: v === nearest ? AUDIO_CURRENT_COLOR : AUDIO_OTHER_COLOR,
    action: { type: "brightness", mode: "set", value: v, target: "all" },
  }));
}

/** Wi-Fi/Bluetooth: ligado em verde; clique alterna. */
export function radioChildren(parentId: string, radios: RadioInfo[] | null): MenuItem[] {
  if (radios === null) return [{ id: `${parentId}:loading`, label: "Carregando…", icon: "wifi" }];
  if (!radios.length) return [{ id: `${parentId}:none`, label: "Sem rádios", icon: "wifi-off" }];
  return radios.map((r, i) => ({
    id: `${parentId}:${r.kind}:${i}`,
    label: `${r.kind === "wifi" ? "Wi-Fi" : "Bluetooth"} ${r.on ? "ligado" : "desligado"}`,
    icon: r.kind === "wifi" ? (r.on ? "wifi" : "wifi-off") : r.on ? "bluetooth" : "bluetooth-off",
    color: r.on ? AUDIO_CURRENT_COLOR : AUDIO_OTHER_COLOR,
    action: { type: "radio", kind: r.kind, mode: "toggle" },
  }));
}

/** Ícone pelo tipo de arquivo. */
export function fileIcon(ext: string): string {
  if (/^(png|jpe?g|gif|webp|bmp|svg|heic|ico)$/.test(ext)) return "file-image";
  if (/^(xlsx?|csv|ods)$/.test(ext)) return "file-spreadsheet";
  if (/^(js|ts|tsx|jsx|py|rs|cs|java|c|cpp|h|go|json|html|css|ps1|bat|sh)$/.test(ext)) return "file-code";
  if (/^(docx?|odt|rtf|txt|md|pdf)$/.test(ext)) return "file-text";
  return "file";
}

export function recentChildren(parentId: string, files: RecentFile[] | null): MenuItem[] {
  if (files === null) return [{ id: `${parentId}:loading`, label: "Carregando…", icon: "history" }];
  if (!files.length) return [{ id: `${parentId}:none`, label: "Nada recente", icon: "history" }];
  return files.slice(0, LIMITS.maxChildren).map((f, i) => ({
    id: `${parentId}:${i}`,
    label: trimLabel(f.name),
    icon: fileIcon(f.ext),
    action: { type: "launch", path: f.path },
  }));
}

export function clipboardChildren(parentId: string, items: string[] | null): MenuItem[] {
  if (items === null) return [{ id: `${parentId}:loading`, label: "Carregando…", icon: "clipboard" }];
  if (!items.length) return [{ id: `${parentId}:none`, label: "Vazio", icon: "clipboard" }];
  return items.slice(0, LIMITS.maxChildren).map((t, i) => ({
    id: `${parentId}:${i}`,
    label: trimLabel(t),
    icon: /^https?:/i.test(t) ? "globe" : "clipboard",
    action: { type: "paste", index: i, preview: t },
  }));
}

/** Dados lidos do sistema para cada tipo de submenu automático (null/ausente = carregando). */
export interface DynamicSources {
  audio?: AudioDevice[] | null;
  windows?: WindowInfo[] | null;
  power?: PowerPlan[] | null;
  displays?: DisplayInfo[] | null;
  radios?: RadioInfo[] | null;
  recent?: RecentFile[] | null;
  clipboard?: string[] | null;
}

/** Nome de cada submenu automático (página Itens). */
export const DYNAMIC_LABEL: Record<DynamicKind, string> = {
  audioOutputs: "Saídas de áudio",
  windows: "Janelas abertas",
  powerPlans: "Planos de energia",
  brightness: "Brilho da tela",
  radios: "Wi-Fi e Bluetooth",
  recentFiles: "Arquivos recentes",
  clipboard: "Área de transferência",
};

/** Explicação exibida na página Itens. */
export const DYNAMIC_HINT: Record<DynamicKind, string> = {
  audioOutputs: "as saídas de áudio reconhecidas pelo Windows. A saída em uso aparece em verde; clique em outra para trocar.",
  windows: "as janelas abertas mais recentes, com o ícone de cada app. Clique numa para trazê-la para a frente.",
  powerPlans: "os planos de energia do Windows. O plano ativo aparece em verde; clique em outro para trocar.",
  brightness: "níveis de brilho (10% a 100%) aplicados a todas as telas que aceitam ajuste — tela do notebook e monitores com DDC/CI. O nível mais próximo do atual aparece em verde.",
  radios: "o Wi-Fi e o Bluetooth do PC. Ligado aparece em verde; clique para ligar/desligar.",
  recentFiles: "os arquivos abertos recentemente no Windows (os mesmos de \"Recentes\" no Explorador). Clique para abrir.",
  clipboard: "os últimos textos copiados. Clique para colar no app que estava em uso. Precisa ligar o histórico em Configurações → Geral (fica só na memória).",
};

function childrenFor(it: MenuItem, src: DynamicSources): MenuItem[] {
  switch (it.dynamic!) {
    case "audioOutputs": return audioChildren(it.id, src.audio ?? null);
    case "windows": return windowChildren(it.id, src.windows ?? null);
    case "powerPlans": return powerChildren(it.id, src.power ?? null);
    case "brightness": return brightnessChildren(it.id, src.displays ?? null);
    case "radios": return radioChildren(it.id, src.radios ?? null);
    case "recentFiles": return recentChildren(it.id, src.recent ?? null);
    case "clipboard": return clipboardChildren(it.id, src.clipboard ?? null);
  }
}

/** Troca os itens dinâmicos pelos filhos gerados (o restante fica intacto). */
export function resolveItems(items: MenuItem[], src: DynamicSources = {}): MenuItem[] {
  if (!items.some((it) => it.dynamic)) return items;
  return items.map((it) => (it.dynamic ? { ...it, action: undefined, children: childrenFor(it, src) } : it));
}

export const hasDynamic = (items: MenuItem[], kind: MenuItem["dynamic"]) => items.some((it) => it.dynamic === kind);
