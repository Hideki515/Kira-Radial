import { ClipboardCopy, FolderOpen, Pencil, Pin, Save, X } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import {
  onEvent,
  shotCopy,
  shotCurrent,
  shotDismiss,
  shotEdit,
  shotOpenFolder,
  shotPin,
  shotPinImage,
  shotSaveAs,
  shotUnpin,
  startWindowDrag,
  type PinImage,
  type ShotInfo,
} from "../shared/ipc";

/** Tempo (ms) que o aviso de um botão ("Copiado!") fica visível. */
const NOTE_MS = 1800;

/** Preview do print no canto da tela: some sozinho (pausa com o mouse em cima). */
export function ShotPreview() {
  const [shot, setShot] = useState<ShotInfo | null>(null);
  const [hover, setHover] = useState(false);
  const [note, setNote] = useState<{ ok: boolean; text: string } | null>(null);
  const noteTimer = useRef<number | null>(null);

  useEffect(() => {
    void shotCurrent().then(setShot);
    const off = onEvent<ShotInfo>("shot:new", (s) => {
      setShot(s);
      setNote(null);
      // A janela pode ter sido escondida com o mouse em cima (Fechar/Fixar): o mouseleave
      // não chega, e o print novo ficaria parado na tela.
      setHover(false);
    });
    return () => void off.then((f) => f());
  }, []);

  // Some sozinho depois de `seconds`, contando de novo quando o mouse sai.
  useEffect(() => {
    if (!shot || hover) return;
    const t = window.setTimeout(() => void shotDismiss(), shot.seconds * 1000);
    return () => window.clearTimeout(t);
  }, [shot, hover]);

  useEffect(() => () => void (noteTimer.current !== null && window.clearTimeout(noteTimer.current)), []);

  const flash = useCallback((ok: boolean, text: string) => {
    setNote({ ok, text });
    if (noteTimer.current !== null) window.clearTimeout(noteTimer.current);
    noteTimer.current = window.setTimeout(() => setNote(null), NOTE_MS);
  }, []);

  const run = (fn: () => Promise<unknown>, ok?: string) =>
    fn().then(
      (r) => {
        if (typeof r === "string") flash(true, `Salvo em ${r}`);
        else if (ok) flash(true, ok);
      },
      (e) => flash(false, String(e)),
    );

  if (!shot) return null;
  // `short` cabe no botão; o nome completo vai na dica e no leitor de tela.
  const buttons: { label: string; short: string; icon: typeof Save; onClick: () => void; hidden?: boolean }[] = [
    { label: "Copiar", short: "Copiar", icon: ClipboardCopy, onClick: () => void run(() => shotCopy(shot.id), "Copiado!") },
    { label: "Salvar como…", short: "Salvar", icon: Save, onClick: () => void run(() => shotSaveAs(shot.id)) },
    { label: "Abrir pasta", short: "Pasta", icon: FolderOpen, onClick: () => void run(() => shotOpenFolder(shot.id)), hidden: !shot.path },
    { label: "Editar", short: "Editar", icon: Pencil, onClick: () => void run(() => shotEdit(shot.id)) },
    { label: "Fixar na tela", short: "Fixar", icon: Pin, onClick: () => { setHover(false); void run(() => shotPin(shot.id)); } },
  ];

  return (
    <div
      className={`shot-card corner-${shot.corner}`}
      data-testid="shot-preview"
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
    >
      <div className="shot-head">
        <span className="shot-title">Print · {shot.width}×{shot.height}</span>
        <button type="button" className="shot-icon-btn" title="Fechar" aria-label="Fechar" onClick={() => { setHover(false); void shotDismiss(); }}>
          <X size={15} />
        </button>
      </div>
      <img className="shot-thumb" src={shot.thumb} alt={`Print de ${shot.width}×${shot.height}`} draggable={false} />
      <div className="shot-actions">
        {buttons.filter((b) => !b.hidden).map(({ label, short, icon: Icon, onClick }) => (
          <button key={label} type="button" className="shot-btn" title={label} aria-label={label} onClick={onClick}>
            <Icon size={16} />
            <span aria-hidden="true">{short}</span>
          </button>
        ))}
      </div>
      <p className={`shot-note${note ? (note.ok ? " is-ok" : " is-error") : ""}`} role="status">
        {note?.text ?? (shot.path ? shot.path.split(/[\\/]/).pop() : "Também está na área de transferência.")}
      </p>
      {!hover && <div className="shot-timer" style={{ animationDuration: `${shot.seconds}s` }} key={shot.id} />}
    </div>
  );
}

/** Print fixado na tela: arraste para mover; Esc ou × fecha. */
export function ShotPin() {
  const [img, setImg] = useState<PinImage | null>(null);

  useEffect(() => {
    void shotPinImage().then(setImg);
    const off = onEvent<number>("shot:pin", () => void shotPinImage().then(setImg));
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") void shotUnpin();
    };
    window.addEventListener("keydown", onKey);
    return () => {
      void off.then((f) => f());
      window.removeEventListener("keydown", onKey);
    };
  }, []);

  if (!img) return null;
  return (
    <div className="shot-pin" data-testid="shot-pin" onMouseDown={(e) => e.button === 0 && !(e.target as HTMLElement).closest("button") && void startWindowDrag()}>
      <img src={img.src} alt={`Print fixado de ${img.width}×${img.height}`} draggable={false} />
      <button type="button" className="shot-icon-btn shot-pin-close" title="Fechar (Esc)" aria-label="Fechar" onClick={() => void shotUnpin()}>
        <X size={16} />
      </button>
    </div>
  );
}

export function ShotApp() {
  const pin = new URLSearchParams(window.location.search).has("pin");
  return pin ? <ShotPin /> : <ShotPreview />;
}
