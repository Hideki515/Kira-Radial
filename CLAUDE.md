# Kira-Radial

Menu radial para Windows — Tauri 2 + Rust (`src-tauri/`) + React 18/TS + Vite (`src/`). UI em pt-BR.

## Comandos
- `npm run typecheck` · `npm test` (Vitest, via `scripts/vitest.mjs`) · `npm run coverage` (relatório em `coverage/`) · `cd src-tauri && cargo test`
- Release: `npx tauri build --no-bundle` → `src-tauri/target/release/kira-radial.exe`
- **Kira de teste** (QA, roda ao lado da instalada, janelas fora da tela, dados em `%APPDATA%\Kira-Radial-QA`): `npm run build:qa` → `src-tauri/target-qa/release/kira-radial.exe`; smoke: `pwsh -NoProfile -File scripts/smoke-qa.ps1`
- **Consumo parado**: `npm run perf:idle` (Kira de teste com tudo escondido por 15 s; falha acima de 5% de um núcleo). `-Mode orb` mede só o ícone visível.
- **E2E** (WebDriver na Kira de teste; só DOM, sem mouse/teclado do Windows): `npm run e2e` (build QA + testes) ou `npm run e2e:run` (só testes). Requer `cargo install tauri-driver`; o msedgedriver certo é baixado por `scripts/get-edgedriver.ps1` para `tools/`.

## Regra de validação
Após **todo** ajuste ou melhoria, o QA roda **em paralelo, dividido em 3 agentes**, e a tarefa só termina quando **todos os chamados derem APROVADO**. Se algum der REPROVADO, corrija e rode de novo só as partes afetadas.
1. Antes de chamar os agentes, gere o front uma vez: `npm run build`. Os agentes não regeram o `dist/`.
2. Chame **na mesma mensagem**, em segundo plano, dizendo a cada um o que mudou:
   - `qa-front` (`.claude/agents/qa-front.md`): tsc, Vitest, cobertura, `dist/` e revisão do front.
   - `qa-rust` (`.claude/agents/qa-rust.md`): cargo test, clippy normal e qa, build release e revisão do Rust.
   - `qa-app` (`.claude/agents/qa-app.md`): Kira de teste (smoke, perf:idle, E2E) e as verificações A×B da mudança. Usa o exe A guardado em `.claude/qa/exes/`, sem recompilar a versão anterior.
3. **QA proporcional:**
   - mudança só no front (TS/CSS): `qa-front` + `qa-app`;
   - só no Rust: `qa-rust` + `qa-app`;
   - nos dois, em dependências ou na versão: os 3;
   - **antes de atualizar a Kira instalada ou de lançar versão:** os 3, sempre.
4. `qa-ab-tester` (`.claude/agents/qa-ab-tester.md`) continua disponível como QA completo num agente só, caso a divisão dê problema.

Linhas de base (`baseline-front/rust/app.json`), relatórios e exes A ficam em `.claude/qa/`. Se o Windows SDK estiver sem `dbghelp.lib` (`LNK1181`), os builds usam `LIB=tools\libfix;%LIB%` só no processo; o conserto definitivo é reparar o SDK pelo Visual Studio Installer.

## Atualizar a cópia instalada
O **usuário atualiza por conta própria** — não rode o script nem feche/reinstale o Kira instalado sem pedido explícito. Após QA APROVADO, apenas avise que há versão nova. Ferramenta disponível: `pwsh -File scripts/update-installed.ps1` (gera o instalador NSIS, fecha o Kira aberto, instala com `/S` e reabre).

## Git / GitHub
- Repositório privado no GitHub (`main`), licença MIT. Projeto solo: commits direto em `main`.
- **Commit automático:** após cada melhoria com QA **APROVADO**, faça commit em `main` (mensagem descritiva). Push, tags e releases só quando o usuário pedir.
- **Versão a cada melhoria** (semver): recurso novo → minor (0.2.0 → 0.3.0); correção/ajuste → patch (0.2.0 → 0.2.1). Rode `node scripts/bump-version.mjs x.y.z`, acrescente a entrada no `CHANGELOG.md` e inclua no mesmo commit da melhoria.
- CI (`.github/workflows/ci.yml`) roda typecheck, Vitest, cargo test e clippy a cada push.
- Lançar versão (só com pedido do usuário): depois do commit da versão, `pwsh -File scripts/release.ps1` gera o instalador **assinado** + `latest.json` e publica no repositório **público** `Hideki515/Kira-Radial-releases` (de onde a Kira se atualiza); cria a tag anotada local — o `git push --follow-tags` é com confirmação. `-DryRun` gera e confere sem publicar.
- Chave de assinatura das atualizações: `%USERPROFILE%\.tauri\kira-radial.key` (fora do repo), senha no Gerenciador de Credenciais (`KiraRadial/updater-signing-key`); criada uma vez por `scripts/setup-signing-key.ps1`. Nunca mostrar a senha nem copiar a chave para o repositório. Perder a chave = versões instaladas não aceitam mais atualizações.
- `.claude/qa/` é local (no `.gitignore`).

## Restrições
- Não simular mouse/teclado na área de trabalho do usuário; não trocar dispositivo de áudio, bloquear, suspender ou desligar durante testes.
- Só encerrar processos iniciados pelo próprio assistente.
