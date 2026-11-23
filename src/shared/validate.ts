import { MAX_CUSTOM_THEMES, customThemeErrors, findCustom } from "./customTheme";
import { t } from "./i18n";
import { DISCORD_LABEL } from "./describe";
import { formatCombo, parseCombo } from "./keys";
import { hasCriteria, whenErrors } from "./schedule";
import { DYNAMIC_KINDS, LAUNCHER_MODES, LIMITS, ORB_ANIMATIONS, ORB_LIMITS, SCALE_LIMITS, THEMES, DANGEROUS_SYSTEM, SEQUENCE_LIMITS, knobOf, wantsHotkey, type Action, type Theme, type Config, type MenuItem } from "./types";

/** Teclas do knob: válidas, diferentes entre si e do atalho do menu. */
export function knobErrors(c: Config): string[] {
  const k = knobOf(c);
  if (!k.enabled) return [];
  const errors: string[] = [];
  const names: [string, string][] = [[t("v.knob.press"), k.press], [t("v.knob.right"), k.right], [t("v.knob.left"), k.left]];
  const seen = new Map<string, string>();
  for (const [what, combo] of names) {
    const parsed = parseCombo(combo);
    if (!parsed) {
      errors.push(t("v.knob.badKey", { what }));
      continue;
    }
    const key = formatCombo(parsed).toLowerCase();
    if (seen.has(key)) errors.push(t("v.knob.dupKey", { combo, a: seen.get(key) ?? "", b: what }));
    seen.set(key, what);
  }
  const menu = parseCombo(c.hotkey.accelerator);
  if (wantsHotkey(c.launcher?.mode ?? "hotkey") && menu && seen.has(formatCombo(menu).toLowerCase()))
    errors.push(t("v.knob.menuKey", { combo: c.hotkey.accelerator }));
  return errors;
}

/** Pode ser atalho global sozinho? Precisa de Ctrl/Alt/Shift/Win, exceto F1–F24 (não digitam texto). */
export function hotkeyComboOk(combo: string): boolean {
  const p = parseCombo(combo);
  return !!p && (p.mods.length > 0 || /^F([1-9]|1[0-9]|2[0-4])$/.test(p.key));
}

/** Atalhos de fatia: válidos, sem repetir e sem bater com o atalho do menu ou do knob. */
export function itemHotkeyErrors(c: Config): string[] {
  const errors: string[] = [];
  const taken = new Map<string, string>();
  const norm = (s: string) => {
    const p = parseCombo(s);
    return p ? formatCombo(p).toLowerCase() : s.toLowerCase();
  };
  if (wantsHotkey(c.launcher?.mode ?? "hotkey") && parseCombo(c.hotkey.accelerator)) taken.set(norm(c.hotkey.accelerator), t("v.hk.menu"));
  const k = knobOf(c);
  if (k.enabled) for (const key of [k.press, k.right, k.left]) if (parseCombo(key)) taken.set(norm(key), t("v.hk.knob"));
  const visit = (it: MenuItem) => {
    const hk = it.hotkey?.trim();
    if (!hk) return;
    const name = t("v.hk.name", { label: it.label || "?" });
    if (!hotkeyComboOk(hk)) return void errors.push(t("v.hk.bad", { name, hk }));
    if (!it.action || it.children || it.dynamic) return void errors.push(t("v.hk.onlyActions", { name }));
    if (it.action.type === "system" && DANGEROUS_SYSTEM.includes(it.action.cmd))
      return void errors.push(t("v.hk.dangerous", { name }));
    const n = norm(hk);
    const other = taken.get(n);
    if (other) return void errors.push(t("v.hk.taken", { name, hk, other }));
    taken.set(n, `"${it.label}"`);
  };
  for (const p of c.profiles ?? []) for (const it of p.items ?? []) {
    visit(it);
    (it.children ?? []).forEach(visit);
  }
  return errors;
}

