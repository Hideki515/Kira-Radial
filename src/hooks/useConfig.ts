import { useEffect, useState } from "react";
import { getConfig, isTauri, onEvent } from "../shared/ipc";
import type { Config } from "../shared/types";

/** Configuração atual, recarregada quando o backend emite "config:changed". */
export function useConfig(): Config | null {
  const [config, setConfig] = useState<Config | null>(null);

  useEffect(() => {
    let alive = true;
    const load = () => getConfig().then((c) => alive && setConfig(c));
    load();
    let off = () => {};
    if (isTauri()) {
      onEvent<Config>("config:changed", (c) => alive && setConfig(c)).then((u) => (alive ? (off = u) : u()));
    } else {
      window.addEventListener("kira:config-changed", load);
      window.addEventListener("storage", load);
    }
    return () => {
      alive = false;
      off();
      window.removeEventListener("kira:config-changed", load);
      window.removeEventListener("storage", load);
    };
  }, []);

  return config;
}
