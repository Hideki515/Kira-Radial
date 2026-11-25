import { Check, Clipboard, RotateCcw, Upload } from "lucide-react";
import { t, type Key } from "../../shared/i18n";
import { useState, type CSSProperties } from "react";
import { cloneConfig, defaultConfig, withDefaults } from "../../shared/defaults";
import { HOLO_ACCENT, SCALE_LIMITS, THEMES, THEME_ACCENT, THEME_GROUPS, wantsHotkey, wantsOrb, type Config, type LauncherMode, type Theme, type ThemeRef } from "../../shared/types";
import { Field, Section, Segmented, Toggle } from "../controls";
import { HotkeyRecorder } from "../HotkeyRecorder";
import { RadialCanvas } from "../../radial/RadialCanvas";
import { SoundsSection } from "./SoundsSection";
import { BrowserFields } from "../BrowserFields";
import { ThemeEditor, addCustomTheme } from "./ThemeEditor";
import { MAX_CUSTOM_THEMES, customRef, isCustomRef } from "../../shared/customTheme";
import { BackupHistory } from "./BackupHistory";
import { KnobSection } from "./KnobSection";
import { GamepadSection } from "./GamepadSection";
import { ScreenshotSection } from "./ScreenshotSection";
import { UpdatesSection } from "./UpdatesSection";
import { clipboardClear } from "../../shared/ipc";

interface PageProps {
  config: Config;
  update: (fn: (c: Config) => void) => void;
}

export function GeneralPage({ config, update }: PageProps) {
  const b = config.behavior;
  return (
    <>
    <Section title={t("gen.title")}>
      <Field label={t("gen.openAt")}>
        <Segmented
          value={b.openAt}
          options={[{ value: "cursor", label: t("gen.openAt.cursor") }, { value: "center", label: t("gen.openAt.center") }]}
          onChange={(v) => update((c) => void (c.behavior.openAt = v))}
        />
      </Field>
      <Field label={t("lang.label")} hint={t("lang.hint")} group>
        <Segmented
          value={b.language ?? "auto"}
          options={[
            { value: "auto", label: t("lang.auto") },
            { value: "pt", label: t("lang.pt") },
            { value: "en", label: t("lang.en") },
          ]}
          onChange={(v) =>
            update((c) => {
              if (v === "auto") delete c.behavior.language;
              else c.behavior.language = v;
            })
          }
        />
      </Field>
      <Toggle label={t("gen.autostart")} checked={b.autostart} onChange={(v) => update((c) => void (c.behavior.autostart = v))} />
      <Toggle label={t("gen.closeOnBlur")} hint={t("gen.closeOnBlur.hint")} checked={b.closeOnBlur} onChange={(v) => update((c) => void (c.behavior.closeOnBlur = v))} />
      <Toggle label={t("gen.closeOnAction")} checked={b.closeOnAction} onChange={(v) => update((c) => void (c.behavior.closeOnAction = v))} />
      <Toggle
        label={t("gen.clipboard")}
        hint={t("gen.clipboard.hint")}
        checked={!!b.clipboardHistory}
        onChange={(v) => update((c) => void (c.behavior.clipboardHistory = v))}
      />
      {b.clipboardHistory && (
        <div className="row-actions">
          <button type="button" className="btn" onClick={() => void clipboardClear()}>{t("gen.clipboard.clear")}</button>
        </div>
      )}
      <BrowserFields
        scope="global"
        value={{ browser: b.browser, browserName: b.browserName }}
        onChange={(v) =>
          update((c) => {
            if (v.browser) {
              c.behavior.browser = v.browser;
              c.behavior.browserName = v.browserName;
            } else {
              delete c.behavior.browser;
              delete c.behavior.browserName;
            }
          })
        }
      />
      <Field label={t("gen.deadZone", { px: b.deadZonePx })} hint={t("gen.deadZone.hint")}>
        <input type="range" min={60} max={140} step={5} value={b.deadZonePx} onChange={(e) => update((c) => void (c.behavior.deadZonePx = Number(e.target.value)))} />
      </Field>
    </Section>
    <ScreenshotSection config={config} update={update} />
    <UpdatesSection config={config} update={update} />
    </>
  );
}

export function LauncherSection({ config, update }: PageProps) {
  const mode = config.launcher.mode;
  return (
    <Section title={t("launch.title")}>
      <Field label={t("launch.mode")} group hint={t(`launch.hint.${mode}`)}>
        <Segmented<LauncherMode>
          value={mode}
          options={[
            { value: "hotkey", label: t("launch.hotkey") },
            { value: "orb", label: t("launch.orb") },
            { value: "both", label: t("launch.both") },
          ]}
          onChange={(v) => update((c) => void (c.launcher.mode = v))}
        />
      </Field>
      {wantsOrb(mode) && <p className="muted">{t("launch.iconPagePre")} <strong>{t("set.nav.icon")}</strong>{t("launch.iconPagePost")}</p>}
    </Section>
  );
}

