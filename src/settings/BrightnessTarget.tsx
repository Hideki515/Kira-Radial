// Escolha da tela do brilho: todas, onde o menu abriu ou um monitor específico.
import { MonitorUp, RefreshCw } from "lucide-react";
import { t } from "../shared/i18n";
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
  const tgt = target ?? defaultTarget;
  const fixed = tgt === "all" || tgt === "cursor";
  const low = (s: string) => s.trim().toLowerCase();
  // Id antigo ("ddc:N") ou que mudou: acha pelo nome para mostrar a tela certa.
  const found = fixed ? undefined : (list.find((d) => low(d.id) === low(tgt)) ?? (targetName ? list.find((d) => low(d.name) === low(targetName)) : undefined));
  const missing = !fixed && displays !== null && !found;
  const value = fixed ? tgt : found ? found.id : MISSING;

  return (
    <Field
      group
      label={t("bt.label")}
      hint={t("bt.hint")}
    >
      <div className="input-row">
        <select
          aria-label={t("bt.aria")}
          value={value}
          onChange={(e) => {
            const v = e.target.value;
            if (v === MISSING) return;
            const d = list.find((x) => x.id === v);
            onChange(v, d?.name);
          }}
        >
          <option value="cursor">{t("bt.cursor")}</option>
          <option value="all">{t("bt.all")}</option>
          {displays === null && !fixed && <option value={MISSING}>{t("bt.loading")}</option>}
          {missing && <option value={MISSING}>{t("bt.disconnected", { name: targetName || tgt })}</option>}
          {list.map((d) => (
            <option key={d.id} value={d.id}>
              {displayLabel(d)}
            </option>
          ))}
        </select>
        <button type="button" className="icon-btn" title={t("bt.identify")} aria-label={t("bt.identify")} onClick={() => void identifyMonitors()}>
          <MonitorUp size={16} />
        </button>
        <button type="button" className="icon-btn" title={t("bt.refresh")} aria-label={t("bt.refresh.aria")} onClick={load}>
          <RefreshCw size={16} />
        </button>
      </div>
      {displays !== null && !list.length && <span className="field-hint">Nenhuma tela aceita ajuste de brilho agora.</span>}
      {error && <span className="inline-error">{error}</span>}
    </Field>
  );
}
