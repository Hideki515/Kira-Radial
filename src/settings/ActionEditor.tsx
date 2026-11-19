import { Play } from "lucide-react";
import { useState } from "react";
import { runAction } from "../shared/ipc";
import type { Action } from "../shared/types";
import { validateAction } from "../shared/validate";
import { Field } from "./controls";
import { AudioOutputFields } from "./actions/AudioOutputFields";
import { BrightnessFields } from "./actions/BrightnessFields";
import { ACTION_TYPES, defaultAction, type ActionType } from "./actions/catalog";
import { MediaFields, RadioFields, ScriptFields, SystemFields, WindowFields } from "./actions/CommandFields";
import { DiscordFields } from "./actions/DiscordFields";
import { KeysFields } from "./actions/KeysFields";
import { FolderFields, LaunchFields, UrlFields } from "./actions/PathFields";

// Quem já importava daqui continua funcionando.
export { ACTION_TYPES, defaultAction } from "./actions/catalog";
export { discordStateMessage } from "./actions/DiscordFields";

/** Campos do tipo da ação (cada tipo no seu arquivo em ./actions). */
function TypeFields({ action, onChange }: { action: Action; onChange: (a: Action) => void }) {
  switch (action.type) {
    case "launch": return <LaunchFields action={action} onChange={onChange} />;
    case "folder": return <FolderFields action={action} onChange={onChange} />;
    case "url": return <UrlFields action={action} onChange={onChange} />;
    case "keys": return <KeysFields action={action} onChange={onChange} />;
    case "media": return <MediaFields action={action} onChange={onChange} />;
    case "system": return <SystemFields action={action} onChange={onChange} />;
    case "window": return <WindowFields action={action} onChange={onChange} />;
    case "brightness": return <BrightnessFields action={action} onChange={onChange} />;
    case "radio": return <RadioFields action={action} onChange={onChange} />;
    case "script": return <ScriptFields action={action} onChange={onChange} />;
    case "audioOutput": return <AudioOutputFields action={action} onChange={onChange} />;
    case "discord": return <DiscordFields action={action} onChange={onChange} />;
    default: return null;
  }
}

export function ActionEditor({ action, onChange }: { action: Action; onChange: (a: Action) => void }) {
  const [testError, setTestError] = useState<string | null>(null);
  const error = validateAction(action);

  return (
    <div className="action-editor">
      <Field label="Tipo de ação">
        <select value={action.type} onChange={(e) => onChange(defaultAction(e.target.value as ActionType))}>
          {ACTION_TYPES.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}
        </select>
      </Field>

      <TypeFields action={action} onChange={onChange} />

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
