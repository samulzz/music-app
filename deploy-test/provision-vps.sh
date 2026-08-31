#!/usr/bin/env bash
set -Eeuo pipefail

APP_DIR="/opt/nationmusics-test"
BARBERSHOP_ENV="/opt/barbershop-site/.env"
MYSQL_CONTAINER="barbershop-mysql-1"

if [[ ! -d "${APP_DIR}" || ! -f "${APP_DIR}/compose.yaml" ]]; then
  echo "Deploy do NationMusics nao encontrado em ${APP_DIR}" >&2
  exit 1
fi
if [[ ! -f "${BARBERSHOP_ENV}" ]]; then
  echo "Configuracao do MySQL compartilhado nao encontrada" >&2
  exit 1
fi

cd "${APP_DIR}"
umask 077

if [[ ! -f .env ]]; then
  database_password="$(openssl rand -hex 32)"
  jwt_secret="$(openssl rand -hex 48)"
  admin_password="$(openssl rand -hex 24)"
  cat > .env <<EOF
DATABASE_PASSWORD=${database_password}
API_SECURITY_KEY=CHANGE_ME
JWT_SECRET=${jwt_secret}
ADMIN_USERNAME=devsamuel
ADMIN_PASSWORD=${admin_password}
EOF
fi
chmod 600 .env

MYSQL_ROOT_PASSWORD="$(sed -n 's/^MYSQL_ROOT_PASSWORD=//p' "${BARBERSHOP_ENV}" | head -n 1 | tr -d '\r')"
DATABASE_PASSWORD="$(sed -n 's/^DATABASE_PASSWORD=//p' .env | head -n 1 | tr -d '\r')"

: "${MYSQL_ROOT_PASSWORD:?MYSQL_ROOT_PASSWORD ausente}"
: "${DATABASE_PASSWORD:?DATABASE_PASSWORD ausente}"

docker exec -e MYSQL_PWD="${MYSQL_ROOT_PASSWORD}" "${MYSQL_CONTAINER}" \
  mysql -uroot --batch --skip-column-names -e \
  "CREATE DATABASE IF NOT EXISTS nationmusics_test CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci;
   CREATE USER IF NOT EXISTS 'nationmusics_test'@'%' IDENTIFIED BY '${DATABASE_PASSWORD}';
   ALTER USER 'nationmusics_test'@'%' IDENTIFIED BY '${DATABASE_PASSWORD}';
   GRANT ALL PRIVILEGES ON nationmusics_test.* TO 'nationmusics_test'@'%';
   FLUSH PRIVILEGES;"

if [[ ! -f backup/.env ]]; then
  cat > backup/.env <<EOF
NATIONMUSICS_COMPOSE_DIR=/opt/nationmusics-test
NATIONMUSICS_MYSQL_CONTAINER=${MYSQL_CONTAINER}
NATIONMUSICS_MYSQL_DATABASE=nationmusics_test
NATIONMUSICS_MYSQL_USERNAME=nationmusics_test
NATIONMUSICS_MYSQL_PASSWORD=${DATABASE_PASSWORD}
NATIONMUSICS_DOWNLOADS_VOLUME=nationmusics-test-downloads
NATIONMUSICS_RCLONE_DEST=nationmusics-drive-crypt:
NATIONMUSICS_LOCAL_RETENTION_DAYS=7
EOF
fi
chmod 600 backup/.env

docker compose config --quiet
echo "Banco, usuario e configuracao do NationMusics preparados."
