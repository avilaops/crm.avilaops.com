# Contexto verificavel

- Identificador: `avila-crm-avilaops-com`.
- Origem: raiz deste checkout; nao depende de um caminho absoluto.
- Fontes encontradas: `README.md`, `package.json`, `AGENTS.md`.
- Gerenciador declarado: "npm@11.16.0".

## Estrutura observada

- `backend/`
- `dist-server/`
- `docs/`
- `nginx/`
- `packages/`
- `public/`
- `scripts/`
- `src/`
- `test/`
- `worker/`

## Scripts de verificacao declarados

- `lint`: `oxlint`
- `typecheck`: `tsc -b --pretty false && tsc -p tsconfig.server.json --noEmit --pretty false`
- `test`: `npm run cli:test && npm run test:backend && npm run test:web`
- `check`: `npm run typecheck && npm run lint && npm test`
- `worker:typecheck`: `npm --prefix worker run typecheck`
- `cli:test`: `npm test --workspace @avilaops/agenda-cli`
- `test:backend`: `tsc -p tsconfig.server.json && node --test backend/test/*.test.mjs`
- `test:web`: `tsx --tsconfig tsconfig.app.json --test test/web/*.test.ts`

Esta lista e um retrato de 15/10/2026, nao uma prova de que os comandos passaram.
Confirme os comandos e seus efeitos antes de executa-los. Alguns testes dependem de servicos externos.
Nao execute deploy, migracao ou envio como parte de uma consulta de status.
