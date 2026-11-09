// Controles básicos da tela de configuração.
import type { ReactNode } from "react";

/**
 * Campo com rótulo. Por padrão é um <label> (clicar no texto foca o input).
 * Use `group` quando houver mais de um controle dentro (ex.: input + gravador de atalho):
 * um <label> repassaria cliques ao primeiro input, roubando o foco dos outros controles.
 */
export function Field({ label, hint, group, children }: {
  label: string; hint?: ReactNode; group?: boolean; children: ReactNode;
}) {
  const Tag = group ? "div" : "label";
  return (
    <Tag className="field" role={group ? "group" : undefined} aria-label={group ? label : undefined}>
      <span className="field-label">{label}</span>
      {children}
      {hint && <span className="field-hint">{hint}</span>}
    </Tag>
  );
}

export function Toggle({ label, hint, checked, onChange }: {
  label: string; hint?: string; checked: boolean; onChange: (v: boolean) => void;
}) {
  return (
    <label className="toggle-row">
      <span>
        <span className="toggle-label">{label}</span>
        {hint && <span className="field-hint">{hint}</span>}
      </span>
      <input type="checkbox" className="toggle" checked={checked} onChange={(e) => onChange(e.target.checked)} />
    </label>
  );
}

export function Segmented<T extends string>({ value, options, onChange }: {
  value: T; options: { value: T; label: string }[]; onChange: (v: T) => void;
}) {
  return (
    <div className="segmented" role="radiogroup">
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          role="radio"
          aria-checked={value === o.value}
          className={value === o.value ? "is-on" : ""}
          onClick={() => onChange(o.value)}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

export function Section({ title, description, children }: { title: string; description?: string; children: ReactNode }) {
  return (
    <section className="section">
      <h2>{title}</h2>
      {description && <p className="section-desc">{description}</p>}
      <div className="section-body">{children}</div>
    </section>
  );
}
