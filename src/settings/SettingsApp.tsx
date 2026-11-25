import { CircleDot, Clapperboard, Headset, Orbit, Stethoscope, Keyboard, LayoutGrid, Palette, Save, Settings2, Undo2, Users, Archive, AlertTriangle } from "lucide-react";
import { applyLangSetting, t, useLang } from "../shared/i18n";
import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties } from "react";
import { useSystemStats } from "../hooks/useSystemStats";
import { getConfig, getHotkeyError, onEvent, saveConfig } from "../shared/ipc";
import { wantsOrb, type Config, type Profile } from "../shared/types";
import { IconPage } from "./pages/IconPage";
import { useUpdateInfo } from "./pages/UpdatesSection";
import { PreviewEditor } from "./PreviewEditor";
import { DiagnosticsPage } from "./pages/DiagnosticsPage";
import { DiscordPage } from "./pages/DiscordPage";
import { ObsPage } from "./pages/ObsPage";
import { validateConfig } from "../shared/validate";
import { RadialCanvas, type RadialCanvasProps } from "../radial/RadialCanvas";
import { useIconFiles } from "../shared/iconFiles";

/** Pré-visualização com os ícones próprios (iconFile) já carregados. */
function PreviewCanvas(props: RadialCanvasProps) {
  const items = useIconFiles(props.items);
  return <RadialCanvas {...props} items={items} />;
}
import { resolveItems } from "../radial/dynamic";
import { useDynamicSources } from "../radial/useDynamicSources";
import { ItemsPage, type Selection } from "./pages/ItemsPage";
import { ProfilesPage } from "./pages/ProfilesPage";
import { AppearancePage, BackupPage, GeneralPage, HotkeyPage } from "./pages/SimplePages";

type Page = "items" | "hotkey" | "icon" | "profiles" | "general" | "appearance" | "backup" | "discord" | "obs" | "diagnostics";

const NAV: { id: Page; icon: typeof CircleDot }[] = [
  { id: "items", icon: LayoutGrid },
  { id: "hotkey", icon: Keyboard },
  { id: "icon", icon: Orbit },
  { id: "profiles", icon: Users },
  { id: "general", icon: Settings2 },
  { id: "appearance", icon: Palette },
  { id: "backup", icon: Archive },
  { id: "discord", icon: Headset },
  { id: "obs", icon: Clapperboard },
  { id: "diagnostics", icon: Stethoscope },
];

