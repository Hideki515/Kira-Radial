import { useEffect, useMemo, useState } from "react";
import { clipboardList, listAudioOutputs, listDisplays, listPowerPlans, listRadios, listRecentFiles, listWindows } from "../shared/ipc";
import { perfLog } from "../shared/perf";
import type { DynamicKind, MenuItem } from "../shared/types";
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
 * Lê do sistema os dados dos submenus automáticos presentes em `items`.
 * Relê sempre que `active` fica verdadeiro ou `refreshKey` muda (ex.: a cada abertura do menu),
 * porque a lista muda (fones ligados, janelas abertas...). Falha → lista vazia + registro no perf.log.
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
      const { key, load } = LOADERS[kind];
      load().then(
        (data) => alive && setSources((s) => ({ ...s, [key]: data })),
        (e) => {
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
