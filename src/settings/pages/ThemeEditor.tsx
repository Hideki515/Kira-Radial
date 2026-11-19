import { Copy, Download, Trash2, Upload } from "lucide-react";
import { t } from "../../shared/i18n";
import { useState } from "react";
import {
  COLOR_KEYS,
  COLOR_LABEL,
  MAX_CUSTOM_THEMES,
  createTheme,
  customRef,
  customThemeErrors,
  exportTheme,
  findCustom,
  importTheme,
  type CustomTheme,
} from "../../shared/customTheme";
import { THEMES, type Config, type Theme } from "../../shared/types";
import { Field, Section } from "../controls";

interface Props {
  config: Config;
  update: (fn: (c: Config) => void) => void;
  /** Nome legível de cada tema embutido (para o seletor de base). */
  themeLabel: (theme: Theme) => string;
}

/** Cria um tema a partir do tema atual (ou do Vidro) e já o seleciona. */
export function addCustomTheme(c: Config, theme?: CustomTheme) {
  const list = (c.appearance.customThemes ??= []);
  if (list.length >= MAX_CUSTOM_THEMES) return;
  const current = c.appearance.theme ?? "glass";
  const base = (THEMES.includes(current as Theme) ? current : findCustom(current, list)?.base ?? "glass") as Theme;
  const th = theme ?? createTheme(base, t("te.defaultName", { n: list.length + 1 }));
  list.push(th);
  c.appearance.theme = customRef(th.id);
}

/** Editor do tema personalizado selecionado: base, 10 cores, duplicar, excluir, exportar/importar. */
export function ThemeEditor({ config, update, themeLabel }: Props) {
  const th = findCustom(config.appearance.theme, config.appearance.customThemes);
  const [importText, setImportText] = useState("");
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  const edit = (fn: (x: CustomTheme) => void) =>
    update((c) => {
      const x = findCustom(c.appearance.theme, c.appearance.customThemes);
      if (x) fn(x);
    });

  const doImport = () => {
    try {
      const imported = importTheme(importText);
      update((c) => addCustomTheme(c, imported));
      setImportText("");
      setMsg({ ok: true, text: t("te.imported", { name: imported.name }) });
    } catch (e) {
      setMsg({ ok: false, text: t("te.importFailed", { error: (e as Error).message }) });
    }
  };

  return (
    <Section title={t("te.title")} description={t("te.desc")}>
      {th ? (
        <div data-testid="theme-editor">
          <Field label={t("te.name")}>
            <input value={th.name} maxLength={40} onChange={(e) => edit((x) => void (x.name = e.target.value))} />
          </Field>
          <Field label={t("te.base")}>
            <select value={th.base} onChange={(e) => edit((x) => void (x.base = e.target.value as Theme))}>
              {THEMES.map((b) => <option key={b} value={b}>{themeLabel(b)}</option>)}
            </select>
          </Field>
          <div className="color-grid">
            {COLOR_KEYS.map((k) => (
              <label key={k} className="color-cell">
                <input type="color" aria-label={COLOR_LABEL[k]} value={th.colors[k]} onChange={(e) => edit((x) => void (x.colors[k] = e.target.value))} />
                <span>{COLOR_LABEL[k]}</span>
              </label>
            ))}
          </div>
          {customThemeErrors(th).map((e) => <span key={e} className="inline-error" role="alert">{e}</span>)}
          <div className="row-actions">
            <button
              type="button"
              className="btn"
              disabled={(config.appearance.customThemes?.length ?? 0) >= MAX_CUSTOM_THEMES}
              onClick={() => update((c) => addCustomTheme(c, { ...structuredClone(th), id: createTheme(th.base).id, name: t("te.copySuffix", { name: th.name }) }))}
            >
              <Copy size={14} /> {t("te.duplicate")}
            </button>
            <button
              type="button"
              className="btn btn-ghost"
              onClick={() =>
                void navigator.clipboard.writeText(exportTheme(th)).then(
                  () => setMsg({ ok: true, text: t("te.copied") }),
                  () => setMsg({ ok: false, text: t("te.copyFailed") }),
                )
              }
            >
              <Download size={14} /> {t("te.export")}
            </button>
            <button
              type="button"
              className="btn btn-danger"
              onClick={() => {
                if (!window.confirm(t("te.deleteConfirm", { name: th.name }))) return;
                update((c) => {
                  c.appearance.customThemes = (c.appearance.customThemes ?? []).filter((x) => x.id !== th.id);
                  c.appearance.theme = th.base;
                });
              }}
            >
              <Trash2 size={14} /> {t("te.delete")}
            </button>
          </div>
        </div>
      ) : (
        <p className="muted">{t("te.empty")}</p>
      )}
      <Field label={t("te.import")} hint={t("te.import.hint")}>
        <textarea className="code" rows={4} value={importText} onChange={(e) => setImportText(e.target.value)} placeholder='{ "kiraTheme": 1, ... }' spellCheck={false} />
      </Field>
      <div className="row-actions">
        <button type="button" className="btn" disabled={!importText.trim()} onClick={doImport}>
          <Upload size={14} /> {t("te.importBtn")}
        </button>
      </div>
      {msg && <span className={msg.ok ? "inline-ok" : "inline-error"} role="status">{msg.text}</span>}
    </Section>
  );
}
