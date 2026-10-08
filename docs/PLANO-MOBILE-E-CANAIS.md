# Layout mobile, Configurações e conexão de canais

> Plano de refatoração recebido em 02/10/2026 e o estado da implementação.
> O plano completo está no fim deste documento, como foi entregue; as
> decisões abaixo registram onde ele encontrou o código e o que mudou por isso.

## Sumário

- [Estado da implementação](#estado-da-implementação)
- [Decisões tomadas ao implementar](#decisões-tomadas-ao-implementar)
- [Contrato proposto para a Messageria](#contrato-proposto-para-a-messageria)
- [Como validar](#como-validar)
- [O que fica para as próximas fases](#o-que-fica-para-as-próximas-fases)
- [Plano original](#plano-original)

---

## Estado da implementação

Medido com `scripts/telas/verificar.mjs` (ver [Como validar](#como-validar)):
antes, **todas** as telas rolavam na horizontal em 390 px (de +100 a +732 px),
com campo cortado e fonte abaixo de 16 px. Depois, 22 telas × 5 larguras sem
rolagem horizontal nem campo cortado.

| ID | Item | Estado | Onde |
| --- | --- | --- | --- |
| QW-01 | Preço do WhatsApp em reais, com vigência | ✅ (valores a conferir no CSV, ver decisão 4) | `src/data/whatsappPricing.ts`, `src/components/whatsapp/Pricing.tsx` |
| QW-02 | Descrições únicas no onboarding | ✅ — os três cards viraram o checklist do Início | `src/lib/activation.ts`, `src/pages/workspace/HomePage.tsx` |
| QW-03 | Rótulo acima, campo fluido, 16 px no celular | ✅ | `FormField` em `src/components/ui/Form.tsx`; regra global em `src/index.css` |
| QW-04 | Lista de Configurações some quando o formulário abre (< 840 px) | ✅ | `src/pages/settings/SettingsPages.tsx` |
| QW-05 | Conexão do WhatsApp em uma coluna, com um botão principal | ✅ | `src/pages/settings/WhatsAppChannelPage.tsx` |
| QW-06 | Modal vira folha em tela cheia no celular | ✅ (`Sheet`, com Radix: foco preso, Esc, arrastar para fechar) | `src/components/ui/Sheet.tsx` |
| QW-07 | Alvos de 44 px em menu, linhas de configuração e botões de ícone | ✅ | casca, Configurações, Caixa de entrada |
| QW-08 | Auditoria fora do menu principal | ✅ | Configurações › Segurança e auditoria |
| CP-02 | `AppShell` responsivo | ✅ barra inferior < 600, trilho 600–1199, menu fixo ≥ 1200 | `src/components/layout/AppShell.tsx` |
| CP-03 | `MasterDetail` em Configurações e Caixa de entrada | ✅ rota própria por nível, Voltar do navegador funciona | `src/routes.ts`, `SettingsPages.tsx`, `WorkspacePages.tsx` |
| CP-04 | Árvore "Minha conta / Área de trabalho" | ⚠️ parcial — sem Notificações, Vendas e Dados e privacidade (decisão 5); busca ✅; redirecionamentos ✅ | `src/navigation.ts` |
| CP-06 | Central de integrações com estados | ✅ estados reais, filtro Canais/Integrações | `src/pages/settings/IntegrationCenterPage.tsx` |
| CP-08 | Checklist de ativação | ✅ concluído pelo dado real, não por clique | `src/lib/activation.ts` |
| CP-09 | Estados vazios | ⚠️ Caixa de entrada, Funil, Contatos e Base de conhecimento; Automações não | — |
| MP-05 | Funil no celular, uma etapa por vez | ✅ antecipado (abas com contagem e soma em R$, "Mover para…" no card) | `Pipeline` em `WorkspacePages.tsx` |
| MP-06 | Listas que viram cartões | ✅ antecipado em Contatos, Leads e Empresas | `DataTable` em `WorkspacePages.tsx` |
| CP-01 | Tech Provider na Meta | ❌ processo externo; caminho crítico do MP-01 | — |
| CP-07 | Importação CSV/vCard com base legal e deduplicação | ✅ (08/10/2026) arquivo, colunas, origem e base legal obrigatórias, repetidos, resumo e desfazer por 24 h. Sem XLSX; repetido é "completar" ou "não mexer", sem "criar novo" | `backend/contact-import.ts`, `backend/routes-import.ts`, `src/components/contacts/ImportContactsSheet.tsx` |
| CP-05, CP-10, MP-01 a MP-04, MP-07 a MP-10 | — | ❌ não iniciados | — |

Também entraram, porque apareceram no caminho:

- **Minha conta de verdade.** Perfil e Segurança mostravam nome, e-mail e sessões
  escritos à mão no código ("Nicolas Rosa", "Edge, Win10, Ribeirão Preto"),
  iguais para qualquer pessoa. Agora vêm da sessão, e a pessoa troca o próprio
  nome e a própria senha (`/api/me`, `backend/routes-account.ts`). Trocar a senha
  encerra as outras sessões.
- **Sair da conta.** Não havia botão de sair em lugar nenhum.
- **Janela de 24 h nas conversas da Messageria.** O backend já aplicava a regra
  aos dois caminhos, mas a tela só mostrava o contador e o botão de modelo para
  `provider = 'whatsapp'` — as conversas da Messageria ficavam sem aviso até o
  409 chegar.
- **Deep link por caminho.** `https://crm.avilaops.com/leads/pipeline/` abria o
  Início (bug 1.2 do `ARQUITETURA.md`); agora vira `/#/leads/pipeline/`.

## Decisões tomadas ao implementar

### 1. O Embedded Signup mora na Messageria, não no CRM

O plano pede que o CRM troque o código do Embedded Signup pelo token, assine os
webhooks `history`, `smb_app_state_sync` e `smb_message_echoes` e guarde a
credencial numa tabela `connection_secret` própria. O repositório já tinha
decidido o contrário, em 04/09/2026 (seção 3 do
[FUNCIONALIDADES-PENDENTES-KOMMO.md](FUNCIONALIDADES-PENDENTES-KOMMO.md)): **a
Messageria entrega, o CRM opera.** O CRM não guarda token da Meta nem recebe
webhook da Meta; quem tem o app da Meta, o token de usuário de sistema e o
webhook validado é o `sms.avilaops.com`.

Mantivemos a decisão: ela é a centralização que o ecossistema Ávila Ops quer —
um app Tech Provider, um Embedded Signup, servindo o CRM, o portal do cliente e
o que vier. Ter dois apps inscritos no mesmo WABA entrega cada evento duas
vezes, e a Meta bloqueia o número, não a mensagem.

Na prática: o processo de Tech Provider (CP-01) é do app da Messageria, o fluxo
de Coexistência (MP-01) é implementado lá, e o CRM abre esse fluxo e recebe os
eventos. O que o CRM precisa da Messageria está em
[Contrato proposto](#contrato-proposto-para-a-messageria). O modelo de dados da
seção 7.2 do plano continua valendo para as integrações que são do CRM (ERP,
Google, n8n, pagamentos).

**Revisão de 08/10/2026.** A conexão do cliente com a Meta passou a morar no
`auth.avilaops.com` ("a Ávila é que tem a Meta"): um app central, uma tela
(`/conta/meta`), e cada sistema lê a conexão por `GET /api/meta/ativos`. O
princípio acima não mudou, mudou o endereço: quem guarda o token é o auth, não a
Messageria nem o CRM. O CRM mantém uma cópia cifrada, renovada sozinha, e mostra
a conta em Configurações › Canais › WhatsApp. O que continua valendo daqui:
recebimento e envio em produção são da Messageria. O número que o CRM descobre
pela conta da Meta envia, mas não recebe, e por isso não conta como "WhatsApp
conectado". O "Contrato proposto" abaixo precisa ser relido com isso em mente: a
sessão de conexão hospedada deixa de ser necessária, porque a página já existe
no auth.

### 2. Coexistência aparece como "em breve", não como disponível

Sem a aprovação de Tech Provider não há Coexistência, e a conexão que existe
hoje é a clássica: o número sai do app WhatsApp Business do celular. Dizer
"continue a usar o WhatsApp Business no seu telefone" — como o modal antigo
dizia — seria prometer o que a conexão de hoje não entrega.

A tela mostra os dois caminhos: **"Um número só para o CRM"** (disponível, com a
equipe Ávila Ops) e **"Seu número de hoje, sem largar o app"** (em breve). O
texto "O que muda no seu celular" cobre os dois. Quando a Coexistência for
liberada, é trocar `COEXISTENCIA_DISPONIVEL` em `WhatsAppChannelPage.tsx`.

O botão principal — "Conectar meu WhatsApp Business" — abre hoje o caminho
assistido (seção 4.2 do plano, "sessão assistida"): o que separar antes da
chamada e o contato da equipe, que vem de `VITE_SUPORTE_WHATSAPP` e
`VITE_SUPORTE_EMAIL`. Sem essas variáveis a tela não mostra link quebrado:
orienta a falar com quem administra a conta.

### 3. O QR Code saiu da interface e não cria mais conexão

O "Teste em dois passos" era uma conexão pelo WhatsApp Web (Evolution API com
`integration: "WHATSAPP-BAILEYS"`), o caminho que a seção 4.1 manda retirar.
Pior: quando a Evolution não respondia, `POST /api/channels/qrcode/instance`
gerava um **QR falso**, que nenhum celular conseguia ler, e gravava um canal
parado em `connecting` — exatamente o único registro de `channels` em produção.

A rota agora responde `410` com o caminho oficial. Canais `qrcode`/`evolution`
que já existem continuam enviando (o roteamento do envio não mudou); a tela do
WhatsApp avisa quando encontra um, e a migração (MP-09) segue pendente.

### 4. Preços: tabela versionada, conferência pendente

Os valores da seção 4.4 estão em `src/data/whatsappPricing.ts` como dado com
vigência (`2026-10-01`), em décimos de milésimo de real e inteiros — somar 0,035
em ponto flutuante erra centavo. A próxima tabela da Meta (1º de janeiro, abril,
julho ou outubro) entra como mais um item da lista.

**Antes de publicar:** baixar o CSV "BRL rates" da página de preços da Meta,
conferir os quatro valores e trocar `conferidaNoCsvOficial` para `true`. A tela
diz "tabela da Meta vigente desde 01/10/2026"; se o CSV divergir, é o dado que
muda, não a tela.

### 5. Itens da árvore de Configurações que ficaram de fora

A árvore mostra só o que funciona: uma linha que abre "em construção" é o tipo
de tela que o plano pede para eliminar.

- **Notificações** (Minha conta): não há preferência de notificação no backend.
  A tela antiga mostrava uma tabela fixa com ✓ em tudo.
- **Vendas** (funis, etapas, fontes, campos): não existe editor de funil.
  "Fontes de lead" deixou de existir como tela — o WhatsApp foi para Canais, o
  Google Agenda para Integrações e as credenciais do app Meta do CRM ficaram sem
  tela (o código fica, marcado como legado, como o roadmap pede).
- **Dados e privacidade**: depende da importação (CP-07) e das bases legais.
- **Verificação em 2 etapas** aparece em Segurança como "em breve", sem botão.

### 6. "Testar sem conectar" não existe

O plano sugere manter o QR como "ambiente de demonstração" se ele fosse um
sandbox. Não era (decisão 3), e não há ambiente de demonstração. A opção não
aparece até existir uma de verdade.

### 7. Segurança corrigida no caminho

- **OAuth do Google Agenda.** O `state` era o id do tenant e o retorno
  (`/api/integrations/google/callback`) não pedia sessão: quem soubesse o id de
  uma empresa ligava a própria conta Google à agenda dela e passava a receber
  as tarefas. Agora o `state` é assinado com HMAC e amarrado ao hash da sessão
  (`backend/oauth-state.ts`), o retorno exige a mesma sessão e papel de
  administrador, e o tenant vem da sessão. Sem `GOOGLE_CLIENT_ID`, a rota
  responde 503 em vez de mandar o navegador ao Google com um client de
  demonstração.
- **Segredos no navegador.** A Central de integrações gravava chave do ERP,
  chave do n8n e token da Twilio no `localStorage`, e mostrava "Ativo" para o
  n8n sempre (`!!chave || true`) e para três gateways de pagamento que o
  servidor nunca teve. A Central agora lê o estado do servidor, conecta o ERP
  pela rota que já existia (segredo cifrado) e apaga do navegador os segredos
  que versões anteriores deixaram (`src/lib/legacyStorage.ts`).
- **Configurações da área de trabalho só para quem administra.** `PATCH
  /api/settings` e a escrita da base de conhecimento aceitavam qualquer usuário
  autenticado; agora exigem administrador ou gerente, a mesma regra do resto.
- **Checkout de mentira.** "Assinar" esperava 1,2 s e dizia "Assinatura ativada
  com sucesso" sem cobrar nem mudar nada. Virou "Quero o Pro", que leva à equipe;
  a aba de consumo com números fixos deu lugar ao custo do WhatsApp.

## Contrato proposto para a Messageria

Para o botão "Conectar meu WhatsApp Business" deixar de ser assistido (MP-01),
a Messageria precisa expor o fluxo. Proposta, a combinar no repositório dela:

**1. Sessão de conexão hospedada na Messageria.**

`POST /api/v1/whatsapp/conexoes` (chave da conta) → `{ id, url, expiraEm }`.
A `url` é uma página de `sms.avilaops.com` que roda o Embedded Signup v4 com o
app Tech Provider (`featureType: whatsapp_business_app_onboarding` para
Coexistência, session logging ligado). Ela troca o código pelo token no servidor
dentro do prazo da Meta, assina os campos de webhook, **não** registra o número
na Coexistência e dispara a sincronização de contatos e depois a de histórico
(prazo de 24 h, uma vez cada).

O CRM abre a `url` em popup; se o navegador bloquear (Safari no iPhone), mostra
"Abrir nesta aba" e "Enviar o link por e-mail" — a página é da Messageria, então
o link funciona em qualquer aparelho. Ao terminar, a página avisa a janela que a
abriu por `postMessage`, com origem `https://sms.avilaops.com`:
`{ tipo: 'whatsapp.conexao', estado: 'concluida' | 'cancelada' | 'erro', conexaoId }`.

**2. Eventos no webhook que o CRM já assina** (`x-avila-assinatura-v2`):

| Evento | Uso no CRM | Estado (seção 7.3) |
| --- | --- | --- |
| `whatsapp.conexao.pendente` | popup aberto, aguardando a Meta | `pending` |
| `whatsapp.conexao.concluida` `{ canalId, numero, coexistencia }` | espelha o canal, como no `connect` | `syncing` ou `connected` |
| `whatsapp.sincronizacao` `{ tipo: 'contatos' \| 'historico', feitos, total }` | barra de progresso, "mantenha o WhatsApp Business aberto" | `syncing` |
| `whatsapp.contatos` (lote) | contatos com origem e base legal | — |
| `whatsapp.historico` (lote) | mensagens antigas, com direção e data originais | — |
| `whatsapp.eco` | mensagem que a empresa mandou pelo app do celular, mostrada na conversa | — |
| `whatsapp.desconectado` `{ motivo, iniciadoPor }` | `PARTNER_REMOVED`: "o número foi desconectado pelo app no celular" | `disconnected` |

**3. Status com capacidades.** `GET /api/v1/whatsapp/canais` devolvendo, por
canal, `coexistencia`, `qualidade` e `moedaWaba` (para o MP-10) deixa a tela
trocar o "em breve" pelo dado, sem constante no código.

## Como validar

```bash
npm run validate          # typecheck, lint, testes (CLI, backend e web) e build
npm run test:web          # só os testes de rotas, preço, formatação e checklist

# Telas nos tamanhos reais, com a API simulada (dados fictícios):
npm run dev               # em outro terminal
node scripts/telas/verificar.mjs telas-capturas
```

O verificador precisa do Playwright com o Chromium
(`npm i -D playwright && npx playwright install chromium`; não entra no
`package.json` para não pesar no CI). Ele salva uma captura por tela e largura
(375, 390, 768, 1024 e 1440 px) e sai com código 1 se alguma tela de celular ou
tablet rolar para o lado ou cortar campo — os critérios de aceite do QW-03 e do
QW-04.

Conferência manual que o verificador não cobre: Safari do iPhone (zoom ao focar,
área segura, folha arrastando para fechar), leitor de tela nas folhas e no
checklist, e o fluxo real do Google Agenda com `GOOGLE_CLIENT_ID` configurado.

## O que fica para as próximas fases

Na ordem do plano, com o ajuste da decisão 1:

1. **CP-01 Tech Provider**, no app da Messageria — começa já, porque depende de
   prazo da Meta.
2. **Contrato da Messageria** acima, combinado e implementado lá; depois o
   **MP-01** no CRM (popup, estados `pending`/`syncing`, contatos e histórico).
3. **CP-05** modelo de conexão para as integrações do CRM (ERP, Google, n8n,
   pagamentos), com `audit_log` em toda mudança de estado.
4. ~~**CP-07** importação CSV/vCard~~ — feito em 08/10/2026. Ficou de fora:
   XLSX (a pessoa salva como CSV), a opção "criar novo" para repetido (o
   telefone é único por empresa) e a tela "Dados e privacidade", que agora tem
   de onde tirar a base legal de cada contato (`contacts.legal_basis`,
   `contact_imports`).
5. **MP-03/MP-04** custo estimado antes de enviar modelo pago e consumo real no
   Faturamento, quando a Messageria informar o custo por mensagem.
6. **MP-09** migração dos canais por QR que ainda existirem.

---

## Plano original

O texto abaixo é o plano como foi entregue em 02/10/2026.

# Plano de Refatoração do Agenda CRM (crm.avilaops.com): Layout Mobile e Configuração de Canais e Integrações

A refatoração deve começar por três mudanças: trocar o layout de três colunas por navegação em pilha (master-detail) abaixo de 840px, reorganizar as Configurações em "Minha conta" e "Área de trabalho", e reconstruir a conexão do WhatsApp sobre o Embedded Signup oficial da Meta com Coexistência, mostrando preços corretos em reais. Hoje o produto falha em pontos que derrubam a ativação de clientes leigos: formulários ilegíveis no celular, um QR code que confunde teste com conexão real e um preço em dólar ("a partir de $0,0002") que não corresponde à tabela da Meta.

## TL;DR

- **Layout:** abaixo de 840px, Configurações, Inbox e Listas mostram um painel por vez em pilha (lista, depois detalhe, com botão Voltar). A navegação principal vira barra inferior com 4 destinos mais "Mais", e todo alvo de toque passa a ter 44px no mínimo. Isso resolve sozinho a maioria dos bugs de severidade crítica.
- **Canais:** o fluxo padrão do WhatsApp passa a ser o Embedded Signup da Meta com Coexistência. O cliente mantém o app WhatsApp Business no celular, importa contatos e até 6 meses de histórico, e não corre o risco de bloqueio das conexões não oficiais por QR (Baileys/Evolution API). Antes disso, a Ávila Ops precisa ser Tech Provider aprovado pela Meta. Esse é o caminho crítico do plano.
- **Preços e integrações:** desde 1º de outubro de 2026 a Meta cobra também mensagens de serviço (após 1.000 grátis por número por mês) e utilidade dentro da janela de 24h. O CRM deve mostrar R$ 0,035 (utilidade, autenticação e serviço) e R$ 0,3217 (marketing) por mensagem entregue, e não "$0,0002". A Central de integrações deve ganhar um modelo único de conexão com estados explícitos, tokens criptografados, webhooks assinados e trilha de auditoria.

## 1. Diagnóstico por tela

Escala de severidade: **S1 Crítica** (impede a tarefa ou induz a erro com impacto financeiro ou legal), **S2 Alta** (tarefa possível com muito atrito), **S3 Média** (inconsistência que corrói confiança), **S4 Baixa** (polimento).

| # | Tela | Problema observado | Severidade | Causa provável | Correção |
|---|---|---|---|---|---|
| D1 | Configurações | Três colunas (menu principal, lista de configurações, formulário) espremidas em ~390px; texto quebra uma palavra por linha ("Verificação em 2 etapas") | S1 | Layout desktop sem breakpoint; colunas com largura fixa | Navegação em pilha abaixo de 840px |
| D2 | Configurações | Campos de formulário cortados à direita | S1 | Inputs com largura fixa ou `min-width` maior que o viewport; contêiner sem `overflow` tratado | Inputs `width: 100%`, rótulo acima do campo, contêiner com padding de 16px |
| D3 | Configurações | Perfil pessoal, dados da empresa, faturamento e segurança misturados no mesmo nível | S2 | Arquitetura de informação sem separação pessoal versus conta | Dividir em "Minha conta" e "Área de trabalho" |
| D4 | Configurações | "Auditoria & Logs" aparece no menu principal e também em Configurações | S3 | Duplicação de destino | Manter só em Configurações > Segurança e auditoria |
| D5 | Conexão WhatsApp | Painel lateral ocupa metade da largura; texto em coluna estreita; QR pequeno | S1 | Layout em duas colunas fixo | Uma coluna no mobile; QR com 240px ou mais, ou fluxo sem QR |
| D6 | Conexão WhatsApp | QR de "Teste em dois passos" ao lado de "+ Instalar" e "Opções Avançadas / Meta Cloud API": o cliente não sabe se está testando ou conectando o número real | S1 | Três caminhos concorrentes sem hierarquia | Um botão principal ("Conectar meu WhatsApp Business") e o teste como opção secundária com rótulo explícito "Ambiente de teste" |
| D7 | Conexão WhatsApp | Escanear um QR na tela do próprio celular é impossível (o cliente está no celular que precisa escanear) | S1 | Fluxo desenhado só para desktop | No mobile, usar deep link ou o fluxo de Coexistência, que acontece dentro do app WhatsApp Business |
| D8 | Modal benefícios | Preço "a partir de $0,0002" em dólar | S1 | Copy desatualizada ou incorreta | Preço em BRL vindo da tabela oficial da Meta |
| D9 | Modal benefícios | Modal sobreposto ao conteúdo, sem foco claro | S2 | Modal centrado em viewport pequeno | Bottom sheet em tela cheia no mobile, com botão fixo no rodapé |
| D10 | Modal benefícios | Lista promete "transmissões em massa" e "continuar usando o app" sem avisar que, na Coexistência, as listas de transmissão do app ficam desativadas | S2 | Copy incompleta | Bloco "O que muda no seu celular" |
| D11 | Tutoriais | Três cards com a mesma descrição ("Comece a receber mensagens direto na Agenda") | S3 | Placeholder não substituído | Descrição única por card, com resultado esperado e tempo estimado |
| D12 | Tutoriais | Tutoriais isolados numa tela, sem estado de progresso | S2 | Onboarding como conteúdo, não como checklist | Checklist de ativação na tela Início, com progresso |
| D13 | Menu principal | Oito itens de primeiro nível e subitens em drawer; "Segmentos (Beta)" e "Listas" sobrepostos | S2 | Crescimento orgânico do menu | Reagrupar (seção 2) |
| D14 | Global | Alvos de toque pequenos e densos | S2 | Componentes desktop | Token de alvo mínimo de 44px |

## 2. Nova arquitetura de informação

### 2.1 Princípios

1. **Separar o que é meu do que é da empresa.** É o padrão dos CRMs de referência. O HubSpot separa "Your Preferences" (notificações e perfil do usuário) de "Account Management" (segurança, IA, logs de auditoria). O Chatwoot mantém "Profile settings" no avatar, cujas configurações "apply to your profile only and do not change settings globally", e deixa "Account Settings" para o administrador. O Intercom organiza as Configurações em Workspace, Subscription, Channels, Fin AI Agent, Integrations, Data e Personal.
2. **Canais são diferentes de integrações.** Canal é por onde a conversa entra e sai (WhatsApp, Instagram, e-mail, widget do site) e gera uma caixa de entrada. Integração é um sistema que troca dados com o CRM (Mercado Pago, n8n, Google, Ávila OS). O Chatwoot segue essa divisão: canais em Settings > Inboxes > Add Inbox e integrações numa seção própria.
3. **No máximo dois níveis no menu lateral.** A Apple recomenda "In general, show no more than two levels of hierarchy in a sidebar".

### 2.2 Navegação principal (proposta)

```
Início (checklist de ativação + resumo do dia)
Conversas
  ├─ Caixa de entrada (chat: WhatsApp, Instagram, site)
  ├─ E-mail
  └─ Equipe (chats internos)
Vendas
  ├─ Funil
  └─ Leads
Contatos
  ├─ Pessoas
  ├─ Empresas
  ├─ Segmentos (Beta)        ← sai do 1º nível
  └─ Importar contatos
Agenda (calendário)
Automação
  ├─ Agente de IA
  ├─ Automações
  └─ Newsletter              ← sai de Comunicações; é campanha, não conversa
Catálogo
  ├─ Produtos
  └─ Mídia
⚙ Configurações (ícone no topo ou no avatar)
```

Decisões: "Todos os contatos e empresas" vira filtro dentro de Contatos. "Auditoria & Logs" sai do menu principal e fica em Configurações. Newsletter passa para Automação porque é envio em massa e, no WhatsApp, usa modelos de marketing pagos.

**No mobile (abaixo de 600px):** barra inferior com Início, Conversas, Vendas, Contatos e "Mais" (que abre drawer com Agenda, Automação, Catálogo e Configurações). A orientação do Android para navegação responsiva indica barra inferior para poucos destinos e drawer para muitos em largura compacta. A barra inferior do Material comporta de 3 a 5 destinos, e por isso a combinação 4 + "Mais".

### 2.3 Árvore de Configurações

```
Configurações
├─ MINHA CONTA (cada usuário)
│  ├─ Perfil: nome, foto, e-mail, telefone, idioma, fuso
│  ├─ Segurança: senha, verificação em 2 etapas, sessões ativas
│  ├─ Notificações: push, e-mail, som
│  └─ Assinatura de e-mail e respostas rápidas pessoais
│
└─ ÁREA DE TRABALHO (admin)
   ├─ Geral: nome da empresa, logo, fuso, moeda (BRL), formato de data
   ├─ Usuários e equipes: convites, papéis, permissões
   ├─ Canais: WhatsApp, Instagram/Messenger, E-mail, Widget do site
   │     (cada canal = 1 caixa de entrada, com horário, distribuição, bot)
   ├─ Integrações: Central de integrações (Mercado Pago, n8n, Google,
   │     Ávila OS, Portal do cliente, Webhooks, API)
   ├─ Vendas: funis e etapas, fontes de lead, campos personalizados
   ├─ IA: configurações do agente, fontes de conhecimento
   ├─ Dados e privacidade: importações, exportações, deduplicação,
   │     bases legais LGPD, retenção
   ├─ Faturamento: plano, uso de mensagens WhatsApp (R$), faturas
   └─ Segurança e auditoria: políticas (2FA obrigatório), logs de
         auditoria, logs de segurança
```

"Configurações de chat" e "Configurações de email" deixam de ser itens soltos e passam para dentro de cada canal em Canais. "Canais Meta" deixa de existir como item: WhatsApp e Instagram aparecem lado a lado em Canais.

## 3. Especificação de layout por breakpoint

### 3.1 Breakpoints e grid

Os breakpoints seguem as faixas do Material Design 3: compacto abaixo de 600dp, médio de 600 a 839dp, expandido de 840 a 1199dp e grande de 1200 a 1599dp. A Apple orienta: "Prefer using a split view in a regular, not a compact, environment", e no compacto a interface multicoluna colapsa para pilha.

| Token | Largura | Dispositivo típico | Navegação | Colunas de conteúdo |
|---|---|---|---|---|
| `bp-compact` | 0 a 599px | Celular retrato | Barra inferior + drawer "Mais" | 1 painel (pilha) |
| `bp-medium` | 600 a 839px | Celular paisagem, tablet retrato | Rail lateral (72px, só ícones) | 1 painel; lista + detalhe só em telas de leitura |
| `bp-expanded` | 840 a 1199px | Tablet paisagem, notebook pequeno | Rail ou drawer recolhível | 2 painéis (lista + detalhe) |
| `bp-large` | 1200px ou mais | Desktop | Drawer fixo (240 a 280px) | 2 ou 3 painéis |

Regras globais: margem lateral de 16px no compacto e 24px no médio; nada com largura fixa maior que 320px dentro de conteúdo; `env(safe-area-inset-*)` aplicado na barra inferior e em botões fixos (iPhone com Dynamic Island e home indicator); usar `100dvh` em vez de `100vh` no Safari iOS; inputs com fonte de 16px no mínimo, porque abaixo disso o Safari aplica zoom automático ao focar.

### 3.2 Configurações

| Breakpoint | Comportamento |
|---|---|
| Compacto | **Tela 1:** lista de seções agrupada ("Minha conta", "Área de trabalho"), cada linha com ícone, título, subtítulo curto e chevron, altura mínima de 56px. **Tela 2:** formulário da seção em largura total, cabeçalho com "‹ Configurações" e título. Rótulos acima dos campos. Botão "Salvar" fixo no rodapé, que só aparece quando há alteração. |
| Médio | Igual ao compacto, com conteúdo centralizado e largura máxima de 640px. |
| Expandido | Duas colunas: lista de seções (280px) e formulário (flexível, máximo de 720px). Menu principal recolhido em rail. |
| Grande | Drawer principal, lista de seções e formulário: três colunas apenas aqui. |

Critério de aceite: em 375x667 e 390x844, nenhum texto quebra no meio de uma palavra, nenhum campo corta e não há rolagem horizontal.

### 3.3 Conexão de canal (WhatsApp)

| Breakpoint | Comportamento |
|---|---|
| Compacto | Uma coluna. Topo: cartão "Conectar meu WhatsApp Business" (botão primário, 48px de altura, largura total). Abaixo: "O que acontece" em 3 passos numerados. Depois: "O que muda no seu celular" (acordeão). Por último: links secundários "Usar um número novo", "Testar sem conectar" e "Configuração avançada (Cloud API manual)". Sem QR para escanear na própria tela. |
| Médio/Expandido | Duas colunas 60/40: passos à esquerda e ilustração ou QR de teste à direita, com QR de 240px no mínimo. |
| Grande | Igual ao expandido, com largura máxima de 1040px. |

Estados de tela obrigatórios: inicial, aguardando Meta (popup aberto), sincronizando (barra de progresso com "Mantenha o WhatsApp Business aberto no celular"), conectado, erro (mensagem humana e ação "Tentar de novo" ou "Falar com suporte"), desconectado pelo celular.

### 3.4 Tutoriais e onboarding

| Breakpoint | Comportamento |
|---|---|
| Compacto | O checklist vira o primeiro bloco da tela Início: cartão com barra de progresso ("2 de 4 concluídos") e itens empilhados com ícone, título, resultado esperado, tempo estimado e botão de ação. Cards dispensáveis, mas o checklist só some quando é concluído ou ocultado de forma explícita. |
| Expandido ou maior | Checklist como painel lateral direito na tela Início (320px). |

A tela "Tutoriais" vira "Central de ajuda", com vídeos e artigos, e deixa de ser o ponto de ativação.

### 3.5 Inbox (Conversas)

| Breakpoint | Comportamento |
|---|---|
| Compacto | Pilha de três níveis: lista de conversas, conversa e painel do contato. A lista tem filtros em chips roláveis horizontalmente (Minhas, Não atribuídas, Todas, por canal). Na conversa, o composer fica fixo acima do teclado e o botão "Info" abre o painel do contato como tela cheia ou bottom sheet. Indicador da janela de 24h ("Janela aberta: 18h restantes" ou "Fora da janela: só modelos aprovados"). |
| Médio | Lista e conversa lado a lado só em paisagem a partir de 720px; senão, pilha. |
| Expandido | Lista (320px) e conversa; painel do contato como drawer sobreposto. |
| Grande | Três colunas: lista, conversa e contato (320px). |

### 3.6 Funil (kanban)

| Breakpoint | Comportamento |
|---|---|
| Compacto | **Uma etapa por vez**: seletor de etapa no topo (abas roláveis com contagem e soma em R$), lista vertical de cards abaixo. Mover um card: toque longo ou menu "Mover para…" com lista de etapas. Não depender de arrastar entre colunas no celular. Alternância "Kanban / Lista". |
| Médio | Colunas de 280px com rolagem horizontal e snap por coluna. |
| Expandido ou maior | Kanban completo com arrastar e soltar. |

O app móvel do Pipedrive oferece visão de pipeline, lista de atividades, calendário e lista de contatos como telas próprias, o que confirma que o funil no celular precisa ser redesenhado, e não apenas encolhido.

### 3.7 Listas (Contatos, Empresas, Produtos)

| Breakpoint | Comportamento |
|---|---|
| Compacto | Tabela vira **lista de cards**: nome em destaque, 2 campos prioritários (telefone e etapa ou empresa), avatar, chevron. Busca fixa no topo; filtros em bottom sheet; ações em massa via modo de seleção (toque longo). |
| Médio | Tabela com colunas prioritárias e primeira coluna congelada com rolagem horizontal. |
| Expandido ou maior | Tabela completa com seletor de colunas visíveis. |

O Nielsen Norman Group ("Mobile Tables", 17/9/2017) confirma que "Locking headers and allowing users to select a subset of data according to their needs make large data tables usable on mobile devices"; transformar linha em card, ocultar colunas não críticas ou usar rolagem horizontal com a primeira coluna fixa são os padrões consolidados.

## 4. Fluxo recomendado de conexão do WhatsApp

### 4.1 Decisão: oficial (Embedded Signup + Coexistência) como padrão; QR não oficial fora do produto

| Critério | Embedded Signup com Coexistência (oficial) | QR via WhatsApp Web (Baileys/Evolution API) |
|---|---|---|
| Conformidade | Fluxo oficial da Meta | Viola os Termos de Serviço; a própria Meta diz que vincular a conta a versões não oficiais "violates our Terms of Service" |
| Risco de bloqueio | Baixo, ligado à qualidade e ao consentimento | Alto e imprevisível; a Central de Ajuda do WhatsApp avisa que a conta "might also be temporarily or permanently banned" ao usar apps não oficiais (a ideia de que não cabe recurso vem só de blogs) |
| Estabilidade | API mantida pela Meta | Quebra quando a Meta muda o protocolo do WhatsApp Web |
| Custo por mensagem | Pago por mensagem entregue (tabela da Meta) | Zero, mas o custo real é o risco de perder o número do cliente |
| Celular do cliente | Continua usando o app WhatsApp Business | Precisa de sessão de "dispositivo conectado" ativa |
| Pré-requisito da Ávila Ops | Ser Tech Provider ou Solution Partner | Nenhum |

Recomendação: **não oferecer conexão não oficial a clientes**. Para uma transportadora regional, perder o número comercial custa muito mais do que alguns centavos por mensagem. Se a Ávila Ops já tem clientes conectados via Evolution API, tratar a migração como projeto à parte, com comunicação individual.

**Pré-requisitos da Ávila Ops (caminho crítico):** a documentação de Coexistência exige "You must already be a Solution Partner or Tech Provider", webhook capaz de processar os eventos e "Embedded Signup with session logging". Para virar Tech Provider: verificação do negócio no Meta Business Manager com 2FA, App Review com vídeos para obter "Advanced access" a `whatsapp_business_messaging` e `whatsapp_business_management`, e depois Access Verification, que, segundo o guia da Twilio, a Meta "typically takes 5 business days" para concluir. Concluídas as três etapas, o limite sobe para "200 new business customers in a rolling 7-day window". Atenção: a Meta avisa que "Embedded signup v2 will be deprecated on October 15, 2026"; qualquer implementação deve nascer na v4.

### 4.2 Passo a passo para o cliente leigo (ex.: transportadora)

**Antes (preparação, assistida pela Ávila Ops):**
1. Confirmar que o número comercial já usa o **app WhatsApp Business**, e não o WhatsApp pessoal. Se usar o pessoal, orientar a migração para o Business antes.
2. Confirmar a versão do app: a Meta exige "WhatsApp Business app version 2.24.17 or higher". O CRM mostra um passo "Atualize o app" com link para a loja.
3. Confirmar que o responsável tem login no Facebook com acesso ao Business Manager da empresa (ou criar durante o fluxo).
4. Avisar o que muda (tela "O que muda no seu celular", texto da seção 4.3).

**Durante (no CRM, de preferência no computador; no celular também funciona):**
5. Cliente toca em **"Conectar meu WhatsApp Business"**. Abre o popup do Embedded Signup da Meta.
6. Faz login no Facebook, escolhe ou cria o portfólio de negócios e seleciona **"Conectar conta existente do WhatsApp Business"**.
7. Digita o número. A Meta envia uma mensagem da conta oficial do Facebook Business no app WhatsApp Business. O cliente toca em **Conectar**, depois em **"Connect to the Business Platform"**, e escolhe **compartilhar o histórico de conversas**.
8. O popup fecha. O CRM recebe o evento `FINISH_WHATSAPP_BUSINESS_APP_ONBOARDING` com `waba_id`, IDs do número e o código de token.

**Depois (automático, com tela de progresso):**
9. Backend troca o código pelo token de negócio, assina os webhooks `history`, `smb_app_state_sync` e `smb_message_echoes` e **não** registra o número (a Meta manda "skip the phone number registration step" na Coexistência).
10. Dispara de imediato a sincronização de contatos e depois a de histórico. Há **24 horas** para isso; se o prazo passar, o cliente precisa ser desconectado e refazer o fluxo. Cada sincronização só pode ser pedida uma vez.
11. Tela de progresso: "Importando seus contatos e conversas. Mantenha o WhatsApp Business aberto no celular." A Meta recomenda exatamente esse aviso e informa que o processo "can take several minutes".
12. Ao terminar: tela de sucesso com 3 próximos passos (atribuir a caixa de entrada à equipe, criar mensagem de boas-vindas, testar enviando uma mensagem para si mesmo).

**Plano B no mobile:** se o cliente está no celular e o popup da Meta falha (bloqueio de pop-up no Safari), oferecer "Enviar link para o meu e-mail" e "Pedir ajuda da Ávila Ops" com agendamento. Para clientes que não sabem mexer no celular, o caminho ideal é uma **sessão assistida**: o consultor da Ávila Ops conduz pelo computador do cliente ou por chamada de vídeo, com checklist interno.

### 4.3 O que o cliente precisa saber (copy obrigatória, baseada na Meta)

- As conversas individuais dos **últimos 6 meses** podem ser sincronizadas; **grupos não**.
- **Listas de transmissão** do app ficam desativadas (as existentes ficam só leitura). Disparos em massa passam a ser feitos pelo CRM, com modelos aprovados.
- Mensagens temporárias, visualização única e localização em tempo real são desativadas nas conversas individuais.
- Dispositivos conectados são desvinculados e podem ser reconectados, exceto **WhatsApp para Windows** e WearOS.
- Mensagens enviadas **pelo app no celular continuam grátis**; as enviadas **pelo CRM** seguem a tabela da Meta.
- Para desconectar: no app, Configurações > Conta > Business Platform > Desconectar.
- Limite de vazão de 20 mensagens por segundo no número em Coexistência: a Meta informa que números usados no app e na Cloud API "have a fixed throughput of 20 mps" (textos de parceiros de 2025 citavam 5 mps; vale a documentação oficial), contra o padrão de 80 MPS por número da Cloud API, que pode subir para 1.000 segundo a documentação da AWS End User Messaging Social.

### 4.4 Preços: conferência de 02/10/2026

A página oficial https://whatsappbusiness.com/products/platform-pricing/ informa que mensagens de serviço e utilidade enviadas na janela de atendimento são gratuitas. A cobrança de serviço após 1.000 respostas e o exemplo de R$ 87,50 foram retirados por contradizerem essa fonte.

O CSV BRL em https://developers.facebook.com/docs/whatsapp/pricing retornou HTTP 429 nesta revisão. Os valores pagos e a vigência de 01/10/2026 permanecem provisórios no dado versionado, com `conferidaNoCsvOficial: false`. A interface não mostra tarifas nem simulador enquanto essa conferência estiver pendente. Não apresentar como confirmadas as alegações anteriores sobre alteração trimestral, migração de moeda ou interrupção de serviço sem pagamento.

Ao conferir o CSV, registrar URL do arquivo, data de consulta, vigência, moeda, país e linha de cada categoria paga. Só então atualizar os valores e a flag. O simulador considera avisos fora da janela de 24h; serviço é gratuito, e utilidade na janela é descontada. Descontos por volume e entradas gratuitas de anúncios não entram na estimativa.

### 4.5 E o QR "Teste em dois passos"?

O painel atual parece um sandbox de teste (o Kommo oferece algo semelhante, um "QR Sandbox" para testar "without needing to connect your real number"). Se for isso, manter como opção secundária com rótulo inequívoco: **"Testar sem conectar seu número (ambiente de demonstração)"**, nunca como elemento principal da tela. Se o QR for uma conexão via WhatsApp Web, removê-lo conforme a seção 4.1.

## 5. Importação de contatos

### 5.1 Fontes, em ordem de prioridade

1. **WhatsApp (Coexistência):** automática na conexão; a Meta sincroniza "All contacts with a WhatsApp number". É a fonte mais valiosa para PMEs que vendem pelo WhatsApp.
2. **CSV/XLSX e vCard (.vcf):** universal, sem dependência de aprovação de terceiros. O Google Contatos e o iPhone exportam vCard; planilhas cobrem ERPs.
3. **Google Contatos via People API (OAuth):** escopo `https://www.googleapis.com/auth/contacts.readonly` ("See and download your contacts"), que o Google classifica como **sensível**.

### 5.2 Google People API: o que planejar

- **Modo de teste é inviável em produção:** apps External em "Testing" ficam limitados a 100 usuários de teste cadastrados à mão, e o Google emite refresh token "expiring in 7 days" quando há escopos além de nome, e-mail e perfil. O cliente teria de reconectar toda semana.
- **Verificação de escopo sensível:** exige política de privacidade, domínio verificado, vídeo de demonstração e justificativa do escopo mínimo. O Google pede para usar "the narrowest scope necessary". Prazo de revisão estimado: 3 a 5 dias úteis segundo a documentação para desenvolvedores, ou 10 dias úteis segundo o FAQ (valores reunidos pela Agentic Fabriq). Escopos sensíveis não exigem a auditoria CASA, que vale para escopos restritos como Gmail.
- **Limite de tokens:** há "a limit of 100 refresh tokens per Google Account per OAuth 2.0 client ID"; ao estourar, o mais antigo é invalidado sem aviso. Reutilizar o token existente em vez de pedir novo consentimento a cada importação.
- **Recomendação:** lançar primeiro CSV/vCard (sem dependência) e iniciar a verificação do Google em paralelo; a importação via Google entra no médio prazo. Como a importação é pontual, considerar descartar o refresh token após importar (acesso único) e reduzir o risco guardado.

### 5.3 Fluxo de importação (assistente em 5 passos)

1. **Origem:** WhatsApp (se conectado), arquivo, Google.
2. **Mapeamento:** colunas detectadas automaticamente (Nome, Telefone, E-mail, Empresa, Etiquetas), com prévia das 5 primeiras linhas; no mobile, um campo por tela.
3. **Base legal (LGPD):** seleção obrigatória da origem e da base legal (cliente com contrato, consentimento, legítimo interesse). O RD Station já tornou obrigatória a informação da base legal na importação, e os contatos nascem com esse campo preenchido. Se a escolha for "legítimo interesse", mostrar aviso de que a ANPD, no Guia Orientativo de 2 de fevereiro de 2024, exige teste de balanceamento documentado.
4. **Deduplicação:** normalizar telefone para E.164 (+55 DDD número, tratando o nono dígito), e-mail em minúsculas e sem espaços; chave de correspondência: telefone E.164, depois e-mail; para cada duplicata, escolher "Atualizar existente", "Manter existente" ou "Criar novo"; relatório final com contagens.
5. **Resumo e desfazer:** "312 criados, 48 atualizados, 9 ignorados (telefone inválido)", com download dos erros e botão "Desfazer importação" por 24h (lote identificado por `import_id`).

### 5.4 Cuidados de LGPD

- Registrar por contato: origem, data, base legal, `import_id` e usuário responsável.
- Proibir no termo de uso a importação de listas compradas: a primeira sanção da ANPD (Processo nº 00261.000489/2022-62, DOU de 6/7/2023) multou a Telekall Infoservice em R$ 14.400 (duas multas de R$ 7.200) e aplicou advertência por oferecer "uma listagem de contatos de WhatsApp" sem base legal (art. 7º da LGPD).
- Disparos de marketing por WhatsApp só para contatos com opt-in registrado; respeitar "PARAR" e similares com descadastro automático.
- Atender direitos do titular (art. 18): exportar e excluir contato com propagação para integrações (n8n, Ávila OS).

## 6. Onboarding e estados vazios

**Checklist de ativação na tela Início (4 itens, por ordem de valor):**
1. Conectar o WhatsApp (resultado: "receba mensagens dos seus clientes aqui", cerca de 5 minutos).
2. Convidar sua equipe (cerca de 1 minuto).
3. Importar seus contatos (automático se o WhatsApp foi conectado; senão, CSV).
4. Criar a mensagem de boas-vindas ou a recepcionista com IA (cerca de 3 minutos).

Justificativa: a análise da Candu mostra que 66% das empresas usam checklist como primeiro ponto de contato, que de 3 a 5 passos é a faixa ideal, e que 90% embutem o checklist no produto em vez de flutuá-lo por cima. Itens devem ser concluídos por **evento real** (ex.: `channel.connected`), e não por clique em "marcar como feito".

**Estados vazios:** toda lista vazia mostra o que aparecerá ali, por que está vazia e uma ação principal. Exemplos: Caixa de entrada vazia → "Nenhuma conversa ainda. Conecte o WhatsApp para começar a receber mensagens" + botão; Funil vazio → "Crie seu primeiro negócio ou importe leads"; Contatos vazios → "Importar contatos" com as três origens. Não usar dados fictícios que se confundam com dados reais.

**Correção dos cards duplicados (D11):**
- Conecte um canal: "Receba as mensagens do WhatsApp e do Instagram da sua empresa em um só lugar."
- Crie uma recepcionista com IA: "Responda dúvidas frequentes 24h por dia e passe para um atendente quando precisar."
- Crie um bot de boas-vindas: "Cumprimente quem chama pela primeira vez e pergunte o que a pessoa precisa."

## 7. Arquitetura da configuração de serviços e integrações

### 7.1 Visão geral

A Central de integrações vira um **catálogo único** com dois tipos de item (Canal e Integração) sobre o mesmo modelo de "Conexão". O Auth compartilhado do ecossistema Ávila Ops autentica o **usuário**; cada Conexão guarda as **credenciais do serviço externo**, sempre no escopo da área de trabalho (tenant) e nunca do usuário, para que a saída de um funcionário não derrube o WhatsApp da empresa.

### 7.2 Modelo de dados (mínimo viável)

```
provider            (catálogo, estático/versionado)
  id, slug ("whatsapp_cloud", "mercado_pago", "google_contacts", "n8n",
  "avila_os", "portal_cliente", "webhook_out"), kind ("channel"|"integration"),
  auth_type ("embedded_signup"|"oauth2"|"api_key"|"internal_sso"),
  scopes_required[], docs_url

connection
  id, workspace_id, provider_id, display_name,
  status (ver 7.3), status_reason (código + mensagem humana),
  external_account_id (ex.: waba_id, mp user_id),
  external_meta JSONB (phone_number_id, is_on_biz_app, platform_type,
                       moeda da WABA, quality_rating…),
  scopes_granted[], connected_by_user_id, connected_at,
  last_healthcheck_at, last_success_at, expires_at, created_at, updated_at

connection_secret        (tabela separada, acesso restrito ao serviço)
  connection_id, kind ("access_token"|"refresh_token"|"api_key"|"webhook_secret"),
  ciphertext, key_version, created_at, rotated_at

webhook_endpoint
  id, connection_id, direction ("inbound"|"outbound"), url, secret_ref,
  events[], active

webhook_event            (caixa de entrada idempotente)
  id, connection_id, provider_event_id (UNIQUE), topic, received_at,
  signature_valid, payload (retenção curta), processed_at, attempts, error

sync_job
  id, connection_id, type ("wa_contacts"|"wa_history"|"google_contacts"|"csv"),
  status, progress, counts JSONB, deadline_at, started_at, finished_at, error

audit_log
  id, workspace_id, actor_type ("user"|"system"|"provider"), actor_id,
  action ("connection.created"|"connection.status_changed"|"secret.rotated"|
          "import.completed"|"contact.deleted"…), target_type, target_id,
  before JSONB, after JSONB, ip, user_agent, created_at
```

### 7.3 Estados de conexão

| Estado | Significado | Gatilho de entrada | O que o usuário vê | Ação oferecida |
|---|---|---|---|---|
| `draft` | Iniciada, não concluída | Clique em "Conectar" | "Conexão não concluída" | Continuar |
| `pending` | Aguardando etapa externa (popup Meta, verificação) | Retorno parcial do provedor | "Aguardando confirmação" | Ver passos |
| `syncing` | Conectada, importando dados | Pós-onboarding | Barra de progresso | Nenhuma (aguardar) |
| `connected` | Operacional | Healthcheck OK | Selo verde | Configurar, desconectar |
| `degraded` | Funciona com restrição | Ex.: qualidade baixa do número, limite de envio | Selo amarelo + motivo | Ver detalhes |
| `expired` | Credencial venceu | 401/`invalid_grant`, `expires_at` | Selo vermelho "Reconecte" | Reconectar (1 clique) |
| `error` | Falha persistente | N falhas seguidas de webhook/API | Selo vermelho + motivo humano | Tentar de novo, suporte |
| `disconnected` | Encerrada | Usuário, ou `account_update` com `PARTNER_REMOVED` (cliente desconectou pelo celular) | Cinza | Conectar de novo |

Transições sempre gravam `audit_log` e notificam os admins (e-mail + aviso na Central). No WhatsApp em Coexistência, o webhook `account_update` com `PARTNER_REMOVED` traz `disconnection_info` com motivo e quem iniciou; o CRM deve traduzir isso em mensagem humana ("O número foi desconectado pelo aplicativo no celular").

### 7.4 Segurança e gestão de tokens

- **Criptografia em envelope:** segredos cifrados com chave de dados por tenant, protegida por KMS; `key_version` permite rotação sem downtime. Tokens nunca vão ao frontend nem aos logs.
- **Escopo mínimo:** pedir só o necessário (ex.: `contacts.readonly`, nunca `contacts`).
- **Renovação proativa:** job que renova tokens antes de `expires_at` e move para `expired` quando a renovação falha.
- **Webhooks de entrada:** validar a assinatura antes de qualquer processamento. No Mercado Pago, o header `x-signature` traz `ts` e `v1`, e a validação é um HMAC com a chave secreta da aplicação; notificações de QR Code do Mercado Pago **não** podem ser validadas por assinatura e exigem consulta de confirmação à API. Na Meta, validar `X-Hub-Signature-256` com o App Secret.
- **Idempotência:** `provider_event_id` único; responder 200 rápido e processar em fila (o histórico do WhatsApp chega em rajadas de webhooks).
- **Webhooks de saída (para n8n e clientes):** assinar com HMAC por endpoint, retentativas com backoff exponencial, desativação automática após falhas repetidas e painel "Últimas entregas".
- **Permissões:** só papel Admin conecta e desconecta integrações; ações sensíveis exigem 2FA recente.

### 7.5 Integrações do ecossistema Ávila Ops

| Integração | Tipo de autenticação | Uso no CRM | Observação |
|---|---|---|---|
| Auth compartilhado | SSO interno (OIDC) | Login único entre CRM, Ávila OS e Portal | Não é Conexão; é identidade |
| Ávila OS / Portal do cliente | Token de serviço interno por tenant | Sincronizar empresas/contatos, abrir chamado a partir da conversa | `internal_sso`, renovação automática |
| n8n | Webhook de saída + chave de API de entrada | Automações customizadas por evento (`lead.created`, `deal.stage_changed`, `message.received`) | Catálogo de eventos documentado |
| Mercado Pago | OAuth (conta do cliente) ou chave + webhook | Link de pagamento na conversa, status de pagamento no negócio | Validar `x-signature` |
| Google Contatos | OAuth 2.0 | Importação | Ver seção 5.2 |
| WhatsApp Cloud API | Embedded Signup (token de negócio) | Canal | Ver seção 4 |

## 8. Design system

- **Tokens:** cor (semânticos: `color-success`, `color-warning`, `color-danger` para os selos de estado), espaçamento em escala de 4px, raio, elevação, tipografia (base de 16px no mobile, escala 12/14/16/20/24/32, altura de linha 1,5 para corpo), breakpoints (seção 3.1), `target-min: 44px`.
- **Componentes prioritários:** `AppShell` (barra inferior/rail/drawer conforme breakpoint), `MasterDetail` (pilha no compacto, colunas no expandido), `SettingsRow`, `FormField` (rótulo acima, ajuda, erro), `StickyActionBar`, `BottomSheet`, `StatusBadge` (estados da seção 7.3), `EmptyState`, `ChecklistCard`, `DataList` (tabela que vira card), `KanbanStage`.
- **Acessibilidade:** a meta do pedido (WCAG 2.1 AA com alvos de 44px) precisa de ajuste conceitual: o critério de 44x44px é o 2.5.5 Target Size (Enhanced), de nível **AAA**, enquanto o WCAG 2.2 criou o 2.5.8 (nível AA) com mínimo de 24x24px. A recomendação é adotar **WCAG 2.2 AA como conformidade e 44px como padrão interno**, alinhado aos 44pt da Apple (o Material recomenda 48dp). Contraste de 4,5:1 para texto e 3:1 para componentes; foco visível; formulários com `label` associado e erros anunciados (`aria-live`); modais com foco preso e fechamento por Esc; respeitar `prefers-reduced-motion`.
- **i18n pt-BR:** `Intl.NumberFormat('pt-BR', {style:'currency', currency:'BRL'})` → "R$ 1.234,56"; datas `dd/mm/aaaa` e horas em 24h; fuso padrão `America/Sao_Paulo` configurável por área de trabalho; telefones exibidos como "(11) 98765-4321" e armazenados em E.164; textos em arquivos de tradução desde já, mesmo com um idioma só.

## 9. Backlog priorizado

Estimativas em pontos relativos (P = até 2 dias, M = 3 a 5 dias, G = 1 a 2 semanas, para 1 dev).

### Fase 0: Quick wins (semanas 1 e 2)

| ID | Item | Tam. | Critérios de aceite |
|---|---|---|---|
| QW-01 | Corrigir preço do modal WhatsApp | P | Nenhuma ocorrência de "$" ou "0,0002" no produto; preços em BRL vindos de arquivo de configuração com data de vigência; texto revisado com os valores da seção 4.4 |
| QW-02 | Descrições únicas nos cards de tutorial | P | Três descrições distintas (seção 6); revisão de copy |
| QW-03 | Inputs fluidos e rótulos acima em Configurações | P | Em 375px e 390px: zero rolagem horizontal, zero campo cortado; fonte do input de 16px ou mais (sem zoom no Safari) |
| QW-04 | Ocultar a lista de configurações quando um formulário está aberto (abaixo de 840px) | M | Em 390px, o formulário ocupa 100% da largura menos 32px de margem; botão "‹ Configurações" volta à lista; estado preservado ao voltar |
| QW-05 | Tela de conexão WhatsApp em uma coluna no mobile, com hierarquia | M | Um único botão primário; QR de teste rotulado "Ambiente de demonstração", nunca acima do botão principal; QR com 240px ou mais quando exibido |
| QW-06 | Modal de benefícios vira bottom sheet em tela cheia no compacto | P | CTA fixo no rodapé respeitando `safe-area-inset-bottom`; fecha por gesto e por botão; foco preso |
| QW-07 | Alvos de toque de 44px nos itens de menu, linhas de configuração e botões de ícone | P | Auditoria automatizada (axe/Lighthouse) sem violações de 2.5.8; inspeção manual de 44px nos componentes listados |
| QW-08 | Remover "Auditoria & Logs" do menu principal | P | Item acessível só em Configurações > Segurança e auditoria; redirecionamento da rota antiga |

### Fase 1: Curto prazo (semanas 3 a 8)

| ID | Item | Tam. | Critérios de aceite |
|---|---|---|---|
| CP-01 | Iniciar o processo de Tech Provider na Meta (verificação do negócio, App Review, Access Verification) | G (calendário) | Advanced access aprovado para `whatsapp_business_messaging` e `whatsapp_business_management`; Access Verification concluída; Embedded Signup configurado na v4 com session logging |
| CP-02 | Componente `AppShell` responsivo | G | Barra inferior abaixo de 600px, rail de 600 a 1199px, drawer fixo a partir de 1200px; testes visuais nos 4 breakpoints; navegação por teclado completa |
| CP-03 | Componente `MasterDetail` aplicado em Configurações e Inbox | G | Compacto: pilha com Voltar e rota própria por nível (deep link funciona); expandido: duas colunas; botão Voltar do navegador respeita a pilha |
| CP-04 | Nova árvore de Configurações (Minha conta / Área de trabalho) | M | Itens conforme a seção 2.3; rotas antigas redirecionam; busca dentro de Configurações |
| CP-05 | Modelo `connection` + `connection_secret` + `audit_log` | G | Segredos cifrados com `key_version`; nenhum token em log (teste automatizado de varredura); toda mudança de status gera auditoria |
| CP-06 | Central de integrações com `StatusBadge` e estados da seção 7.3 | M | Cada conexão mostra estado, motivo humano e ação; filtro por Canais / Integrações |
| CP-07 | Importação CSV/vCard com mapeamento, base legal e deduplicação | G | Arquivo de 10 mil linhas importado em menos de 2 minutos; telefones em E.164; base legal obrigatória; relatório de duplicatas; "Desfazer" por 24h |
| CP-08 | Checklist de ativação na tela Início | M | 4 itens concluídos por evento; progresso persistido por área de trabalho; pode ser ocultado e reaberto |
| CP-09 | Estados vazios em Inbox, Funil, Contatos, Automações | M | Cada tela vazia com título, explicação e ação primária; nenhum dado fictício |
| CP-10 | Validação de assinatura dos webhooks (Mercado Pago `x-signature`, Meta `X-Hub-Signature-256`) e idempotência | M | Requisições com assinatura inválida rejeitadas e registradas; evento repetido não gera efeito duplicado (teste) |

### Fase 2: Médio prazo (semanas 9 a 16)

| ID | Item | Tam. | Critérios de aceite |
|---|---|---|---|
| MP-01 | Fluxo WhatsApp oficial com Coexistência (seção 4.2) | G | Evento `FINISH_WHATSAPP_BUSINESS_APP_ONBOARDING` tratado; registro do número pulado; sincronização de contatos e histórico iniciada em menos de 5 minutos e concluída antes do prazo de 24h; `smb_message_echoes` exibidos na conversa; `PARTNER_REMOVED` muda o estado para `disconnected` e notifica admins |
| MP-02 | Fluxo para número novo (Cloud API sem app) | M | Mesmo assistente, ramo "Usar um número novo"; registro do número e verificação por SMS/voz |
| MP-03 | Indicador de janela de 24h e seletor de modelos no composer | M | Fora da janela, só modelos aprovados podem ser enviados; custo estimado em R$ exibido antes do envio de modelo pago |
| MP-04 | Painel de uso e custo WhatsApp em Faturamento | M | Mensagens por categoria no mês, serviço gratuito, custo estimado em BRL após conferência oficial; tabela de preços versionada por vigência |
| MP-05 | Funil mobile com uma etapa por vez e "Mover para…" | G | Em 390px, mover negócio em 2 toques sem arrastar; soma por etapa em R$; alternância Kanban/Lista |
| MP-06 | `DataList` para Contatos, Empresas e Produtos | M | Cards no compacto, tabela com primeira coluna fixa no médio, tabela completa no expandido; seleção em massa por toque longo |
| MP-07 | Importação Google Contatos (após verificação do escopo sensível) | M | App em produção verificado; escopo `contacts.readonly` apenas; token descartado após importação ou renovado com segurança; mesma etapa de base legal e deduplicação do CSV |
| MP-08 | Webhooks de saída e catálogo de eventos para n8n | M | Assinatura HMAC por endpoint; retentativas com backoff; painel das últimas 50 entregas com status |
| MP-09 | Migração de clientes em conexão não oficial (se houver) | M | Lista de clientes afetados; roteiro de comunicação; janela de migração assistida por cliente |
| MP-10 | Verificação de moeda da WABA (BRL) por cliente | P | Relatório de WABAs fora de BRL; alerta para migrar antes de 30/06/2027 |

### Ordem de dependências

CP-01 (Tech Provider) é o caminho crítico de MP-01 e deve começar na semana 1, em paralelo aos quick wins, porque depende de prazos da Meta. CP-02 e CP-03 desbloqueiam toda a responsividade. CP-05 desbloqueia CP-06, CP-10, MP-01, MP-07 e MP-08.

## 10. Riscos e ressalvas

- **Dependência regulatória da Meta:** a Coexistência exige status de Tech Provider ou Solution Partner, e a Meta pode recusar o App Review ou pedir ajustes. Plano B: operar via um BSP parceiro com Embedded Signup (como fazem outros CRMs) até a aprovação própria.
- **Preços em BRL:** os valores vêm de parceiros concordantes, não do CSV oficial aberto diretamente; validar antes de publicar e revisar a cada trimestre (1º de janeiro, abril, julho e outubro).
- **Conferência oficial:** não reintroduzir franquia paga de serviço; a fonte oficial consultada informa gratuidade. Tarifas BRL continuam bloqueadas até acesso ao CSV.
- **Elegibilidade:** a Meta pode recusar números na Coexistência por critérios de atividade da conta; o Kommo orienta que, nesse caso, o cliente continue usando o app ativamente por um tempo ou fale com o suporte da Meta. O produto deve ter mensagem para esse erro.
- **Riscos de banimento em conexões não oficiais:** números como "1 em cada 5 contas banidas em um ano" circulam em blogs sem metodologia verificável; o argumento do plano se apoia na violação de Termos declarada pela própria Meta, e não nessas estatísticas.
- **Escopo:** este plano não cobre o redesenho visual (marca, ilustrações) nem o app nativo; tudo aqui é web responsiva, que atende o uso no Safari do iPhone observado.

