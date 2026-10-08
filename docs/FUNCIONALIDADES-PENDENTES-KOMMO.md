# Agenda CRM - Funcionalidades pendentes para paridade com a Kommo

Atualizado em: 4 de setembro de 2026
Base auditada: commit `7016eef` (01/09/2026), conferido contra o **banco de produção** `agenda_crm` em 178.105.82.48
Auditoria anterior: commit `dd7c981`, 11 de agosto de 2026
Escopo: frontend, backend, banco de dados, integrações, operação e segurança.

## 1. Objetivo

Este documento transforma a comparação com a Kommo em um backlog executável para o Agenda CRM.

Paridade funcional não significa copiar identidade visual, textos ou código da Kommo. Significa oferecer jornadas equivalentes, do início ao fim, com dados reais, persistência, permissões, auditoria, tratamento de falhas e experiência adequada para equipes comerciais.

### 1.1 A regra que vale acima de todas as outras

> **Uma funcionalidade só é considerada entregue quando permite ao usuário concluir a ação principal ponta a ponta em produção, com persistência e tratamento dos eventos necessários.**

Ter endpoint não é ter jornada. Ter tela não é ter operação. Ter código no repositório não é ter cliente atendido.

Esta regra existe por um motivo documentado. A auditoria de 11/08/2026 listou "envio outbound de texto pela API oficial do WhatsApp" e "atualização dos estados `sent`, `delivered`, `read` e `failed`" na seção **"o que já existe e não deve ser refeito"**. Em 04/09/2026 a verificação contra a Meta e contra o banco de produção mostrou que:

- o app Meta do CRM (`1670392484704840`) tem **zero webhooks assinados**: `/subscriptions` devolve `{"data":[]}`;
- o `META_TOKEN` do `.env.production` está **morto** (`code 190`, *the user logged out*);
- a tabela `messages` tem **0 linhas** desde sempre;
- o único registro em `channels` é um QR Code parado em `connecting` desde a criação.

Ou seja: o roadmap deu como pronto o núcleo do produto, e ninguém percebeu por quase um mês. Foi preciso alguém abrir o banco na mão para descobrir. É esse buraco que a regra acima fecha.

### 1.2 Os cinco critérios

Toda funcionalidade crítica é avaliada em cinco eixos. Só recebe ✅ quando os cinco necessários estão fechados.

| Critério | O que prova | Exemplo (Inbox) |
| --- | --- | --- |
| **UI** | A tela existe e mostra o estado real | a conversa aparece na lista |
| **API** | O backend executa a ação | envia e recebe mensagem |
| **Persistência** | O resultado sobrevive ao reload | a mensagem fica salva |
| **Integração** | O mundo externo responde | webhook e status da Meta chegando |
| **Produção** | Alguém real completou a jornada | fluxo ponta a ponta comprovado com dado de produção |

Quando um eixo não se aplica, marcar `n/a` explicitamente. Não deixar em branco: branco vira "esqueci" e "esqueci" vira ✅ por descuido.

## 2. Legenda

| Marcador | Significado |
| --- | --- |
| `P0` | Fundação obrigatória para operar com clientes reais |
| `P1` | Paridade comercial essencial |
| `P2` | Automação, escala e gestão avançada |
| `P3` | Ecossistema, enterprise e diferenciação |

| Estado | Significado |
| --- | --- |
| ✅ `Presente` | Os cinco critérios fechados; cliente conclui a jornada |
| ⚠️ `Parcial` | Parte da jornada existe, mas ela não fecha do início ao fim |
| 🧪 `Implementado, não comprovado em produção` | Código existe e talvez funcione; **nada em produção prova** |
| ❌ `Ausente` | Não existe implementação funcional |

O estado 🧪 foi criado em 04/09/2026 e é o mais importante dos quatro. Ele existe porque "tem código" e "funciona para cliente" são coisas completamente diferentes, e o formato antigo (só Presente/Parcial/Ausente) empurrava tudo que tinha código para "Presente". Nada sobe de 🧪 para ✅ sem evidência de produção: linha no banco, resposta da API externa, ou registro de uso por alguém que não seja quem escreveu o código.

## 3. Arquitetura definitiva de comunicação

- inbox em tempo real por SSE com distribuicao via `LISTEN/NOTIFY` do Postgres;
- contador de nao lidos por conversa e total do workspace;
- midia do WhatsApp nos dois sentidos, guardada em volume e servida com sessao;
- templates aprovados sincronizados da WABA e envio com variaveis;
- janela de atendimento de 24 horas imposta no backend e exibida no inbox.

Esses recursos ainda precisam de evolução nos pontos indicados abaixo, mas não partem do zero.

> **Nota de rota.** Os três últimos itens acima — mídia, modelos e janela de 24h —
> falam com a Meta a partir do CRM, porque foram construídos sobre o webhook e o
> token que já viviam aqui. A decisão registrada logo abaixo move essa camada
> para a Messageria. Quando a API interna existir, eles passam a consumi-la:
> `whatsapp-media.ts` e `whatsapp-templates.ts` isolam as chamadas à Graph
> justamente para que essa troca seja local, e a janela continua sendo do CRM
> como regra de tela mesmo quando o cálculo vier de fora.

**O CRM opera. A Messageria entrega.**

O `crm.avilaops.com` não deve manter infraestrutura própria de Meta/WhatsApp. Quem fala com a Meta é o `sms.avilaops.com` (Messageria), que já tem canal multi-tenant, token de usuário de sistema cifrado no banco, webhook validado por `X-Hub-Signature-256`, controle da janela de 24h e modelos sincronizados.

Isto vale como decisão, não como preferência. Os motivos:

1. **Já foi provado do lado da Messageria.** Em 03/09/2026 o número comercial `+55 17 99105-3597` recebeu mensagem de um desconhecido, roteada por `phone_number_id`, gravada com a carga completa. Ninguém preparou esse teste.
2. **Duplicar quebra.** Os dois apps Meta estão inscritos no mesmo WABA. Apontar os dois para a mesma URL de webhook entregaria cada evento duas vezes.
3. **Número é um só.** A Meta bloqueia o número, não a mensagem. Ter dois caminhos para o mesmo número dobra o risco sem dobrar a capacidade.

Consequência prática para este backlog: **tudo que a seção 6.9 pede de infraestrutura Meta sai do escopo do CRM** e vira integração com a Messageria. O CRM consome uma API interna; não guarda token da Meta, não recebe webhook da Meta, não sincroniza modelo.

O que fica no CRM: a jornada comercial. Conversa vinculada a contato, lead e tarefa; timeline; atribuição; SLA. O que vai para a Messageria: entrega, status, janela, modelo, catálogo, número.

## 4. Diagnóstico executivo

Verificado em 04/09/2026 contra o banco de produção. A coluna "evidência" traz a contagem real de linhas.

| Área | Estado | Evidência em produção | Principal lacuna |
| --- | --- | --- | --- |
| Contatos (base) | ✅ | `contacts` = 4.435 | ficha, timeline, campos, dedup |
| Caixa de e-mail IMAP | ✅ | `mail_senders` = 17, `integrations` provider `mail` | threading, envio pela ficha, vínculo ao lead |
| Agente de IA | ✅ | `ai_runs` = 12 sem erro (triagem 10, catálogo 1, campanha 1), `ai_suggestions` = 10 | RAG, agentes, mais trabalhos |
| Autenticação | ⚠️ | `sessions` = 6, `users` = 1 | recuperação, convites, 2FA, multi-tenant real |
| Newsletter | ⚠️ | `newsletter_campaigns` = 1 em `draft`, `newsletter_deliveries` = 0 | **nenhum envio saiu**; falta disparo real |
| Pipeline | ⚠️ | `pipelines` = 1, `pipeline_stages` = 4, `leads` = 0 | drag and drop, CRUD, ganho/perda |
| Auditoria | ⚠️ | `events` = 6, último em 29/08 | tela, antes/depois, retenção |
| **WhatsApp / Inbox** | 🧪 | `messages` = 0, `conversations` = 0, `channels` = 1 em `connecting`, webhook não assinado, token morto | **nunca operou**; migrar para a Messageria |
| Tarefas | 🧪 | `tasks` = 0 | schema do commit `51dac13`, jornada não exercida |
| Empresas | 🧪 | `companies` = 0 | schema existe, CRUD não |
| Automações | 🧪 | `automation_rules` = 0, `automation_runs` = 0 | schema existe, motor não |
| Chat de equipe | 🧪 | `team_channels` = 3, `team_messages` = 0 | canais criados, nenhuma mensagem |
| Segmentos | ❌ | `segments` = 0 | motor de condições |
| Produtos e mídia | ❌ | `products` = 0, `media_files` = 0 | catálogo e object storage |
| IA: fontes de conhecimento | ❌ | `knowledge_sources` = 0 | RAG (distinto do agente, que funciona) |
| Analytics | ❌ | — | métricas comerciais, SLA, ROI |
| Formulários e chat web | ❌ | — | construtor e captura |
| Integrações (central) | ❌ | credencial em `localStorage`, "conectado" falso | catálogo real com backend |
| Faturamento | ❌ | mock visual | planos, cobrança, entitlement |
| Perfil e workspace | ❌ | `tenant_settings` = 0 | dados fixos, salvar não persiste |

