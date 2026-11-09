import { parseCombo } from "./keys";
import { LIMITS, type Action, type Config, type MenuItem } from "./types";

/** Valida a configuração inteira. Retorna mensagens legíveis; lista vazia = válida. */
export function validateConfig(c: Config): string[] {
  const errors: string[] = [];
  if (!parseCombo(c.hotkey.accelerator)) errors.push(`Atalho inválido: "${c.hotkey.accelerator}"`);
  else if (!parseCombo(c.hotkey.accelerator)!.mods.length)
    errors.push("O atalho global precisa de pelo menos um modificador (Ctrl, Alt, Shift ou Win).");
  if (c.appearance.scale < 0.5 || c.appearance.scale > 1.6) errors.push("Escala deve estar entre 0,5 e 1,6.");
  if (!c.profiles.length) errors.push("É necessário ao menos um perfil.");

  const ids = new Set<string>();
  c.profiles.forEach((p, pi) => {
    const where = `Perfil "${p.name || pi + 1}"`;
    if (!p.name.trim()) errors.push(`${where}: nome vazio.`);
    if (ids.has(p.id)) errors.push(`${where}: id duplicado.`);
    ids.add(p.id);
    if (pi > 0 && !(p.matchExe ?? []).length) errors.push(`${where}: associe ao menos um executável.`);
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
    case "url": return /^(https?:\/\/|mailto:)/i.test(a.url.trim()) ? null : "URL deve começar com http://, https:// ou mailto:.";
    case "keys":
      if (!parseCombo(a.combo)) return `combinação inválida "${a.combo}".`;
      if (a.delayMs !== undefined && (!Number.isInteger(a.delayMs) || a.delayMs < 0 || a.delayMs > 10000))
        return "o atraso deve ser um número inteiro entre 0 e 10000 ms.";
      return null;
    case "script": return a.command.trim() ? null : "comando vazio.";
    case "audioOutput":
      if (a.mode === "set" && !a.deviceId?.trim() && !a.deviceName?.trim()) return "escolha o dispositivo de saída.";
      return null;
    default: return null;
  }
}
