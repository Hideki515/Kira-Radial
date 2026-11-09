import { Check, Clipboard, RotateCcw, Upload } from "lucide-react";
import { useState, type CSSProperties } from "react";
import { cloneConfig, defaultConfig, withDefaults } from "../../shared/defaults";
import { HOLO_ACCENT, SCALE_LIMITS, THEMES, THEME_ACCENT, wantsHotkey, wantsOrb, type Config, type LauncherMode, type Theme } from "../../shared/types";
import { Field, Section, Segmented, Toggle } from "../controls";
import { HotkeyRecorder } from "../HotkeyRecorder";
import { RadialCanvas } from "../../radial/RadialCanvas";
import { SoundsSection } from "./SoundsSection";
import { clipboardClear } from "../../shared/ipc";

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
      <Toggle
        label="Guardar os últimos textos copiados"
        hint="Para o submenu automático “Área de transferência”. Só os 8 últimos textos, só na memória (somem ao fechar a Kira). Senhas copiadas de gerenciadores que pedem exclusão não são guardadas."
        checked={!!b.clipboardHistory}
        onChange={(v) => update((c) => void (c.behavior.clipboardHistory = v))}
      />
      {b.clipboardHistory && (
        <div className="row-actions">
          <button type="button" className="btn" onClick={() => void clipboardClear()}>Limpar histórico agora</button>
        </div>
      )}
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

const ACCENTS = ["#4ade9b", "#43c7d9", "#5ad1ff", "#0067c0", "#39ff6a", "#a78bfa", "#e879d8", "#ff4fd8", "#fcee0a", "#f2c46d", "#d4a24c", HOLO_ACCENT, "#ff5c7a", "#f2f2f2"];

/** Troca o tema e sugere a cor que combina com ele (sem sobrescrever uma cor personalizada). */
export function applyTheme(c: Config, theme: Theme) {
  const prev = c.appearance.theme ?? "glass";
  if (prev === theme) return;
  c.appearance.theme = theme;
  // Troca a cor só se ela for a sugerida do tema anterior (cor personalizada fica).
  // Tema anterior desconhecido (config editada/de outra versão): não há cor sugerida para comparar.
  const prevAccent = THEME_ACCENT[prev as Theme] as string | undefined;
  if (prevAccent && c.appearance.accent.toLowerCase() === prevAccent.toLowerCase()) c.appearance.accent = THEME_ACCENT[theme];
}

const THEME_INFO: Record<Theme, { label: string; hint: string }> = {
  glass: { label: "Vidro", hint: "Fatias escuras translúcidas, discreto." },
  holo: { label: "Holográfico", hint: "HUD em wireframe com esfera e anéis animados." },
  reactor: { label: "Arc Reactor", hint: "Anéis segmentados girando e núcleo azul brilhante." },
  terminal: { label: "Terminal", hint: "Verde fósforo, fonte monoespaçada e linhas de varredura." },
  neon: { label: "Neon Synthwave", hint: "Retrô anos 80: sol listrado, grade em perspectiva e neon rosa/ciano." },
  cyber: { label: "Cyberpunk", hint: "Amarelo e preto, faixa de perigo, cantos chanfrados e glitch." },
  steam: { label: "Steampunk", hint: "Latão e cobre, engrenagens girando, rebites e letras serifadas." },
  fluent: { label: "Fluent Claro", hint: "Claro e translúcido, no estilo do Windows 11." },
  minimal: { label: "Minimalista", hint: "Preto e branco, traços finos, nada de enfeite." },
};

/** Cartões com miniatura (estática) de cada tema. */
function ThemePicker({ config, update }: PageProps) {
  const current = config.appearance.theme ?? "glass";
  const items = config.profiles[0].items;
  return (
    <div className="theme-grid" role="radiogroup" aria-label="Tema">
      {THEMES.map((t) => (
        <button
          key={t}
          type="button"
          role="radio"
          aria-checked={current === t}
          aria-label={THEME_INFO[t].label}
          className={`theme-card${current === t ? " is-on" : ""}`}
          onClick={() => update((c) => applyTheme(c, t))}
        >
          <span className="theme-thumb is-thumb" style={{ "--active": current === t ? config.appearance.accent : THEME_ACCENT[t] } as CSSProperties}>
            <RadialCanvas
              items={items}
              activeMain={0}
              activeSub={null}
              hubHovered={false}
              stats={{ cpu: 42, ram: 50 }}
              appearance={{ ...config.appearance, theme: t, showMedia: false }}
            />
          </span>
          <span className="theme-name">{THEME_INFO[t].label}</span>
          <span className="theme-hint">{THEME_INFO[t].hint}</span>
        </button>
      ))}
    </div>
  );
}

export function AppearancePage({ config, update }: PageProps) {
  const a = config.appearance;
  return (
    <>
    <Section title="Aparência">
      <Field label="Tema" group hint="Cada tema sugere uma cor; a cor de destaque abaixo continua valendo (uma cor personalizada não é trocada).">
        <ThemePicker config={config} update={update} />
      </Field>
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
      <Toggle
        label="Mostrar números nas fatias"
        hint="Com o menu aberto, as teclas 1–9 escolhem a fatia (e o subitem, com o sub-anel aberto)."
        checked={!!a.showNumbers}
        onChange={(v) => update((c) => void (c.appearance.showNumbers = v))}
      />
      <Toggle
        label="Mostrar a música no centro"
        hint="Com algo tocando (Spotify, YouTube…), o centro mostra capa, título e artista. Gire a roda do mouse sobre o centro para ajustar o volume."
        checked={a.showMedia !== false}
        onChange={(v) => update((c) => void (c.appearance.showMedia = v))}
      />
      <Toggle label="Mostrar medidor de CPU" checked={a.showCpu} onChange={(v) => update((c) => void (c.appearance.showCpu = v))} />
    </Section>
    <SoundsSection config={config} update={update} />
    </>
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
