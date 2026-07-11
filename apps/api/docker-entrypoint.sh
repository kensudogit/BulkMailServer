#!/bin/sh
set -e
# Railway は PORT を注入する
export API_PORT="${PORT:-${API_PORT:-8080}}"
exec npm run start -w @bms/api
