#!/usr/bin/env bash

set -euo pipefail

DOMAIN="truco.dougm.dev"
PORT="3099"
APP_DIR="${APP_DIR:-/opt/jogo-truco}"
LETSECRYPT_DIR="/etc/letsencrypt/live/${DOMAIN}"

fail() {
  printf 'ERRO: %s\n' "$1" >&2
  exit 1
}

if [ "$(id -u)" -ne 0 ]; then
  fail "execute este script como root no VPS"
fi

command -v nginx >/dev/null 2>&1 || fail "nginx nao encontrado"
[ -d "$APP_DIR" ] || fail "repositorio nao encontrado em $APP_DIR"

grep -Eq 'PORT=3099' "$APP_DIR/Dockerfile" || fail "Dockerfile nao esta configurado para a porta 3099"
grep -Eq '3099:3099' "$APP_DIR/compose.yaml" || fail "compose.yaml nao esta expondo a porta 3099"

nginx -t >/dev/null 2>&1 || fail "nginx -t falhou"

NGINX_CONFIG="$(nginx -T 2>/dev/null)"

printf '%s' "$NGINX_CONFIG" | grep -Eq "server_name[[:space:]].*${DOMAIN//./\\.}" || fail "nginx nao esta apontando para ${DOMAIN}"
printf '%s' "$NGINX_CONFIG" | grep -Eq "proxy_pass[[:space:]]+http://(127\\.0\\.0\\.1|localhost):${PORT}\b" || fail "nginx nao esta encaminhando para a porta ${PORT}"
printf '%s' "$NGINX_CONFIG" | grep -Eq "ssl_certificate[[:space:]]+${LETSECRYPT_DIR}/fullchain\\.pem" || fail "ssl_certificate nao aponta para o Lets Encrypt do dominio"
printf '%s' "$NGINX_CONFIG" | grep -Eq "ssl_certificate_key[[:space:]]+${LETSECRYPT_DIR}/privkey\\.pem" || fail "ssl_certificate_key nao aponta para o Lets Encrypt do dominio"

[ -f "${LETSECRYPT_DIR}/fullchain.pem" ] || fail "certificado fullchain.pem nao encontrado"
[ -f "${LETSECRYPT_DIR}/privkey.pem" ] || fail "certificado privkey.pem nao encontrado"

printf 'OK: nginx e certificado conferidos para %s na porta %s\n' "$DOMAIN" "$PORT"