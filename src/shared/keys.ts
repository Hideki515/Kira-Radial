// Parser/normalizador de combinações de teclas ("ctrl + shift + esc" -> "Ctrl+Shift+Esc").
// O lado Rust (actions/keys.rs) faz o mapeamento final para VK codes.

export const MODIFIERS = ["Ctrl", "Alt", "Shift", "Win"] as const;
export type Modifier = (typeof MODIFIERS)[number];

export interface Combo {
  mods: Modifier[];
  key: string;
}

const MOD_ALIASES: Record<string, Modifier> = {
  ctrl: "Ctrl", control: "Ctrl", ctl: "Ctrl",
  alt: "Alt", option: "Alt",
  shift: "Shift",
  win: "Win", meta: "Win", super: "Win", cmd: "Win", windows: "Win",
};

const KEY_ALIASES: Record<string, string> = {
  esc: "Esc", escape: "Esc", enter: "Enter", return: "Enter", tab: "Tab",
  space: "Space", " ": "Space", spacebar: "Space", backspace: "Backspace",
  del: "Delete", delete: "Delete", ins: "Insert", insert: "Insert",
  home: "Home", end: "End", pgup: "PageUp", pageup: "PageUp", pgdn: "PageDown", pagedown: "PageDown",
  up: "Up", arrowup: "Up", down: "Down", arrowdown: "Down", left: "Left", arrowleft: "Left",
  right: "Right", arrowright: "Right", printscreen: "PrintScreen", prtsc: "PrintScreen",
};

function normalizeKey(raw: string): string | null {
  const k = raw.trim();
  if (!k) return null;
  const lower = k.toLowerCase();
  if (KEY_ALIASES[lower]) return KEY_ALIASES[lower];
  if (/^f([1-9]|1[0-9]|2[0-4])$/i.test(k)) return k.toUpperCase();
  if (/^[a-z0-9]$/i.test(k)) return k.toUpperCase();
  if (/^[`\-=[\]\\;',./]$/.test(k)) return k;
  return null;
}

/** Retorna null se a combinação for inválida (sem tecla principal, tecla desconhecida, etc.). */
export function parseCombo(input: string): Combo | null {
  const parts = input.split("+").map((p) => p.trim());
  // "Ctrl++" => tecla "+" não é suportada; partes vazias invalidam.
  if (parts.some((p) => p === "")) return null;
  const mods = new Set<Modifier>();
  let key: string | null = null;
  for (const part of parts) {
    const mod = MOD_ALIASES[part.toLowerCase()];
    if (mod) {
      mods.add(mod);
      continue;
    }
    if (key !== null) return null; // duas teclas principais
    key = normalizeKey(part);
    if (key === null) return null;
  }
  if (key === null) {
    // Combinação só de modificadores: aceita "Win" isolado (abre o Iniciar).
    if (mods.size === 1 && mods.has("Win")) return { mods: [], key: "Win" };
    return null;
  }
  return { mods: MODIFIERS.filter((m) => mods.has(m)), key };
}

export function formatCombo(c: Combo): string {
  return [...c.mods, c.key].join("+");
}

const CODE_KEYS: Record<string, string> = {
  Space: "Space", Enter: "Enter", NumpadEnter: "Enter", Tab: "Tab", Escape: "Esc", Backspace: "Backspace",
  Delete: "Delete", Insert: "Insert", Home: "Home", End: "End", PageUp: "PageUp", PageDown: "PageDown",
  ArrowUp: "Up", ArrowDown: "Down", ArrowLeft: "Left", ArrowRight: "Right", PrintScreen: "PrintScreen",
  Backquote: "`", Minus: "-", Equal: "=", BracketLeft: "[", BracketRight: "]", Backslash: "\\",
  Semicolon: ";", Quote: "'", Comma: ",", Period: ".", Slash: "/",
};

/**
 * Tecla física a partir de `KeyboardEvent.code`, independente do layout.
 * Necessário porque no ABNT2 Ctrl+Alt funciona como AltGr (Ctrl+Alt+Q gera "/")
 * e Shift muda o caractere (Shift+1 = "!"), o que torna `e.key` inútil para atalhos.
 */
export function keyFromCode(code: string): string | null {
  let m: RegExpMatchArray | null;
  if ((m = code.match(/^Key([A-Z])$/))) return m[1];
  if ((m = code.match(/^Digit([0-9])$/))) return m[1];
  if (/^F([1-9]|1[0-9]|2[0-4])$/.test(code)) return code;
  return CODE_KEYS[code] ?? null;
}

const MODIFIER_KEYS = ["Control", "Alt", "AltGraph", "Shift", "Meta", "OS"];

/** Converte um KeyboardEvent (gravador de atalho) em Combo. */
export function comboFromEvent(
  e: Pick<KeyboardEvent, "key" | "ctrlKey" | "altKey" | "shiftKey" | "metaKey"> & { code?: string },
): Combo | null {
  if (MODIFIER_KEYS.includes(e.key)) return null;
  if (e.code && /^(Control|Alt|Shift|Meta|OS)(Left|Right)$/.test(e.code)) return null;
  // Preferir a tecla física; cair para e.key só se o code for desconhecido.
  const key = (e.code && keyFromCode(e.code)) || normalizeKey(e.key === " " ? "Space" : e.key);
  if (!key) return null;
  const mods: Modifier[] = [];
  if (e.ctrlKey) mods.push("Ctrl");
  if (e.altKey) mods.push("Alt");
  if (e.shiftKey) mods.push("Shift");
  if (e.metaKey) mods.push("Win");
  return { mods, key };
}
