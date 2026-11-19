import { FolderSearch } from "lucide-react";
import { pickPath } from "../../shared/ipc";
import type { Action } from "../../shared/types";
import { BrowserFields, type BrowserChoice } from "../BrowserFields";
import { Field, Toggle } from "../controls";

/** Sem chaves `undefined` (a config salva fica limpa). */
function stripUndefined(b: BrowserChoice): BrowserChoice {
  return Object.fromEntries(Object.entries(b).filter(([, v]) => v !== undefined)) as BrowserChoice;
}

type Props<T extends Action["type"]> = { action: Extract<Action, { type: T }>; onChange: (a: Action) => void };

export function LaunchFields({ action, onChange }: Props<"launch">) {
  const browse = async () => {
    const p = await pickPath(false);
    if (p) onChange({ ...action, path: p });
  };
  return (
    <>
      <Field label="Programa ou arquivo" hint="Ex.: notepad.exe, code, C:\Apps\app.exe. Aceita %USERPROFILE% etc.">
        <div className="input-row">
          <input value={action.path} onChange={(e) => onChange({ ...action, path: e.target.value })} placeholder="notepad.exe" />
          <button type="button" className="icon-btn" title="Procurar" onClick={() => void browse()}><FolderSearch size={16} /></button>
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
  );
}

export function FolderFields({ action, onChange }: Props<"folder">) {
  const browse = async () => {
    const p = await pickPath(true);
    if (p) onChange({ ...action, path: p });
  };
  return (
    <Field label="Pasta" hint="Ex.: %USERPROFILE%\Downloads">
      <div className="input-row">
        <input value={action.path} onChange={(e) => onChange({ ...action, path: e.target.value })} />
        <button type="button" className="icon-btn" title="Procurar" onClick={() => void browse()}><FolderSearch size={16} /></button>
      </div>
    </Field>
  );
}

export function UrlFields({ action, onChange }: Props<"url">) {
  return (
    <>
      <Field label="Endereço">
        <input value={action.url} onChange={(e) => onChange({ ...action, url: e.target.value })} />
      </Field>
      <BrowserFields
        scope="item"
        value={action}
        onChange={(b) => onChange({ type: "url", url: action.url, ...stripUndefined(b) })}
      />
    </>
  );
}
