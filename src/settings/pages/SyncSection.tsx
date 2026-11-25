import { FolderOpen, RefreshCw } from "lucide-react";
import { useEffect, useState } from "react";
import { t } from "../../shared/i18n";
import { onEvent, pickPath, syncConfigure, syncNow, syncStatus, type SyncStatus } from "../../shared/ipc";
import { Section, Toggle } from "../controls";

/** Sincronizar a config entre PCs por uma pasta que o usuário já sincroniza (OneDrive...). */
export function SyncSection() {
  const [st, setSt] = useState<SyncStatus | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    const load = () => void syncStatus().then(setSt, () => setSt(null));
    load();
    const off = onEvent("sync:pulled", load);
    return () => void off.then((f) => f());
  }, []);

  const run = async (p: Promise<SyncStatus>) => {
    setBusy(true);
    setErr(null);
    try {
      setSt(await p);
    } catch (e) {
      setErr(String(e));
    } finally {
      setBusy(false);
    }
  };
  const choose = async () => {
    const folder = await pickPath(true);
    if (folder) await run(syncConfigure(true, folder));
  };

  if (!st) return null;
  const when = st.lastSync ? new Date(st.lastSync).toLocaleString() : null;
  return (
    <Section title={t("sync.title")} description={t("sync.desc")}>
      <Toggle
        label={t("sync.enable")}
        checked={st.enabled}
        onChange={(on) => (on ? (st.folder ? void run(syncConfigure(true, st.folder)) : void choose()) : void run(syncConfigure(false, st.folder)))}
      />
      {st.enabled && (
        <>
          <p className="field-hint" data-testid="sync-folder">{t("sync.folder", { folder: st.folder })}</p>
          <div className="row-actions">
            <button type="button" className="btn" disabled={busy} onClick={() => void choose()}>
              <FolderOpen size={14} /> {t("sync.change")}
            </button>
            <button type="button" className="btn" disabled={busy} onClick={() => void run(syncNow())}>
              <RefreshCw size={14} /> {t("sync.now")}
            </button>
          </div>
          {when && <p className="muted" data-testid="sync-last">{t("sync.last", { when, machine: st.lastMachine })}</p>}
        </>
      )}
      {(err ?? st.error) && <p className="inline-error" data-testid="sync-error">{err ?? st.error}</p>}
    </Section>
  );
}
