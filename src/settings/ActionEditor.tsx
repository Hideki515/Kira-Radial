import { FolderSearch, Play, RefreshCw } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { WINDOW_LABEL, listAudioOutputs, pickPath, runAction, type AudioDevice } from "../shared/ipc";
import type { Action, MediaCmd, SystemCmd, WindowCmd } from "../shared/types";
import { validateAction } from "../shared/validate";
import { Field, Segmented, Toggle } from "./controls";
import { HotkeyRecorder } from "./HotkeyRecorder";

/** Tipos editáveis (focusWindow é gerado pelo submenu "Janelas abertas"). */
type ActionType = Exclude<Action["type"], "focusWindow" | "powerPlan" | "paste">;

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
  { value: "openSettings", label: "Abrir estas configurações" },
];

const MEDIA: { value: MediaCmd; label: string }[] = [
  { value: "playpause", label: "Play / Pause" },
  { value: "next", label: "Próxima faixa" },
  { value: "prev", label: "Faixa anterior" },
  { value: "volup", label: "Aumentar volume" },
  { value: "voldown", label: "Diminuir volume" },
  { value: "mute", label: "Mudo" },
];

const SYSTEM: { value: SystemCmd; label: string }[] = [
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
  }
}

type AudioAction = Extract<Action, { type: "audioOutput" }>;

function AudioOutputFields({ action, onChange }: { action: AudioAction; onChange: (a: Action) => void }) {
  const [devices, setDevices] = useState<AudioDevice[] | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);

  const load = useCallback(() => {
    setLoadError(null);
    listAudioOutputs()
      .then(setDevices)
      .catch((e) => {
        setDevices([]);
        setLoadError(String(e));
      });
  }, []);

  useEffect(load, [load]);

  const list = devices ?? [];
  const selected =
    list.find((d) => action.deviceId && d.id === action.deviceId) ??
    list.find((d) => action.deviceName && d.name.trim().toLowerCase() === action.deviceName.trim().toLowerCase());
  const hasSaved = !!(action.deviceId || action.deviceName);
  // Dispositivo salvo que não está conectado agora continua aparecendo na lista.
  const missing = hasSaved && devices !== null && !selected;
  const MISSING = "__missing__";
  const value = selected ? selected.id : missing ? MISSING : "";

  return (
    <>
      <Field label="Modo">
        <Segmented
          value={action.mode}
          options={[
            { value: "cycle", label: "Alternar entre dispositivos" },
            { value: "set", label: "Dispositivo específico" },
          ]}
          onChange={(mode) => onChange({ ...action, mode })}
        />
      </Field>
      {action.mode === "cycle" ? (
        <p className="field-hint">
          Cada clique passa para a próxima saída de áudio ativa (ex.: alto-falantes → fone → monitor) e volta ao início.
        </p>
      ) : (
        <Field
          group
          label="Dispositivo de saída"
          hint="Torna este dispositivo a saída padrão do Windows (inclusive para chamadas). Se ele estiver desconectado, a ação avisa com um erro."
        >
          <div className="input-row">
            <select
              aria-label="Dispositivo de saída"
              value={value}
              disabled={devices === null}
              onChange={(e) => {
                const d = list.find((x) => x.id === e.target.value);
                if (d) onChange({ ...action, deviceId: d.id, deviceName: d.name });
              }}
            >
              {devices === null && <option value="">Carregando…</option>}
              {devices !== null && !value && <option value="">Selecione…</option>}
              {missing && (
                <option value={MISSING}>{`${action.deviceName || action.deviceId} (desconectado)`}</option>
              )}
              {list.map((d) => (
                <option key={d.id} value={d.id}>{d.isDefault ? `${d.name} (atual)` : d.name}</option>
              ))}
            </select>
            <button type="button" className="icon-btn" title="Atualizar lista" aria-label="Atualizar lista" onClick={load}>
              <RefreshCw size={16} />
            </button>
          </div>
          {loadError && <span className="inline-error">{loadError}</span>}
        </Field>
      )}
    </>
  );
}

