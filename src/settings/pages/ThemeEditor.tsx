import { Copy, Download, Trash2, Upload } from "lucide-react";
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
  themeLabel: (t: Theme) => string;
}

/** Cria um tema a partir do tema atual (ou do Vidro) e já o seleciona. */
export function addCustomTheme(c: Config, theme?: CustomTheme) {
  const list = (c.appearance.customThemes ??= []);
  if (list.length >= MAX_CUSTOM_THEMES) return;
  const current = c.appearance.theme ?? "glass";
  const base = (THEMES.includes(current as Theme) ? current : findCustom(current, list)?.base ?? "glass") as Theme;
  const t = theme ?? createTheme(base, `Meu tema ${list.length + 1}`);
  list.push(t);
  c.appearance.theme = customRef(t.id);
}

/** Editor do tema personalizado selecionado: base, 10 cores, duplicar, excluir, exportar/importar. */
export function ThemeEditor({ config, update, themeLabel }: Props) {
  const t = findCustom(config.appearance.theme, config.appearance.customThemes);
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
      setMsg({ ok: true, text: `Tema "${imported.name}" importado. Revise e clique em Salvar.` });
    } catch (e) {
      setMsg({ ok: false, text: `Não foi possível importar: ${(e as Error).message}` });
    }
  };

  return (
    <Section title="Tema personalizado" description="Escolha as cores por cima das decorações de um tema embutido. A pré-visualização ao lado mostra o resultado na hora.">
      {t ? (
        <div data-testid="theme-editor">
          <Field label="Nome">
            <input value={t.name} maxLength={40} onChange={(e) => edit((x) => void (x.name = e.target.value))} />
          </Field>
          <Field label="Decorações de">
            <select value={t.base} onChange={(e) => edit((x) => void (x.base = e.target.value as Theme))}>
              {THEMES.map((b) => <option key={b} value={b}>{themeLabel(b)}</option>)}
            </select>
          </Field>
          <div className="color-grid">
            {COLOR_KEYS.map((k) => (
              <label key={k} className="color-cell">
                <input type="color" aria-label={COLOR_LABEL[k]} value={t.colors[k]} onChange={(e) => edit((x) => void (x.colors[k] = e.target.value))} />
                <span>{COLOR_LABEL[k]}</span>
              </label>
            ))}
          </div>
          {customThemeErrors(t).map((e) => <span key={e} className="inline-error" role="alert">{e}</span>)}
          <div className="row-actions">
            <button
              type="button"
              className="btn"
              disabled={(config.appearance.customThemes?.length ?? 0) >= MAX_CUSTOM_THEMES}
              onClick={() => update((c) => addCustomTheme(c, { ...structuredClone(t), id: createTheme(t.base).id, name: `${t.name} (cópia)` }))}
            >
              <Copy size={14} /> Duplicar
            </button>
            <button
              type="button"
              className="btn btn-ghost"
              onClick={() =>
                void navigator.clipboard.writeText(exportTheme(t)).then(
                  () => setMsg({ ok: true, text: "Tema copiado (JSON). Cole num arquivo .kira-theme.json para compartilhar." }),
                  () => setMsg({ ok: false, text: "Não foi possível copiar." }),
                )
              }
            >
              <Download size={14} /> Exportar
            </button>
            <button
              type="button"
              className="btn btn-danger"
              onClick={() => {
                if (!window.confirm(`Excluir o tema "${t.name}"?`)) return;
                update((c) => {
                  c.appearance.customThemes = (c.appearance.customThemes ?? []).filter((x) => x.id !== t.id);
                  c.appearance.theme = t.base;
                });
              }}
            >
              <Trash2 size={14} /> Excluir
            </button>
          </div>
        </div>
      ) : (
        <p className="muted">Clique em “+ Criar tema” acima para começar, ou importe um tema abaixo.</p>
      )}
      <Field label="Importar tema" hint="Cole o JSON de um tema exportado (.kira-theme.json).">
        <textarea className="code" rows={4} value={importText} onChange={(e) => setImportText(e.target.value)} placeholder='{ "kiraTheme": 1, ... }' spellCheck={false} />
      </Field>
      <div className="row-actions">
        <button type="button" className="btn" disabled={!importText.trim()} onClick={doImport}>
          <Upload size={14} /> Importar
        </button>
      </div>
      {msg && <span className={msg.ok ? "inline-ok" : "inline-error"} role="status">{msg.text}</span>}
    </Section>
  );
}
