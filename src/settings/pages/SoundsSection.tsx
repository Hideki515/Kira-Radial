import { Music, Play } from "lucide-react";
import { t, type Key } from "../../shared/i18n";
import { pickSound } from "../../shared/ipc";
import { SOUND_EVENTS, forgetSoundFile, playSound, soundsOf } from "../../shared/sound";
import type { Config, SoundEvent, SoundSource } from "../../shared/types";
import { Field, Section, Toggle } from "../controls";

/** Nome de cada evento de som, no idioma atual. */
const EVENT_LABEL: Record<SoundEvent, string> = new Proxy({} as Record<SoundEvent, string>, {
  get: (_, k) => t(`snd.ev.${String(k)}` as Key),
});

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
    <Section title={t("snd.title")} description={t("snd.desc")}>
      <Toggle label={t("snd.enable")} checked={s.enabled} onChange={(v) => set((snd) => void (snd.enabled = v))} />
      <Field label={t("snd.volume", { pct: Math.round(s.volume * 100) })}>
        <input type="range" min={0} max={1} step={0.05} value={s.volume} onChange={(e) => set((snd) => void (snd.volume = Number(e.target.value)))} />
      </Field>
      <div className="sound-rows">
        {SOUND_EVENTS.map((ev) => {
          const src = s.events[ev];
          return (
            <div key={ev} className="sound-row" data-testid={`sound-${ev}`}>
              <span className="sound-label">{EVENT_LABEL[ev]}</span>
              <select
                aria-label={t("snd.aria.sound", { event: EVENT_LABEL[ev] })}
                value={src.mode}
                onChange={(e) => {
                  const mode = e.target.value as SoundSource["mode"];
                  if (mode === "file") void choose(ev);
                  else setSource(ev, { mode });
                }}
              >
                <option value="builtin">{t("snd.builtin")}</option>
                <option value="file">{t("snd.file")}</option>
                <option value="off">{t("snd.off")}</option>
              </select>
              {src.mode === "file" && src.file && (
                <button type="button" className="path-chip" title={src.file} onClick={() => void choose(ev)}>
                  <Music size={13} /> {fileName(src.file)}
                </button>
              )}
              <button
                type="button"
                className="btn btn-ghost"
                aria-label={t("snd.aria.play", { event: EVENT_LABEL[ev] })}
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
