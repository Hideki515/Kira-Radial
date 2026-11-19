// Tipos de ação editáveis, comandos e a ação padrão de cada tipo.
import type { Action, MediaCmd, SystemCmd } from "../../shared/types";

/** Tipos editáveis (focusWindow é gerado pelo submenu "Janelas abertas"). */
export type ActionType = Exclude<Action["type"], "focusWindow" | "powerPlan" | "paste">;

export const ACTION_TYPES: { value: ActionType; label: string }[] = [
  { value: "launch", label: "Abrir programa / arquivo" },
  { value: "folder", label: "Abrir pasta" },
  { value: "url", label: "Abrir site (URL)" },
  { value: "keys", label: "Enviar atalho de teclado" },
  { value: "media", label: "Controle de mídia" },
  { value: "system", label: "Comando do sistema" },
  { value: "script", label: "Script (PowerShell / CMD)" },
  { value: "audioOutput", label: "Trocar saída de áudio" },
  { value: "window", label: "Controlar a janela ativa" },
  { value: "brightness", label: "Brilho da tela" },
  { value: "radio", label: "Wi-Fi / Bluetooth" },
  { value: "discord", label: "Discord (microfone, fone, dispositivos)" },
  { value: "openSettings", label: "Abrir estas configurações" },
];

export const MEDIA: { value: MediaCmd; label: string }[] = [
  { value: "playpause", label: "Play / Pause" },
  { value: "next", label: "Próxima faixa" },
  { value: "prev", label: "Faixa anterior" },
  { value: "volup", label: "Aumentar volume" },
  { value: "voldown", label: "Diminuir volume" },
  { value: "mute", label: "Mudo" },
];

export const SYSTEM: { value: SystemCmd; label: string }[] = [
  { value: "lock", label: "Bloquear tela" },
  { value: "sleep", label: "Suspender" },
  { value: "shutdown", label: "Desligar (pede confirmação)" },
  { value: "restart", label: "Reiniciar (pede confirmação)" },
  { value: "signout", label: "Encerrar sessão (pede confirmação)" },
  { value: "screenshot", label: "Captura de tela (Win+Shift+S)" },
  { value: "taskmgr", label: "Gerenciador de Tarefas" },
  { value: "settings", label: "Configurações do Windows" },
];

export function defaultAction(type: ActionType): Action {
  switch (type) {
    case "launch": return { type, path: "" };
    case "folder": return { type, path: "" };
    case "url": return { type, url: "https://" };
    case "keys": return { type, combo: "" };
    case "media": return { type, cmd: "playpause" };
    case "system": return { type, cmd: "lock" };
    case "script": return { type, shell: "powershell", command: "", hidden: false };
    case "openSettings": return { type };
    case "audioOutput": return { type, mode: "cycle" };
    case "window": return { type, cmd: "maximize" };
    case "brightness": return { type, mode: "up" };
    case "radio": return { type, kind: "wifi", mode: "toggle" };
    case "discord": return { type, cmd: "toggleMute" };
  }
}