### 4.1 O que mudou desde a auditoria de agosto

Quatorze commits entraram entre `dd7c981` e `7016eef`. O que muda o backlog:

- **Caixa IMAP e newsletter** (`341c8d7` e anteriores): a seção 6.11 dizia `Ausente` para e-mail. Está errado: a conta `nicolas@avilaops.com` autentica, 17 remetentes catalogados, tela de configuração com senha cifrada em `integrations`. Ver `docs/` do módulo e a nota de produto sobre newsletter no CRM.
- **Agente de IA** (`15eebce` e o módulo de IA): a seção 6.21 dizia `Ausente`. Está errado: OpenAI `gpt-4.1-mini`, chave cifrada em `integrations`, três trabalhos rodando (triagem, catalogação, redação), 12 execuções sem erro, saída em JSON com esquema, e a pessoa aplica ou descarta. O que continua ausente é o **RAG** (`knowledge_sources` = 0), que é outra coisa.
- **Postgres 18** (`6b16fee`, `c71413a`): o banco de produção subiu de versão, em container próprio (`agenda-crm-db`), com usuário `agenda_crm`. A seção 6.26 fala em migrações versionadas; o commit `88291f0` já consertou o deploy que não migrava e o restore que não restaurava.
- **Deploy sem CI** (`7fd4964`, `6684a95`): o deploy deixou de depender do GitHub Actions, que está bloqueado por billing na conta `avilaops`. Scripts operacionais sincronizados com o host.
- **Marca própria** (`7fd4964`, `0d2c6e3`): a identidade da Kommo saiu; tela de entrada no padrão da casa.
- **Tarefas, empresas e QR de WhatsApp** (`51dac13`): entrou **schema e tela**, não jornada. `tasks` = 0, `companies` = 0, e o canal QR está em `connecting` desde que foi criado. Por isso 🧪, não ✅.

### 4.2 O que a auditoria anterior deu como pronto e não estava

A seção 3 da versão de agosto ("O que já existe e não deve ser refeito") listava seis itens de WhatsApp que a verificação de 04/09/2026 desmente. Ficam registrados aqui para não voltarem a ser tratados como base pronta:

| Afirmação de 11/08 | Verificado em 04/09 |
| --- | --- |
| "OAuth da Meta e sincronização inicial de WABAs/números" | nenhum canal Meta em `channels`; só o QR em `connecting` |
| "validação `X-Hub-Signature-256` no webhook da Meta" | código existe; **webhook não assinado no app**, então nunca foi exercido |
| "recebimento de mensagens do WhatsApp no PostgreSQL" | `messages` = 0, `inbound_events` = 0 |
| "envio outbound de texto pela API oficial do WhatsApp" | `messages` = 0; token do CRM morto |
| "atualização dos estados `sent`, `delivered`, `read` e `failed`" | nenhuma mensagem para atualizar |
| "inbox com busca e filtros processados no servidor" | a consulta existe; a caixa está vazia desde sempre |
| "idempotência básica de mensagens" | nunca exercida |

Nada disso significa que o código é ruim. Significa que ele **nunca rodou com dado real**, e que tratá-lo como fundação pronta foi o erro que este documento passa a evitar.

## 5. O que de fato está pronto e não deve ser refeito

Com os cinco critérios aplicados, e só com evidência de produção:

- autenticação por email e senha com sessão persistida no PostgreSQL (`sessions` = 6);
- cookie de sessão `HttpOnly`, `SameSite=Lax` e `Secure` em produção;
- usuários com papéis básicos `admin`, `gerente` e `atendente`, com ativação e desativação;
- estrutura de tenant nas tabelas principais (ainda não é multi-tenant real: `tenants` = 1);
- criptografia AES-256-GCM de segredo de integração em `integrations`;
- base de contatos real e consultável pelo servidor (`contacts` = 4.435, três origens etiquetadas);
- caixa de e-mail IMAP/SMTP configurada pela tela, com senha cifrada e teste de conexão;
- catalogação de remetente da caixa em contato (`mail_senders` = 17);
- agente de IA com três trabalhos, saída em JSON com esquema e revisão humana (`ai_runs` = 12);
- registro inicial de eventos e `request_id` (`events` = 6);
- Docker, PostgreSQL 18, healthcheck, scripts de backup/restore e manual operacional;
- deploy que não depende do CI bloqueado.

Esses recursos ainda precisam de evolução nos pontos indicados abaixo, mas não partem do zero.

## 6. Backlog funcional completo

### 6.1 Multi-tenant e ciclo de vida da empresa

Estado: ⚠️ `Parcial`
Prioridade: `P0`

- [ ] Criar cadastro de nova empresa/workspace.
- [ ] Criar onboarding com nome, slug, fuso horário, moeda, idioma e responsável.
- [ ] Permitir que um usuário participe de mais de uma empresa.
- [ ] Substituir o seletor de conta fixo por workspaces reais do usuário.
- [ ] Resolver o tenant pela sessão em todas as operações.
- [ ] Remover dependência de `DEFAULT_TENANT_SLUG` das integrações e webhooks.
- [ ] Mapear cada evento Meta ao tenant correto pelo `phone_number_id`, WABA ou configuração da integração.
- [ ] Garantir isolamento de leitura e escrita em consultas, jobs, arquivos e caches.
- [ ] Adicionar testes automatizados contra vazamento de dados entre tenants.
- [ ] Permitir suspender, reativar, exportar e encerrar um workspace.
- [ ] Registrar criação, troca, suspensão e encerramento em auditoria.
- [ ] Aplicar limites de plano por tenant.
- [ ] Preparar domínio próprio ou URL identificável por workspace, sem acoplar a arquitetura ao domínio.

Critério de aceite: duas empresas devem usar o mesmo ambiente sem visualizar, alterar ou receber eventos uma da outra, inclusive quando utilizarem contas Meta diferentes.

### 6.2 Conta, autenticação e segurança do usuário

Estado: ⚠️ `Parcial`
Prioridade: `P0/P1`

- [ ] Editar nome, telefone, idioma, fuso horário, avatar e preferências do perfil.
- [ ] Alterar email com confirmação.
- [ ] Alterar senha exigindo a senha atual.
- [ ] Implementar recuperação de senha por link de uso único e expiração curta.
- [ ] Confirmar email no cadastro e no convite.
- [ ] Implementar convite de usuário por email com aceite e definição de senha.
- [ ] Implementar autenticação em duas etapas e códigos de recuperação.
- [ ] Permitir 2FA obrigatório por workspace com período de adequação.
- [ ] Exibir sessões reais com dispositivo, navegador, IP, região, criação e último uso.
- [ ] Encerrar uma sessão específica ou todas as outras sessões.
- [ ] Revogar todas as sessões ao trocar senha ou desativar usuário.
- [ ] Adicionar política configurável de senha e proteção contra credenciais comprometidas.
- [ ] Trocar o rate limit em memória por armazenamento compartilhado.
- [ ] Implementar bloqueio progressivo e alertas de login suspeito.
- [ ] Adicionar login social/SSO quando fizer sentido comercial.
- [ ] Adicionar whitelist de IP para clientes enterprise.
- [ ] Exibir histórico de segurança e mudanças sensíveis.

### 6.3 Usuários, equipes e permissões

Estado: ⚠️ `Parcial`
Prioridade: `P0/P1`

