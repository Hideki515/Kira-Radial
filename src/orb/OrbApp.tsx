import { useConfig } from "../hooks/useConfig";
import { orbClicked, runAction, startWindowDrag } from "../shared/ipc";
import { perfLog } from "../shared/perf";
import { Orb } from "./Orb";

const logError = (e: unknown) => perfLog(`ícone: ${String(e)}`);

/** Janela do ícone flutuante. */
export function OrbApp() {
  const config = useConfig();
  if (!config) return null;
  const orb = config.launcher.orb;
  return (
    <Orb
      size={orb.size}
      accent={config.appearance.accent}
      opacityIdle={orb.opacityIdle}
      imageSrc={null}
      onActivate={() => void orbClicked().catch(logError)}
      onDragStart={() => void startWindowDrag().catch(logError)}
      onContextMenu={() => void runAction({ type: "openSettings" }).catch(logError)}
    />
  );
}
