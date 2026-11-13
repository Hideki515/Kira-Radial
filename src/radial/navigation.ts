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

/** Onde o menu está, para o knob (controle dedicado) decidir o próximo passo. */
export interface RingState {
  openMain: number | null;
  activeMain: number | null;
  activeSub: number | null;
  mainCount: number;
  subCount: number;
}

/**
 * Girar o knob. No sub-anel há uma posição a mais, "Voltar" (activeSub = null, o centro),
 * porque o knob não tem toque longo para sair do submenu.
 */
export function knobStep(s: RingState, d: number): { activeMain: number | null; activeSub: number | null } {
  if (s.openMain !== null && s.subCount > 0) {
    const size = s.subCount + 1;
    const cur = s.activeSub === null ? 0 : s.activeSub + 1;
    const next = (((cur + d) % size) + size) % size;
    return { activeMain: s.activeMain, activeSub: next === 0 ? null : next - 1 };
  }
  return { activeMain: s.mainCount > 0 ? stepIndex(s.activeMain, d, s.mainCount) : null, activeSub: null };
}

export type KnobPress = { kind: "close" } | { kind: "back" } | { kind: "openSub"; index: number } | { kind: "execute" };

/** Apertar o knob com o menu aberto. */
export function knobPress(s: RingState, mainHasChildren: boolean): KnobPress {
  if (s.openMain !== null && s.subCount > 0) return s.activeSub === null ? { kind: "back" } : { kind: "execute" };
  if (s.activeMain === null) return { kind: "close" };
  return mainHasChildren ? { kind: "openSub", index: s.activeMain } : { kind: "execute" };
}
