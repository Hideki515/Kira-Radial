// QA v0.39.0: a leitura extra do Discord/OBS (selo de estado) só acontece quando há essas ações.
import { cleanup, render, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { MenuItem } from "../shared/types";

const ipc = vi.hoisted(() => ({
  discordVoice: vi.fn(async () => ({ status: "ok", voice: { mute: true, deaf: false, input: { current: "", devices: [] }, output: { current: "", devices: [] } } })),
  obsState: vi.fn(async () => ({ status: "ok", scenes: [], current: "", recording: true, streaming: false, inputs: [] })),
}));
vi.mock("../shared/ipc", async (orig) => ({ ...(await orig<typeof import("../shared/ipc")>()), ...ipc }));

import { useDynamicSources } from "./useDynamicSources";

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

let last: ReturnType<typeof useDynamicSources> = {};
function Probe({ items, active }: { items: MenuItem[]; active: boolean }) {
  last = useDynamicSources(items, active, 0);
  return null;
}

const plain: MenuItem = { id: "x", label: "App", icon: "star", action: { type: "launch", path: "a.exe" } };
const other: MenuItem = { id: "y", label: "Entrada", icon: "mic", action: { type: "discord", cmd: "setInput", deviceId: "d" } };
const mic: MenuItem = { id: "m", label: "Mic", icon: "mic", action: { type: "discord", cmd: "toggleMute" } };
const rec: MenuItem = { id: "r", label: "Gravar", icon: "video", action: { type: "obs", cmd: "toggleRecord" } };

describe("QA v0.39.0 — leitura do Discord/OBS só com ações que têm selo", () => {
  it("sem ações de mutar/gravar (nem em subitens): não lê Discord nem OBS", async () => {
    render(<Probe items={[plain, other, { id: "g", label: "G", icon: "star", children: [plain, other] }]} active />);
    await new Promise((r) => setTimeout(r, 30));
    expect(ipc.discordVoice).not.toHaveBeenCalled();
    expect(ipc.obsState).not.toHaveBeenCalled();
  });

  it("menu fechado (active=false): não lê, mesmo com as ações", async () => {
    render(<Probe items={[mic, rec]} active={false} />);
    await new Promise((r) => setTimeout(r, 30));
    expect(ipc.discordVoice).not.toHaveBeenCalled();
    expect(ipc.obsState).not.toHaveBeenCalled();
  });

  it("ação de mutar num subitem e de gravar no anel: lê os dois", async () => {
    render(<Probe items={[rec, { id: "g", label: "G", icon: "star", children: [mic] }]} active />);
    await waitFor(() => expect(ipc.discordVoice).toHaveBeenCalled());
    await waitFor(() => expect(ipc.obsState).toHaveBeenCalled());
    await waitFor(() => expect(last.obs).toBeTruthy());
  });
});
