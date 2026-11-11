import { MAX_CUSTOM_THEMES, customThemeErrors, findCustom } from "./customTheme";
import { parseCombo } from "./keys";
import { hasCriteria, whenErrors } from "./schedule";
import { DYNAMIC_KINDS, LAUNCHER_MODES, LIMITS, ORB_LIMITS, SCALE_LIMITS, THEMES, wantsHotkey, type Action, type Theme, type Config, type MenuItem } from "./types";

/** Valida a configuração inteira. Retorna mensagens legíveis; lista vazia = válida. */
export function validateConfig(c: Config): string[] {
  const errors: string[] = [];
  const mode = c.launcher?.mode ?? "hotkey";
  if (!LAUNCHER_MODES.includes(mode)) errors.push(`Modo de abertura desconhecido: "${mode}".`);
  // No modo "só ícone" o atalho fica desligado: não bloqueia salvar.
  if (wantsHotkey(mode)) {
    if (!parseCombo(c.hotkey.accelerator)) errors.push(`Atalho inválido: "${c.hotkey.accelerator}"`);
    else if (!parseCombo(c.hotkey.accelerator)!.mods.length)
      errors.push("O atalho global precisa de pelo menos um modificador (Ctrl, Alt, Shift ou Win).");
  }
  const orb = c.launcher?.orb;
  if (orb) {
    if (!(orb.size >= ORB_LIMITS.minSize && orb.size <= ORB_LIMITS.maxSize))
      errors.push(`Tamanho do ícone deve estar entre ${ORB_LIMITS.minSize} e ${ORB_LIMITS.maxSize} px.`);
    if (!(orb.opacityIdle >= ORB_LIMITS.minOpacity && orb.opacityIdle <= ORB_LIMITS.maxOpacity))
      errors.push("Opacidade do ícone deve estar entre 40% e 100%.");
  }
  if (!(c.appearance.scale >= SCALE_LIMITS.min && c.appearance.scale <= SCALE_LIMITS.max))
    errors.push(`Tamanho do menu deve estar entre ${SCALE_LIMITS.min * 100}% e ${SCALE_LIMITS.max * 100}%.`);
  const theme = c.appearance.theme;
  if (theme !== undefined && !THEMES.includes(theme as Theme) && !findCustom(theme, c.appearance.customThemes))
    errors.push(`Tema desconhecido: "${theme}".`);
  const customs = c.appearance.customThemes ?? [];
  if (customs.length > MAX_CUSTOM_THEMES) errors.push(`No máximo ${MAX_CUSTOM_THEMES} temas personalizados.`);
  customs.forEach((ct) => customThemeErrors(ct).forEach((e) => errors.push(`Tema "${ct.name || ct.id}": ${e}`)));
  const snd = c.appearance.sounds;
  if (snd && !(snd.volume >= 0 && snd.volume <= 1)) errors.push("Volume dos sons deve estar entre 0% e 100%.");
  if (!c.profiles.length) errors.push("É necessário ao menos um perfil.");

  const ids = new Set<string>();
  c.profiles.forEach((p, pi) => {
    const where = `Perfil "${p.name || pi + 1}"`;
    if (!p.name.trim()) errors.push(`${where}: nome vazio.`);
    if (ids.has(p.id)) errors.push(`${where}: id duplicado.`);
    ids.add(p.id);
    if (pi > 0 && !(p.matchExe ?? []).length && !hasCriteria(p.when))
      errors.push(`${where}: associe um executável ou defina "Quando usar".`);
    whenErrors(p.when).forEach((e) => errors.push(`${where}: ${e}`));
    if (p.items.length < LIMITS.minSlices || p.items.length > LIMITS.maxSlices)
      errors.push(`${where}: use de ${LIMITS.minSlices} a ${LIMITS.maxSlices} fatias (tem ${p.items.length}).`);
    p.items.forEach((it) => validateItem(it, `${where} › ${it.label || "(sem nome)"}`, true, errors));
  });
  return errors;
}

function validateItem(it: MenuItem, where: string, allowChildren: boolean, errors: string[]) {
  if (!it.label.trim()) errors.push(`${where}: rótulo vazio.`);
  if (it.dynamic) {
    if (!allowChildren) errors.push(`${where}: submenu automático só em fatias principais.`);
    if (!DYNAMIC_KINDS.includes(it.dynamic)) errors.push(`${where}: submenu automático desconhecido ("${it.dynamic}").`);
    return;
  }
  const kids = it.children ?? [];
  if (kids.length) {
    if (!allowChildren) errors.push(`${where}: submenus só têm um nível.`);
    if (kids.length > LIMITS.maxChildren) errors.push(`${where}: máximo de ${LIMITS.maxChildren} subitens.`);
    kids.forEach((k) => validateItem(k, `${where} › ${k.label || "(sem nome)"}`, false, errors));
  } else if (!it.action) {
    errors.push(`${where}: defina uma ação ou subitens.`);
  } else {
    const e = validateAction(it.action);
    if (e) errors.push(`${where}: ${e}`);
  }
}

export function validateAction(a: Action): string | null {
  switch (a.type) {
    case "launch": return a.path.trim() ? null : "informe o programa/arquivo.";
    case "folder": return a.path.trim() ? null : "informe a pasta.";
    case "url": {
      const u = a.url.trim();
      if (!/^(https?:\/\/|mailto:)/i.test(u)) return "URL deve começar com http://, https:// ou mailto:.";
      const inBrowser = (!!a.browser && a.browser !== "system") || !!a.private;
      // Num navegador escolhido o endereço vai como um único argumento: sem espaços nem aspas.
      if (inBrowser && /^https?:/i.test(u) && /[\s"]/.test(u)) return 'endereço com espaço ou aspas (troque o espaço por %20).';
      if (inBrowser && u.length > 2048) return "endereço longo demais para abrir num navegador escolhido (máx. 2048 caracteres).";
      if (a.profile !== undefined && !/^[A-Za-z0-9 _-]{1,64}$/.test(a.profile)) return "perfil do navegador inválido.";
      return null;
    }
    case "keys":
      if (!parseCombo(a.combo)) return `combinação inválida "${a.combo}".`;
      if (a.delayMs !== undefined && (!Number.isInteger(a.delayMs) || a.delayMs < 0 || a.delayMs > 10000))
        return "o atraso deve ser um número inteiro entre 0 e 10000 ms.";
      return null;
    case "script": return a.command.trim() ? null : "comando vazio.";
    case "brightness":
      if (a.mode === "set" && !(Number.isInteger(a.value) && a.value! >= 0 && a.value! <= 100)) return "o brilho deve ser um inteiro de 0 a 100.";
      return null;
    case "audioOutput":
      if (a.mode === "set" && !a.deviceId?.trim() && !a.deviceName?.trim()) return "escolha o dispositivo de saída.";
      return null;
    default: return null;
  }
}
