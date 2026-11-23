import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { useState } from "react";
import { afterEach, describe, expect, it } from "vitest";
import { defaultConfig } from "../shared/defaults";
import { describeAction } from "../shared/describe";
import { setLang } from "../shared/i18n";
import type { StatsPayload } from "../shared/ipc";
import type { Action } from "../shared/types";
import { validateAction } from "../shared/validate";
import { ActionEditor } from "../settings/ActionEditor";
import { formatRate, formatTimer, hubReading, netLevel } from "./hubReading";
import { RadialCanvas } from "./RadialCanvas";

afterEach(cleanup);

const S: StatsPayload = { cpu: 41.6, ram: 63.2, netDown: 1_234_000, netUp: 35_000 };

describe("medidor do centro (v0.37.0)", () => {
  it("formata timer e taxa de rede", () => {
    expect(formatTimer(25 * 60_000)).toBe("25:00");
    expect(formatTimer(61_001)).toBe("1:02");
    expect(formatTimer(3_909_000)).toBe("1:05:09");
    expect(formatTimer(-5)).toBe("0:00");
    expect(formatRate(0)).toBe("0 B/s");
    expect(formatRate(999)).toBe("999 B/s");
    expect(formatRate(350_400)).toBe("350 KB/s");
    expect(formatRate(1_234_000)).toBe("1,2 MB/s");
    expect(formatRate(12_340_000)).toBe("12 MB/s");
    setLang("en");
    expect(formatRate(1_234_000)).toBe("1.2 MB/s");
    setLang("pt");
    expect(netLevel(0)).toBe(0);
    expect(netLevel(125e6)).toBeCloseTo(1);
    expect(netLevel(1e12)).toBe(1);
    expect(netLevel(1e6)).toBeGreaterThan(0.5);
  });

  it("CPU (padrão), RAM e rede; o timer ativo tem prioridade", () => {
    expect(hubReading(S, undefined)).toEqual({ kind: "cpu", value: 0.42, text: "42%", pill: "CPU" });
    expect(hubReading(S, "ram")).toEqual({ kind: "ram", value: 0.63, text: "63%", pill: "RAM" });
    expect(hubReading(S, "net")).toMatchObject({ kind: "net", text: "↓ 1,2 MB/s", sub: "↑ 35 KB/s", pill: "REDE" });
    expect(hubReading({ cpu: 1, ram: 1 }, "net")).toMatchObject({ text: "—", sub: undefined, value: 0 });
    expect(hubReading(null, "cpu")).toMatchObject({ text: "—", value: 0 });
    const timer = { remainingMs: 15 * 60_000, totalMs: 25 * 60_000, running: true };
    expect(hubReading({ ...S, timer }, "net")).toEqual({ kind: "timer", value: 0.6, text: "15:00", pill: "TIMER" });
    expect(hubReading({ ...S, timer: { ...timer, running: false } }, "cpu").pill).toBe("PAUSADO");
    expect(hubReading({ ...S, timer: null }, "ram").kind).toBe("ram");
  });

  it("o centro do menu desenha o medidor escolhido e o timer mesmo com o medidor desligado", () => {
    const draw = (stats: StatsPayload, appearance: Partial<typeof defaultConfig.appearance>) =>
      render(
        <RadialCanvas
          items={defaultConfig.profiles[0].items}
          activeMain={null}
          activeSub={null}
          hubHovered={false}
          stats={stats}
          appearance={{ ...defaultConfig.appearance, ...appearance }}
        />,
      );
    const { container, unmount } = draw(S, { showCpu: true, hubGauge: "net" });
    const meter = container.querySelector('[data-testid="hub-meter-net"]')!;
    expect(meter.textContent).toContain("↓ 1,2 MB/s");
    expect(meter.textContent).toContain("↑ 35 KB/s");
    expect(container.querySelector(".hub-gauge--net")).not.toBeNull();
    unmount();
    const off = draw({ ...S, timer: { remainingMs: 90_000, totalMs: 300_000, running: true } }, { showCpu: false });
    expect(off.container.querySelector('[data-testid="hub-meter-timer"]')!.textContent).toContain("1:30");
    off.unmount();
    const none = draw(S, { showCpu: false });
    expect(none.container.querySelector('[data-testid^="hub-meter-"]')).toBeNull();
  });
});

describe("ação Timer (v0.37.0)", () => {
  it("validação e descrição", () => {
    expect(validateAction({ type: "timer", cmd: "toggle", minutes: 25 })).toBeNull();
    expect(validateAction({ type: "timer", cmd: "reset" })).toBeNull();
    expect(validateAction({ type: "timer", cmd: "start", minutes: 0 })).toBe("use de 1 a 180 minutos.");
    expect(validateAction({ type: "timer", cmd: "start", minutes: 2.5 })).toMatch(/180/);
    expect(validateAction({ type: "timer", cmd: "boom" as never })).toBe("comando do timer desconhecido.");
    expect(describeAction({ type: "timer", cmd: "toggle", minutes: 50 })).toBe("Iniciar/pausar o timer de 50 min");
    expect(describeAction({ type: "timer", cmd: "start" })).toBe("Iniciar o timer de 25 min");
    expect(describeAction({ type: "timer", cmd: "reset" })).toBe("Zerar o timer");
    setLang("en");
    expect(describeAction({ type: "timer", cmd: "pause" })).toBe("Pause the timer");
    setLang("pt");
  });

  it("editor: duração só para iniciar; trocar para zerar tira os minutos", () => {
    let last: Action | null = null;
    function H() {
      const [a, setA] = useState<Action>({ type: "timer", cmd: "toggle", minutes: 25 });
      return <ActionEditor action={a} onChange={(n) => (setA(n), (last = n))} />;
    }
    const { container } = render(<H />);
    const input = container.querySelector('input[type="number"]') as HTMLInputElement;
    fireEvent.change(input, { target: { value: "50" } });
    expect(last).toEqual({ type: "timer", cmd: "toggle", minutes: 50 });
    fireEvent.click(screen.getByRole("radio", { name: "Zerar" }));
    expect(last).toEqual({ type: "timer", cmd: "reset" });
    expect(container.querySelector('input[type="number"]')).toBeNull();
    fireEvent.click(screen.getByRole("radio", { name: "Iniciar" }));
    expect(last).toEqual({ type: "timer", cmd: "start", minutes: 25 });
  });
});
