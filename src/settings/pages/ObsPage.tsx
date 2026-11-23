import { Link2, Save, Trash2 } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { t } from "../../shared/i18n";
import { Rich } from "../../shared/i18n/Rich";
import { obsSaveSettings, obsSettings, obsState, type ObsSettings, type ObsState } from "../../shared/ipc";
import { Field, Section } from "../controls";

/** Texto do estado (linha de status e resultado de "Testar"). */
export function describeObs(s: ObsState): { ok: boolean; text: string } {
  if (s.status !== "ok") return { ok: false, text: s.message || t("dyn.obs.error") };
  const vars = { version: s.version ?? "?", scene: s.current ?? "—" };
  return { ok: true, text: t(s.recording ? "obsp.status.okRec" : "obsp.status.ok", vars) };
}

export function ObsPage() {
  const [settings, setSettings] = useState<ObsSettings | null>(null);
  const [port, setPort] = useState("");
  const [password, setPassword] = useState("");
  const [state, setState] = useState<ObsState | null>(null);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  const check = useCallback(() => {
    setState(null);
    return obsState().then(
      (s) => (setState(s), s),
      (e) => {
        const s: ObsState = { status: "error", message: String(e), scenes: [], inputs: [], recording: false, streaming: false };
        setState(s);
        return s;
      },
    );
  }, []);

  useEffect(() => {
    obsSettings().then(
      (s) => {
        setSettings(s);
        setPort(String(s.port));
      },
      (e) => setMsg({ ok: false, text: String(e) }),
    );
    void check();
  }, [check]);

  const portNum = Number(port);
  const portOk = Number.isInteger(portNum) && portNum >= 1 && portNum <= 65535;

  const run = async (fn: () => Promise<{ ok: boolean; text: string }>) => {
    setBusy(true);
    setMsg(null);
    try {
      setMsg(await fn());
    } catch (e) {
      setMsg({ ok: false, text: String(e) });
    } finally {
      setBusy(false);
    }
  };

  const save = () =>
    run(async () => {
      const s = await obsSaveSettings(portNum, password ? password : undefined);
      setSettings(s);
      setPassword("");
      return describeObs(await check());
    });

  const clear = () =>
    run(async () => {
      setSettings(await obsSaveSettings(settings?.port ?? portNum, ""));
      setPassword("");
      void check();
      return { ok: true, text: t("obsp.cleared") };
    });

  return (
    <>
      <Section title="OBS Studio" description={t("obsp.desc")}>
        <p className={state && state.status !== "ok" ? "field-hint inline-error" : "field-hint"} data-testid="obs-status">
          {state === null ? t("obsp.checking") : describeObs(state).text}
        </p>
      </Section>

      <Section title={t("obsp.setup.title")} description={t("obsp.setup.desc")}>
        <ol className="steps">
          <li><Rich text={t("obsp.step1")} /></li>
          <li><Rich text={t("obsp.step2")} /></li>
        </ol>
        <Field label={t("obsp.port")} hint={portOk ? undefined : t("obsp.portInvalid")}>
          <input inputMode="numeric" value={port} onChange={(e) => setPort(e.target.value.replace(/\D/g, "").slice(0, 5))} placeholder="4455" />
        </Field>
        <Field label={t("obsp.password")} hint={settings?.hasPassword ? t("obsp.password.saved") : t("obsp.password.hint")}>
          <input type="password" value={password} autoComplete="off" onChange={(e) => setPassword(e.target.value)} />
        </Field>
        <div className="input-row">
          <button type="button" className="btn btn-primary" disabled={busy || !portOk} onClick={save}>
            <Save size={14} /> {t("obsp.save")}
          </button>
          <button type="button" className="btn" disabled={busy} onClick={() => run(async () => describeObs(await check()))}>
            <Link2 size={14} /> {t("obsp.test")}
          </button>
          <button type="button" className="btn" disabled={busy || !settings?.hasPassword} onClick={clear}>
            <Trash2 size={14} /> {t("obsp.clear")}
          </button>
        </div>
        {msg && <p className={msg.ok ? "inline-ok" : "inline-error"} role="status">{msg.text}</p>}
      </Section>

      <Section title={t("obsp.howto")} description={t("obsp.howto.desc")}>
        <ul className="steps">
          <li><Rich text={t("obsp.howto.auto")} /></li>
          <li><Rich text={t("obsp.howto.action")} /></li>
        </ul>
      </Section>
    </>
  );
}
