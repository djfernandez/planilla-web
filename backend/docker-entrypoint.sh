#!/bin/sh
set -e
i=0
until npx prisma migrate deploy; do
  i=$((i + 1))
  if [ "$i" -gt 30 ]; then
    echo "No se pudo aplicar las migraciones."
    exit 1
  fi
  echo "Esperando PostgreSQL..."
  sleep 2
done
node prisma/seed.js
node dist/main.js
