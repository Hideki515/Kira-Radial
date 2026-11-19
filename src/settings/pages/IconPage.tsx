import { ImageIcon, LocateFixed, Sparkles } from "lucide-react";
import { t } from "../../shared/i18n";
import { useState } from "react";
import { Orb } from "../../orb/Orb";
import { useOrbImage } from "../../orb/useOrbImage";
import { orbResetPosition, orbSetHidden, pickImage } from "../../shared/ipc";
import { ORB_LIMITS, wantsOrb, type Config } from "../../shared/types";
import { Field, Section, Segmented, Toggle } from "../controls";

interface Props {
  config: Config;
  update: (fn: (c: Config) => void) => void;
  /** Leva à página Atalho (onde se escolhe o modo de abertura). */
  goToLauncher: () => void;
}

type Look = "builtin" | "image";

const fileName = (p: string) => p.split(/[\\/]/).pop() ?? p;

export function IconPage({ config, update, goToLauncher }: Props) {
  const orb = config.launcher.orb;
  const image = useOrbImage(orb.image);
  const [msg, setMsg] = useState<string | null>(null);
  const [hidden, setHidden] = useState(orb.hidden);
  const look: Look = orb.image ? "image" : "builtin";

  const choose = async () => {
    const path = await pickImage();
    if (path) update((c) => void (c.launcher.orb.image = path));
  };

  return (
    <>
      {!wantsOrb(config.launcher.mode) && (
        <div className="banner-info" role="note" data-testid="orb-off">
          {t("icon.off")}{" "}
          <button type="button" className="link" onClick={goToLauncher}>{t("icon.off.link")}</button>
        </div>
      )}

      {wantsOrb(config.launcher.mode) && hidden && (
        <div className="banner-info" role="note" data-testid="orb-hidden">
          {t("icon.hidden")}{" "}
          <button type="button" className="link" onClick={() => orbSetHidden(false).then(() => setHidden(false), (e) => setMsg(String(e)))}>
            {t("icon.show")}
          </button>
        </div>
      )}

      <Section title={t("icon.title")} description={t("icon.desc")}>
        <div className="orb-preview" data-testid="orb-preview">
          <Orb
            size={orb.size}
            accent={config.appearance.accent}
            opacityIdle={orb.opacityIdle}
            imageSrc={image.src}
            onActivate={() => {}}
            onDragStart={() => {}}
          />
        </div>

        <Field label={t("icon.look")} group>
          <Segmented<Look>
            value={look}
            options={[
              { value: "builtin", label: t("icon.look.builtin") },
              { value: "image", label: t("icon.look.image") },
            ]}
            onChange={(v) => (v === "builtin" ? update((c) => void (c.launcher.orb.image = null)) : void choose())}
          />
        </Field>

        {orb.image && (
          <Field
            label={t("icon.image")}
            group
            hint={t("icon.image.hint")}
          >
            <div className="row-actions">
              <span className="path-chip" title={orb.image}>
                <ImageIcon size={14} /> {fileName(orb.image)}
              </span>
              <button type="button" className="btn" onClick={() => void choose()}>{t("icon.image.change")}</button>
            </div>
            {image.error && <span className="inline-error" role="alert">{t("icon.image.error", { error: image.error })}</span>}
          </Field>
        )}

        <Field label={t("icon.size", { px: orb.size })}>
          <input
            type="range"
            min={ORB_LIMITS.minSize}
            max={ORB_LIMITS.maxSize}
            step={4}
            value={orb.size}
            onChange={(e) => update((c) => void (c.launcher.orb.size = Number(e.target.value)))}
          />
        </Field>

        <Field label={t("icon.opacity", { pct: Math.round(orb.opacityIdle * 100) })} hint={t("icon.opacity.hint")}>
          <input
            type="range"
            min={ORB_LIMITS.minOpacity}
            max={ORB_LIMITS.maxOpacity}
            step={0.05}
            value={orb.opacityIdle}
            onChange={(e) => update((c) => void (c.launcher.orb.opacityIdle = Number(e.target.value)))}
          />
        </Field>

        <Field
          group
          label={t("icon.anim")}
          hint={t("icon.anim.hint")}
        >
          <Segmented
            value={orb.animation ?? "full"}
            options={[
              { value: "full", label: t("icon.anim.full") },
              { value: "hover", label: t("icon.anim.hover") },
              { value: "off", label: t("icon.anim.off") },
            ]}
            onChange={(v) => update((c) => void (c.launcher.orb.animation = v))}
          />
        </Field>

        <Toggle
          label={t("icon.cpuAlert")}
          hint={t("icon.cpuAlert.hint")}
          checked={orb.cpuAlert !== false}
          onChange={(v) => update((c) => void (c.launcher.orb.cpuAlert = v))}
        />
        <p className="muted">{t("icon.tip")}</p>

        <Toggle
          label={t("icon.fullscreen")}
          hint={t("icon.fullscreen.hint")}
          checked={orb.hideOnFullscreen}
          onChange={(v) => update((c) => void (c.launcher.orb.hideOnFullscreen = v))}
        />

        <div className="row-actions">
          <button
            type="button"
            className="btn"
            onClick={() => orbResetPosition().then(() => setMsg(t("icon.reset.done")), (e) => setMsg(String(e)))}
          >
            <LocateFixed size={14} /> {t("icon.reset")}
          </button>
          {msg && <span className="muted">{msg}</span>}
        </div>
        <p className="muted">
          <Sparkles size={13} /> {t("icon.rightClick")}
        </p>
      </Section>
    </>
  );
}
