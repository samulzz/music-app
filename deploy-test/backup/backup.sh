#!/usr/bin/env bash
set -Eeuo pipefail

SCRIPT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
ENV_FILE="${NATIONMUSICS_BACKUP_ENV:-${SCRIPT_DIR}/.env}"

if [[ ! -f "${ENV_FILE}" ]]; then
  echo "Arquivo de configuracao ausente: ${ENV_FILE}" >&2
  exit 1
fi

set -a
# shellcheck disable=SC1090
source "${ENV_FILE}"
set +a

: "${NATIONMUSICS_COMPOSE_DIR:?configure NATIONMUSICS_COMPOSE_DIR}"
: "${NATIONMUSICS_MYSQL_CONTAINER:?configure NATIONMUSICS_MYSQL_CONTAINER}"
: "${NATIONMUSICS_MYSQL_DATABASE:?configure NATIONMUSICS_MYSQL_DATABASE}"
: "${NATIONMUSICS_MYSQL_USERNAME:?configure NATIONMUSICS_MYSQL_USERNAME}"
: "${NATIONMUSICS_MYSQL_PASSWORD:?configure NATIONMUSICS_MYSQL_PASSWORD}"
: "${NATIONMUSICS_DOWNLOADS_VOLUME:?configure NATIONMUSICS_DOWNLOADS_VOLUME}"
: "${NATIONMUSICS_RCLONE_DEST:?configure NATIONMUSICS_RCLONE_DEST}"

BACKUP_DIR="${NATIONMUSICS_BACKUP_DIR:-/var/backups/nationmusics}"
RETENTION_DAYS="${NATIONMUSICS_LOCAL_RETENTION_DAYS:-7}"
STAMP="$(date -u +%Y%m%dT%H%M%SZ)"
SNAPSHOT_DIR="${BACKUP_DIR}/${STAMP}"
REMOTE_ROOT="${NATIONMUSICS_RCLONE_DEST%/}/nationmusics"

case "${BACKUP_DIR}" in
  /var/backups/nationmusics|/var/backups/nationmusics/*) ;;
  *)
    echo "Diretorio de backup recusado por seguranca: ${BACKUP_DIR}" >&2
    exit 1
    ;;
esac

mkdir -p "${SNAPSHOT_DIR}/config"
chmod 700 "${BACKUP_DIR}" "${SNAPSHOT_DIR}"

echo "[$(date --iso-8601=seconds)] Gerando dump do MySQL"
docker exec \
  -e MYSQL_PWD="${NATIONMUSICS_MYSQL_PASSWORD}" \
  "${NATIONMUSICS_MYSQL_CONTAINER}" \
  mysqldump --single-transaction --quick --routines --events --no-tablespaces \
  -u "${NATIONMUSICS_MYSQL_USERNAME}" "${NATIONMUSICS_MYSQL_DATABASE}" \
  | gzip -9 > "${SNAPSHOT_DIR}/database.sql.gz"

for config_file in compose.yaml nationmusics-test.nginx update.json; do
  if [[ -f "${NATIONMUSICS_COMPOSE_DIR}/${config_file}" ]]; then
    cp -a "${NATIONMUSICS_COMPOSE_DIR}/${config_file}" "${SNAPSHOT_DIR}/config/"
  fi
done

docker inspect "${NATIONMUSICS_MYSQL_CONTAINER}" > "${SNAPSHOT_DIR}/mysql-container-inspect.json"
docker volume inspect "${NATIONMUSICS_DOWNLOADS_VOLUME}" > "${SNAPSHOT_DIR}/downloads-volume-inspect.json"

echo "[$(date --iso-8601=seconds)] Enviando banco e configuracao"
rclone copy "${SNAPSHOT_DIR}" "${REMOTE_ROOT}/snapshots/${STAMP}" \
  --create-empty-src-dirs --checkers 4 --transfers 2

AUDIO_PATH="$(docker volume inspect -f '{{ .Mountpoint }}' "${NATIONMUSICS_DOWNLOADS_VOLUME}")"
if [[ -d "${AUDIO_PATH}" ]]; then
  echo "[$(date --iso-8601=seconds)] Copiando apenas audios novos ou alterados"
  rclone copy "${AUDIO_PATH}" "${REMOTE_ROOT}/audio" \
    --checkers 8 --transfers 3 --ignore-existing --exclude '/.cache/**'
else
  echo "Volume de audio nao encontrado em ${AUDIO_PATH}" >&2
  exit 1
fi

find "${BACKUP_DIR}" -mindepth 1 -maxdepth 1 -type d -mtime "+${RETENTION_DAYS}" -exec rm -rf -- {} +
echo "[$(date --iso-8601=seconds)] Backup concluido: ${STAMP}"
