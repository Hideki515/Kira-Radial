import { LIMITS, type MenuItem, type Profile } from "../../shared/types";
import { defaultAction } from "../ActionEditor";
import { COLORS, ItemEditor } from "./ItemEditor";
import { ItemTree } from "./ItemTree";

export interface Selection {
  main: number;
  child: number | null;
}

interface Props {
  profile: Profile;
  selection: Selection;
  onSelect: (s: Selection) => void;
  /** Aplica uma mutação ao perfil (sobre uma cópia do rascunho). */
  edit: (fn: (p: Profile) => void) => void;
}

let seq = 0;
const newId = (prefix: string) => `${prefix}-${Date.now().toString(36)}-${(seq++).toString(36)}`;

function move<T>(arr: T[], from: number, to: number) {
  if (to < 0 || to >= arr.length) return;
  const [x] = arr.splice(from, 1);
  arr.splice(to, 0, x);
}

export function ItemsPage({ profile, selection, onSelect, edit }: Props) {
  const items = profile.items;
  const main = items[selection.main];
  const selected: MenuItem | undefined =
    selection.child !== null ? main?.children?.[selection.child] : main;

  const editSelected = (fn: (it: MenuItem) => void) =>
    edit((p) => {
      const m = p.items[selection.main];
      const target = selection.child !== null ? m.children![selection.child] : m;
      fn(target);
    });

  const addMain = () => {
    if (items.length >= LIMITS.maxSlices) return;
    edit((p) => p.items.push({ id: newId("item"), label: "Novo", icon: "app-window", action: defaultAction("launch") }));
    onSelect({ main: items.length, child: null });
  };

  const addChild = (mi: number) => {
    const kids = items[mi].children ?? [];
    if (kids.length >= LIMITS.maxChildren) return;
    edit((p) => {
      const m = p.items[mi];
      m.children = [...(m.children ?? []), { id: newId("sub"), label: "Novo", icon: "app-window", color: COLORS[kids.length % COLORS.length], action: defaultAction("launch") }];
      delete m.action;
    });
    onSelect({ main: mi, child: kids.length });
  };

  const remove = (mi: number, ci: number | null) => {
    if (ci === null && items.length <= LIMITS.minSlices) return;
    edit((p) => {
      if (ci === null) p.items.splice(mi, 1);
      else p.items[mi].children!.splice(ci, 1);
    });
    onSelect(ci === null ? { main: Math.max(0, mi - 1), child: null } : { main: mi, child: null });
  };

  /** Move a fatia (ou subitem) para a posição `to` e mantém a seleção nele. */
  const moveTo = (mi: number, ci: number | null, to: number) => {
    const len = ci === null ? items.length : items[mi].children!.length;
    const from = ci ?? mi;
    if (to < 0 || to >= len || to === from) return;
    edit((p) => (ci === null ? move(p.items, mi, to) : move(p.items[mi].children!, ci, to)));
    onSelect(ci === null ? { main: to, child: null } : { main: mi, child: to });
  };

  return (
    <div className="items-page">
      <ItemTree items={items} selection={selection} onSelect={onSelect} addMain={addMain} addChild={addChild} remove={remove} moveTo={moveTo} />
      {selected && (
        // key: troca de item = editor novo (miniatura do ícone e mensagens não vazam entre itens).
        <ItemEditor key={`${selection.main}-${selection.child}`} selected={selected} isChild={selection.child !== null} editSelected={editSelected} />
      )}
    </div>
  );
}
