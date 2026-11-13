import { ExternalLink, Link2, Plug, Unplug } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { discordConnect, discordDisconnect, discordStatus, discordVoice, runAction, type DiscordStatus } from "../../shared/ipc";
import { Field, Section } from "../controls";

export const DEV_PORTAL = "https://discord.com/developers/applications";

/** Texto do resultado de "Testar". */
export function describeTest(s: Awaited<ReturnType<typeof discordVoice>>): { ok: boolean; text: string } {
  if (s.status !== "ok" || !s.voice) return { ok: false, text: s.message || "O Discord não respondeu." };
  const mic = s.voice.mute ? "mutado" : "ligado";
  const fone = s.voice.deaf ? "ensurdecido" : "ligado";
  return { ok: true, text: `Funcionando: microfone ${mic}, fone ${fone}.` };
}

export function DiscordPage() {
  const [status, setStatus] = useState<DiscordStatus | null>(null);
  const [clientId, setClientId] = useState("");
  const [secret, setSecret] = useState("");
  const [busy, setBusy] = useState<"connect" | "test" | "disconnect" | null>(null);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  const refresh = useCallback(() => {
    discordStatus().then(
      (s) => {
        setStatus(s);
        if (s.clientId) setClientId((c) => c || s.clientId!);
      },
      (e) => setMsg({ ok: false, text: String(e) }),
    );
  }, []);
  useEffect(refresh, [refresh]);

  const run = (kind: NonNullable<typeof busy>, fn: () => Promise<{ ok: boolean; text: string }>) => {
    setBusy(kind);
    setMsg(null);
    fn()
      .then(setMsg, (e) => setMsg({ ok: false, text: String(e) }))
      .finally(() => {
        setBusy(null);
        refresh();
      });
  };

  const connect = () =>
    run("connect", async () => {
      const user = await discordConnect(clientId, secret);
      setSecret("");
      return { ok: true, text: `Conectado como ${user}.` };
    });

  return (
    <>
      <Section
        title="Discord"
        description="Mute/desmute o microfone, ensurdeça e troque os dispositivos de entrada e saída do Discord pelo menu. Usa o controle local do próprio Discord (RPC): nada passa pela internet além da autorização."
      >
        <p className="field-hint" data-testid="discord-status">
          {status === null
            ? "Verificando…"
            : status.configured
              ? `Conectado${status.user ? ` como ${status.user}` : ""}. As fatias do Discord já funcionam com o Discord aberto.`
              : "Não conectado."}
        </p>
      </Section>

      <Section title="Conectar (uma vez)" description="O Discord só libera o controle de voz para um aplicativo seu. Leva uns 5 minutos:">
        <ol className="steps">
          <li>
            Abra o portal de desenvolvedores do Discord e clique em <b>New Application</b> (qualquer nome, ex.: Kira).{" "}
            <button type="button" className="btn" onClick={() => void runAction({ type: "url", url: DEV_PORTAL })}>
              <ExternalLink size={14} /> Abrir o portal
            </button>
          </li>
          <li>
            Em <b>OAuth2</b>, adicione o Redirect <code>http://localhost</code> e salve.
          </li>
          <li>
            Copie o <b>Client ID</b> e o <b>Client Secret</b> (Reset Secret) para os campos abaixo.
          </li>
          <li>
            Clique em <b>Conectar</b> e, no Discord, em <b>Autorizar</b>.
          </li>
        </ol>
        <Field label="Client ID">
          <input value={clientId} inputMode="numeric" onChange={(e) => setClientId(e.target.value)} placeholder="123456789012345678" />
        </Field>
        <Field label="Client Secret" hint="Guardado cifrado neste PC (só o seu usuário do Windows consegue ler). Não entra no backup nem na exportação.">
          <input type="password" value={secret} autoComplete="off" onChange={(e) => setSecret(e.target.value)} />
        </Field>
        <div className="input-row">
          <button type="button" className="btn btn-primary" disabled={!!busy || !clientId.trim() || !secret.trim()} onClick={connect}>
            <Plug size={14} /> {busy === "connect" ? "Aguardando o Discord…" : "Conectar"}
          </button>
          <button
            type="button"
            className="btn"
            disabled={!!busy || !status?.configured}
            onClick={() => run("test", async () => describeTest(await discordVoice()))}
          >
            <Link2 size={14} /> Testar
          </button>
          <button
            type="button"
            className="btn"
            disabled={!!busy || !status?.configured}
            onClick={() =>
              run("disconnect", async () => {
                await discordDisconnect();
                return { ok: true, text: "Desconectado. As credenciais foram apagadas deste PC." };
              })
            }
          >
            <Unplug size={14} /> Desconectar
          </button>
        </div>
        {busy === "connect" && <p className="field-hint">Confira a janela do Discord: ele pede para autorizar a Kira.</p>}
        {msg && <p className={msg.ok ? "inline-ok" : "inline-error"} role="status">{msg.text}</p>}
      </Section>

      <Section title="Como usar" description="Em Itens do menu, crie uma fatia com:">
        <ul className="steps">
          <li><b>Submenu automático</b> → "Discord: microfone e fone" (mostra o estado), "Discord: entrada" ou "Discord: saída";</li>
          <li>ou a ação <b>Discord</b>, para um comando direto (alternar mudo, ensurdecer, usar um microfone…).</li>
        </ul>
        <p className="field-hint">
          Sem conectar, dá para mutar e ensurdecer com a ação <b>Enviar atalho de teclado</b>: crie os atalhos em Discord → Configurações → Atalhos
          ("Alternar mudo" e "Alternar ensurdecimento"). Assim a Kira não mostra o estado nem troca dispositivos.
        </p>
      </Section>
    </>
  );
}