- [ ] Criar grupos/equipes, como Vendas, Suporte e Financeiro.
- [ ] Vincular usuários a uma ou mais equipes.
- [ ] Criar papéis personalizados além dos três papéis fixos.
- [ ] Definir permissão `nenhuma`, `próprios`, `equipe` ou `todos` por recurso.
- [ ] Controlar visualizar, criar, editar, excluir e exportar separadamente.
- [ ] Controlar acesso por pipeline e etapa.
- [ ] Controlar acesso por canal/número do WhatsApp.
- [ ] Controlar campos sensíveis por papel.
- [ ] Controlar inbox compartilhado, mídia, automações, analytics e configurações.
- [ ] Restringir atribuição de conversas aos usuários autorizados no canal.
- [ ] Implementar convite pendente, reenvio e expiração.
- [ ] Implementar remoção definitiva com reassociação obrigatória de leads, conversas e tarefas.
- [ ] Exibir consumo de assentos e impacto no plano.
- [ ] Testar autorização em todos os endpoints, não apenas esconder botões no frontend.

### 6.4 Contatos, empresas e base de clientes

Estado: ⚠️ `Parcial`
Prioridade: `P0/P1`

- [ ] CRUD completo de contatos.
- [ ] Criar entidade `companies` própria, sem manter empresa apenas como texto no contato.
- [ ] CRUD completo de empresas.
- [ ] Relacionar contatos a empresas e armazenar cargo.
- [ ] Permitir vários contatos por empresa.
- [ ] Permitir vários leads por contato e por empresa.
- [ ] Criar ficha lateral/página de contato com dados, leads, tarefas e conversas.
- [ ] Criar ficha de empresa com contatos, leads, tarefas e histórico.
- [ ] Criar timeline unificada de mensagens, emails, chamadas, notas, tarefas e alterações.
- [ ] Adicionar notas internas e menções.
- [ ] Implementar tags com cores, busca e ações em massa.
- [ ] Implementar campos personalizados por tipo e validação.
- [ ] Suportar campos obrigatórios por etapa do pipeline.
- [ ] Definir responsável por contato e empresa.
- [ ] Implementar lixeira, restauração e exclusão definitiva conforme permissão.
- [ ] Implementar filtros avançados e filtros salvos.
- [ ] Permitir configuração, ordenação e largura de colunas por usuário.
- [ ] Implementar seleção e edição em massa.
- [ ] Implementar detecção preventiva de duplicados.
- [ ] Implementar busca e fusão assistida de contatos, empresas e leads duplicados.
- [ ] Preservar histórico e referências ao fundir registros.

### 6.5 Importação, exportação e migração de dados

Estado: ⚠️ `Parcial`
Prioridade: `P1`

- [ ] Reintroduzir importação VCF na versão web com relatório detalhado.
- [ ] Importar CSV, XLS, XLSX e ODS.
- [ ] Importar diretamente do Google Sheets.
- [ ] Mapear colunas para campos padrão e personalizados.
- [ ] Importar contatos, empresas e leads no mesmo arquivo e vinculá-los.
- [ ] Importar notas, tags, produtos e responsáveis.
- [ ] Exibir prévia, erros por linha, resumo e opção de desfazer importação.
- [ ] Normalizar telefone e email antes de deduplicar.
- [ ] Não criar números, emails ou registros duplicados.
- [ ] Exportar CSV, XLSX e VCF conforme permissões.
- [ ] Exportar tarefas em formatos de calendário.
- [ ] Executar grandes importações/exportações em background.
- [ ] Registrar autor, arquivo, contagens e falhas em auditoria.

### 6.6 Leads e ficha de negociação

Estado: ⚠️ `Parcial`
Prioridade: `P0/P1`

- [ ] Criar lead manualmente pela lista, pipeline, contato, empresa, email e formulário.
- [ ] Editar título, valor, moeda, responsável, etapa e status.
- [ ] Vincular e desvincular contato principal, contatos adicionais e empresa.
- [ ] Vincular produtos e quantidades ao lead.
- [ ] Adicionar tags, notas, arquivos e campos personalizados.
- [ ] Exibir timeline completa da negociação.
- [ ] Criar tarefas e enviar mensagens a partir da ficha.
- [ ] Exibir próxima ação e alerta de lead sem tarefa.
- [ ] Marcar como ganho ou perdido, com motivo e data.
- [ ] Reabrir leads ganhos/perdidos conforme permissão.
- [ ] Clonar lead e criar negócios recorrentes.
- [ ] Fazer ações em massa: etapa, responsável, tag, tarefa, exportação e exclusão.
- [ ] Criar filtros compostos e visualizações salvas.
- [ ] Adicionar links diretos e busca por identificador.
- [ ] Registrar todas as alterações relevantes no histórico.

### 6.7 Pipelines e funil de vendas

Estado: ⚠️ `Parcial`
Prioridade: `P0/P1`

- [ ] Permitir múltiplos pipelines por workspace.
- [ ] Criar, editar, duplicar, arquivar e excluir pipelines.
- [ ] Criar, renomear, colorir, reordenar e excluir etapas.
- [ ] Adicionar etapas de entrada, ganho e perda com semântica própria.
- [ ] Mover leads por drag and drop com atualização transacional no backend.
- [ ] Validar campos obrigatórios antes da mudança de etapa.
- [ ] Executar automações ao entrar ou sair de uma etapa.
- [ ] Exibir soma, quantidade, tarefas e alertas por coluna.
- [ ] Alternar entre quadro e lista preservando filtros.
- [ ] Configurar o conteúdo visual dos cards.
- [ ] Filtrar por responsável, equipe, tags, origem, data, status, tarefa e valor.
- [ ] Implementar paginação/virtualização para grandes funis.
- [ ] Criar templates de pipeline por segmento de negócio.
- [ ] Criar regras de acesso por pipeline e etapa.
- [ ] Calcular previsão, velocidade e conversão por etapa.

### 6.8 Inbox omnichannel

Estado: ⚠️ `Parcial`
Prioridade: `P0/P1`

- [ ] Atualizar conversas em tempo real por WebSocket ou SSE.
- [ ] Exibir conteúdo da última mensagem na lista.
- [ ] Controlar mensagens não lidas e marcar como lida/respondida.
- [ ] Separar aguardando, em atendimento, respondida, fechada e arquivada.
- [ ] Reabrir conversa arquivada.
- [ ] Criar filas por equipe, canal, prioridade e horário.
- [ ] Permitir transferência entre atendentes e equipes.
- [ ] Aplicar permissões por canal e equipe em toda consulta.
- [ ] Mostrar presença e evitar respostas simultâneas conflitantes.
- [ ] Exibir quando outro atendente está visualizando ou digitando.
- [ ] Adicionar notas internas e menções sem enviar ao cliente.
- [ ] Criar respostas rápidas com variáveis do CRM.
- [ ] Enviar e visualizar imagem, vídeo, áudio, documento, localização e contato.
- [ ] Reproduzir áudio e mostrar transcrição quando disponível.
- [ ] Exibir reações, botões, listas, carrosséis e mensagens interativas.
- [ ] Fazer upload com progresso, limite, validação e tentativa novamente.
- [ ] Exibir detalhes de entrega, leitura, erro e custo por mensagem.
- [ ] Implementar retry controlado de mensagens com falha.
- [ ] Exibir a janela de atendimento de 24 horas do WhatsApp.
- [ ] Impedir texto livre fora da janela e oferecer templates aprovados.
- [ ] Criar conversa outbound usando template autorizado.
- [ ] Exibir painel lateral do cliente com contato, empresa, lead, tarefas, tags e histórico.
- [ ] Vincular, criar, fundir ou trocar contato/lead sem sair da conversa.
- [ ] Criar tarefas e compromissos a partir de uma mensagem.
- [ ] Implementar busca dentro da conversa.
- [ ] Criar filtros salvos, ordenação e controles de paginação visíveis.
- [ ] Exibir contadores globais reais, não apenas da página carregada.
- [ ] Implementar bloqueio, spam e opt-out quando suportado pelo canal.
- [ ] Criar notificações de nova mensagem, menção, transferência e SLA.

### 6.9 WhatsApp: integração com a Messageria

Estado: 🧪 `Implementado, não comprovado em produção`
Prioridade: `P0` (é a fundação do produto, e hoje ela não existe em operação)

| Critério | Situação |
| --- | --- |
| UI | ⚠️ inbox e conversa desenhadas, nunca com dado real |
| API | 🧪 rotas de envio existem; nunca entregaram |
| Persistência | ❌ `messages` = 0, `conversations` = 0, `inbound_events` = 0 |
| Integração | ❌ webhook não assinado no app Meta; `META_TOKEN` morto |
| Produção | ❌ nenhuma jornada concluída |

