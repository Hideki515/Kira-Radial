import { RefreshCw } from "lucide-react";
import { t } from "../../shared/i18n";
import { useCallback, useEffect, useState } from "react";
import { DISCORD_LABEL, discordVoice, type DiscordVoiceState } from "../../shared/ipc";
import type { Action, DiscordCmd } from "../../shared/types";
import { Field } from "../controls";

type DiscordAction = Extract<Action, { type: "discord" }>;

/** Mensagem curta quando o Discord não está disponível para listar dispositivos. */
export function discordStateMessage(s: DiscordVoiceState): string | null {
  if (s.status === "ok") return null;
  if (s.status === "notConnected") return t("dc.notConnected");
  if (s.status === "closed") return t("dc.closed");
  return s.message || t("dc.noAnswer");
}

export function DiscordFields({ action, onChange }: { action: DiscordAction; onChange: (a: Action) => void }) {
  const isDevice = action.cmd === "setInput" || action.cmd === "setOutput";
  const [state, setState] = useState<DiscordVoiceState | null>(null);
  const load = useCallback(() => {
    setState(null);
    discordVoice().then(setState, (e) => setState({ status: "error", message: String(e) }));
  }, []);
  useEffect(() => {
    if (isDevice) load();
  }, [isDevice, load]);

  const kind = action.cmd === "setInput" ? "input" : "output";
  const list = state?.voice?.[kind];
  const devices = list?.devices ?? [];
  const low = (s: string) => s.trim().toLowerCase();
  const selected =
    devices.find((d) => action.deviceId && d.id === action.deviceId) ??
    devices.find((d) => action.deviceName && low(d.name) === low(action.deviceName));
  const MISSING = "__missing__";
  const missing = !!(action.deviceId || action.deviceName) && state !== null && !selected;
  const value = selected ? selected.id : missing ? MISSING : "";
  const problem = state ? discordStateMessage(state) : null;

  return (
    <>
      <Field label={t("act.command")} hint={t("dc.command.hint")}>
        <select
          aria-label={t("dc.command.aria")}
          value={action.cmd}
          onChange={(e) => onChange({ type: "discord", cmd: e.target.value as DiscordCmd })}
        >
          {(Object.keys(DISCORD_LABEL) as DiscordCmd[]).map((c) => <option key={c} value={c}>{DISCORD_LABEL[c]}</option>)}
        </select>
      </Field>
      {isDevice && (
        <Field group label={kind === "input" ? t("dc.input") : t("dc.output")} hint={t("dc.devices.hint")}>
          <div className="input-row">
            <select
              aria-label={t("dc.device.aria")}
              value={value}
              disabled={state === null || !devices.length}
              onChange={(e) => {
                const d = devices.find((x) => x.id === e.target.value);
                if (d) onChange({ ...action, deviceId: d.id, deviceName: d.name });
              }}
            >
              {state === null && <option value="">{t("act.loading")}</option>}
              {state !== null && !value && <option value="">{t("act.select")}</option>}
              {missing && <option value={MISSING}>{t("dc.notFound", { name: action.deviceName || action.deviceId || "" })}</option>}
              {devices.map((d) => (
                <option key={d.id} value={d.id}>
                  {d.id === list?.current ? t("act.current", { name: d.id === "default" ? t("dc.default") : d.name }) : d.id === "default" ? t("dc.default") : d.name}
                </option>
              ))}
            </select>
            <button type="button" className="icon-btn" title={t("act.refresh")} aria-label={t("act.refresh")} onClick={load}>
              <RefreshCw size={16} />
            </button>
          </div>
          {problem && <span className="inline-error">{problem}</span>}
        </Field>
      )}
    </>
  );
}
