import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties } from "react";
import { useConfig } from "../hooks/useConfig";
import { useSystemStats } from "../hooks/useSystemStats";
import { describeAction, getVolume, hideMenu, isTauri, nowPlaying as fetchNowPlaying, type NowPlaying, onEvent, runAction, type MenuShowPayload } from "../shared/ipc";
import { observeLongTasks, perfLog, startFrameMonitor } from "../shared/perf";
import type { Config, MenuItem } from "../shared/types";
import { clearSoundCache, playSound } from "../shared/sound";
import { resolveItems } from "./dynamic";
import { useIconFiles } from "../shared/iconFiles";
import { useDynamicSources } from "./useDynamicSources";
import { LAYOUT, hitTest, sliceAngle, type Hit } from "./geometry";
import { RadialCanvas } from "./RadialCanvas";

const CONFIRM: Record<string, string> = {
  shutdown: "Desligar o computador agora?",
  restart: "Reiniciar o computador agora?",
  signout: "Encerrar a sessão agora?",
};

/** Intervalo de atualização do "Tocando agora" com o menu aberto. */
export const MEDIA_POLL_MS = 2000;
/** Quanto tempo o arco de volume fica visível após girar a roda. */
export const VOLUME_SHOW_MS = 1200;

/** Quanto tempo o aviso (toast) fica na tela após o último aviso. */
export const TOAST_MS = 2200;

/** Duração da animação de recolher para o ícone (igual a .is-closing em radial.css). */
export const CLOSE_TO_ORB_MS = 170;

const prefersReducedMotion = () =>
  typeof window !== "undefined" && !!window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;

type Point = { x: number; y: number };

