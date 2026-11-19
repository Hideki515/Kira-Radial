import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties } from "react";
import { useConfig } from "../hooks/useConfig";
import { useSystemStats } from "../hooks/useSystemStats";
import { describeAction, hideMenu, isTauri, onEvent, runAction, type MenuShowPayload } from "../shared/ipc";
import type { Config, MenuItem } from "../shared/types";
import { clearSoundCache, playSound } from "../shared/sound";
import { resolveItems } from "./dynamic";
import { useIconFiles } from "../shared/iconFiles";
import { invalidateDynamic, kindChangedBy, useDynamicSources } from "./useDynamicSources";
import { LAYOUT, hitTest, sliceAngle, type Hit } from "./geometry";
import { RadialCanvas } from "./RadialCanvas";
import { useNowPlaying, useOpenDiagnostics, useToast, useVolumeNudge } from "./menuHooks";
import { CONFIRM, ConfirmDialog } from "./ConfirmDialog";
import { useLabelPrewarm } from "./labelLayout";
import type { MenuControls, MenuState, Point } from "./menuControls";
import { useConfirm } from "./useConfirm";
import { useKnobInput } from "./useKnobInput";
import { useMenuInput } from "./useMenuInput";

export { MEDIA_POLL_MS, TOAST_MS, VOLUME_SHOW_MS } from "./menuHooks";


/** Duração da animação de recolher para o ícone (igual a .is-closing em radial.css). */
export const CLOSE_TO_ORB_MS = 170;
const prefersReducedMotion = () =>
  typeof window !== "undefined" && !!window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;


export function RadialApp() {
  const config = useConfig();
  return config ? <RadialMenu config={config} /> : null;
}

function initialSelection(items: MenuItem[]): [number | null, number | null] {
  // QA visual no navegador: ?select=<id da fatia>&sub=<índice> pré-seleciona um estado.
  if (isTauri()) return [null, null];
  const q = new URLSearchParams(location.search);
  const i = items.findIndex((it) => it.id === q.get("select"));
  const s = q.get("sub");
  return [i >= 0 ? i : null, i >= 0 && s !== null && !Number.isNaN(Number(s)) ? Number(s) : null];
}

