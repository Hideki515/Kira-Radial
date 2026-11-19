import { RefreshCw } from "lucide-react";
import { t } from "../../shared/i18n";
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
      <Field label={t("act.mode")}>
        <Segmented
          value={action.mode}
          options={[
            { value: "cycle", label: t("audio.cycle") },
            { value: "set", label: t("audio.set") },
          ]}
          onChange={(mode) => onChange({ ...action, mode })}
        />
      </Field>
      {action.mode === "cycle" ? (
        <p className="field-hint">
          {t("audio.cycle.hint")}
        </p>
      ) : (
        <Field
          group
          label={t("audio.device")}
          hint={t("audio.device.hint")}
        >
          <div className="input-row">
            <select
              aria-label={t("audio.device")}
              value={value}
              disabled={devices === null}
              onChange={(e) => {
                const d = list.find((x) => x.id === e.target.value);
                if (d) onChange({ ...action, deviceId: d.id, deviceName: d.name });
              }}
            >
              {devices === null && <option value="">{t("act.loading")}</option>}
              {devices !== null && !value && <option value="">{t("act.select")}</option>}
              {missing && (
                <option value={MISSING}>{t("audio.disconnected", { name: action.deviceName || action.deviceId || "" })}</option>
              )}
              {list.map((d) => (
                <option key={d.id} value={d.id}>{d.isDefault ? t("act.current", { name: d.name }) : d.name}</option>
              ))}
            </select>
            <button type="button" className="icon-btn" title={t("act.refresh")} aria-label={t("act.refresh")} onClick={load}>
              <RefreshCw size={16} />
            </button>
          </div>
          {loadError && <span className="inline-error">{loadError}</span>}
        </Field>
      )}
    </>
  );
}
