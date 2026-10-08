# Avila Ops Product Rules

<!-- avilaops:contexto:inicio (versão 2026-10-03; gerado a partir de avilaops/contexto, não editar aqui) -->
## Contexto Ávila Ops (vale para todos os projetos)

Este repositório pertence à Ávila Ops Tecnologia, que ajuda pequenas empresas a construir presença digital, organizar a operação e crescer. As contas `avilaops` e `avilainc` no GitHub são a mesma empresa. Nicolas Avila (Nicolas sem acento) é o fundador e quem decide.

### Como trabalhar

- Comunicar em português natural, com resposta direta e evidência. Sem tom de coach, promessa vaga ou jargão comercial. O idioma da interface e do conteúdo acompanha o site, não a conversa.
- Identificar o projeto, o domínio, o repositório e o ambiente antes de alterar qualquer coisa. Não presumir que todos os projetos usam o mesmo deploy.
- Ter iniciativa dentro do pedido e levar a tarefa até um resultado verificado. Plano, código, publicação e funcionamento comprovado são coisas diferentes: não declarar sucesso só porque um build terminou ou um workflow foi ativado.
- Proteger dados, acessos e a separação entre clientes. Nunca gravar segredo em arquivo versionado, issue, PR ou memória.
- Não iniciar comunicação externa nem ação irreversível sem autorização do Nicolas.
- Preservar trabalho em andamento de outra pessoa ou de outro agente. Trabalho não commitado vai para uma branch `resgate/*`.

### Decisões vigentes

- Pagamentos: Mercado Pago no Brasil e PayPal para clientes de fora. Não usar Stripe nem Éfi, mesmo que material antigo diga o contrário.
- Automações em n8n, infraestrutura em Cloudflare e canais em Twilio, preservando integrações existentes.
- Ofertas com três planos: entrada limitada, intermediário como escolha principal e premium como referência. Consultar preços vigentes antes de publicar.
- Build de aplicação roda no GitHub Actions, não no servidor de produção.
- Versão antiga de código fica no GitHub. Não criar `.tgz`, `.tar`, `*-before-*` nem pastas `rollback/`, `releases/` ou `backups/` com código no servidor; voltar versão é republicar o commit. Antes de mexer em dado, fazer dump do banco.

### Sessões na nuvem

- Uma sessão de nuvem não tem acesso à máquina do Nicolas, aos servidores nem à memória compartilhada. Não presumir o estado de produção: buscar evidência ou dizer que não foi verificado.
- Decisão durável tomada na sessão deve ficar registrada na descrição do PR e, quando for do projeto, neste arquivo, fora deste bloco.
- A memória compartilhada completa e as regras corporativas ficam no repositório privado `avilaops/contexto`.
<!-- avilaops:contexto:fim -->

Estas regras valem para este projeto e para produtos da Avila Ops, especialmente `avilaops.com` e `cliente.avilaops.com`.

## Regra Principal

O produto deve combinar segurança, criatividade, inovação e valor comercial.

Segurança é requisito básico, mas não deve limitar a exploração de ideias. Ao criar ou modificar funcionalidades:

- compreender o objetivo comercial;
- propor experiências melhores que o padrão do mercado;
- questionar soluções genéricas;
- sugerir automações, integrações e diferenciais;
- considerar receita recorrente e escalabilidade;
- manter visual clean, tecnológico e com autoridade;
- evitar excesso de cartões, interfaces genéricas e textos burocráticos;
- utilizar TypeScript e variáveis de ambiente;
- preservar integrações existentes ou explicar claramente quando uma mudança estrutural trouxer benefícios.

## Conta da Meta (decisão de 08/10/2026)

A conexão do cliente com a Meta mora no `auth.avilaops.com`; o CRM só lê, por
`backend/auth-meta.ts`. Não recriar OAuth da Meta aqui, nem pedir App ID, App
Secret ou token em tela.

- O vínculo usa o e-mail do cookie `avila_sso` conferido, nunca `users.email`
  sozinho: esse campo o administrador da empresa edita.
- O upsert em `integrations` não toca `app_id` nem `app_secret`: o webhook
  direto de quem ainda o usa depende deles.
- Canal com `metadata.origem = 'auth'` envia e não recebe. Ele não fecha o item
  "Conectar o WhatsApp" nem aparece como conectado.
- Só "não conectou" (404) e "venceu" (409) do auth apagam o token guardado. Erro
  de rede ou 5xx deixam como está.

## Visão Do Portal

O portal `cliente.avilaops.com` deve evoluir para um sistema operacional digital para pequenas empresas: o cliente entra, informa o que deseja construir e a plataforma organiza domínio, site, e-mail, identidade, redes sociais, pagamentos, automações e suporte em uma jornada única.

## Regras Disponíveis

- `#Rules/inovar-produto`
- `#Rules/criar-experiencia-premium`
- `#Rules/pensar-como-startup`
- `#Rules/reinventar-tela`
- `#Rules/descobrir-oportunidades`

As descrições completas ficam em:

```text
C:\Users\nicol\.codex\rules\avila-produto.rules.md
```
