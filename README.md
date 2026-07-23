# Agenda Contatos Web

Agenda web privada para gestão de contatos comerciais, construída com React, TypeScript, Vite e Tailwind/shadcn-style UI.

Responsável técnico: Nícolas Ávila  
Empresa: Ávila Ops Tecnologia  
Software privado.

## Funcionalidades

- Cadastro, edição e exclusão de contatos.
- Importação de contatos `.vcf` / vCard direto pelo navegador.
- Deduplicação por email e por telefone normalizado.
- Busca por nome, email, telefone, empresa e categoria.
- Ação rápida de email via `mailto:`.
- Ação rápida de WhatsApp via `wa.me`.
- Persistência web temporária em `localStorage`.
- Configuração base para integração WhatsApp OAuth2 com provedor de terceiros.

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