Esta seção foi reescrita em 04/09/2026. A versão anterior pedia que o CRM construísse infraestrutura Meta própria: Embedded Signup, assinatura de webhook, registro de número, renovação de token, sincronização de modelos e catálogo. **Isso sai de escopo**, pela decisão da seção 3: o CRM opera, a Messageria entrega.

O que muda na prática: o trabalho deixa de ser "implementar a Cloud API" e passa a ser "consumir a Messageria e cuidar da jornada comercial". É menos código, e o que sobra é o que o CRM sabe fazer.

#### 6.9.1 Sair da infraestrutura própria de Meta

- [ ] Parar de tratar as rotas Meta do CRM como caminho de produção.
- [ ] Remover o `META_TOKEN` morto do `.env.production` para ninguém tentar reusá-lo.
- [ ] Desinscrever o app "Ávila Ops" (`1670392484704840`) do WABA `1055665857141232`, ou deixar explicitamente documentado que ele não recebe webhook.
- [ ] Encerrar o canal `qrcode` parado em `connecting`: ele desenha um estado que nunca vai avançar. *(02/10/2026: o CRM não cria mais canal por QR — a rota responde 410 — e a tela do WhatsApp avisa quando encontra um; o registro antigo continua no banco.)*
- [ ] Manter o código de webhook/OAuth desativado e marcado, não apagado, até a integração nova estar comprovada.

#### 6.9.2 Consumir a Messageria

Implementado; falta a prova em produção. O como está em
[INTEGRACAO-MESSAGERIA.md](INTEGRACAO-MESSAGERIA.md).

- [x] Definir a credencial do CRM na Messageria (chave de API por conta, não token da Meta).
- [x] Guardar essa credencial cifrada em `integrations`, no mesmo padrão de `mail` e `ai`.
- [x] Enviar mensagem pela API da Messageria (`canal: "whatsapp"`), sem falar com a Graph API.
- [x] Receber mensagem e status por webhook **da Messageria** para o CRM, com assinatura validada.
- [x] Gravar entrada e saída em `messages`, com `external_id` para idempotência.
- [x] Refletir os estados de entrega que a Messageria já apura.
- [x] Espelhar a janela de 24h que a Messageria controla; não recalcular.
- [x] Listar os modelos aprovados vindos da Messageria; não sincronizar com a Meta direto.
- [x] Exibir de qual número a mensagem saiu, separando produção de número de teste.
- [x] Tratar erro de canal (número não verificado, sem modelo, fora da janela) com mensagem que a pessoa entenda.
- [ ] **Mídia pela Messageria.** O `POST /api/v1/mensagens` de lá aceita texto, modelo e produto do catálogo; imagem, documento e áudio não existem. Enquanto não existirem, `whatsapp-media.ts` segue falando com a Graph — é a última coisa neste repositório que faz isso.

#### 6.9.3 A jornada comercial, que é o que fica no CRM

- [ ] Vincular conversa a contato, empresa e lead.
- [ ] Criar contato ou lead a partir de uma conversa nova.
- [ ] Exibir a timeline unificada da pessoa: WhatsApp, e-mail, tarefas e alterações.
- [ ] Atribuir conversa a atendente e a equipe.
- [ ] Medir SLA de primeira resposta e de espera.
- [ ] Notificar conversa sem responsável e janela prestes a fechar.
- [ ] Criar tarefa a partir de uma mensagem.
- [ ] Registrar nota interna sem enviar ao cliente.

#### Critério de aceite

Uma conversa iniciada por um desconhecido no WhatsApp precisa: aparecer no inbox do CRM, virar contato com um clique, ser respondida de dentro do CRM, ter a resposta entregue pela Messageria com status confirmado, e deixar registro na timeline. Enquanto isso não acontecer com um número real e uma pessoa real, esta seção permanece 🧪.

O caso concreto que serve de teste: em 03/09/2026 chegou "Por acaso vcs não vende cabo de ligar SSD sata no Pc aí não neh ?" de `+55 16 99234-8303`. A janela fechou em 04/09 sem resposta. Quando um caso como esse for atendido inteiro pelo CRM, a seção fecha.

### 6.9-A Origem e resposta na Messageria (04/09/2026)

Estado: ⚠️ `Parcial` — no ar e comprovado; falta a última prova, que depende da Meta
Prioridade: `P0`

| Critério | Situação |
| --- | --- |
| UI | ✅ as duas telas renderizam em produção |
| API | ✅ `responderConversa` chama a mesma `enviarWhatsapp` da API pública |
| Persistência | ✅ migration `20260904000000_canal_de_teste` aplicada; 1 canal marcado |
| Integração | ✅ webhook da Meta já entrega inbound neste número desde 03/09 |
| Produção | ⚠️ telas provadas com dado real; **resposta ainda não enviada** |

Duas telas do `sms.avilaops.com` que fazem parte desta correção, não de outro projeto:

1. **`painel/mensagens`**: coluna **De** com o número de origem, selo separando produção de teste da Meta, filtro por origem (que também isola o SMS simulado), faixa de aviso quando a lista inteira é de teste, e link de cada envio de WhatsApp para a conversa.
2. **`painel/conversas/[telefone]`**: entrada e saída na mesma linha do tempo, contador da janela de 24h que atualiza sozinho e troca de cor na última hora, texto livre enquanto a janela está aberta, seleção de modelo aprovado quando ela fecha, e registrar ou desfazer pedido de saída pela tela.

Nada reimplementa regra: responder chama a mesma `enviarWhatsapp` da API, então janela, opt-out, modelo aprovado, franquia e teto continuam valendo iguais.

#### O que já está comprovado em produção

Deploy em 04/09/2026, commit `88f2db6` na branch `painel/origem-e-resposta`. O Docker Desktop estava fora e o Actions segue bloqueado, então a imagem foi construída no servidor a partir do standalone (receita no README do projeto).

- Migration aplicada: `ALTER TABLE` + `UPDATE 1`. O `+55 17 99105-3597` ficou `teste=f, padrao=t`; o `+1 555-147-4741` ficou `teste=t, padrao=f`. Exatamente um canal marcado, e o de teste nunca vira padrão de envio.
- `painel/mensagens` responde com a coluna **De**, os três filtros de origem e os selos. Com `origem=producao` sobram só as duas linhas do número comercial, ambas `falhou` com o erro `131058`; com `origem=teste` aparece a faixa "Nenhuma destas saiu por um número de produção". É o oposto do que a tela mostrava antes, e é a verdade.
- `painel/conversas/+5516992348303` traz a conversa que se perdeu: o texto "cabo de ligar SSD", o selo `atendido por +55 17 99105-3597`, o aviso `sem janela aberta`, a lista de modelo aprovado (só `hello_world`) e o botão de registrar pedido de saída.

#### 08/09/2026: o gargalo não era modelo, é pagamento

Os dois modelos em pt_BR **já estavam aprovados na Meta desde 01/09**. O painel é que ficava velho: o app assinava só o campo `messages`, que cobre mensagem recebida e status de entrega e **não** o ciclo de vida do modelo. O campo próprio é `message_template_status_update`.

Corrigido em `704f6fa`: o campo foi assinado na Meta e o webhook passou a tratar o evento, gravando estado e motivo da recusa. Detalhe que quase o fez sumir de novo: esse evento **não traz `metadata.phone_number_id`**, porque o assunto é a WABA inteira, e a rota descartava tudo sem esse campo. Daqui em diante o lojista vê "Aprovado" ou "Rejeitado: motivo X" sem depender de botão nem de script.

Com os modelos aprovados, o primeiro envio pelo número comercial foi feito. A Meta **aceitou** (HTTP 200, `accepted`) e depois **falhou** no webhook:

```
131042 Business eligibility payment issue
```

O `health_status` da WABA confirma onde está o bloqueio:

| entidade | pode enviar |
| --- | --- |
| BUSINESS | AVAILABLE |
| APP (Messageria) | AVAILABLE |
| **WABA** | **BLOCKED** — `141006` erro na forma de pagamento |

Ou seja: a plataforma está pronta e a conta Meta não. Isso bloqueia **conversa iniciada pela empresa**; resposta dentro da janela de 24h continua funcionando, o que explica as entregas anteriores pelo número de teste.

#### O que falta

- [ ] **Resolver a forma de pagamento da WABA no Business Manager.** É a única coisa entre nós e o primeiro envio real, e só o dono da conta faz.
- [ ] Refazer o envio do `teste_de_canal` assim que o pagamento estiver regular.
- [ ] Responder uma conversa dentro da janela de 24h. Não dá para forçar: a janela abre quando **o cliente** escreve.

