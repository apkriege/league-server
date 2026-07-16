#!/bin/sh
set -eu

SCRIPT_DIR=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)
SERVER_DIR=$(CDPATH= cd -- "$SCRIPT_DIR/.." && pwd)
COMPOSE_FILE="$SERVER_DIR/docker-compose.test.yaml"
PROJECT_NAME="league-night-test"
TEST_DATABASE_PORT="${TEST_DATABASE_PORT:-55432}"

cleanup() {
  docker compose -p "$PROJECT_NAME" -f "$COMPOSE_FILE" down -v --remove-orphans >/dev/null 2>&1 || true
}

trap cleanup EXIT INT TERM
cleanup

export TEST_DATABASE_PORT
export DATABASE_URL="postgresql://postgres:postgres@127.0.0.1:${TEST_DATABASE_PORT}/league_night_test"
export NODE_ENV=test
export COOKIE_SECURE=false
export SESSION_SECRET="integration-test-session-secret-at-least-32-characters"
export CLIENT_URL="http://127.0.0.1:4173"
export CLIENT_URLS="http://127.0.0.1:4173"
export DEMO_SEED_PASSWORD="integration-test-password"
export LOG_LEVEL=error

docker compose -p "$PROJECT_NAME" -f "$COMPOSE_FILE" up -d --wait

cd "$SERVER_DIR"
npm run db:migrate:deploy
npm run seed:demo

"$@"
