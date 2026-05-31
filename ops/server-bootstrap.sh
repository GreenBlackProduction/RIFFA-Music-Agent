#!/usr/bin/env bash
# RIFFA Web — bootstrap скрипт для свежего Ubuntu 22.04/24.04 сервера.
# Запускать ОТ ROOT или через sudo:
#   curl -fsSL https://raw.githubusercontent.com/<репо>/main/ops/server-bootstrap.sh | sudo bash
# (если репо ещё нет — просто скопируй файл на сервер и запусти `sudo bash server-bootstrap.sh`)

set -euo pipefail

PROJECT_DIR=${PROJECT_DIR:-/opt/riffa}
DOMAIN=${DOMAIN:-}
EMAIL=${EMAIL:-}

log() { printf "\n\033[1;32m==>\033[0m %s\n" "$*"; }

require_root() {
  if [[ $EUID -ne 0 ]]; then
    echo "Запусти от root: sudo bash $0" >&2
    exit 1
  fi
}

install_base() {
  log "Обновляю систему и ставлю базовые пакеты"
  apt-get update -y
  apt-get install -y \
    ca-certificates curl gnupg ufw git unattended-upgrades \
    htop tmux jq nano build-essential
  systemctl enable --now unattended-upgrades
}

install_docker() {
  if command -v docker >/dev/null 2>&1; then
    log "Docker уже установлен"
    return
  fi
  log "Ставлю Docker и Docker Compose"
  install -m 0755 -d /etc/apt/keyrings
  curl -fsSL https://download.docker.com/linux/ubuntu/gpg \
    | gpg --dearmor -o /etc/apt/keyrings/docker.gpg
  chmod a+r /etc/apt/keyrings/docker.gpg
  . /etc/os-release
  echo "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.gpg] \
https://download.docker.com/linux/ubuntu ${VERSION_CODENAME} stable" \
    > /etc/apt/sources.list.d/docker.list
  apt-get update -y
  apt-get install -y docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin
  systemctl enable --now docker
}

setup_firewall() {
  log "Настраиваю UFW (открываю 22, 80, 443)"
  ufw --force reset >/dev/null
  ufw default deny incoming
  ufw default allow outgoing
  ufw allow 22/tcp comment "ssh"
  ufw allow 80/tcp comment "http"
  ufw allow 443/tcp comment "https"
  ufw --force enable
}

create_user() {
  if id riffa >/dev/null 2>&1; then
    log "Пользователь riffa уже существует"
  else
    log "Создаю пользователя riffa"
    useradd -m -s /bin/bash riffa
    usermod -aG docker riffa
  fi
}

prepare_project_dir() {
  log "Готовлю каталог проекта в ${PROJECT_DIR}"
  mkdir -p "${PROJECT_DIR}"/{repo,media,backups,letsencrypt}
  chown -R riffa:riffa "${PROJECT_DIR}"
}

install_certbot() {
  if [[ -z "${DOMAIN}" || -z "${EMAIL}" ]]; then
    log "DOMAIN/EMAIL не заданы — пропускаю выпуск SSL (можно сделать позже)"
    return
  fi
  log "Ставлю certbot и выпускаю сертификат для ${DOMAIN}"
  apt-get install -y certbot python3-certbot-nginx
  certbot certonly --standalone --non-interactive --agree-tos \
    -m "${EMAIL}" -d "${DOMAIN}" -d "www.${DOMAIN}" || true
}

print_next_steps() {
  cat <<MSG

=========================================================================
Готово. Что дальше:

1) Положи код проекта в ${PROJECT_DIR}/repo. Варианты:
   а) git clone https://github.com/<твой-аккаунт>/riffa-web.git ${PROJECT_DIR}/repo
   б) или scp архив со своего компьютера:
      scp riffa-web-skeleton.tar.gz riffa@<ip>:${PROJECT_DIR}/
      ssh riffa@<ip> "cd ${PROJECT_DIR} && tar xzf riffa-web-skeleton.tar.gz -C repo --strip-components=1"

2) Заполни ${PROJECT_DIR}/repo/backend/.env (скопируй из .env.example и подставь ключи).

3) Запусти стек:
   cd ${PROJECT_DIR}/repo/ops
   docker compose up -d --build

4) Проверь:
   curl http://localhost:8000/api/v1/health
   curl http://localhost:5173/

5) Когда будет домен — натрави nginx и certbot, а frontend перенаправь на твой домен.

=========================================================================
MSG
}

main() {
  require_root
  install_base
  install_docker
  setup_firewall
  create_user
  prepare_project_dir
  install_certbot
  print_next_steps
}

main "$@"
