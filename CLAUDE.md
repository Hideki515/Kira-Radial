# Kira-Radial

Menu radial para Windows — Tauri 2 + Rust (`src-tauri/`) + React 18/TS + Vite (`src/`). UI em pt-BR.

## Comandos
- `npm run typecheck` · `npm test` (Vitest) · `cd src-tauri && cargo test`
- Release: `npx tauri build --no-bundle` → `src-tauri/target/release/kira-radial.exe`

## Regra de validação
Após **todo** ajuste ou melhoria, chame o agente `qa-ab-tester` (`.claude/agents/qa-ab-tester.md`) informando o que mudou e **aguarde o veredito** (APROVADO/REPROVADO) antes de considerar a tarefa concluída. Se REPROVADO, corrija e rode de novo. Linha de base e relatórios ficam em `.claude/qa/`.

## Atualizar a cópia instalada
O **usuário atualiza por conta própria** — não rode o script nem feche/reinstale o Kira instalado sem pedido explícito. Após QA APROVADO, apenas avise que há versão nova. Ferramenta disponível: `pwsh -File scripts/update-installed.ps1` (gera o instalador NSIS, fecha o Kira aberto, instala com `/S` e reabre).

## Git / GitHub
- Repositório privado no GitHub (`main`), licença MIT. Projeto solo: commits direto em `main`.
- Commit/push **só quando o usuário pedir**; rode o QA antes de commitar.
- CI (`.github/workflows/ci.yml`) roda typecheck, Vitest, cargo test e clippy a cada push.
- Lançar versão: `node scripts/bump-version.mjs x.y.z` → CHANGELOG → commit → `git tag -a vx.y.z -m vx.y.z && git push --follow-tags` (tag anotada — tag leve não sobe com --follow-tags) (workflow Release gera rascunho com o instalador). Criar tag/push só com confirmação.
- `.claude/qa/` é local (no `.gitignore`).

## Restrições
- Não simular mouse/teclado na área de trabalho do usuário; não trocar dispositivo de áudio, bloquear, suspender ou desligar durante testes.
- Só encerrar processos iniciados pelo próprio assistente.