Enquanto o envio não sair, a seção fica ⚠️: as telas estão provadas, a jornada completa não.

### 6.10 Outros canais de comunicação

Estado: ❌ `Ausente`
Prioridade: `P1/P2`

- [ ] Criar arquitetura de adaptadores para novos provedores.
- [ ] Instagram Direct.
- [ ] Comentários do Instagram e resposta por comentário/DM.
- [ ] Menções em Stories e reações.
- [ ] Facebook Messenger e comentários de páginas.
- [ ] Facebook Lead Ads.
- [ ] TikTok mensagens, comentários e formulários, conforme APIs disponíveis.
- [ ] Telegram.
- [ ] SMS por provedor.
- [ ] Telefonia/VoIP com chamada, duração, gravação e vínculo ao CRM.
- [ ] Live chat próprio para sites.
- [ ] Unificar histórico, identidade e permissões entre canais.
- [ ] Exibir saúde, limites e erros de cada conexão.

### 6.11 Email CRM

Estado: ⚠️ `Parcial` — a caixa IMAP funciona em produção (17 remetentes catalogados, senha cifrada em `integrations`, teste de conexão pela tela). O que falta é o CRM em volta dela: thread, vínculo ao lead, envio pela ficha.
Prioridade: `P1`

- [ ] Conectar Gmail e Outlook por OAuth.
- [ ] Conectar outros serviços por IMAP/SMTP com credenciais criptografadas.
- [ ] Distinguir caixas pessoais e compartilhadas.
- [ ] Sincronizar entrada e enviados de forma incremental.
- [ ] Agrupar emails por thread.
- [ ] Compor, responder, encaminhar, excluir e restaurar.
- [ ] Anexar arquivos com validação e armazenamento seguro.
- [ ] Criar assinaturas por usuário/caixa.
- [ ] Criar templates com variáveis de contato, empresa e lead.
- [ ] Vincular automaticamente email ao contato e aos leads correspondentes.
- [ ] Criar contato/lead a partir de remetente desconhecido.
- [ ] Configurar criação automática de lead.
- [ ] Enviar emails por automação e registrar entrega/falha.
- [ ] Implementar busca, pastas, filtros e não lidos.
- [ ] Aplicar permissão de acesso a caixas compartilhadas.
- [ ] Registrar todo email na timeline do CRM.

### 6.12 Chat e colaboração da equipe

Estado: 🧪 `Implementado, não comprovado em produção` — `team_channels` = 3 e `team_messages` = 0: os canais existem e ninguém nunca escreveu neles.
Prioridade: `P1`

- [ ] Chat privado entre usuários.
- [ ] Grupos de conversa com membros e administradores.
- [ ] Mensagens persistidas, edição e exclusão conforme política.
- [ ] Menções a usuários e equipes.
- [ ] Arquivos, imagens e links.
- [ ] Responder/citar mensagens.
- [ ] Indicadores de não lidas, presença e digitação.
- [ ] Busca no histórico.
- [ ] Vincular contato, empresa, lead, tarefa ou conversa do cliente.
- [ ] Escrever nota interna diretamente na ficha do CRM.
- [ ] Notificações configuráveis.
- [ ] Permissões e retenção de histórico.

### 6.13 Tarefas, calendário e agendamentos

Estado: 🧪 `Implementado, não comprovado em produção` — o commit `51dac13` trouxe schema e tela de tarefas; `tasks` = 0 em produção. Calendário e agendamento continuam ❌ `Ausente`.
Prioridade: `P0/P1`

- [ ] CRUD completo de tarefas.
- [ ] Tipos padrão e tipos personalizados de tarefa.
- [ ] Responsável, prazo, prioridade, comentário e status.
- [ ] Vincular tarefa a lead, contato, empresa e conversa.
- [ ] Concluir, reabrir, reagendar, reatribuir e excluir.
- [ ] Criar tarefas recorrentes.
- [ ] Criar tarefas em massa.
- [ ] Exibir tarefas vencidas, de hoje, amanhã e semana.
- [ ] Implementar visualizações quadro, lista, dia, semana e mês.
- [ ] Drag and drop para reagendar.
- [ ] Configurar jornada e horário de trabalho por usuário.
- [ ] Criar agendamentos com início, fim, participantes, local e videoconferência.
- [ ] Criar páginas públicas de agendamento e disponibilidade.
- [ ] Enviar confirmação, lembrete, cancelamento e reagendamento.
- [ ] Sincronizar Google Calendar em duas vias.
- [ ] Preparar integração com Outlook Calendar.
- [ ] Registrar histórico na ficha relacionada.
- [ ] Disparar notificações e automações de prazo.
- [ ] Medir atrasos e produtividade por usuário/equipe.

### 6.14 Automações e pipeline digital

Estado: 🧪 `Implementado, não comprovado em produção` — as tabelas `automation_rules`, `automation_runs` e `automation_settings` existem e estão todas em 0. Sem motor, sem execução.
Prioridade: `P1/P2`

- [ ] Modelar automação com gatilho, condições, ações e versão publicada.
- [ ] Criar editor visual por pipeline/etapa.
- [ ] Gatilhos por entrada/saída de etapa, mensagem, email, tag, campo, tarefa, formulário, data e webhook.
- [ ] Condições por canal, equipe, horário, campo, origem, status e comportamento.
- [ ] Ações para criar/concluir tarefa, mover lead, atribuir usuário/equipe, editar campo e tag.
- [ ] Ações para enviar mensagem, template WhatsApp, email e webhook.
- [ ] Ações para iniciar bot ou agente de IA.
- [ ] Suportar atrasos, horários comerciais e agendamentos.
- [ ] Suportar ramificações condicionais e espera por resposta.
- [ ] Criar modelos prontos por caso de uso.
- [ ] Testar automação com dados de exemplo antes de publicar.
- [ ] Manter rascunho, versão ativa, histórico e rollback.
- [ ] Executar ações em workers com fila, idempotência e retry.
- [ ] Exibir log por execução, duração, resultado e motivo de falha.
- [ ] Definir limites para evitar loops e abuso.

### 6.15 Bots conversacionais

Estado: ❌ `Ausente`
Prioridade: `P2`

- [ ] Construtor visual no-code com passos e ramificações.
- [ ] Mensagens de texto, mídia, templates, botões e listas.
- [ ] Captura e validação de respostas.
- [ ] Atualização de campos, tags, etapa e responsável.
- [ ] Criação de tarefa e agendamento.
- [ ] Chamada de webhook/API externa.
- [ ] Pausa, retomada, timeout e encerramento.
- [ ] Transferência para humano com contexto completo.
- [ ] Templates de bot e importação/exportação de fluxo.
- [ ] Modo de teste, versionamento e analytics por etapa.

### 6.16 Segmentos, campanhas e transmissões

Estado: ❌ `Ausente`
Prioridade: `P1/P2`

- [ ] Criar segmentos dinâmicos por condições combináveis.
- [ ] Filtrar por lead, contato, empresa, pipeline, etapa, origem, tag, valor, data e conversa.
- [ ] Atualizar a audiência automaticamente quando os dados mudarem.
- [ ] Salvar, duplicar, editar e excluir segmentos.
- [ ] Exibir estimativa e amostra da audiência.
- [ ] Criar campanhas em rascunho, agendadas, em execução, concluídas, canceladas e com falha.
- [ ] Selecionar segmento, canal, número e template.
- [ ] Enviar imediatamente ou agendar.
- [ ] Validar opt-in, opt-out, janela do canal e regras da Meta.
- [ ] Excluir destinatários sem canal válido ou sem consentimento.
- [ ] Controlar taxa de envio, lotes e limites do provedor.
- [ ] Pausar/cancelar quando permitido.
- [ ] Exibir enviados, entregues, lidos, respondidos, cliques, falhas e custo.
- [ ] Permitir marcar/taguear destinatários com falha.
- [ ] Impedir disparos duplicados por idempotência.
- [ ] Registrar aprovação, autoria e auditoria da campanha.
- [ ] Integrar segmentos a públicos de anúncios quando houver demanda.

### 6.17 Formulários web e captura de leads

Estado: ❌ `Ausente`
Prioridade: `P1/P2`

