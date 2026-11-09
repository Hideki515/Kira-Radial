// Sons do menu: sintetizados na hora com Web Audio (sem arquivos de terceiros) ou um
// arquivo próprio do usuário (WAV/MP3/OGG lido pelo backend como data URL).
import { readSound } from "./ipc";
import type { SoundEvent, SoundsConfig } from "./types";

export const SOUND_EVENTS: readonly SoundEvent[] = ["open", "close", "execute", "hover"];

export const DEFAULT_SOUNDS: SoundsConfig = {
  enabled: false,
  volume: 0.5,
  events: {
    open: { mode: "builtin" },
    close: { mode: "builtin" },
    execute: { mode: "builtin" },
    hover: { mode: "off" },
  },
};

/** Configuração completa (campos ausentes = padrão). */
export function soundsOf(s: Partial<SoundsConfig> | undefined): SoundsConfig {
  return { ...DEFAULT_SOUNDS, ...(s ?? {}), events: { ...DEFAULT_SOUNDS.events, ...(s?.events ?? {}) } };
}

let ctx: AudioContext | null = null;
function audio(): AudioContext | null {
  const AC = (globalThis as { AudioContext?: typeof AudioContext }).AudioContext;
  if (!AC) return null;
  if (!ctx) ctx = new AC();
  // Criado uma vez e só retomado: evita o atraso de inicialização no primeiro som.
  if (ctx.state === "suspended") void ctx.resume();
  return ctx;
}

/** Envelope rápido: sobe até `peak` e cai até ~0 em `dur` segundos. */
function envelope(ac: AudioContext, peak: number, dur: number, attack = 0.01): GainNode {
  const g = ac.createGain();
  const t = ac.currentTime;
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(Math.max(peak, 0.0002), t + attack);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  g.connect(ac.destination);
  return g;
}

function noise(ac: AudioContext, dur: number): AudioBufferSourceNode {
  const buf = ac.createBuffer(1, Math.ceil(ac.sampleRate * dur), ac.sampleRate);
  const d = buf.getChannelData(0);
  for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
  const src = ac.createBufferSource();
  src.buffer = buf;
  return src;
}

/** "Whoosh" (ruído filtrado com varredura) + tom deslizando — estilo HUD. */
function whoosh(ac: AudioContext, vol: number, up: boolean) {
  const dur = up ? 0.32 : 0.22;
  const t = ac.currentTime;
  const [f0, f1] = up ? [400, 2600] : [2200, 320];
  const n = noise(ac, dur);
  const bp = ac.createBiquadFilter();
  bp.type = "bandpass";
  bp.Q.value = 1.4;
  bp.frequency.setValueAtTime(f0, t);
  bp.frequency.exponentialRampToValueAtTime(f1, t + dur);
  n.connect(bp).connect(envelope(ac, vol * 0.35, dur, 0.04));
  n.start(t);
  n.stop(t + dur);
  const o = ac.createOscillator();
  o.type = "sine";
  o.frequency.setValueAtTime(up ? 240 : 660, t);
  o.frequency.exponentialRampToValueAtTime(up ? 720 : 200, t + dur);
  o.connect(envelope(ac, vol * 0.18, dur, 0.02));
  o.start(t);
  o.stop(t + dur);
}

function tick(ac: AudioContext, vol: number) {
  const t = ac.currentTime;
  const o = ac.createOscillator();
  o.type = "square";
  o.frequency.value = 1800;
  o.connect(envelope(ac, vol * 0.05, 0.03, 0.002));
  o.start(t);
  o.stop(t + 0.035);
}

function blip(ac: AudioContext, vol: number) {
  [880, 1320].forEach((f, i) => {
    const t = ac.currentTime + i * 0.06;
    const o = ac.createOscillator();
    o.type = "sine";
    o.frequency.value = f;
    const g = ac.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(vol * 0.22, t + 0.008);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.07);
    g.connect(ac.destination);
    o.connect(g);
    o.start(t);
    o.stop(t + 0.08);
  });
}

const SYNTH: Record<SoundEvent, (ac: AudioContext, vol: number) => void> = {
  open: (ac, v) => whoosh(ac, v, true),
  close: (ac, v) => whoosh(ac, v, false),
  hover: tick,
  execute: blip,
};

const fileCache = new Map<string, Promise<AudioBuffer | null>>();
function loadFile(ac: AudioContext, path: string): Promise<AudioBuffer | null> {
  let p = fileCache.get(path);
  if (!p) {
    p = readSound(path)
      .then((url) => fetch(url))
      .then((r) => r.arrayBuffer())
      .then((b) => ac.decodeAudioData(b))
      .catch(() => {
        // Falha não fica em cache: o arquivo pode voltar a existir/ser corrigido.
        fileCache.delete(path);
        return null;
      });
    fileCache.set(path, p);
  }
  return p;
}

/**
 * Toca o som do evento. Sem Web Audio (testes), desligado ou "off": não faz nada.
 * `force` ignora o liga/desliga geral (botão ▶ de pré-escuta nas configurações).
 */
export async function playSound(event: SoundEvent, cfg: Partial<SoundsConfig> | undefined, force = false): Promise<void> {
  const s = soundsOf(cfg);
  if (!s.enabled && !force) return;
  const src = s.events[event];
  if (src.mode === "off") return;
  const ac = audio();
  if (!ac) return;
  const vol = Math.max(0, Math.min(1, s.volume));
  if (src.mode === "file" && src.file) {
    const buf = await loadFile(ac, src.file);
    if (!buf) return SYNTH[event](ac, vol); // arquivo sumiu/estragou: usa o embutido
    const node = ac.createBufferSource();
    node.buffer = buf;
    const g = ac.createGain();
    g.gain.value = vol;
    node.connect(g).connect(ac.destination);
    node.start();
    return;
  }
  SYNTH[event](ac, vol);
}

/** Esquece todos os arquivos carregados (ex.: a configuração de sons mudou). */
export function clearSoundCache() {
  fileCache.clear();
}

/** Esquece o arquivo carregado (ex.: usuário trocou o arquivo do evento). */
export function forgetSoundFile(path: string) {
  fileCache.delete(path);
}
