// Busca por digitação no menu aberto: fatias e subitens de todos os perfis (puro, sem React).
import { describeAction } from "../shared/describe";
import type { MenuItem, Profile } from "../shared/types";

/** Quantos resultados viram fatias do anel. */
export const MAX_RESULTS = 8;
/** O anel precisa de pelo menos 3 fatias para desenhar. */
export const MIN_SLICES = 3;

export interface SearchEntry {
  item: MenuItem;
  profileId: string;
  label: string;
  words: string[];
  desc: string;
}

/** Minúsculas e sem acentos ("Configurações" → "configuracoes"). */
export function normalize(s: string): string {
  return s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().trim();
}

const wordsOf = (s: string) => normalize(s).split(/[^a-z0-9]+/).filter(Boolean);

/**
 * Índice com fatias e subitens de todos os perfis. Fica de fora o que não dá para executar
 * daqui: submenus automáticos (gerados na hora) e itens sem ação nem subitens.
 */
export function buildIndex(profiles: Profile[]): SearchEntry[] {
  const out: SearchEntry[] = [];
  const seen = new Set<string>();
  const add = (item: MenuItem, profileId: string) => {
    if (item.dynamic || (!item.action && !item.children?.length) || seen.has(item.id)) return;
    seen.add(item.id);
    out.push({
      item,
      profileId,
      label: normalize(item.label),
      words: wordsOf(item.label),
      desc: item.action ? normalize(describeAction(item.action)) : "",
    });
  };
  for (const p of profiles) {
    for (const it of p.items) {
      add(it, p.id);
      for (const ch of it.children ?? []) add(ch, p.id);
    }
  }
  return out;
}

/** Iniciais das palavras começam com a consulta ("cs" → "Configurações do Sistema"). */
function initialsMatch(words: string[], q: string): boolean {
  const significant = words.filter((w) => w.length > 2);
  const initials = (significant.length >= q.length ? significant : words).map((w) => w[0]).join("");
  return q.length >= 2 && initials.startsWith(q);
}

/** Pontuação (0 = não bate). Maior = melhor. */
export function score(e: SearchEntry, rawQuery: string): number {
  const q = normalize(rawQuery);
  if (!q) return 0;
  if (e.label === q) return 120;
  if (e.label.startsWith(q)) return 100;
  if (e.words.some((w) => w.startsWith(q))) return 80;
  if (e.label.includes(q)) return 60;
  if (!q.includes(" ") && initialsMatch(e.words, q)) return 50;
  if (e.desc.includes(q)) return 30;
  return 0;
}

/** Melhores resultados (até `max`); empate: perfil atual primeiro, depois nome mais curto. */
export function search(index: SearchEntry[], query: string, currentProfileId: string, max = MAX_RESULTS): MenuItem[] {
  return index
    .map((e) => ({ e, s: score(e, query) }))
    .filter((r) => r.s > 0)
    .sort(
      (a, b) =>
        b.s - a.s ||
        Number(b.e.profileId === currentProfileId) - Number(a.e.profileId === currentProfileId) ||
        a.e.label.length - b.e.label.length,
    )
    .slice(0, max)
    .map((r) => r.e.item);
}

/** Resultados como fatias do anel (completa com fatias vazias até o mínimo de 3). */
export function asSlices(results: MenuItem[]): MenuItem[] {
  const out = [...results];
  for (let i = out.length; i < MIN_SLICES; i++) out.push({ id: `__search-empty-${i}`, label: "", icon: "circle" });
  return out;
}

/** Tecla que entra no texto da busca (letra, número, espaço e pontuação simples). */
export function isSearchChar(e: Pick<KeyboardEvent, "key" | "ctrlKey" | "altKey" | "metaKey">): boolean {
  return !e.ctrlKey && !e.altKey && !e.metaKey && e.key.length === 1 && /[\p{L}\p{N} ._\-/+&]/u.test(e.key);
}
