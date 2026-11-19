import type { Action } from "../../shared/types";
import { t } from "../../shared/i18n";
import { BrightnessTargetField } from "../BrightnessTarget";
import { Field, Segmented } from "../controls";

export function BrightnessFields({ action, onChange }: { action: Extract<Action, { type: "brightness" }>; onChange: (a: Action) => void }) {
  return (
    <>
      <Field label={t("bright.adjust")} group hint={t("bright.adjust.hint")}>
        <Segmented
          value={action.mode}
          options={[{ value: "up", label: t("bright.up") }, { value: "down", label: t("bright.down") }, { value: "set", label: t("bright.set") }]}
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
        <Field label={t("bright.value", { pct: action.value ?? 50 })}>
          <input type="range" min={0} max={100} step={5} value={action.value ?? 50} onChange={(e) => onChange({ ...action, value: Number(e.target.value) })} />
        </Field>
      )}
    </>
  );
}
