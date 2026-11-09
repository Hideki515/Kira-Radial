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
});
