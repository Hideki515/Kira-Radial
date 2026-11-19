// Confirmação de desligar/reiniciar/encerrar sessão (diálogo sobre o menu).
import { useCallback, useRef, useState } from "react";
import type { MenuItem } from "../shared/types";
import { CONFIRM_GUARD_MS, type ConfirmChoice } from "./ConfirmDialog";

export interface ConfirmApi {
  /** Item aguardando confirmação (null = sem diálogo). */
  item: MenuItem | null;
  choice: ConfirmChoice;
  setChoice: (c: ConfirmChoice | ((prev: ConfirmChoice) => ConfirmChoice)) => void;
  /** Abre o diálogo para `item`, com o botão perigoso destacado. */
  ask: (item: MenuItem) => void;
  cancel: () => void;
  /** Já passou a pausa de segurança (2º clique de um duplo clique não confirma). */
  ready: () => boolean;
  /** Estado atual para handlers globais registrados uma vez só. */
  ref: { current: { item: MenuItem | null; choice: ConfirmChoice } };
}

export function useConfirm(): ConfirmApi {
  const [item, setItem] = useState<MenuItem | null>(null);
  const [choice, setChoice] = useState<ConfirmChoice>("confirm");
  const ref = useRef<{ item: MenuItem | null; choice: ConfirmChoice }>({ item: null, choice: "confirm" });
  ref.current = { item, choice };
  /** Quando o diálogo abriu (para ignorar confirmações imediatas). */
  const openedAt = useRef(0);
  const ask = useCallback((it: MenuItem) => {
    setChoice("confirm");
    openedAt.current = performance.now();
    setItem(it);
  }, []);
  const cancel = useCallback(() => setItem(null), []);
  const ready = useCallback(() => performance.now() - openedAt.current >= CONFIRM_GUARD_MS, []);
  return { item, choice, setChoice, ask, cancel, ready, ref };
}
