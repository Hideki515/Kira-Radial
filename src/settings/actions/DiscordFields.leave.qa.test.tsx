import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { DiscordFields } from "./DiscordFields";
import * as ipc from "../../shared/ipc";

// QA v0.40.0: o editor de ação lista "Sair do canal de voz" e não pede dispositivo.
describe("QA v0.40.0 editor Discord: sair do canal de voz", () => {
  it("lista a opção, escolher grava só o cmd e não mostra/consulta dispositivo", () => {
    const spy = vi.spyOn(ipc, "discordVoice");
    const onChange = vi.fn();
    const { rerender } = render(<DiscordFields action={{ type: "discord", cmd: "toggleMute" }} onChange={onChange} />);
    const select = screen.getByRole("combobox") as HTMLSelectElement;
    const opt = Array.from(select.options).find((o) => o.value === "leaveVoice");
    expect(opt?.textContent).toBe("Sair do canal de voz");
    fireEvent.change(select, { target: { value: "leaveVoice" } });
    expect(onChange).toHaveBeenCalledWith({ type: "discord", cmd: "leaveVoice" });
    rerender(<DiscordFields action={{ type: "discord", cmd: "leaveVoice" }} onChange={onChange} />);
    expect(screen.getAllByRole("combobox")).toHaveLength(1);
    expect(spy).not.toHaveBeenCalled();
  });
});
