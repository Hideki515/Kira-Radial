import { Play } from "lucide-react";
import { t } from "../shared/i18n";
import { useState } from "react";
import { runAction } from "../shared/ipc";
import { DANGEROUS_SYSTEM, type Action } from "../shared/types";
import { validateAction } from "../shared/validate";
import { Field } from "./controls";
import { AudioOutputFields } from "./actions/AudioOutputFields";
import { BrightnessFields } from "./actions/BrightnessFields";
import { ACTION_TYPES, defaultAction, type ActionType } from "./actions/catalog";
import { MediaFields, RadioFields, ScriptFields, SystemFields, VpnFields, WindowFields } from "./actions/CommandFields";
import { DiscordFields } from "./actions/DiscordFields";
import { ObsFields } from "./actions/ObsFields";
import { TextFields } from "./actions/TextFields";
import { LayoutFields } from "./actions/LayoutFields";
import { KeysFields } from "./actions/KeysFields";
import { FolderFields, LaunchFields, UrlFields } from "./actions/PathFields";
import { SequenceFields } from "./actions/SequenceFields";

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
    case "text": return <TextFields action={action} onChange={onChange} />;
    case "layout": return <LayoutFields action={action} onChange={onChange} />;
    case "media": return <MediaFields action={action} onChange={onChange} />;
    case "system": return <SystemFields action={action} onChange={onChange} />;
    case "window": return <WindowFields action={action} onChange={onChange} />;
    case "brightness": return <BrightnessFields action={action} onChange={onChange} />;
    case "radio": return <RadioFields action={action} onChange={onChange} />;
    case "vpn": return <VpnFields action={action} onChange={onChange} />;
    case "obs": return <ObsFields action={action} onChange={onChange} />;
    case "script": return <ScriptFields action={action} onChange={onChange} />;
    case "audioOutput": return <AudioOutputFields action={action} onChange={onChange} />;
    case "discord": return <DiscordFields action={action} onChange={onChange} />;
    case "sequence": return <SequenceFields action={action} onChange={onChange} />;
    default: return null;
  }
}

interface EditorProps {
  action: Action;
  onChange: (a: Action) => void;
  /** Dentro de uma sequência: sem o tipo "sequência" e sem o botão Testar. */
  asStep?: boolean;
}

/** Desligar/reiniciar/sair (sozinho ou dentro de uma sequência): o "Testar" executaria de verdade. */
export function untestable(a: Action): boolean {
  if (a.type === "system") return DANGEROUS_SYSTEM.includes(a.cmd);
  if (a.type === "sequence") return a.steps.some(untestable);
  return false;
}

export function ActionEditor({ action, onChange, asStep }: EditorProps) {
  const [testError, setTestError] = useState<string | null>(null);
  const error = validateAction(action);
  const types = asStep ? ACTION_TYPES.filter((o) => o.value !== "sequence") : ACTION_TYPES;

  return (
    <div className="action-editor">
      <Field label={t("act.typeField")}>
        <select value={action.type} onChange={(e) => onChange(defaultAction(e.target.value as ActionType))}>
          {types.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
        </select>
      </Field>

      <TypeFields action={action} onChange={onChange} />

      {error && <p className="inline-error">{error}</p>}

      {!asStep && (
      <div className="action-test">
        <button
          type="button"
          className="btn"
          disabled={!!error || untestable(action)}
          title={untestable(action) ? t("act.untestable") : undefined}
          onClick={() => {
            setTestError(null);
            runAction(action).catch((e) => setTestError(String(e)));
          }}
        >
          <Play size={14} /> {t("act.test")}
        </button>
        {testError && <span className="inline-error">{testError}</span>}
      </div>
      )}
    </div>
  );
}
