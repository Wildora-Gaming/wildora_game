#!/usr/bin/env bash
# Atualiza o Wildora: código desta pasta (git) + imagem nova do jogo (ghcr.io).
# O setup.sh agenda este script a cada 5 minutos (cron).
#
# Para não derrubar quem está jogando:
#   - com imagem nova e ninguém online: reinicia na hora;
#   - com gente online: espera; se a espera passar de UPDATE_MAX_WAIT (padrão 2 h), avisa no
#     chat que o servidor vai reiniciar em 5 minutos e reinicia na rodada seguinte do cron.
# Também garante o backup diário do banco (backup.sh) no cron.
set -euo pipefail

# Tudo dentro de main: o "git pull" pode trocar este arquivo enquanto ele roda.
main() {
  cd "$(dirname "$0")"
  local here max_wait now
  here="$(pwd)"
  max_wait="${UPDATE_MAX_WAIT:-7200}"
  now="$(date +%s)"

  git -C ../.. pull --ff-only --quiet || echo "[update] git pull falhou (sem internet?), seguindo"
  chmod +x update.sh backup.sh 2>/dev/null || true

  # backup diário às 01:17 (horário de Brasília = 04:17 UTC)
  if ! crontab -l 2>/dev/null | grep -q 'deploy/oracle/backup.sh'; then
    ( crontab -l 2>/dev/null ; echo "17 4 * * * $here/backup.sh >> $HOME/wildora-backup.log 2>&1" ) | crontab -
    echo "[update] backup diário agendado"
  fi

  docker compose pull --quiet
  # serviços que não estão rodando (ex.: depois de reiniciar a VM) sobem sem mexer no jogo
  docker compose up -d --no-recreate --remove-orphans >/dev/null 2>&1 || true

  local image container running latest
  image="$(awk '/image: ghcr/ {print $2; exit}' docker-compose.yml)"
  container="$(docker compose ps -q wildora 2>/dev/null || true)"
  running="$(docker inspect --format '{{.Image}}' "$container" 2>/dev/null || echo nenhum)"
  latest="$(docker image inspect --format '{{.Id}}' "$image" 2>/dev/null || echo desconhecida)"

  if [ "$running" = "$latest" ]; then
    rm -f .update_pending .update_announced
    docker compose up -d --remove-orphans >/dev/null # aplica mudanças do docker-compose/Caddy, se houver
    return
  fi

  # imagem nova esperando
  [ -f .update_pending ] || echo "$now" > .update_pending
  local since online
  since=$(( now - $(cat .update_pending) ))
  online="$(docker compose exec -T wildora node -e "fetch('http://127.0.0.1:2567/internal/status').then(r=>r.json()).then(j=>console.log(j.online)).catch(()=>console.log(0))" 2>/dev/null | tr -dc '0-9' || true)"
  online="${online:-0}"

  if [ "$online" = "0" ]; then
    echo "[update] $(date -u +%FT%TZ) versão nova e ninguém online: reiniciando"
    restart
  elif [ -f .update_announced ]; then
    if (( now - $(cat .update_announced) >= 280 )); then
      echo "[update] $(date -u +%FT%TZ) aviso dado há 5 min ($online online): reiniciando"
      restart
    fi
  elif (( since >= max_wait )); then
    echo "[update] $(date -u +%FT%TZ) versão nova esperando há $((since / 60)) min ($online online): avisando no chat"
    docker compose exec -T wildora node -e "fetch('http://127.0.0.1:2567/internal/announce-restart/5').catch(()=>{})" >/dev/null 2>&1 || true
    echo "$now" > .update_announced
  else
    echo "[update] $(date -u +%FT%TZ) versão nova esperando: $online online (há $((since / 60)) min)"
  fi
}

restart() {
  docker compose up -d --remove-orphans
  rm -f .update_pending .update_announced
  docker image prune -f >/dev/null
}

main "$@"
exit
