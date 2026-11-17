import { LogOut, Power, RotateCcw } from "lucide-react";
import type { SystemCmd } from "../shared/types";

/** Comandos de sistema que pedem confirmação antes de rodar. */
export const CONFIRM: Partial<Record<SystemCmd, { title: string; message: string; button: string; icon: typeof Power }>> = {
  shutdown: { title: "Desligar", message: "Tem certeza que deseja desligar o computador?", button: "Desligar", icon: Power },
  restart: { title: "Reiniciar", message: "Tem certeza que deseja reiniciar o computador?", button: "Reiniciar", icon: RotateCcw },
  signout: { title: "Encerrar sessão", message: "Tem certeza que deseja encerrar a sessão?", button: "Encerrar", icon: LogOut },
};

export type ConfirmChoice = "confirm" | "cancel";

/**
 * Depois de abrir, o diálogo ignora confirmações por este tempo: o 2º clique de um duplo
 * clique na fatia (ou um Enter apressado) cairia em cima do botão e desligaria sem querer.
 */
export const CONFIRM_GUARD_MS = 400;

interface Props {
  cmd: SystemCmd;
  /** Botão destacado (teclado/knob): Enter ou apertar o knob aciona este. */
  choice: ConfirmChoice;
  onChoice: (c: ConfirmChoice) => void;
  onConfirm: () => void;
  onCancel: () => void;
  /** Centro do menu (px da janela): o diálogo aparece sobre ele. */
  x: number;
  y: number;
}

/** Confirmação no estilo de um diálogo de sistema: ícone, título, pergunta e dois botões. */
export function ConfirmDialog({ cmd, choice, onChoice, onConfirm, onCancel, x, y }: Props) {
  const info = CONFIRM[cmd];
  if (!info) return null;
  const Icon = info.icon;
  return (
    // Clique fora do cartão = cancelar.
    <div className="confirm-backdrop" data-testid="confirm-backdrop" onPointerDown={(e) => e.target === e.currentTarget && onCancel()}>
      <div
        className="confirm-card"
        role="alertdialog"
        aria-modal="true"
        aria-labelledby="confirm-title"
        aria-describedby="confirm-message"
        style={{ left: x, top: y }}
      >
        <div className="confirm-icon" aria-hidden="true">
          <Icon size={18} strokeWidth={2.4} />
        </div>
        <h2 id="confirm-title" className="confirm-title">{info.title}</h2>
        <p id="confirm-message" className="confirm-message">{info.message}</p>
        <div className="confirm-buttons">
          <button
            type="button"
            className={`confirm-btn is-danger${choice === "confirm" ? " is-selected" : ""}`}
            onPointerMove={() => choice !== "confirm" && onChoice("confirm")}
            onClick={onConfirm}
          >
            {info.button}
          </button>
          <button
            type="button"
            className={`confirm-btn${choice === "cancel" ? " is-selected" : ""}`}
            onPointerMove={() => choice !== "cancel" && onChoice("cancel")}
            onClick={onCancel}
          >
            Cancelar
          </button>
        </div>
      </div>
    </div>
  );
}
