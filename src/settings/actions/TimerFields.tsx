import { t } from "../../shared/i18n";
import type { Action } from "../../shared/types";
import { Field, Segmented } from "../controls";

type Props = { action: Extract<Action, { type: "timer" }>; onChange: (a: Action) => void };
type Cmd = Props["action"]["cmd"];

/** Timer/Pomodoro: o que a fatia faz e, para iniciar, a duração. */
export function TimerFields({ action, onChange }: Props) {
  const usesMinutes = action.cmd === "toggle" || action.cmd === "start";
  return (
    <>
      <Field label={t("timer.cmd")} group hint={t("timer.hint")}>
        <Segmented<Cmd>
          value={action.cmd}
          options={[
            { value: "toggle", label: t("timer.toggle") },
            { value: "start", label: t("timer.start") },
            { value: "pause", label: t("timer.pause") },
            { value: "reset", label: t("timer.reset") },
          ]}
          onChange={(cmd) => onChange(cmd === "toggle" || cmd === "start" ? { type: "timer", cmd, minutes: action.minutes ?? 25 } : { type: "timer", cmd })}
        />
      </Field>
      {usesMinutes && (
        <Field label={t("timer.minutes")}>
          <input
            type="number"
            min={1}
            max={180}
            step={1}
            value={action.minutes ?? 25}
            onChange={(e) => onChange({ ...action, minutes: Math.round(Number(e.target.value)) || 1 })}
          />
        </Field>
      )}
    </>
  );
}
