import { GitCompare, History, RefreshCw, RotateCcw } from "lucide-react";
import { t } from "../../shared/i18n";
import { useCallback, useEffect, useState } from "react";
import { diffConfigs } from "../../shared/configDiff";
import { withDefaults } from "../../shared/defaults";
import { listBackups, readBackup, type BackupInfo } from "../../shared/ipc";
import type { Config } from "../../shared/types";
import { Section } from "../controls";

/** "há 5 min", "há 2 h", "ontem 14:30", "03/11 09:12". */
export function relativeTime(ms: number, now = Date.now()): string {
  const s = Math.max(0, (now - ms) / 1000);
  if (s < 60) return t("time.justNow");
  if (s < 3600) return t("time.minAgo", { n: Math.floor(s / 60) });
  if (s < 6 * 3600) return t("time.hAgo", { n: Math.floor(s / 3600) });
  const d = new Date(ms);
  const hm = `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
  const today = new Date(now);
  const yesterday = new Date(now - 86_400_000);
  if (d.toDateString() === today.toDateString()) return t("time.today", { hm });
  if (d.toDateString() === yesterday.toDateString()) return t("time.yesterdayAt", { hm });
  return `${String(d.getDate()).padStart(2, "0")}/${String(d.getMonth() + 1).padStart(2, "0")} ${hm}`;
}

interface Props {
  config: Config;
  /** Carrega uma configuração no rascunho (só vale depois de "Salvar"). */
  replace: (c: Config) => void;
}

/** Versões anteriores da configuração (backups automáticos): ver diferenças e restaurar no rascunho. */
export function BackupHistory({ config, replace }: Props) {
  const [list, setList] = useState<BackupInfo[] | null>(null);
  const [open, setOpen] = useState<{ name: string; diff: string[] } | null>(null);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  const load = useCallback(() => {
    listBackups().then(setList, (e) => {
      setList([]);
      setMsg({ ok: false, text: String(e) });
    });
  }, []);
  useEffect(load, [load]);

  const parse = async (name: string): Promise<Config> => withDefaults(JSON.parse(await readBackup(name)) as Config);

  const showDiff = async (name: string) => {
    if (open?.name === name) return setOpen(null);
    try {
      setOpen({ name, diff: diffConfigs(config, await parse(name)) });
    } catch (e) {
      setMsg({ ok: false, text: t("bh.openFailed", { error: String(e) }) });
    }
  };

  const restore = async (name: string) => {
    try {
      replace(await parse(name));
      setMsg({ ok: true, text: t("bh.loaded") });
    } catch (e) {
      setMsg({ ok: false, text: t("bh.restoreFailed", { error: String(e) }) });
    }
  };

  return (
    <Section
      title={t("bh.title")}
      description={t("bh.desc")}
    >
      <div className="row-actions">
        <button type="button" className="btn btn-ghost" onClick={load}><RefreshCw size={14} /> {t("bh.refresh")}</button>
      </div>
      {list === null ? (
        <p className="muted">{t("bh.loading")}</p>
      ) : !list.length ? (
        <p className="muted" data-testid="backups-empty">{t("bh.empty")}</p>
      ) : (
        <ul className="backup-list">
          {list.map((b) => (
            <li key={b.name} className="backup-row" data-testid={`backup-${b.name}`}>
              <History size={14} />
              <span className="backup-when">{b.name === "config.invalid.json" ? t("bh.invalidConfig") : relativeTime(b.modified)}</span>
              <span className="backup-sum muted">
                {b.valid ? b.profiles.map((p) => `${p.name} (${p.items})`).join(" · ") : t("bh.corrupt")}
              </span>
              {b.valid && (
                <>
                  <button type="button" className="btn btn-ghost" onClick={() => void showDiff(b.name)}><GitCompare size={13} /> {t("bh.diff")}</button>
                  <button type="button" className="btn" onClick={() => void restore(b.name)}><RotateCcw size={13} /> {t("bh.restore")}</button>
                </>
              )}
              {open?.name === b.name && (
                <div className="backup-diff" data-testid="backup-diff">
                  {open.diff.length ? (
                    <ul>{open.diff.map((d) => <li key={d}>{d}</li>)}</ul>
                  ) : (
                    <span className="muted">{t("bh.same")}</span>
                  )}
                </div>
              )}
            </li>
          ))}
        </ul>
      )}
      {msg && <span className={msg.ok ? "inline-ok" : "inline-error"} role="status">{msg.text}</span>}
    </Section>
  );
}
