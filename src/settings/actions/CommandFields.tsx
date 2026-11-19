import { WINDOW_LABEL } from "../../shared/ipc";
import type { Action, MediaCmd, SystemCmd, WindowCmd } from "../../shared/types";
import { Field, Segmented, Toggle } from "../controls";
import { MEDIA, SYSTEM } from "./catalog";

type Props<T extends Action["type"]> = { action: Extract<Action, { type: T }>; onChange: (a: Action) => void };

export function MediaFields({ action, onChange }: Props<"media">) {
  return (
    <Field label="Comando">
      <select value={action.cmd} onChange={(e) => onChange({ ...action, cmd: e.target.value as MediaCmd })}>
        {MEDIA.map((m) => <option key={m.value} value={m.value}>{m.label}</option>)}
      </select>
    </Field>
  );
}

export function SystemFields({ action, onChange }: Props<"system">) {
  return (
    <Field label="Comando">
      <select value={action.cmd} onChange={(e) => onChange({ ...action, cmd: e.target.value as SystemCmd })}>
        {SYSTEM.map((m) => <option key={m.value} value={m.value}>{m.label}</option>)}
      </select>
    </Field>
  );
}

export function WindowFields({ action, onChange }: Props<"window">) {
  return (
    <Field label="Comando" hint="Age sobre a janela que estava em uso quando o menu abriu.">
      <select value={action.cmd} onChange={(e) => onChange({ ...action, cmd: e.target.value as WindowCmd })}>
        {(Object.keys(WINDOW_LABEL) as WindowCmd[]).map((c) => <option key={c} value={c}>{WINDOW_LABEL[c]}</option>)}
      </select>
    </Field>
  );
}

export function RadioFields({ action, onChange }: Props<"radio">) {
  return (
    <>
      <Field label="Rádio" group>
        <Segmented
          value={action.kind}
          options={[{ value: "wifi", label: "Wi-Fi" }, { value: "bluetooth", label: "Bluetooth" }]}
          onChange={(k) => onChange({ ...action, kind: k })}
        />
      </Field>
      <Field label="Ao executar" group>
        <Segmented
          value={action.mode}
          options={[{ value: "toggle", label: "Alternar" }, { value: "on", label: "Ligar" }, { value: "off", label: "Desligar" }]}
          onChange={(m) => onChange({ ...action, mode: m })}
        />
      </Field>
    </>
  );
}

export function ScriptFields({ action, onChange }: Props<"script">) {
  return (
    <>
      <Field label="Shell">
        <Segmented
          value={action.shell}
          options={[{ value: "powershell", label: "PowerShell" }, { value: "cmd", label: "CMD" }]}
          onChange={(shell) => onChange({ ...action, shell })}
        />
      </Field>
      <Field label="Comando">
        <textarea rows={4} value={action.command} spellCheck={false} onChange={(e) => onChange({ ...action, command: e.target.value })} />
      </Field>
      <Toggle label="Executar oculto" hint="Sem janela de console. Desligado por padrão: scripts ocultos são um padrão que antivírus costumam tratar como suspeito." checked={action.hidden} onChange={(hidden) => onChange({ ...action, hidden })} />
    </>
  );
}
