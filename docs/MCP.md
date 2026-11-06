# MCP do CRM

Endpoint de produção: https://crm.avilaops.com/mcp
Transporte: Streamable HTTP sem estado, respostas JSON.
Autenticação: Authorization: Bearer (credencial de serviço com pelo menos 32 caracteres).

## Configuração

Defina CRM_MCP_TENANT_ID como UUID da empresa autorizada.
Defina CRM_MCP_TOKEN com uma chave aleatória de 32 bytes ou mais, somente no gestor de segredos.
Alternativamente, defina CRM_MCP_TOKEN_SHA256 com o hash SHA-256 hexadecimal; nesse modo a chave original não pode ser recuperada no CRM.
Sem configuração válida o endpoint responde 503. Sem credencial válida responde 401.
GET e DELETE autenticados respondem 405: não há SSE persistente ou sessão compartilhada.
O Origin, quando enviado, precisa corresponder a PUBLIC_APP_URL (origem sem barra final).
O endpoint limita o corpo a 64 KiB e as requisições a 120/minuto por endereço.

Um administrador autenticado da empresa configurada pode obter a chave em
/api/integrations/mcp/credential. A resposta não é armazenada em cache.
Nunca coloque a chave no repositório, no pacote do plugin ou em uma conversa.
A rotação acontece trocando a chave no gestor de segredos e reiniciando a aplicação.

## Ferramentas

- crm_search_contacts: busca paginada por nome, telefone, e-mail e empresa.
- crm_get_contact: consulta por UUID.
- crm_list_conversations: conversas da empresa, opcionalmente por contato.
- crm_list_messages: mensagens de uma conversa, com remetente, datas e IDs.

Todas são somente leitura. Não enviam mensagens nem alteram cadastros.
O tenant é obtido da configuração da credencial, nunca dos argumentos de ferramenta.
As páginas aceitam limit de 1 a 100 e offset de 0 a 100000.
Mensagens da Evolution só aparecem depois de uma integração de ingestão separada.

## Validação

npm run typecheck
npm run lint
npm run test:backend

Os testes backend/test/mcp.test.mjs verificam negociação MCP, descoberta das ferramentas,
autenticação, origem, paginação, vinculação da empresa e sanitização de erros.
