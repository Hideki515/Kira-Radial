// Partes independentes do menu radial (separadas do RadialApp para facilitar leitura e teste):
// "Tocando agora", volume pela roda, avisos (toast) e medições de abertura.
import { useCallback, useEffect, useRef, useState } from "react";
import { getVolume, isTauri, nowPlaying as fetchNowPlaying, openTimeMs, reportOpenTime, runAction, type MenuShowPayload, type NowPlaying } from "../shared/ipc";
import { observeLongTasks, perfLog, startFrameMonitor } from "../shared/perf";

/** Intervalo de atualização do "Tocando agora" com o menu aberto. */
export const MEDIA_POLL_MS = 2000;
/** Quanto tempo o arco de volume fica visível após girar a roda. */
export const VOLUME_SHOW_MS = 1200;
/** Quanto tempo o aviso (toast) fica na tela após o último aviso. */
export const TOAST_MS = 2200;

/** "Tocando agora": lê ao abrir e a cada 2 s enquanto o menu está aberto. */
export function useNowPlaying(open: boolean, openKey: number, enabled: boolean): NowPlaying | null {
  const [media, setMedia] = useState<NowPlaying | null>(null);
  useEffect(() => {
    if (!open || !enabled) return void setMedia(null);
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
  }, [open, openKey, enabled]);
  return media;
}

/** Roda sobre o centro: ajusta o volume e mostra o arco por um instante. */
export function useVolumeNudge(): { volume: number | null; nudgeVolume: (up: boolean) => Promise<void> } {
  const [volume, setVolume] = useState<number | null>(null);
  const timer = useRef<number | null>(null);
  useEffect(() => () => void (timer.current !== null && window.clearTimeout(timer.current)), []);
  const nudgeVolume = useCallback(async (up: boolean) => {
    try {
      await runAction({ type: "media", cmd: up ? "volup" : "voldown" });
      const v = await getVolume();
      setVolume(v.muted ? 0 : v.level);
    } catch (e) {
      perfLog(`falha ao ajustar volume: ${String(e)}`);
    }
    if (timer.current !== null) window.clearTimeout(timer.current);
    timer.current = window.setTimeout(() => {
      timer.current = null;
      setVolume(null);
    }, VOLUME_SHOW_MS);
  }, []);
  return { volume, nudgeVolume };
}

export interface Toast {
  text: string;
  error?: boolean;
}

/** Aviso por 2,2 s contados do ÚLTIMO aviso (cliques repetidos renovam o prazo). */
export function useToast(): { toast: Toast | null; flash: (text: string, error?: boolean) => void } {
  const [toast, setToast] = useState<Toast | null>(null);
  const timer = useRef<number | null>(null);
  useEffect(() => () => void (timer.current !== null && window.clearTimeout(timer.current)), []);
  const flash = useCallback((text: string, error = false) => {
    setToast({ text, error });
    if (timer.current !== null) window.clearTimeout(timer.current);
    timer.current = window.setTimeout(() => {
      timer.current = null;
      setToast(null);
    }, TOAST_MS);
  }, []);
  return { toast, flash };
}

/**
 * Diagnóstico de desempenho de cada abertura (kira.log e Configurações → Diagnóstico):
 * tempo até o primeiro quadro, tempo total de abertura e quadros travados.
 * Chame `markShow` ao receber o evento menu:show.
 */
export function useOpenDiagnostics(open: boolean, openKey: number): (p: MenuShowPayload) => void {
  const receivedAt = useRef<number | null>(null);
  /** Dados do último menu:show para medir o tempo total de abertura (uma vez por abertura). */
  const timing = useRef<Pick<MenuShowPayload, "sentAt" | "prepMs"> | null>(null);
  useEffect(() => {
    if (isTauri()) observeLongTasks();
  }, []);
  useEffect(() => {
    if (!open || !isTauri()) return;
    const t0 = receivedAt.current;
    const tm = timing.current;
    timing.current = null;
    // Dois rAF: o segundo roda depois que o primeiro quadro com o menu foi pintado.
    requestAnimationFrame(() =>
      requestAnimationFrame(() => {
        if (t0 !== null) perfLog(`primeiro quadro pintado ${(performance.now() - t0).toFixed(0)} ms após receber menu:show`);
        const total = tm ? openTimeMs(tm) : null;
        if (total !== null) void reportOpenTime(total);
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
  return useCallback((p: MenuShowPayload) => {
    receivedAt.current = performance.now();
    timing.current = { sentAt: p.sentAt, prepMs: p.prepMs };
    if (p.sentAt) perfLog(`evento menu:show chegou ${Date.now() - p.sentAt} ms após ser emitido pelo Rust`);
  }, []);
}
