#!/usr/bin/env bash

set -euo pipefail

if [ "$(id -u)" -eq 0 ]; then
  SUDO=""
else
  command -v sudo >/dev/null 2>&1 || { printf 'ERRO: execute este script como root ou instale sudo\n' >&2; exit 1; }
  SUDO="sudo"
fi

install_docker_tools() {
  if command -v docker >/dev/null 2>&1 && { $SUDO docker compose version >/dev/null 2>&1 || command -v docker-compose >/dev/null 2>&1; }; then
    return
  fi

  command -v apt-get >/dev/null 2>&1 || { printf 'ERRO: Docker Compose ausente e apt-get nao encontrado para instalar automaticamente\n' >&2; exit 1; }
  $SUDO apt-get update

  if ! command -v docker >/dev/null 2>&1; then
    $SUDO env DEBIAN_FRONTEND=noninteractive apt-get install -y docker.io
  fi

  if ! $SUDO docker compose version >/dev/null 2>&1 && ! command -v docker-compose >/dev/null 2>&1; then
    $SUDO env DEBIAN_FRONTEND=noninteractive apt-get install -y docker-compose-plugin \
      || $SUDO env DEBIAN_FRONTEND=noninteractive apt-get install -y docker-compose-v2 \
      || $SUDO env DEBIAN_FRONTEND=noninteractive apt-get install -y docker-compose
  fi
}

start_docker() {
  if command -v systemctl >/dev/null 2>&1; then
    $SUDO systemctl enable --now docker >/dev/null 2>&1 || true
  elif command -v service >/dev/null 2>&1; then
    $SUDO service docker start >/dev/null 2>&1 || true
  fi
}

compose_up() {
  if $SUDO docker compose version >/dev/null 2>&1; then
    $SUDO docker compose -f compose.yaml up -d --build
  elif command -v docker-compose >/dev/null 2>&1; then
    $SUDO docker-compose -f compose.yaml up -d --build
  else
    printf 'ERRO: Docker Compose nao esta disponivel apos tentativa de instalacao\n' >&2
    exit 1
  fi
}

install_docker_tools
start_docker
compose_up