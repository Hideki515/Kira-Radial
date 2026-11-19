import { Download, RefreshCw } from "lucide-react";
import { useEffect, useState } from "react";
import { onEvent, updateCheck, updateInstall, updateStatus, type UpdateInfo } from "../../shared/ipc";
import type { Config } from "../../shared/types";
import { Section, Toggle } from "../controls";

interface Props {
  config: Config;
  update: (fn: (c: Config) => void) => void;
}

/** "há 5 min", "há 3 h", "ontem"... a partir de segundos desde 1970. */
export function ago(sec: number, now = Date.now() / 1000): string {
  const d = Math.max(0, now - sec);
  if (d < 60) return "agora há pouco";
  if (d < 3600) return `há ${Math.floor(d / 60)} min`;
  if (d < 86400) return `há ${Math.floor(d / 3600)} h`;
  const days = Math.floor(d / 86400);
  return days === 1 ? "ontem" : `há ${days} dias`;
}

/** Hook do estado de atualização (também usado pelo aviso no topo das Configurações). */
export function useUpdateInfo(): [UpdateInfo | null, (u: UpdateInfo) => void] {
  const [info, setInfo] = useState<UpdateInfo | null>(null);
  useEffect(() => {
    void updateStatus().then(setInfo, () => setInfo(null));
    const off = onEvent<UpdateInfo>("update:status", setInfo);
    return () => void off.then((f) => f());
  }, []);
  return [info, setInfo];
}

/** Configurações → Geral → Atualizações. */
export function UpdatesSection({ config, update }: Props) {
  const [info, setInfo] = useUpdateInfo();
  const [busy, setBusy] = useState<"check" | "install" | null>(null);
  const [error, setError] = useState<string | null>(null);
  const enabled = config.behavior.checkUpdates !== false;

  const check = () => {
    setBusy("check");
    setError(null);
    updateCheck().then(setInfo, (e) => setError(String(e))).finally(() => setBusy(null));
  };
  const install = () => {
    setBusy("install");
    setError(null);
    // Se der certo a Kira fecha e reabre já atualizada; só volta aqui se falhar.
    updateInstall().catch((e) => setError(String(e))).finally(() => setBusy(null));
  };

  return (
    <Section
      title="Atualizações"
      description="A Kira procura versões novas no repositório público de releases. Nada é instalado sem você clicar — e só versões assinadas pela chave da Kira são aceitas."
    >
      <Toggle
        label="Procurar atualizações automaticamente"
        hint="Ao iniciar (depois de 30 s) e uma vez por dia."
        checked={enabled}
        onChange={(v) => update((c) => void (v ? delete c.behavior.checkUpdates : (c.behavior.checkUpdates = false)))}
      />
      <div className="update-box" data-testid="update-box">
        {info?.available ? (
          <>
            <p className="update-title">
              Versão <strong>{info.version}</strong> disponível (você tem a {info.current}).
            </p>
            {info.notes && (
              <details className="update-notes">
                <summary>O que mudou</summary>
                <pre>{info.notes}</pre>
              </details>
            )}
            <button type="button" className="btn btn-primary" disabled={!!busy} onClick={install}>
              <Download size={14} /> {busy === "install" ? "Baixando e instalando…" : "Atualizar e reiniciar"}
            </button>
          </>
        ) : (
          <p className="muted">
            {info ? `Você tem a versão ${info.current}` : "Versão atual"}
            {info?.checkedAt ? ` · última busca ${ago(info.checkedAt)}` : ""}
            {info?.checkedAt && !info.available && !info.error ? " · está atualizada." : "."}
          </p>
        )}
        <button type="button" className="btn" disabled={!!busy} onClick={check}>
          <RefreshCw size={14} /> {busy === "check" ? "Procurando…" : "Procurar agora"}
        </button>
        {(error || info?.error) && <p className="inline-error">{error ?? info?.error}</p>}
      </div>
    </Section>
  );
}
