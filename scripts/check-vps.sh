#!/usr/bin/env bash

set -euo pipefail

DOMAIN="truco.dougm.dev"
PORT="3099"
APP_DIR="${APP_DIR:-/opt/jogo-truco}"
LETSECRYPT_DIR="/etc/letsencrypt/live/${DOMAIN}"
NGINX_SITE="/etc/nginx/sites-available/${DOMAIN}"
NGINX_SITE_ENABLED="/etc/nginx/sites-enabled/${DOMAIN}"

fail() {
  printf 'ERRO: %s\n' "$1" >&2
  exit 1
}

if [ "$(id -u)" -eq 0 ]; then
  SUDO=""
else
  command -v sudo >/dev/null 2>&1 || fail "execute este script como root ou instale sudo"
  SUDO="sudo"
fi

[ -d "$APP_DIR" ] || fail "repositorio nao encontrado em $APP_DIR"

grep -Eq 'PORT=3099' "$APP_DIR/Dockerfile" || fail "Dockerfile nao esta configurado para a porta 3099"
grep -Eq '3099:3099' "$APP_DIR/compose.yaml" || fail "compose.yaml nao esta expondo a porta 3099"

install_nginx_tools() {
  if command -v nginx >/dev/null 2>&1 && command -v certbot >/dev/null 2>&1; then
    return
  fi

  command -v apt-get >/dev/null 2>&1 || fail "nginx/certbot ausentes e apt-get nao encontrado para instalar automaticamente"
  $SUDO apt-get update
  $SUDO env DEBIAN_FRONTEND=noninteractive apt-get install -y nginx certbot python3-certbot-nginx
}

write_http_nginx_config() {
  $SUDO mkdir -p /etc/nginx/sites-available /etc/nginx/sites-enabled /var/www/html
  $SUDO tee "$NGINX_SITE" >/dev/null <<EOF
server {
  listen 80;
  listen [::]:80;
  server_name ${DOMAIN};

  location /.well-known/acme-challenge/ {
    root /var/www/html;
  }

  location / {
    proxy_pass http://127.0.0.1:${PORT};
    proxy_http_version 1.1;
    proxy_set_header Upgrade \$http_upgrade;
    proxy_set_header Connection "upgrade";
    proxy_set_header Host \$host;
    proxy_set_header X-Real-IP \$remote_addr;
    proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
    proxy_set_header X-Forwarded-Proto \$scheme;
  }
}
EOF
  $SUDO ln -sf "$NGINX_SITE" "$NGINX_SITE_ENABLED"
  $SUDO rm -f /etc/nginx/sites-enabled/default
}

write_https_nginx_config() {
  local ssl_options=""
  local ssl_dhparam=""

  if [ -f /etc/letsencrypt/options-ssl-nginx.conf ]; then
    ssl_options="include /etc/letsencrypt/options-ssl-nginx.conf;"
  fi

  if [ -f /etc/letsencrypt/ssl-dhparams.pem ]; then
    ssl_dhparam="ssl_dhparam /etc/letsencrypt/ssl-dhparams.pem;"
  fi

  $SUDO tee "$NGINX_SITE" >/dev/null <<EOF
server {
  listen 80;
  listen [::]:80;
  server_name ${DOMAIN};

  location /.well-known/acme-challenge/ {
    root /var/www/html;
  }

  location / {
    return 301 https://\$host\$request_uri;
  }
}

server {
  listen 443 ssl http2;
  listen [::]:443 ssl http2;
  server_name ${DOMAIN};

  ssl_certificate ${LETSECRYPT_DIR}/fullchain.pem;
  ssl_certificate_key ${LETSECRYPT_DIR}/privkey.pem;
  ${ssl_options}
  ${ssl_dhparam}

  location / {
    proxy_pass http://127.0.0.1:${PORT};
    proxy_http_version 1.1;
    proxy_set_header Upgrade \$http_upgrade;
    proxy_set_header Connection "upgrade";
    proxy_set_header Host \$host;
    proxy_set_header X-Real-IP \$remote_addr;
    proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
    proxy_set_header X-Forwarded-Proto https;
  }
}
EOF
  $SUDO ln -sf "$NGINX_SITE" "$NGINX_SITE_ENABLED"
  $SUDO rm -f /etc/nginx/sites-enabled/default
}

reload_nginx() {
  $SUDO nginx -t >/dev/null 2>&1 || fail "nginx -t falhou"

  if command -v systemctl >/dev/null 2>&1; then
    $SUDO systemctl enable --now nginx >/dev/null 2>&1 || true
    $SUDO systemctl reload nginx >/dev/null 2>&1 || $SUDO systemctl restart nginx >/dev/null 2>&1 || fail "nao foi possivel recarregar o nginx"
  else
    $SUDO service nginx reload >/dev/null 2>&1 || $SUDO service nginx restart >/dev/null 2>&1 || fail "nao foi possivel recarregar o nginx"
  fi
}

ensure_certificate() {
  if [ -f "${LETSECRYPT_DIR}/fullchain.pem" ] && [ -f "${LETSECRYPT_DIR}/privkey.pem" ]; then
    return
  fi

  local certbot_args=(--nginx -d "$DOMAIN" --non-interactive --agree-tos --redirect)
  if [ -n "${LETSENCRYPT_EMAIL:-}" ]; then
    certbot_args+=(-m "$LETSENCRYPT_EMAIL")
  else
    certbot_args+=(--register-unsafely-without-email)
  fi

  $SUDO certbot "${certbot_args[@]}" || fail "certbot nao conseguiu emitir certificado para ${DOMAIN}; confira DNS apontando para este VPS e portas 80/443 liberadas"
}

install_nginx_tools
write_http_nginx_config
reload_nginx
ensure_certificate
write_https_nginx_config
reload_nginx

NGINX_CONFIG="$($SUDO nginx -T 2>/dev/null)"

printf '%s' "$NGINX_CONFIG" | grep -Eq "server_name[[:space:]].*${DOMAIN//./\\.}" || fail "nginx nao esta apontando para ${DOMAIN}"
printf '%s' "$NGINX_CONFIG" | grep -Eq "proxy_pass[[:space:]]+http://(127\\.0\\.0\\.1|localhost):${PORT}\b" || fail "nginx nao esta encaminhando para a porta ${PORT}"
printf '%s' "$NGINX_CONFIG" | grep -Eq "ssl_certificate[[:space:]]+${LETSECRYPT_DIR}/fullchain\\.pem" || fail "ssl_certificate nao aponta para o Lets Encrypt do dominio"
printf '%s' "$NGINX_CONFIG" | grep -Eq "ssl_certificate_key[[:space:]]+${LETSECRYPT_DIR}/privkey\\.pem" || fail "ssl_certificate_key nao aponta para o Lets Encrypt do dominio"

[ -f "${LETSECRYPT_DIR}/fullchain.pem" ] || fail "certificado fullchain.pem nao encontrado"
[ -f "${LETSECRYPT_DIR}/privkey.pem" ] || fail "certificado privkey.pem nao encontrado"

printf 'OK: nginx e certificado conferidos para %s na porta %s\n' "$DOMAIN" "$PORT"