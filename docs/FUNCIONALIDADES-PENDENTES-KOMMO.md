# Agenda CRM - Funcionalidades pendentes para paridade com a Kommo

Atualizado em: 11 de agosto de 2026
Base auditada: commit `dd7c981`
Escopo: frontend, backend, banco de dados, integrações, operação e segurança.

## 1. Objetivo

Este documento trokansforma a comparação com a Kommo em um backlog executável para o Agenda CRM.

Paridade funcional não significa copiar identidade visual, textos ou código da Kommo. Significa oferecer jornadas equivalentes, do início ao fim, com dados reais, persistência, permissões, auditoria, tratamento de falhas e experiência adequada para equipes comerciais.

Uma tela só deve ser considerada entregue quando:

- consome dados reais do backend;
- permite concluir a ação principal;
- aplica isolamento por empresa e permissões;
- registra alterações importantes em auditoria;
- possui estados de carregamento, vazio, sucesso e erro;
- funciona em desktop e mobile;
- possui testes proporcionais ao risco;
- está validada no ambiente publicado.

## 2. Legenda

| Marcador | Significado |
| --- | --- |
| `P0` | Fundação obrigatória para operar com clientes reais |
| `P1` | Paridade comercial essencial |
| `P2` | Automação, escala e gestão avançada |
| `P3` | Ecossistema, enterprise e diferenciação |
| `Parcial` | Há interface, schema ou endpoint, mas a jornada não está completa |
| `Ausente` | Não existe implementação funcional no produto atual |

## 3. O que já existe e não deve ser refeito

O Agenda já possui uma fundação válida:

- autenticação por email e senha com sessão persistida no PostgreSQL;
- cookie de sessão `HttpOnly`, `SameSite=Lax` e `Secure` em produção;
- usuários com papéis básicos `admin`, `gerente` e `atendente`;
- ativação e desativação de usuários;
- estrutura de tenant nas tabelas principais;
- criptografia AES-256-GCM para `app_secret` e `access_token` da Meta;
- OAuth da Meta e sincronização inicial de WABAs/números;
- validação `X-Hub-Signature-256` no webhook da Meta;
- idempotência básica de mensagens pelo identificador externo e chave de envio;
- recebimento de mensagens do WhatsApp no PostgreSQL;
- envio outbound de texto pela API oficial do WhatsApp;
- atualização dos estados `sent`, `delivered`, `read` e `failed` recebidos da Meta;
- inbox com busca e filtros processados no servidor;
- atribuição, arquivamento, espera, SLA fixo e criação de lead pela conversa;
- listagens reais de contatos e leads;
- leitura real do pipeline e suas etapas;
- registro inicial de eventos e `request_id`;
- Docker, PostgreSQL, healthcheck, scripts de backup/restore e manual operacional.

Esses recursos ainda precisam de evolução nos pontos indicados abaixo, mas não partem do zero.

## 4. Diagnóstico executivo

| Área | Situação atual | Principal lacuna |
| --- | --- | --- |
| Autenticação | Parcial | Recuperação, convites, 2FA, sessões e multi-tenant real |
| Usuários | Parcial | Grupos, permissões granulares, convite e offboarding |
| WhatsApp | Parcial | Mídia, templates, janela de 24h, campanhas e resiliência |
| Inbox | Parcial | Tempo real, não lidos, contexto completo e colaboração |
| Contatos | Parcial | CRUD, ficha, timeline, campos, tags, importação e deduplicação |
| Leads | Parcial | CRUD completo, ficha, vínculo, histórico e ações em massa |
| Pipeline | Parcial | Drag and drop, configuração, múltiplos funis e ganho/perda |
| Canais Meta | Parcial | Onboarding completo, permissões, saúde e renovação de token |
| Calendário e tarefas | Apenas visual/schema | Sem CRUD, agenda real, lembretes ou sincronização |
| Email | Apenas visual | Sem conexão, sincronização, envio ou vínculo ao CRM |
| Chat de equipe | Apenas visual | Sem mensagens, grupos, menções ou arquivos |
| Empresas | Apenas visual | Entidade e relacionamentos ainda não implementados |
| Segmentos | Apenas estado vazio | Sem motor de condições ou campanhas |
| Automações | Apenas estado vazio | Sem gatilhos, ações, executor ou histórico |
| Analytics | Ausente | Sem métricas comerciais, de equipe, canal, SLA ou ROI |
| Formulários e chat web | Ausente | Sem construtor, publicação ou captura de leads |
| Produtos e mídia | Apenas estado vazio | Sem catálogo, armazenamento ou vínculo a negócios |
| IA e Copilot | Apenas visual | Sem RAG, agentes, sugestões ou execução segura |
| Integrações | Catálogo visual | Botões não instalam nem sincronizam serviços |
| Faturamento | Mock visual | Sem planos, cobrança, limites ou entitlement |
| Perfil e workspace | Mock visual | Dados fixos e botão salvar sem persistência |

