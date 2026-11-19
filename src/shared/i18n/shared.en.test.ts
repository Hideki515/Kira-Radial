import { afterEach, describe, expect, it } from "vitest";
import { diffConfigs } from "../configDiff";
import { cloneConfig, defaultConfig } from "../defaults";
import { describeAction, describeOpenStats } from "../describe";
import { customThemeErrors, importTheme } from "../customTheme";
import { describeDays, whenErrors } from "../schedule";
import type { Action, Config } from "../types";
import { validateAction, validateConfig } from "../validate";
import { setLang } from "./index";

// Validação e descrições em inglês: nada de português (acentos são o sinal).
const PT_MARKS = /[ãõçáéíóúâêôà]/i;

afterEach(() => setLang("pt"));

const ACTIONS: Action[] = [
  { type: "launch", path: "x.exe" },
  { type: "folder", path: "C:/x" },
  { type: "url", url: "https://a.b", browser: "chrome", browserName: "Chrome", private: true },
  { type: "keys", combo: "Ctrl+C" },
  { type: "media", cmd: "next" },
  { type: "system", cmd: "lock" },
  { type: "script", shell: "cmd", command: "dir", hidden: false },
  { type: "openSettings" },
  { type: "window", cmd: "snapLeft" },
  { type: "paste", index: 0 } as Action,
  { type: "radio", kind: "wifi", mode: "toggle" },
  { type: "brightness", mode: "set", value: 50, target: "lcd" },
  { type: "brightness", mode: "up", target: "cursor" },
  { type: "powerPlan", guid: "g" } as Action,
  { type: "focusWindow", hwnd: 1 } as Action,
  { type: "discord", cmd: "toggleDeafen" },
  { type: "discord", cmd: "setInput", deviceName: "Mic" },
  { type: "sequence", steps: [{ type: "media", cmd: "mute" }, { type: "media", cmd: "next" }] },
  { type: "audioOutput", mode: "cycle" },
  { type: "audioOutput", mode: "set", deviceName: "Fone" },
];

/** Config cheia de problemas: cada mensagem de validação aparece. */
function broken(): Config {
  const c = cloneConfig(defaultConfig);
  c.hotkey.accelerator = "A";
  c.appearance.scale = 99;
  c.appearance.theme = "nope" as never;
  c.launcher.orb.size = 1;
  c.launcher.orb.opacityIdle = 0;
  c.profiles[0].name = " ";
  c.profiles[0].items[0].label = "";
  c.profiles[0].items[1].action = { type: "url", url: "ftp://x" };
  c.profiles.push({ ...structuredClone(c.profiles[0]), id: c.profiles[0].id, name: "B", items: c.profiles[0].items.slice(0, 2) });
  return c;
}

describe("src/shared em inglês", () => {
  it("validação sem português", () => {
    setLang("en");
    const errors = validateConfig(broken());
    expect(errors.length).toBeGreaterThan(6);
    for (const e of errors) expect(e, e).not.toMatch(PT_MARKS);
    const bad: Action[] = [
      { type: "launch", path: " " },
      { type: "keys", combo: "??", delayMs: -1 },
      { type: "brightness", mode: "set", value: 500 },
      { type: "audioOutput", mode: "set" },
      { type: "sequence", steps: [{ type: "system", cmd: "shutdown" }, { type: "media", cmd: "next" }] },
      { type: "discord", cmd: "setOutput" },
    ];
    for (const a of bad) expect(validateAction(a) ?? "", a.type).not.toMatch(PT_MARKS);
    expect(whenErrors({ from: "25:00", to: "26:00", days: [9] }).join(" ")).not.toMatch(PT_MARKS);
    expect(customThemeErrors({ id: "x", name: "", base: "zzz", colors: {} } as never).join(" ")).not.toMatch(PT_MARKS);
    expect(() => importTheme("{")).toThrow(/not valid JSON/);
  });

  it("descrições sem português (e em português continuam como antes)", () => {
    const pt = ACTIONS.map(describeAction);
    expect(pt).toContain("Sequência: 2 ações");
    setLang("en");
    for (const a of ACTIONS) expect(describeAction(a), a.type).not.toMatch(PT_MARKS);
    expect(describeAction(ACTIONS[17])).toBe("Sequence: 2 actions");
    expect(describeDays([1, 2, 3, 4, 5])).toBe("Mon–Fri");
    expect(describeOpenStats({ count: 3, avgMs: 10, p90Ms: 12, maxMs: 20, lastMs: 9 })).toMatch(/^average 10 ms/);
    const a = cloneConfig(defaultConfig);
    const b = cloneConfig(defaultConfig);
    // Nomes de perfil e fatia são do usuário (a config padrão vem em português).
    for (const c of [a, b]) {
      c.profiles[0].name = "Default";
      c.profiles[0].items.forEach((it, i) => (it.label = `Item ${i}`));
    }
    b.hotkey.accelerator = "Ctrl+Q";
    b.profiles[0].items.reverse();
    expect(diffConfigs(a, b).join(" ")).not.toMatch(PT_MARKS);
  });
});