/** Clique além deste raio (em px do canvas) fecha o menu em vez de escolher uma fatia. */
const OUTSIDE_RADIUS = LAYOUT.subOuter + 60;

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
  const [media, setMedia] = useState<NowPlaying | null>(null);
  const [volume, setVolume] = useState<number | null>(null);
  const volumeTimer = useRef<number | null>(null);
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
  const [toast, setToast] = useState<{ text: string; error?: boolean } | null>(null);
  const stats = useSystemStats();

  const children: MenuItem[] = openMain !== null ? items[openMain]?.children ?? [] : [];

  // Refs para os handlers globais lerem o estado atual sem re-registrar listeners.
  const state = useRef({ activeMain, activeSub, openMain, children, center, items, open, origin });
  state.current = { activeMain, activeSub, openMain, children, center, items, open, origin };

  const reset = useCallback(() => {
    setActiveMain(null);
    setActiveSub(null);
    setOpenMain(null);
    setHubHovered(false);
  }, []);

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

  const toastTimer = useRef<number | null>(null);
  useEffect(() => () => void (toastTimer.current !== null && window.clearTimeout(toastTimer.current)), []);
  /** Mostra um aviso por 2,2 s contados do ÚLTIMO aviso (cliques repetidos renovam o prazo). */
  const flash = useCallback((text: string, error = false) => {
    setToast({ text, error });
    if (toastTimer.current !== null) window.clearTimeout(toastTimer.current);
    toastTimer.current = window.setTimeout(() => {
      toastTimer.current = null;
      setToast(null);
    }, TOAST_MS);
  }, []);

  const execute = useCallback(
    async (item: MenuItem | undefined) => {
      const action = item?.action;
      if (!item || !action) return;
      if (action.type === "system" && CONFIRM[action.cmd] && !window.confirm(CONFIRM[action.cmd])) return;
      void playSound("execute", soundsRef.current);
      try {
        // No Tauri o backend esconde o menu antes de agir (e devolve o foco ao app anterior).
        await runAction(action);
        // Mídia mantém o menu aberto (backend não o esconde): mostra um retorno rápido.
        if (!isTauri() || action.type === "media") flash(`${item.label}: ${describeAction(action)}`);
      } catch (e) {
        flash(`Falha em ${item.label}: ${String(e)}`, true);
      }
    },
    [flash],
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

  // "Tocando agora": lê ao abrir e a cada 2 s enquanto o menu está aberto.
  useEffect(() => {
    if (!open || !showMedia) return void setMedia(null);
    let alive = true;
    const load = () =>
      fetchNowPlaying().then(
        (m) => alive && setMedia(m),
        (e) => perfLog(`falha ao ler mídia: ${String(e)}`),
      );
    void load();
    const t = window.setInterval(load, MEDIA_POLL_MS);
    return () => {
      alive = false;
      window.clearInterval(t);
    };
  }, [open, openKey, showMedia]);

  useEffect(() => () => void (volumeTimer.current !== null && window.clearTimeout(volumeTimer.current)), []);

  /** Roda sobre o centro: ajusta o volume e mostra o arco por um instante. */
  const nudgeVolume = useCallback(async (up: boolean) => {
    try {
      await runAction({ type: "media", cmd: up ? "volup" : "voldown" });
      const v = await getVolume();
      setVolume(v.muted ? 0 : v.level);
    } catch (e) {
      perfLog(`falha ao ajustar volume: ${String(e)}`);
    }
    if (volumeTimer.current !== null) window.clearTimeout(volumeTimer.current);
    volumeTimer.current = window.setTimeout(() => {
      volumeTimer.current = null;
      setVolume(null);
    }, VOLUME_SHOW_MS);
  }, []);


  // --- Diagnóstico de desempenho (perf.log) ---
  const showReceivedAt = useRef<number | null>(null);
  useEffect(() => {
    if (isTauri()) observeLongTasks();
  }, []);
  useEffect(() => {
    if (!open || !isTauri()) return;
    const t0 = showReceivedAt.current;
    // Dois rAF: o segundo roda depois que o primeiro quadro com o menu foi pintado.
    requestAnimationFrame(() =>
      requestAnimationFrame(() => {
        if (t0 !== null) perfLog(`primeiro quadro pintado ${(performance.now() - t0).toFixed(0)} ms após receber menu:show`);
      }),
    );
    const stop = startFrameMonitor();
    return () => {
      const s = stop();
      perfLog(
        `menu aberto por ${(s.durationMs / 1000).toFixed(1)} s: ${s.frames} quadros, ` +
          `maior intervalo ${s.maxGapMs.toFixed(0)} ms, ${s.janky} quadros travados (>50 ms)`,
      );
    };
  }, [open, openKey]);

  // --- Eventos do backend (Tauri) ---
  useEffect(() => {
    const offs = [
      onEvent<MenuShowPayload>("menu:show", (p) => {
        showReceivedAt.current = performance.now();
        if (p.sentAt) perfLog(`evento menu:show chegou ${Date.now() - p.sentAt} ms após ser emitido pelo Rust`);
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
        // Já executou a seleção atual com clique (ex.: volume +): soltar o atalho só fecha.
        const st = state.current;
        const sel = st.activeSub !== null ? st.children[st.activeSub] : st.activeMain !== null ? st.items[st.activeMain] : undefined;
        if (sel && sel.id === clickedId.current) return close();
        executeSelection(true);
      }),
    ];
    return () => offs.forEach((p) => p.then((off) => off()));
  }, [cancelClosing, close, executeSelection, reset, showAt]);

  // --- Mouse / teclado / roda ---
  useEffect(() => {
    const onMove = (e: PointerEvent) => {
      if (!state.current.open) return;
      const hit = computeHit(e.clientX, e.clientY);
      setHubHovered(hit.ring === "center");
      if (hit.ring === "main") {
        setActiveMain(hit.index);
        setActiveSub(null);
      } else if (hit.ring === "sub") {
        setActiveSub(hit.index);
      }
    };

    const onUp = (e: PointerEvent) => {
      if (e.button !== 0 || !state.current.open) return;
      const s = state.current;
      const hit = computeHit(e.clientX, e.clientY);
      if (hit.r > OUTSIDE_RADIUS) return close();
      if (hit.ring === "center") {
        if (s.openMain !== null) closeSub();
        else close();
      } else if (hit.ring === "sub") {
        clickedId.current = s.children[hit.index]?.id ?? null;
        void execute(s.children[hit.index]);
      } else {
        const item = s.items[hit.index];
        if (item?.children?.length) {
          // Clique na fatia abre o sub-anel; clicar de novo na mesma fecha.
          if (s.openMain === hit.index) closeSub();
          else openSub(hit.index, false);
        } else if (item?.action) {
          clickedId.current = item.id;
          void execute(item);
        }
      }
    };

    const onKey = (e: KeyboardEvent) => {
      const s = state.current;
      if (!s.open) return;
      // 1–9 (linha de números ou teclado numérico): escolhe a fatia/subitem direto.
      const digit = /^(Digit|Numpad)([1-9])$/.exec(e.code)?.[2];
      if (digit && !e.ctrlKey && !e.altKey && !e.metaKey) {
        const n = Number(digit) - 1;
        e.preventDefault();
        if (s.openMain !== null && s.children.length) {
          const child = s.children[n];
          if (!child) return;
          setActiveSub(n);
          return void execute(child);
        }
        const item = s.items[n];
        if (!item) return;
        setActiveMain(n);
        if (item.children?.length) return openSub(n, false);
        return void execute(item);
      }
      const n = s.items.length;
      const step = (d: number) => {
        if (s.openMain !== null && s.children.length) {
          setActiveSub(((s.activeSub ?? (d > 0 ? -1 : 0)) + d + s.children.length) % s.children.length);
        } else {
          setActiveMain(((s.activeMain ?? (d > 0 ? -1 : 0)) + d + n) % n);
          setActiveSub(null);
        }
      };
      switch (e.key) {
        case "Escape": if (s.openMain !== null) closeSub(); else close(); break;
        case "ArrowRight": case "ArrowDown": step(1); break;
        case "ArrowLeft": case "ArrowUp": step(-1); break;
        case "Backspace": if (s.openMain !== null) closeSub(); break;
        case "Enter": case " ": {
          const main = s.activeMain !== null ? s.items[s.activeMain] : undefined;
          if (s.openMain === null && main?.children?.length) openSub(s.activeMain!, true);
          else if (s.openMain !== null && s.activeSub === null) setActiveSub(0);
          else executeSelection(false);
          break;
        }
        default: return;
      }
      e.preventDefault();
    };

    const onWheel = (e: WheelEvent) => {
      const s = state.current;
      if (!s.open) return;
      const d = e.deltaY > 0 ? 1 : -1;
      // Roda sobre o centro: volume (para cima = aumenta), em vez de girar a seleção.
      if (computeHit(e.clientX, e.clientY).ring === "center") return void nudgeVolume(d < 0);
      if (s.openMain !== null && s.children.length) {
        setActiveSub(((s.activeSub ?? -1) + d + s.children.length) % s.children.length);
      } else {
        setActiveMain(((s.activeMain ?? 0) + d + s.items.length) % s.items.length);
      }
    };

    // No navegador: botão direito reabre o menu na posição do mouse (simula o atalho global).
    const onContext = (e: MouseEvent) => {
      e.preventDefault();
      if (!isTauri()) showAt(e.clientX, e.clientY);
    };

    const onBlur = () => {
      if (isTauri() && config.behavior.closeOnBlur && state.current.open) close();
    };

    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
    window.addEventListener("keydown", onKey);
    window.addEventListener("wheel", onWheel, { passive: true });
    window.addEventListener("contextmenu", onContext);
    window.addEventListener("blur", onBlur);
    return () => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("wheel", onWheel);
      window.removeEventListener("contextmenu", onContext);
      window.removeEventListener("blur", onBlur);
    };
  }, [close, closeSub, computeHit, config.behavior.closeOnBlur, execute, executeSelection, nudgeVolume, openSub, showAt]);

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