export function HotkeyPage({ config, update }: PageProps) {
  const hotkeyOn = wantsHotkey(config.launcher.mode);
  return (
    <>
    <LauncherSection config={config} update={update} />
    {!hotkeyOn ? (
      <Section title={t("hk.title")} description={t("hk.off.desc")}>
        <p className="muted" data-testid="hotkey-off">{t("hk.off.current")} <kbd>{config.hotkey.accelerator}</kbd></p>
      </Section>
    ) : (
    <Section title={t("hk.title")} description={t("hk.desc")}>
      <Field label={t("hk.field")}>
        <HotkeyRecorder value={config.hotkey.accelerator} requireModifier pauseGlobal onChange={(v) => update((c) => void (c.hotkey.accelerator = v))} />
      </Field>
      <Field
        label={t("hk.mode")}
        group
        hint={t(config.hotkey.mode === "toggle" ? "hk.mode.toggle.hint" : "hk.mode.hold.hint")}
      >
        <Segmented
          value={config.hotkey.mode}
          options={[{ value: "toggle", label: t("hk.mode.toggle") }, { value: "hold", label: t("hk.mode.hold") }]}
          onChange={(v) => update((c) => void (c.hotkey.mode = v))}
        />
      </Field>
      <p className="muted">{t("hk.suggestions")}</p>
    </Section>
    )}
    <KnobSection config={config} update={update} />
    <GamepadSection config={config} update={update} />
    </>
  );
}

const ACCENTS = ["#4ade9b", "#43c7d9", "#5ad1ff", "#0067c0", "#39ff6a", "#a78bfa", "#e879d8", "#ff4fd8", "#fcee0a", "#f2c46d", "#d4a24c", HOLO_ACCENT, "#ff5c7a", "#f2f2f2"];

/** Troca o tema e sugere a cor que combina com ele (sem sobrescrever uma cor personalizada). */
export function applyTheme(c: Config, theme: ThemeRef) {
  const prev = c.appearance.theme ?? "glass";
  if (prev === theme) return;
  c.appearance.theme = theme;
  // Tema personalizado tem a própria cor de destaque: não mexe na cor global.
  if (isCustomRef(theme)) return;
  // Troca a cor só se ela for a sugerida do tema anterior (cor personalizada fica).
  // Tema anterior desconhecido/personalizado: não há cor sugerida para comparar.
  const prevAccent = THEME_ACCENT[prev as Theme] as string | undefined;
  if (prevAccent && c.appearance.accent.toLowerCase() === prevAccent.toLowerCase()) c.appearance.accent = THEME_ACCENT[theme as Theme];
}

/** Nome e dica de cada tema embutido, no idioma atual. */
const THEME_INFO: Record<Theme, { label: string; hint: string }> = new Proxy({} as Record<Theme, { label: string; hint: string }>, {
  get: (_, k) => ({ label: t(`theme.${String(k)}.label` as Key), hint: t(`theme.${String(k)}.hint` as Key) }),
});

/** Cartões com miniatura (estática) de cada tema. */
function ThemePicker({ config, update }: PageProps) {
  const current = config.appearance.theme ?? "glass";
  const items = config.profiles[0].items;
  return (
    <div className="theme-groups" role="radiogroup" aria-label={t("theme.group")}>
      {THEME_GROUPS.map((g) => (
        <section key={g.id} className="theme-group" aria-label={t(`theme.cat.${g.id}` as Key)}>
          <h4 className="theme-group-title">{t(`theme.cat.${g.id}` as Key)}</h4>
          <div className="theme-grid">
            {g.themes.map((th) => (
              <button
                key={th}
                type="button"
                role="radio"
                aria-checked={current === th}
                aria-label={THEME_INFO[th].label}
                className={`theme-card${current === th ? " is-on" : ""}`}
                onClick={() => update((c) => applyTheme(c, th))}
              >
                <span className="theme-thumb is-thumb" style={{ "--active": current === th ? config.appearance.accent : THEME_ACCENT[th] } as CSSProperties}>
                  <RadialCanvas
                    items={items}
                    activeMain={0}
                    activeSub={null}
                    hubHovered={false}
                    stats={{ cpu: 42, ram: 50 }}
                    appearance={{ ...config.appearance, theme: th, showMedia: false }}
                  />
                </span>
                <span className="theme-name">{THEME_INFO[th].label}</span>
                <span className="theme-hint">{THEME_INFO[th].hint}</span>
              </button>
            ))}
          </div>
        </section>
      ))}
      <section className="theme-group" aria-label={t("theme.cat.mine")}>
        <h4 className="theme-group-title">{t("theme.cat.mine")}</h4>
        <div className="theme-grid">
          {(config.appearance.customThemes ?? []).map((ct) => {
            const ref = customRef(ct.id);
            return (
              <button
                key={ct.id}
                type="button"
                role="radio"
                aria-checked={current === ref}
                aria-label={ct.name}
                className={`theme-card is-custom${current === ref ? " is-on" : ""}`}
                onClick={() => update((c) => applyTheme(c, ref))}
              >
                <span className="theme-thumb is-thumb">
                  <RadialCanvas
                    items={items}
                    activeMain={0}
                    activeSub={null}
                    hubHovered={false}
                    stats={{ cpu: 42, ram: 50 }}
                    appearance={{ ...config.appearance, theme: ref, showMedia: false }}
                  />
                </span>
                <span className="theme-name">{ct.name}</span>
                <span className="theme-hint">{t("theme.custom.hint", { base: (THEMES as readonly string[]).includes(ct.base) ? THEME_INFO[ct.base].label : ct.base })}</span>
              </button>
            );
          })}
          <button
            type="button"
            className="theme-card is-add"
            disabled={(config.appearance.customThemes?.length ?? 0) >= MAX_CUSTOM_THEMES}
            onClick={() => update((c) => addCustomTheme(c))}
          >
            <span className="theme-name">{t("theme.create")}</span>
            <span className="theme-hint">{t("theme.create.hint")}</span>
          </button>
        </div>
      </section>
    </div>
  );
}