export function ActionEditor({ action, onChange }: { action: Action; onChange: (a: Action) => void }) {
  const [testError, setTestError] = useState<string | null>(null);
  const error = validateAction(action);

  const browse = async (directory: boolean) => {
    const p = await pickPath(directory);
    if (p && (action.type === "launch" || action.type === "folder")) onChange({ ...action, path: p });
  };

  return (
    <div className="action-editor">
      <Field label="Tipo de ação">
        <select value={action.type} onChange={(e) => onChange(defaultAction(e.target.value as ActionType))}>
          {ACTION_TYPES.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}
        </select>
      </Field>

      {action.type === "launch" && (
        <>
          <Field label="Programa ou arquivo" hint="Ex.: notepad.exe, code, C:\Apps\app.exe. Aceita %USERPROFILE% etc.">
            <div className="input-row">
              <input value={action.path} onChange={(e) => onChange({ ...action, path: e.target.value })} placeholder="notepad.exe" />
              <button type="button" className="icon-btn" title="Procurar" onClick={() => browse(false)}><FolderSearch size={16} /></button>
            </div>
          </Field>
          <Field label="Argumentos (opcional)">
            <input value={action.args ?? ""} onChange={(e) => onChange({ ...action, args: e.target.value || undefined })} />
          </Field>
          <Field label="Pasta de trabalho (opcional)">
            <input value={action.cwd ?? ""} onChange={(e) => onChange({ ...action, cwd: e.target.value || undefined })} />
          </Field>
          <Toggle label="Executar como administrador" checked={!!action.admin} onChange={(v) => onChange({ ...action, admin: v || undefined })} />
        </>
      )}

      {action.type === "folder" && (
        <Field label="Pasta" hint="Ex.: %USERPROFILE%\Downloads">
          <div className="input-row">
            <input value={action.path} onChange={(e) => onChange({ ...action, path: e.target.value })} />
            <button type="button" className="icon-btn" title="Procurar" onClick={() => browse(true)}><FolderSearch size={16} /></button>
          </div>
        </Field>
      )}

      {action.type === "url" && (
        <Field label="Endereço">
          <input value={action.url} onChange={(e) => onChange({ ...action, url: e.target.value })} />
        </Field>
      )}

      {action.type === "keys" && (
        <Field group label="Combinação" hint="Clique na caixa tracejada e pressione a combinação (aceita Ctrl, Alt, Shift e Win), ou digite o texto, ex.: Ctrl+Shift+Esc, Win+D. Será enviada ao app que estava em foco.">
          <div className="input-row">
            <input value={action.combo} onChange={(e) => onChange({ ...action, combo: e.target.value })} placeholder="Ctrl+C" />
            <HotkeyRecorder value={action.combo} onChange={(combo) => onChange({ ...action, combo })} />
          </div>
        </Field>
      )}

      {action.type === "keys" && (
        <Field
          label="Atraso antes de enviar (ms)"
          hint="O menu já some da tela antes de enviar. Use um atraso extra se o app de destino demorar a reagir (ex.: 100–300 ms para apps de print como o Lightshot). 0 = sem atraso."
        >
          <div className="input-row delay-row">
            <input
              type="number"
              min={0}
              max={10000}
              step={50}
              value={action.delayMs ?? 0}
              onChange={(e) => {
                const v = Math.round(Number(e.target.value));
                onChange({ ...action, delayMs: Number.isFinite(v) && v > 0 ? v : undefined });
              }}
            />
            <div className="delay-presets">
              {[0, 100, 250, 500].map((ms) => (
                <button
                  key={ms}
                  type="button"
                  className={`chip is-pick${(action.delayMs ?? 0) === ms ? " is-on" : ""}`}
                  onClick={() => onChange({ ...action, delayMs: ms || undefined })}
                >
                  {ms} ms
                </button>
              ))}
            </div>
          </div>
        </Field>
      )}

      {action.type === "media" && (
        <Field label="Comando">
          <select value={action.cmd} onChange={(e) => onChange({ ...action, cmd: e.target.value as MediaCmd })}>
            {MEDIA.map((m) => <option key={m.value} value={m.value}>{m.label}</option>)}
          </select>
        </Field>
      )}

      {action.type === "system" && (
        <Field label="Comando">
          <select value={action.cmd} onChange={(e) => onChange({ ...action, cmd: e.target.value as SystemCmd })}>
            {SYSTEM.map((m) => <option key={m.value} value={m.value}>{m.label}</option>)}
          </select>
        </Field>
      )}

      {action.type === "window" && (
        <Field label="Comando" hint="Age sobre a janela que estava em uso quando o menu abriu.">
          <select value={action.cmd} onChange={(e) => onChange({ ...action, cmd: e.target.value as WindowCmd })}>
            {(Object.keys(WINDOW_LABEL) as WindowCmd[]).map((c) => <option key={c} value={c}>{WINDOW_LABEL[c]}</option>)}
          </select>
        </Field>
      )}

      {action.type === "brightness" && (
        <>
          <Field label="Ajuste" group hint="Vale para a tela do notebook e monitores externos com DDC/CI.">
            <Segmented
              value={action.mode}
              options={[{ value: "up", label: "Aumentar 10%" }, { value: "down", label: "Diminuir 10%" }, { value: "set", label: "Definir valor" }]}
              onChange={(m) => onChange(m === "set" ? { type: "brightness", mode: m, value: action.value ?? 50, target: "all" } : { type: "brightness", mode: m })}
            />
          </Field>
          {action.mode === "set" && (
            <Field label={`Brilho: ${action.value ?? 50}%`}>
              <input type="range" min={0} max={100} step={5} value={action.value ?? 50} onChange={(e) => onChange({ ...action, value: Number(e.target.value) })} />
            </Field>
          )}
        </>
      )}

      {action.type === "radio" && (
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
      )}

      {action.type === "script" && (
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
      )}

      {action.type === "audioOutput" && <AudioOutputFields action={action} onChange={onChange} />}

      {error && <p className="inline-error">{error}</p>}

      <div className="action-test">
        <button
          type="button"
          className="btn"
          disabled={!!error}
          onClick={() => {
            setTestError(null);
            runAction(action).catch((e) => setTestError(String(e)));
          }}
        >
          <Play size={14} /> Testar ação
        </button>
        {testError && <span className="inline-error">{testError}</span>}
      </div>
    </div>
  );
}
