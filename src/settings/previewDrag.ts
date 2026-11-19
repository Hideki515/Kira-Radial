// Reorganizar fatias arrastando na pré-visualização (regras puras, testáveis).
import { LIMITS, type MenuItem, type Profile } from "../shared/types";
import { t } from "../shared/i18n";

/** Posição de um item: fatia `main` ou o subitem `child` dela. */
export interface Loc {
  main: number;
  child: number | null;
}

const childrenOf = (p: Profile, main: number): MenuItem[] | undefined => {
  const it = p.items[main];
  return it && !it.dynamic ? it.children : undefined;
};

/** Pode mover `from` para `to`? Devolve o motivo (no idioma atual) se não puder (null = pode). */
export function moveError(p: Profile, from: Loc, to: Loc): string | null {
  if (from.main === to.main && from.child === to.child) return t("drag.samePlace");
  const src = from.child === null ? p.items[from.main] : childrenOf(p, from.main)?.[from.child];
  if (!src) return t("drag.noItem");
  if (to.child === null) {
    // Para o anel principal.
    if (to.main < 0 || to.main >= p.items.length + (from.child === null ? 0 : 1)) return t("drag.badPos");
    if (from.child !== null && p.items.length >= LIMITS.maxSlices) return t("drag.ringFull", { max: LIMITS.maxSlices });
    return null;
  }
  // Para dentro de um submenu.
  const kids = childrenOf(p, to.main);
  if (!kids) return t("drag.notSubmenu");
  if (from.child === null) {
    if (from.main === to.main) return t("drag.ownSubmenu");
    if (src.children || src.dynamic) return t("drag.nested");
    if (p.items.length <= LIMITS.minSlices) return t("drag.ringMin", { min: LIMITS.minSlices });
  }
  const sameParent = from.child !== null && from.main === to.main;
  if (!sameParent && kids.length >= LIMITS.maxChildren) return t("drag.subFull", { max: LIMITS.maxChildren });
  if (to.child < 0 || to.child > kids.length - (sameParent ? 1 : 0)) return t("drag.badPos");
  return null;
}

/** Move (alterando `p`) e devolve onde o item ficou — para manter a seleção nele. */
export function moveItem(p: Profile, from: Loc, to: Loc): Loc | null {
  if (moveError(p, from, to)) return null;
  // Tira da origem.
  let item: MenuItem;
  if (from.child === null) [item] = p.items.splice(from.main, 1);
  else [item] = childrenOf(p, from.main)!.splice(from.child, 1);
  // Índice do destino no anel principal muda se a origem (fatia) estava antes dele.
  let main = to.main;
  if (from.child === null && to.child !== null && from.main < to.main) main -= 1;
  if (to.child === null) {
    p.items.splice(main, 0, item);
    return { main, child: null };
  }
  // Subitem não carrega cor de fatia nem vice-versa: só a posição muda.
  childrenOf(p, main)!.splice(to.child, 0, item);
  return { main, child: to.child };
}
