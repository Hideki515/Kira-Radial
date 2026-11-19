// Setup do Vitest: os testes escrevem os textos em português. O jsdom informa
// navigator.language = "en-US", o que faria o idioma "auto" cair em inglês.
import { afterEach } from "vitest";

Object.defineProperty(window.navigator, "language", { value: "pt-BR", configurable: true });
Object.defineProperty(window.navigator, "languages", { value: ["pt-BR", "pt"], configurable: true });

// Um teste que troca para inglês não vaza para os seguintes.
// Import tardio: importar o i18n aqui carregaria o ipc antes dos vi.mock de cada arquivo.
afterEach(async () => (await import("./shared/i18n")).setLang("pt"));
