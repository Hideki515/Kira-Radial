// Escolha da tela do brilho: todas, onde o menu abriu ou um monitor específico.
import { MonitorUp, RefreshCw } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { identifyMonitors, listDisplays, type DisplayInfo } from "../shared/ipc";
import { Field } from "./controls";

const MISSING = "__missing__";

/** Rótulo de uma tela: "2. Monitor 2 (AOC2402) — 50%". */
export function displayLabel(d: DisplayInfo): string {
  const num = d.number ? `${d.number}. ` : "";
  return `${num}${d.name} — ${d.level}%`;
}

export function BrightnessTargetField({
  target,
  targetName,
  defaultTarget,
  onChange,
}: {
  target?: string;
  targetName?: string;
  /** Valor quando `target` está ausente ("all" na ação, "cursor" no submenu). */
  defaultTarget: "all" | "cursor";
  onChange: (target: string, targetName?: string) => void;
}) {
  const [displays, setDisplays] = useState<DisplayInfo[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const load = useCallback(() => {
    setError(null);
    listDisplays()
      .then(setDisplays)
      .catch((e) => {
        setDisplays([]);
        setError(String(e));
      });
  }, []);
  useEffect(load, [load]);

  const list = displays ?? [];
  const t = target ?? defaultTarget;
  const fixed = t === "all" || t === "cursor";
  const low = (s: string) => s.trim().toLowerCase();
  // Id antigo ("ddc:N") ou que mudou: acha pelo nome para mostrar a tela certa.
  const found = fixed ? undefined : (list.find((d) => low(d.id) === low(t)) ?? (targetName ? list.find((d) => low(d.name) === low(targetName)) : undefined));
  const missing = !fixed && displays !== null && !found;
  const value = fixed ? t : found ? found.id : MISSING;

  return (
    <Field
      group
      label="Tela"
      hint="“Onde o menu abriu” ajusta o monitor em que você está. Funciona na tela do notebook e em monitores com DDC/CI."
    >
      <div className="input-row">
        <select
          aria-label="Tela do brilho"
          value={value}
          onChange={(e) => {
            const v = e.target.value;
            if (v === MISSING) return;
            const d = list.find((x) => x.id === v);
            onChange(v, d?.name);
          }}
        >
          <option value="cursor">Onde o menu abriu</option>
          <option value="all">Todas as telas</option>
          {displays === null && !fixed && <option value={MISSING}>Carregando…</option>}
          {missing && <option value={MISSING}>{`${targetName || t} (desconectada)`}</option>}
          {list.map((d) => (
            <option key={d.id} value={d.id}>
              {displayLabel(d)}
            </option>
          ))}
        </select>
        <button type="button" className="icon-btn" title="Identificar monitores" aria-label="Identificar monitores" onClick={() => void identifyMonitors()}>
          <MonitorUp size={16} />
        </button>
        <button type="button" className="icon-btn" title="Atualizar lista" aria-label="Atualizar lista de telas" onClick={load}>
          <RefreshCw size={16} />
        </button>
      </div>
      {displays !== null && !list.length && <span className="field-hint">Nenhuma tela aceita ajuste de brilho agora.</span>}
      {error && <span className="inline-error">{error}</span>}
    </Field>
  );
}
