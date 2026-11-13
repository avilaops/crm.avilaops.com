# WhatsApp Web por QR Code

O caminho padrão em Configurações → Canais → WhatsApp é o QR da Evolution API v2. A instância é criada ao conectar pela primeira vez, com nome `crm_<UUID da empresa sem hífens>`. Usuários da mesma empresa usam a mesma conexão; empresas diferentes recebem instâncias diferentes. Somente administradores e gerentes podem parear ou iniciar sincronização manual.

Configure `EVOLUTION_API_URL`, `EVOLUTION_API_KEY` e `EVOLUTION_SYNC_ENABLED=true` no backend. A chave fica no ambiente do servidor. Não use variáveis `NEXT_PUBLIC_*`. No desenvolvimento, use túnel SSH para o serviço privado; em produção a API pode ser acessada pela rede Docker autorizada.

`EVOLUTION_TENANT_ID` e `EVOLUTION_INSTANCE_NAME` são opcionais e restringem o serviço a uma única empresa quando for necessário reaproveitar uma instância legada. Deixe ambos vazios para o padrão de múltiplas empresas.

## Fluxo

1. Entre no CRM e abra a configuração do WhatsApp.
2. Clique em Conectar WhatsApp Web.
3. No celular, abra Aparelhos conectados → Conectar aparelho e leia o QR real da Evolution. Se expirar, clique em Atualizar QR.
4. O estado só muda para conectado após a Evolution confirmar o pareamento.

As rotas são `/api/integrations/evolution/status`, `/connect` e `/sync`. Não aceitam tenant ou nome de instância do navegador: derivam a empresa da sessão. Os endpoints antigos de QR redirecionam para o fluxo novo.

Com a sincronização habilitada, o backend consulta a cada 15 segundos os canais Evolution criados pelo CRM, verifica o estado e importa até 100 registros recentes por ciclo. As mensagens são deduplicadas por empresa e ID externo. O recebimento atualiza o inbox pelo SSE existente. Webhooks de outras aplicações não são alterados.

Este conector importa textos de conversas individuais e legendas de mídia. Grupos, anexos binários e mensagens sem texto não são importados. Não é uma importação completa de todo o histórico. Envios só aparecem como aceitos após receber ID real da Evolution; falhas ficam como falhas no CRM.

## Verificação

`backend/test/evolution.test.mjs` cobre isolamento de empresas, contrato de envio v2, falhas reais, QR fornecido pela API e sincronização idempotente. `test/web/activation.test.ts` garante que o onboarding só reconhece o canal após estado conectado confirmado.

A instância `status` existente no servidor foi preservada. A solicitação de 13/11/2026 escolheu parear outro número para o CRM.
