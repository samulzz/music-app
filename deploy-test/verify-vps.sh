#!/usr/bin/env bash
set -Eeuo pipefail

cd /opt/nationmusics-test
docker compose ps

docker exec barbershop-mysql-1 sh -lc '
  mysql -uroot -p"${MYSQL_ROOT_PASSWORD}" --batch --skip-column-names -e "
    SELECT CONCAT('"'"'songs='"'"', COUNT(*)) FROM nationmusics_test.songs;
    SELECT CONCAT('"'"'users='"'"', COUNT(*)) FROM nationmusics_test.users;
    SELECT CONCAT('"'"'global_playlists='"'"', COUNT(*)) FROM nationmusics_test.playlists WHERE global_playlist = 1;
  "
'

curl -fsS \
  -H "X-API-KEY: ${API_SECURITY_KEY:?Defina API_SECURITY_KEY antes de verificar}" \
  http://127.0.0.1:8090/api/musicas/status
echo
