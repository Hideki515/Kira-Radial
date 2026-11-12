import { afterEach, describe, expect, it, vi } from "vitest";
import { describeCspViolation, installErrorLogging, perfLog, startFrameMonitor } from "./perf";

// Fora do Tauri (jsdom) o log vai para o console: dá para conferir sem backend.

afterEach(() => vi.restoreAllMocks());

describe("perf › log e erros da página", () => {
  it("fora do Tauri: erro vai para console.error, o resto para console.debug", () => {
    const err = vi.spyOn(console, "error").mockImplementation(() => {});
    const dbg = vi.spyOn(console, "debug").mockImplementation(() => {});
    perfLog("algo falhou", "error", "settings");
    perfLog("medida");
    expect(err).toHaveBeenCalledWith("[settings] algo falhou");
    expect(dbg).toHaveBeenCalledWith("[front] medida");
  });

  it("erros, promises rejeitadas e bloqueios da CSP vão para o log (instala uma vez só)", () => {
    const err = vi.spyOn(console, "error").mockImplementation(() => {});
    installErrorLogging("radial");
    installErrorLogging("radial");
    window.dispatchEvent(Object.assign(new Event("error"), { message: "boom", filename: "http://x/assets/main.js", lineno: 7 }));
    window.dispatchEvent(Object.assign(new Event("unhandledrejection"), { reason: "sem resposta" }));
    window.dispatchEvent(
      Object.assign(new Event("securitypolicyviolation"), { effectiveDirective: "img-src", blockedURI: "https://mal.example/x.png", sourceFile: "", lineNumber: 0 }),
    );
    expect(err.mock.calls.map((c) => c[0])).toEqual([
      "[radial] erro: boom (main.js:7)",
      "[radial] promise rejeitada: sem resposta",
      "[radial] CSP bloqueou img-src: https://mal.example/x.png",
    ]);
  });

  it("descrição do bloqueio da CSP: script embutido e arquivo de origem", () => {
    expect(describeCspViolation({ effectiveDirective: "script-src-elem", blockedURI: "", sourceFile: "http://tauri.localhost/assets/settings-1.js", lineNumber: 3 })).toBe(
      "CSP bloqueou script-src-elem: inline (settings-1.js:3)",
    );
  });

  it("monitor de quadros conta quadros e intervalos longos", () => {
    let t = 0;
    const cbs: FrameRequestCallback[] = [];
    vi.spyOn(window, "requestAnimationFrame").mockImplementation((cb) => (cbs.push(cb), cbs.length));
    vi.spyOn(window, "cancelAnimationFrame").mockImplementation(() => {});
    vi.spyOn(performance, "now").mockImplementation(() => t);
    const stop = startFrameMonitor();
    for (const gap of [16, 16, 80, 16]) {
      t += gap;
      cbs[cbs.length - 1](t);
    }
    const s = stop();
    expect(s.frames).toBe(4);
    expect(s.maxGapMs).toBe(80);
    expect(s.janky).toBe(1);
  });
});
