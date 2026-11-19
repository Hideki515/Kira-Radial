import { Clipboard, FileText, FolderOpen, RefreshCw, Trash2 } from "lucide-react";
import { t } from "../../shared/i18n";
import { useCallback, useEffect, useMemo, useState } from "react";
import { clearLog, describeOpenStats, getDiagnostics, openDataDir, readLog, writeReport, type Diagnostics } from "../../shared/ipc";
import { Section, Toggle } from "../controls";

export type LevelFilter = "all" | "warn" | "error";

/** Nível de uma linha do log ("2026-11-10 15:30:05.123 WARN [settings] …"); linhas antigas = INFO. */
export function levelOf(line: string): "INFO" | "WARN" | "ERROR" {
  const lvl = line.split(/\s+/)[2];
  return lvl === "WARN" || lvl === "ERROR" ? lvl : "INFO";
}

/** Filtra por nível mínimo e texto (sem diferenciar maiúsculas). */
export function filterLines(lines: string[], level: LevelFilter, text: string): string[] {
  const needle = text.trim().toLowerCase();
  return lines.filter((l) => {
    const lv = levelOf(l);
    if (level === "error" && lv !== "ERROR") return false;
    if (level === "warn" && lv === "INFO") return false;
    return !needle || l.toLowerCase().includes(needle);
  });
}

const REFRESH_MS = 2000;

export function DiagnosticsPage() {
  const [diag, setDiag] = useState<Diagnostics | null>(null);
  const [lines, setLines] = useState<string[]>([]);
  const [level, setLevel] = useState<LevelFilter>("all");
  const [text, setText] = useState("");
  const [auto, setAuto] = useState(true);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  const load = useCallback(() => {
    readLog(500).then(setLines, (e) => setMsg({ ok: false, text: String(e) }));
  }, []);

  useEffect(() => {
    load();
    getDiagnostics().then(setDiag, () => setDiag(null));
  }, [load]);

  useEffect(() => {
    if (!auto) return;
    const timer = window.setInterval(load, REFRESH_MS);
    return () => window.clearInterval(timer);
  }, [auto, load]);

  const shown = useMemo(() => filterLines(lines, level, text), [lines, level, text]);

  const act = (fn: () => Promise<unknown>, ok: string) =>
    fn().then(
      (r) => setMsg({ ok: true, text: typeof r === "string" ? `${ok}: ${r}` : ok }),
      (e) => setMsg({ ok: false, text: String(e) }),
    );

  return (
    <>
      <Section title={t("diag.summary")} description={t("diag.summary.desc")}>
        {diag ? (
          <dl className="diag-grid" data-testid="diag-summary">
            <dt>{t("diag.version")}</dt><dd>{diag.version}{diag.qa && t("diag.qa")}</dd>
            <dt>{t("diag.windows")}</dt><dd>{diag.windows || "—"}</dd>
            <dt>WebView2</dt><dd>{diag.webview}</dd>
            <dt>{t("diag.monitors")}</dt><dd>{diag.monitors.join(" · ") || "—"}</dd>
            <dt>{t("diag.launcher")}</dt><dd>{diag.launcherMode}</dd>
            <dt>{t("diag.theme")}</dt><dd>{diag.theme}</dd>
            <dt>{t("diag.hotkey")}</dt>
            <dd>
              {diag.hotkey} — {diag.hotkeyRegistered ? t("diag.registered") : t("diag.notRegistered")}
              {diag.hotkeyError && <span className="inline-error"> ({diag.hotkeyError})</span>}
            </dd>
            <dt>{t("diag.openTime")}</dt>
            <dd data-testid="diag-open-time" title={t("diag.openTime.title")}>
              {describeOpenStats(diag.menuOpen)}
            </dd>
            <dt>{t("diag.memory")}</dt><dd>{diag.memoryMb} MB</dd>
            <dt>{t("diag.errors")}</dt><dd className={diag.recentErrors ? "inline-error" : ""}>{diag.recentErrors}</dd>
            <dt>{t("diag.dataDir")}</dt><dd className="diag-path">{diag.dataDir}</dd>
          </dl>
        ) : (
          <p className="muted">{t("diag.appOnly")}</p>
        )}
        <div className="row-actions">
          <button type="button" className="btn" onClick={() => void act(writeReport, t("diag.reportDone"))}>
            <FileText size={14} /> {t("diag.report")}
          </button>
          <button type="button" className="btn btn-ghost" onClick={() => void act(openDataDir, t("diag.folderOpened"))}>
            <FolderOpen size={14} /> {t("diag.openFolder")}
          </button>
        </div>
        <p className="muted">{t("diag.report.note")}</p>
      </Section>

      <Section title={t("diag.log")}>
        <div className="log-toolbar">
          <select aria-label={t("diag.level")} value={level} onChange={(e) => setLevel(e.target.value as LevelFilter)}>
            <option value="all">{t("diag.level.all")}</option>
            <option value="warn">{t("diag.level.warn")}</option>
            <option value="error">{t("diag.level.error")}</option>
          </select>
          <input aria-label={t("diag.filter")} placeholder={t("diag.filter.ph")} value={text} onChange={(e) => setText(e.target.value)} />
          <Toggle label={t("diag.auto")} checked={auto} onChange={setAuto} />
          <button type="button" className="btn btn-ghost" aria-label={t("diag.refresh")} onClick={load}><RefreshCw size={14} /></button>
          <button type="button" className="btn btn-ghost" onClick={() => void navigator.clipboard.writeText(shown.join("\n")).then(() => setMsg({ ok: true, text: t("diag.copied") }))}>
            <Clipboard size={14} /> {t("diag.copy")}
          </button>
          <button
            type="button"
            className="btn btn-ghost danger"
            onClick={() => window.confirm(t("diag.clearConfirm")) && void clearLog().then(load)}
          >
            <Trash2 size={14} /> {t("diag.clear")}
          </button>
        </div>
        <pre className="log-view" data-testid="log-view">
          {shown.length ? shown.map((l, i) => <div key={i} className={`log-line is-${levelOf(l).toLowerCase()}`}>{l}</div>) : <span className="muted">{t("diag.empty")}</span>}
        </pre>
        <span className="muted">{t("diag.count", { shown: shown.length, total: lines.length })}</span>
        {msg && <span className={msg.ok ? "inline-ok" : "inline-error"} role="status">{msg.text}</span>}
      </Section>
    </>
  );
}