export function SettingsApp() {
  const [saved, setSaved] = useState<Config | null>(null);
  const [draft, setDraft] = useState<Config | null>(null);
  const [page, setPage] = useState<Page>("items");
  const [updateInfo] = useUpdateInfo();
  const [profileIdx, setProfileIdx] = useState(0);
  const [selection, setSelection] = useState<Selection>({ main: 0, child: null });
  const [status, setStatus] = useState<{ ok: boolean; text: string } | null>(null);
  const [saving, setSaving] = useState(false);
  const [hotkeyError, setHotkeyError] = useState<string | null>(null);
  const stats = useSystemStats();

  useEffect(() => {
    getConfig().then((c) => {
      setSaved(c);
      setDraft(structuredClone(c));
    });
    void getHotkeyError().then(setHotkeyError);
  }, []);

  /** Mutação estilo "immer": clona o rascunho e aplica `fn` na cópia. */
  const update = useCallback((fn: (c: Config) => void) => {
    setDraft((d) => {
      if (!d) return d;
      const next = structuredClone(d);
      fn(next);
      return next;
    });
    setStatus(null);
  }, []);

  // Pré-visualização dos submenus automáticos com os dados reais (lidos uma vez).
  // O idioma escolhido vale na hora (antes de salvar), como o tema na pré-visualização.
  useEffect(() => {
    if (draft) applyLangSetting(draft.behavior.language);
  }, [draft?.behavior.language]); // eslint-disable-line react-hooks/exhaustive-deps
  useLang();
  const allItems = useMemo(() => draft?.profiles.flatMap((p) => p.items) ?? [], [draft?.profiles]);
  const sources = useDynamicSources(allItems, true, 0);

  const errors = useMemo(() => (draft ? validateConfig(draft) : []), [draft]);
  const dirty = useMemo(() => JSON.stringify(draft) !== JSON.stringify(saved), [draft, saved]);
  const dirtyRef = useRef(dirty);
  dirtyRef.current = dirty;
  // Chegou uma config de outro PC (sincronização): sem edições pendentes, recarrega;
  // com edições, avisa (salvar mantém as daqui; a outra já virou backup).
  useEffect(() => {
    const off = onEvent("sync:pulled", () => {
      if (dirtyRef.current) return setStatus({ ok: false, text: t("sync.pulledDirty") });
      void getConfig().then((c) => {
        setSaved(c);
        setDraft(structuredClone(c));
        setStatus({ ok: true, text: t("sync.pulled") });
      });
    });
    return () => void off.then((f) => f());
  }, []);

  // Botão Salvar e Ctrl+S: só com mudança, sem erro e sem outro salvamento em andamento.
  const save = useCallback(async () => {
    if (!draft || !dirty || errors.length || saving) return;
    setSaving(true);
    try {
      await saveConfig(draft);
      setSaved(structuredClone(draft));
      setHotkeyError(null);
      setStatus({ ok: true, text: t("set.saved") });
    } catch (e) {
      setStatus({ ok: false, text: String(e) });
    } finally {
      setSaving(false);
    }
  }, [draft, dirty, errors.length, saving]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.ctrlKey && e.key.toLowerCase() === "s") {
        e.preventDefault();
        void save();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [save]);

  if (!draft) return <div className="settings-loading">{t("common.loading")}</div>;

  const pIdx = Math.min(profileIdx, draft.profiles.length - 1);
  const profile = draft.profiles[pIdx];
  const sel: Selection = {
    main: Math.min(selection.main, profile.items.length - 1),
    child: selection.child,
  };
  const editProfile = (fn: (p: Profile) => void) => update((c) => fn(c.profiles[pIdx]));
  const selMain = profile.items[sel.main];
  const previewMain = page === "items" ? sel.main : null;
  const previewSub = page === "items" && sel.child !== null && selMain?.children?.[sel.child] ? sel.child : null;
  const previewItems = resolveItems(profile.items, sources);

  return (
    <div className="settings" style={{ "--active": draft.appearance.accent } as CSSProperties}>
      <nav className="sidebar">
        <div className="brand">
          <CircleDot size={20} />
          <span>Kira Radial</span>
        </div>
        {NAV.filter((n) => n.id !== "icon" || wantsOrb(draft.launcher.mode) || page === "icon").map(({ id, icon: Icon }) => (
          <button key={id} type="button" className={`nav-item${page === id ? " is-on" : ""}`} onClick={() => setPage(id)}>
            <Icon size={16} /> {t(`set.nav.${id}`)}
          </button>
        ))}
        <div className="sidebar-foot">v{__APP_VERSION__}</div>
      </nav>

      <main className="content">
        {updateInfo?.available && page !== "general" && (
          <div className="banner-info" role="note" data-testid="update-banner">
            <span>
              <strong>{t("set.update.available", { version: updateInfo.version ?? "" })}</strong>{" "}
              <button type="button" className="link" onClick={() => setPage("general")}>{t("set.update.goto")}</button>
            </span>
          </div>
        )}
        {hotkeyError && (
          <div className="banner-error" role="alert">
            <AlertTriangle size={16} />
            <span>
              <strong>{t("set.hotkeyFailed.title")}</strong> {hotkeyError}. {t("set.hotkeyFailed.pre")}{" "}
              <button type="button" className="link" onClick={() => setPage("hotkey")}>{t("set.nav.hotkey")}</button> {t("set.hotkeyFailed.post")}
            </span>
          </div>
        )}
        {(page === "items" || page === "profiles") && draft.profiles.length > 1 && (
          <div className="profile-picker">
            <span>{t("set.profile")}</span>
            <select value={pIdx} onChange={(e) => { setProfileIdx(Number(e.target.value)); setSelection({ main: 0, child: null }); }}>
              {draft.profiles.map((p, i) => <option key={p.id} value={i}>{p.name}</option>)}
            </select>
          </div>
        )}

        {page === "items" && <ItemsPage profile={profile} selection={sel} onSelect={setSelection} edit={editProfile} />}
        {page === "hotkey" && <HotkeyPage config={draft} update={update} />}
        {page === "icon" && <IconPage config={draft} update={update} goToLauncher={() => setPage("hotkey")} />}
        {page === "profiles" && (
          <ProfilesPage config={draft} selected={pIdx} onSelect={(i) => { setProfileIdx(i); setSelection({ main: 0, child: null }); }} update={update} />
        )}
        {page === "general" && <GeneralPage config={draft} update={update} />}
        {page === "diagnostics" && <DiagnosticsPage />}
        {page === "discord" && <DiscordPage />}
        {page === "obs" && <ObsPage />}
        {page === "appearance" && <AppearancePage config={draft} update={update} />}
        {page === "backup" && <BackupPage config={draft} replace={(c) => { setDraft(c); setProfileIdx(0); setSelection({ main: 0, child: null }); }} />}
      </main>

      <aside className="preview">
        <div className="preview-title">{t("set.preview", { name: profile.name })}</div>
        <div className="preview-canvas">
          {page === "items" ? (
            // Página Itens: clicar escolhe e arrastar reorganiza direto no desenho.
            <PreviewEditor
              items={previewItems}
              profile={profile}
              selection={sel}
              onSelect={setSelection}
              edit={editProfile}
              deadZonePx={draft.behavior.deadZonePx}
              render={(s) => (
                <PreviewCanvas
                  items={previewItems}
                  activeMain={s.activeMain}
                  activeSub={s.openMain === undefined ? previewSub : s.activeSub}
                  openMain={s.openMain}
                  hubHovered={false}
                  stats={stats}
                  appearance={draft.appearance}
                />
              )}
            />
          ) : (
            <PreviewCanvas
              items={previewItems}
              activeMain={previewMain}
              activeSub={previewSub}
              hubHovered={false}
              stats={stats}
              appearance={draft.appearance}
            />
          )}
        </div>
        <div className="preview-hotkey">
          {draft.launcher.mode === "orb" ? (
            <>{t("set.preview.orbPre")} <strong>{t("set.preview.orbIcon")}</strong></>
          ) : (
            <>
              {t("set.preview.hotkey")} <kbd>{draft.hotkey.accelerator}</kbd> · {t(draft.hotkey.mode === "hold" ? "set.preview.hold" : "set.preview.press")}
              {draft.launcher.mode === "both" && <> · {t("set.preview.orToo")}</>}
            </>
          )}
        </div>
      </aside>

      <footer className="savebar">
        {errors.length > 0 ? (
          <details className="savebar-errors">
            <summary><AlertTriangle size={14} /> {errors.length === 1 ? t("set.errors.one") : t("set.errors.many", { n: errors.length })}</summary>
            <ul>{errors.map((e) => <li key={e}>{e}</li>)}</ul>
          </details>
        ) : status ? (
          <span className={status.ok ? "inline-ok" : "inline-error"}>{status.text}</span>
        ) : (
          <span className="muted">{dirty ? t("set.dirty") : t("set.clean")}</span>
        )}
        <div className="savebar-actions">
          <button type="button" className="btn btn-ghost" disabled={!dirty} onClick={() => { setDraft(structuredClone(saved!)); setStatus(null); }}>
            <Undo2 size={14} /> {t("set.discard")}
          </button>
          <button type="button" className="btn btn-primary" disabled={!dirty || errors.length > 0 || saving} onClick={save}>
            <Save size={14} /> {saving ? t("set.saving") : t("set.save")}
          </button>
        </div>
      </footer>
    </div>
  );
}
