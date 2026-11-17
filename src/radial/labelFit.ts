// Como encaixar o rótulo na fatia: fonte um pouco menor, duas linhas ou, por último, "…".
// Puro (a medida do texto vem de fora), para ser testável sem navegador.

export interface LabelFit {
  lines: string[];
  /** Escala da fonte (1 = tamanho do tema). */
  scale: number;
}

/** Medida (px) de `text` com a fonte do tema multiplicada por `scale`. */
export type Measure = (text: string, scale: number) => number;
/** Largura livre (px) na linha `line` (0 = primeira) para `lines` linhas na escala `scale`. */
export type Room = (line: number, lines: number, scale: number) => number;

const SHRINK = 0.88;
const TWO_LINES = 0.9;
const MIN = 0.78;

/** Divide no espaço que deixa as duas linhas mais equilibradas. */
export function splitTwo(text: string): [string, string] | null {
  const words = text.split(/\s+/).filter(Boolean);
  if (words.length < 2) return null;
  let best: [string, string] | null = null;
  let bestDiff = Infinity;
  for (let i = 1; i < words.length; i++) {
    const a = words.slice(0, i).join(" ");
    const b = words.slice(i).join(" ");
    const diff = Math.abs(a.length - b.length);
    if (diff < bestDiff) {
      best = [a, b];
      bestDiff = diff;
    }
  }
  return best;
}

export function fitLabel(text: string, measure: Measure, room: Room): LabelFit {
  const fits = (lines: string[], scale: number) => lines.every((l, i) => measure(l, scale) <= room(i, lines.length, scale));
  for (const scale of [1, SHRINK]) if (fits([text], scale)) return { lines: [text], scale };
  const two = splitTwo(text);
  if (two) for (const scale of [TWO_LINES, MIN]) if (fits(two, scale)) return { lines: two, scale };
  // Último recurso: corta com reticências (o nome inteiro continua no aria-label / dica).
  let cut = text;
  const max = room(0, 1, MIN);
  while (cut.length > 1 && measure(`${cut}…`, MIN) > max) cut = cut.slice(0, -1);
  return { lines: [cut.length < text.length ? `${cut.trimEnd()}…` : text], scale: MIN };
}
