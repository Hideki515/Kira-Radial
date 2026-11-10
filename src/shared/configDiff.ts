// Diferenças legíveis entre duas configurações (para "Ver diferenças" de um backup).
import type { Config, MenuItem } from "./types";

const fmt = (v: unknown) => (typeof v === "string" ? `"${v}"` : JSON.stringify(v));

function flatItems(items: MenuItem[]): Map<string, MenuItem> {
  const m = new Map<string, MenuItem>();
  for (const it of items) {
    m.set(it.id, it);
    for (const ch of it.children ?? []) m.set(ch.id, ch);
  }
  return m;
}

/** Compara campos simples de um objeto (aparência, comportamento...). */
function compareFields(section: string, a: object | undefined, b: object | undefined, out: string[]) {
  const ra = (a ?? {}) as Record<string, unknown>;
  const rb = (b ?? {}) as Record<string, unknown>;
  for (const k of new Set([...Object.keys(ra), ...Object.keys(rb)])) {
    if (JSON.stringify(ra[k]) !== JSON.stringify(rb[k])) out.push(`${section}.${k}: ${fmt(ra[k])} → ${fmt(rb[k])}`);
  }
}

/**
 * O que muda ao trocar `current` por `other` (ex.: restaurar um backup).
 * Lista curta e legível; vazia = iguais.
 */
export function diffConfigs(current: Config, other: Config): string[] {
  const out: string[] = [];
  if (current.hotkey?.accelerator !== other.hotkey?.accelerator)
    out.push(`Atalho: ${fmt(current.hotkey?.accelerator)} → ${fmt(other.hotkey?.accelerator)}`);
  if (current.hotkey?.mode !== other.hotkey?.mode) out.push(`Modo do atalho: ${fmt(current.hotkey?.mode)} → ${fmt(other.hotkey?.mode)}`);
  compareFields("Comportamento", current.behavior, other.behavior, out);
  compareFields("Aparência", current.appearance, other.appearance, out);
  if (current.launcher?.mode !== other.launcher?.mode) out.push(`Abrir por: ${fmt(current.launcher?.mode)} → ${fmt(other.launcher?.mode)}`);

  const byId = (cfg: Config) => new Map(cfg.profiles.map((p) => [p.id, p]));
  const pa = byId(current);
  const pb = byId(other);
  for (const [id, p] of pa) if (!pb.has(id)) out.push(`Perfil removido: ${p.name}`);
  for (const [id, p] of pb) if (!pa.has(id)) out.push(`Perfil adicionado: ${p.name} (${p.items.length} fatias)`);
  for (const [id, a] of pa) {
    const b = pb.get(id);
    if (!b) continue;
    const where = `Perfil "${b.name}"`;
    if (a.name !== b.name) out.push(`${where}: nome ${fmt(a.name)} → ${fmt(b.name)}`);
    const ia = flatItems(a.items);
    const ib = flatItems(b.items);
    for (const [iid, it] of ia) if (!ib.has(iid)) out.push(`${where}: removido "${it.label}"`);
    for (const [iid, it] of ib) if (!ia.has(iid)) out.push(`${where}: adicionado "${it.label}"`);
    for (const [iid, x] of ia) {
      const y = ib.get(iid);
      if (y && JSON.stringify(x) !== JSON.stringify(y)) out.push(`${where}: alterado "${y.label}"`);
    }
    const order = (items: MenuItem[]) => items.map((i) => i.id).join(",");
    if (order(a.items) !== order(b.items) && a.items.length === b.items.length) out.push(`${where}: ordem das fatias`);
  }
  return out;
}
