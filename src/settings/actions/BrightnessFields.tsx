import type { Action } from "../../shared/types";
import { BrightnessTargetField } from "../BrightnessTarget";
import { Field, Segmented } from "../controls";

export function BrightnessFields({ action, onChange }: { action: Extract<Action, { type: "brightness" }>; onChange: (a: Action) => void }) {
  return (
    <>
      <Field label="Ajuste" group hint="Vale para a tela do notebook e monitores externos com DDC/CI.">
        <Segmented
          value={action.mode}
          options={[{ value: "up", label: "Aumentar 10%" }, { value: "down", label: "Diminuir 10%" }, { value: "set", label: "Definir valor" }]}
          onChange={(m) => {
            // A tela escolhida continua ao trocar o tipo de ajuste.
            const where = action.target && action.target !== "all" ? { target: action.target, ...(action.targetName ? { targetName: action.targetName } : {}) } : {};
            onChange(m === "set" ? { type: "brightness", mode: m, value: action.value ?? 50, target: "all", ...where } : { type: "brightness", mode: m, ...where });
          }}
        />
      </Field>
      <BrightnessTargetField
        target={action.target}
        targetName={action.targetName}
        defaultTarget="all"
        onChange={(target, targetName) => {
          const next: Action = { ...action, target };
          if (targetName && target !== "all" && target !== "cursor") next.targetName = targetName;
          else delete next.targetName;
          onChange(next);
        }}
      />
      {action.mode === "set" && (
        <Field label={`Brilho: ${action.value ?? 50}%`}>
          <input type="range" min={0} max={100} step={5} value={action.value ?? 50} onChange={(e) => onChange({ ...action, value: Number(e.target.value) })} />
        </Field>
      )}
    </>
  );
}
