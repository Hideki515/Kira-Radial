// Contas da navegação do menu (teclado e roda), sem React: fáceis de testar.

/** Próximo índice ao andar `d` (±1) numa roda de `n` itens; sem seleção, começa do primeiro/último. */
export function stepIndex(current: number | null, d: number, n: number): number {
  if (n <= 0) return 0;
  return ((current ?? (d > 0 ? -1 : 0)) + d + n) % n;
}

/** Roda do mouse: sem seleção, conta a partir de `start` (sub-anel: -1; anel principal: 0). */
export function wheelIndex(current: number | null, d: number, n: number, start: number): number {
  if (n <= 0) return 0;
  return ((current ?? start) + d + n) % n;
}

/** Tecla 1–9 (linha de números ou teclado numérico, sem Ctrl/Alt/Win) → índice 0–8. */
export function digitIndex(e: Pick<KeyboardEvent, "code" | "ctrlKey" | "altKey" | "metaKey">): number | null {
  if (e.ctrlKey || e.altKey || e.metaKey) return null;
  const d = /^(Digit|Numpad)([1-9])$/.exec(e.code)?.[2];
  return d ? Number(d) - 1 : null;
}