function RadialMenu({ config }: { config: Config }) {
  const [profileId, setProfileId] = useState(config.profiles[0].id);
  const profile = config.profiles.find((p) => p.id === profileId) ?? config.profiles[0];
  const showMedia = config.appearance.showMedia !== false;
  /** Config de sons sempre atual para os callbacks estáveis. */
  const soundsRef = useRef(config.appearance.sounds);
  soundsRef.current = config.appearance.sounds;
  // Configuração de sons mudou (salva nas Configurações): relê os arquivos próprios.
  const soundsKey = JSON.stringify(config.appearance.sounds ?? null);
  useEffect(() => clearSoundCache(), [soundsKey]);
  const scale = config.appearance.scale;

  const [center, setCenter] = useState(() => ({ x: window.innerWidth / 2, y: window.innerHeight / 2 }));
  const [open, setOpen] = useState(!isTauri());
  const [openKey, setOpenKey] = useState(0);
  // Submenus automáticos (áudio, janelas, energia...): relidos a cada abertura.
  const sources = useDynamicSources(profile.items, open, openKey);
  const resolved = useMemo(() => resolveItems(profile.items, sources), [profile.items, sources]);
  // Ícones próprios (iconFile) viram imagem assim que carregam.
  const items = useIconFiles(resolved);
  /** Aberto pelo ícone: ponto (px da janela) de onde o menu nasce e para onde se recolhe. */
  const [origin, setOrigin] = useState<Point | null>(null);
  /** Animação de recolher em andamento (o menu já não aceita entrada). */
  const [closing, setClosing] = useState(false);
  const closeTimer = useRef<number | null>(null);
  /** Item executado por clique desde que o menu abriu (modo "segurar": soltar o atalho não repete). */
  const clickedId = useRef<string | null>(null);
  // Desmontou no meio do recolhimento: não deixa o timer chamar hideMenu depois.
  useEffect(
    () => () => {
      if (closeTimer.current !== null) window.clearTimeout(closeTimer.current);
      closeTimer.current = null;
    },
    [],
  );
  const [activeMain, setActiveMain] = useState<number | null>(() => initialSelection(items)[0]);
  const [activeSub, setActiveSub] = useState<number | null>(() => initialSelection(items)[1]);
  /** Fatia cujo sub-anel está aberto (abre com clique/Enter; Esc/Backspace volta ao anel principal). */
  const [openMain, setOpenMain] = useState<number | null>(() => (initialSelection(items)[1] !== null ? initialSelection(items)[0] : null));
  const [hubHovered, setHubHovered] = useState(false);
  const stats = useSystemStats();
  const media = useNowPlaying(open, openKey, showMedia);
  const { volume, nudgeVolume } = useVolumeNudge();
  const { toast, flash } = useToast();
  const markShow = useOpenDiagnostics(open, openKey);

  const children: MenuItem[] = openMain !== null ? items[openMain]?.children ?? [] : [];

  // Refs para os handlers globais lerem o estado atual sem re-registrar listeners.
  const state = useRef<MenuState>({ activeMain, activeSub, openMain, children, center, items, open, origin });
  state.current = { activeMain, activeSub, openMain, children, center, items, open, origin };

  /** Desligar/reiniciar/sair aguardando confirmação (diálogo sobre o menu). */
  const confirm = useConfirm();
  const { ask: askConfirm, cancel: cancelConfirm, ready: confirmReady, ref: confirmRef } = confirm;

  const reset = useCallback(() => {
    setActiveMain(null);
    setActiveSub(null);
    setOpenMain(null);
    setHubHovered(false);
    cancelConfirm();
  }, [cancelConfirm]);

  const openSub = useCallback((index: number, selectFirst: boolean) => {
    setActiveMain(index);
    setOpenMain(index);
    setActiveSub(selectFirst ? 0 : null);
  }, []);

  /** Fecha o sub-anel e volta ao principal, mantendo a fatia-pai destacada. */
  const closeSub = useCallback(() => {
    const parent = state.current.openMain;
    setOpenMain(null);
    setActiveSub(null);
    if (parent !== null) setActiveMain(parent);
  }, []);

  const cancelClosing = useCallback(() => {
    if (closeTimer.current !== null) window.clearTimeout(closeTimer.current);
    closeTimer.current = null;
    setClosing(false);
  }, []);

  const showAt = useCallback((x: number, y: number, from: Point | null = null) => {
    cancelClosing();
    setCenter({ x, y });
    setOrigin(from);
    clickedId.current = null;
    void playSound("open", soundsRef.current);
    reset();
    setOpen(true);
    setOpenKey((k) => k + 1);
  }, [cancelClosing, reset]);

  const close = useCallback(() => {
    void playSound("close", soundsRef.current);
    const animate = state.current.origin !== null && !prefersReducedMotion();
    setOpen(false);
    reset();
    if (!animate) return void hideMenu();
    // Aberto pelo ícone: recolhe de volta para ele e só então esconde a janela.
    setClosing(true);
    if (closeTimer.current !== null) window.clearTimeout(closeTimer.current);
    closeTimer.current = window.setTimeout(() => {
      closeTimer.current = null;
      setClosing(false);
      void hideMenu();
    }, CLOSE_TO_ORB_MS);
  }, [reset]);

  const execute = useCallback(
    async (item: MenuItem | undefined, confirmed = false) => {
      const action = item?.action;
      if (!item || !action) return;
      if (action.type === "system" && CONFIRM[action.cmd] && !confirmed) {
        // Pede confirmação no próprio menu; o botão perigoso começa destacado (Enter confirma).
        askConfirm(item);
        return;
      }
      cancelConfirm();
      void playSound("execute", soundsRef.current);
      try {
        // No Tauri o backend esconde o menu antes de agir (e devolve o foco ao app anterior).
        await runAction(action);
        // Brilho/plano/rádio mudaram: a próxima abertura relê (não usa o que estava guardado).
        const stale = kindChangedBy(action);
        if (stale) invalidateDynamic(stale);
        // Mídia mantém o menu aberto (backend não o esconde): mostra um retorno rápido.
        if (!isTauri() || action.type === "media") flash(`${item.label}: ${describeAction(action)}`);
      } catch (e) {
        flash(`Falha em ${item.label}: ${String(e)}`, true);
      }
    },
    [flash, askConfirm, cancelConfirm],
  );

  /** Executa o que está selecionado agora (Enter, ou soltar a tecla no modo "segurar"). */
  const executeSelection = useCallback((closeIfNothing: boolean) => {
    const s = state.current;
    if (s.activeSub !== null) return void execute(s.children[s.activeSub]);
    const item = s.activeMain !== null ? s.items[s.activeMain] : undefined;
    if (item?.action) return void execute(item);
    // Modo "segurar": soltar sobre uma fatia com submenu abre o sub-anel em vez de fechar.
    if (item?.children?.length && s.activeMain !== s.openMain) return openSub(s.activeMain!, false);
    if (closeIfNothing) close();
  }, [close, execute, openSub]);

  const computeHit = useCallback(
    (clientX: number, clientY: number): Hit & { r: number } => {
      const s = state.current;
      const dx = (clientX - s.center.x) / scale;
      const dy = (clientY - s.center.y) / scale;
      const sub = s.openMain !== null && s.children.length
        ? { parentAngle: sliceAngle(s.openMain, s.items.length), count: s.children.length }
        : null;
      return { ...hitTest(dx, dy, s.items.length, config.behavior.deadZonePx, sub), r: Math.hypot(dx, dy) };
    },
    [config.behavior.deadZonePx, scale],
  );


  // Som ao passar por uma fatia/subitem (desligado por padrão).
  useEffect(() => {
    if (open && (activeMain !== null || activeSub !== null)) void playSound("hover", soundsRef.current);
  }, [open, activeMain, activeSub]);

  useLabelPrewarm(config);

  // --- Eventos do backend (Tauri) ---
  useEffect(() => {
    const offs = [
      onEvent<MenuShowPayload>("menu:show", (p) => {
        markShow(p);
        setProfileId(p.profileId);
        const from = p.originX != null && p.originY != null ? { x: p.originX, y: p.originY } : null;
        showAt(p.cx, p.cy, from);
      }),
      onEvent<null>("menu:hide", () => {
        cancelClosing();
        setOpen(false);
        reset();
      }),
      // Modo "segurar": soltar o atalho executa a fatia sob o cursor.
      onEvent<null>("menu:release", () => {
        if (confirmRef.current.item) return;
        // Já executou a seleção atual com clique (ex.: volume +): soltar o atalho só fecha.
        const st = state.current;
        const sel = st.activeSub !== null ? st.children[st.activeSub] : st.activeMain !== null ? st.items[st.activeMain] : undefined;
        if (sel && sel.id === clickedId.current) return close();
        executeSelection(true);
      }),
    ];
    return () => offs.forEach((p) => p.then((off) => off()));
  }, [cancelClosing, close, confirmRef, executeSelection, markShow, reset, showAt]);

  // --- Entrada: mouse/teclado/roda e knob ---
  const controls: MenuControls = {
    state, confirm, clickedId, setActiveMain, setActiveSub, setHubHovered, openSub, closeSub, close, showAt, execute, executeSelection,
    computeHit, nudgeVolume, closeOnBlur: config.behavior.closeOnBlur,
  };
  useMenuInput(controls);
  useKnobInput(controls);

  const px = LAYOUT.size * scale;
  const style = {
    left: center.x - px / 2,
    top: center.y - px / 2,
    width: px,
    height: px,
    "--active": config.appearance.accent,
    // Aberto pelo ícone: deslocamento/escala iniciais = o próprio ícone (ver .is-from-orb).
    ...(origin && {
      "--from-x": `${origin.x - center.x}px`,
      "--from-y": `${origin.y - center.y}px`,
      "--from-s": Math.min(1, config.launcher.orb.size / px),
    }),
  } as CSSProperties;
  const rootClass = `radial-root${origin ? " is-from-orb" : ""}${closing ? " is-closing" : ""}`;

  return (
    <>
      {(open || closing) && (
        <div key={openKey} className={rootClass} style={style} data-testid="radial-root">
          <RadialCanvas
            items={items}
            activeMain={activeMain}
            activeSub={activeSub}
            openMain={openMain}
            hubHovered={hubHovered}
            stats={stats}
            nowPlaying={media}
            volume={volume}
            appearance={config.appearance}
          />
        </div>
      )}
      {confirm.item?.action?.type === "system" && (
        <ConfirmDialog
          cmd={confirm.item.action.cmd}
          choice={confirm.choice}
          onChoice={confirm.setChoice}
          onConfirm={() => confirmReady() && void execute(confirm.item!, true)}
          onCancel={cancelConfirm}
          x={center.x}
          y={center.y}
        />
      )}
      {toast && (
        <div className={`toast${toast.error ? " is-error" : ""}`} style={{ left: center.x, top: center.y + (LAYOUT.subOuter + 30) * scale }}>
          {toast.text}
        </div>
      )}
      {!isTauri() && (
        <div className="dev-hint">
          Modo navegador · <kbd>botão direito</kbd> abre no cursor · <kbd>Esc</kbd> fecha · setas/roda navegam ·{" "}
          <a href="/settings.html" target="_blank" rel="noreferrer">configurações</a>
        </div>
      )}
    </>
  );
}
