import { ExternalLink, Link2, Plug, Unplug } from "lucide-react";
import { t } from "../../shared/i18n";
import { Rich } from "../../shared/i18n/Rich";
import { useCallback, useEffect, useState } from "react";
import { discordConnect, discordDisconnect, discordStatus, discordVoice, runAction, type DiscordStatus } from "../../shared/ipc";
import { Field, Section } from "../controls";

export const DEV_PORTAL = "https://discord.com/developers/applications";

/** Texto do resultado de "Testar". */
export function describeTest(s: Awaited<ReturnType<typeof discordVoice>>): { ok: boolean; text: string } {
  if (s.status !== "ok" || !s.voice) return { ok: false, text: s.message || t("dcp.noAnswer") };
  const mic = t(s.voice.mute ? "dcp.muted" : "dcp.on");
  const headset = t(s.voice.deaf ? "dcp.deafened" : "dcp.on");
  return { ok: true, text: t("dcp.test.ok", { mic, headset }) };
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
      return { ok: true, text: t("dcp.connectedAs", { user }) };
    });

  return (
    <>
      <Section
        title="Discord"
        description={t("dcp.desc")}
      >
        <p className="field-hint" data-testid="discord-status">
          {status === null
            ? t("dcp.checking")
            : status.configured
              ? status.user ? t("dcp.status.okAs", { user: status.user }) : t("dcp.status.ok")
              : t("dcp.status.off")}
        </p>
      </Section>

      <Section title={t("dcp.connect.title")} description={t("dcp.connect.desc")}>
        <ol className="steps">
          <li>
            <Rich text={t("dcp.step1")} />{" "}
            <button type="button" className="btn" onClick={() => void runAction({ type: "url", url: DEV_PORTAL })}>
              <ExternalLink size={14} /> {t("dcp.openPortal")}
            </button>
          </li>
          <li>
            <Rich text={t("dcp.step2")} />
          </li>
          <li>
            <Rich text={t("dcp.step3")} />
          </li>
          <li>
            <Rich text={t("dcp.step4")} />
          </li>
        </ol>
        <Field label="Client ID">
          <input value={clientId} inputMode="numeric" onChange={(e) => setClientId(e.target.value)} placeholder="123456789012345678" />
        </Field>
        <Field label="Client Secret" hint={t("dcp.secret.hint")}>
          <input type="password" value={secret} autoComplete="off" onChange={(e) => setSecret(e.target.value)} />
        </Field>
        <div className="input-row">
          <button type="button" className="btn btn-primary" disabled={!!busy || !clientId.trim() || !secret.trim()} onClick={connect}>
            <Plug size={14} /> {busy === "connect" ? t("dcp.waiting") : t("dcp.connect")}
          </button>
          <button
            type="button"
            className="btn"
            disabled={!!busy || !status?.configured}
            onClick={() => run("test", async () => describeTest(await discordVoice()))}
          >
            <Link2 size={14} /> {t("dcp.test")}
          </button>
          <button
            type="button"
            className="btn"
            disabled={!!busy || !status?.configured}
            onClick={() =>
              run("disconnect", async () => {
                await discordDisconnect();
                return { ok: true, text: t("dcp.disconnected") };
              })
            }
          >
            <Unplug size={14} /> {t("dcp.disconnect")}
          </button>
        </div>
        {busy === "connect" && <p className="field-hint">{t("dcp.authorizeHint")}</p>}
        {msg && <p className={msg.ok ? "inline-ok" : "inline-error"} role="status">{msg.text}</p>}
      </Section>

      <Section title={t("dcp.howto")} description={t("dcp.howto.desc")}>
        <ul className="steps">
          <li><Rich text={t("dcp.howto.auto")} /></li>
          <li><Rich text={t("dcp.howto.action")} /></li>
        </ul>
        <p className="field-hint">
          <Rich text={t("dcp.howto.keys")} />
        </p>
      </Section>
    </>
  );
}
