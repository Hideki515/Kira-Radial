import { WINDOW_LABEL } from "../../shared/ipc";
import { t } from "../../shared/i18n";
import type { Action, MediaCmd, SystemCmd, WindowCmd } from "../../shared/types";
import { Field, Segmented, Toggle } from "../controls";
import { MEDIA, SYSTEM } from "./catalog";

type Props<T extends Action["type"]> = { action: Extract<Action, { type: T }>; onChange: (a: Action) => void };

export function MediaFields({ action, onChange }: Props<"media">) {
  return (
    <Field label={t("act.command")}>
      <select value={action.cmd} onChange={(e) => onChange({ ...action, cmd: e.target.value as MediaCmd })}>
        {MEDIA.map((m) => <option key={m.value} value={m.value}>{m.label}</option>)}
      </select>
    </Field>
  );
}

export function SystemFields({ action, onChange }: Props<"system">) {
  return (
    <Field label={t("act.command")}>
      <select value={action.cmd} onChange={(e) => onChange({ ...action, cmd: e.target.value as SystemCmd })}>
        {SYSTEM.map((m) => <option key={m.value} value={m.value}>{m.label}</option>)}
      </select>
    </Field>
  );
}

export function WindowFields({ action, onChange }: Props<"window">) {
  return (
    <Field label={t("act.command")} hint={t("win.hint")}>
      <select value={action.cmd} onChange={(e) => onChange({ ...action, cmd: e.target.value as WindowCmd })}>
        {(Object.keys(WINDOW_LABEL) as WindowCmd[]).map((c) => <option key={c} value={c}>{WINDOW_LABEL[c]}</option>)}
      </select>
    </Field>
  );
}

export function RadioFields({ action, onChange }: Props<"radio">) {
  return (
    <>
      <Field label={t("radio.field")} group>
        <Segmented
          value={action.kind}
          options={[{ value: "wifi", label: "Wi-Fi" }, { value: "bluetooth", label: "Bluetooth" }]}
          onChange={(k) => onChange({ ...action, kind: k })}
        />
      </Field>
      <Field label={t("radio.onRun")} group>
        <Segmented
          value={action.mode}
          options={[{ value: "toggle", label: t("radio.toggle") }, { value: "on", label: t("radio.on") }, { value: "off", label: t("radio.off") }]}
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
      <Field label={t("act.command")}>
        <textarea rows={4} value={action.command} spellCheck={false} onChange={(e) => onChange({ ...action, command: e.target.value })} />
      </Field>
      <Toggle label={t("script.hidden")} hint={t("script.hidden.hint")} checked={action.hidden} onChange={(hidden) => onChange({ ...action, hidden })} />
    </>
  );
}
