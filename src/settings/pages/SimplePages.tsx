import { Check, Clipboard, RotateCcw, Upload } from "lucide-react";
import { useState } from "react";
import { cloneConfig, defaultConfig, withDefaults } from "../../shared/defaults";
import { HOLO_ACCENT, SCALE_LIMITS, wantsHotkey, wantsOrb, type Config, type LauncherMode, type Theme } from "../../shared/types";
import { Field, Section, Segmented, Toggle } from "../controls";
import { HotkeyRecorder } from "../HotkeyRecorder";

interface PageProps {
  config: Config;
  update: (fn: (c: Config) => void) => void;
}

export function GeneralPage({ config, update }: PageProps) {
  const b = config.behavior;
  return (
    <Section title="Geral">
      <Field label="Onde abrir o menu">
        <Segmented
          value={b.openAt}
          options={[{ value: "cursor", label: "Na posição do mouse" }, { value: "center", label: "No centro da tela" }]}
          onChange={(v) => update((c) => void (c.behavior.openAt = v))}
        />
      </Field>
      <Toggle label="Iniciar com o Windows" checked={b.autostart} onChange={(v) => update((c) => void (c.behavior.autostart = v))} />
      <Toggle label="Fechar ao perder o foco" hint="Clicar em outra janela fecha o menu." checked={b.closeOnBlur} onChange={(v) => update((c) => void (c.behavior.closeOnBlur = v))} />
      <Toggle label="Fechar após executar uma ação" checked={b.closeOnAction} onChange={(v) => update((c) => void (c.behavior.closeOnAction = v))} />
      <Field label={`Zona morta central: ${b.deadZonePx}px`} hint="Dentro deste raio nenhuma fatia é selecionada.">
        <input type="range" min={60} max={140} step={5} value={b.deadZonePx} onChange={(e) => update((c) => void (c.behavior.deadZonePx = Number(e.target.value)))} />
      </Field>
    </Section>
  );
}

const LAUNCHER_HINT: Record<LauncherMode, string> = {
  hotkey: "O menu abre pelo atalho global, na posição do mouse.",
  orb: "Um ícone animado fica na tela; clique nele para abrir o menu. Arraste-o para qualquer lugar. O atalho fica desligado.",
  both: "O ícone fica na tela e o atalho global também funciona.",
};

export function LauncherSection({ config, update }: PageProps) {
  const mode = config.launcher.mode;
  return (
    <Section title="Abrir o menu por">
      <Field label="Modo de abertura" group hint={LAUNCHER_HINT[mode]}>
        <Segmented<LauncherMode>
          value={mode}
          options={[
            { value: "hotkey", label: "Atalho" },
            { value: "orb", label: "Ícone" },
            { value: "both", label: "Ícone + atalho" },
          ]}
          onChange={(v) => update((c) => void (c.launcher.mode = v))}
        />
      </Field>
      {wantsOrb(mode) && <p className="muted">Ajuste tamanho e aparência do ícone na página <strong>Ícone</strong>.</p>}
    </Section>
  );
}

export function HotkeyPage({ config, update }: PageProps) {
  const hotkeyOn = wantsHotkey(config.launcher.mode);
  return (
    <>
    <LauncherSection config={config} update={update} />
    {!hotkeyOn ? (
      <Section title="Atalho de exibição" description="Desligado no modo “Ícone”. Escolha “Atalho” ou “Ícone + atalho” acima para usar uma combinação de teclas.">
        <p className="muted" data-testid="hotkey-off">Atalho atual (desligado): <kbd>{config.hotkey.accelerator}</kbd></p>
      </Section>
    ) : (
    <Section title="Atalho de exibição" description="Combinação global que abre o menu em qualquer lugar do Windows. Enquanto você grava, o atalho atual fica pausado.">
      <Field label="Atalho">
        <HotkeyRecorder value={config.hotkey.accelerator} requireModifier pauseGlobal onChange={(v) => update((c) => void (c.hotkey.accelerator = v))} />
      </Field>
      <Field
        label="Modo"
        group
        hint={config.hotkey.mode === "toggle"
          ? "Pressione para abrir; clique numa fatia (ou pressione de novo / Esc para fechar)."
          : "Segure o atalho, aponte o mouse para a fatia e solte para executar."}
      >
        <Segmented
          value={config.hotkey.mode}
          options={[{ value: "toggle", label: "Pressionar e clicar" }, { value: "hold", label: "Segurar e soltar" }]}
          onChange={(v) => update((c) => void (c.hotkey.mode = v))}
        />
      </Field>
      <p className="muted">Sugestões: Ctrl+Alt+Q, Alt+Q, Ctrl+Shift+Q, Win+Shift+Z. (Alt+Space costuma ser capturado pelo PowerToys.)</p>
    </Section>
    )}
    </>
  );
}

