# Agenda CRM CLI

CLI oficial para padronizar desenvolvimento, diagnostico e operacao do Agenda CRM.

## Uso sem instalacao

```sh
npx @avilaops/agenda-cli doctor
npx @avilaops/agenda-cli dev
```

## Instalacao global

```sh
npm install --global @avilaops/agenda-cli
agenda help
```

Os comandos operacionais devem ser executados dentro de um checkout do Agenda CRM. Para outro diretorio, use `--cwd`:

```sh
agenda --cwd /opt/agenda-crm/current doctor --mode production
```

## Comandos principais

| Comando | Acao |
| --- | --- |
| `agenda dev` | Inicia API e frontend |
| `agenda build` | Compila a aplicacao |
| `agenda check` | Executa typecheck, lint e testes |
| `agenda db migrate` | Aplica o schema do PostgreSQL |
| `agenda docker up` | Constroi e inicia a stack |
| `agenda docker status` | Mostra o estado dos containers |
| `agenda worker typecheck` | Valida o Worker Meta |
| `agenda doctor` | Verifica ferramentas e ambiente local |
| `agenda env check --mode production` | Verifica apenas nomes/configuracao, sem mostrar secrets |
| `agenda health` | Consulta o healthcheck da API |
| `agenda info` | Mostra versoes, commit e caminho atual |

Use `agenda help` para a lista completa.

## Seguranca

O CLI nunca imprime valores de variaveis de ambiente. A publicacao npm pertence aos scripts privados do repositorio principal e nao faz parte do pacote distribuido.
