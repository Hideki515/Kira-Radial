# Kira-Radial

Menu radial para Windows — Tauri 2 + Rust (`src-tauri/`) + React 18/TS + Vite (`src/`). UI em pt-BR.

## Comandos
- `npm run typecheck` · `npm test` (Vitest) · `cd src-tauri && cargo test`
- Release: `npx tauri build --no-bundle` → `src-tauri/target/release/kira-radial.exe`
- **Kira de teste** (QA, roda ao lado da instalada, janelas fora da tela, dados em `%APPDATA%\Kira-Radial-QA`): `npm run build:qa` → `src-tauri/target-qa/release/kira-radial.exe`; smoke: `pwsh -NoProfile -File scripts/smoke-qa.ps1`
- **Consumo parado**: `npm run perf:idle` (Kira de teste com tudo escondido por 15 s; falha acima de 5% de um núcleo). `-Mode orb` mede só o ícone visível.
- **E2E** (WebDriver na Kira de teste; só DOM, sem mouse/teclado do Windows): `npm run e2e` (build QA + testes) ou `npm run e2e:run` (só testes). Requer `cargo install tauri-driver`; o msedgedriver certo é baixado por `scripts/get-edgedriver.ps1` para `tools/`.

## Regra de validação
Após **todo** ajuste ou melhoria, chame o agente `qa-ab-tester` (`.claude/agents/qa-ab-tester.md`) informando o que mudou e **aguarde o veredito** (APROVADO/REPROVADO) antes de considerar a tarefa concluída. Se REPROVADO, corrija e rode de novo. Linha de base e relatórios ficam em `.claude/qa/`.

## Atualizar a cópia instalada
O **usuário atualiza por conta própria** — não rode o script nem feche/reinstale o Kira instalado sem pedido explícito. Após QA APROVADO, apenas avise que há versão nova. Ferramenta disponível: `pwsh -File scripts/update-installed.ps1` (gera o instalador NSIS, fecha o Kira aberto, instala com `/S` e reabre).

## Git / GitHub
- Repositório privado no GitHub (`main`), licença MIT. Projeto solo: commits direto em `main`.
- **Commit automático:** após cada melhoria com QA **APROVADO**, faça commit em `main` (mensagem descritiva). Push, tags e releases só quando o usuário pedir.
- **Versão a cada melhoria** (semver): recurso novo → minor (0.2.0 → 0.3.0); correção/ajuste → patch (0.2.0 → 0.2.1). Rode `node scripts/bump-version.mjs x.y.z`, acrescente a entrada no `CHANGELOG.md` e inclua no mesmo commit da melhoria.
- CI (`.github/workflows/ci.yml`) roda typecheck, Vitest, cargo test e clippy a cada push.
- Lançar versão: `node scripts/bump-version.mjs x.y.z` → CHANGELOG → commit → `git tag -a vx.y.z -m vx.y.z && git push --follow-tags` (tag anotada — tag leve não sobe com --follow-tags) (workflow Release gera rascunho com o instalador). Criar tag/push só com confirmação.
- `.claude/qa/` é local (no `.gitignore`).

## Restrições
- Não simular mouse/teclado na área de trabalho do usuário; não trocar dispositivo de áudio, bloquear, suspender ou desligar durante testes.
- Só encerrar processos iniciados pelo próprio assistente.