## 5. Backlog funcional completo

### 5.1 Multi-tenant e ciclo de vida da empresa

Status: `Parcial`
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

### 5.2 Conta, autenticação e segurança do usuário

Status: `Parcial`
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

### 5.3 Usuários, equipes e permissões

Status: `Parcial`
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

### 5.4 Contatos, empresas e base de clientes

Status: `Parcial`
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

### 5.5 Importação, exportação e migração de dados

Status: `Parcial`
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

### 5.6 Leads e ficha de negociação

Status: `Parcial`
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

### 5.7 Pipelines e funil de vendas

Status: `Parcial`
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

### 5.8 Inbox omnichannel

Status: `Parcial`
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

### 5.9 WhatsApp Business Platform

Status: `Parcial`
Prioridade: `P0/P1`

- [ ] Completar o onboarding oficial por Embedded Signup ou fluxo equivalente aprovado pela Meta.
- [ ] Assinar os webhooks necessários para cada WABA/telefone conectado.
- [ ] Registrar e verificar números quando o fluxo exigir PIN/código.
- [ ] Exibir status de registro, nome verificado, qualidade e capacidade de envio.
- [ ] Detectar token expirado, permissão removida e canal desconectado.
- [ ] Renovar ou substituir credenciais com aviso antecipado.
- [ ] Vincular cada número a equipes e regras de acesso.
- [ ] Definir roteamento e horário por número.
- [ ] Processar corretamente todos os tipos de mensagem inbound.
- [ ] Armazenar mídia em object storage com autorização temporária.
- [ ] Implementar templates: listar, criar, editar rascunho, enviar à Meta e acompanhar aprovação.
- [ ] Suportar variáveis, cabeçalho, rodapé, botões e idiomas em templates.
- [ ] Enviar mensagens de marketing, utilidade e autenticação conforme disponibilidade da Meta.
- [ ] Suportar listas, carrosséis, catálogos e WhatsApp Flows.
- [ ] Sincronizar catálogo da Meta e produtos.
- [ ] Suportar coexistência com o aplicativo WhatsApp Business quando disponível.
- [ ] Monitorar limites, qualidade, erros, cobrança e conversas por categoria.
- [ ] Criar reconciliação periódica para mensagens/status perdidos.
- [ ] Responder rapidamente ao webhook e processar payloads em fila persistente.
- [ ] Implementar retries, dead-letter queue e reprocessamento idempotente.
- [ ] Registrar payload bruto protegido, resultado e correlação sem vazar tokens ou dados desnecessários.

### 5.10 Outros canais de comunicação

Status: `Ausente`
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

### 5.11 Email CRM

Status: `Ausente`
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

### 5.12 Chat e colaboração da equipe

Status: `Ausente`
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

### 5.13 Tarefas, calendário e agendamentos

Status: `Parcial` no schema e `Ausente` na jornada
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

### 5.14 Automações e pipeline digital

Status: `Ausente`
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

### 5.15 Bots conversacionais

Status: `Ausente`
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

### 5.16 Segmentos, campanhas e transmissões

Status: `Ausente`
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

### 5.17 Formulários web e captura de leads

Status: `Ausente`
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

### 5.18 Botão de chat e live chat para sites

Status: `Ausente`
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

### 5.19 Produtos, catálogos e mídia

Status: `Ausente`
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

### 5.20 Analytics, metas e gestão

Status: `Ausente`
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

### 5.21 IA, Copilot e fontes de conhecimento

