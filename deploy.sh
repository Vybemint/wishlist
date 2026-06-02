#!/usr/bin/env bash
set -euo pipefail

cd "$(dirname "$0")"

if [ -f server/.env ]; then
  set -a
  source server/.env
  set +a
fi

export DOMAIN TRAEFIK_SERVICE_NAME IMAGE

envsubst < docker-compose.yml | docker stack deploy -c - wishlist