- [ ] Construtor de formulários com campos padrão e personalizados.
- [ ] Templates e personalização visual compatível com a marca.
- [ ] Validação, máscara, campos condicionais e página de sucesso.
- [ ] Consentimento LGPD e registro da origem/versão do consentimento.
- [ ] Proteção anti-spam, CAPTCHA e rate limit.
- [ ] Definir pipeline, etapa, tags, responsável e tarefa ao enviar.
- [ ] Deduplicar e atualizar contatos existentes conforme regra.
- [ ] Criar código de incorporação e link público.
- [ ] Suportar WordPress, GTM e instalação manual.
- [ ] Registrar UTM, referrer e dados de atribuição.
- [ ] Integrar eventos com analytics.
- [ ] Exibir submissões, conversão, falhas e exportação.
- [ ] Disponibilizar API/webhook de submissão.

### 6.18 Botão de chat e live chat para sites

Estado: ❌ `Ausente`
Prioridade: `P2`

- [ ] Criar widget multicanal com WhatsApp, Instagram, Messenger, Telegram e live chat.
- [ ] Personalizar marca, cores, ícone, posição, saudação e horários.
- [ ] Exibir prévia desktop/mobile.
- [ ] Gerar snippet seguro de instalação.
- [ ] Criar instalação por GTM e CMS prioritários.
- [ ] Manter histórico do live chat no CRM.
- [ ] Identificar visitante e unir sessões quando autorizado.
- [ ] Criar gatilhos por tempo na página, rolagem, URL e páginas visitadas.
- [ ] Reações: saudação, formulário, tarefa, webhook, tag, campo e roteamento.
- [ ] Aplicar consentimento, privacidade e bloqueio anti-spam.

### 6.19 Produtos, catálogos e mídia

Estado: ❌ `Ausente`
Prioridade: `P1/P2`

- [ ] CRUD de produtos e serviços.
- [ ] Campos de nome, SKU, descrição, preço, moeda, categoria e status.
- [ ] Campos personalizados e configuração de colunas.
- [ ] Importação e exportação de catálogo.
- [ ] Vincular produtos a leads com quantidade, desconto e valor total.
- [ ] Manter histórico de compras por contato/empresa.
- [ ] Sincronizar catálogo Meta/WhatsApp.
- [ ] Enviar produtos e catálogo na conversa e nas campanhas.
- [ ] Criar biblioteca de mídia com upload, busca, filtro, preview e download.
- [ ] Aplicar permissões, cotas e retenção por tenant.
- [ ] Usar object storage em vez de gravar binários no PostgreSQL.
- [ ] Verificar tipo, tamanho, malware e acesso temporário aos arquivos.

### 6.20 Analytics, metas e gestão

Estado: ❌ `Ausente`
Prioridade: `P1/P2`

- [ ] Dashboard com widgets configuráveis por usuário e equipe.
- [ ] Funil por etapa, entrada, saída, ganho, perda e conversão.
- [ ] Análise win/loss e motivos de perda.
- [ ] Tempo médio por etapa e gargalos.
- [ ] Receita, ticket médio, forecast e ciclo de venda.
- [ ] Leads por origem, campanha, canal e responsável.
- [ ] Produtividade: atividades, tarefas, mensagens e negócios.
- [ ] SLA: primeira resposta, espera atual, vencimentos e reincidência.
- [ ] Conversas sem responsável e backlog por fila.
- [ ] Desempenho por atendente, equipe, canal e número.
- [ ] Relatório de chamadas quando houver telefonia.
- [ ] Metas mensais, trimestrais e anuais por receita ou negócios.
- [ ] ROI por mídia, campanha, template e custo de mensagens.
- [ ] Analytics do WhatsApp: enviado, entregue, lido, respondido, erro, clique e custo.
- [ ] Analytics de campanhas e bots por etapa.
- [ ] Filtros por período, pipeline, etapa, usuário, equipe, canal e origem.
- [ ] Drill-down da métrica até os registros que a compõem.
- [ ] Exportação e relatórios agendados por email.
- [ ] Métricas quase em tempo real com definições documentadas.

### 6.21 IA, Copilot e fontes de conhecimento

Estado: ⚠️ `Parcial` — o **agente de IA funciona em produção**: `gpt-4.1-mini`, chave cifrada em `integrations`, 12 execuções sem erro (triagem 10, catalogação 1, redação 1), saída em JSON com esquema, e a pessoa aplica ou descarta. O que continua ❌ `Ausente` é o **RAG**: `knowledge_sources` = 0, sem fontes, sem embeddings, sem busca semântica. São coisas diferentes e a auditoria anterior tratava as duas como uma só.
Prioridade: `P2/P3`

- [ ] Criar fontes por texto, URL, site, PDF, DOC e DOCX.
- [ ] Processar, dividir, indexar, atualizar, pausar e excluir fontes.
- [ ] Exibir estado de processamento, idioma, uso e erros.
- [ ] Isolar embeddings e documentos por tenant.
- [ ] Implementar busca semântica com referências às fontes utilizadas.
- [ ] Gerar sugestões de resposta dentro da conversa.
- [ ] Resumir conversa, lead e histórico.
- [ ] Sugerir tarefas e próximos passos.
- [ ] Preencher campos do contato/lead com confirmação e auditoria.
- [ ] Permitir múltiplos agentes por finalidade, pipeline ou canal.
- [ ] Configurar persona, tom, idioma, tamanho e atraso de resposta.
- [ ] Configurar condições `quando` e ações `faça`.
- [ ] Qualificar leads, atualizar CRM, iniciar bot e transferir para humano.
- [ ] Respeitar horários, limites de mensagens e limites de crédito.
- [ ] Transcrever áudio e manter original, transcrição e resposta.
- [ ] Criar modo de teste com explicação de intenção, ação e fonte.
- [ ] Criar painel de respostas, handoff, tempo médio, falhas e custo.
- [ ] Permitir feedback humano e avaliação contínua de qualidade.
- [ ] Aplicar permissões, proteção contra prompt injection e filtros de dados sensíveis.
- [ ] Fazer o Copilot consultar o CRM conforme a permissão do usuário.
- [ ] Impedir que o Copilot execute alterações sem confirmação explícita.

### 6.22 Central de integrações e plataforma para desenvolvedores

Estado: ❌ `Ausente` — há somente catálogo visual, e o card da Twilio chega a mostrar "conectado" gravando em `localStorage`
Prioridade: `P2/P3`

- [ ] Criar catálogo real com busca, categorias, detalhes e estado instalado. *(02/10/2026: Central com estado real de WhatsApp, e-mail, Messageria, ERP e Google, filtro Canais/Integrações; sem segredo no `localStorage`.)*
- [ ] Criar framework padronizado de OAuth, credenciais, escopos e callbacks.
- [ ] Criptografar secrets por tenant e permitir rotação.
- [ ] Exibir saúde, última sincronização, limites e erros da integração.
- [ ] Criar logs de sincronização e reprocessamento.
- [ ] Implementar inicialmente Google Calendar, Gmail/Outlook, Google Sheets, Drive, Slack, Zapier, Make e n8n.
- [ ] Priorizar integrações brasileiras: Asaas, Pix/cobrança, RD Station e ERPs relevantes.
- [ ] Criar API pública versionada para contatos, empresas, leads, tarefas, conversas e eventos.
- [ ] Criar tokens de API com escopos, expiração, revogação e auditoria.
- [ ] Criar webhooks outbound configuráveis por evento.
- [ ] Assinar webhooks, aplicar retry, backoff, idempotência e dead-letter queue.
- [ ] Exibir entregas, respostas e falhas de webhooks.
- [ ] Criar documentação OpenAPI e exemplos de integração.
- [ ] Adicionar sandbox/ambiente de teste e limites por plano.
- [ ] Preparar marketplace de parceiros sem permitir código arbitrário no frontend.

### 6.23 Faturamento, planos e monetização

Estado: ❌ `Ausente` — a tela atual é mock
Prioridade: `P1`

- [ ] Definir planos, preços, limites e diferenciais comerciais do Agenda.
- [ ] Implementar trial e data de expiração.
- [ ] Cobrar por workspace, assento, canal ou combinação aprovada comercialmente.
- [ ] Gerenciar assentos ativos e convites pendentes.
- [ ] Medir contatos, leads, números, mensagens, mídia, automações e créditos de IA.
- [ ] Aplicar entitlement no backend, não apenas na interface.
- [ ] Criar checkout com cartão e Pix.
- [ ] Integrar provedor de cobrança e validar webhooks assinados.
- [ ] Implementar upgrade, downgrade, renovação, cancelamento e reativação.
- [ ] Implementar prorrata quando aplicável.
- [ ] Criar add-ons para números, armazenamento, API, IA e volume de mensagens.
- [ ] Exibir uso atual, limites, alertas e previsão de cobrança.
- [ ] Exibir histórico de pedidos, pagamentos e documentos fiscais/faturas.
- [ ] Implementar cobrança falha, período de tolerância e suspensão controlada.
- [ ] Restringir faturamento a administradores autorizados.
- [ ] Registrar alterações de plano e pagamento em auditoria.

