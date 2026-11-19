// Knob (controle dedicado de teclado macro): girar passa, apertar escolhe.
import { useEffect } from "react";
import { onEvent } from "../shared/ipc";
import type { MenuControls } from "./menuControls";
import { knobPress, knobStep, type RingState } from "./navigation";

export function useKnobInput(c: MenuControls): void {
  const { state, setActiveMain, setActiveSub, setHubHovered, close, closeSub, openSub, execute, executeSelection } = c;
  // Só as partes estáveis do diálogo (o objeto muda a cada renderização).
  const { ref: confirmRef, setChoice, cancel, ready } = c.confirm;
  useEffect(() => {
    const ring = (): RingState => {
      const s = state.current;
      return { openMain: s.openMain, activeMain: s.activeMain, activeSub: s.activeSub, mainCount: s.items.length, subCount: s.children.length };
    };
    const offs = [
      onEvent<number>("knob:step", (d) => {
        if (!state.current.open) return;
        // Diálogo de confirmação: girar troca o botão destacado.
        if (confirmRef.current.item) return setChoice((x) => (x === "confirm" ? "cancel" : "confirm"));
        const r = ring();
        const next = knobStep(r, d > 0 ? 1 : -1);
        setActiveMain(next.activeMain);
        setActiveSub(next.activeSub);
        // No sub-anel, a posição "Voltar" é o centro: fica destacado.
        setHubHovered(r.openMain !== null && r.subCount > 0 && next.activeSub === null);
      }),
      onEvent<null>("knob:press", () => {
        const s = state.current;
        if (!s.open) return;
        const pending = confirmRef.current;
        if (pending.item) {
          if (pending.choice !== "confirm") cancel();
          else if (ready()) void execute(pending.item, true);
          return;
        }
        const main = s.activeMain !== null ? s.items[s.activeMain] : undefined;
        const p = knobPress(ring(), !!main?.children?.length);
        setHubHovered(false);
        if (p.kind === "close") close();
        else if (p.kind === "back") closeSub();
        else if (p.kind === "openSub") openSub(p.index, true);
        else executeSelection(false);
      }),
    ];
    return () => offs.forEach((p) => p.then((off) => off()));
  }, [state, confirmRef, setChoice, cancel, ready, setActiveMain, setActiveSub, setHubHovered, close, closeSub, openSub, execute, executeSelection]);
}
