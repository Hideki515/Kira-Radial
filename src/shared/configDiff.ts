// Diferenças legíveis entre duas configurações (para "Ver diferenças" de um backup).
import type { Config, MenuItem } from "./types";
import { t } from "./i18n";

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
    out.push(t("cd.hotkey", { a: fmt(current.hotkey?.accelerator), b: fmt(other.hotkey?.accelerator) }));
  if (current.hotkey?.mode !== other.hotkey?.mode) out.push(t("cd.hotkeyMode", { a: fmt(current.hotkey?.mode), b: fmt(other.hotkey?.mode) }));
  compareFields(t("cd.behavior"), current.behavior, other.behavior, out);
  compareFields(t("cd.appearance"), current.appearance, other.appearance, out);
  if (current.launcher?.mode !== other.launcher?.mode) out.push(t("cd.launcher", { a: fmt(current.launcher?.mode), b: fmt(other.launcher?.mode) }));

  const byId = (cfg: Config) => new Map(cfg.profiles.map((p) => [p.id, p]));
  const pa = byId(current);
  const pb = byId(other);
  for (const [id, p] of pa) if (!pb.has(id)) out.push(t("cd.profileRemoved", { name: p.name }));
  for (const [id, p] of pb) if (!pa.has(id)) out.push(t("cd.profileAdded", { name: p.name, n: p.items.length }));
  for (const [id, a] of pa) {
    const b = pb.get(id);
    if (!b) continue;
    const where = t("cd.where", { name: b.name });
    if (a.name !== b.name) out.push(t("cd.rename", { where, a: fmt(a.name), b: fmt(b.name) }));
    const ia = flatItems(a.items);
    const ib = flatItems(b.items);
    for (const [iid, it] of ia) if (!ib.has(iid)) out.push(t("cd.itemRemoved", { where, label: it.label }));
    for (const [iid, it] of ib) if (!ia.has(iid)) out.push(t("cd.itemAdded", { where, label: it.label }));
    for (const [iid, x] of ia) {
      const y = ib.get(iid);
      if (y && JSON.stringify(x) !== JSON.stringify(y)) out.push(t("cd.itemChanged", { where, label: y.label }));
    }
    const order = (items: MenuItem[]) => items.map((i) => i.id).join(",");
    if (order(a.items) !== order(b.items) && a.items.length === b.items.length) out.push(t("cd.order", { where }));
  }
  return out;
}
