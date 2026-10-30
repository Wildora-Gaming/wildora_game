#!/usr/bin/env bash
# Backup diário do progresso dos jogadores (tabelas do jogo no Postgres do Supabase).
# Guarda os últimos 7 dias em deploy/oracle/backups/ (o update.sh agenda no cron às 01:17).
#
# Rodar na mão:      ./backup.sh
# Restaurar um dia (pare o jogo antes):
#   docker compose stop wildora
#   gunzip -c backups/wildora-AAAA-MM-DD.sql.gz | docker run -i --rm postgres:17-alpine psql "$DATABASE_URL"
#   docker compose start wildora
# (o arquivo apaga e recria as tabelas do jogo; contas de login do Supabase não são tocadas)
set -euo pipefail

main() {
  cd "$(dirname "$0")"
  local url major tag file keep
  keep="${BACKUP_KEEP:-7}"
  url="$(grep -E '^DATABASE_URL=' .env 2>/dev/null | head -1 | cut -d= -f2- | sed -e 's/^"//' -e 's/"$//' -e "s/^'//" -e "s/'$//" || true)"
  if [ -z "$url" ]; then
    echo "[backup] sem DATABASE_URL no .env (modo arquivo?): nada a fazer"
    return
  fi
  mkdir -p backups
  # o pg_dump precisa ser da mesma versão do banco ou mais novo
  major="$(docker run --rm -e URL="$url" postgres:17-alpine sh -c 'psql "$URL" -tAc "show server_version_num"' 2>/dev/null | tr -dc '0-9' | cut -c1-2 || true)"
  tag=17
  if [ -n "$major" ] && [ "$major" -gt 17 ]; then tag="$major"; fi
  file="backups/wildora-$(date -u +%F).sql.gz"
  docker run --rm -e URL="$url" "postgres:${tag}-alpine" \
    sh -c 'pg_dump "$URL" --schema=public --no-owner --no-privileges --clean --if-exists' | gzip > "$file.tmp" || true
  # arquivo vazio = falhou; não substitui o backup bom
  if [ "$(gunzip -c "$file.tmp" | head -c 100 | wc -c)" -lt 50 ]; then
    rm -f "$file.tmp"
    echo "[backup] $(date -u +%FT%TZ) falhou: dump vazio"
    exit 1
  fi
  mv "$file.tmp" "$file"
  ls -1t backups/wildora-*.sql.gz | tail -n +"$((keep + 1))" | xargs -r rm -f
  echo "[backup] $(date -u +%FT%TZ) ok: $file ($(du -h "$file" | cut -f1))"
}

main "$@"
exit
