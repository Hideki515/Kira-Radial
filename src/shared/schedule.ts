// "Quando usar" dos perfis (dias, horário, monitores): validação e resumo legível.
import type { ProfileWhen } from "./types";

export const DAY_SHORT = ["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sáb"] as const;

/** "08:30" → 510; inválido → null. */
export function parseHHMM(s: string | undefined): number | null {
  const m = /^(\d{1,2}):(\d{2})$/.exec((s ?? "").trim());
  if (!m) return null;
  const h = Number(m[1]);
  const min = Number(m[2]);
  return h < 24 && min < 60 ? h * 60 + min : null;
}

export function hasCriteria(w: ProfileWhen | undefined): boolean {
  return !!w && (!!w.days?.length || !!w.from || !!w.to || !!w.monitors?.length);
}

/** Problemas do "quando usar" (vazio = ok). */
export function whenErrors(w: ProfileWhen | undefined): string[] {
  if (!w) return [];
  const out: string[] = [];
  if (!!w.from !== !!w.to) out.push("informe o horário de início e de fim.");
  else if (w.from && w.to) {
    const f = parseHHMM(w.from);
    const t = parseHHMM(w.to);
    if (f === null || t === null) out.push("horário inválido (use HH:MM).");
    else if (f === t) out.push("o início e o fim do horário não podem ser iguais.");
  }
  if (w.days?.some((d) => !Number.isInteger(d) || d < 0 || d > 6)) out.push("dia da semana inválido.");
  return out;
}

/** Dias em texto curto: [1..5] → "Seg–Sex"; [0,6] → "Dom, Sáb". */
export function describeDays(days: number[] | undefined): string {
  const d = [...new Set(days ?? [])].sort((a, b) => a - b);
  if (!d.length || d.length === 7) return "todos os dias";
  const consecutive = d.length > 2 && d.every((x, i) => i === 0 || x === d[i - 1] + 1);
  return consecutive ? `${DAY_SHORT[d[0]]}–${DAY_SHORT[d[d.length - 1]]}` : d.map((x) => DAY_SHORT[x]).join(", ");
}

/** Resumo para o cartão do perfil: "Seg–Sex 09:00–18:00 · Monitor 2". */
export function describeWhen(w: ProfileWhen | undefined, monitorName: (device: string) => string = (d) => d): string {
  if (!hasCriteria(w)) return "";
  const parts: string[] = [];
  if (w!.days?.length || w!.from) {
    const time = w!.from && w!.to ? ` ${w!.from}–${w!.to}` : "";
    parts.push(`${describeDays(w!.days)}${time}`);
  }
  if (w!.monitors?.length) parts.push(w!.monitors.map(monitorName).join(", "));
  return parts.join(" · ");
}
