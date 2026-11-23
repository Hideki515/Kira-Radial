// O que o medidor do centro mostra: timer (se estiver ativo), CPU, RAM ou rede. Puro.
import { getLang, t } from "../shared/i18n";
import type { StatsPayload } from "../shared/ipc";

export type HubGauge = "cpu" | "ram" | "net";
export const HUB_GAUGES: readonly HubGauge[] = ["cpu", "ram", "net"];

export interface HubReading {
  /** 0–1 para o arco; null = sem arco. */
  value: number | null;
  text: string;
  /** Segunda linha (rede: envio). */
  sub?: string;
  pill: string;
  kind: "timer" | HubGauge;
}

/** "25:00", "1:05:09". */
export function formatTimer(ms: number): string {
  const s = Math.ceil(Math.max(0, ms) / 1000);
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const ss = String(s % 60).padStart(2, "0");
  return h ? `${h}:${String(m).padStart(2, "0")}:${ss}` : `${m}:${ss}`;
}

/** Bytes/s legíveis: "0 B/s", "350 KB/s", "1,2 MB/s" (vírgula em português). */
export function formatRate(bps: number): string {
  const units = ["B/s", "KB/s", "MB/s", "GB/s"];
  let v = Math.max(0, bps);
  let i = 0;
  while (v >= 1000 && i < units.length - 1) {
    v /= 1000;
    i++;
  }
  const digits = i === 0 || v >= 100 ? 0 : v >= 10 ? 0 : 1;
  const n = new Intl.NumberFormat(getLang() === "pt" ? "pt-BR" : "en-US", { maximumFractionDigits: digits, minimumFractionDigits: 0 }).format(v);
  return `${n} ${units[i]}`;
}

/** Escala logarítmica até 1 Gbit/s (125 MB/s): pouca rede ainda mexe o arco. */
const NET_FULL = Math.log10(1 + 125e6);
export const netLevel = (bps: number) => Math.min(1, Math.log10(1 + Math.max(0, bps)) / NET_FULL);

export function hubReading(stats: StatsPayload | null, gauge: HubGauge | undefined): HubReading {
  const tm = stats?.timer;
  if (tm) {
    return {
      kind: "timer",
      value: tm.totalMs ? tm.remainingMs / tm.totalMs : 0,
      text: formatTimer(tm.remainingMs),
      pill: t(tm.running ? "hub.timer" : "hub.timerPaused"),
    };
  }
  if (gauge === "ram") {
    const ram = stats ? Math.round(stats.ram) : null;
    return { kind: "ram", value: (ram ?? 0) / 100, text: ram === null ? "—" : `${ram}%`, pill: "RAM" };
  }
  if (gauge === "net") {
    const down = stats?.netDown;
    const up = stats?.netUp;
    return {
      kind: "net",
      value: down === undefined ? 0 : netLevel(down),
      text: down === undefined ? "—" : `↓ ${formatRate(down)}`,
      sub: up === undefined ? undefined : `↑ ${formatRate(up)}`,
      pill: t("hub.net"),
    };
  }
  const cpu = stats ? Math.round(stats.cpu) : null;
  return { kind: "cpu", value: (cpu ?? 0) / 100, text: cpu === null ? "—" : `${cpu}%`, pill: "CPU" };
}
