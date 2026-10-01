# Integração com a Messageria (sms.avilaops.com)

> **A Messageria entrega. O CRM opera.** A decisão está na seção 3 do
> `FUNCIONALIDADES-PENDENTES-KOMMO.md` e este documento é como ela virou código.

Quem fala com a Meta é a Messageria, que sabe o plano do cliente, se a janela de
24 h está aberta, se aquele número pediu para sair e quanto a mensagem custou.
Um caminho que aponta para o `graph.facebook.com` não sabe nada disso e cobra
errado. E, no WhatsApp, a Meta bloqueia o **número**, não a mensagem: ter dois
sistemas inscritos no mesmo WABA dobra o risco sem dobrar a capacidade.

---

## O que passou para a Messageria

| Antes (Graph, daqui) | Agora |
| :--- | :--- |
| Texto livre pela Cloud API | `POST /api/v1/mensagens` (`canal: "whatsapp"`) |
| Modelo aprovado pela Cloud API | a mesma rota, com `modelo` e `variaveis` |
| Sincronizar modelos da WABA | `GET /api/v1/whatsapp/modelos` |
| Calcular a janela de 24 h aqui | espelhada do que a Messageria informa |
| Webhook da Meta direto no CRM | webhook **da Messageria**, assinado |

**O que ainda não passou: mídia.** O `POST /api/v1/mensagens` aceita texto,
modelo e produto do catálogo — imagem, documento e áudio não existem lá. Até
existirem, `whatsapp-media.ts` continua falando com a Graph, e é a última coisa
neste repositório que faz isso.

---

## Quem manda em quê

- **Messageria é dona** de entrega, status, janela de 24 h, opt-out, modelo
  aprovado, franquia, custo e de qual número sai a mensagem.
- **CRM é dono** da jornada comercial: conversa ligada a contato, empresa e
  lead; timeline; atribuição; SLA; nota interna.

A janela é o caso em que isso mais importa. O CRM **espelha**, não recalcula: o
evento de entrada traz `janelaExpiraEm`, e é esse carimbo que vira
`conversations.last_customer_message_at`. Um lado que refizesse a conta com o
que ele mesmo viu erraria toda vez que uma mensagem chegasse por um caminho que
ele não vê — e mandaria texto livre para conversa fechada, que a Meta recusa.

---

## Configurar

Precisa de uma chave `sk_live_…` da conta na Messageria:

```bash
curl -X POST /api/integrations/messageria/connect \
  -H 'content-type: application/json' --cookie "$SESSION" \
  -d '{ "baseUrl": "https://sms.avilaops.com", "apiKey": "sk_live_..." }'
```

O `connect` faz três coisas numa só chamada, de propósito:

1. lista os canais, o que prova que a chave vale — dizer "conectado" só porque
   há linha no banco foi o que fez a Central de Integrações mentir por semanas;
2. **assina os eventos** em `POST /api/v1/webhooks`, guardando o segredo
   devolvido;
3. espelha cada número num `channels` com `provider = 'messageria'`.

Conectar sem assinar deixaria o envio funcionando e a entrada muda — que é
exatamente o estado em que ninguém percebe que está, até um cliente reclamar que
respondeu e ninguém viu.

A chave e o segredo ficam cifrados (`encryptSecret`, AES-256-GCM) na mesma
tabela `integrations` já usada por Meta, Google e ERP.

`GET /api/integrations/messageria/status` responde o estado real, batendo na
Messageria. `POST .../disconnect` remove a assinatura lá antes de esquecer a
chave aqui: sem isso ela seguiria tentando entregar num endereço que não
confere mais nada.

---

## Recepção

`POST /api/integrations/messageria/webhook/:tenantId` é rota pública: quem chama
é a Messageria, que não tem sessão aqui.

A autenticação é a assinatura `x-avila-assinatura-v2`, no mesmo envelope do ERP:
`t=<epoch>,v1=<hex>` sobre `"<t>.<corpo>"`, janela de 300 s e comparação
`timingSafeEqual`. O carimbo de tempo é o que impede reapresentação — sem ele,
uma entrega capturada valeria para sempre e injetaria "mensagem recebida do
cliente" no inbox.

O tenant vem do caminho porque a entrega não carrega cabeçalho de tenant; o
endereço é registrado por tenant no `connect`, e quem prova a origem é a
assinatura, não a URL.

Eventos tratados:

| Evento | Efeito |
| :--- | :--- |
| `whatsapp.recebida` | contato, conversa e mensagem; não lido +1; janela espelhada; evento SSE |
| `whatsapp.entregue` / `falhou` / `status` | status da mensagem pelo `external_id` |
| `whatsapp.descadastro` | marca no contato |

**Idempotência.** Cada entrega vira linha em `inbound_events`, com o unique
`(tenant_id, source, external_id)`. A chave é `recebida:<idExterno>` para
mensagem — o id é o da Meta, que a Messageria repassa — e
`status:<mensagemId>:<estado>` para status, porque status não tem id próprio e o
par mensagem+estado é o que não se repete. Duplicata responde **200**: entrega
pelo menos uma vez é comportamento normal, e devolver erro faria a Messageria
reentregar à toa.

Falha de regra de negócio também responde 200, com o erro gravado na linha,
para o evento não circular até a dead-letter. O reprocessamento é manual.

---

## Vocabulário de status

A Messageria usa `FILA | ENVIADA | ENTREGUE | FALHOU | DESCADASTRADO`; aqui a
tela e os relatórios leem `sent | delivered | read | failed`. A tradução é na
fronteira (`traduzirStatus`, em `backend/messageria.ts`): guardar o texto cru
fazia a bolha exibir "ENVIADA" e o filtro de falha não encontrar nada.

`DESCADASTRADO` vira `failed` — para quem atende o efeito é o mesmo de não ter
sido entregue, e o motivo fica no `error_message`.

---

## Roteamento do envio

A decisão é pelo `provider` do canal da conversa, não por configuração global:

- `messageria` → Messageria;
- `qrcode` / `evolution` → Evolution API;
- `whatsapp` → Cloud API direto (o caminho legado, que segue funcionando).

Assim o corte é conversa a conversa, e ligar a Messageria não muda o que já
estava no ar.

---

## Pendente

- Mídia pela Messageria (hoje sai pela Graph).
- Tela de configuração no painel: as rotas existem, a UI não.
- Convergir a conferência de assinatura com a de `erp.ts` — mesmo envelope,
  duas implementações, porque a do ERP não tem como ser exercitada aqui.
