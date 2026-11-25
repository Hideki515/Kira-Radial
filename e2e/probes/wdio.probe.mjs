// Sondas do QA (scripts/qa-probe.mjs): mesmas regras do E2E (só DOM, Kira de teste fora da tela,
// pasta de dados de teste limpa a cada sessão). A sonda vem por PROBE_SPEC.
import { config as base } from "../wdio.conf.mjs";

export const config = { ...base, specs: [process.env.PROBE_SPEC], reporters: ["dot"], mochaOpts: { ui: "bdd", timeout: 900000 } };