/** Valida a configuração inteira. Retorna mensagens legíveis; lista vazia = válida. */
export function validateConfig(c: Config): string[] {
  const errors: string[] = [...knobErrors(c), ...itemHotkeyErrors(c)];
  const mode = c.launcher?.mode ?? "hotkey";
  if (!LAUNCHER_MODES.includes(mode)) errors.push(t("v.launcherMode", { mode }));
  // No modo "só ícone" o atalho fica desligado: não bloqueia salvar.
  if (wantsHotkey(mode)) {
    if (!parseCombo(c.hotkey.accelerator)) errors.push(t("v.hotkey.bad", { combo: c.hotkey.accelerator }));
    else if (!parseCombo(c.hotkey.accelerator)!.mods.length)
      errors.push(t("v.hotkey.mod"));
  }
  const orb = c.launcher?.orb;
  if (orb) {
    if (!(orb.size >= ORB_LIMITS.minSize && orb.size <= ORB_LIMITS.maxSize))
      errors.push(t("v.orb.size", { min: ORB_LIMITS.minSize, max: ORB_LIMITS.maxSize }));
    if (!(orb.opacityIdle >= ORB_LIMITS.minOpacity && orb.opacityIdle <= ORB_LIMITS.maxOpacity))
      errors.push(t("v.orb.opacity"));
    if (orb.animation !== undefined && !ORB_ANIMATIONS.includes(orb.animation)) errors.push(t("v.orb.anim", { anim: String(orb.animation) }));
  }
  if (!(c.appearance.scale >= SCALE_LIMITS.min && c.appearance.scale <= SCALE_LIMITS.max))
    errors.push(t("v.scale", { min: SCALE_LIMITS.min * 100, max: SCALE_LIMITS.max * 100 }));
  const theme = c.appearance.theme;
  if (theme !== undefined && !THEMES.includes(theme as Theme) && !findCustom(theme, c.appearance.customThemes))
    errors.push(t("v.theme", { theme }));
  const rawCustoms: unknown = c.appearance.customThemes;
  if (rawCustoms !== undefined && !Array.isArray(rawCustoms)) errors.push(t("v.customs.format"));
  const customs = Array.isArray(rawCustoms) ? (rawCustoms as NonNullable<typeof c.appearance.customThemes>) : [];
  if (customs.length > MAX_CUSTOM_THEMES) errors.push(t("v.customs.max", { max: MAX_CUSTOM_THEMES }));
  customs.forEach((ct) => customThemeErrors(ct).forEach((e) => errors.push(t("v.customs.item", { name: (ct && (ct.name || ct.id)) || "?", error: e }))));
  const snd = c.appearance.sounds;
  if (snd && !(snd.volume >= 0 && snd.volume <= 1)) errors.push(t("v.sound.volume"));
  if (!c.profiles.length) errors.push(t("v.profiles.none"));

  const ids = new Set<string>();
  c.profiles.forEach((p, pi) => {
    const where = t("v.profile.where", { name: p.name || pi + 1 });
    if (!p.name.trim()) errors.push(t("v.profile.noName", { where }));
    if (ids.has(p.id)) errors.push(t("v.profile.dupId", { where }));
    ids.add(p.id);
    if (pi > 0 && !(p.matchExe ?? []).length && !hasCriteria(p.when))
      errors.push(t("v.profile.noRule", { where }));
    whenErrors(p.when).forEach((e) => errors.push(t("v.item.err", { where, error: e })));
    if (p.items.length < LIMITS.minSlices || p.items.length > LIMITS.maxSlices)
      errors.push(t("v.profile.slices", { where, min: LIMITS.minSlices, max: LIMITS.maxSlices, n: p.items.length }));
    p.items.forEach((it) => validateItem(it, `${where} › ${it.label || t("v.noName")}`, true, errors));
  });
  return errors;
}

function validateItem(it: MenuItem, where: string, allowChildren: boolean, errors: string[]) {
  if (!it.label.trim()) errors.push(t("v.item.noLabel", { where }));
  if (it.dynamic) {
    if (!allowChildren) errors.push(t("v.item.dynOnlyMain", { where }));
    if (!DYNAMIC_KINDS.includes(it.dynamic)) errors.push(t("v.item.dynUnknown", { where, kind: it.dynamic }));
    if (it.dynamicTarget !== undefined && !validBrightnessTarget(it.dynamicTarget)) errors.push(t("v.item.brightTarget", { where }));
    return;
  }
  const kids = it.children ?? [];
  if (kids.length) {
    if (!allowChildren) errors.push(t("v.item.oneLevel", { where }));
    if (kids.length > LIMITS.maxChildren) errors.push(t("v.item.maxChildren", { where, max: LIMITS.maxChildren }));
    kids.forEach((k) => validateItem(k, `${where} › ${k.label || t("v.noName")}`, false, errors));
  } else if (!it.action) {
    errors.push(t("v.item.noAction", { where }));
  } else {
    const e = validateAction(it.action);
    if (e) errors.push(t("v.item.err", { where, error: e }));
  }
}

