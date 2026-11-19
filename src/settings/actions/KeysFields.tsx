import { comboIsCapture } from "../../shared/keys";
import { t } from "../../shared/i18n";
import type { Action } from "../../shared/types";
import { Field, Toggle } from "../controls";
import { HotkeyRecorder } from "../HotkeyRecorder";

export function KeysFields({ action, onChange }: { action: Extract<Action, { type: "keys" }>; onChange: (a: Action) => void }) {
  return (
    <>
      <Field group label={t("keys.combo")} hint={t("keys.combo.hint")}>
        <div className="input-row">
          <input value={action.combo} onChange={(e) => onChange({ ...action, combo: e.target.value })} placeholder="Ctrl+C" />
          <HotkeyRecorder value={action.combo} onChange={(combo) => onChange({ ...action, combo })} />
        </div>
      </Field>
      <Field
        label={t("keys.delay")}
        hint={t("keys.delay.hint")}
      >
        <div className="input-row delay-row">
          <input
            type="number"
            min={0}
            max={10000}
            step={50}
            value={action.delayMs ?? 0}
            onChange={(e) => {
              const v = Math.round(Number(e.target.value));
              onChange({ ...action, delayMs: Number.isFinite(v) && v > 0 ? v : undefined });
            }}
          />
          <div className="delay-presets">
            {[0, 100, 250, 500].map((ms) => (
              <button
                key={ms}
                type="button"
                className={`chip is-pick${(action.delayMs ?? 0) === ms ? " is-on" : ""}`}
                onClick={() => onChange({ ...action, delayMs: ms || undefined })}
              >
                {ms} ms
              </button>
            ))}
          </div>
        </div>
      </Field>
      {comboIsCapture(action.combo) ? (
        <p className="field-hint" data-testid="capture-auto">
          {t("keys.captureAuto")}
        </p>
      ) : (
        <Toggle
          label={t("keys.capture")}
          hint={t("keys.capture.hint")}
          checked={!!action.capture}
          onChange={(v) => onChange({ ...action, capture: v || undefined })}
        />
      )}
    </>
  );
}
