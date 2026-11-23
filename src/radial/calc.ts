// Calculadora da busca: "=2*35" mostra o resultado como fatia (clique cola o resultado).
// Analisador próprio (sem eval): + − * / ^ %, parênteses, menos unário, "x"/"×" e "÷",
// vírgula ou ponto como separador decimal.
import { getLang } from "../shared/i18n";
import type { MenuItem } from "../shared/types";

/** Avalia a expressão; null se for inválida ou não der um número finito. */
export function evaluate(expr: string): number | null {
  // "2 3" não vira 23.
  if (/[\d.,]\s+[\d.,]/.test(expr)) return null;
  const src = expr.replace(/\s+/g, "").replace(/[x×]/gi, "*").replace(/÷/g, "/").replace(/,/g, ".");
  if (!src || src.length > 200) return null;
  let i = 0;
  const peek = () => src[i];

  function number(): number | null {
    const m = /^(\d+(\.\d*)?|\.\d+)/.exec(src.slice(i));
    if (!m) return null;
    i += m[0].length;
    return Number(m[0]);
  }
  // fator := número | (expr) | -fator | +fator
  function factor(depth: number): number | null {
    if (depth > 50) return null;
    const c = peek();
    if (c === "-" || c === "+") {
      i++;
      const v = factor(depth + 1);
      return v === null ? null : c === "-" ? -v : v;
    }
    if (c === "(") {
      i++;
      const v = sum(depth + 1);
      if (v === null || peek() !== ")") return null;
      i++;
      return v;
    }
    return number();
  }
  // potência := fator (^ potência)?  (associa à direita)
  function power(depth: number): number | null {
    const b = factor(depth);
    if (b === null) return null;
    if (peek() === "^") {
      i++;
      const e = power(depth + 1);
      return e === null ? null : Math.pow(b, e);
    }
    return b;
  }
  function product(depth: number): number | null {
    let v = power(depth);
    while (v !== null && (peek() === "*" || peek() === "/" || peek() === "%")) {
      const op = src[i++];
      const r = power(depth);
      if (r === null) return null;
      v = op === "*" ? v * r : op === "/" ? v / r : v % r;
    }
    return v;
  }
  function sum(depth: number): number | null {
    let v = product(depth);
    while (v !== null && (peek() === "+" || peek() === "-")) {
      const op = src[i++];
      const r = product(depth);
      if (r === null) return null;
      v = op === "+" ? v + r : v - r;
    }
    return v;
  }

  const v = sum(0);
  return v !== null && i === src.length && Number.isFinite(v) ? v : null;
}

/** Número no formato do idioma, sem separador de milhar (para colar em qualquer lugar). */
export function formatNumber(n: number): string {
  // Arredonda o ruído de ponto flutuante (0.1 + 0.2 → 0.3).
  const clean = Number(n.toPrecision(12));
  return new Intl.NumberFormat(getLang() === "pt" ? "pt-BR" : "en-US", { maximumFractionDigits: 10, useGrouping: false }).format(clean);
}

/** A consulta é uma conta? ("=..." ) */
export const isCalcQuery = (q: string) => q.trimStart().startsWith("=");

/** Fatia com o resultado da conta (null = conta incompleta/inválida). */
export function calcResult(query: string): MenuItem | null {
  if (!isCalcQuery(query)) return null;
  const v = evaluate(query.trimStart().slice(1));
  if (v === null) return null;
  const text = formatNumber(v);
  return {
    id: "__calc",
    label: `= ${text}`,
    icon: "calculator",
    action: { type: "text", text, restoreClipboard: true },
  };
}
