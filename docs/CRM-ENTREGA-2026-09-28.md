# CRM — lote de dez tarefas do Todoist

Implementação em `codex/crm-dez-tarefas`. Escopo: núcleo comercial do CRM, isolamento entre empresas e publicação SSH em `apps-noclient`, `/opt/agenda-crm/current`. Não abrange auditoria integral dos módulos de campanhas, voz, IA ou faturamento.

## Tarefas e implementação

| Todoist | Entrega |
| --- | --- |
| 6hWCVrp8x7FjmW6p | Auditoria de isolamento e matriz abaixo; casos negativos reproduzíveis |
| 6hWCVrv6gFrwJmHp | Tenant da sessão, integrações e OAuth por tenant, webhook pelo canal registrado |
| 6hWCVrvxVxXFRRCG | 13 testes de integração PostgreSQL com duas empresas e três papéis; execução no CI |
| 6hWCVrwCq69PRg2G | Contatos: criação, edição, exclusão, vínculos, responsável, etiquetas e timeline |
| 6hWCVv3Vgv9CxHwG | Empresas: CRUD, ficha com contatos/oportunidades e vínculos protegidos |
| 6hWCVv3WXWHhRPMp | Oportunidades: proprietário, vínculos, etiquetas, tarefas, histórico, ganho/perda/reabertura |
| 6hWCVv5WwR66qxQG | Vários funis; edição/reordenação, campos obrigatórios e movimentação com auditoria transacional |
| 6hWCVvF9GfQJx6QG | Tarefas: edição completa, vínculos, prazo, lembrete, estados e sincronização Calendar |
| 6hWCVvH6XwqCXJVp | SSE por tenant, presença por sessão recente, expiração/revogação, transferência e não lidas |
| 6hWCVvg38x973vQG | Script SSH com lock, backup, migração, imagem identificada pelo commit, health público e rollback |

## Auditoria e autorização

Antes: integrações Meta/Google usavam o tenant padrão; referências podiam apontar para IDs de outra empresa; sessão não verificava usuário ativo e mesmo tenant; gerentes podiam criar administradores; OAuth usava estado insuficientemente vinculado ao usuário; alterações de funil não tinham contrato transacional completo.

Agora: a sessão resolve a empresa com usuário ativo e vínculo consistente. Cabeçalhos/campos de tenant não mudam esse contexto. Referências do núcleo são validadas na API e por triggers no banco. Alteração do registro e auditoria compartilham transação. Webhook identifica um único canal e verifica HMAC com o segredo daquela empresa antes de escrever. OAuth usa nonce aleatório, expirável e de uso único, vinculado a usuário, empresa e provedor.

| Operação | Atendente | Gerente | Administrador |
| --- | --- | --- | --- |
| CRUD contatos, empresas, oportunidades e tarefas da própria empresa | Sim | Sim | Sim |
| Inbox, leitura, atribuição e SSE da própria empresa | Sim | Sim | Sim |
| Configurar funis | Não | Sim | Sim |
| Configurar Meta | Não | Sim | Sim |
| Administrar usuários/papéis | Não | Não | Sim |
| Ler/escrever registros de outra empresa | Não | Não | Não |
| Usar sessão desativada, expirada ou anônima | Não | Não | Não |

Limite deliberado: responsáveis organizam o trabalho, não criam isolamento individual dentro de uma mesma empresa. `DEFAULT_TENANT_SLUG` permanece apenas na compatibilidade do login sem código de empresa, provisionamento inicial e provisionamento do administrador central por SSO. O SSO recusa associação ambígua; uma conta cliente sem vínculo não entra automaticamente na empresa padrão.

## Evidências

- `npm run validate`: tipos, lint, 4 testes do CLI, 15 testes unitários do backend e build aprovados. Avisos preexistentes de hooks/voice e bundle acima de 500 kB permanecem.
- `CRM_INTEGRATION_TEST=1 CRM_TEST_MODE=1 DATABASE_URL=postgres://.../crm_test_acceptance node --test backend/test/tenant-integration.test.mjs`: 13/13 aprovados, sem skips. A migração é aplicada duas vezes para verificar idempotência. O teste recusa banco que não tenha `/crm_test_` no endereço.
- Dois tenants, administrador/gerente/atendente: leitura, escrita, IDs externos, desativação de sessão, inbox, timelines, OAuth, webhook assinado, SSE, presença, vínculos, pipeline e lembretes.
- Calendar usa HTTP simulado para criação, atualização, conclusão, reabertura e falha; nenhum compromisso real nem mensagem externa foi enviado. Conexão OAuth real precisa de uma conta Google do cliente e não foi exercitada neste lote. Referência: [Google Calendar events.update](https://developers.google.com/workspace/calendar/api/v3/reference/events/update).
- Navegador em base descartável: login, criação de funil/etapas/campo obrigatório, contato, tarefa vinculada com prazo e lembrete; revisão a 390 px. Capturas locais em `output/playwright/`.
- Produção: preflight somente leitura, sem vínculos cruzados nos relacionamentos examinados. Backup restaurado em banco separado e migração aprovada nessa cópia. Imagem anterior iniciou e respondeu health conectado contra a cópia migrada em rede Docker interna, sem acesso externo.

## Publicação e reversão

O servidor atual usa `current-app:latest`, não uma imagem GHCR. A consulta `docker manifest inspect ghcr.io/avilaops/crm.avilaops.com:latest` retornou `denied`; a credencial GitHub disponível não tem escopo de packages. Portanto, o acesso/publicação pelo GHCR permanece pendente. Não é necessário para o deploy SSH autorizado.

Compilar localmente e empacotar apenas `dist`, `dist-server`, `backend`, `packages`, `package.json`, `package-lock.json` e `scripts`; nunca incluir `.env`, chaves ou `node_modules`. Enviar para `/opt/agenda-crm/releases/<commit>/release.tgz` e executar `bash scripts/deploy-candidate.sh <commit-completo>` no servidor, a partir de uma cópia do script enviada separadamente. O script exige revisão de 40 caracteres, trava concorrência, verifica backup, compara lockfile do runtime e confirma a revisão em `/api/health` local e público.

Para reverter, ler `rollback-image.txt` da release, executar `docker tag <imagem-anterior> current-app:latest` e recriar somente o serviço app pelo compose existente e `.env.production.local`. Conferir `/api/health`. Não restaurar o dump sobre dados vivos como parte de uma reversão de código.

A migração adiciona colunas, índices, estados OAuth e validações; não remove dados. A reversão operacional usa a imagem anterior mantendo essas adições. Um downgrade destrutivo das colunas perderia vínculos/lembretes e não é necessário. O backup restaurável fica em `/opt/agenda-crm/backups/`, acessível somente no servidor.
