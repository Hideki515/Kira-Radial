// Contrato entre o menu (RadialApp) e os hooks de entrada (mouse/teclado/roda e knob).
import type { MutableRefObject } from "react";
import type { MenuItem } from "../shared/types";
import type { Hit } from "./geometry";
import type { ConfirmApi } from "./useConfirm";

export type Point = { x: number; y: number };

/** Estado lido pelos handlers globais (sempre o atual, sem re-registrar listeners). */
export interface MenuState {
  activeMain: number | null;
  activeSub: number | null;
  openMain: number | null;
  children: MenuItem[];
  center: Point;
  items: MenuItem[];
  open: boolean;
  origin: Point | null;
}

export interface MenuControls {
  state: MutableRefObject<MenuState>;
  confirm: ConfirmApi;
  /** Item executado por clique desde que o menu abriu (modo "segurar": soltar o atalho não repete). */
  clickedId: MutableRefObject<string | null>;
  setActiveMain: (i: number | null) => void;
  setActiveSub: (i: number | null) => void;
  setHubHovered: (v: boolean) => void;
  openSub: (index: number, selectFirst: boolean) => void;
  closeSub: () => void;
  close: () => void;
  showAt: (x: number, y: number, from?: Point | null) => void;
  execute: (item: MenuItem | undefined, confirmed?: boolean) => Promise<void>;
  executeSelection: (closeIfNothing: boolean) => void;
  computeHit: (clientX: number, clientY: number) => Hit & { r: number };
  nudgeVolume: (up: boolean) => Promise<void>;
  closeOnBlur: boolean;
}