### 6.24 Configurações do workspace, chat e notificações

Estado: ❌ `Ausente` — telas genéricas e dados fixos; `tenant_settings` = 0
Prioridade: `P1`

- [ ] Persistir nome, logo, idioma, fuso horário, moeda e formato regional.
- [ ] Configurar jornada de trabalho, feriados e SLA por canal/equipe.
- [ ] Configurar criação automática de lead por canal.
- [ ] Configurar regras de fechamento, reabertura, atribuição e distribuição de chats.
- [ ] Configurar tipos de tarefa e motivos de perda.
- [ ] Configurar campos, tags e layouts de ficha/lista.
- [ ] Configurar caixas de email, assinaturas e threading.
- [ ] Criar central de notificações persistida e em tempo real.
- [ ] Marcar notificações como lidas e navegar até o registro relacionado.
- [ ] Preferências por evento e canal: app, email, navegador e mobile.
- [ ] Resumos imediatos ou agrupados por horário.
- [ ] Horário silencioso e escalonamento de SLA.
- [ ] Notificar mensagens, menções, tarefas, erros, cobrança, leads e automações.
- [ ] Salvar todas as configurações com validação, feedback e auditoria.

### 6.25 Mobile, responsividade e acessibilidade

Estado: ⚠️ `Parcial`
Prioridade: `P1/P2`

- [x] Tornar sidebar, configurações, inbox, tabelas, calendário e pipeline responsivos. *(02/10/2026, ver [PLANO-MOBILE-E-CANAIS.md](PLANO-MOBILE-E-CANAIS.md).)*
- [x] Criar navegação mobile com acesso rápido a Inbox, Leads, Tarefas e Busca. *(barra inferior com Início, Conversas, Vendas, Contatos e Mais.)*
- [ ] Garantir que colunas não se sobreponham em larguras intermediárias.
- [ ] Criar tabelas adaptativas ou visualização em lista no celular.
- [ ] Tratar teclado virtual, áreas seguras e composer da conversa.
- [ ] Implementar PWA instalável.
- [ ] Implementar notificações push web.
- [ ] Permitir captura/upload de foto, áudio e documento no celular.
- [ ] Adicionar atalhos de teclado no desktop.
- [ ] Atender navegação por teclado, foco visível, labels e contraste WCAG.
- [ ] Testar Chrome, Edge, Safari, Firefox, Android e iOS.
- [x] Validar visualmente breakpoints reais com screenshots automatizadas. *(`scripts/telas/verificar.mjs`.)*

### 6.26 Auditoria, confiabilidade e operação

Estado: ⚠️ `Parcial`
Prioridade: `P0/P1`

- [ ] Criar tela de auditoria com filtros por usuário, entidade, evento e período.
- [ ] Registrar antes/depois de alterações sensíveis.
- [ ] Tornar eventos críticos imutáveis e definir retenção.
- [ ] Adicionar fila persistente para webhooks, mensagens, importações, campanhas, automações e relatórios.
- [ ] Implementar outbox transacional para não perder eventos após commits.
- [ ] Implementar retries com backoff e dead-letter queue.
- [ ] Criar jobs de reconciliação de canais e mensagens.
- [ ] Implementar locks/idempotência distribuída para múltiplas instâncias.
- [ ] Criar migrações versionadas e reversíveis em vez de depender apenas de `schema.sql` idempotente.
- [ ] Adicionar testes unitários, integração com PostgreSQL e contrato da Meta.
- [ ] Adicionar testes end-to-end das jornadas críticas.
- [ ] Adicionar testes de autorização e isolamento de tenant.
- [ ] Adicionar testes de carga para webhook, inbox, busca e campanhas.
- [ ] Criar métricas, dashboards técnicos, tracing e alertas.
- [ ] Padronizar logs estruturados sem secrets ou PII desnecessária.
- [ ] Monitorar fila, banco, latência, erros Meta, espaço e backups.
- [ ] Automatizar backup com retenção e cópia externa criptografada.
- [ ] Testar restore regularmente em ambiente isolado.
- [ ] Definir RPO, RTO, SLO, incidentes, rollback e comunicação de indisponibilidade.
- [ ] Criar ambiente de homologação separado de produção.

### 6.27 Segurança, privacidade e conformidade

Estado: ⚠️ `Parcial`
Prioridade: `P0/P1`

- [ ] Implementar proteção CSRF para rotas mutáveis baseadas em cookie.
- [ ] Definir Content Security Policy e revisar headers no app e proxy.
- [ ] Validar HSTS, TLS, cookies e origem confiável em produção.
- [ ] Substituir comparações simples de tokens administrativos por método resistente a timing.
- [ ] Remover o `SETUP_TOKEN` da experiência normal do navegador.
- [ ] Criar fluxo administrativo autenticado e autorizado para secrets Meta.
- [ ] Não guardar token administrativo em `sessionStorage`.
- [ ] Aplicar rate limit distribuído em login, OAuth, webhook, mensagens e exports.
- [ ] Validar URLs de callback contra allowlist para evitar redirecionamento indevido.
- [ ] Proteger contra enumeração de usuários e abuso de recuperação de senha.
- [ ] Adotar gestão e rotação de secrets com trilha de auditoria.
- [ ] Criptografar backups e mídia sensível.
- [ ] Criar política de retenção e descarte por tipo de dado.
- [ ] Implementar consentimento, finalidade e opt-out para LGPD.
- [ ] Atender solicitação de acesso, correção, portabilidade e exclusão do titular.
- [ ] Criar exportação de dados do tenant e do titular.
- [ ] Definir subprocessadores, termos, política de privacidade e resposta a incidentes.
- [ ] Executar revisão SAST, dependências, imagens Docker e teste de invasão antes de escala comercial.

### 6.28 Onboarding, ajuda e acabamento de produto

Estado: ⚠️ `Parcial`
Prioridade: `P1/P2`

- [ ] Transformar a home em painel real de implantação e operação.
- [x] Calcular checklist de onboarding com dados reais. *(02/10/2026: quatro itens no Início, concluídos pelo estado da conta.)*
- [ ] Guiar conexão de canal, convite da equipe, pipeline, importação e primeiro atendimento.
- [ ] Criar ajuda contextual sem bloquear a área de trabalho.
- [ ] Criar documentação para administrador e atendente.
- [ ] Implementar tour opcional e central de novidades.
- [ ] Criar estados vazios com ações que realmente funcionam.
- [ ] Padronizar feedback de sucesso, erro, confirmação e sessão expirada.
- [ ] Adicionar busca global por contatos, empresas, leads, conversas e tarefas.
- [ ] Implementar command palette e ações rápidas.
- [ ] Padronizar branding Agenda CRM em título, favicon, emails e telas OAuth.
- [ ] Medir adoção das jornadas sem coletar conteúdo sensível desnecessário.

## 7. Sequência recomendada de implementação
### Fase 0 - Fechar a comunicação (em curso, 04/09/2026)

Objetivo: o CRM receber e responder uma conversa real. Sem isso, nada acima importa.

1. ~~Terminar o deploy das duas telas da Messageria (seção 6.9-A).~~ Feito em 04/09/2026.
2. ~~Provar em produção que a origem aparece marcada e que dá para responder pela tela.~~ Feito: filtros e conversa conferidos com dado real.
3. ~~Aprovar um modelo em pt_BR na Meta.~~ Já estavam aprovados desde 01/09; o painel é que não sabia. Corrigido em 08/09.
4. **Resolver a forma de pagamento da WABA** (`141006`): é o que bloqueia o envio hoje, e só o dono da conta faz.
5. Ligar o CRM à Messageria por credencial, não por token da Meta (seção 6.9.2).
6. Atender ponta a ponta uma conversa iniciada por um desconhecido, e só então marcar a seção 6.9 como ✅.

### Fase 1 - CRM operacional confiável

Objetivo: uma empresa real consegue atender e vender diariamente.

