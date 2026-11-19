import { ChevronDown, ChevronUp, Plus, Trash2 } from "lucide-react";
import { t } from "../../shared/i18n";
import { SEQUENCE_LIMITS, type Action } from "../../shared/types";
import { ActionEditor } from "../ActionEditor";
import { Field } from "../controls";

type SequenceAction = Extract<Action, { type: "sequence" }>;

/** Lista de passos: cada um com o próprio tipo e campos; subir, descer, remover e adicionar. */
export function SequenceFields({ action, onChange }: { action: SequenceAction; onChange: (a: Action) => void }) {
  const steps = action.steps;
  const setSteps = (next: Action[]) => onChange({ ...action, steps: next });
  const move = (i: number, d: number) => {
    const j = i + d;
    if (j < 0 || j >= steps.length) return;
    const next = [...steps];
    [next[i], next[j]] = [next[j], next[i]];
    setSteps(next);
  };
  const delay = action.delayMs ?? SEQUENCE_LIMITS.defaultDelayMs;

  return (
    <>
      <p className="field-hint">
        {t("seq.hint")}
      </p>
      <ol className="sequence-steps" aria-label={t("seq.steps")}>
        {steps.map((step, i) => (
          <li key={i} className="sequence-step" data-testid={`step-${i}`}>
            <div className="sequence-step-head">
              <span className="sequence-step-num">{t("seq.step", { n: i + 1 })}</span>
              <span className="row-tools">
                <button type="button" title={t("items.up")} aria-label={t("seq.up", { n: i + 1 })} disabled={i === 0} onClick={() => move(i, -1)}>
                  <ChevronUp size={14} />
                </button>
                <button type="button" title={t("items.down")} aria-label={t("seq.down", { n: i + 1 })} disabled={i === steps.length - 1} onClick={() => move(i, 1)}>
                  <ChevronDown size={14} />
                </button>
                <button
                  type="button"
                  title={t("items.remove")}
                  aria-label={t("seq.remove", { n: i + 1 })}
                  className="danger"
                  disabled={steps.length <= SEQUENCE_LIMITS.min}
                  onClick={() => setSteps(steps.filter((_, k) => k !== i))}
                >
                  <Trash2 size={14} />
                </button>
              </span>
            </div>
            <ActionEditor asStep action={step} onChange={(a) => setSteps(steps.map((s, k) => (k === i ? a : s)))} />
          </li>
        ))}
      </ol>
      <button
        type="button"
        className="btn"
        disabled={steps.length >= SEQUENCE_LIMITS.max}
        onClick={() => setSteps([...steps, { type: "launch", path: "" }])}
      >
        <Plus size={14} /> {t("seq.add")}
      </button>
      <Field label={t("seq.delay", { ms: delay })} hint={t("seq.delay.hint")}>
        <input
          type="range"
          min={0}
          max={SEQUENCE_LIMITS.maxDelayMs}
          step={100}
          value={delay}
          onChange={(e) => {
            const v = Number(e.target.value);
            onChange({ ...action, delayMs: v === SEQUENCE_LIMITS.defaultDelayMs ? undefined : v });
          }}
        />
      </Field>
    </>
  );
}