const ACCENTS = ["#4ade9b", "#43c7d9", "#a78bfa", "#e879d8", "#f2c46d", HOLO_ACCENT, "#ff5c7a"];
const GLASS_ACCENT = "#4ade9b";

/** Troca o tema e sugere a cor que combina com ele (sem sobrescrever uma cor personalizada). */
export function applyTheme(c: Config, theme: Theme) {
  const prev = c.appearance.theme ?? "glass";
  if (prev === theme) return;
  c.appearance.theme = theme;
  if (theme === "holo" && c.appearance.accent === GLASS_ACCENT) c.appearance.accent = HOLO_ACCENT;
  if (theme === "glass" && c.appearance.accent === HOLO_ACCENT) c.appearance.accent = GLASS_ACCENT;
}

export function AppearancePage({ config, update }: PageProps) {
  const a = config.appearance;
  return (
    <Section title="Aparência">
      <Field label="Tema" group>
        <Segmented<Theme>
          value={a.theme ?? "glass"}
          options={[
            { value: "glass", label: "Vidro" },
            { value: "holo", label: "Holográfico" },
          ]}
          onChange={(t) => update((c) => applyTheme(c, t))}
        />
      </Field>
      {a.theme === "holo" && (
        <p className="muted">HUD em wireframe com esfera e anéis animados. Usa a cor de destaque abaixo (âmbar por padrão; azul-ciano também fica bom).</p>
      )}
      <Field label={`Tamanho: ${Math.round(a.scale * 100)}%`}>
        <input type="range" min={SCALE_LIMITS.min} max={SCALE_LIMITS.max} step={0.05} value={a.scale} onChange={(e) => update((c) => void (c.appearance.scale = Number(e.target.value)))} />
      </Field>
      <Field label="Cor de destaque (fatia ativa)">
        <div className="color-row">
          {ACCENTS.map((c) => (
            <button key={c} type="button" aria-label={c} className={`swatch${a.accent === c ? " is-on" : ""}`} style={{ background: c }} onClick={() => update((cf) => void (cf.appearance.accent = c))} />
          ))}
          <input type="color" value={a.accent} onChange={(e) => update((c) => void (c.appearance.accent = e.target.value))} />
        </div>
      </Field>
      <Toggle label="Mostrar relógio e data" checked={a.showClock} onChange={(v) => update((c) => void (c.appearance.showClock = v))} />
      <Toggle label="Mostrar medidor de CPU" checked={a.showCpu} onChange={(v) => update((c) => void (c.appearance.showCpu = v))} />
    </Section>
  );
}

export function BackupPage({ config, replace }: { config: Config; replace: (c: Config) => void }) {
  const [text, setText] = useState("");
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const json = JSON.stringify(config, null, 2);

  return (
    <>
      <Section title="Exportar" description="Copie a configuração atual (inclui alterações ainda não salvas).">
        <textarea className="code" rows={8} readOnly value={json} />
        <div className="row-actions">
          <button type="button" className="btn" onClick={() => navigator.clipboard.writeText(json).then(() => setMsg({ ok: true, text: "Copiado." }))}>
            <Clipboard size={14} /> Copiar JSON
          </button>
        </div>
      </Section>
      <Section title="Importar" description="Cole um JSON exportado. Ele substitui o rascunho; revise e clique em Salvar.">
        <textarea className="code" rows={6} value={text} onChange={(e) => setText(e.target.value)} placeholder='{ "version": 1, ... }' spellCheck={false} />
        <div className="row-actions">
          <button
            type="button"
            className="btn"
            onClick={() => {
              try {
                const c = JSON.parse(text) as Config;
                if (c.version !== 1 || !Array.isArray(c.profiles)) throw new Error("formato não reconhecido");
                replace(withDefaults(c));
                setMsg({ ok: true, text: "Importado para o rascunho." });
              } catch (e) {
                setMsg({ ok: false, text: `JSON inválido: ${(e as Error).message}` });
              }
            }}
          >
            <Upload size={14} /> Importar
          </button>
          <button
            type="button"
            className="btn btn-danger"
            onClick={() => window.confirm("Restaurar todas as configurações padrão?") && replace(cloneConfig(defaultConfig))}
          >
            <RotateCcw size={14} /> Restaurar padrões
          </button>
        </div>
        {msg && <p className={msg.ok ? "inline-ok" : "inline-error"}>{msg.ok && <Check size={13} />} {msg.text}</p>}
      </Section>
    </>
  );
}
