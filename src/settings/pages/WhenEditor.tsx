import { Monitor, ScanEye } from "lucide-react";
import { identifyMonitors, type MonitorInfo } from "../../shared/ipc";
import { DAY_SHORT, whenErrors } from "../../shared/schedule";
import type { ProfileWhen } from "../../shared/types";
import { Field } from "../controls";

interface Props {
  when: ProfileWhen | undefined;
  monitors: MonitorInfo[] | null;
  onChange: (w: ProfileWhen | undefined) => void;
}

/** Remove campos vazios; nada sobrando = sem "quando usar". */
export function cleanWhen(w: ProfileWhen): ProfileWhen | undefined {
  const out: ProfileWhen = {};
  if (w.days?.length) out.days = [...new Set(w.days)].sort((a, b) => a - b);
  if (w.from) out.from = w.from;
  if (w.to) out.to = w.to;
  if (w.monitors?.length) out.monitors = w.monitors;
  return Object.keys(out).length ? out : undefined;
}

/** "Quando usar" de um perfil: dias, horário e monitores. */
export function WhenEditor({ when, monitors, onChange }: Props) {
  const w = when ?? {};
  const set = (patch: Partial<ProfileWhen>) => onChange(cleanWhen({ ...w, ...patch }));
  const toggleDay = (d: number) => {
    const days = w.days ?? [];
    set({ days: days.includes(d) ? days.filter((x) => x !== d) : [...days, d] });
  };
  const toggleMonitor = (dev: string) => {
    const list = w.monitors ?? [];
    set({ monitors: list.includes(dev) ? list.filter((x) => x !== dev) : [...list, dev] });
  };
  const errors = whenErrors(when);

  return (
    <Field
      label="Quando usar"
      group
      hint="Opcional. Sem app associado, o perfil vale quando os critérios marcados batem (todos juntos). Um app associado tem prioridade."
    >
      <div className="when-row">
        <span className="when-label">Dias</span>
        <div className="day-chips" role="group" aria-label="Dias da semana">
          {DAY_SHORT.map((label, d) => (
            <button
              key={label}
              type="button"
              className={`chip is-pick${w.days?.includes(d) ? " is-on" : ""}`}
              aria-pressed={!!w.days?.includes(d)}
              onClick={() => toggleDay(d)}
            >
              {label}
            </button>
          ))}
          <button type="button" className="btn btn-ghost" onClick={() => set({ days: [1, 2, 3, 4, 5] })}>Dias úteis</button>
          <button type="button" className="btn btn-ghost" onClick={() => set({ days: [] })}>Qualquer dia</button>
        </div>
      </div>
      <div className="when-row">
        <span className="when-label">Horário</span>
        <input type="time" aria-label="Início" value={w.from ?? ""} onChange={(e) => set({ from: e.target.value || undefined })} />
        <span className="muted">até</span>
        <input type="time" aria-label="Fim" value={w.to ?? ""} onChange={(e) => set({ to: e.target.value || undefined })} />
        {(w.from || w.to) && (
          <button type="button" className="btn btn-ghost" onClick={() => set({ from: undefined, to: undefined })}>Qualquer horário</button>
        )}
        {w.from && w.to && w.from > w.to && <span className="muted">(passa da meia-noite)</span>}
      </div>
      <div className="when-row">
        <span className="when-label">Monitores</span>
        <div className="monitor-picks">
          {monitors === null ? (
            <span className="muted">Carregando…</span>
          ) : (
            monitors.map((m) => (
              <label key={m.device} className="monitor-pick">
                <input type="checkbox" checked={!!w.monitors?.includes(m.device)} onChange={() => toggleMonitor(m.device)} />
                <Monitor size={13} /> {m.number}. {m.name} <span className="muted">({m.width}×{m.height}{m.primary ? ", principal" : ""})</span>
              </label>
            ))
          )}
          <button type="button" className="btn btn-ghost" onClick={() => void identifyMonitors()}>
            <ScanEye size={14} /> Identificar
          </button>
        </div>
      </div>
      {errors.map((e) => <span key={e} className="inline-error" role="alert">{e}</span>)}
    </Field>
  );
}
