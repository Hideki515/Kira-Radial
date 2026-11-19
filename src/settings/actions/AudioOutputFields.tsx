import { RefreshCw } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { listAudioOutputs, type AudioDevice } from "../../shared/ipc";
import type { Action } from "../../shared/types";
import { Field, Segmented } from "../controls";

type AudioAction = Extract<Action, { type: "audioOutput" }>;

export function AudioOutputFields({ action, onChange }: { action: AudioAction; onChange: (a: Action) => void }) {
  const [devices, setDevices] = useState<AudioDevice[] | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);

  const load = useCallback(() => {
    setLoadError(null);
    listAudioOutputs()
      .then(setDevices)
      .catch((e) => {
        setDevices([]);
        setLoadError(String(e));
      });
  }, []);

  useEffect(load, [load]);

  const list = devices ?? [];
  const selected =
    list.find((d) => action.deviceId && d.id === action.deviceId) ??
    list.find((d) => action.deviceName && d.name.trim().toLowerCase() === action.deviceName.trim().toLowerCase());
  const hasSaved = !!(action.deviceId || action.deviceName);
  // Dispositivo salvo que não está conectado agora continua aparecendo na lista.
  const missing = hasSaved && devices !== null && !selected;
  const MISSING = "__missing__";
  const value = selected ? selected.id : missing ? MISSING : "";

  return (
    <>
      <Field label="Modo">
        <Segmented
          value={action.mode}
          options={[
            { value: "cycle", label: "Alternar entre dispositivos" },
            { value: "set", label: "Dispositivo específico" },
          ]}
          onChange={(mode) => onChange({ ...action, mode })}
        />
      </Field>
      {action.mode === "cycle" ? (
        <p className="field-hint">
          Cada clique passa para a próxima saída de áudio ativa (ex.: alto-falantes → fone → monitor) e volta ao início.
        </p>
      ) : (
        <Field
          group
          label="Dispositivo de saída"
          hint="Torna este dispositivo a saída padrão do Windows (inclusive para chamadas). Se ele estiver desconectado, a ação avisa com um erro."
        >
          <div className="input-row">
            <select
              aria-label="Dispositivo de saída"
              value={value}
              disabled={devices === null}
              onChange={(e) => {
                const d = list.find((x) => x.id === e.target.value);
                if (d) onChange({ ...action, deviceId: d.id, deviceName: d.name });
              }}
            >
              {devices === null && <option value="">Carregando…</option>}
              {devices !== null && !value && <option value="">Selecione…</option>}
              {missing && (
                <option value={MISSING}>{`${action.deviceName || action.deviceId} (desconectado)`}</option>
              )}
              {list.map((d) => (
                <option key={d.id} value={d.id}>{d.isDefault ? `${d.name} (atual)` : d.name}</option>
              ))}
            </select>
            <button type="button" className="icon-btn" title="Atualizar lista" aria-label="Atualizar lista" onClick={load}>
              <RefreshCw size={16} />
            </button>
          </div>
          {loadError && <span className="inline-error">{loadError}</span>}
        </Field>
      )}
    </>
  );
}
