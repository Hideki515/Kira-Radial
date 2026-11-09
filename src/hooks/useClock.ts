import { useEffect, useState } from "react";

export function useClock(): { time: string; date: string } {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    // Alinha ao próximo minuto e depois atualiza a cada minuto.
    let interval: number | undefined;
    const timeout = window.setTimeout(() => {
      setNow(new Date());
      interval = window.setInterval(() => setNow(new Date()), 60_000);
    }, 60_000 - (Date.now() % 60_000));
    return () => {
      window.clearTimeout(timeout);
      if (interval) window.clearInterval(interval);
    };
  }, []);
  return {
    time: now.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" }),
    date: now
      .toLocaleDateString("pt-BR", { weekday: "short", day: "2-digit", month: "short" })
      .toUpperCase(),
  };
}
