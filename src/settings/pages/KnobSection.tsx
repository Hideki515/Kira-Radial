import { useEffect, useState } from "react";
import { t } from "../../shared/i18n";
import { getKnobError, onEvent } from "../../shared/ipc";
import { knobOf, type Config, type KnobConfig } from "../../shared/types";
import { knobErrors } from "../../shared/validate";
import { Field, Section, Segmented, Toggle } from "../controls";
import { HotkeyRecorder } from "../HotkeyRecorder";

interface Props {
  config: Config;
  update: (fn: (c: Config) => void) => void;
}

const KEYS: { key: "press" | "right" | "left" }[] = [
  { key: "press" },
  { key: "right" },
  { key: "left" },
];

/** Controle dedicado: o knob de um teclado macro abre o menu, passa as fatias e executa. */
export function KnobSection({ config, update }: Props) {
  const k = knobOf(config);
  const [regError, setRegError] = useState<string | null>(null);
  const set = (patch: Partial<KnobConfig>) => update((c) => void (c.knob = { ...knobOf(c), ...patch }));
  const problems = knobErrors(config);

  // Erro do Windows ao registrar as teclas (só se sabe depois de salvar).
  useEffect(() => {
    const load = () => void getKnobError().then(setRegError, () => setRegError(null));
    load();
    const off = onEvent("config:changed", load);
    return () => void off.then((f) => f());
  }, []);

  return (
    <Section
      title={t("knob.title")}
      description={t("knob.desc")}
    >
      <Toggle label={t("knob.enable")} checked={k.enabled} onChange={(enabled) => set({ enabled })} />
      {k.enabled && (
        <>
          <p className="field-hint">
            {t("knob.setup")}
          </p>
          {KEYS.map(({ key }) => (
            <Field key={key} group label={t(`knob.${key}`)}>
              <HotkeyRecorder value={k[key]} pauseGlobal onChange={(v) => set({ [key]: v })} />
            </Field>
          ))}
          <Field label={t("knob.closedTurn")} group>
            <Segmented
              value={k.closedTurn}
              options={[
                { value: "none", label: t("knob.closedTurn.none") },
                { value: "volume", label: t("knob.closedTurn.volume") },
              ]}
              onChange={(closedTurn) => set({ closedTurn })}
            />
          </Field>
          {problems.map((p) => (
            <p key={p} className="inline-error">{p}</p>
          ))}
          {!problems.length && regError && <p className="inline-error" data-testid="knob-reg-error">{regError}</p>}
        </>
      )}
    </Section>
  );
}
