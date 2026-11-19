import { useEffect, useRef, useState, type ReactNode } from "react";
import { hitTest, LAYOUT, sliceAngle } from "../radial/geometry";
import { getIcon } from "../shared/icons";
import type { MenuItem, Profile } from "../shared/types";
import type { Selection } from "./pages/ItemsPage";
import { moveError, moveItem, type Loc } from "./previewDrag";

/** Distância (px) que o ponteiro anda antes de virar arrasto (abaixo disso é clique). */
const DRAG_START_PX = 6;
/** Tempo parado sobre uma fatia-submenu até o sub-anel dela abrir. */
const SPRING_MS = 500;

interface Drag {
  from: Loc;
  startX: number;
  startY: number;
  x: number;
  y: number;
  started: boolean;
  /** Fatia cujo sub-anel está aberto durante o arrasto. */
  ring: number | null;
  /** Onde o item cai se soltar agora. */
  target: Loc | null;
}

interface Props {
  /** Itens como aparecem na pré-visualização (mesma ordem do perfil). */
  items: MenuItem[];
  profile: Profile;
  selection: Selection;
  onSelect: (s: Selection) => void;
  edit: (fn: (p: Profile) => void) => void;
  deadZonePx: number;
  /** Desenha o menu com o destaque/sub-anel pedidos. */
  render: (state: { activeMain: number | null; activeSub: number | null; openMain: number | null | undefined }) => ReactNode;
}

