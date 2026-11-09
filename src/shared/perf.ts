// Diagnóstico de desempenho do menu. As medições vão para %APPDATA%\Kira-Radial\perf.log
// (via comando "perf_log"); no navegador, para o console.
import { isTauri } from "./ipc";

export function perfLog(msg: string): void {
  if (!isTauri()) {
    console.debug(`[perf] ${msg}`);
    return;
  }
  import("@tauri-apps/api/core")
    .then((c) => c.invoke("perf_log", { msg }))
    .catch(() => {});
}

let observing = false;

/** Registra tarefas que bloqueiam a thread da página por mais de 50 ms. */
export function observeLongTasks(): void {
  if (observing || typeof PerformanceObserver === "undefined") return;
  observing = true;
  try {
    new PerformanceObserver((list) => {
      for (const e of list.getEntries()) {
        perfLog(`tarefa longa: ${e.duration.toFixed(0)} ms (t=${e.startTime.toFixed(0)})`);
      }
    }).observe({ type: "longtask", buffered: true });
  } catch {
    /* sem suporte */
  }
  document.addEventListener("visibilitychange", () =>
    perfLog(`visibilidade da página: ${document.visibilityState} (t=${performance.now().toFixed(0)})`),
  );
}

export interface FrameStats {
  frames: number;
  durationMs: number;
  maxGapMs: number;
  janky: number;
}

/** Mede o intervalo entre quadros enquanto o menu está aberto. Retorna a função que encerra. */
export function startFrameMonitor(): () => FrameStats {
  const start = performance.now();
  let last = start;
  let frames = 0;
  let maxGap = 0;
  let janky = 0;
  let id = 0;
  const loop = (t: number) => {
    const gap = t - last;
    last = t;
    if (frames > 0) {
      if (gap > maxGap) maxGap = gap;
      if (gap > 50) janky++;
    }
    frames++;
    id = requestAnimationFrame(loop);
  };
  id = requestAnimationFrame(loop);
  return () => {
    cancelAnimationFrame(id);
    return { frames, durationMs: performance.now() - start, maxGapMs: maxGap, janky };
  };
}
