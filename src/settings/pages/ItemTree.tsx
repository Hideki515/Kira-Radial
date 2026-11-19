import { ChevronDown, ChevronUp, CornerDownRight, GripVertical, Plus, Sparkles, Trash2 } from "lucide-react";
import { t } from "../../shared/i18n";
import { useEffect, useRef, useState, type CSSProperties, type KeyboardEvent as ReactKeyboardEvent } from "react";
import { getIcon } from "../../shared/icons";
import { LIMITS, type MenuItem } from "../../shared/types";
import type { Selection } from "./ItemsPage";

interface Props {
  items: MenuItem[];
  selection: Selection;
  onSelect: (s: Selection) => void;
  addMain: () => void;
  addChild: (mi: number) => void;
  remove: (mi: number, ci: number | null) => void;
  /** Move a fatia (ou subitem) para a posição `to`. */
  moveTo: (mi: number, ci: number | null, to: number) => void;
}

/** Lista de fatias e subitens: seleção, reordenar (alça, botões, Alt+↑/↓) e remover. */
export function ItemTree({ items, selection, onSelect, addMain, addChild, remove, moveTo }: Props) {
  const reorder = (mi: number, ci: number | null, d: number) => moveTo(mi, ci, (ci ?? mi) + d);

  // --- Arrastar pela alça (eventos de ponteiro; a API HTML5 de drag é ruim no WebView2) ---
  type Drag = { mi: number; ci: number | null; over: number | null };
  const [drag, setDrag] = useState<Drag | null>(null);
  const dragRef = useRef<Drag | null>(null);
  dragRef.current = drag;
  useEffect(() => {
    if (!drag) return;
    const up = () => {
      const d = dragRef.current;
      setDrag(null);
      if (d && d.over !== null) moveTo(d.mi, d.ci, d.over);
    };
    window.addEventListener("pointerup", up);
    return () => window.removeEventListener("pointerup", up);
  });
  /** Ponteiro passou sobre a linha (mi, ci): vira o destino se for do mesmo grupo. */
  const hover = (mi: number, ci: number | null) => {
    const d = dragRef.current;
    if (!d) return;
    const sameGroup = d.ci === null ? ci === null : ci !== null && mi === d.mi;
    if (sameGroup) setDrag({ ...d, over: ci ?? mi });
  };
  const isDropTarget = (mi: number, ci: number | null) =>
    !!drag && drag.over === (ci ?? mi) && (drag.ci === null ? ci === null : ci !== null && drag.mi === mi) && drag.over !== (drag.ci ?? drag.mi);
  /** Alt+↑/↓ na linha move o item (atalho de teclado). */
  const onRowKey = (mi: number, ci: number | null) => (e: ReactKeyboardEvent) => {
    if (!e.altKey || (e.key !== "ArrowUp" && e.key !== "ArrowDown")) return;
    e.preventDefault();
    reorder(mi, ci, e.key === "ArrowUp" ? -1 : 1);
  };

  return (
  <div className="item-tree">
    <div className="tree-head">
      <span>{t("items.slices", { n: items.length, max: LIMITS.maxSlices })}</span>
      <button type="button" className="btn btn-ghost" onClick={addMain} disabled={items.length >= LIMITS.maxSlices}>
        <Plus size={14} /> {t("items.addSlice")}
      </button>
    </div>
    <ol className="tree-list">
      {items.map((it, mi) => {
        const Icon = getIcon(it.icon);
        const isSel = selection.main === mi && selection.child === null;
        return (
          <li key={it.id}>
            <div
              className={`tree-row${isSel ? " is-selected" : ""}${isDropTarget(mi, null) ? " is-drop" : ""}${drag && drag.ci === null && drag.mi === mi ? " is-dragging" : ""}`}
              onClick={() => onSelect({ main: mi, child: null })}
              onPointerOver={() => hover(mi, null)}
              onKeyDown={onRowKey(mi, null)}
              tabIndex={0}
              data-testid={`row-${mi}`}
            >
              <DragHandle onStart={() => setDrag({ mi, ci: null, over: null })} />
              <Icon size={16} />
              <span className="tree-label">{it.label || t("items.noName")}</span>
                {it.hotkey && <kbd className="tree-hotkey" title={t("items.globalHotkey")}>{it.hotkey}</kbd>}
              {it.dynamic ? (
                <span className="tree-badge" title={t("items.autoBadge")}><Sparkles size={11} /></span>
              ) : it.children?.length ? (
                <span className="tree-badge">{it.children.length}</span>
              ) : null}
              <RowTools
                onUp={() => reorder(mi, null, -1)}
                onDown={() => reorder(mi, null, 1)}
                onDelete={items.length > LIMITS.minSlices ? () => remove(mi, null) : undefined}
              />
            </div>
            {it.children && (
              <ol className="tree-children">
                {it.children.map((ch, ci) => {
                  const CIcon = getIcon(ch.icon);
                  const sel = selection.main === mi && selection.child === ci;
                  return (
                    <li key={ch.id}>
                      <div
                        className={`tree-row is-child${sel ? " is-selected" : ""}${isDropTarget(mi, ci) ? " is-drop" : ""}${drag && drag.ci === ci && drag.mi === mi ? " is-dragging" : ""}`}
                        style={{ "--item-color": ch.color ?? "var(--accent)" } as CSSProperties}
                        onClick={() => onSelect({ main: mi, child: ci })}
                        onPointerOver={() => hover(mi, ci)}
                        onKeyDown={onRowKey(mi, ci)}
                        tabIndex={0}
                        data-testid={`row-${mi}-${ci}`}
                      >
                        <DragHandle onStart={() => setDrag({ mi, ci, over: null })} />
                        <CornerDownRight size={13} className="tree-elbow" />
                        <CIcon size={15} />
                        <span className="tree-label">{ch.label || t("items.noName")}</span>
                          {ch.hotkey && <kbd className="tree-hotkey" title={t("items.globalHotkey")}>{ch.hotkey}</kbd>}
                        <RowTools onUp={() => reorder(mi, ci, -1)} onDown={() => reorder(mi, ci, 1)} onDelete={() => remove(mi, ci)} />
                      </div>
                    </li>
                  );
                })}
                {it.children.length < LIMITS.maxChildren && (
                  <li>
                    <button type="button" className="tree-add" onClick={() => addChild(mi)}>
                      <Plus size={13} /> {t("items.addChild")}
                    </button>
                  </li>
                )}
              </ol>
            )}
          </li>
        );
      })}
    </ol>
  </div>
  );
}

/** Alça de arrastar (inicia o arrasto; o destino é a linha sob o ponteiro). */
function DragHandle({ onStart }: { onStart: () => void }) {
  return (
    <span
      className="drag-handle"
      title={t("items.dragTitle")}
      aria-label={t("items.dragLabel")}
      role="button"
      onPointerDown={(e) => {
        if (e.button !== 0) return;
        e.preventDefault();
        e.stopPropagation();
        onStart();
      }}
      onClick={(e) => e.stopPropagation()}
    >
      <GripVertical size={13} />
    </span>
  );
}

function RowTools({ onUp, onDown, onDelete }: { onUp: () => void; onDown: () => void; onDelete?: () => void }) {
  const stop = (fn: () => void) => (e: React.MouseEvent) => {
    e.stopPropagation();
    fn();
  };
  return (
    <span className="row-tools">
      <button type="button" title={t("items.up")} onClick={stop(onUp)}><ChevronUp size={14} /></button>
      <button type="button" title={t("items.down")} onClick={stop(onDown)}><ChevronDown size={14} /></button>
      {onDelete && <button type="button" title={t("items.remove")} className="danger" onClick={stop(onDelete)}><Trash2 size={14} /></button>}
    </span>
  );
}
