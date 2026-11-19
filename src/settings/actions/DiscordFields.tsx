import { RefreshCw } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { DISCORD_LABEL, discordVoice, type DiscordVoiceState } from "../../shared/ipc";
import type { Action, DiscordCmd } from "../../shared/types";
import { Field } from "../controls";

type DiscordAction = Extract<Action, { type: "discord" }>;

/** Mensagem curta quando o Discord não está disponível para listar dispositivos. */
export function discordStateMessage(s: DiscordVoiceState): string | null {
  if (s.status === "ok") return null;
  if (s.status === "notConnected") return "Conecte o Discord na página Discord (menu à esquerda) para listar os dispositivos.";
  if (s.status === "closed") return "Abra o Discord para listar os dispositivos.";
  return s.message || "O Discord não respondeu.";
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
      <Field label="Comando" hint="Vale para o Discord aberto neste PC. Precisa conectar uma vez na página Discord.">
        <select
          aria-label="Comando do Discord"
          value={action.cmd}
          onChange={(e) => onChange({ type: "discord", cmd: e.target.value as DiscordCmd })}
        >
          {(Object.keys(DISCORD_LABEL) as DiscordCmd[]).map((c) => <option key={c} value={c}>{DISCORD_LABEL[c]}</option>)}
        </select>
      </Field>
      {isDevice && (
        <Field group label={kind === "input" ? "Microfone do Discord" : "Saída do Discord"} hint="São os dispositivos do Discord (Configurações de voz do Discord), não os do Windows.">
          <div className="input-row">
            <select
              aria-label="Dispositivo do Discord"
              value={value}
              disabled={state === null || !devices.length}
              onChange={(e) => {
                const d = devices.find((x) => x.id === e.target.value);
                if (d) onChange({ ...action, deviceId: d.id, deviceName: d.name });
              }}
            >
              {state === null && <option value="">Carregando…</option>}
              {state !== null && !value && <option value="">Selecione…</option>}
              {missing && <option value={MISSING}>{`${action.deviceName || action.deviceId} (não encontrado)`}</option>}
              {devices.map((d) => (
                <option key={d.id} value={d.id}>
                  {(d.id === "default" ? "Padrão" : d.name) + (d.id === list?.current ? " (atual)" : "")}
                </option>
              ))}
            </select>
            <button type="button" className="icon-btn" title="Atualizar lista" aria-label="Atualizar lista" onClick={load}>
              <RefreshCw size={16} />
            </button>
          </div>
          {problem && <span className="inline-error">{problem}</span>}
        </Field>
      )}
    </>
  );
}
