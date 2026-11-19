import { FolderSearch } from "lucide-react";
import { t } from "../../shared/i18n";
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
      <Field label={t("path.program")} hint={t("path.program.hint")}>
        <div className="input-row">
          <input value={action.path} onChange={(e) => onChange({ ...action, path: e.target.value })} placeholder="notepad.exe" />
          <button type="button" className="icon-btn" title={t("act.browse")} onClick={() => void browse()}><FolderSearch size={16} /></button>
        </div>
      </Field>
      <Field label={t("path.args")}>
        <input value={action.args ?? ""} onChange={(e) => onChange({ ...action, args: e.target.value || undefined })} />
      </Field>
      <Field label={t("path.cwd")}>
        <input value={action.cwd ?? ""} onChange={(e) => onChange({ ...action, cwd: e.target.value || undefined })} />
      </Field>
      <Toggle label={t("path.admin")} checked={!!action.admin} onChange={(v) => onChange({ ...action, admin: v || undefined })} />
    </>
  );
}

export function FolderFields({ action, onChange }: Props<"folder">) {
  const browse = async () => {
    const p = await pickPath(true);
    if (p) onChange({ ...action, path: p });
  };
  return (
    <Field label={t("path.folder")} hint={t("path.folder.hint")}>
      <div className="input-row">
        <input value={action.path} onChange={(e) => onChange({ ...action, path: e.target.value })} />
        <button type="button" className="icon-btn" title={t("act.browse")} onClick={() => void browse()}><FolderSearch size={16} /></button>
      </div>
    </Field>
  );
}

export function UrlFields({ action, onChange }: Props<"url">) {
  return (
    <>
      <Field label={t("path.url")}>
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