export function AppearancePage({ config, update }: PageProps) {
  const a = config.appearance;
  return (
    <>
    <Section title={t("app.title")}>
      <Field label={t("theme.group")} group hint={t("app.theme.hint")}>
        <ThemePicker config={config} update={update} />
      </Field>
    </Section>
    <ThemeEditor config={config} update={update} themeLabel={(th) => THEME_INFO[th].label} />
    <Section title={t("app.more")}>
      <Field label={t("app.size", { pct: Math.round(a.scale * 100) })}>
        <input type="range" min={SCALE_LIMITS.min} max={SCALE_LIMITS.max} step={0.05} value={a.scale} onChange={(e) => update((c) => void (c.appearance.scale = Number(e.target.value)))} />
      </Field>
      <Field label={t("app.accent")}>
        <div className="color-row">
          {ACCENTS.map((c) => (
            <button key={c} type="button" aria-label={c} className={`swatch${a.accent === c ? " is-on" : ""}`} style={{ background: c }} onClick={() => update((cf) => void (cf.appearance.accent = c))} />
          ))}
          <input type="color" value={a.accent} onChange={(e) => update((c) => void (c.appearance.accent = e.target.value))} />
        </div>
      </Field>
      <Toggle label={t("app.clock")} checked={a.showClock} onChange={(v) => update((c) => void (c.appearance.showClock = v))} />
      <Toggle
        label={t("app.numbers")}
        hint={t("app.numbers.hint")}
        checked={!!a.showNumbers}
        onChange={(v) => update((c) => void (c.appearance.showNumbers = v))}
      />
      <Toggle
        label={t("app.media")}
        hint={t("app.media.hint")}
        checked={a.showMedia !== false}
        onChange={(v) => update((c) => void (c.appearance.showMedia = v))}
      />
      <Toggle label={t("app.cpu")} checked={a.showCpu} onChange={(v) => update((c) => void (c.appearance.showCpu = v))} />
      {a.showCpu && (
        <Field label={t("app.gauge")} group hint={t("app.gauge.hint")}>
          <Segmented
            value={a.hubGauge ?? "cpu"}
            options={[{ value: "cpu", label: "CPU" }, { value: "ram", label: "RAM" }, { value: "net", label: t("app.gauge.net") }]}
            onChange={(g) => update((c) => void (c.appearance.hubGauge = g))}
          />
        </Field>
      )}
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
      <Section title={t("bk.export")} description={t("bk.export.desc")}>
        <textarea className="code" rows={8} readOnly value={json} />
        <div className="row-actions">
          <button type="button" className="btn" onClick={() => navigator.clipboard.writeText(json).then(() => setMsg({ ok: true, text: t("bk.copied") }))}>
            <Clipboard size={14} /> {t("bk.copyJson")}
          </button>
        </div>
      </Section>
      <Section title={t("bk.import")} description={t("bk.import.desc")}>
        <textarea className="code" rows={6} value={text} onChange={(e) => setText(e.target.value)} placeholder='{ "version": 1, ... }' spellCheck={false} />
        <div className="row-actions">
          <button
            type="button"
            className="btn"
            onClick={() => {
              try {
                const c = JSON.parse(text) as Config;
                if (c.version !== 1 || !Array.isArray(c.profiles)) throw new Error(t("bk.badFormat"));
                replace(withDefaults(c));
                setMsg({ ok: true, text: t("bk.imported") });
              } catch (e) {
                setMsg({ ok: false, text: t("bk.invalid", { error: (e as Error).message }) });
              }
            }}
          >
            <Upload size={14} /> {t("bk.import")}
          </button>
          <button
            type="button"
            className="btn btn-danger"
            onClick={() => window.confirm(t("bk.resetConfirm")) && replace(cloneConfig(defaultConfig))}
          >
            <RotateCcw size={14} /> {t("bk.reset")}
          </button>
        </div>
        {msg && <p className={msg.ok ? "inline-ok" : "inline-error"}>{msg.ok && <Check size={13} />} {msg.text}</p>}
      </Section>
      <BackupHistory config={config} replace={replace} />
    </>
  );
}
