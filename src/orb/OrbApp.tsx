import { useCallback, useEffect, useRef, useState } from "react";
import { useConfig } from "../hooks/useConfig";
import { getVolume, onEvent, orbClicked, orbContextMenu, runAction, startWindowDrag, type StatsPayload } from "../shared/ipc";
import { perfLog } from "../shared/perf";
import { Orb } from "./Orb";
import { useOrbImage } from "./useOrbImage";

const logError = (e: unknown) => perfLog(`ícone: ${String(e)}`);

/** A partir deste uso de CPU o núcleo fica avermelhado. */
export const CPU_HOT = 85;
/** Tempo que o arco de volume fica visível após girar a roda. */
export const ORB_VOLUME_MS = 1200;

/** Janela do ícone flutuante. */
export function OrbApp() {
  const config = useConfig();
  const image = useOrbImage(config?.launcher.orb.image ?? null);
  const [cpu, setCpu] = useState<number | null>(null);
  const [volume, setVolume] = useState<number | null>(null);
  const volTimer = useRef<number | null>(null);

  // O backend manda o uso de CPU a cada ~2 s (só com o ícone visível e o alerta ligado).
  useEffect(() => {
    const off = onEvent<StatsPayload>("stats", (s) => setCpu(s.cpu));
    return () => void off.then((f) => f());
  }, []);
  useEffect(() => () => void (volTimer.current !== null && window.clearTimeout(volTimer.current)), []);

  const wheel = useCallback(async (up: boolean) => {
    try {
      await runAction({ type: "media", cmd: up ? "volup" : "voldown" });
      const v = await getVolume();
      setVolume(v.muted ? 0 : v.level);
    } catch (e) {
      logError(e);
    }
    if (volTimer.current !== null) window.clearTimeout(volTimer.current);
    volTimer.current = window.setTimeout(() => {
      volTimer.current = null;
      setVolume(null);
    }, ORB_VOLUME_MS);
  }, []);

  if (!config) return null;
  const orb = config.launcher.orb;
  return (
    <Orb
      size={orb.size}
      accent={config.appearance.accent}
      opacityIdle={orb.opacityIdle}
      imageSrc={image.src}
      docked={orb.docked ?? null}
      hot={orb.cpuAlert !== false && cpu !== null && cpu >= CPU_HOT}
      volume={volume}
      onWheel={(up) => void wheel(up)}
      onActivate={() => void orbClicked().catch(logError)}
      onDragStart={() => void startWindowDrag().catch(logError)}
      onContextMenu={() => void orbContextMenu().catch(logError)}
    />
  );
}
