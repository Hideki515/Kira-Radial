import { AppWindow, ImagePlus } from "lucide-react";
import { useEffect, useState } from "react";
import { DYNAMIC_HINT, DYNAMIC_LABEL } from "../../radial/dynamic";
import { forgetIconFile, loadIconFile } from "../../shared/iconFiles";
import { ICONS } from "../../shared/icons";
import { extractIcon, getHotkeysError, onEvent, pickIconImage } from "../../shared/ipc";
import { DYNAMIC_KINDS, LIMITS, type DynamicKind, type MenuItem } from "../../shared/types";
import { ActionEditor, defaultAction } from "../ActionEditor";
import { HotkeyRecorder } from "../HotkeyRecorder";
import { BrightnessTargetField } from "../BrightnessTarget";
import { Field, Segmented } from "../controls";

/** Cores sugeridas para a borda dos subitens. */
export const COLORS = ["#4ade9b", "#43c7d9", "#f2c46d", "#a78bfa", "#e879d8", "#ff5c7a", "#9aa5b8"];

const fileName = (p: string) => p.split(/[\\/]/).pop() ?? p;

interface Props {
  selected: MenuItem;
  /** É um subitem (mostra a cor da borda; fatias mostram "Ao selecionar"). */
  isChild: boolean;
  editSelected: (fn: (it: MenuItem) => void) => void;
}

