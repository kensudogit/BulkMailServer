#!/bin/sh
set -e

export API_PORT="${API_PORT:-8080}"
export PORT="${PORT:-3000}"
export HOSTNAME="${HOSTNAME:-0.0.0.0}"

echo "[railway] starting API on :${API_PORT}"
npm run start -w @bms/api &
API_PID=$!

echo "[railway] starting Worker"
npm run start -w @bms/worker &
WORKER_PID=$!

# API の起動待ち
for i in 1 2 3 4 5 6 7 8 9 10; do
  if curl -sf "http://127.0.0.1:${API_PORT}/health" >/dev/null; then
    echo "[railway] API healthy"
    break
  fi
  sleep 1
done

echo "[railway] starting Web on :${PORT}"
node apps/web/server.js &
WEB_PID=$!

term() {
  kill "$API_PID" "$WORKER_PID" "$WEB_PID" 2>/dev/null || true
  wait 2>/dev/null || true
}
trap term INT TERM

wait -n "$API_PID" "$WORKER_PID" "$WEB_PID"
term
exit 1
