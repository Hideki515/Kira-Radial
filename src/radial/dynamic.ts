import type { AudioDevice } from "../shared/ipc";
import { LIMITS, type MenuItem } from "../shared/types";

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

/** Troca os itens dinâmicos pelos filhos gerados (o restante fica intacto). */
export function resolveItems(items: MenuItem[], audio: AudioDevice[] | null): MenuItem[] {
  if (!items.some((it) => it.dynamic)) return items;
  return items.map((it) =>
    it.dynamic === "audioOutputs" ? { ...it, action: undefined, children: audioChildren(it.id, audio) } : it,
  );
}

export const hasDynamic = (items: MenuItem[], kind: MenuItem["dynamic"]) => items.some((it) => it.dynamic === kind);
