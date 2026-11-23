// Tipos de ação editáveis, comandos e a ação padrão de cada tipo.
import { OBS_CMDS, type Action, type MediaCmd, type ObsCmd, type SystemCmd } from "../../shared/types";
import { t, type Key } from "../../shared/i18n";

/** Opção de lista com o rótulo lido no idioma atual a cada acesso. */
function opt<T extends string>(value: T, key: Key): { value: T; label: string } {
  return { value, get label() { return t(key); } };
}

/** Tipos editáveis (focusWindow é gerado pelo submenu "Janelas abertas"). */
export type ActionType = Exclude<Action["type"], "focusWindow" | "powerPlan" | "paste">;

export const ACTION_TYPES: { value: ActionType; label: string }[] = (
  ["launch", "folder", "url", "keys", "text", "media", "system", "script", "audioOutput", "window", "layout", "brightness", "radio", "vpn", "discord", "obs", "sequence", "openSettings"] as const
).map((v) => opt(v, `act.type.${v}`));

export const MEDIA: { value: MediaCmd; label: string }[] = (
  ["playpause", "next", "prev", "volup", "voldown", "mute"] as const
).map((v) => opt(v, `act.media.${v}`));

export const SYSTEM: { value: SystemCmd; label: string }[] = (
  ["lock", "sleep", "shutdown", "restart", "signout", "screenshot", "taskmgr", "settings"] as const
).map((v) => opt(v, `act.system.${v}`));

export const OBS: { value: ObsCmd; label: string }[] = OBS_CMDS.map((v) => opt(v, `act.obs.${v}`));

export function defaultAction(type: ActionType): Action {
  switch (type) {
    case "launch": return { type, path: "" };
    case "folder": return { type, path: "" };
    case "url": return { type, url: "https://" };
    case "keys": return { type, combo: "" };
    case "text": return { type, text: "" };
    case "layout": return { type, windows: [] };
    case "media": return { type, cmd: "playpause" };
    case "system": return { type, cmd: "lock" };
    case "script": return { type, shell: "powershell", command: "", hidden: false };
    case "openSettings": return { type };
    case "audioOutput": return { type, mode: "cycle" };
    case "window": return { type, cmd: "maximize" };
    case "brightness": return { type, mode: "up" };
    case "radio": return { type, kind: "wifi", mode: "toggle" };
    case "vpn": return { type, name: "", mode: "toggle" };
    case "obs": return { type, cmd: "toggleRecord" };
    case "discord": return { type, cmd: "toggleMute" };
    case "sequence": return { type, steps: [{ type: "launch", path: "" }, { type: "media", cmd: "playpause" }] };
  }
}
