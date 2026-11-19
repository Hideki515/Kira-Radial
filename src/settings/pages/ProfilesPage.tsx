import { Copy, Plus, RefreshCw, Trash2, X } from "lucide-react";
import { t } from "../../shared/i18n";
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
      c.profiles.push({ ...structuredClone(base), id: `perfil-${Date.now().toString(36)}`, name: t("prof.copySuffix", { name: base.name }), matchExe: [], when: undefined }),
    );
    onSelect(config.profiles.length);
  };

  return (
    <>
      <Section
        title={t("prof.title")}
        description={t("prof.desc")}
      >
        <div className="profile-list">
          {config.profiles.map((p, i) => (
            <button key={p.id} type="button" className={`profile-card${i === selected ? " is-on" : ""}`} onClick={() => onSelect(i)}>
              <strong>{p.name}</strong>
              <span>
                {i === 0
                  ? t("prof.default")
                  : [(p.matchExe ?? []).join(", "), describeWhen(p.when, monitorName)].filter(Boolean).join(" · ") || t("prof.noRule")}
              </span>
            </button>
          ))}
          <button type="button" className="profile-card is-add" onClick={duplicate}>
            <Plus size={16} /> {t("prof.new")}
          </button>
        </div>
      </Section>

      <Section title={t("prof.heading", { name: profile.name })}>
        <Field label={t("prof.name")}>
          <input value={profile.name} onChange={(e) => update((c) => void (c.profiles[selected].name = e.target.value))} />
        </Field>

        {!isDefault && (
          <>
            <Field label={t("prof.exes")} hint={t("prof.exes.hint")}>
              <div className="chips">
                {(profile.matchExe ?? []).map((exe) => (
                  <span key={exe} className="chip">
                    {exe}
                    <button type="button" aria-label={t("prof.removeExe", { exe })} onClick={() => update((c) => {
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
                <button type="button" className="btn" onClick={() => addExe(exeInput)}>{t("prof.add")}</button>
                <button type="button" className="btn btn-ghost" onClick={() => listProcesses().then(setProcs)}>
                  <RefreshCw size={14} /> {t("prof.openApps")}
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
          <button type="button" className="btn btn-ghost" onClick={duplicate}><Copy size={14} /> {t("prof.duplicate")}</button>
          {!isDefault && (
            <button
              type="button"
              className="btn btn-danger"
              onClick={() => {
                if (!window.confirm(t("prof.deleteConfirm", { name: profile.name }))) return;
                update((c) => void c.profiles.splice(selected, 1));
                onSelect(0);
              }}
            >
              <Trash2 size={14} /> {t("prof.delete")}
            </button>
          )}
        </div>
        <p className="muted">{t("prof.itemsNote")}</p>
      </Section>
    </>
  );
}
