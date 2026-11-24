// Textos e contas para a interface (funções puras, sem chamar o backend).
// Reexportado por ipc.ts: quem já importa de lá continua funcionando.
import type { Action, DiscordCmd, WindowCmd } from "./types";
import { t, type Key } from "./i18n";

/** Tabela que lê o texto no idioma atual a cada acesso (`prefix.<chave>`); chave desconhecida = undefined. */
function labels<K extends string>(prefix: string, keys: readonly K[]): Record<K, string> {
  return new Proxy({} as Record<K, string>, {
    get: (_, k) => ((keys as readonly string[]).includes(String(k)) ? t(`${prefix}.${String(k)}` as Key) : undefined),
    has: (_, k) => (keys as readonly string[]).includes(String(k)),
    ownKeys: () => [...keys],
    getOwnPropertyDescriptor: (_, k) =>
      (keys as readonly string[]).includes(String(k)) ? { enumerable: true, configurable: true, value: t(`${prefix}.${String(k)}` as Key) } : undefined,
  });
}

const MEDIA_LABEL: Record<string, string> = labels("d.media", ["playpause", "next", "prev", "volup", "voldown", "mute"]);

export const WINDOW_LABEL: Record<WindowCmd, string> = labels<WindowCmd>("d.win", ["topmost", "nextMonitor", "snapLeft", "snapRight", "maximize", "minimize", "minimizeAll"]);

export const DISCORD_LABEL: Record<DiscordCmd, string> = labels<DiscordCmd>("d.dc", ["toggleMute", "mute", "unmute", "toggleDeafen", "deafen", "undeafen", "setInput", "setOutput", "leaveVoice"]);

export function describeAction(a: Action): string {
  switch (a.type) {
    case "launch": return t("d.launch", { path: a.path });
    case "folder": return t("d.folder", { path: a.path });
    case "url": {
      const where = [a.browser && a.browser !== "system" ? t("d.url.in", { browser: a.browserName ?? a.browser }) : "", a.private ? t("d.url.private") : ""].filter(Boolean).join(" ");
      return t("d.url", { url: a.url }) + (where ? ` ${where}` : "");
    }
    case "keys": return t("d.keys", { combo: a.combo });
    case "media": return MEDIA_LABEL[a.cmd] ?? t("d.media", { cmd: a.cmd });
    case "system": return t("d.system", { cmd: a.cmd });
    case "script": return t("d.script", { shell: a.shell });
    case "openSettings": return t("d.openSettings");
    case "window":
      return WINDOW_LABEL[a.cmd];
    case "timer":
      return a.cmd === "reset" ? t("d.timer.reset") : a.cmd === "pause" ? t("d.timer.pause") : t(a.cmd === "start" ? "d.timer.start" : "d.timer.toggle", { n: a.minutes ?? 25 });
    case "layout":
      return t(a.windows.length === 1 ? "d.layout.one" : "d.layout", { n: a.windows.length });
    case "text": {
      const one = a.text.replace(/\s+/g, " ").trim();
      return t("d.text", { text: one.length > 30 ? `${one.slice(0, 29)}…` : one });
    }
    case "paste":
      return t("d.paste", { text: a.preview ?? t("d.paste.default") });
    case "radio": {
      const what = a.kind === "wifi" ? "Wi-Fi" : "Bluetooth";
      return t(a.mode === "on" ? "d.radio.on" : a.mode === "off" ? "d.radio.off" : "d.radio.toggle", { what });
    }
    case "obs":
      return t(`d.obs.${a.cmd}` as Key, { scene: a.scene?.trim() || "?", input: a.input?.trim() || "?" });
    case "vpn":
      return t(a.mode === "connect" ? "d.vpn.connect" : a.mode === "disconnect" ? "d.vpn.disconnect" : "d.vpn.toggle", { name: a.name.trim() || "?" });
    case "brightness":
    {
      const what = a.mode === "up" ? t("d.bright.up") : a.mode === "down" ? t("d.bright.down") : t("d.bright.set", { pct: a.value ?? 100 });
      const where = a.target === "cursor" ? t("d.bright.cursor") : a.target && a.target !== "all" ? ` (${a.targetName ?? t(a.target === "lcd" ? "d.bright.lcd" : "d.bright.monitor")})` : "";
      return what + where;
    }
    case "powerPlan":
      return t("d.power", { name: a.name ?? a.guid });
    case "focusWindow":
      return t("d.focus", { title: a.title ?? t("d.focus.default") });
    case "discord":
      return a.cmd === "setInput" || a.cmd === "setOutput"
        ? t("d.dc.device", { kind: t(a.cmd === "setInput" ? "d.dc.input" : "d.dc.output"), name: a.deviceName ?? a.deviceId ?? "?" })
        : t("d.dc.cmd", { cmd: (DISCORD_LABEL[a.cmd] ?? a.cmd).toLowerCase() });
    case "sequence":
      return a.steps.length === 1 ? t("d.seq.one") : t("d.seq.many", { n: a.steps.length });
    case "audioOutput":
      return a.mode === "cycle" ? t("d.audio.cycle") : t("d.audio.set", { name: a.deviceName ?? a.deviceId ?? "?" });
  }
}

/**
 * Tempo total de abertura: o que o Rust gastou antes de emitir (`prepMs`) + do envio do
 * evento até agora (relógio de parede dos dois lados). `null` se faltar informação.
 */
export function openTimeMs(p: { sentAt?: number; prepMs?: number }, now = Date.now()): number | null {
  if (p.sentAt === undefined) return null;
  return Math.max(0, now - p.sentAt) + Math.max(0, p.prepMs ?? 0);
}

export interface OpenStats {
  count: number;
  avgMs: number;
  p90Ms: number;
  maxMs: number;
  lastMs: number;
}

/** "média 42 ms · 90% abaixo de 60 ms · pior 120 ms (últimas 18)" ou "ainda não aberto". */
export function describeOpenStats(s: OpenStats | undefined): string {
  if (!s || !s.count) return t("d.open.none");
  const ms = (v: number) => `${Math.round(v)} ms`;
  const v = { avg: ms(s.avgMs), p90: ms(s.p90Ms), max: ms(s.maxMs), last: ms(s.lastMs), n: s.count };
  return s.count === 1 ? t("d.open.stats.one", v) : t("d.open.stats.many", v);
}
