import { Music, Play } from "lucide-react";
import { pickSound } from "../../shared/ipc";
import { SOUND_EVENTS, forgetSoundFile, playSound, soundsOf } from "../../shared/sound";
import type { Config, SoundEvent, SoundSource } from "../../shared/types";
import { Field, Section, Toggle } from "../controls";

const EVENT_LABEL: Record<SoundEvent, string> = {
  open: "Abrir o menu",
  close: "Fechar o menu",
  execute: "Executar uma ação",
  hover: "Passar por uma fatia",
};

const fileName = (p: string) => p.split(/[\\/]/).pop() ?? p;

interface Props {
  config: Config;
  update: (fn: (c: Config) => void) => void;
}

/** Sons estilo HUD: liga/desliga, volume e, por evento, embutido / arquivo próprio / nenhum. */
export function SoundsSection({ config, update }: Props) {
  const s = soundsOf(config.appearance.sounds);
  const set = (fn: (snd: ReturnType<typeof soundsOf>) => void) =>
    update((c) => {
      const next = soundsOf(c.appearance.sounds);
      fn(next);
      c.appearance.sounds = next;
    });

  const setSource = (ev: SoundEvent, src: SoundSource) => set((snd) => void (snd.events[ev] = src));

  const choose = async (ev: SoundEvent) => {
    const path = await pickSound();
    if (!path) return;
    forgetSoundFile(path);
    setSource(ev, { mode: "file", file: path });
  };

  return (
    <Section title="Sons" description="Sons curtos gerados pela própria Kira, estilo HUD. Também dá para usar um arquivo seu (WAV, MP3 ou OGG, até 2 MB).">
      <Toggle label="Tocar sons" checked={s.enabled} onChange={(v) => set((snd) => void (snd.enabled = v))} />
      <Field label={`Volume: ${Math.round(s.volume * 100)}%`}>
        <input type="range" min={0} max={1} step={0.05} value={s.volume} onChange={(e) => set((snd) => void (snd.volume = Number(e.target.value)))} />
      </Field>
      <div className="sound-rows">
        {SOUND_EVENTS.map((ev) => {
          const src = s.events[ev];
          return (
            <div key={ev} className="sound-row" data-testid={`sound-${ev}`}>
              <span className="sound-label">{EVENT_LABEL[ev]}</span>
              <select
                aria-label={`Som: ${EVENT_LABEL[ev]}`}
                value={src.mode}
                onChange={(e) => {
                  const mode = e.target.value as SoundSource["mode"];
                  if (mode === "file") void choose(ev);
                  else setSource(ev, { mode });
                }}
              >
                <option value="builtin">Embutido</option>
                <option value="file">Arquivo próprio…</option>
                <option value="off">Nenhum</option>
              </select>
              {src.mode === "file" && src.file && (
                <button type="button" className="path-chip" title={src.file} onClick={() => void choose(ev)}>
                  <Music size={13} /> {fileName(src.file)}
                </button>
              )}
              <button
                type="button"
                className="btn btn-ghost"
                aria-label={`Ouvir: ${EVENT_LABEL[ev]}`}
                disabled={src.mode === "off"}
                onClick={() => void playSound(ev, s, true)}
              >
                <Play size={13} />
              </button>
            </div>
          );
        })}
      </div>
    </Section>
  );
}
