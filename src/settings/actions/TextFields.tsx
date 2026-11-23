import { useRef } from "react";
import { getLang, t, type Key } from "../../shared/i18n";
import { TEXT_MAX_CHARS, type Action } from "../../shared/types";
import { Field, Toggle } from "../controls";

type Props = { action: Extract<Action, { type: "text" }>; onChange: (a: Action) => void };

/** Variáveis que o Rust troca na hora: nome em português e em inglês (os dois valem). */
export const TEXT_VARS = [
  { pt: "data", en: "date" },
  { pt: "datalonga", en: "longdate" },
  { pt: "hora", en: "time" },
  { pt: "datahora", en: "datetime" },
  { pt: "clipboard", en: "clipboard" },
] as const;

/** Texto pronto: o modelo, botões que inserem variáveis no cursor e "devolver a área de transferência". */
export function TextFields({ action, onChange }: Props) {
  const ref = useRef<HTMLTextAreaElement>(null);
  const count = [...action.text].length;

  const insert = (name: string) => {
    const el = ref.current;
    const token = `{${name}}`;
    const start = el?.selectionStart ?? action.text.length;
    const end = el?.selectionEnd ?? start;
    onChange({ ...action, text: action.text.slice(0, start) + token + action.text.slice(end) });
    // Cursor logo depois da variável inserida.
    requestAnimationFrame(() => {
      if (!el) return;
      el.focus();
      el.setSelectionRange(start + token.length, start + token.length);
    });
  };

  return (
    <>
      <Field label={t("text.field")} hint={t("text.hint")}>
        <textarea ref={ref} rows={4} value={action.text} maxLength={TEXT_MAX_CHARS * 2} onChange={(e) => onChange({ ...action, text: e.target.value })} />
      </Field>
      <div className="input-row text-vars">
        {TEXT_VARS.map((v) => {
          const name = v[getLang()];
          return (
            <button key={v.pt} type="button" className="btn" title={t(`text.var.${v.pt}` as Key)} onClick={() => insert(name)}>
              {`{${name}}`}
            </button>
          );
        })}
      </div>
      <p className={count > TEXT_MAX_CHARS ? "field-hint inline-error" : "field-hint"}>{t("text.count", { n: count, max: TEXT_MAX_CHARS })}</p>
      <Toggle
        label={t("text.restore")}
        hint={t("text.restore.hint")}
        checked={action.restoreClipboard !== false}
        onChange={(on) => onChange({ ...action, restoreClipboard: on })}
      />
    </>
  );
}
