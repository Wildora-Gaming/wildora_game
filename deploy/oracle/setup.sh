#!/usr/bin/env bash
# Prepara uma VM Ubuntu nova da Oracle para rodar o Wildora. Rode uma vez, como o usuário "ubuntu":
#
#   curl -fsSL https://raw.githubusercontent.com/Wildora-Gaming/wildora_game/main/deploy/oracle/setup.sh | bash
#
# O que faz (pode rodar de novo sem problema):
#   1. atualiza o sistema e liga as atualizações de segurança automáticas
#   2. cria 2 GB de swap (folga de memória)
#   3. libera as portas 80 e 443 no firewall interno da VM (a Oracle bloqueia por padrão)
#   4. instala o Docker
#   5. baixa o projeto em ~/wildora_game e cria deploy/oracle/.env para você preencher
#   6. agenda a atualização automática (a cada 5 minutos confere se há versão nova; só reinicia com
#      ninguém online ou depois de avisar no chat) e o backup diário do banco (01:17)
set -euo pipefail

REPO=https://github.com/Wildora-Gaming/wildora_game.git
DIR="$HOME/wildora_game"
say() { printf '\n\033[1;33m==> %s\033[0m\n' "$*"; }

say "1/6 Atualizando o sistema"
sudo apt-get update -qq
sudo DEBIAN_FRONTEND=noninteractive apt-get upgrade -y -qq
sudo DEBIAN_FRONTEND=noninteractive apt-get install -y -qq git curl unattended-upgrades iptables-persistent
sudo dpkg-reconfigure -f noninteractive unattended-upgrades

say "2/6 Swap de 2 GB"
if ! swapon --show | grep -q /swapfile; then
  sudo fallocate -l 2G /swapfile
  sudo chmod 600 /swapfile
  sudo mkswap /swapfile >/dev/null
  sudo swapon /swapfile
  grep -q '^/swapfile' /etc/fstab || echo '/swapfile none swap sw 0 0' | sudo tee -a /etc/fstab >/dev/null
fi

say "3/6 Firewall da VM: liberando 80 e 443"
for port in 80 443; do
  sudo iptables -C INPUT -p tcp --dport "$port" -m conntrack --ctstate NEW -j ACCEPT 2>/dev/null ||
    sudo iptables -I INPUT 1 -p tcp --dport "$port" -m conntrack --ctstate NEW -j ACCEPT
done
sudo netfilter-persistent save >/dev/null

say "4/6 Docker"
if ! command -v docker >/dev/null; then
  curl -fsSL https://get.docker.com | sudo sh
fi
sudo usermod -aG docker "$USER"
sudo systemctl enable --now docker >/dev/null

say "5/6 Projeto em $DIR"
if [ -d "$DIR/.git" ]; then
  git -C "$DIR" pull --ff-only --quiet
else
  git clone --quiet "$REPO" "$DIR"
fi
cd "$DIR/deploy/oracle"
chmod +x update.sh setup.sh backup.sh
if [ ! -f .env ]; then
  cp .env.example .env
fi
chmod 600 .env

say "6/6 Atualização automática (a cada 5 minutos) e backup diário (01:17)"
CRON="*/5 * * * * $DIR/deploy/oracle/update.sh >> $HOME/wildora-update.log 2>&1"
BACKUP="17 4 * * * $DIR/deploy/oracle/backup.sh >> $HOME/wildora-backup.log 2>&1"
( crontab -l 2>/dev/null | grep -v 'deploy/oracle/update.sh' | grep -v 'deploy/oracle/backup.sh' ; echo "$CRON" ; echo "$BACKUP" ) | crontab -

cat <<MSG

Pronto. Faltam 3 coisas (detalhes no plano):

  1. Preencha o .env:            nano $DIR/deploy/oracle/.env
  2. Certificado da Cloudflare:  $DIR/deploy/oracle/certs/origin.pem e origin.key
  3. Suba o jogo:                cd $DIR/deploy/oracle && sudo docker compose up -d

Para ver se está rodando:        sudo docker compose ps   e   sudo docker compose logs -f wildora
(Depois de sair e entrar de novo no SSH, dá para usar "docker" sem sudo.)
MSG
