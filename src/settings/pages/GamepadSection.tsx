import { useEffect, useState } from "react";
import { t } from "../../shared/i18n";
import { gamepadConnected, onEvent } from "../../shared/ipc";
import { gamepadOf, type Config, type GamepadConfig, type PadCombo } from "../../shared/types";
import { Field, Section, Segmented, Toggle } from "../controls";

interface Props {
  config: Config;
  update: (fn: (c: Config) => void) => void;
}

/** Controle de videogame (Xbox/XInput): combinação abre, analógico aponta, A escolhe, B volta. */
export function GamepadSection({ config, update }: Props) {
  const g = gamepadOf(config);
  const set = (patch: Partial<GamepadConfig>) => update((c) => void (c.gamepad = { ...gamepadOf(c), ...patch }));
  const [connected, setConnected] = useState<boolean | null>(null);

  // Só se sabe se há controle com a leitura ligada (e salva); confere ao abrir e ao salvar.
  useEffect(() => {
    if (!g.enabled) return setConnected(null);
    let alive = true;
    const load = () => void gamepadConnected().then((v) => alive && setConnected(v), () => alive && setConnected(null));
    const timer = window.setTimeout(load, 2500);
    const off = onEvent("config:changed", () => window.setTimeout(load, 2500));
    return () => {
      alive = false;
      window.clearTimeout(timer);
      void off.then((f) => f());
    };
  }, [g.enabled]);

  return (
    <Section title={t("pad.title")} description={t("pad.desc")}>
      <Toggle label={t("pad.enable")} checked={g.enabled} onChange={(enabled) => set({ enabled })} />
      {g.enabled && (
        <>
          <Field label={t("pad.combo")} group hint={t("pad.combo.hint")}>
            <Segmented<PadCombo>
              value={g.combo}
              options={[
                { value: "lbRb", label: t("pad.combo.lbRb") },
                { value: "view", label: t("pad.combo.view") },
                { value: "viewStart", label: t("pad.combo.viewStart") },
              ]}
              onChange={(combo) => set({ combo })}
            />
          </Field>
          <p className="field-hint">{t("pad.help")}</p>
          {connected !== null && (
            <p className={connected ? "muted" : "inline-error"} data-testid="pad-status">
              {t(connected ? "pad.connected" : "pad.none")}
            </p>
          )}
        </>
      )}
    </Section>
  );
}
