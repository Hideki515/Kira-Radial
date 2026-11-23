import { Camera, X } from "lucide-react";
import { useState } from "react";
import { t } from "../../shared/i18n";
import { layoutCapture } from "../../shared/ipc";
import { LAYOUT_MAX_WINDOWS, type Action, type LayoutWindow } from "../../shared/types";
import { Toggle } from "../controls";

type Props = { action: Extract<Action, { type: "layout" }>; onChange: (a: Action) => void };

const exeName = (p: string) => p.split(/[\\/]/).pop()?.replace(/\.exe$/i, "") || p;

function where(w: LayoutWindow): string {
  if (w.state === "maximized") return t("layout.maximized");
  const size = t("layout.size", { w: w.w, h: w.h, x: w.x, y: w.y });
  return w.state === "minimized" ? `${size} · ${t("layout.minimized")}` : size;
}

/** Layout de janelas: capturar as abertas, ver a lista, tirar alguma e "abrir os que faltam". */
export function LayoutFields({ action, onChange }: Props) {
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  const capture = () => {
    setBusy(true);
    setMsg(null);
    layoutCapture()
      .then((list) => {
        if (!list.length) return setMsg(t("layout.none"));
        onChange({ ...action, windows: list.slice(0, LAYOUT_MAX_WINDOWS) });
      }, (e) => setMsg(String(e)))
      .finally(() => setBusy(false));
  };

  return (
    <>
      <p className="field-hint">{t("layout.desc")}</p>
      <div className="input-row">
        <button type="button" className="btn" disabled={busy} onClick={capture}>
          <Camera size={14} /> {busy ? t("layout.capturing") : action.windows.length ? t("layout.recapture") : t("layout.capture")}
        </button>
      </div>
      {msg && <p className="inline-error" role="status">{msg}</p>}
      {action.windows.length ? (
        <ul className="layout-list">
          {action.windows.map((w, i) => (
            <li key={i}>
              <span className="layout-app">{exeName(w.exe)}</span>
              <span className="layout-title" title={w.title}>{w.title}</span>
              <span className="layout-where">{where(w)}</span>
              <button
                type="button"
                className="icon-btn"
                aria-label={`${t("layout.remove")}: ${w.title}`}
                title={t("layout.remove")}
                onClick={() => onChange({ ...action, windows: action.windows.filter((_, k) => k !== i) })}
              >
                <X size={14} />
              </button>
            </li>
          ))}
        </ul>
      ) : (
        <p className="field-hint">{t("layout.empty")}</p>
      )}
      <Toggle
        label={t("layout.launch")}
        hint={t("layout.launch.hint")}
        checked={!!action.launchMissing}
        onChange={(on) => onChange({ ...action, launchMissing: on })}
      />
    </>
  );
}