Status: `Ausente`; existe apenas a interface visual
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

### 5.22 Central de integrações e plataforma para desenvolvedores

Status: `Ausente`; há somente catálogo visual
Prioridade: `P2/P3`

- [ ] Criar catálogo real com busca, categorias, detalhes e estado instalado.
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

### 5.23 Faturamento, planos e monetização

Status: `Ausente`; tela atual é mock
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

### 5.24 Configurações do workspace, chat e notificações

Status: `Ausente`; telas genéricas e dados fixos
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

### 5.25 Mobile, responsividade e acessibilidade

Status: `Parcial`
Prioridade: `P1/P2`

- [ ] Tornar sidebar, configurações, inbox, tabelas, calendário e pipeline responsivos.
- [ ] Criar navegação mobile com acesso rápido a Inbox, Leads, Tarefas e Busca.
- [ ] Garantir que colunas não se sobreponham em larguras intermediárias.
- [ ] Criar tabelas adaptativas ou visualização em lista no celular.
- [ ] Tratar teclado virtual, áreas seguras e composer da conversa.
- [ ] Implementar PWA instalável.
- [ ] Implementar notificações push web.
- [ ] Permitir captura/upload de foto, áudio e documento no celular.
- [ ] Adicionar atalhos de teclado no desktop.
- [ ] Atender navegação por teclado, foco visível, labels e contraste WCAG.
- [ ] Testar Chrome, Edge, Safari, Firefox, Android e iOS.
- [ ] Validar visualmente breakpoints reais com screenshots automatizadas.

### 5.26 Auditoria, confiabilidade e operação

Status: `Parcial`
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

### 5.27 Segurança, privacidade e conformidade

Status: `Parcial`
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

### 5.28 Onboarding, ajuda e acabamento de produto

Status: `Parcial`
Prioridade: `P1/P2`

- [ ] Transformar a home em painel real de implantação e operação.
- [ ] Calcular checklist de onboarding com dados reais.
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

## 6. Sequência recomendada de implementação

### Fase 1 - CRM operacional confiável

Objetivo: uma empresa real consegue atender e vender diariamente.

1. Multi-tenant real e autorização por tenant.
2. Fila persistente de webhooks e mensagens.
3. CRUD de contatos, empresas e leads com fichas/timeline.
4. Pipeline editável e drag and drop.
5. Inbox em tempo real, não lidos, mídia e contexto do CRM.
6. Templates WhatsApp e controle da janela de 24 horas.
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

## 7. Critérios de paridade operacional

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

## 8. Diferenciais recomendados para o Agenda

Equiparar não deve tornar o Agenda apenas uma versão menor da Kommo. Os diferenciais mais coerentes com a estratégia atual são:

- múltiplos números WhatsApp por empresa com roteamento e permissões claras;
- painel de operação para gestores com fila, SLA e conversas esquecidas em primeiro plano;
- gestão brasileira de cobrança, Pix, LGPD e integrações locais;
- implantação guiada para pequenas empresas, com linguagem mais simples;
- automações prontas por segmento e acompanhadas por explicações de resultado;
- IA com confirmação humana para alterações sensíveis e rastreabilidade das fontes;
- timeline realmente unificada entre atendimento, venda, tarefas, pagamentos e suporte;
- preço e limites transparentes dentro do produto.

## 9. Fontes oficiais usadas na comparação

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

## 10. Evidências do Agenda consideradas na auditoria

- [`backend/schema.sql`](../backend/schema.sql): entidades e limitações atuais do modelo.
- [`backend/server.ts`](../backend/server.ts): autenticação, Meta, inbox, contatos, leads e pipeline.
- [`src/pages/workspace/WorkspacePages.tsx`](../src/pages/workspace/WorkspacePages.tsx): módulos operacionais e estados ainda visuais.
- [`src/pages/settings/SettingsPages.tsx`](../src/pages/settings/SettingsPages.tsx): usuários, canais e configurações ainda simuladas.
- [`src/lib/crm.ts`](../src/lib/crm.ts): integrações efetivas entre frontend e backend.
- [`docs/OPERACAO.md`](./OPERACAO.md): operação, deploy, backup e rollback atuais.