/** Edição da fatia/subitem selecionado: rótulo, ícone, cor e o que faz. */
export function ItemEditor({ selected, isChild, editSelected }: Props) {
  // Erro do Windows ao registrar os atalhos de fatia (só se sabe depois de salvar).
  const [hotkeyError, setHotkeyError] = useState<string | null>(null);
  useEffect(() => {
    const load = () => void getHotkeysError().then(setHotkeyError, () => setHotkeyError(null));
    load();
    const off = onEvent("config:changed", load);
    return () => void off.then((f) => f());
  }, []);

  // Ícone próprio da fatia selecionada: miniatura no editor + mensagens de erro.
  const [iconPreview, setIconPreview] = useState<string | null>(null);
  const [iconMsg, setIconMsg] = useState<string | null>(null);
  useEffect(() => {
    setIconPreview(null);
    if (!selected?.iconFile) return;
    let alive = true;
    void loadIconFile(selected.iconFile).then((src) => alive && setIconPreview(src));
    return () => {
      alive = false;
    };
  }, [selected?.iconFile]);

  const setIconFile = (path: string) => {
    forgetIconFile(path);
    setIconMsg(null);
    editSelected((it) => void (it.iconFile = path));
  };
  const chooseImage = async () => {
    const path = await pickIconImage();
    if (path) setIconFile(path);
  };
  const applyProgramIcon = async () => {
    const a = selected?.action;
    if (a?.type !== "launch") return;
    try {
      setIconFile(await extractIcon(a.path));
    } catch (e) {
      setIconMsg(String(e));
    }
  };

  return (
    <div className="item-editor">
      <h3>{isChild ? "Subitem" : "Fatia"}</h3>
      <Field label="Rótulo">
        <input value={selected.label} maxLength={14} onChange={(e) => editSelected((it) => void (it.label = e.target.value))} />
      </Field>

      <Field label="Ícone" group hint={selected.iconFile ? "Usando ícone próprio. Se o arquivo sumir, volta para o ícone marcado abaixo." : undefined}>
        <div className="row-actions icon-own">
          <button type="button" className="btn" onClick={() => void chooseImage()}>
            <ImagePlus size={14} /> Imagem própria…
          </button>
          {selected.action?.type === "launch" && selected.action.path.trim() && (
            <button type="button" className="btn" onClick={() => void applyProgramIcon()}>
              <AppWindow size={14} /> Usar ícone do programa
            </button>
          )}
          {selected.iconFile && (
            <>
              <span className="path-chip" title={selected.iconFile} data-testid="icon-file">
                {iconPreview && <img src={iconPreview} alt="" width={16} height={16} />} {fileName(selected.iconFile)}
              </span>
              <button type="button" className="btn btn-ghost" onClick={() => editSelected((it) => void delete it.iconFile)}>
                Remover
              </button>
            </>
          )}
        </div>
        {iconMsg && <span className="inline-error" role="alert">{iconMsg}</span>}
        <div className="icon-grid">
          {Object.entries(ICONS).map(([name, Icon]) => (
            <button
              key={name}
              type="button"
              title={name}
              className={`icon-choice${selected.icon === name ? " is-on" : ""}`}
              onClick={() => editSelected((it) => void (it.icon = name))}
            >
              <Icon size={18} />
            </button>
          ))}
        </div>
      </Field>

      {isChild && (
        <Field label="Cor da borda">
          <div className="color-row">
            {COLORS.map((c) => (
              <button
                key={c}
                type="button"
                className={`swatch${selected.color === c ? " is-on" : ""}`}
                style={{ background: c }}
                onClick={() => editSelected((it) => void (it.color = c))}
                aria-label={c}
              />
            ))}
            <input type="color" value={selected.color ?? "#43c7d9"} onChange={(e) => editSelected((it) => void (it.color = e.target.value))} />
          </div>
        </Field>
      )}

      {!isChild && (
        <Field label="Ao selecionar">
          <Segmented
            value={selected.dynamic ? "auto" : selected.children ? "submenu" : "action"}
            options={[
              { value: "action", label: "Executar ação" },
              { value: "submenu", label: "Abrir submenu" },
              { value: "auto", label: "Submenu automático" },
            ]}
            onChange={(v) =>
              editSelected((it) => {
                const current = it.dynamic ? "auto" : it.children ? "submenu" : "action";
                if (v === current) return;
                if (it.children?.length && !window.confirm("Remover os subitens desta fatia?")) return;
                delete it.children;
                delete it.action;
                delete it.dynamic;
                delete it.dynamicTarget;
                delete it.dynamicTargetName;
                if (v === "submenu") it.children = [];
                else if (v === "auto") it.dynamic = "audioOutputs";
                else it.action = defaultAction("launch");
              })
            }
          />
        </Field>
      )}

      {selected.dynamic ? (
        <>
          <Field label="Conteúdo do submenu">
            <select
              value={selected.dynamic}
              onChange={(e) =>
                editSelected((it) => {
                  it.dynamic = e.target.value as DynamicKind;
                  if (it.dynamic !== "brightness") {
                    delete it.dynamicTarget;
                    delete it.dynamicTargetName;
                  }
                })
              }
            >
              {DYNAMIC_KINDS.map((k) => <option key={k} value={k}>{DYNAMIC_LABEL[k]}</option>)}
            </select>
          </Field>
          {selected.dynamic === "brightness" && (
            <BrightnessTargetField
              target={selected.dynamicTarget}
              targetName={selected.dynamicTargetName}
              defaultTarget="cursor"
              onChange={(target, name) =>
                editSelected((it) => {
                  // "Onde o menu abriu" é o padrão: não precisa gravar.
                  if (target === "cursor") delete it.dynamicTarget;
                  else it.dynamicTarget = target;
                  if (name && target !== "all" && target !== "cursor") it.dynamicTargetName = name;
                  else delete it.dynamicTargetName;
                })
              }
            />
          )}
          <p className="muted">
            O sub-anel mostra automaticamente {DYNAMIC_HINT[selected.dynamic]} Até {LIMITS.maxChildren} itens; as informações são
            atualizadas a cada abertura do menu.
          </p>
        </>
      ) : selected.children ? (
        <p className="muted">
          Esta fatia abre um sub-anel com {selected.children.length} item(ns). Use “+ Subitem” na lista ao lado.
        </p>
      ) : (
        <>
          <ActionEditor
            action={selected.action ?? defaultAction("launch")}
            onChange={(a) => editSelected((it) => void (it.action = a))}
          />
          <Field
            group
            label="Atalho global (opcional)"
            hint="Executa esta ação de qualquer lugar do Windows, sem abrir o menu. Clique na caixa e pressione a combinação (com Ctrl, Alt, Shift ou Win, ou uma tecla F)."
          >
            <div className="input-row">
              <HotkeyRecorder value={selected.hotkey ?? ""} pauseGlobal onChange={(v) => editSelected((it) => void (it.hotkey = v || undefined))} />
              {selected.hotkey && (
                <button type="button" className="btn btn-ghost" onClick={() => editSelected((it) => void delete it.hotkey)}>
                  Remover atalho
                </button>
              )}
            </div>
            {hotkeyError && <span className="inline-error" data-testid="hotkeys-reg-error">{hotkeyError}</span>}
          </Field>
        </>
      )}
    </div>
  );
}
