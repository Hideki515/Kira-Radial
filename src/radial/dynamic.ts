import type { AudioDevice, DiscordVoiceState, DisplayInfo, ObsState, PowerPlan, RadioInfo, RecentFile, VpnInfo, VsProject, WindowInfo } from "../shared/ipc";
import { DYNAMIC_KINDS, LIMITS, type DynamicKind, type MenuItem } from "../shared/types";
import { t, type Key } from "../shared/i18n";
import { pt } from "../shared/i18n/pt";

/** Cor do dispositivo em uso e dos demais no sub-anel. */
export const AUDIO_CURRENT_COLOR = "#4ade9b";
export const AUDIO_OTHER_COLOR = "#9aa5b8";
/** Discord mutado/ensurdecido: vermelho (ligado continua verde). */
export const DISCORD_OFF_COLOR = "#f25f5c";
const MAX_LABEL = 14;

/** Item em uso/ligado: verde e tingido; os demais, cinza sem destaque. */
const current = (on: boolean): Pick<MenuItem, "color" | "state"> =>
  on ? { color: AUDIO_CURRENT_COLOR, state: "on" } : { color: AUDIO_OTHER_COLOR };
/** Estado que importa nos dois lados (Discord): ligado verde, desligado vermelho — ambos tingidos. */
const onOff = (on: boolean): Pick<MenuItem, "color" | "state"> =>
  on ? { color: AUDIO_CURRENT_COLOR, state: "on" } : { color: DISCORD_OFF_COLOR, state: "off" };

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
  if (devices === null) return [{ id: `${parentId}:loading`, label: t("common.loading"), icon: "volume-1" }];
  if (!devices.length) return [{ id: `${parentId}:none`, label: t("dyn.none.outputs"), icon: "volume-x" }];
  const list = devices.slice(0, LIMITS.maxChildren);
  const labels = audioLabels(list.map((d) => d.name));
  return list.map((d, i) => ({
    id: `${parentId}:${d.id}`,
    label: labels[i],
    icon: audioIcon(d.name),
    ...current(d.isDefault),
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
  if (list === null) return [{ id: `${parentId}:loading`, label: t("common.loading"), icon: "app-window" }];
  if (!list.length) return [{ id: `${parentId}:none`, label: t("dyn.none.windows"), icon: "app-window" }];
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
  if (list === null) return [{ id: `${parentId}:loading`, label: t("common.loading"), icon: "zap" }];
  if (!list.length) return [{ id: `${parentId}:none`, label: t("dyn.none.power"), icon: "zap" }];
  return list.slice(0, LIMITS.maxChildren).map((p) => ({
    id: `${parentId}:${p.guid}`,
    label: trimLabel(p.name),
    icon: /desempenho|performance/i.test(p.name) ? "gauge" : /econom|saver/i.test(p.name) ? "leaf" : "zap",
    ...current(p.active),
    action: { type: "powerPlan", guid: p.guid, name: p.name },
  }));
}

/** Níveis oferecidos no submenu "Brilho" (aplicados a todas as telas). */
export const BRIGHTNESS_LEVELS = [10, 25, 50, 75, 100] as const;

/** Telas que o alvo escolhe, para destacar o nível atual ("cursor"/desconhecido = todas). */
export function targetDisplays(displays: DisplayInfo[], target = "all", targetName?: string): DisplayInfo[] {
  if (target === "all" || target === "cursor") return displays;
  const low = (s: string) => s.trim().toLowerCase();
  const hit = displays.filter((d) => low(d.id) === low(target));
  if (hit.length) return hit;
  const byName = targetName ? displays.filter((d) => low(d.name) === low(targetName)) : [];
  return byName.length ? byName : displays;
}

export function brightnessChildren(parentId: string, displays: DisplayInfo[] | null, target = "all", targetName?: string): MenuItem[] {
  if (displays === null) return [{ id: `${parentId}:loading`, label: t("common.loading"), icon: "sun" }];
  if (!displays.length) return [{ id: `${parentId}:none`, label: t("dyn.none.brightness"), icon: "sun-dim" }];
  const shown = targetDisplays(displays, target, targetName);
  const avg = shown.reduce((s, d) => s + d.level, 0) / shown.length;
  const nearest = BRIGHTNESS_LEVELS.reduce((a, b) => (Math.abs(b - avg) < Math.abs(a - avg) ? b : a));
  return BRIGHTNESS_LEVELS.map((v) => ({
    id: `${parentId}:${v}`,
    label: `${v}%`,
    icon: v < 50 ? "sun-dim" : "sun",
    ...current(v === nearest),
    action: { type: "brightness", mode: "set", value: v, target, ...(targetName && target !== "all" && target !== "cursor" ? { targetName } : {}) },
  }));
}

/** Wi-Fi/Bluetooth: ligado em verde; clique alterna. */
export function radioChildren(parentId: string, radios: RadioInfo[] | null): MenuItem[] {
  if (radios === null) return [{ id: `${parentId}:loading`, label: t("common.loading"), icon: "wifi" }];
  if (!radios.length) return [{ id: `${parentId}:none`, label: t("dyn.none.radios"), icon: "wifi-off" }];
  return radios.map((r, i) => ({
    id: `${parentId}:${r.kind}:${i}`,
    label: t(r.on ? "dyn.radio.on" : "dyn.radio.off", { name: r.kind === "wifi" ? "Wi-Fi" : "Bluetooth" }),
    icon: r.kind === "wifi" ? (r.on ? "wifi" : "wifi-off") : r.on ? "bluetooth" : "bluetooth-off",
    ...current(r.on),
    action: { type: "radio", kind: r.kind, mode: "toggle" },
  }));
}

/** Discord fechado / não conectado / erro: uma fatia que explica (sem ação). */
function discordProblem(parentId: string, state: DiscordVoiceState): MenuItem[] {
  const label = t(state.status === "closed" ? "dyn.discord.closed" : state.status === "notConnected" ? "dyn.discord.notConnected" : "dyn.discord.error");
  return [{ id: `${parentId}:${state.status}`, label, icon: "headset" }];
}

/** Microfone e fone do Discord: estado atual (verde = ligado); clique alterna. */
export function discordVoiceChildren(parentId: string, state: DiscordVoiceState | null): MenuItem[] {
  if (state === null) return [{ id: `${parentId}:loading`, label: t("common.loading"), icon: "headset" }];
  if (state.status !== "ok" || !state.voice) return discordProblem(parentId, state);
  const { mute, deaf, channel } = state.voice;
  const items: MenuItem[] = [
    {
      id: `${parentId}:mic`,
      label: t(mute ? "dyn.discord.micMuted" : "dyn.discord.micOn"),
      icon: mute ? "mic-off" : "mic",
      ...onOff(!mute),
      action: { type: "discord", cmd: "toggleMute" },
    },
    {
      id: `${parentId}:deaf`,
      label: t(deaf ? "dyn.discord.deafened" : "dyn.discord.audioOn"),
      icon: deaf ? "headphone-off" : "headphones",
      ...onOff(!deaf),
      action: { type: "discord", cmd: "toggleDeafen" },
    },
  ];
  // Em canal de voz: terceira fatia para sair dele (sem tingido: é um botão, não um estado).
  if (channel) {
    items.push({
      id: `${parentId}:leave`,
      label: trimLabel(t("dyn.discord.leave", { name: channel })),
      icon: "phone-off",
      color: DISCORD_OFF_COLOR,
      action: { type: "discord", cmd: "leaveVoice" },
    });
  }
  return items;
}

/** Dispositivos de entrada ou saída do Discord; o atual em verde, "Padrão" primeiro. */
export function discordDeviceChildren(parentId: string, state: DiscordVoiceState | null, kind: "input" | "output"): MenuItem[] {
  const icon = kind === "input" ? "mic" : "headphones";
  if (state === null) return [{ id: `${parentId}:loading`, label: t("common.loading"), icon }];
  if (state.status !== "ok" || !state.voice) return discordProblem(parentId, state);
  const list = state.voice[kind];
  const sorted = [...list.devices].sort((a, b) => Number(b.id === "default") - Number(a.id === "default"));
  if (!sorted.length) return [{ id: `${parentId}:none`, label: t(kind === "input" ? "dyn.none.inputs" : "dyn.none.outputs"), icon }];
  const shown = sorted.slice(0, LIMITS.maxChildren);
  const labels = audioLabels(shown.map((d) => (d.id === "default" ? t("dyn.discord.default") : d.name)));
  return shown.map((d, i) => ({
    id: `${parentId}:${d.id}`,
    label: labels[i],
    icon: kind === "input" ? "mic" : audioIcon(d.name),
    ...current(d.id === list.current),
    action: { type: "discord", cmd: kind === "input" ? "setInput" : "setOutput", deviceId: d.id, deviceName: d.name },
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
  if (files === null) return [{ id: `${parentId}:loading`, label: t("common.loading"), icon: "history" }];
  if (!files.length) return [{ id: `${parentId}:none`, label: t("dyn.none.recent"), icon: "history" }];
  return files.slice(0, LIMITS.maxChildren).map((f, i) => ({
    id: `${parentId}:${i}`,
    label: trimLabel(f.name),
    icon: fileIcon(f.ext),
    action: { type: "launch", path: f.path },
  }));
}

export function clipboardChildren(parentId: string, items: string[] | null): MenuItem[] {
  if (items === null) return [{ id: `${parentId}:loading`, label: t("common.loading"), icon: "clipboard" }];
  if (!items.length) return [{ id: `${parentId}:none`, label: t("dyn.none.clipboard"), icon: "clipboard" }];
  return items.slice(0, LIMITS.maxChildren).map((t, i) => ({
    id: `${parentId}:${i}`,
    label: trimLabel(t),
    icon: /^https?:/i.test(t) ? "globe" : "clipboard",
    action: { type: "paste", index: i, preview: t },
  }));
}

/** Nomes iguais (duas pastas "app"): usa "pai/nome" para diferenciar. */
function projectLabels(list: VsProject[]): string[] {
  const count = new Map<string, number>();
  list.forEach((p) => count.set(p.name.toLowerCase(), (count.get(p.name.toLowerCase()) ?? 0) + 1));
  return list.map((p) => {
    if (count.get(p.name.toLowerCase())! < 2) return trimLabel(p.name);
    const parts = p.path.split(/[\\/]+/).filter(Boolean);
    const parent = parts[parts.length - 2] ?? "";
    return trimLabel(parent ? `${parent}/${p.name}` : p.name);
  });
}

/** Projetos recentes do VS Code: clique abre a pasta (ou o workspace) no VS Code. */
export function vscodeChildren(parentId: string, list: VsProject[] | null): MenuItem[] {
  if (list === null) return [{ id: `${parentId}:loading`, label: t("common.loading"), icon: "folder-code" }];
  if (!list.length) return [{ id: `${parentId}:none`, label: t("dyn.none.vscode"), icon: "folder-code" }];
  const shown = list.slice(0, LIMITS.maxChildren);
  const labels = projectLabels(shown);
  return shown.map((p, i) => ({
    id: `${parentId}:${i}`,
    label: labels[i],
    icon: p.workspace ? "layers" : "folder-code",
    // Barra no fim ("D:\") escaparia a aspa de fechamento: vira "D:\.".
    action: { type: "launch", path: p.exe, args: `"${p.path.endsWith("\\") ? `${p.path}.` : p.path}"` },
  }));
}

/** VPNs do Windows: conectada em verde; clique conecta/desconecta. */
export function vpnChildren(parentId: string, list: VpnInfo[] | null): MenuItem[] {
  if (list === null) return [{ id: `${parentId}:loading`, label: t("common.loading"), icon: "shield" }];
  if (!list.length) return [{ id: `${parentId}:none`, label: t("dyn.none.vpns"), icon: "shield-off" }];
  return list.slice(0, LIMITS.maxChildren).map((v, i) => ({
    id: `${parentId}:${i}`,
    label: trimLabel(v.name),
    icon: v.connected ? "shield-check" : "shield",
    ...current(v.connected),
    action: { type: "vpn", name: v.name, mode: "toggle" },
  }));
}

/** Cenas do OBS: a atual em verde; clique troca. OBS fechado/sem senha: uma fatia que explica. */
export function obsSceneChildren(parentId: string, state: ObsState | null): MenuItem[] {
  if (state === null) return [{ id: `${parentId}:loading`, label: t("common.loading"), icon: "clapperboard" }];
  if (state.status !== "ok") {
    const key = state.status === "closed" ? "dyn.obs.closed" : state.status === "needPassword" || state.status === "authFailed" ? "dyn.obs.password" : "dyn.obs.error";
    return [{ id: `${parentId}:${state.status}`, label: t(key), icon: "clapperboard" }];
  }
  if (!state.scenes.length) return [{ id: `${parentId}:none`, label: t("dyn.none.obs"), icon: "clapperboard" }];
  return state.scenes.slice(0, LIMITS.maxChildren).map((s, i) => ({
    id: `${parentId}:${i}`,
    label: trimLabel(s),
    icon: "clapperboard",
    ...current(s === state.current),
    action: { type: "obs", cmd: "setScene", scene: s },
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
  /** Os três submenus do Discord usam a mesma leitura. */
  discord?: DiscordVoiceState | null;
  vscode?: VsProject[] | null;
  vpns?: VpnInfo[] | null;
  obs?: ObsState | null;
}

/** Texto `dyn.<grupo>.<tipo>` no idioma atual; tipo desconhecido = undefined (como num objeto comum). */
function dynText(group: "label" | "hint", kind: string | symbol): string | undefined {
  const key = `dyn.${group}.${String(kind)}`;
  return key in pt ? t(key as Key) : undefined;
}

/** Nome de cada submenu automático (página Itens), no idioma atual. */
export const DYNAMIC_LABEL: Record<DynamicKind, string> = new Proxy({} as Record<DynamicKind, string>, {
  get: (_, k) => dynText("label", k),
});

/** Explicação exibida na página Itens, no idioma atual. */
export const DYNAMIC_HINT: Record<DynamicKind, string> = new Proxy({} as Record<DynamicKind, string>, {
  get: (_, k) => dynText("hint", k),
});

function childrenFor(it: MenuItem, src: DynamicSources): MenuItem[] {
  switch (it.dynamic!) {
    case "audioOutputs": return audioChildren(it.id, src.audio ?? null);
    case "windows": return windowChildren(it.id, src.windows ?? null);
    case "powerPlans": return powerChildren(it.id, src.power ?? null);
    // Sem tela escolhida: a tela onde o menu abriu.
    case "brightness": return brightnessChildren(it.id, src.displays ?? null, it.dynamicTarget ?? "cursor", it.dynamicTargetName);
    case "radios": return radioChildren(it.id, src.radios ?? null);
    case "recentFiles": return recentChildren(it.id, src.recent ?? null);
    case "clipboard": return clipboardChildren(it.id, src.clipboard ?? null);
    case "discordVoice": return discordVoiceChildren(it.id, src.discord ?? null);
    case "discordInput": return discordDeviceChildren(it.id, src.discord ?? null, "input");
    case "discordOutput": return discordDeviceChildren(it.id, src.discord ?? null, "output");
    case "vscodeProjects": return vscodeChildren(it.id, src.vscode ?? null);
    case "vpns": return vpnChildren(it.id, src.vpns ?? null);
    case "obsScenes": return obsSceneChildren(it.id, src.obs ?? null);
  }
}

const MUTE_CMDS = new Set(["toggleMute", "mute", "unmute"]);
const DEAF_CMDS = new Set(["toggleDeafen", "deafen", "undeafen"]);
const RECORD_CMDS = new Set(["toggleRecord", "startRecord", "stopRecord", "toggleRecordPause"]);
const STREAM_CMDS = new Set(["toggleStream", "startStream", "stopStream"]);

/** Leitura que mostra o estado de uma ação comum (selo na fatia); undefined = sem selo. */
export function badgeKindOf(action: MenuItem["action"]): DynamicKind | undefined {
  if (action?.type === "discord" && (MUTE_CMDS.has(action.cmd) || DEAF_CMDS.has(action.cmd))) return "discordVoice";
  if (action?.type === "obs" && (RECORD_CMDS.has(action.cmd) || STREAM_CMDS.has(action.cmd))) return "obsScenes";
  return undefined;
}

/** Selo de uma fatia comum: Discord verde (ligado) / vermelho (mutado); OBS vermelho só gravando/transmitindo. */
export function badgeFor(action: MenuItem["action"], src: DynamicSources): MenuItem["badge"] {
  if (action?.type === "discord") {
    const v = src.discord?.status === "ok" ? src.discord.voice : null;
    if (!v) return undefined;
    if (MUTE_CMDS.has(action.cmd)) return v.mute ? "off" : "on";
    if (DEAF_CMDS.has(action.cmd)) return v.deaf ? "off" : "on";
  }
  if (action?.type === "obs" && src.obs?.status === "ok") {
    if (RECORD_CMDS.has(action.cmd)) return src.obs.recording ? "live" : undefined;
    if (STREAM_CMDS.has(action.cmd)) return src.obs.streaming ? "live" : undefined;
  }
  return undefined;
}

const withBadge = (it: MenuItem, src: DynamicSources): MenuItem => {
  const badge = it.children?.length ? undefined : badgeFor(it.action, src);
  return badge ? { ...it, badge } : it;
};

/** Item comum: põe os selos (nele e nos filhos); sem nenhum, devolve o mesmo objeto. */
function badged(it: MenuItem, src: DynamicSources): MenuItem {
  const self = withBadge(it, src);
  if (!it.children?.length) return self;
  const kids = it.children.map((c) => withBadge(c, src));
  return kids.some((c, i) => c !== it.children![i]) ? { ...self, children: kids } : self;
}

const needsBadge = (it: MenuItem) => !!badgeKindOf(it.action) || !!it.children?.some((c) => badgeKindOf(c.action));

/** Troca os itens dinâmicos pelos filhos gerados e põe os selos de estado (o restante fica intacto). */
export function resolveItems(items: MenuItem[], src: DynamicSources = {}): MenuItem[] {
  if (!items.some((it) => it.dynamic || needsBadge(it))) return items;
  return items.map((it) => {
    if (!it.dynamic) return badged(it, src);
    // Tipo desconhecido: sub-anel vazio em vez de quebrar o menu.
    const children = DYNAMIC_KINDS.includes(it.dynamic) ? childrenFor(it, src) : [];
    return { ...it, action: undefined, children };
  });
}

export const hasDynamic = (items: MenuItem[], kind: MenuItem["dynamic"]) => items.some((it) => it.dynamic === kind);
