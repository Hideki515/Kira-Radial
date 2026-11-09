import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { defaultConfig, defaultProfile } from "../shared/defaults";
import { RadialCanvas } from "./RadialCanvas";

const base = {
  items: defaultProfile.items,
  hubHovered: false,
  stats: { cpu: 85, ram: 50 },
  appearance: defaultConfig.appearance,
};

afterEach(cleanup);

describe("RadialCanvas", () => {
  it("renderiza uma fatia por item", () => {
    render(<RadialCanvas {...base} activeMain={null} activeSub={null} />);
    expect(screen.getAllByTestId("main-slice")).toHaveLength(defaultProfile.items.length);
    expect(screen.queryByTestId("submenu")).toBeNull();
    expect(screen.getByText("85%")).toBeTruthy();
  });

  it("abre o sub-anel da fatia ativa com filhos", () => {
    const idx = defaultProfile.items.findIndex((i) => i.id === "pastas");
    render(<RadialCanvas {...base} activeMain={idx} activeSub={1} />);
    expect(screen.getByTestId("submenu")).toBeTruthy();
    expect(screen.getByText("DOWNLOADS")).toBeTruthy();
  });

  it("fatia sem filhos não abre sub-anel", () => {
    render(<RadialCanvas {...base} activeMain={0} activeSub={null} />);
    expect(screen.queryByTestId("submenu")).toBeNull();
  });

  it("tema vidro (padrão) não desenha a camada holográfica", () => {
    const { container } = render(<RadialCanvas {...base} activeMain={null} activeSub={null} />);
    expect(screen.queryByTestId("holo-back")).toBeNull();
    expect(container.querySelector("svg")!.classList.contains("theme-glass")).toBe(true);
  });

  it("tema holográfico desenha esfera, varredura e retícula sem perder fatias e hub", () => {
    const { container } = render(
      <RadialCanvas {...base} appearance={{ ...base.appearance, theme: "holo" }} activeMain={0} activeSub={null} />,
    );
    const svg = container.querySelector("svg")!;
    expect(svg.classList.contains("theme-holo")).toBe(true);
    expect(screen.getByTestId("holo-back")).toBeTruthy();
    expect(svg.querySelectorAll(".holo-meridian")).toHaveLength(6);
    expect(svg.querySelector(".holo-sweep")).toBeTruthy();
    expect(svg.querySelector(".holo-front")).toBeTruthy();
    expect(svg.querySelector(".orbit-hot")).toBeNull();
    expect(screen.getAllByTestId("main-slice")).toHaveLength(defaultProfile.items.length);
    expect(screen.getByText("85%")).toBeTruthy();
    // Decoração não pode capturar o ponteiro.
    svg.querySelectorAll(".holo").forEach((g) => expect(g.getAttribute("aria-hidden")).toBe("true"));
  });

  it("números das fatias só aparecem com showNumbers", () => {
    const { rerender } = render(<RadialCanvas {...base} activeMain={null} activeSub={null} />);
    expect(screen.queryAllByTestId("slice-num")).toHaveLength(0);
    rerender(<RadialCanvas {...base} appearance={{ ...base.appearance, showNumbers: true }} activeMain={null} activeSub={null} />);
    const nums = screen.getAllByTestId("slice-num").map((e) => e.textContent);
    expect(nums).toEqual(defaultProfile.items.slice(0, 9).map((_, i) => String(i + 1)));
  });

  it("Arc Reactor e Terminal desenham as próprias camadas", () => {
    const { container, rerender } = render(<RadialCanvas {...base} appearance={{ ...base.appearance, theme: "reactor" }} activeMain={0} activeSub={null} />);
    expect(container.querySelector("svg")!.classList.contains("theme-reactor")).toBe(true);
    expect(screen.getByTestId("reactor-back")).toBeTruthy();
    expect(container.querySelectorAll(".reactor-coil").length).toBe(10);
    expect(container.querySelector(".holo-back")).toBeNull();
    rerender(<RadialCanvas {...base} appearance={{ ...base.appearance, theme: "terminal" }} activeMain={0} activeSub={null} />);
    expect(container.querySelector("svg")!.classList.contains("theme-terminal")).toBe(true);
    expect(screen.getByTestId("terminal-back")).toBeTruthy();
    expect(container.querySelector(".term-sweep")).toBeTruthy();
    expect(screen.getAllByTestId("main-slice")).toHaveLength(defaultProfile.items.length);
    container.querySelectorAll(".reactor, .terminal").forEach((g) => expect(g.getAttribute("aria-hidden")).toBe("true"));
  });

  it("tema desconhecido cai no vidro", () => {
    const { container } = render(<RadialCanvas {...base} appearance={{ ...base.appearance, theme: "matrix" as never }} activeMain={null} activeSub={null} />);
    expect(container.querySelector("svg")!.classList.contains("theme-glass")).toBe(true);
  });
});