1. Multi-tenant real e autorização por tenant.
2. Fila persistente de eventos vindos da Messageria.
3. CRUD de contatos, empresas e leads com fichas/timeline.
4. Pipeline editável e drag and drop.
5. Inbox em tempo real, não lidos, mídia e contexto do CRM.
6. Janela de 24 horas e modelos **espelhados da Messageria**, não reimplementados.
7. Tarefas e lembretes vinculados ao atendimento.
8. Permissões por equipe, pipeline e canal.
9. Testes end-to-end e observabilidade das jornadas críticas.

### Fase 2 - Produto vendável como SaaS

Objetivo: várias empresas conseguem entrar, configurar, pagar e operar sozinhas.

1. Cadastro/onboarding, convites e recuperação de senha.
2. Perfil, workspace, 2FA, sessões e notificações.
3. Planos, cobrança, assentos, uso e limites.
4. Importação/exportação e deduplicação.
5. Email CRM.
6. Calendário, agendamentos e Google Calendar.
7. Analytics de funil, equipe, canal e SLA.
8. Formulários web e captura de origem/UTM.
9. Responsividade e PWA.

### Fase 3 - Automação e crescimento

Objetivo: competir na eficiência comercial, não apenas no armazenamento de dados.

1. Motor e editor de automações.
2. Bots conversacionais.
3. Segmentos dinâmicos.
4. Campanhas e transmissões com métricas.
5. Instagram, Facebook e demais canais prioritários.
6. Produtos, catálogos e mídia.
7. Chat interno e colaboração.
8. APIs e webhooks para integrações externas.

### Fase 4 - IA e ecossistema

Objetivo: atingir a camada avançada da Kommo e criar diferenciação própria.

1. Fontes de conhecimento e busca semântica.
2. Sugestões, resumos e preenchimento assistido.
3. Agentes de IA com handoff, ações e limites.
4. Copilot com acesso controlado ao CRM.
5. Marketplace de integrações.
6. Analytics de IA, custos, qualidade e ROI.
7. Recursos enterprise: SSO, whitelist de IP, auditoria avançada e alta disponibilidade.

## 8. Critérios de paridade operacional

O Agenda pode ser considerado funcionalmente comparável no núcleo da Kommo quando uma empresa conseguir, sem intervenção manual no banco ou servidor:

1. Criar seu workspace e plano.
2. Convidar a equipe e configurar permissões.
3. Conectar canais e caixas de email.
4. Importar sua base sem duplicar registros.
5. Receber uma conversa e criar/vincular contato, empresa e lead.
6. Distribuir, atender, transferir, responder com mídia/template e acompanhar entrega.
7. Mover a negociação no pipeline e executar automações.
8. Criar tarefas, compromissos e lembretes.
9. Fazer campanhas para segmentos consentidos.
10. Consultar desempenho comercial, de atendimento, SLA e ROI.
11. Auditar quem alterou dados e recuperar falhas operacionais.
12. Gerenciar assinatura, limites, segurança e dados sem suporte técnico.

## 9. Diferenciais recomendados para o Agenda

Equiparar não deve tornar o Agenda apenas uma versão menor da Kommo. Os diferenciais mais coerentes com a estratégia atual são:

- múltiplos números WhatsApp por empresa com roteamento e permissões claras;
- painel de operação para gestores com fila, SLA e conversas esquecidas em primeiro plano;
- gestão brasileira de cobrança, Pix, LGPD e integrações locais;
- implantação guiada para pequenas empresas, com linguagem mais simples;
- automações prontas por segmento e acompanhadas por explicações de resultado;
- IA com confirmação humana para alterações sensíveis e rastreabilidade das fontes;
- timeline realmente unificada entre atendimento, venda, tarefas, pagamentos e suporte;
- preço e limites transparentes dentro do produto.

## 10. Fontes oficiais usadas na comparação

- [Visão geral da interface e módulos da Kommo](https://support.kommo.com/docs/kommo-interface)
- [Leads, contatos e empresas](https://support.kommo.com/docs/lead-profiles)
- [Uso e configuração do pipeline](https://support.kommo.com/docs/pipeline-usage)
- [Tarefas e calendário](https://support.kommo.com/docs/tasks-calendar-overview)
- [Inbox unificada](https://www.kommo.com/unified-inbox/)
- [Gestão de emails](https://support.kommo.com/docs/manage-emails-in-kommo)
- [WhatsApp Business](https://support.kommo.com/docs/whatsapp-business-overview)
- [Automações de pipeline](https://support.kommo.com/resources/docs/automate-pipeline-actions)
- [Segmentos](https://support.kommo.com/docs/segments)
- [Transmissões e campanhas](https://support.kommo.com/docs/set-up-and-customize-broadcasts-in-kommo)
- [Formulários web](https://support.kommo.com/docs/en/manage-webforms-in-kommo)
- [Botão de chat para sites](https://support.kommo.com/docs/create-and-install-a-website-chat-button)
- [Analytics e relatórios](https://support.kommo.com/docs/manage-stats-in-kommo)
- [Usuários, grupos e papéis](https://support.kommo.com/docs/manage-user-roles)
- [Permissões granulares](https://support.kommo.com/docs/set-permissions)
- [Importação e exportação](https://support.kommo.com/docs/en/import-data-into-kommo)
- [Fusão de duplicados](https://support.kommo.com/docs/find-and-merge-duplicates)
- [Catálogo de produtos](https://support.kommo.com/docs/add-products-to-your-product-catalog)
- [Agente de IA](https://support.kommo.com/docs/kommo-ai-agent)
- [Fontes de conhecimento de IA](https://support.kommo.com/docs/add-and-manage-ai-knowledge-sources)
- [Planos e faturamento](https://support.kommo.com/docs/upgrade-plan)
- [Plataforma para desenvolvedores](https://developers.kommo.com/docs/kommo-for-developers)

## 11. Evidências consideradas na auditoria

### Código (commit `7016eef`)

- [`backend/schema.sql`](../backend/schema.sql): entidades e limitações atuais do modelo.
- [`backend/server.ts`](../backend/server.ts): autenticação, Meta, inbox, contatos, leads e pipeline.
- [`src/pages/workspace/WorkspacePages.tsx`](../src/pages/workspace/WorkspacePages.tsx): módulos operacionais e estados ainda visuais.
- [`src/pages/settings/SettingsPages.tsx`](../src/pages/settings/SettingsPages.tsx): usuários, canais e configurações ainda simuladas.
- [`src/pages/settings/IntegrationCenterPage.tsx`](../src/pages/settings/IntegrationCenterPage.tsx): Central de Integrações; o card da Twilio grava em `localStorage` e mostra "conectado" para integração que não existe.
- [`src/lib/crm.ts`](../src/lib/crm.ts): integrações efetivas entre frontend e backend.
- [`docs/OPERACAO.md`](./OPERACAO.md): operação, deploy, backup e rollback atuais.
- [`docs/ARQUITETURA.md`](./ARQUITETURA.md): mapa levantado do código e do banco de produção.

### Banco de produção (`agenda_crm` em 178.105.82.48, 04/09/2026)

A contagem de linhas por tabela é a evidência que separa 🧪 de ✅. Reproduzir com:

```sh
docker exec agenda-crm-db psql -U agenda_crm -d agenda_crm \
  -c "select relname, n_live_tup from pg_stat_user_tables order by n_live_tup desc"
```

Resultado que fundamenta este documento: `contacts` 4.435 · `mail_senders` 17 · `ai_runs` 12 · `ai_suggestions` 10 · `events` 6 · `sessions` 6 · `pipeline_stages` 4 · `team_channels` 3 · `integrations` 2 · `channels` 1 · `newsletter_campaigns` 1 · `pipelines` 1 · `tenants` 1 · `users` 1. Em **zero**: `automation_rules`, `automation_runs`, `automation_settings`, `companies`, `conversations`, `external_references`, `inbound_events`, `knowledge_sources`, `leads`, `media_files`, `messages`, `newsletter_deliveries`, `newsletter_signups`, `products`, `segments`, `tasks`, `team_messages`, `tenant_settings`.

### Meta (Graph API, 04/09/2026)

- `GET /1670392484704840/subscriptions` → `{"data":[]}`: o app do CRM não recebe webhook.
- `GET /debug_token` com o `META_TOKEN` do `.env.production` → `code 190`, *the user logged out*.
- `GET /1055665857141232/subscribed_apps` → os apps "Ávila Ops" e "Messageria" no mesmo WABA.
- `GET /1370137702838905` → `+55 17 99105-3597`, `CONNECTED`, `VERIFIED`, `CLOUD_API`.
