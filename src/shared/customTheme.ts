// Temas personalizados: decorações de um tema embutido ("base") + cores escolhidas pelo
// usuário. Só cores (variáveis CSS) — nada de CSS livre, então não há como injetar estilo/script.
import { THEME_ACCENT, THEMES, type Theme } from "./types";

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

export const COLOR_LABEL: Record<ColorKey, string> = {
  accent: "Destaque",
  backing: "Fundo do anel",
  slice: "Fatias",
  sliceBorder: "Borda das fatias",
  label: "Texto",
  activeSlice: "Fatia ativa",
  activeLabel: "Texto ativo",
  hub: "Centro",
  hubText: "Texto do centro",
  gauge: "Medidor",
};

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
  return list.find((t) => !!t && typeof t === "object" && t.id === id);
}

/** Variáveis CSS aplicadas no <svg> do menu (lidas por .theme-custom em themes2.css). */
export function themeVars(t: CustomTheme): Record<string, string> {
  // Só cores #rrggbb viram variável: cor inválida (config editada à mão) cai no padrão do CSS.
  const c = (t?.colors && typeof t.colors === "object" ? t.colors : {}) as Partial<ThemeColors>;
  const ok = (x: unknown): x is string => typeof x === "string" && HEX.test(x);
  const v: Record<string, string> = {};
  if (ok(c.accent)) v["--active"] = c.accent;
  if (ok(c.gauge)) v["--accent"] = c.gauge;
  for (const k of COLOR_KEYS) if (ok(c[k])) v[`--k-${k}`] = c[k];
  return v;
}

/** Problemas de um tema (vazio = ok). */
export function customThemeErrors(t: CustomTheme): string[] {
  const out: string[] = [];
  if (!t || typeof t !== "object") return ["formato inválido."];
  const name = typeof t.name === "string" ? t.name : "";
  if (!name.trim()) out.push("nome vazio.");
  if (name.length > 40) out.push("nome com mais de 40 caracteres.");
  if (!THEMES.includes(t.base)) out.push(`tema base desconhecido ("${String(t.base)}").`);
  const colors = (t.colors && typeof t.colors === "object" ? t.colors : {}) as Record<string, unknown>;
  for (const k of COLOR_KEYS) {
    const c = colors[k];
    if (typeof c !== "string" || !HEX.test(c)) out.push(`cor "${COLOR_LABEL[k]}" inválida (use #rrggbb).`);
  }
  return out;
}

const newId = () => `t${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;

export function createTheme(base: Theme, name = "Meu tema"): CustomTheme {
  return { id: newId(), name, base, colors: defaultColors(base) };
}

/** JSON para compartilhar (.kira-theme.json). Sem id: quem importa ganha um novo. */
export function exportTheme(t: CustomTheme): string {
  return JSON.stringify({ kiraTheme: 1, name: t.name, base: t.base, colors: t.colors }, null, 2);
}

/** Lê um tema exportado. Valida formato, tamanho e cores; devolve com id novo. */
export function importTheme(text: string): CustomTheme {
  if (text.length > 4096) throw new Error("arquivo grande demais para um tema");
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    throw new Error("não é um JSON válido");
  }
  const o = raw as { kiraTheme?: number; name?: unknown; base?: unknown; colors?: Record<string, unknown> };
  if (o?.kiraTheme !== 1) throw new Error("não é um tema da Kira");
  const colors = {} as ThemeColors;
  for (const k of COLOR_KEYS) colors[k] = String(o.colors?.[k] ?? "");
  const t: CustomTheme = { id: newId(), name: String(o.name ?? "").slice(0, 40), base: o.base as Theme, colors };
  const errs = customThemeErrors(t);
  if (errs.length) throw new Error(errs[0]);
  return t;
}
