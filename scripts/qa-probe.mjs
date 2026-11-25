#!/usr/bin/env node
// Sondas prontas do QA (qa-app), na Kira de teste (só DOM/WebDriver; nada de mouse/teclado do
// Windows). Opcionalmente compara A (Kira de teste da última versão aprovada, guardada em
// .claude/qa/exes/) com B (a atual em target-qa), alternando as rodadas e restaurando B no fim.
//
// Uso:
//   node scripts/qa-probe.mjs <shots|cpu|open> [--themes glass,rain|all] [--ab] [--rounds N]
//                             [--a <exe A>] [--out <pasta>] [--seconds 8] [--opens 20]
//   npm run qa:shots -- --themes all --ab
//
//   shots → capturas por tema (menu aberto e sub-anel aberto) e, com --ab, a diferença A×B
//           (com --rounds 2, também B×B e A×A: o que aparece neles é ruído, não mudança)
//   cpu   → CPU com o menu aberto por tema e fechado (mediana por versão; padrão 3 rodadas)
//   open  → tempo de abertura do menu (mediana por versão)
//
// Requer a Kira de teste B já gerada (node scripts/build-qa.mjs --no-front) e o tauri-driver.
import { execFileSync, spawn } from "node:child_process";
import { createHash } from "node:crypto";
import { copyFileSync, existsSync, mkdirSync, readFileSync, readdirSync, renameSync, rmSync, statSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const EXE = join(root, "src-tauri", "target-qa", "release", "kira-radial.exe");
const EXES = join(root, ".claude", "qa", "exes");
const fail = (msg) => {
  console.error(msg);
  process.exit(2);
};

const argv = process.argv.slice(2);
const probe = argv[0];
const opt = (name, def) => {
  const i = argv.indexOf(`--${name}`);
  if (i < 0) return def;
  const v = argv[i + 1];
  if (v === undefined || v.startsWith("--")) fail(`--${name} precisa de um valor`);
  return v;
};
const flag = (name) => argv.includes(`--${name}`);
if (!["shots", "cpu", "open"].includes(probe)) fail("uso: node scripts/qa-probe.mjs <shots|cpu|open> [--themes ...] [--ab] [--rounds N] [--a exe] [--out pasta]");

// Temas: só nomes que existem em THEMES (também viram nomes de arquivo).
const src = readFileSync(join(root, "src", "shared", "types.ts"), "utf8");
const ALL = [...src.match(/export const THEMES: readonly Theme\[\] = \[([\s\S]*?)\];/)[1].matchAll(/"(\w+)"/g)].map((m) => m[1]);
const themesArg = opt("themes", "glass").trim();
if (themesArg !== "all") {
  const bad = themesArg.split(",").map((s) => s.trim()).filter((t) => !ALL.includes(t));
  if (bad.length) fail(`tema(s) desconhecido(s): ${bad.join(", ")}. Válidos: ${ALL.join(", ")} ou all`);
}

const pad = (n) => String(n).padStart(2, "0");
const d = new Date(); // hora local (o nome da pasta bate com o relógio do usuário)
const stamp = `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}-${pad(d.getHours())}${pad(d.getMinutes())}`;
const ab = flag("ab");
const rounds = Number(opt("rounds", probe === "cpu" ? "3" : "1"));
if (!(Number.isInteger(rounds) && rounds >= 1)) fail("--rounds precisa ser um inteiro de 1 em diante");
const out = opt("out", join(root, ".claude", "qa", "probe", `${probe}-${stamp}`));
const hash = (f) => createHash("sha256").update(readFileSync(f)).digest("hex");

/** Kira de teste A: --a, ou a mais recente guardada em .claude/qa/exes. */
function exeA() {
  const given = opt("a");
  if (given) return given;
  if (!existsSync(EXES)) return null;
  const list = readdirSync(EXES).filter((f) => f.endsWith("-qa.exe")).map((f) => join(EXES, f));
  list.sort((x, y) => statSync(y).mtimeMs - statSync(x).mtimeMs);
  return list[0] ?? null;
}

const sleep = (ms) => execFileSync("pwsh", ["-NoProfile", "-Command", `Start-Sleep -Milliseconds ${ms}`]);

/**
 * Troca o exe em target-qa. O cargo cria release/kira-radial.exe como hardlink de
 * deps/kira_radial.exe: copiar por cima gravaria nos dois (e um build incremental depois
 * reaproveitaria o A como se fosse o B). Apagar antes desfaz o link e o deps fica intacto.
 */
function put(src) {
  for (let i = 0; i < 20; i++) {
    try {
      rmSync(EXE, { force: true });
      copyFileSync(src, EXE);
      return;
    } catch {
      sleep(500); // a Kira de teste anterior pode levar um instante para soltar o arquivo
    }
  }
  throw new Error(`não consegui trocar ${EXE} (arquivo em uso)`);
}

/** Rodada da sonda: wdio pelo node, sem .cmd/shell (o runner continua livre para reagir). */
let child = null;
let interrupted = false;
function run(tag) {
  const env = {
    ...process.env,
    PROBE_SPEC: join(root, "e2e", "probes", `${probe}.probe.mjs`),
    PROBE_TAG: tag,
    PROBE_OUT: out,
    PROBE_THEMES: themesArg,
    PROBE_SECONDS: opt("seconds", "8"),
    PROBE_OPENS: opt("opens", "20"),
  };
  console.log(`\n== sonda ${probe} — rodada ${tag} ==`);
  const wdio = join(root, "node_modules", "@wdio", "cli", "bin", "wdio.js");
  return new Promise((resolve) => {
    child = spawn(process.execPath, [wdio, "run", join("e2e", "probes", "wdio.probe.mjs")], { cwd: root, env, stdio: "inherit" });
    child.on("exit", (code) => {
      child = null;
      if (code !== 0 && !interrupted) console.error(`rodada ${tag}: a sonda falhou (veja a saída acima e ${join(out, tag, "result.json")})`);
      resolve(code === 0);
    });
  });
}

/** Encerra a rodada em andamento e tudo o que ela abriu (Kira de teste, tauri-driver...). */
function killTree() {
  if (!child?.pid) return;
  try {
    execFileSync("taskkill", ["/PID", String(child.pid), "/T", "/F"], { stdio: "ignore" });
  } catch {
    // já tinha terminado
  }
}

// B fica guardado num lugar fixo, com um marcador: se esta execução morrer no meio (até por
// kill forçado), a próxima vê o marcador e devolve B a target-qa antes de começar.
const SWAP = join(root, ".claude", "qa", "probe", ".swap");
const keepB = join(SWAP, "kira-radial-B.exe");
const MARK = join(SWAP, "swap.json");
const alive = (pid) => {
  try {
    process.kill(pid, 0);
    return true;
  } catch (e) {
    return e.code === "EPERM";
  }
};
/** Grava o marcador de forma atômica (temporário + rename): nunca fica um JSON pela metade. */
function writeMark(data) {
  const tmp = `${MARK}.tmp`;
  writeFileSync(tmp, JSON.stringify(data));
  renameSync(tmp, MARK);
}
/**
 * Processos que só as ferramentas de teste abrem: a Kira de TESTE (target-qa), o tauri-driver,
 * o msedgedriver baixado em tools/ e o wdio das sondas. Usado só para limpar o que uma
 * execução morta deixou (a Kira instalada do usuário nunca entra: o caminho é outro).
 */
function killOrphans() {
  const ps = [
    "Get-CimInstance Win32_Process | Where-Object {",
    "($_.Name -eq 'kira-radial.exe' -and $_.ExecutablePath -like '*\\target-qa\\*') -or",
    // Só o tauri-driver das sondas/E2E (aponta para o msedgedriver em tools/), nunca o de outro projeto.
    "($_.Name -eq 'tauri-driver.exe' -and $_.CommandLine -like '*Kira-Radial\\tools\\*msedgedriver*') -or",
    "($_.Name -eq 'msedgedriver.exe' -and $_.ExecutablePath -like '*\\Kira-Radial\\tools\\*') -or",
    "($_.Name -eq 'node.exe' -and $_.CommandLine -like '*e2e*probes*wdio.probe*')",
    "} | ForEach-Object { Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue; $_.Name }",
  ].join(" ");
  try {
    const killed = execFileSync("pwsh", ["-NoProfile", "-Command", ps], { encoding: "utf8" }).trim();
    if (killed) console.log(`Recuperação: encerrados processos de teste órfãos (${killed.split(/\r?\n/).join(", ")}).`);
  } catch {
    // nada para encerrar
  }
}
function recover() {
  if (!existsSync(MARK)) return;
  try {
    const { hashB: hb, pid } = JSON.parse(readFileSync(MARK, "utf8"));
    // Outra sonda ainda rodando: não mexe na troca dela.
    if (pid && pid !== process.pid && alive(pid)) fail(`Outra sonda está rodando (pid ${pid}). Espere ela terminar. Se não houver sonda nenhuma (pid reaproveitado), apague ${SWAP}.`);
    killOrphans();
    if (existsSync(keepB) && hash(keepB) === hb) {
      if (!existsSync(EXE) || hash(EXE) !== hb) {
        put(keepB);
        console.log("Recuperação: uma sonda anterior foi interrompida com A no lugar; a Kira de teste B voltou para target-qa.");
      }
      rmSync(SWAP, { recursive: true, force: true });
    } else console.error(`ATENÇÃO: marcador de troca em ${MARK} sem cópia de B válida; confira target-qa à mão`);
  } catch (e) {
    console.error(`ATENÇÃO: recuperação da troca falhou: ${e}`);
  }
}
recover();
if (existsSync(MARK)) fail("Não começo: há uma troca A/B pendente que não consegui desfazer (veja acima).");
if (!existsSync(EXE)) fail(`Kira de teste não encontrada (${EXE}). Rode: node scripts/build-qa.mjs --no-front`);
mkdirSync(out, { recursive: true });
mkdirSync(SWAP, { recursive: true });
copyFileSync(EXE, keepB);
const hashB = hash(keepB);
writeMark({ hashB, at: new Date().toISOString(), pid: process.pid });

let restored = false;
function restoreB() {
  if (restored) return;
  restored = true;
  try {
    if (!existsSync(EXE) || hash(EXE) !== hashB) put(keepB);
  } catch (e) {
    console.error(`ATENÇÃO: não consegui restaurar B agora (${e}); a próxima execução tenta de novo.`);
  }
  // Só some com a cópia e o marcador quando B está de fato no lugar.
  try {
    if (existsSync(EXE) && hash(EXE) === hashB) rmSync(SWAP, { recursive: true, force: true });
    else console.error(`ATENÇÃO: B não está em target-qa; a cópia ficou em ${keepB} (a próxima execução recupera)`);
  } catch (e) {
    console.error(`ATENÇÃO: conferência de B falhou (${e}); a próxima execução recupera`);
  }
}
// Ctrl+C / encerramento: para a rodada, devolve B e sai (o runner não fica bloqueado: o wdio é assíncrono).
for (const sig of ["SIGINT", "SIGTERM", "SIGBREAK"]) {
  process.on(sig, () => {
    interrupted = true;
    console.error(`\n${sig}: interrompendo a sonda e devolvendo a Kira de teste B...`);
    killTree();
    restoreB();
    process.exit(130);
  });
}

const tags = [];
let a = null;
try {
  if (ab) {
    a = exeA();
    if (!a || !existsSync(a)) throw new Error("sem Kira de teste A guardada em .claude/qa/exes (use --a <exe>)");
    // Rodadas alternadas (B, A, A, B, ...) para o ruído da máquina pesar igual nas duas.
    rounds: for (let r = 1; r <= rounds; r++) {
      for (const v of r % 2 ? ["B", "A"] : ["A", "B"]) {
        put(v === "A" ? a : keepB);
        tags.push(`${v}${r}`);
        await run(`${v}${r}`);
        if (interrupted) break rounds;
      }
    }
  } else {
    for (let r = 1; r <= rounds && !interrupted; r++) {
      tags.push(`B${r}`);
      await run(`B${r}`);
    }
  }
} finally {
  restoreB();
}

// ---------------------------------------------------------------- resumo
const read = (tag) => {
  try {
    return JSON.parse(readFileSync(join(out, tag, "result.json"), "utf8"));
  } catch {
    return null;
  }
};
/** Mediana de verdade (com quantidade par, a média dos dois do meio). */
const median = (xs) => {
  const s = xs.filter((x) => typeof x === "number" && Number.isFinite(x)).sort((p, q) => p - q);
  if (!s.length) return null;
  const m = Math.floor(s.length / 2);
  return Number((s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2).toFixed(2));
};
const summary = { probe, ab, a: a ? `${a} (${hash(a).slice(0, 12)})` : null, b: hashB.slice(0, 12), rounds: tags, errors: {} };
for (const t of tags) summary.errors[t] = read(t)?.errors ?? ["sem result.json"];

function imgdiff(x, y) {
  try {
    const r = execFileSync("python", ["-I", join(root, "scripts", "qa-imgdiff.py"), join(out, x), join(out, y), join(out, `diff-${x}-${y}`)], { encoding: "utf8" });
    return JSON.parse(r);
  } catch (e) {
    return { error: `comparação de imagens falhou (Python + Pillow?): ${String(e).slice(0, 200)}` };
  }
}

if (probe === "shots") {
  summary.themes = Object.fromEntries(tags.map((t) => [t, read(t)?.themes ?? null]));
  if (ab) {
    summary.diff = imgdiff("A1", "B1");
    // Controle de ruído: o mesmo exe duas vezes. Diferença ali não é mudança do código.
    if (tags.includes("B2")) summary.noiseB = imgdiff("B1", "B2");
    if (tags.includes("A2")) summary.noiseA = imgdiff("A1", "A2");
  }
} else {
  const key = probe === "cpu" ? "cpu" : "open";
  const per = {};
  for (const t of tags) {
    const r = read(t)?.[key] ?? {};
    for (const [th, v] of Object.entries(r)) {
      per[th] ??= { A: [], B: [] };
      per[th][t[0]].push(key === "cpu" ? v : v?.median);
    }
  }
  summary[key] = Object.fromEntries(Object.entries(per).map(([th, v]) => [th, { A: median(v.A), B: median(v.B), samplesA: v.A, samplesB: v.B }]));
}
writeFileSync(join(out, "summary.json"), JSON.stringify(summary, null, 1));

// Tabela curta no terminal.
console.log(`\nResumo (${join(out, "summary.json")}):`);
if (summary.diff && !summary.diff.error) {
  const noise = (n) => (summary.noiseA?.[n]?.px ?? 0) + (summary.noiseB?.[n]?.px ?? 0);
  for (const [n, dd] of Object.entries(summary.diff)) {
    const extra = dd.px && (summary.noiseA || summary.noiseB) ? (noise(n) ? " (há ruído no mesmo exe: provável ruído)" : " (sem ruído no mesmo exe: mudança real)") : "";
    console.log(`  ${n.padEnd(22)} ${dd.error ?? `${dd.px} px diferentes${dd.px ? `, caixa ${dd.box}` : ""}${extra}`}`);
  }
} else if (summary.diff) console.log(`  ${summary.diff.error}`);
for (const key of ["cpu", "open"]) {
  if (!summary[key]) continue;
  for (const [th, v] of Object.entries(summary[key])) console.log(`  ${th.padEnd(12)} ${ab ? `A ${v.A ?? "—"}  →  B ${v.B ?? "—"}` : `B ${v.B ?? "—"}`}${key === "cpu" ? " %" : " ms"}`);
}
for (const [t, e] of Object.entries(summary.errors)) if (e.length) console.log(`  erros em ${t}: ${e.join(" | ")}`);
