// Ícones próprios das fatias (iconFile): carregados do disco uma vez (cache por caminho)
// e aplicados como iconSrc (imagem) na hora de desenhar. Falha → fica o ícone vetorial.
import { useEffect, useMemo, useState } from "react";
import { readIcon } from "./ipc";
import { perfLog } from "./perf";
import type { MenuItem } from "./types";

const cache = new Map<string, Promise<string | null>>();

export function loadIconFile(path: string): Promise<string | null> {
  let p = cache.get(path);
  if (!p) {
    p = readIcon(path).catch((e) => {
      perfLog(`ícone próprio "${path}" não carregou: ${String(e)}`, "warn");
      cache.delete(path); // tenta de novo na próxima (arquivo pode voltar)
      return null;
    });
    cache.set(path, p);
  }
  return p;
}

/** Esquece um caminho (ex.: o usuário trocou a imagem no mesmo lugar). */
export function forgetIconFile(path: string) {
  cache.delete(path);
}

/** Caminhos de iconFile usados em `items` (inclui subitens). */
export function iconFilesOf(items: MenuItem[]): string[] {
  const out = new Set<string>();
  const walk = (list: MenuItem[]) =>
    list.forEach((it) => {
      if (it.iconFile) out.add(it.iconFile);
      if (it.children) walk(it.children);
    });
  walk(items);
  return [...out].sort();
}

/** Troca iconFile por iconSrc (data URL) onde já carregou; o resto fica como está. */
export function applyIconFiles(items: MenuItem[], loaded: Record<string, string>): MenuItem[] {
  if (!Object.keys(loaded).length) return items;
  const map = (list: MenuItem[]): MenuItem[] =>
    list.map((it) => {
      const src = it.iconFile && !it.iconSrc ? loaded[it.iconFile] : undefined;
      const children = it.children ? map(it.children) : undefined;
      return src || children !== it.children ? { ...it, ...(src && { iconSrc: src }), ...(children && { children }) } : it;
    });
  return map(items);
}

/** Carrega os ícones próprios dos itens e devolve os itens com as imagens aplicadas. */
export function useIconFiles(items: MenuItem[]): MenuItem[] {
  const paths = useMemo(() => iconFilesOf(items), [items]);
  const key = paths.join("|");
  const [loaded, setLoaded] = useState<Record<string, string>>({});
  useEffect(() => {
    let alive = true;
    for (const p of key ? key.split("|") : []) {
      void loadIconFile(p).then((src) => alive && src && setLoaded((m) => (m[p] === src ? m : { ...m, [p]: src })));
    }
    return () => {
      alive = false;
    };
  }, [key]);
  return useMemo(() => applyIconFiles(items, loaded), [items, loaded]);
}