/** Alvo do brilho: all, cursor, lcd, ddc:N ou mon:<id>. */
export function validBrightnessTarget(t: unknown): boolean {
  return typeof t === "string" && (["all", "cursor", "lcd"].includes(t) || /^ddc:\d{1,3}$/.test(t) || /^mon:.{1,300}$/.test(t));
}

export function validateAction(a: Action): string | null {
  switch (a.type) {
    case "launch": return a.path.trim() ? null : t("v.a.launch");
    case "folder": return a.path.trim() ? null : t("v.a.folder");
    case "url": {
      const u = a.url.trim();
      if (!/^(https?:\/\/|mailto:)/i.test(u)) return t("v.a.urlScheme");
      const inBrowser = (!!a.browser && a.browser !== "system") || !!a.private;
      // Num navegador escolhido o endereço vai como um único argumento: sem espaços nem aspas.
      if (inBrowser && /^https?:/i.test(u) && /[\s"]/.test(u)) return t("v.a.urlSpace");
      // Mesmo limite do Rust, que conta bytes UTF-8 (acentos ocupam mais de um).
      if (inBrowser && new TextEncoder().encode(u).length > 2048) return t("v.a.urlLong");
      if (a.profile !== undefined && !/^[A-Za-z0-9 _-]{1,64}$/.test(a.profile)) return t("v.a.browserProfile");
      return null;
    }
    case "keys":
      if (!parseCombo(a.combo)) return t("v.a.combo", { combo: a.combo });
      if (a.delayMs !== undefined && (!Number.isInteger(a.delayMs) || a.delayMs < 0 || a.delayMs > 10000))
        return t("v.a.delay");
      return null;
    case "script": return a.command.trim() ? null : t("v.a.script");
    case "brightness":
      if (a.mode === "set" && !(Number.isInteger(a.value) && a.value! >= 0 && a.value! <= 100)) return t("v.a.bright");
      if (a.target !== undefined && !validBrightnessTarget(a.target)) return t("v.a.brightTarget");
      return null;
    case "audioOutput":
      if (a.mode === "set" && !a.deviceId?.trim() && !a.deviceName?.trim()) return t("v.a.audioDevice");
      return null;
    case "sequence": {
      if (!Array.isArray(a.steps) || a.steps.length < SEQUENCE_LIMITS.min || a.steps.length > SEQUENCE_LIMITS.max)
        return t("v.a.seqCount", { min: SEQUENCE_LIMITS.min, max: SEQUENCE_LIMITS.max });
      if (a.delayMs !== undefined && (!Number.isInteger(a.delayMs) || a.delayMs < 0 || a.delayMs > SEQUENCE_LIMITS.maxDelayMs))
        return t("v.a.seqDelay", { max: SEQUENCE_LIMITS.maxDelayMs });
      for (const [i, s] of a.steps.entries()) {
        if (s.type === "sequence") return t("v.a.seqNested", { n: i + 1 });
        if (s.type === "system" && DANGEROUS_SYSTEM.includes(s.cmd))
          return t("v.a.seqDangerous", { n: i + 1 });
        const e = validateAction(s);
        if (e) return t("v.a.seqStep", { n: i + 1, error: e });
      }
      return null;
    }
    case "vpn": {
      const n = a.name.trim();
      if (!n) return t("v.a.vpnName");
      if (n.length > 256 || /["\u0000-\u001f]/.test(n)) return t("v.a.vpnChars");
      return null;
    }
    case "discord":
      if (!Object.prototype.hasOwnProperty.call(DISCORD_LABEL, a.cmd)) return t("v.a.discordCmd");
      if ((a.cmd === "setInput" || a.cmd === "setOutput") && !a.deviceId?.trim() && !a.deviceName?.trim())
        return t("v.a.discordDevice");
      return null;
    default: return null;
  }
}
