import { FolderPlus, Trash2 } from "lucide-react";
import { pickPath } from "../../shared/ipc";
import { screenshotOf, type Config, type ScreenshotConfig, type ShotCorner } from "../../shared/types";
import { Field, Section, Segmented, Toggle } from "../controls";

interface Props {
  config: Config;
  update: (fn: (c: Config) => void) => void;
}

const CORNERS: { value: ShotCorner; label: string }[] = [
  { value: "bottomRight", label: "Inferior direito" },
  { value: "bottomLeft", label: "Inferior esquerdo" },
  { value: "topRight", label: "Superior direito" },
  { value: "topLeft", label: "Superior esquerdo" },
];

/** Preview dos prints tirados pela Kira (Win+Shift+S, Lightshot...). */
export function ScreenshotSection({ config, update }: Props) {
  const s = screenshotOf(config);
  const set = (patch: Partial<ScreenshotConfig>) => update((c) => void (c.screenshot = { ...screenshotOf(c), ...patch }));

  const addFolder = async () => {
    const dir = await pickPath(true);
    if (dir && !s.folders.some((f) => f.toLowerCase() === dir.toLowerCase())) set({ folders: [...s.folders, dir] });
  };

  return (
    <Section
      title="Preview de capturas"
      description="Depois de uma fatia que tira print (Captura de tela, PrtSc do Lightshot, Win+Shift+S...), a Kira mostra o print num canto da tela com Copiar, Salvar como, Abrir pasta, Editar e Fixar na tela. Só os prints tirados pela Kira; nada é observado fora disso."
    >
      <Toggle label="Mostrar o preview do print" checked={s.preview} onChange={(preview) => set({ preview })} />
      {s.preview && (
        <>
          <Field label={`Tempo na tela: ${s.seconds} s`} hint="Com o mouse em cima, o preview não some.">
            <input type="range" min={3} max={30} step={1} value={s.seconds} onChange={(e) => set({ seconds: Number(e.target.value) })} />
          </Field>
          <Field label="Canto da tela" group>
            <Segmented value={s.corner} options={CORNERS} onChange={(corner) => set({ corner })} />
          </Field>
          <Field
            label="Esperar pelo print por"
            group
            hint="Tempo para você recortar a área (ou salvar no Lightshot) depois de usar a fatia. Passou disso, nada aparece."
          >
            <Segmented
              value={String(s.armSeconds)}
              options={[{ value: "30", label: "30 s" }, { value: "60", label: "1 min" }, { value: "120", label: "2 min" }]}
              onChange={(v) => set({ armSeconds: Number(v) })}
            />
          </Field>
          <Field
            group
            label="Pastas de prints"
            hint="A Kira reconhece o print quando ele é copiado ou salvo. A pasta de capturas do Windows já é observada; adicione a pasta onde o Lightshot (ou outra ferramenta) salva."
          >
            <ul className="folder-list" aria-label="Pastas de prints">
              <li className="muted">Capturas de Tela do Windows (automática)</li>
              {s.folders.map((f) => (
                <li key={f}>
                  <span className="folder-path" title={f}>{f}</span>
                  <button
                    type="button"
                    className="icon-btn"
                    title="Remover pasta"
                    aria-label={`Remover ${f}`}
                    onClick={() => set({ folders: s.folders.filter((x) => x !== f) })}
                  >
                    <Trash2 size={14} />
                  </button>
                </li>
              ))}
            </ul>
            <button type="button" className="btn" onClick={() => void addFolder()}>
              <FolderPlus size={14} /> Adicionar pasta…
            </button>
          </Field>
        </>
      )}
    </Section>
  );
}
