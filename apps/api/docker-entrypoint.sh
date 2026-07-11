#!/bin/sh
set -e
# 単体 API サービス用。一体型では start-railway.sh を使う。
export API_PORT="${API_PORT:-${PORT:-8080}}"
exec npm run start -w @bms/api
