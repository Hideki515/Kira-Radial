import { useEffect, useMemo, useState } from "react";
import { clipboardList, listAudioOutputs, listDisplays, listPowerPlans, listRadios, listRecentFiles, listWindows } from "../shared/ipc";
import { perfLog } from "../shared/perf";
import type { Action, DynamicKind, MenuItem } from "../shared/types";
import type { DynamicSources } from "./dynamic";

/** Como ler cada tipo de submenu automático e onde guardar o resultado. */
const LOADERS: { [K in DynamicKind]: { key: keyof DynamicSources; load: () => Promise<unknown[]> } } = {
  audioOutputs: { key: "audio", load: listAudioOutputs },
  windows: { key: "windows", load: listWindows },
  powerPlans: { key: "power", load: listPowerPlans },
  brightness: { key: "displays", load: listDisplays },
  radios: { key: "radios", load: listRadios },
  recentFiles: { key: "recent", load: listRecentFiles },
  clipboard: { key: "clipboard", load: clipboardList },
};

/**
 * Leituras lentas que quase não mudam sozinhas: dentro deste prazo, reabrir o menu usa o
 * que já foi lido (o brilho lê cada monitor por DDC/CI, ~100 ms cada). Os outros tipos
 * (janelas, áudio, recentes, área de transferência) são relidos a cada abertura.
 */
export const CACHE_MS: Partial<Record<DynamicKind, number>> = { brightness: 15_000, powerPlans: 10_000, radios: 5_000 };
/** Leituras mais lentas que isto vão para o log (para achar gargalos). */
export const SLOW_LOAD_MS = 250;

const loadedAt = new Map<DynamicKind, number>();

/** Esquece a leitura guardada (ex.: depois de uma ação que muda aquele dado). */
export function invalidateDynamic(kind?: DynamicKind): void {
  if (kind) loadedAt.delete(kind);
  else loadedAt.clear();
}

/** Qual leitura uma ação deixa desatualizada. */
export function kindChangedBy(action: Action | undefined): DynamicKind | undefined {
  switch (action?.type) {
    case "brightness": return "brightness";
    case "powerPlan": return "powerPlans";
    case "radio": return "radios";
    default: return undefined;
  }
}

/** Ainda vale o que foi lido às `at` (ms)? */
export function isFresh(kind: DynamicKind, at: number | undefined, now: number): boolean {
  const ttl = CACHE_MS[kind];
  return !!ttl && at !== undefined && now - at < ttl;
}

/**
 * Lê do sistema os dados dos submenus automáticos presentes em `items`.
 * Relê quando `active` fica verdadeiro ou `refreshKey` muda (ex.: a cada abertura do menu),
 * porque a lista muda (fones ligados, janelas abertas...) — exceto as leituras lentas ainda
 * dentro do prazo de `CACHE_MS`. Falha → lista vazia + registro no log.
 */
export function useDynamicSources(items: MenuItem[], active: boolean, refreshKey: number): DynamicSources {
  const kinds = useMemo(
    () => [...new Set(items.map((it) => it.dynamic).filter((k): k is DynamicKind => !!k))].sort().join(","),
    [items],
  );
  const [sources, setSources] = useState<DynamicSources>({});

  useEffect(() => {
    if (!active || !kinds) return;
    let alive = true;
    for (const kind of kinds.split(",") as DynamicKind[]) {
      // Tipo desconhecido (config de versão mais nova / editada à mão): ignora.
      if (!LOADERS[kind]) continue;
      const { key, load } = LOADERS[kind];
      const started = performance.now();
      if (isFresh(kind, loadedAt.get(kind), Date.now()) && sources[key] !== undefined) continue;
      load().then(
        (data) => {
          loadedAt.set(kind, Date.now());
          const took = performance.now() - started;
          if (took > SLOW_LOAD_MS) perfLog(`submenu "${kind}" levou ${took.toFixed(0)} ms para ler`);
          if (alive) setSources((s) => ({ ...s, [key]: data }));
        },
        (e) => {
          loadedAt.delete(kind);
          if (!alive) return;
          setSources((s) => ({ ...s, [key]: [] }));
          perfLog(`falha ao ler "${kind}": ${String(e)}`);
        },
      );
    }
    return () => {
      alive = false;
    };
  }, [active, refreshKey, kinds]);

  return sources;
}
