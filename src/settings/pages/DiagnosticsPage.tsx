import { Clipboard, FileText, FolderOpen, RefreshCw, Trash2 } from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { clearLog, getDiagnostics, openDataDir, readLog, writeReport, type Diagnostics } from "../../shared/ipc";
import { Section, Toggle } from "../controls";

export type LevelFilter = "all" | "warn" | "error";

/** Nível de uma linha do log ("2026-11-10 15:30:05.123 WARN [settings] …"); linhas antigas = INFO. */
export function levelOf(line: string): "INFO" | "WARN" | "ERROR" {
  const lvl = line.split(/\s+/)[2];
  return lvl === "WARN" || lvl === "ERROR" ? lvl : "INFO";
}

/** Filtra por nível mínimo e texto (sem diferenciar maiúsculas). */
export function filterLines(lines: string[], level: LevelFilter, text: string): string[] {
  const t = text.trim().toLowerCase();
  return lines.filter((l) => {
    const lv = levelOf(l);
    if (level === "error" && lv !== "ERROR") return false;
    if (level === "warn" && lv === "INFO") return false;
    return !t || l.toLowerCase().includes(t);
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
    const t = window.setInterval(load, REFRESH_MS);
    return () => window.clearInterval(t);
  }, [auto, load]);

  const shown = useMemo(() => filterLines(lines, level, text), [lines, level, text]);

  const act = (fn: () => Promise<unknown>, ok: string) =>
    fn().then(
      (r) => setMsg({ ok: true, text: typeof r === "string" ? `${ok}: ${r}` : ok }),
      (e) => setMsg({ ok: false, text: String(e) }),
    );

  return (
    <>
      <Section title="Resumo" description="Informações para entender problemas. Nada aqui sai do PC.">
        {diag ? (
          <dl className="diag-grid" data-testid="diag-summary">
            <dt>Versão</dt><dd>{diag.version}{diag.qa && " (Kira de teste)"}</dd>
            <dt>Windows</dt><dd>{diag.windows || "—"}</dd>
            <dt>WebView2</dt><dd>{diag.webview}</dd>
            <dt>Monitores</dt><dd>{diag.monitors.join(" · ") || "—"}</dd>
            <dt>Abrir por</dt><dd>{diag.launcherMode}</dd>
            <dt>Tema</dt><dd>{diag.theme}</dd>
            <dt>Atalho</dt>
            <dd>
              {diag.hotkey} — {diag.hotkeyRegistered ? "registrado" : "não registrado"}
              {diag.hotkeyError && <span className="inline-error"> ({diag.hotkeyError})</span>}
            </dd>
            <dt>Memória</dt><dd>{diag.memoryMb} MB</dd>
            <dt>Erros recentes</dt><dd className={diag.recentErrors ? "inline-error" : ""}>{diag.recentErrors}</dd>
            <dt>Pasta de dados</dt><dd className="diag-path">{diag.dataDir}</dd>
          </dl>
        ) : (
          <p className="muted">Resumo disponível só no app.</p>
        )}
        <div className="row-actions">
          <button type="button" className="btn" onClick={() => void act(writeReport, "Relatório criado")}>
            <FileText size={14} /> Gerar relatório
          </button>
          <button type="button" className="btn btn-ghost" onClick={() => void act(openDataDir, "Pasta aberta")}>
            <FolderOpen size={14} /> Abrir pasta
          </button>
        </div>
        <p className="muted">O relatório não leva sua configuração, o histórico da área de transferência nem arquivos recentes, e oculta o nome do seu usuário do Windows.</p>
      </Section>

      <Section title="Log">
        <div className="log-toolbar">
          <select aria-label="Nível" value={level} onChange={(e) => setLevel(e.target.value as LevelFilter)}>
            <option value="all">Tudo</option>
            <option value="warn">Avisos e erros</option>
            <option value="error">Só erros</option>
          </select>
          <input aria-label="Filtrar log" placeholder="Filtrar…" value={text} onChange={(e) => setText(e.target.value)} />
          <Toggle label="Atualizar sozinho" checked={auto} onChange={setAuto} />
          <button type="button" className="btn btn-ghost" aria-label="Atualizar" onClick={load}><RefreshCw size={14} /></button>
          <button type="button" className="btn btn-ghost" onClick={() => void navigator.clipboard.writeText(shown.join("\n")).then(() => setMsg({ ok: true, text: "Copiado." }))}>
            <Clipboard size={14} /> Copiar
          </button>
          <button
            type="button"
            className="btn btn-ghost danger"
            onClick={() => window.confirm("Apagar o log?") && void clearLog().then(load)}
          >
            <Trash2 size={14} /> Limpar
          </button>
        </div>
        <pre className="log-view" data-testid="log-view">
          {shown.length ? shown.map((l, i) => <div key={i} className={`log-line is-${levelOf(l).toLowerCase()}`}>{l}</div>) : <span className="muted">Nada para mostrar.</span>}
        </pre>
        <span className="muted">{shown.length} de {lines.length} linhas</span>
        {msg && <span className={msg.ok ? "inline-ok" : "inline-error"} role="status">{msg.text}</span>}
      </Section>
    </>
  );
}
