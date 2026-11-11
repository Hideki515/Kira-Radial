// Escolha do navegador: na ação "Abrir site" (por fatia) e o navegador geral (página Geral).
import { RefreshCw } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import {
  PRIVATE_FAMILIES,
  PROFILE_FAMILIES,
  listBrowserProfiles,
  listBrowsers,
  type BrowserInfo,
  type BrowserProfile,
} from "../shared/ipc";
import { Field, Toggle } from "./controls";

export interface BrowserChoice {
  browser?: string;
  browserName?: string;
  private?: boolean;
  profile?: string;
}

const MISSING = "__missing__";

/** Lista de navegadores instalados (carrega uma vez; `reload` atualiza). */
export function useBrowsers() {
  const [list, setList] = useState<BrowserInfo[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const reload = useCallback(() => {
    setError(null);
    listBrowsers()
      .then(setList)
      .catch((e) => {
        setList([]);
        setError(String(e));
      });
  }, []);
  useEffect(reload, [reload]);
  return { list, error, reload };
}

/** Navegador salvo: pelo id ou, se sumiu, pelo nome. */
export function findBrowser(list: BrowserInfo[], id?: string, name?: string): BrowserInfo | undefined {
  if (!id) return undefined;
  const low = (s: string) => s.trim().toLowerCase();
  return list.find((b) => low(b.id) === low(id)) ?? (name ? list.find((b) => low(b.name) === low(name)) : undefined);
}

/**
 * `scope="item"`: "Navegador geral" (ausente), "Padrão do Windows" ("system") ou um navegador,
 * mais janela anônima e perfil. `scope="global"`: só o navegador (ausente = padrão do Windows).
 */
export function BrowserFields({
  value,
  onChange,
  scope,
}: {
  value: BrowserChoice;
  onChange: (v: BrowserChoice) => void;
  scope: "item" | "global";
}) {
  const { list, error, reload } = useBrowsers();
  const browsers = list ?? [];
  const chosen = value.browser && value.browser !== "system" ? value.browser : undefined;
  const found = findBrowser(browsers, chosen, value.browserName);
  const missing = !!chosen && list !== null && !found;
  const selectValue = found ? found.id : missing ? MISSING : (value.browser ?? "");

  const [profiles, setProfiles] = useState<BrowserProfile[]>([]);
  const profileCapable = !!found && PROFILE_FAMILIES.includes(found.family);
  useEffect(() => {
    if (scope !== "item" || !found || !profileCapable) {
      setProfiles([]);
      return;
    }
    let alive = true;
    listBrowserProfiles(found.id)
      .then((p) => alive && setProfiles(p))
      .catch(() => alive && setProfiles([]));
    return () => {
      alive = false;
    };
  }, [scope, found?.id, profileCapable]);

  const pick = (id: string) => {
    if (id === MISSING) return;
    const b = browsers.find((x) => x.id === id);
    // Trocar de navegador apaga o perfil (os perfis são de cada navegador).
    const next: BrowserChoice = { private: value.private, browser: b ? b.id : id || undefined, browserName: b?.name };
    if (b && !PRIVATE_FAMILIES.includes(b.family)) next.private = undefined;
    onChange(next);
  };

  const defaultName = browsers.find((b) => b.isDefault)?.name;
  const privateOk = !found || PRIVATE_FAMILIES.includes(found.family);

  return (
    <>
      <Field
        group
        label={scope === "global" ? "Navegador para sites" : "Navegador"}
        hint={
          scope === "global"
            ? "Usado por todas as fatias \"Abrir site\" que não escolhem um navegador próprio."
            : "Endereços mailto: sempre abrem no app de e-mail."
        }
      >
        <div className="input-row">
          <select aria-label={scope === "global" ? "Navegador para sites" : "Navegador"} value={selectValue} disabled={list === null} onChange={(e) => pick(e.target.value)}>
            {list === null && <option value={selectValue}>Carregando…</option>}
            {scope === "item" && <option value="">Navegador geral (página Geral)</option>}
            <option value={scope === "item" ? "system" : ""}>{`Padrão do Windows${defaultName ? ` (${defaultName})` : ""}`}</option>
            {missing && <option value={MISSING}>{`${value.browserName || chosen} (não encontrado — abre no padrão)`}</option>}
            {browsers.map((b) => (
              <option key={b.id} value={b.id}>
                {b.name}
              </option>
            ))}
          </select>
          {found?.icon && <img className="browser-icon" src={found.icon} alt="" width={22} height={22} />}
          <button type="button" className="icon-btn" title="Atualizar lista" aria-label="Atualizar lista de navegadores" onClick={reload}>
            <RefreshCw size={16} />
          </button>
        </div>
        {error && <span className="inline-error">{error}</span>}
      </Field>
      {scope === "item" && privateOk && (
        <Toggle label="Abrir em janela anônima (InPrivate no Edge)" checked={!!value.private} onChange={(v) => onChange({ ...value, private: v || undefined })} />
      )}
      {scope === "item" && profileCapable && profiles.length > 1 && (
        <Field label="Perfil do navegador" hint="Ex.: Pessoal ou Trabalho. Em branco = o último perfil usado.">
          <select aria-label="Perfil do navegador" value={value.profile ?? ""} onChange={(e) => onChange({ ...value, profile: e.target.value || undefined })}>
            <option value="">Último usado</option>
            {value.profile && !profiles.some((p) => p.dir === value.profile) && <option value={value.profile}>{`${value.profile} (não encontrado)`}</option>}
            {profiles.map((p) => (
              <option key={p.dir} value={p.dir}>
                {p.name}
              </option>
            ))}
          </select>
        </Field>
      )}
    </>
  );
}
