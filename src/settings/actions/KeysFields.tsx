import { comboIsCapture } from "../../shared/keys";
import type { Action } from "../../shared/types";
import { Field, Toggle } from "../controls";
import { HotkeyRecorder } from "../HotkeyRecorder";

export function KeysFields({ action, onChange }: { action: Extract<Action, { type: "keys" }>; onChange: (a: Action) => void }) {
  return (
    <>
      <Field group label="Combinação" hint="Clique na caixa tracejada e pressione a combinação (aceita Ctrl, Alt, Shift e Win), ou digite o texto, ex.: Ctrl+Shift+Esc, Win+D. Será enviada ao app que estava em foco.">
        <div className="input-row">
          <input value={action.combo} onChange={(e) => onChange({ ...action, combo: e.target.value })} placeholder="Ctrl+C" />
          <HotkeyRecorder value={action.combo} onChange={(combo) => onChange({ ...action, combo })} />
        </div>
      </Field>
      <Field
        label="Atraso antes de enviar (ms)"
        hint="O menu já some da tela antes de enviar. Use um atraso extra se o app de destino demorar a reagir (ex.: 100–300 ms para apps de print como o Lightshot). 0 = sem atraso."
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
          Atalho de print reconhecido (PrtSc / Win+Shift+S): a Kira mostra o preview do print (Configurações → Geral).
        </p>
      ) : (
        <Toggle
          label="É uma ferramenta de print"
          hint="Marque se este atalho abre uma ferramenta de print (ex.: ShareX, Greenshot): a Kira mostra o preview do print."
          checked={!!action.capture}
          onChange={(v) => onChange({ ...action, capture: v || undefined })}
        />
      )}
    </>
  );
}
