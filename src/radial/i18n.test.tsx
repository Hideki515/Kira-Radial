import { act, cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { setLang } from "../shared/i18n";
import { ConfirmDialog } from "./ConfirmDialog";
import { DYNAMIC_HINT, DYNAMIC_LABEL } from "./dynamic";

afterEach(cleanup);

describe("menu em inglês", () => {
  it("diálogo de confirmação troca de idioma", () => {
    const props = { cmd: "shutdown" as const, choice: "cancel" as const, onChoice: () => {}, onConfirm: () => {}, onCancel: () => {}, x: 0, y: 0 };
    render(<ConfirmDialog {...props} />);
    expect(screen.getByRole("heading").textContent).toBe("Desligar");
    expect(screen.getByRole("button", { name: "Cancelar" })).toBeTruthy();
    act(() => setLang("en"));
    expect(screen.getByRole("heading").textContent).toBe("Shut Down");
    expect(screen.getByText("Are you sure you want to shut down?")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Cancel" })).toBeTruthy();
  });

  it("nomes e dicas dos submenus automáticos seguem o idioma", () => {
    expect(DYNAMIC_LABEL.clipboard).toBe("Área de transferência");
    setLang("en");
    expect(DYNAMIC_LABEL.clipboard).toBe("Clipboard");
    expect(DYNAMIC_HINT.windows).toMatch(/open windows/);
    expect((DYNAMIC_LABEL as Record<string, string | undefined>).naoExiste).toBeUndefined();
  });
});
