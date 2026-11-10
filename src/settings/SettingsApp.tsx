import { CircleDot, Orbit, Stethoscope, Keyboard, LayoutGrid, Palette, Save, Settings2, Undo2, Users, Archive, AlertTriangle } from "lucide-react";
import { useCallback, useEffect, useMemo, useState, type CSSProperties } from "react";
import { useSystemStats } from "../hooks/useSystemStats";
import { getConfig, getHotkeyError, saveConfig } from "../shared/ipc";
import { wantsOrb, type Config, type Profile } from "../shared/types";
import { IconPage } from "./pages/IconPage";
import { DiagnosticsPage } from "./pages/DiagnosticsPage";
import { validateConfig } from "../shared/validate";
import { RadialCanvas } from "../radial/RadialCanvas";
import { resolveItems } from "../radial/dynamic";
import { useDynamicSources } from "../radial/useDynamicSources";
import { ItemsPage, type Selection } from "./pages/ItemsPage";
import { ProfilesPage } from "./pages/ProfilesPage";
import { AppearancePage, BackupPage, GeneralPage, HotkeyPage } from "./pages/SimplePages";

type Page = "items" | "hotkey" | "icon" | "profiles" | "general" | "appearance" | "backup" | "diagnostics";

const NAV: { id: Page; label: string; icon: typeof CircleDot }[] = [
  { id: "items", label: "Itens do menu", icon: LayoutGrid },
  { id: "hotkey", label: "Atalho", icon: Keyboard },
  { id: "icon", label: "Ícone", icon: Orbit },
  { id: "profiles", label: "Perfis por app", icon: Users },
  { id: "general", label: "Geral", icon: Settings2 },
  { id: "appearance", label: "Aparência", icon: Palette },
  { id: "backup", label: "Backup", icon: Archive },
  { id: "diagnostics", label: "Diagnóstico", icon: Stethoscope },
];

export function SettingsApp() {
  const [saved, setSaved] = useState<Config | null>(null);
  const [draft, setDraft] = useState<Config | null>(null);
  const [page, setPage] = useState<Page>("items");
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
  const allItems = useMemo(() => draft?.profiles.flatMap((p) => p.items) ?? [], [draft?.profiles]);
  const sources = useDynamicSources(allItems, true, 0);

  const errors = useMemo(() => (draft ? validateConfig(draft) : []), [draft]);
  const dirty = useMemo(() => JSON.stringify(draft) !== JSON.stringify(saved), [draft, saved]);

  // Ctrl+S salva.
  const save = useCallback(async () => {
    if (!draft || errors.length || saving) return;
    setSaving(true);
    try {
      await saveConfig(draft);
      setSaved(structuredClone(draft));
      setHotkeyError(null);
      setStatus({ ok: true, text: "Configurações salvas e aplicadas." });
    } catch (e) {
      setStatus({ ok: false, text: String(e) });
    } finally {
      setSaving(false);
    }
  }, [draft, errors.length, saving]);

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

  if (!draft) return <div className="settings-loading">Carregando…</div>;

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
        {NAV.filter((n) => n.id !== "icon" || wantsOrb(draft.launcher.mode) || page === "icon").map(({ id, label, icon: Icon }) => (
          <button key={id} type="button" className={`nav-item${page === id ? " is-on" : ""}`} onClick={() => setPage(id)}>
            <Icon size={16} /> {label}
          </button>
        ))}
        <div className="sidebar-foot">v{__APP_VERSION__}</div>
      </nav>

      <main className="content">
        {hotkeyError && (
          <div className="banner-error" role="alert">
            <AlertTriangle size={16} />
            <span>
              <strong>O atalho atual não funcionou.</strong> {hotkeyError}. Escolha outra combinação em{" "}
              <button type="button" className="link" onClick={() => setPage("hotkey")}>Atalho</button> e salve.
            </span>
          </div>
        )}
        {(page === "items" || page === "profiles") && draft.profiles.length > 1 && (
          <div className="profile-picker">
            <span>Perfil</span>
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
        {page === "appearance" && <AppearancePage config={draft} update={update} />}
        {page === "backup" && <BackupPage config={draft} replace={(c) => { setDraft(c); setProfileIdx(0); setSelection({ main: 0, child: null }); }} />}
      </main>

      <aside className="preview">
        <div className="preview-title">Pré-visualização · {profile.name}</div>
        <div className="preview-canvas">
          <RadialCanvas
            items={previewItems}
            activeMain={previewMain}
            activeSub={previewSub}
            hubHovered={false}
            stats={stats}
            appearance={draft.appearance}
          />
        </div>
        <div className="preview-hotkey">
          {draft.launcher.mode === "orb" ? (
            <>Abrir clicando no <strong>ícone</strong></>
          ) : (
            <>
              Abrir com <kbd>{draft.hotkey.accelerator}</kbd> · {draft.hotkey.mode === "hold" ? "segurar e soltar" : "pressionar e clicar"}
              {draft.launcher.mode === "both" && <> · ou pelo ícone</>}
            </>
          )}
        </div>
      </aside>

      <footer className="savebar">
        {errors.length > 0 ? (
          <details className="savebar-errors">
            <summary><AlertTriangle size={14} /> {errors.length} problema(s) impedem salvar</summary>
            <ul>{errors.map((e) => <li key={e}>{e}</li>)}</ul>
          </details>
        ) : status ? (
          <span className={status.ok ? "inline-ok" : "inline-error"}>{status.text}</span>
        ) : (
          <span className="muted">{dirty ? "Alterações não salvas" : "Tudo salvo"}</span>
        )}
        <div className="savebar-actions">
          <button type="button" className="btn btn-ghost" disabled={!dirty} onClick={() => { setDraft(structuredClone(saved!)); setStatus(null); }}>
            <Undo2 size={14} /> Descartar
          </button>
          <button type="button" className="btn btn-primary" disabled={!dirty || errors.length > 0 || saving} onClick={save}>
            <Save size={14} /> {saving ? "Salvando…" : "Salvar"}
          </button>
        </div>
      </footer>
    </div>
  );
}
