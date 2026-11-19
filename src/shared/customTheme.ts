// Temas personalizados: decorações de um tema embutido ("base") + cores escolhidas pelo
// usuário. Só cores (variáveis CSS) — nada de CSS livre, então não há como injetar estilo/script.
import { THEME_ACCENT, THEMES, type Theme } from "./types";
import { t, type Key } from "./i18n";

export const COLOR_KEYS = [
  "accent",
  "backing",
  "slice",
  "sliceBorder",
  "label",
  "activeSlice",
  "activeLabel",
  "hub",
  "hubText",
  "gauge",
] as const;
export type ColorKey = (typeof COLOR_KEYS)[number];
export type ThemeColors = Record<ColorKey, string>;

export interface CustomTheme {
  id: string;
  name: string;
  /** Tema embutido de onde vêm as decorações (anéis, esfera, engrenagens...). */
  base: Theme;
  colors: ThemeColors;
}

/** Nome de cada cor, no idioma atual. */
export const COLOR_LABEL: Record<ColorKey, string> = new Proxy({} as Record<ColorKey, string>, {
  get: (_, k) => t(`ct.color.${String(k)}` as Key),
});

export const MAX_CUSTOM_THEMES = 20;
export const CUSTOM_PREFIX = "custom:";
const HEX = /^#[0-9a-f]{6}$/i;

/** Cores iniciais de um tema novo: escuras, com o destaque sugerido do tema base. */
export function defaultColors(base: Theme): ThemeColors {
  const accent = THEME_ACCENT[base] ?? "#4ade9b";
  const light = base === "fluent";
  return {
    accent,
    backing: light ? "#f3f3f3" : "#06090d",
    slice: light ? "#fbfbfb" : "#0d1420",
    sliceBorder: light ? "#d6d6d6" : "#1f2a38",
    label: light ? "#1b1b1b" : "#dde3ec",
    activeSlice: light ? "#e6f0fb" : "#13251f",
    activeLabel: accent,
    hub: light ? "#ffffff" : "#0c1118",
    hubText: light ? "#1b1b1b" : "#f2f5fa",
    gauge: accent,
  };
}

export const isCustomRef = (theme: string | undefined) => !!theme?.startsWith(CUSTOM_PREFIX);
export const customRef = (id: string): `custom:${string}` => `custom:${id}`;

/** Tema personalizado escolhido em `appearance.theme`, se existir. */
export function findCustom(theme: string | undefined, list: CustomTheme[] | undefined): CustomTheme | undefined {
  if (!isCustomRef(theme)) return undefined;
  const id = theme!.slice(CUSTOM_PREFIX.length);
  // Config editada à mão: lista que não é lista ou entradas que não são objetos são ignoradas.
  if (!Array.isArray(list)) return undefined;
  return list.find((th) => !!th && typeof th === "object" && th.id === id);
}

/** Variáveis CSS aplicadas no <svg> do menu (lidas por .theme-custom em themes2.css). */
export function themeVars(th: CustomTheme): Record<string, string> {
  // Só cores #rrggbb viram variável: cor inválida (config editada à mão) cai no padrão do CSS.
  const c = (th?.colors && typeof th.colors === "object" ? th.colors : {}) as Partial<ThemeColors>;
  const ok = (x: unknown): x is string => typeof x === "string" && HEX.test(x);
  const v: Record<string, string> = {};
  if (ok(c.accent)) v["--active"] = c.accent;
  if (ok(c.gauge)) v["--accent"] = c.gauge;
  for (const k of COLOR_KEYS) if (ok(c[k])) v[`--k-${k}`] = c[k];
  return v;
}

/** Problemas de um tema (vazio = ok). */
export function customThemeErrors(th: CustomTheme): string[] {
  const out: string[] = [];
  if (!th || typeof th !== "object") return [t("ct.format")];
  const name = typeof th.name === "string" ? th.name : "";
  if (!name.trim()) out.push(t("ct.noName"));
  if (name.length > 40) out.push(t("ct.longName"));
  if (!THEMES.includes(th.base)) out.push(t("ct.badBase", { base: String(th.base) }));
  const colors = (th.colors && typeof th.colors === "object" ? th.colors : {}) as Record<string, unknown>;
  for (const k of COLOR_KEYS) {
    const c = colors[k];
    if (typeof c !== "string" || !HEX.test(c)) out.push(t("ct.badColor", { color: COLOR_LABEL[k] }));
  }
  return out;
}

const newId = () => `t${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;

export function createTheme(base: Theme, name = t("ct.defaultName")): CustomTheme {
  return { id: newId(), name, base, colors: defaultColors(base) };
}

/** JSON para compartilhar (.kira-theme.json). Sem id: quem importa ganha um novo. */
export function exportTheme(th: CustomTheme): string {
  return JSON.stringify({ kiraTheme: 1, name: th.name, base: th.base, colors: th.colors }, null, 2);
}

/** Lê um tema exportado. Valida formato, tamanho e cores; devolve com id novo. */
export function importTheme(text: string): CustomTheme {
  if (text.length > 4096) throw new Error(t("ct.tooBig"));
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    throw new Error(t("ct.notJson"));
  }
  const o = raw as { kiraTheme?: number; name?: unknown; base?: unknown; colors?: Record<string, unknown> };
  if (o?.kiraTheme !== 1) throw new Error(t("ct.notTheme"));
  const colors = {} as ThemeColors;
  for (const k of COLOR_KEYS) colors[k] = String(o.colors?.[k] ?? "");
  const th: CustomTheme = { id: newId(), name: String(o.name ?? "").slice(0, 40), base: o.base as Theme, colors };
  const errs = customThemeErrors(th);
  if (errs.length) throw new Error(errs[0]);
  return th;
}
