import { ImageIcon, LocateFixed, Sparkles } from "lucide-react";
import { useState } from "react";
import { Orb } from "../../orb/Orb";
import { useOrbImage } from "../../orb/useOrbImage";
import { orbResetPosition, orbSetHidden, pickImage } from "../../shared/ipc";
import { ORB_LIMITS, wantsOrb, type Config } from "../../shared/types";
import { Field, Section, Segmented, Toggle } from "../controls";

interface Props {
  config: Config;
  update: (fn: (c: Config) => void) => void;
  /** Leva à página Atalho (onde se escolhe o modo de abertura). */
  goToLauncher: () => void;
}

type Look = "builtin" | "image";

const fileName = (p: string) => p.split(/[\\/]/).pop() ?? p;

export function IconPage({ config, update, goToLauncher }: Props) {
  const orb = config.launcher.orb;
  const image = useOrbImage(orb.image);
  const [msg, setMsg] = useState<string | null>(null);
  const [hidden, setHidden] = useState(orb.hidden);
  const look: Look = orb.image ? "image" : "builtin";

  const choose = async () => {
    const path = await pickImage();
    if (path) update((c) => void (c.launcher.orb.image = path));
  };

  return (
    <>
      {!wantsOrb(config.launcher.mode) && (
        <div className="banner-info" role="note" data-testid="orb-off">
          O ícone está desligado: o menu abre só pelo atalho.{" "}
          <button type="button" className="link" onClick={goToLauncher}>Ativar em Atalho → Abrir o menu por</button>
        </div>
      )}

      {wantsOrb(config.launcher.mode) && hidden && (
        <div className="banner-info" role="note" data-testid="orb-hidden">
          O ícone está escondido (pelo botão direito ou pela bandeja).{" "}
          <button type="button" className="link" onClick={() => orbSetHidden(false).then(() => setHidden(false), (e) => setMsg(String(e)))}>
            Mostrar o ícone
          </button>
        </div>
      )}

      <Section title="Ícone flutuante" description="Clique no ícone para abrir o menu; arraste-o para qualquer lugar da tela (a posição fica salva).">
        <div className="orb-preview" data-testid="orb-preview">
          <Orb
            size={orb.size}
            accent={config.appearance.accent}
            opacityIdle={orb.opacityIdle}
            imageSrc={image.src}
            onActivate={() => {}}
            onDragStart={() => {}}
          />
        </div>

        <Field label="Aparência" group>
          <Segmented<Look>
            value={look}
            options={[
              { value: "builtin", label: "Orbe holográfico" },
              { value: "image", label: "Imagem própria" },
            ]}
            onChange={(v) => (v === "builtin" ? update((c) => void (c.launcher.orb.image = null)) : void choose())}
          />
        </Field>

        {orb.image && (
          <Field
            label="Imagem"
            group
            hint="GIF, WebP ou PNG animado, até 8 MB. Prefira WebP/APNG: o GIF não tem transparência suave e as bordas ficam serrilhadas."
          >
            <div className="row-actions">
              <span className="path-chip" title={orb.image}>
                <ImageIcon size={14} /> {fileName(orb.image)}
              </span>
              <button type="button" className="btn" onClick={() => void choose()}>Trocar…</button>
            </div>
            {image.error && <span className="inline-error" role="alert">Não foi possível carregar: {image.error}. O orbe embutido será usado.</span>}
          </Field>
        )}

        <Field label={`Tamanho: ${orb.size}px`}>
          <input
            type="range"
            min={ORB_LIMITS.minSize}
            max={ORB_LIMITS.maxSize}
            step={4}
            value={orb.size}
            onChange={(e) => update((c) => void (c.launcher.orb.size = Number(e.target.value)))}
          />
        </Field>

        <Field label={`Opacidade em repouso: ${Math.round(orb.opacityIdle * 100)}%`} hint="Ao passar o mouse, o ícone fica 100% visível.">
          <input
            type="range"
            min={ORB_LIMITS.minOpacity}
            max={ORB_LIMITS.maxOpacity}
            step={0.05}
            value={orb.opacityIdle}
            onChange={(e) => update((c) => void (c.launcher.orb.opacityIdle = Number(e.target.value)))}
          />
        </Field>

        <Toggle
          label="Esconder em tela cheia"
          hint="Some durante jogos, vídeos e apresentações em tela cheia e volta sozinho ao sair."
          checked={orb.hideOnFullscreen}
          onChange={(v) => update((c) => void (c.launcher.orb.hideOnFullscreen = v))}
        />

        <div className="row-actions">
          <button
            type="button"
            className="btn"
            onClick={() => orbResetPosition().then(() => setMsg("Ícone movido para o canto inferior direito."), (e) => setMsg(String(e)))}
          >
            <LocateFixed size={14} /> Voltar o ícone para o canto
          </button>
          {msg && <span className="muted">{msg}</span>}
        </div>
        <p className="muted">
          <Sparkles size={13} /> Clique com o botão direito no ícone para abrir as configurações ou escondê-lo. Para mostrar de novo, use
          “Mostrar/esconder ícone” na bandeja.
        </p>
      </Section>
    </>
  );
}
