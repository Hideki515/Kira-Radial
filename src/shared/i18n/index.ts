// Tradução da interface (português/inglês), sem biblioteca.
// - `t(key, vars)` devolve o texto no idioma atual; `{nome}` no texto vira vars.nome.
// - `useT()` faz o componente redesenhar quando o idioma muda.
// - O idioma vem da config (behavior.language: "auto" | "pt" | "en"); "auto" segue o Windows.
import { useSyncExternalStore } from "react";
import { systemLanguages } from "../ipc";
import { en } from "./en";
import { pt, type Key } from "./pt";

export type { Key } from "./pt";
export type Lang = "pt" | "en";
export type LangSetting = "auto" | Lang;

const TABLES: Record<Lang, Record<Key, string>> = { pt, en };
let current: Lang = "pt";
const listeners = new Set<() => void>();

/**
 * "auto" = português se ele estiver em qualquer posição da lista de idiomas do usuário
 * (o Windows pode estar em inglês com o português em 2º); senão inglês.
 */
export function resolveLang(setting: LangSetting | undefined, systemLangs?: string | readonly string[]): Lang {
  if (setting === "pt" || setting === "en") return setting;
  const sys = systemLangs ?? (typeof navigator !== "undefined" ? [navigator.language, ...(navigator.languages ?? [])] : ["pt-BR"]);
  const list = typeof sys === "string" ? [sys] : sys;
  return list.some((l) => /^pt\b/i.test(l)) ? "pt" : "en";
}

let sysLangs: Promise<readonly string[]> | null = null;
let lastSetting: LangSetting | undefined;

/**
 * Aplica o idioma da config. "auto" consulta a lista de idiomas do Windows (uma vez por
 * janela); até a resposta chegar, fica o idioma atual (português ao abrir).
 */
export function applyLangSetting(setting: LangSetting | undefined): void {
  lastSetting = setting;
  if (setting === "pt" || setting === "en") return setLang(setting);
  sysLangs ??= Promise.resolve().then(systemLanguages).catch(() => [] as string[]);
  void sysLangs.then((l) => {
    if (lastSetting === setting) setLang(resolveLang("auto", l.length ? l : undefined));
  });
}

/** Só para testes: esquece a lista de idiomas guardada. */
export function resetSystemLangsForTests(): void {
  sysLangs = null;
}

export function getLang(): Lang {
  return current;
}

export function setLang(lang: Lang): void {
  if (lang === current) return;
  current = lang;
  if (typeof document !== "undefined") document.documentElement.lang = lang === "pt" ? "pt-BR" : "en";
  listeners.forEach((l) => l());
}

export function t(key: Key, vars?: Record<string, string | number>): string {
  const text = TABLES[current][key] ?? pt[key] ?? key;
  return vars ? text.replace(/\{(\w+)\}/g, (m, name: string) => (name in vars ? String(vars[name]) : m)) : text;
}

const subscribe = (cb: () => void) => {
  listeners.add(cb);
  return () => void listeners.delete(cb);
};

/** Idioma atual; o componente redesenha quando ele muda. */
export function useLang(): Lang {
  return useSyncExternalStore(subscribe, getLang, getLang);
}

/** `t` com redesenho automático ao trocar de idioma. */
export function useT(): typeof t {
  useLang();
  return t;
}
