import { useEffect, useState } from "react";
import { isTauri, onEvent, type StatsPayload } from "../shared/ipc";

/**
 * CPU/RAM em %. No Tauri, o backend emite "stats" a cada 1s enquanto o menu está visível.
 * No navegador, gera um passeio aleatório só para visualizar o medidor.
 */
export function useSystemStats(): StatsPayload | null {
  const [stats, setStats] = useState<StatsPayload | null>(isTauri() ? null : { cpu: 42, ram: 58 });

  useEffect(() => {
    if (isTauri()) {
      let off = () => {};
      let cancelled = false;
      onEvent<StatsPayload>("stats", setStats).then((u) => (cancelled ? u() : (off = u)));
      return () => {
        cancelled = true;
        off();
      };
    }
    const id = window.setInterval(() => {
      setStats((s) => {
        const prev = s ?? { cpu: 40, ram: 55 };
        const cpu = Math.min(100, Math.max(1, prev.cpu + (Math.random() - 0.5) * 18));
        return { cpu, ram: prev.ram };
      });
    }, 1000);
    return () => window.clearInterval(id);
  }, []);

  return stats;
}
