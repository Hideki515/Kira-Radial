import { useConfig } from "../hooks/useConfig";
import { orbClicked, orbContextMenu, startWindowDrag } from "../shared/ipc";
import { perfLog } from "../shared/perf";
import { Orb } from "./Orb";
import { useOrbImage } from "./useOrbImage";

const logError = (e: unknown) => perfLog(`ícone: ${String(e)}`);

/** Janela do ícone flutuante. */
export function OrbApp() {
  const config = useConfig();
  const image = useOrbImage(config?.launcher.orb.image ?? null);
  if (!config) return null;
  const orb = config.launcher.orb;
  return (
    <Orb
      size={orb.size}
      accent={config.appearance.accent}
      opacityIdle={orb.opacityIdle}
      imageSrc={image.src}
      onActivate={() => void orbClicked().catch(logError)}
      onDragStart={() => void startWindowDrag().catch(logError)}
      onContextMenu={() => void orbContextMenu().catch(logError)}
    />
  );
}
