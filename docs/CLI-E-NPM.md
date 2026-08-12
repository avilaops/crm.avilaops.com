# Agenda CRM - CLI e npm

## Arquitetura

- A aplicacao `agenda-crm` continua privada e nao e publicada no npm.
- Somente `packages/cli` e empacotado como `@avilaops/agenda-cli`.
- O pacote contem apenas `bin`, `src` e o README proprio.
- Backend, frontend, arquivos `.env`, banco, assets e scripts de publicacao nao entram no pacote.

## Uso

No checkout do projeto:

```sh
npm run cli -- help
npm run doctor
npm run cli -- dev
```

Pelo registry npm:

```sh
npx @avilaops/agenda-cli doctor
npm install --global @avilaops/agenda-cli
agenda help
```

Para operar outro checkout:

```sh
agenda --cwd /opt/agenda-crm/current doctor --mode production
```

## Convencao de scripts npm

| Namespace | Exemplos | Responsabilidade |
| --- | --- | --- |
| `dev:*` | `dev:web`, `dev:api`, `dev:full` | Desenvolvimento |
| `db:*` | `db:migrate` | PostgreSQL |
| `docker:*` | `docker:up`, `docker:status`, `docker:logs` | Stack de producao |
| `worker:*` | `worker:dev`, `worker:typecheck`, `worker:deploy` | Worker Meta |
| `cli:*` | `cli:test`, `cli:pack`, `cli:publish`, `cli:release` | Pacote npm |

Os comandos de qualidade sao:

```sh
npm run typecheck
npm run lint
npm test
npm run check
npm run validate
```

## Diagnostico seguro

```sh
agenda doctor
agenda env check --mode local
agenda env check --mode production
agenda health
agenda info --json
```

`env check` informa somente os nomes ausentes ou ainda preenchidos com valores de exemplo. Valores reais nunca sao exibidos.

## Publicacao local

O script procura `NPM_TOKEN` nesta ordem:

1. variavel de processo `NPM_TOKEN`;
2. `.env.publish.local`;

Na publicacao local, o script usa primeiro a sessao ativa do `npm login`. Quando nao houver sessao, o token e escrito em um `.npmrc` temporario, utilizado somente pelo processo de publicacao e removido ao final. Use `--token` para exigir especificamente o token configurado.

Nao armazene `NPM_TOKEN` em `.env.local`, `.env.production` ou `.env.production.local`: esses arquivos pertencem ao runtime da aplicacao. Depois da primeira publicacao e da ativacao do Trusted Publisher, remova/revogue o token de escrita.

Validar sem publicar:

```sh
npm run cli:publish -- --dry-run
```

Publicar localmente a versao atual (somente bootstrap ou contingencia):

```sh
npm run cli:publish
```

Depois de configurar o Trusted Publisher, o comando de release incrementa a versao, valida, cria o commit/tag e envia ambos ao GitHub. O workflow faz a publicacao:

```sh
npm run cli:release -- patch
npm run cli:release -- minor
npm run cli:release -- major
```

O comando exige a branch `main` limpa e sincronizada com `origin/main`.

## Publicacao pelo GitHub Actions

O fluxo recomendado usa Trusted Publishing (OIDC), sem `NPM_TOKEN` no GitHub. Depois da primeira publicacao:

1. Ative 2FA na conta npm.
2. Configure o Trusted Publisher de `@avilaops/agenda-cli`.
3. Use o repositorio `avilaops/agenda`.
4. Use o workflow `publish-cli.yml`.
5. Use o environment `npm-production`.
6. Permita `npm publish`.

Uma tag que corresponda exatamente a versao do pacote dispara a publicacao:

```sh
git tag agenda-cli-v0.1.0
git push origin agenda-cli-v0.1.0
```

O workflow valida a versao, executa os testes, inspeciona o pacote e publica por OIDC. Como o repositorio e o pacote sao publicos, o npm gera provenance automaticamente.

## Regra de versao

- `patch`: correcao compativel.
- `minor`: novo comando ou capacidade compativel.
- `major`: mudanca incompatível na sintaxe ou no comportamento.

Uma versao npm publicada e imutavel. Nunca reutilize o mesmo numero.
