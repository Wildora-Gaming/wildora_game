#!/usr/bin/env bash
# Atualiza o Wildora: código desta pasta (git) + imagem nova do jogo (ghcr.io).
# Só reinicia o jogo se a imagem mudou. O setup.sh agenda este script a cada 5 minutos.
set -euo pipefail
cd "$(dirname "$0")"
git -C ../.. pull --ff-only --quiet || echo "[update] git pull falhou (sem internet?), seguindo"
docker compose pull --quiet
docker compose up -d --remove-orphans
docker image prune -f >/dev/null
