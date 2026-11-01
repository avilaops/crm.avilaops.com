# Threads no CRM

A Central de integrações apresenta a conta Threads da empresa e permite
consultar métricas públicas. Publicação e conexão são gerenciadas no Hub Social.
Não há caixa de mensagens privadas nem importação automática de pessoas.

O backend expõe `GET /api/integrations/threads/status` e
`GET /api/integrations/threads/insights`. Ambos exigem sessão e obtêm o tenant
exclusivamente dela. A chamada ao Hub tem origem fixa, bloqueia redirecionamentos
e devolve somente campos validados, com `Cache-Control: no-store`.

## Ativação

- Provisionar `CRM_THREADS_API_TOKEN` no backend, com o mesmo segredo privado
  usado pelo Hub. Mínimo de 32 caracteres, gerado aleatoriamente.
- Cadastrar o vínculo explícito `tenant CRM → organização Hub` em
  `CRM_THREADS_TENANT_MAP` no Hub, após conferir a empresa.
- Autorizar a conta pelo Hub com `threads_basic` e `threads_manage_insights`.
- Não usar variáveis `VITE_*` para credenciais. O navegador não recebe tokens.

Configuração ausente retorna 503; empresa sem autorização retorna 403; falha
ou resposta inválida do Hub retorna 502, sem corpo bruto do provedor. A interface
mostra indisponibilidade e oferece nova consulta. Datas e períodos das métricas
são preservados; ausência de informação não vira zero.

Testes: `backend/test/threads.test.mjs`. Integração com conta real e revisão da
Meta são etapas separadas da validação automatizada. `threads_business_basic`
é destinado ao fluxo de anúncios e não é necessário para estas consultas.
