# Agenda Contatos Web

Frontend web privado para um CRM multi-tenant com WhatsApp, funil de vendas, inbox, automações e agenda como módulo auxiliar.

Responsável técnico: Nícolas Ávila  
Empresa: Ávila Ops Tecnologia  
Software privado.

## Funcionalidades

- Funil de vendas em kanban.
- Lista de leads.
- Inbox de WhatsApp com contexto de cliente, espera e status.
- Tarefas, chat em equipe, analytics, formulários, botão de chat e integrações.
- Agenda de contatos como item auxiliar do CRM.
- Base visual para integração WhatsApp OAuth2 e multi-tenant.

## Desenvolvimento web

```powershell
npm install
npm run dev
```

O Vite abrirá a aplicação em `http://localhost:5173` apenas para desenvolvimento.

## Validação

```powershell
npm run build
npm run lint
```

## Build web

```powershell
npm run build
```

Os arquivos estáticos ficam em `dist/` e podem ser publicados em qualquer hospedagem web.

## Próximo passo para multi-tenant

A persistência atual é local ao navegador. Para empresas, equipes, conversas do WhatsApp, SLA e auditoria, o próximo passo é adicionar backend web com autenticação, PostgreSQL, isolamento por `tenant_id`, webhook público da WhatsApp Business Platform e painel em tempo real.
