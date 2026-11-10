// Diagnóstico de desempenho do menu. As medições vão para %APPDATA%\Kira-Radial\perf.log
// (via comando "perf_log"); no navegador, para o console.
import { isTauri } from "./ipc";

export type LogLevel = "info" | "warn" | "error";

/** Grava no log do app (kira.log). `source` identifica a janela (radial, settings, orb). */
export function perfLog(msg: string, level: LogLevel = "info", source?: string): void {
  if (!isTauri()) {
    (level === "error" ? console.error : console.debug)(`[${source ?? "front"}] ${msg}`);
    return;
  }
  import("@tauri-apps/api/core")
    .then((c) => c.invoke("perf_log", { msg, level, source: source ?? null }))
    .catch(() => {});
}

let installed = false;
/** Erros não tratados da página (exceções e promises rejeitadas) vão para o log. */
export function installErrorLogging(source: string): void {
  if (installed || typeof window === "undefined") return;
  installed = true;
  window.addEventListener("error", (e) => perfLog(`erro: ${e.message} (${e.filename?.split("/").pop() ?? "?"}:${e.lineno})`, "error", source));
  window.addEventListener("unhandledrejection", (e) => perfLog(`promise rejeitada: ${String(e.reason)}`, "error", source));
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
