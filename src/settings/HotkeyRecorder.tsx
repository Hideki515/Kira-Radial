import { useEffect, useRef, useState } from "react";
import { comboFromEvent, formatCombo, parseCombo } from "../shared/keys";
import { isTauri, onEvent, setHotkeyPaused, startKeyCapture, stopKeyCapture } from "../shared/ipc";

interface Props {
  value: string;
  onChange: (combo: string) => void;
  /** Exige Ctrl/Alt/Shift/Win (obrigatório para o atalho global). */
  requireModifier?: boolean;
  /** Pausa o atalho global durante a gravação, para ele não abrir o menu. */
  pauseGlobal?: boolean;
}

const MOD_HINT = "Use pelo menos um modificador: Ctrl, Alt, Shift ou Win.";

/**
 * Caixa que grava a combinação pressionada. Esc (sem modificadores) cancela.
 *
 * No app (Tauri) a gravação é feita pelo backend com um hook de teclado do sistema,
 * porque o Windows intercepta combinações com a tecla Win (Win+D, Win+E...) antes
 * de qualquer página — e a tecla Win sozinha abriria o Iniciar. No navegador
 * (desenvolvimento) cai no keydown comum.
 */
export function HotkeyRecorder({ value, onChange, requireModifier, pauseGlobal }: Props) {
  const [recording, setRecording] = useState(false);
  const [hint, setHint] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const boxRef = useRef<HTMLDivElement>(null);
  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;
  const parsed = parseCombo(value);

  const accept = (combo: string): boolean => {
    const c = parseCombo(combo);
    if (!c) return false;
    if (requireModifier && !c.mods.length) {
      setHint(MOD_HINT);
      return false;
    }
    onChangeRef.current(formatCombo(c));
    boxRef.current?.blur();
    return true;
  };

  // Gravação via backend enquanto a caixa está focada.
  useEffect(() => {
    if (!recording || !isTauri()) return;
    let alive = true;
    const offs = [
      onEvent<string>("keycapture:combo", (combo) => {
        if (!alive) return;
        // Combinação recusada (ex.: sem modificador): continua gravando.
        if (!accept(combo)) void startKeyCapture().catch((e) => setError(String(e)));
      }),
      onEvent<null>("keycapture:cancel", () => alive && boxRef.current?.blur()),
    ];
    // Só começa a capturar depois que os ouvintes estiverem registrados.
    Promise.all(offs)
      .then(() => (alive ? startKeyCapture() : undefined))
      .catch((e) => setError(String(e)));
    return () => {
      alive = false;
      void stopKeyCapture();
      offs.forEach((p) => p.then((off) => off()));
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [recording]);

  return (
    <div
      ref={boxRef}
      tabIndex={0}
      role="button"
      aria-label="Gravar atalho"
      className={`hotkey-recorder${recording ? " is-recording" : ""}`}
      // Dentro de um <label>, o clique seria repassado para o primeiro <input> do rótulo,
      // roubando o foco do gravador (e a gravação pararia). Cancelar o padrão impede isso.
      onClick={(e) => e.preventDefault()}
      onFocus={() => {
        setRecording(true);
        setHint(null);
        setError(null);
        if (pauseGlobal) void setHotkeyPaused(true);
      }}
      onBlur={() => {
        setRecording(false);
        if (pauseGlobal) void setHotkeyPaused(false);
      }}
      onKeyDown={(e) => {
        // No app as teclas são capturadas pelo backend; este caminho é o do navegador.
        if (isTauri()) return;
        e.preventDefault();
        e.stopPropagation();
        const noMods = !e.ctrlKey && !e.altKey && !e.shiftKey && !e.metaKey;
        if (e.key === "Escape" && noMods) {
          (e.currentTarget as HTMLElement).blur();
          return;
        }
        const combo = comboFromEvent(e.nativeEvent);
        if (combo) accept(formatCombo(combo));
      }}
    >
      {recording ? (
        <span className="hotkey-placeholder">Pressione a combinação… (Esc cancela)</span>
      ) : parsed ? (
        [...parsed.mods, parsed.key].map((k) => <kbd key={k}>{k}</kbd>)
      ) : (
        <span className="hotkey-placeholder">{value || "Clique para gravar"}</span>
      )}
      {(hint || error) && <span className="hotkey-hint">{error ?? hint}</span>}
    </div>
  );
}
