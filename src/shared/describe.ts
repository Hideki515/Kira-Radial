// Textos e contas para a interface (funções puras, sem chamar o backend).
// Reexportado por ipc.ts: quem já importa de lá continua funcionando.
import type { Action, WindowCmd } from "./types";

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
  if (!s || !s.count) return "o menu ainda não foi aberto nesta sessão";
  const ms = (v: number) => `${Math.round(v)} ms`;
  return `média ${ms(s.avgMs)} · 90% abaixo de ${ms(s.p90Ms)} · pior ${ms(s.maxMs)} · última ${ms(s.lastMs)} (${s.count} ${s.count === 1 ? "abertura" : "aberturas"})`;
}
