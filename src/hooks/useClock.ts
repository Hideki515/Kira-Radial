import { useEffect, useState } from "react";
import { useLang } from "../shared/i18n";

export function useClock(): { time: string; date: string } {
  // Data no idioma da interface; a hora fica sempre em 24 h (cabe no centro do menu).
  const locale = useLang() === "en" ? "en-US" : "pt-BR";
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
    time: now.toLocaleTimeString(locale, { hour: "2-digit", minute: "2-digit", hourCycle: "h23" }),
    date: now
      .toLocaleDateString(locale, { weekday: "short", day: "2-digit", month: "short" })
      .toUpperCase(),
  };
}
