#!/usr/bin/env bash
set -e

echo "=== Iniciando Deploy em Produção do Agenda CRM ==="

if [ ! -f .env.production.local ]; then
  echo "Criando .env.production.local a partir de .env.production.example..."
  cp .env.production.example .env.production.local
fi

echo "Executando build da stack Docker..."
docker compose --env-file .env.production.local -f docker-compose.production.yml up -d --build

echo "Aguardando inicialização do banco de dados PostgreSQL..."
sleep 5

echo "Executando migrações no banco de produção..."
docker compose --env-file .env.production.local -f docker-compose.production.yml exec app npm run db:migrate

echo "=== Deploy Concluído com Sucesso! ==="
echo "Status dos containers:"
docker compose --env-file .env.production.local -f docker-compose.production.yml ps
