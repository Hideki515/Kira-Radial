// Mouse, teclado e roda no menu aberto (listeners globais, registrados uma vez).
import { useEffect } from "react";
import { isTauri } from "../shared/ipc";
import { LAYOUT } from "./geometry";
import type { MenuControls } from "./menuControls";
import { digitIndex, stepIndex, wheelIndex } from "./navigation";

/** Clique além deste raio (em px do canvas) fecha o menu em vez de escolher uma fatia. */
const OUTSIDE_RADIUS = LAYOUT.subOuter + 60;

export function useMenuInput(c: MenuControls): void {
  const {
    state, clickedId, setActiveMain, setActiveSub, setHubHovered, openSub, closeSub, close, showAt, execute, executeSelection,
    computeHit, nudgeVolume, closeOnBlur,
  } = c;
  // Só as partes estáveis do diálogo (o objeto muda a cada renderização).
  const { ref: confirmRef, setChoice, cancel, ready } = c.confirm;

  useEffect(() => {
    const onMove = (e: PointerEvent) => {
      if (!state.current.open || confirmRef.current.item) return;
      const hit = computeHit(e.clientX, e.clientY);
      setHubHovered(hit.ring === "center");
      if (hit.ring === "main") {
        setActiveMain(hit.index);
        setActiveSub(null);
      } else if (hit.ring === "sub") {
        setActiveSub(hit.index);
      }
    };

    const onUp = (e: PointerEvent) => {
      // Com o diálogo aberto, os cliques são dele (botões e fundo).
      if (e.button !== 0 || !state.current.open || confirmRef.current.item) return;
      const s = state.current;
      const hit = computeHit(e.clientX, e.clientY);
      if (hit.r > OUTSIDE_RADIUS) return close();
      if (hit.ring === "center") {
        if (s.openMain !== null) closeSub();
        else close();
      } else if (hit.ring === "sub") {
        clickedId.current = s.children[hit.index]?.id ?? null;
        void execute(s.children[hit.index]);
      } else {
        const item = s.items[hit.index];
        if (item?.children?.length) {
          // Clique na fatia abre o sub-anel; clicar de novo na mesma fecha.
          if (s.openMain === hit.index) closeSub();
          else openSub(hit.index, false);
        } else if (item?.action) {
          clickedId.current = item.id;
          void execute(item);
        }
      }
    };

    const onKey = (e: KeyboardEvent) => {
      const s = state.current;
      if (!s.open) return;
      const pending = confirmRef.current;
      if (pending.item) {
        e.preventDefault();
        if (e.key === "Escape") cancel();
        // Setas seguem a posição dos botões (Desligar à esquerda, Cancelar à direita); Tab alterna.
        else if (e.key === "ArrowLeft" || e.key === "ArrowUp") setChoice("confirm");
        else if (e.key === "ArrowRight" || e.key === "ArrowDown") setChoice("cancel");
        else if (e.key === "Tab") setChoice((x) => (x === "confirm" ? "cancel" : "confirm"));
        // Tecla segurada (ex.: o Enter que escolheu a fatia) ou apressada não confirma sozinha.
        else if ((e.key === "Enter" || e.key === " ") && !e.repeat) {
          if (pending.choice !== "confirm") cancel();
          else if (ready()) void execute(pending.item, true);
        }
        return;
      }
      // 1–9 (linha de números ou teclado numérico): escolhe a fatia/subitem direto.
      const n = digitIndex(e);
      if (n !== null) {
        e.preventDefault();
        if (s.openMain !== null && s.children.length) {
          const child = s.children[n];
          if (!child) return;
          setActiveSub(n);
          return void execute(child);
        }
        const item = s.items[n];
        if (!item) return;
        setActiveMain(n);
        if (item.children?.length) return openSub(n, false);
        return void execute(item);
      }
      const step = (d: number) => {
        if (s.openMain !== null && s.children.length) {
          setActiveSub(stepIndex(s.activeSub, d, s.children.length));
        } else {
          setActiveMain(stepIndex(s.activeMain, d, s.items.length));
          setActiveSub(null);
        }
      };
      switch (e.key) {
        case "Escape": if (s.openMain !== null) closeSub(); else close(); break;
        case "ArrowRight": case "ArrowDown": step(1); break;
        case "ArrowLeft": case "ArrowUp": step(-1); break;
        case "Backspace": if (s.openMain !== null) closeSub(); break;
        case "Enter": case " ": {
          const main = s.activeMain !== null ? s.items[s.activeMain] : undefined;
          if (s.openMain === null && main?.children?.length) openSub(s.activeMain!, true);
          else if (s.openMain !== null && s.activeSub === null) setActiveSub(0);
          else executeSelection(false);
          break;
        }
        default: return;
      }
      e.preventDefault();
    };

    const onWheel = (e: WheelEvent) => {
      const s = state.current;
      if (!s.open || confirmRef.current.item) return;
      const d = e.deltaY > 0 ? 1 : -1;
      // Roda sobre o centro: volume (para cima = aumenta), em vez de girar a seleção.
      if (computeHit(e.clientX, e.clientY).ring === "center") return void nudgeVolume(d < 0);
      if (s.openMain !== null && s.children.length) {
        setActiveSub(wheelIndex(s.activeSub, d, s.children.length, -1));
      } else {
        setActiveMain(wheelIndex(s.activeMain, d, s.items.length, 0));
      }
    };

    // No navegador: botão direito reabre o menu na posição do mouse (simula o atalho global).
    const onContext = (e: MouseEvent) => {
      e.preventDefault();
      if (!isTauri()) showAt(e.clientX, e.clientY);
    };

    const onBlur = () => {
      if (isTauri() && closeOnBlur && state.current.open) close();
    };

    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
    window.addEventListener("keydown", onKey);
    window.addEventListener("wheel", onWheel, { passive: true });
    window.addEventListener("contextmenu", onContext);
    window.addEventListener("blur", onBlur);
    return () => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("wheel", onWheel);
      window.removeEventListener("contextmenu", onContext);
      window.removeEventListener("blur", onBlur);
    };
  }, [
    state, clickedId, confirmRef, setChoice, cancel, ready, setActiveMain, setActiveSub, setHubHovered, openSub, closeSub, close, showAt,
    execute, executeSelection, computeHit, nudgeVolume, closeOnBlur,
  ]);
}
