import { FolderPlus, Trash2 } from "lucide-react";
import { t } from "../../shared/i18n";
import { pickPath } from "../../shared/ipc";
import { screenshotOf, type Config, type ScreenshotConfig, type ShotCorner } from "../../shared/types";
import { Field, Section, Segmented, Toggle } from "../controls";

interface Props {
  config: Config;
  update: (fn: (c: Config) => void) => void;
}

const CORNER_IDS: ShotCorner[] = ["bottomRight", "bottomLeft", "topRight", "topLeft"];

/** Preview dos prints tirados pela Kira (Win+Shift+S, Lightshot...). */
export function ScreenshotSection({ config, update }: Props) {
  const s = screenshotOf(config);
  const set = (patch: Partial<ScreenshotConfig>) => update((c) => void (c.screenshot = { ...screenshotOf(c), ...patch }));

  const addFolder = async () => {
    const dir = await pickPath(true);
    if (dir && !s.folders.some((f) => f.toLowerCase() === dir.toLowerCase())) set({ folders: [...s.folders, dir] });
  };

  return (
    <Section
      title={t("shotset.title")}
      description={t("shotset.desc")}
    >
      <Toggle label={t("shotset.show")} checked={s.preview} onChange={(preview) => set({ preview })} />
      {s.preview && (
        <>
          <Field label={t("shotset.seconds", { s: s.seconds })} hint={t("shotset.seconds.hint")}>
            <input type="range" min={3} max={30} step={1} value={s.seconds} onChange={(e) => set({ seconds: Number(e.target.value) })} />
          </Field>
          <Field label={t("shotset.corner")} group>
            <Segmented value={s.corner} options={CORNER_IDS.map((value) => ({ value, label: t(`shotset.corner.${value}`) }))} onChange={(corner) => set({ corner })} />
          </Field>
          <Field
            label={t("shotset.wait")}
            group
            hint={t("shotset.wait.hint")}
          >
            <Segmented
              value={String(s.armSeconds)}
              options={[{ value: "30", label: "30 s" }, { value: "60", label: "1 min" }, { value: "120", label: "2 min" }]}
              onChange={(v) => set({ armSeconds: Number(v) })}
            />
          </Field>
          <Field
            group
            label={t("shotset.folders")}
            hint={t("shotset.folders.hint")}
          >
            <ul className="folder-list" aria-label={t("shotset.folders")}>
              <li className="muted">{t("shotset.windowsFolder")}</li>
              {s.folders.map((f) => (
                <li key={f}>
                  <span className="folder-path" title={f}>{f}</span>
                  <button
                    type="button"
                    className="icon-btn"
                    title={t("shotset.removeFolder")}
                    aria-label={t("shotset.remove", { path: f })}
                    onClick={() => set({ folders: s.folders.filter((x) => x !== f) })}
                  >
                    <Trash2 size={14} />
                  </button>
                </li>
              ))}
            </ul>
            <button type="button" className="btn" onClick={() => void addFolder()}>
              <FolderPlus size={14} /> {t("shotset.addFolder")}
            </button>
          </Field>
        </>
      )}
    </Section>
  );
}
