import { Copy, Plus, RefreshCw, Trash2, X } from "lucide-react";
import { useEffect, useState } from "react";
import { listMonitors, listProcesses, type MonitorInfo } from "../../shared/ipc";
import { describeWhen } from "../../shared/schedule";
import { WhenEditor } from "./WhenEditor";
import type { Config } from "../../shared/types";
import { Field, Section } from "../controls";

interface Props {
  config: Config;
  selected: number;
  onSelect: (i: number) => void;
  update: (fn: (c: Config) => void) => void;
}

export function ProfilesPage({ config, selected, onSelect, update }: Props) {
  const [procs, setProcs] = useState<string[] | null>(null);
  const [exeInput, setExeInput] = useState("");
  const [monitors, setMonitors] = useState<MonitorInfo[] | null>(null);
  useEffect(() => {
    listMonitors().then(setMonitors, () => setMonitors([]));
  }, []);
  const monitorName = (dev: string) => {
    const m = monitors?.find((x) => x.device.toLowerCase() === dev.toLowerCase());
    return m ? `${m.number}. ${m.name}` : dev;
  };
  const profile = config.profiles[selected];
  const isDefault = selected === 0;

  const addExe = (exe: string) => {
    const name = exe.trim().toLowerCase();
    if (!name) return;
    const full = name.endsWith(".exe") ? name : `${name}.exe`;
    update((c) => {
      const p = c.profiles[selected];
      p.matchExe = Array.from(new Set([...(p.matchExe ?? []), full]));
    });
    setExeInput("");
  };

  const duplicate = () => {
    const base = config.profiles[selected];
    update((c) =>
      c.profiles.push({ ...structuredClone(base), id: `perfil-${Date.now().toString(36)}`, name: `${base.name} (cópia)`, matchExe: [], when: undefined }),
    );
    onSelect(config.profiles.length);
  };

  return (
    <>
      <Section
        title="Perfis"
        description="Cada perfil tem suas próprias fatias. Ao abrir o menu, a Kira escolhe: 1) o perfil do app em primeiro plano; 2) um perfil cujo horário/dias/monitor bate; 3) o Padrão."
      >
        <div className="profile-list">
          {config.profiles.map((p, i) => (
            <button key={p.id} type="button" className={`profile-card${i === selected ? " is-on" : ""}`} onClick={() => onSelect(i)}>
              <strong>{p.name}</strong>
              <span>
                {i === 0
                  ? "Usado quando nenhum outro combina"
                  : [(p.matchExe ?? []).join(", "), describeWhen(p.when, monitorName)].filter(Boolean).join(" · ") || "sem critério"}
              </span>
            </button>
          ))}
          <button type="button" className="profile-card is-add" onClick={duplicate}>
            <Plus size={16} /> Novo perfil (cópia do selecionado)
          </button>
        </div>
      </Section>

      <Section title={`Perfil: ${profile.name}`}>
        <Field label="Nome">
          <input value={profile.name} onChange={(e) => update((c) => void (c.profiles[selected].name = e.target.value))} />
        </Field>

        {!isDefault && (
          <>
            <Field label="Executáveis associados" hint="Nome do processo, ex.: code.exe, chrome.exe, photoshop.exe">
              <div className="chips">
                {(profile.matchExe ?? []).map((exe) => (
                  <span key={exe} className="chip">
                    {exe}
                    <button type="button" aria-label={`Remover ${exe}`} onClick={() => update((c) => {
                      const p = c.profiles[selected];
                      p.matchExe = (p.matchExe ?? []).filter((x) => x !== exe);
                    })}><X size={12} /></button>
                  </span>
                ))}
              </div>
              <div className="input-row">
                <input
                  value={exeInput}
                  placeholder="code.exe"
                  onChange={(e) => setExeInput(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && (e.preventDefault(), addExe(exeInput))}
                />
                <button type="button" className="btn" onClick={() => addExe(exeInput)}>Adicionar</button>
                <button type="button" className="btn btn-ghost" onClick={() => listProcesses().then(setProcs)}>
                  <RefreshCw size={14} /> Apps abertos
                </button>
              </div>
            </Field>
            {procs && (
              <div className="proc-list">
                {procs.map((p) => (
                  <button key={p} type="button" className="chip is-pick" onClick={() => addExe(p)}>+ {p}</button>
                ))}
              </div>
            )}
            <WhenEditor
              when={profile.when}
              monitors={monitors}
              onChange={(w) =>
                update((c) => {
                  const p = c.profiles[selected];
                  if (w) p.when = w;
                  else delete p.when;
                })
              }
            />
          </>
        )}

        <div className="row-actions">
          <button type="button" className="btn btn-ghost" onClick={duplicate}><Copy size={14} /> Duplicar</button>
          {!isDefault && (
            <button
              type="button"
              className="btn btn-danger"
              onClick={() => {
                if (!window.confirm(`Excluir o perfil "${profile.name}"?`)) return;
                update((c) => void c.profiles.splice(selected, 1));
                onSelect(0);
              }}
            >
              <Trash2 size={14} /> Excluir perfil
            </button>
          )}
        </div>
        <p className="muted">As fatias deste perfil são editadas na página “Itens do menu”.</p>
      </Section>
    </>
  );
}
