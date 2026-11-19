import { Download, RefreshCw } from "lucide-react";
import { t } from "../../shared/i18n";
import { Rich } from "../../shared/i18n/Rich";
import { useEffect, useState } from "react";
import { onEvent, updateCheck, updateInstall, updateStatus, type UpdateInfo } from "../../shared/ipc";
import type { Config } from "../../shared/types";
import { Section, Toggle } from "../controls";

interface Props {
  config: Config;
  update: (fn: (c: Config) => void) => void;
}

/** "há 5 min", "há 3 h", "ontem"... a partir de segundos desde 1970. */
export function ago(sec: number, now = Date.now() / 1000): string {
  const d = Math.max(0, now - sec);
  if (d < 60) return t("time.justNow");
  if (d < 3600) return t("time.minAgo", { n: Math.floor(d / 60) });
  if (d < 86400) return t("time.hAgo", { n: Math.floor(d / 3600) });
  const days = Math.floor(d / 86400);
  return days === 1 ? t("time.yesterday") : t("time.daysAgo", { n: days });
}

/** Hook do estado de atualização (também usado pelo aviso no topo das Configurações). */
export function useUpdateInfo(): [UpdateInfo | null, (u: UpdateInfo) => void] {
  const [info, setInfo] = useState<UpdateInfo | null>(null);
  useEffect(() => {
    void updateStatus().then(setInfo, () => setInfo(null));
    const off = onEvent<UpdateInfo>("update:status", setInfo);
    return () => void off.then((f) => f());
  }, []);
  return [info, setInfo];
}

/** Configurações → Geral → Atualizações. */
export function UpdatesSection({ config, update }: Props) {
  const [info, setInfo] = useUpdateInfo();
  const [busy, setBusy] = useState<"check" | "install" | null>(null);
  const [error, setError] = useState<string | null>(null);
  const enabled = config.behavior.checkUpdates !== false;

  const check = () => {
    setBusy("check");
    setError(null);
    updateCheck().then(setInfo, (e) => setError(String(e))).finally(() => setBusy(null));
  };
  const install = () => {
    setBusy("install");
    setError(null);
    // Se der certo a Kira fecha e reabre já atualizada; só volta aqui se falhar.
    updateInstall().catch((e) => setError(String(e))).finally(() => setBusy(null));
  };

  return (
    <Section
      title={t("up.title")}
      description={t("up.desc")}
    >
      <Toggle
        label={t("up.auto")}
        hint={t("up.auto.hint")}
        checked={enabled}
        onChange={(v) => update((c) => void (v ? delete c.behavior.checkUpdates : (c.behavior.checkUpdates = false)))}
      />
      <div className="update-box" data-testid="update-box">
        {info?.available ? (
          <>
            <p className="update-title">
              <Rich text={t("up.available", { version: info.version ?? "", current: info.current })} />
            </p>
            {info.notes && (
              <details className="update-notes">
                <summary>{t("up.notes")}</summary>
                <pre>{info.notes}</pre>
              </details>
            )}
            <button type="button" className="btn btn-primary" disabled={!!busy} onClick={install}>
              <Download size={14} /> {busy === "install" ? t("up.installing") : t("up.install")}
            </button>
          </>
        ) : (
          <p className="muted">
            {info ? t("up.youHave", { version: info.current }) : t("up.current")}
            {info?.checkedAt ? t("up.lastCheck", { ago: ago(info.checkedAt) }) : ""}
            {info?.checkedAt && !info.available && !info.error ? t("up.upToDate") : "."}
          </p>
        )}
        <button type="button" className="btn" disabled={!!busy} onClick={check}>
          <RefreshCw size={14} /> {busy === "check" ? t("up.checking") : t("up.check")}
        </button>
        {(error || info?.error) && <p className="inline-error">{error ?? info?.error}</p>}
      </div>
    </Section>
  );
}
