import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { useState } from "react";
import { afterEach, describe, expect, it } from "vitest";
import type { Action } from "../shared/types";
import { ActionEditor } from "./ActionEditor";
import { HotkeyRecorder } from "./HotkeyRecorder";

afterEach(cleanup);

describe("gravador de atalho dentro de campos", () => {
  it("campo de combinação não é um <label> (não desvia o foco para o input)", () => {
    render(<ActionEditor action={{ type: "keys", combo: "" }} onChange={() => {}} />);
    const rec = screen.getByRole("button", { name: "Gravar atalho" });
    expect(rec.closest("label")).toBeNull();
  });

  it("clique no gravador cancela a ativação do rótulo", () => {
    render(
      <label>
        <input aria-label="texto" />
        <HotkeyRecorder value="" onChange={() => {}} />
      </label>,
    );
    const rec = screen.getByRole("button", { name: "Gravar atalho" });
    // fireEvent retorna false quando o padrão (repasse do <label> ao input) foi cancelado.
    expect(fireEvent.click(rec)).toBe(false);
  });

  it("grava combinação com modificadores no navegador", () => {
    let got = "";
    render(<HotkeyRecorder value="" onChange={(c) => (got = c)} />);
    const rec = screen.getByRole("button", { name: "Gravar atalho" });
    fireEvent.focus(rec);
    fireEvent.keyDown(rec, { key: "c", code: "KeyC", ctrlKey: true, shiftKey: true });
    expect(got).toBe("Ctrl+Shift+C");
  });
});

describe("atraso da ação de teclas", () => {
  it("atalhos de valor rápido definem delayMs (0 remove)", () => {
    let last: unknown = null;
    render(<ActionEditor action={{ type: "keys", combo: "Ctrl+Shift+S" }} onChange={(a) => (last = a)} />);
    fireEvent.click(screen.getByRole("button", { name: "250 ms" }));
    expect(last).toEqual({ type: "keys", combo: "Ctrl+Shift+S", delayMs: 250 });
    fireEvent.click(screen.getByRole("button", { name: "0 ms" }));
    expect(last).toEqual({ type: "keys", combo: "Ctrl+Shift+S", delayMs: undefined });
  });
});

describe("ação de saída de áudio", () => {
  // No jsdom não há Tauri: listAudioOutputs usa a lista falsa do modo navegador.
  function Harness({ initial, onAction }: { initial: Action; onAction: (a: Action) => void }) {
    const [a, setA] = useState(initial);
    return <ActionEditor action={a} onChange={(n) => { setA(n); onAction(n); }} />;
  }

  it("tipo novo começa em alternar e troca para dispositivo específico", async () => {
    let last: Action | null = null;
    render(<Harness initial={{ type: "keys", combo: "" }} onAction={(a) => (last = a)} />);
    fireEvent.change(screen.getByLabelText("Tipo de ação"), { target: { value: "audioOutput" } });
    expect(last).toEqual({ type: "audioOutput", mode: "cycle" });
    fireEvent.click(screen.getByRole("radio", { name: "Dispositivo específico" }));
    expect(last).toEqual({ type: "audioOutput", mode: "set" });
    expect(screen.getByText(/escolha o dispositivo de saída/)).toBeTruthy();
  });

  it("escolher um dispositivo grava id e nome; atual é marcado", async () => {
    let last: Action | null = null;
    render(<Harness initial={{ type: "audioOutput", mode: "set" }} onAction={(a) => (last = a)} />);
    expect(await screen.findByRole("option", { name: "Alto-falantes (Realtek Audio) (atual)" })).toBeTruthy();
    fireEvent.change(screen.getByRole("combobox", { name: "Dispositivo de saída" }), {
      target: { value: "{0.0.0.00000000}.{fake-headset}" },
    });
    expect(last).toEqual({
      type: "audioOutput",
      mode: "set",
      deviceId: "{0.0.0.00000000}.{fake-headset}",
      deviceName: "Headset (USB Audio)",
    });
    expect((screen.getByRole("combobox", { name: "Dispositivo de saída" }) as HTMLSelectElement).value).toBe("{0.0.0.00000000}.{fake-headset}");
  });

  it("dispositivo salvo ausente aparece como desconectado", async () => {
    render(
      <ActionEditor action={{ type: "audioOutput", mode: "set", deviceId: "sumiu", deviceName: "Fone Bluetooth" }} onChange={() => {}} />,
    );
    expect(await screen.findByRole("option", { name: "Fone Bluetooth (desconectado)" })).toBeTruthy();
  });

  it("id antigo é reconhecido pelo nome", async () => {
    render(
      <ActionEditor action={{ type: "audioOutput", mode: "set", deviceId: "id-velho", deviceName: "headset (usb audio)" }} onChange={() => {}} />,
    );
    await screen.findByRole("option", { name: "Headset (USB Audio)" });
    expect((screen.getByRole("combobox", { name: "Dispositivo de saída" }) as HTMLSelectElement).value).toBe("{0.0.0.00000000}.{fake-headset}");
  });
});