/** Pré-visualização editável: clicar escolhe; arrastar reordena, põe em submenu ou tira dele. */
export function PreviewEditor({ items, profile, selection, onSelect, edit, deadZonePx, render }: Props) {
  const boxRef = useRef<HTMLDivElement>(null);
  const [drag, setDrag] = useState<Drag | null>(null);
  const dragRef = useRef<Drag | null>(null);
  dragRef.current = drag;
  const spring = useRef<{ index: number; timer: number } | null>(null);
  const profileRef = useRef(profile);
  profileRef.current = profile;

  const isSubmenu = (i: number) => !!profile.items[i]?.children && !profile.items[i]?.dynamic;
  /** Sub-anel aberto fora do arrasto: o da fatia escolhida, se for submenu. */
  const restingRing = isSubmenu(selection.main) ? selection.main : null;

  /** Ponto da tela → fatia/subitem sob ele, com o sub-anel `ring` aberto. */
  const hitAt = (clientX: number, clientY: number, ring: number | null) => {
    const box = boxRef.current?.querySelector("svg")?.getBoundingClientRect();
    if (!box || !box.width) return null;
    const k = LAYOUT.size / box.width;
    const dx = (clientX - box.left) * k - LAYOUT.size / 2;
    const dy = (clientY - box.top) * k - LAYOUT.size / 2;
    const kids = ring !== null ? items[ring]?.children ?? [] : [];
    const sub = ring !== null && kids.length ? { parentAngle: sliceAngle(ring, items.length), count: kids.length } : null;
    return hitTest(dx, dy, items.length, deadZonePx, sub);
  };

  const clearSpring = () => {
    if (spring.current) window.clearTimeout(spring.current.timer);
    spring.current = null;
  };

  const onPointerDown = (e: React.PointerEvent) => {
    if (e.button !== 0) return;
    const hit = hitAt(e.clientX, e.clientY, restingRing);
    if (!hit || hit.ring === "center") return;
    const from: Loc = hit.ring === "main" ? { main: hit.index, child: null } : { main: restingRing!, child: hit.index };
    // Clique já escolhe o item no editor (como na lista ao lado).
    onSelect({ main: from.main, child: from.child });
    setDrag({ from, startX: e.clientX, startY: e.clientY, x: e.clientX, y: e.clientY, started: false, ring: from.child !== null ? from.main : null, target: null });
  };

  useEffect(() => {
    if (!drag) return;
    const move = (e: PointerEvent) => {
      const d = dragRef.current;
      if (!d) return;
      const started = d.started || Math.hypot(e.clientX - d.startX, e.clientY - d.startY) > DRAG_START_PX;
      if (!started) return;
      const hit = hitAt(e.clientX, e.clientY, d.ring);
      let target: Loc | null = null;
      if (hit?.ring === "main") {
        // Parado sobre uma fatia-submenu (que não é a arrastada): abre o sub-anel dela.
        if (isSubmenu(hit.index) && !(d.from.child === null && d.from.main === hit.index) && d.ring !== hit.index) {
          if (spring.current?.index !== hit.index) {
            clearSpring();
            const index = hit.index;
            spring.current = { index, timer: window.setTimeout(() => setDrag((x) => (x ? { ...x, ring: index } : x)), SPRING_MS) };
          }
        } else clearSpring();
        // Soltar na própria fatia-mãe aberta: vai para o fim do submenu dela.
        target = d.ring === hit.index && d.from.main !== hit.index
          ? { main: hit.index, child: items[hit.index]?.children?.length ?? 0 }
          : { main: hit.index, child: null };
      } else {
        clearSpring();
        if (hit?.ring === "sub" && d.ring !== null) target = { main: d.ring, child: hit.index };
      }
      setDrag({ ...d, started, x: e.clientX, y: e.clientY, target });
    };
    const up = () => {
      const d = dragRef.current;
      clearSpring();
      setDrag(null);
      if (!d?.started || !d.target || moveError(profileRef.current, d.from, d.target)) return;
      // Onde o item vai parar: calculado numa cópia, antes de alterar o rascunho (não depende
      // de quando o React executa o updater de `edit`).
      const landed = moveItem(structuredClone(profileRef.current), d.from, d.target);
      if (!landed) return;
      edit((p) => void moveItem(p, d.from, d.target!));
      onSelect(landed);
    };
    // Esc ou o sistema tomando o ponteiro: cancela sem mudar nada.
    const cancel = () => {
      clearSpring();
      setDrag(null);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        cancel();
      }
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
    window.addEventListener("pointercancel", cancel);
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
      window.removeEventListener("pointercancel", cancel);
      window.removeEventListener("keydown", onKey);
    };
    // Só registra ao começar/terminar um arrasto (o resto é lido pelos refs).
  }, [drag === null]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => clearSpring, []);

  const dragging = drag?.started ? drag : null;
  const invalid = dragging?.target ? moveError(profile, dragging.from, dragging.target) : null;
  const state = dragging
    ? {
        activeMain: dragging.target && dragging.target.child === null ? dragging.target.main : dragging.ring,
        activeSub: dragging.target && dragging.target.child !== null && !invalid ? dragging.target.child : null,
        openMain: dragging.ring,
      }
    : { activeMain: selection.main, activeSub: selection.child, openMain: undefined };
  const src = dragging ? (dragging.from.child === null ? items[dragging.from.main] : items[dragging.from.main]?.children?.[dragging.from.child]) : undefined;
  const Icon = src ? getIcon(src.icon) : null;

  return (
    <div
      ref={boxRef}
      className={`preview-editor${dragging ? " is-dragging" : ""}`}
      onPointerDown={onPointerDown}
      data-testid="preview-editor"
      title="Clique para editar · arraste para reorganizar (pare sobre uma fatia com submenu para abrir)"
    >
      {render(state)}
      {dragging && Icon && (
        <div className={`preview-ghost${invalid ? " is-invalid" : ""}`} style={{ left: dragging.x, top: dragging.y }} aria-hidden="true">
          <Icon size={16} />
          <span>{src!.label}</span>
        </div>
      )}
      {dragging && (
        <p className={`preview-drag-hint${invalid && invalid !== "mesmo lugar" ? " is-invalid" : ""}`} role="status">
          {!dragging.target
            ? "Solte sobre uma fatia (ou sobre o sub-anel aberto)"
            : invalid
              ? invalid === "mesmo lugar" ? "Mesmo lugar" : `Não dá: ${invalid}`
              : dragging.target.child === null
                ? `Mover para a posição ${dragging.target.main + 1}`
                : `Mover para o submenu "${items[dragging.target.main]?.label}"`}
        </p>
      )}
    </div>
  );
}
