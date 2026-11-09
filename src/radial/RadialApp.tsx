import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties } from "react";
import { useConfig } from "../hooks/useConfig";
import { useSystemStats } from "../hooks/useSystemStats";
import { describeAction, hideMenu, isTauri, listAudioOutputs, onEvent, runAction, type AudioDevice, type MenuShowPayload } from "../shared/ipc";
import { observeLongTasks, perfLog, startFrameMonitor } from "../shared/perf";
import type { Config, MenuItem } from "../shared/types";
import { hasDynamic, resolveItems } from "./dynamic";
import { LAYOUT, hitTest, sliceAngle, type Hit } from "./geometry";
import { RadialCanvas } from "./RadialCanvas";

const CONFIRM: Record<string, string> = {
  shutdown: "Desligar o computador agora?",
  restart: "Reiniciar o computador agora?",
  signout: "Encerrar a sessão agora?",
};

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
  const [audio, setAudio] = useState<AudioDevice[] | null>(null);
  const items = useMemo(() => resolveItems(profile.items, audio), [profile.items, audio]);
  const wantsAudio = hasDynamic(profile.items, "audioOutputs");
  const scale = config.appearance.scale;

  const [center, setCenter] = useState(() => ({ x: window.innerWidth / 2, y: window.innerHeight / 2 }));
  const [open, setOpen] = useState(!isTauri());
  const [openKey, setOpenKey] = useState(0);
  const [activeMain, setActiveMain] = useState<number | null>(() => initialSelection(items)[0]);
  const [activeSub, setActiveSub] = useState<number | null>(() => initialSelection(items)[1]);
  /** Fatia cujo sub-anel está aberto (abre com clique/Enter; Esc/Backspace volta ao anel principal). */
  const [openMain, setOpenMain] = useState<number | null>(() => (initialSelection(items)[1] !== null ? initialSelection(items)[0] : null));
  const [hubHovered, setHubHovered] = useState(false);
  const [toast, setToast] = useState<{ text: string; error?: boolean } | null>(null);
  const stats = useSystemStats();

  const children: MenuItem[] = openMain !== null ? items[openMain]?.children ?? [] : [];

  // Refs para os handlers globais lerem o estado atual sem re-registrar listeners.
  const state = useRef({ activeMain, activeSub, openMain, children, center, items, open });
  state.current = { activeMain, activeSub, openMain, children, center, items, open };

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

  const showAt = useCallback((x: number, y: number) => {
    setCenter({ x, y });
    reset();
    setOpen(true);
    setOpenKey((k) => k + 1);
  }, [reset]);

  const close = useCallback(() => {
    setOpen(false);
    reset();
    void hideMenu();
  }, [reset]);

  const flash = useCallback((text: string, error = false) => {
    setToast({ text, error });
    window.setTimeout(() => setToast((t) => (t?.text === text ? null : t)), 2200);
  }, []);

  const execute = useCallback(
    async (item: MenuItem | undefined) => {
      const action = item?.action;
      if (!item || !action) return;
      if (action.type === "system" && CONFIRM[action.cmd] && !window.confirm(CONFIRM[action.cmd])) return;
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

  // Submenu dinâmico de áudio: relê as saídas a cada abertura (fones podem ter sido ligados/desligados).
  useEffect(() => {
    if (!open || !wantsAudio) return;
    let alive = true;
    listAudioOutputs()
      .then((d) => alive && setAudio(d))
      .catch((e) => {
        if (alive) setAudio([]);
        perfLog(`falha ao listar saídas de áudio: ${String(e)}`);
      });
    return () => {
      alive = false;
    };
  }, [open, openKey, wantsAudio]);

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
        showAt(p.cx, p.cy);
      }),
      onEvent<null>("menu:hide", () => {
        setOpen(false);
        reset();
      }),
      // Modo "segurar": soltar o atalho executa a fatia sob o cursor.
      onEvent<null>("menu:release", () => executeSelection(true)),
    ];
    return () => offs.forEach((p) => p.then((off) => off()));
  }, [executeSelection, reset, showAt]);

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
        void execute(s.children[hit.index]);
      } else {
        const item = s.items[hit.index];
        if (item?.children?.length) {
          // Clique na fatia abre o sub-anel; clicar de novo na mesma fecha.
          if (s.openMain === hit.index) closeSub();
          else openSub(hit.index, false);
        } else if (item?.action) void execute(item);
      }
    };

    const onKey = (e: KeyboardEvent) => {
      const s = state.current;
      if (!s.open) return;
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
  }, [close, closeSub, computeHit, config.behavior.closeOnBlur, execute, executeSelection, openSub, showAt]);

  const px = LAYOUT.size * scale;
  const style = {
    left: center.x - px / 2,
    top: center.y - px / 2,
    width: px,
    height: px,
    "--active": config.appearance.accent,
  } as CSSProperties;

  return (
    <>
      {open && (
        <div key={openKey} className="radial-root" style={style}>
          <RadialCanvas
            items={items}
            activeMain={activeMain}
            activeSub={activeSub}
            openMain={openMain}
            hubHovered={hubHovered}
            stats={stats}
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
