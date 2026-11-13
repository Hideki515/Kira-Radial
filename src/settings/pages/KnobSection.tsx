import { useEffect, useState } from "react";
import { getKnobError, onEvent } from "../../shared/ipc";
import { knobOf, type Config, type KnobConfig } from "../../shared/types";
import { knobErrors } from "../../shared/validate";
import { Field, Section, Segmented, Toggle } from "../controls";
import { HotkeyRecorder } from "../HotkeyRecorder";

interface Props {
  config: Config;
  update: (fn: (c: Config) => void) => void;
}

const KEYS: { key: "press" | "right" | "left"; label: string }[] = [
  { key: "press", label: "Apertar o knob" },
  { key: "right", label: "Girar para a direita" },
  { key: "left", label: "Girar para a esquerda" },
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
      title="Controle com knob (teclado macro)"
      description="Use o knob de um teclado macro como controle da Kira: apertar abre o menu; girar passa pelas fatias; apertar de novo executa a fatia escolhida (ou abre o submenu). No submenu, o centro (Voltar) também entra no giro."
    >
      <Toggle label="Usar o knob" checked={k.enabled} onChange={(enabled) => set({ enabled })} />
      {k.enabled && (
        <>
          <p className="field-hint">
            No programa do teclado (ex.: MINI KeyBoard), configure o knob para enviar teclas que nenhum outro programa usa — o ideal é
            F13, F14 e F15. Se o programa não tiver F13–F24, use combinações raras, como Ctrl+Alt+Shift+F10. Depois clique na caixa de cada
            movimento e gire/aperte o knob para a Kira detectar a tecla.
          </p>
          {KEYS.map(({ key, label }) => (
            <Field key={key} group label={label}>
              <HotkeyRecorder value={k[key]} pauseGlobal onChange={(v) => set({ [key]: v })} />
            </Field>
          ))}
          <Field label="Girar com o menu fechado" group>
            <Segmented
              value={k.closedTurn}
              options={[
                { value: "none", label: "Não faz nada" },
                { value: "volume", label: "Ajusta o volume" },
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
