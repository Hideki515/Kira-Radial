import { useEffect, useState } from "react";
import { t } from "../../shared/i18n";
import { obsState, type ObsState } from "../../shared/ipc";
import type { Action, ObsCmd } from "../../shared/types";
import { Field } from "../controls";
import { OBS } from "./catalog";

type Props = { action: Extract<Action, { type: "obs" }>; onChange: (a: Action) => void };

/** Ação OBS: comando e, quando precisa, a cena ou a fonte (sugestões lidas do OBS aberto). */
export function ObsFields({ action, onChange }: Props) {
  const [obs, setObs] = useState<ObsState | null>(null);
  const needsList = action.cmd === "setScene" || action.cmd === "toggleMute";
  useEffect(() => {
    if (!needsList || obs) return;
    let alive = true;
    obsState().then((s) => alive && setObs(s), () => {});
    return () => {
      alive = false;
    };
  }, [needsList, obs]);

  const setCmd = (cmd: ObsCmd) => {
    // Só guarda o campo que o comando novo usa.
    const next: Extract<Action, { type: "obs" }> = { type: "obs", cmd };
    if (cmd === "setScene") next.scene = action.scene ?? "";
    if (cmd === "toggleMute") next.input = action.input ?? "";
    onChange(next);
  };

  return (
    <>
      <Field label={t("act.command")}>
        <select value={action.cmd} onChange={(e) => setCmd(e.target.value as ObsCmd)}>
          {OBS.map((c) => <option key={c.value} value={c.value}>{c.label}</option>)}
        </select>
      </Field>
      {action.cmd === "setScene" && (
        <Field label={t("obs.scene")} hint={t("obs.scene.hint")}>
          <input type="text" list="kira-obs-scenes" value={action.scene ?? ""} onChange={(e) => onChange({ ...action, scene: e.target.value })} />
          <datalist id="kira-obs-scenes">
            {(obs?.scenes ?? []).map((s) => <option key={s} value={s} />)}
          </datalist>
        </Field>
      )}
      {action.cmd === "toggleMute" && (
        <Field label={t("obs.input")} hint={t("obs.input.hint")}>
          <input type="text" list="kira-obs-inputs" value={action.input ?? ""} onChange={(e) => onChange({ ...action, input: e.target.value })} />
          <datalist id="kira-obs-inputs">
            {(obs?.inputs ?? []).map((s) => <option key={s} value={s} />)}
          </datalist>
        </Field>
      )}
    </>
  );
}
