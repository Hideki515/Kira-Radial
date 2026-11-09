// Teste adicionado pelo QA (v0.3.2): botão direito no ícone chama orbContextMenu e
// a imagem própria da config chega ao <img> via readOrbImage.
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { cloneConfig, defaultConfig } from "../shared/defaults";

const cfg = cloneConfig(defaultConfig);
cfg.launcher.mode = "orb";
cfg.launcher.orb.image = "C:\gifs\a.webp";

const ipc = vi.hoisted(() => ({
  orbContextMenu: vi.fn(async () => {}),
  orbClicked: vi.fn(async () => {}),
  startWindowDrag: vi.fn(async () => {}),
  readOrbImage: vi.fn(async () => "data:image/webp;base64,QUJD"),
}));
vi.mock("../shared/ipc", async (orig) => ({ ...(await orig<typeof import("../shared/ipc")>()), ...ipc }));
vi.mock("../hooks/useConfig", () => ({ useConfig: () => cfg }));

import { OrbApp } from "./OrbApp";

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

it("botão direito no ícone abre o menu de contexto nativo e não abre o radial", async () => {
  render(<OrbApp />);
  await act(async () => { await Promise.resolve(); await Promise.resolve(); });
  expect(ipc.readOrbImage).toHaveBeenCalledWith("C:\gifs\a.webp");
  expect(document.querySelector("img")?.getAttribute("src")).toBe("data:image/webp;base64,QUJD");
  const ev = fireEvent.contextMenu(screen.getByTestId("orb"));
  expect(ev).toBe(false); // preventDefault: sem menu do WebView
  expect(ipc.orbContextMenu).toHaveBeenCalledTimes(1);
  expect(ipc.orbClicked).not.toHaveBeenCalled();
});
