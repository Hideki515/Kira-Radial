import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { useState } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { MenuItem, Profile } from "./types";

const ipc = vi.hoisted(() => ({
  readIcon: vi.fn(async (p: string) => `data:image/png;base64,${p.length}`),
  extractIcon: vi.fn(async (_p: string) => "C:/dados/icons/app-abc.png"),
  pickIconImage: vi.fn(async (): Promise<string | null> => "C:/imgs/estrela.svg"),
}));
vi.mock("./ipc", async (orig) => ({ ...(await orig<typeof import("./ipc")>()), ...ipc }));

import { RadialCanvas } from "../radial/RadialCanvas";
import { ItemsPage, type Selection } from "../settings/pages/ItemsPage";
import { defaultConfig } from "./defaults";
import { applyIconFiles, forgetIconFile, iconFilesOf, useIconFiles } from "./iconFiles";

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});
const flush = () => act(async () => { await Promise.resolve(); await Promise.resolve(); await Promise.resolve(); });

const items: MenuItem[] = [
  { id: "a", label: "A", icon: "code", iconFile: "C:/x/a.png", action: { type: "url", url: "https://a.b" } },
  { id: "b", label: "B", icon: "code", children: [{ id: "b1", label: "B1", icon: "code", iconFile: "C:/x/b1.svg", action: { type: "url", url: "https://a.b" } }] },
  { id: "c", label: "C", icon: "code", action: { type: "url", url: "https://a.b" } },
];

describe("ícones próprios", () => {
  it("lista caminhos (inclui subitens) e aplica as imagens carregadas", () => {
    expect(iconFilesOf(items)).toEqual(["C:/x/a.png", "C:/x/b1.svg"]);
    const out = applyIconFiles(items, { "C:/x/b1.svg": "data:svg" });
    expect(out[0].iconSrc).toBeUndefined(); // ainda não carregou
    expect(out[1].children![0].iconSrc).toBe("data:svg");
    expect(out[2]).toBe(items[2]); // sem ícone próprio: mesmo objeto
    expect(applyIconFiles(items, {})).toBe(items);
  });

  it("no menu, a fatia com iconFile mostra a imagem; falha mantém o ícone vetorial", async () => {
    ipc.readIcon.mockImplementation(async (p: string) => {
      if (p.endsWith("b1.svg")) throw new Error("sumiu");
      return "data:image/png;base64,OK";
    });
    forgetIconFile("C:/x/a.png");
    forgetIconFile("C:/x/b1.svg");
    function Host() {
      const withIcons = useIconFiles(items);
      return <RadialCanvas items={withIcons} activeMain={1} activeSub={null} hubHovered={false} stats={null} appearance={defaultConfig.appearance} />;
    }
    const { container } = render(<Host />);
    await flush();
    const imgs = container.querySelectorAll('[data-testid="slice-img"]');
    expect(imgs).toHaveLength(1); // só a fatia A; o subitem B1 falhou e ficou vetorial
    expect(imgs[0].getAttribute("href")).toBe("data:image/png;base64,OK");
  });
});

describe("Itens › ícone próprio", () => {
  const profile = (): Profile => ({
    id: "p",
    name: "P",
    items: [
      { id: "a", label: "A", icon: "code", action: { type: "launch", path: "C:/Windows/notepad.exe" } },
      { id: "b", label: "B", icon: "code", action: { type: "url", url: "https://a.b" } },
      { id: "c", label: "C", icon: "code", action: { type: "url", url: "https://a.b" } },
    ],
  });
  let latest: Profile;
  function Harness({ main = 0 }) {
    const [p, setP] = useState(profile);
    const [sel, setSel] = useState<Selection>({ main, child: null });
    latest = p;
    return (
      <ItemsPage
        profile={p}
        selection={sel}
        onSelect={setSel}
        edit={(fn) =>
          setP((prev) => {
            const next = structuredClone(prev);
            fn(next);
            latest = next;
            return next;
          })
        }
      />
    );
  }

  it("'Usar ícone do programa' extrai e grava o PNG; 'Remover' volta ao vetorial", async () => {
    render(<Harness />);
    fireEvent.click(screen.getByRole("button", { name: /Usar ícone do programa/ }));
    await flush();
    expect(ipc.extractIcon).toHaveBeenCalledWith("C:/Windows/notepad.exe");
    expect(latest.items[0].iconFile).toBe("C:/dados/icons/app-abc.png");
    expect(screen.getByTestId("icon-file").textContent).toContain("app-abc.png");
    fireEvent.click(screen.getByRole("button", { name: "Remover" }));
    expect(latest.items[0].iconFile).toBeUndefined();
  });

  it("'Imagem própria…' grava o caminho; ação que não é programa não mostra o botão de extrair", async () => {
    render(<Harness main={1} />);
    expect(screen.queryByRole("button", { name: /Usar ícone do programa/ })).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: /Imagem própria/ }));
    await flush();
    expect(latest.items[1].iconFile).toBe("C:/imgs/estrela.svg");
  });

  it("erro ao extrair aparece na tela sem mudar a fatia", async () => {
    ipc.extractIcon.mockRejectedValueOnce("não foi possível ler o ícone");
    render(<Harness />);
    fireEvent.click(screen.getByRole("button", { name: /Usar ícone do programa/ }));
    await flush();
    expect(screen.getByRole("alert").textContent).toContain("não foi possível ler o ícone");
    expect(latest.items[0].iconFile).toBeUndefined();
  });
});
