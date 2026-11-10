import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

const log = vi.hoisted(() => ({ perfLog: vi.fn() }));
vi.mock("./perf", () => ({ perfLog: log.perfLog }));

import { ErrorBoundary } from "./ErrorBoundary";

function Boom(): never {
  throw new Error("quebrou de propósito");
}

afterEach(cleanup);

describe("ErrorBoundary", () => {
  it("mostra 'Algo deu errado' e registra o erro com a origem, em vez de tela branca", () => {
    const quiet = vi.spyOn(console, "error").mockImplementation(() => {});
    render(
      <ErrorBoundary source="settings">
        <Boom />
      </ErrorBoundary>,
    );
    expect(screen.getByRole("alert").textContent).toContain("Algo deu errado");
    expect(screen.getByText("quebrou de propósito")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Recarregar" })).toBeTruthy();
    expect(log.perfLog).toHaveBeenCalledWith(expect.stringContaining("quebrou de propósito"), "error", "settings");
    quiet.mockRestore();
  });

  it("sem erro, renderiza os filhos normalmente", () => {
    render(
      <ErrorBoundary source="radial" compact>
        <span>ok</span>
      </ErrorBoundary>,
    );
    expect(screen.getByText("ok")).toBeTruthy();
    expect(screen.queryByRole("alert")).toBeNull();
  });
});
