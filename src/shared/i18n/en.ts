// English texts. Same keys as pt.ts (TypeScript fails if one is missing).
import { enSettings } from "./en.settings";
import { enShared } from "./en.shared";
import type { Key } from "./pt";

export const en: Record<Key, string> = {
  // --- common
  "common.loading": "Loading…",
  "common.cancel": "Cancel",
  "common.close": "Close",

  // --- automatic submenus (generated items)
  "dyn.none.outputs": "No outputs",
  "dyn.none.inputs": "No inputs",
  "dyn.none.windows": "No windows",
  "dyn.none.power": "No plans",
  "dyn.none.brightness": "Not supported",
  "dyn.none.radios": "No radios",
  "dyn.none.recent": "Nothing recent",
  "dyn.none.clipboard": "Empty",
  "dyn.none.vscode": "No projects",
  "dyn.none.vpns": "No VPNs",
  "dyn.radio.on": "{name} on",
  "dyn.radio.off": "{name} off",
  "dyn.discord.closed": "Discord closed",
  "dyn.discord.notConnected": "Connect in Settings",
  "dyn.discord.error": "Discord not responding",
  "dyn.discord.micOn": "Mic on",
  "dyn.discord.micMuted": "Mic muted",
  "dyn.discord.audioOn": "Sound on",
  "dyn.discord.deafened": "Deafened",
  "dyn.discord.default": "Default",

  // --- automatic submenu names and hints (Items page)
  "dyn.label.audioOutputs": "Audio outputs",
  "dyn.label.windows": "Open windows",
  "dyn.label.powerPlans": "Power plans",
  "dyn.label.brightness": "Screen brightness",
  "dyn.label.radios": "Wi-Fi and Bluetooth",
  "dyn.label.recentFiles": "Recent files",
  "dyn.label.clipboard": "Clipboard",
  "dyn.label.discordVoice": "Discord: mic and headset",
  "dyn.label.discordInput": "Discord: input (mic)",
  "dyn.label.discordOutput": "Discord: output (headset)",
  "dyn.label.vscodeProjects": "VS Code projects",
  "dyn.label.vpns": "VPNs",
  "dyn.hint.audioOutputs": "the audio outputs Windows knows about. The one in use is green; click another to switch.",
  "dyn.hint.windows": "the most recent open windows, with each app's icon. Click one to bring it to the front.",
  "dyn.hint.powerPlans": "the Windows power plans. The active one is green; click another to switch.",
  "dyn.hint.brightness": "brightness levels (10% to 100%) for the screen chosen below — the laptop screen and monitors with DDC/CI. The level closest to the current one is green.",
  "dyn.hint.radios": "the PC's Wi-Fi and Bluetooth. On is green; click to turn on/off.",
  "dyn.hint.recentFiles": "files recently opened in Windows (the same as \"Recent\" in File Explorer). Click to open.",
  "dyn.hint.clipboard": "the last copied texts. Click to paste into the app you were using. Turn on the history in Settings → General (kept in memory only).",
  "dyn.hint.discordVoice": "Discord's mic and headset, with the current state (green = on). Click to mute/unmute or deafen. Connect it in Settings → Discord.",
  "dyn.hint.discordInput": "the microphones Discord knows about (Discord's own, not Windows'). The current one is green. Connect it in Settings → Discord.",
  "dyn.hint.discordOutput": "the audio outputs Discord knows about (Discord's own, not Windows'). The current one is green. Connect it in Settings → Discord.",
  "dyn.hint.vscodeProjects": "the folders and workspaces recently opened in VS Code (the same as \"Open Recent\"). Click to open in VS Code.",
  "dyn.hint.vpns": "the VPNs saved in Windows (Settings → Network → VPN). The connected one is green; click to connect or disconnect. Uses the saved user name and password; without them, opens the Windows connection window.",

  // --- menu center
  "hub.back": "Back",
  "hub.search": "SEARCH",
  "hub.results.none": "NONE",
  "hub.results.one": "{n} RESULT",
  "hub.results.many": "{n} RESULTS",
  "hub.escClears": "ESC CLEARS",

  // --- menu
  "menu.failed": "{label} failed: {error}",
  "menu.devHint": "Browser mode · right-click opens at the cursor · Esc closes · arrows/wheel navigate ·",
  "menu.devSettings": "settings",
  "menu.aria": "Radial menu",
  "orb.aria": "Open the Kira menu",

  // --- confirmation
  "confirm.shutdown.title": "Shut Down",
  "confirm.shutdown.message": "Are you sure you want to shut down?",
  "confirm.shutdown.button": "Shut Down",
  "confirm.restart.title": "Restart",
  "confirm.restart.message": "Are you sure you want to restart?",
  "confirm.restart.button": "Restart",
  "confirm.signout.title": "Sign Out",
  "confirm.signout.message": "Are you sure you want to sign out?",
  "confirm.signout.button": "Sign Out",

  // --- screenshot preview
  "shot.title": "Screenshot · {w}×{h}",
  "shot.copy": "Copy",
  "shot.copied": "Copied!",
  "shot.saveAs": "Save as…",
  "shot.saveShort": "Save",
  "shot.savedTo": "Saved to {path}",
  "shot.openFolder": "Open folder",
  "shot.folderShort": "Folder",
  "shot.edit": "Edit",
  "shot.pin": "Pin to screen",
  "shot.pinShort": "Pin",
  "shot.inClipboard": "It's also on the clipboard.",
  "shot.alt": "Screenshot, {w}×{h}",
  "shot.pinAlt": "Pinned screenshot, {w}×{h}",
  "shot.pinClose": "Close (Esc)",

  // --- interface error
  "error.title": "Something went wrong.",
  "error.hint": "The error was written to the log (Settings → Diagnostics).",
  "error.reload": "Reload",

  // --- language (Settings → General)
  "lang.label": "Idioma / Language",
  "lang.hint": "Automatic uses Portuguese if it is in your Windows language list.",
  "lang.auto": "Automatic",
  "lang.pt": "Português",
  "lang.en": "English",

  // --- Settings (en.settings.ts)
  ...enSettings,
  ...enShared,
};
