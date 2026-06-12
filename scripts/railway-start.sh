#!/usr/bin/env sh
set -eu

echo "Applying Prisma migrations..."
npx prisma migrate deploy --schema=./prisma/schema.prisma

echo "Starting API..."
node dist/src/index.js
