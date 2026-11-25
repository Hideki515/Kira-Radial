// Controle de videogame (XInput): o Rust lê o controle e manda "gamepad:aim" (ângulo do
// analógico), "gamepad:back" (B) e "gamepad:close" (combinação). A e o direcional chegam
// como "knob:press"/"knob:step" e já são tratados pelo useKnobInput.
import { useEffect } from "react";
import { onEvent } from "../shared/ipc";
import { sliceAngle, submenuAngles } from "./geometry";
import type { MenuControls } from "./menuControls";

/** Distância entre dois ângulos (graus, 0–180). */
const gap = (a: number, b: number) => {
  const d = (((a - b) % 360) + 360) % 360;
  return Math.min(d, 360 - d);
};

/** Índice do ângulo mais perto de `angle` (null se a lista está vazia). */
export function nearest(angles: number[], angle: number): number | null {
  let best: number | null = null;
  angles.forEach((a, i) => {
    if (best === null || gap(a, angle) < gap(angles[best], angle)) best = i;
  });
  return best;
}

/** Para onde o analógico aponta: fatia do anel principal ou, com o sub-anel aberto, subitem. */
export function aimTarget(
  ring: { openMain: number | null; mainCount: number; subCount: number },
  angle: number,
): { activeMain: number | null; activeSub: number | null } | null {
  if (!ring.mainCount) return null;
  if (ring.openMain !== null && ring.subCount > 0) {
    const sub = nearest(submenuAngles(sliceAngle(ring.openMain, ring.mainCount), ring.subCount), angle);
    return { activeMain: ring.openMain, activeSub: sub };
  }
  const main = nearest(Array.from({ length: ring.mainCount }, (_, i) => sliceAngle(i, ring.mainCount)), angle);
  return { activeMain: main, activeSub: null };
}

export function useGamepadInput(c: MenuControls): void {
  const { state, setActiveMain, setActiveSub, setHubHovered, close, closeSub } = c;
  const { ref: confirmRef, cancel } = c.confirm;
  useEffect(() => {
    const offs = [
      onEvent<number>("gamepad:aim", (angle) => {
        const s = state.current;
        if (!s.open || confirmRef.current.item) return;
        const t = aimTarget({ openMain: s.openMain, mainCount: s.items.length, subCount: s.children.length }, angle);
        if (!t) return;
        setHubHovered(false);
        setActiveMain(t.activeMain);
        setActiveSub(t.activeSub);
      }),
      // B: cancela a confirmação, fecha o sub-anel ou, no anel principal, fecha o menu.
      onEvent<null>("gamepad:back", () => {
        const s = state.current;
        if (!s.open) return;
        if (confirmRef.current.item) return cancel();
        if (s.openMain !== null && s.children.length) return closeSub();
        close();
      }),
      onEvent<null>("gamepad:close", () => {
        if (state.current.open) close();
      }),
    ];
    return () => offs.forEach((p) => p.then((off) => off()));
  }, [state, confirmRef, cancel, setActiveMain, setActiveSub, setHubHovered, close, closeSub]);
}
