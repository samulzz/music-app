#!/usr/bin/env bash
set -Eeuo pipefail

APP_DIR="/opt/nationmusics-test"
BASE_REMOTE="nationmusics-drive:"
CRYPT_REMOTE="nationmusics-drive-crypt:"

if ! rclone listremotes | grep -qx "${BASE_REMOTE}"; then
  echo "Remote Google Drive ainda nao foi autorizado." >&2
  exit 1
fi

if ! rclone listremotes | grep -qx "${CRYPT_REMOTE}"; then
  rclone config create nationmusics-drive-crypt crypt \
    remote nationmusics-drive:NationMusicsBackup \
    filename_encryption standard \
    directory_name_encryption true
  crypt_password="$(openssl rand -hex 32)"
  crypt_salt="$(openssl rand -hex 32)"
  rclone config password nationmusics-drive-crypt \
    password "${crypt_password}" password2 "${crypt_salt}" >/dev/null
fi

chmod 600 /root/.config/rclone/rclone.conf
rclone mkdir "${CRYPT_REMOTE}"

chmod 0755 "${APP_DIR}/backup/backup.sh"
install -m 0644 "${APP_DIR}/backup/nationmusics-backup.service" /etc/systemd/system/
install -m 0644 "${APP_DIR}/backup/nationmusics-backup.timer" /etc/systemd/system/
systemctl daemon-reload

echo "Drive criptografado configurado. O timer pode ser ativado apos o primeiro backup."
