import { useEffect, useState } from "react";
import { readOrbImage } from "../shared/ipc";
import { perfLog } from "../shared/perf";

/** Carrega a imagem própria do ícone. Falha (arquivo sumiu, formato) → null = orbe embutido. */
export function useOrbImage(path: string | null): { src: string | null; error: string | null } {
  const [state, setState] = useState<{ src: string | null; error: string | null }>({ src: null, error: null });
  useEffect(() => {
    if (!path) return void setState({ src: null, error: null });
    let alive = true;
    readOrbImage(path).then(
      (src) => alive && setState({ src, error: null }),
      (e) => {
        if (!alive) return;
        perfLog(`ícone: imagem "${path}" não carregou: ${String(e)}`);
        setState({ src: null, error: String(e) });
      },
    );
    return () => {
      alive = false;
    };
  }, [path]);
  return state;
}
