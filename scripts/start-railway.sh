#!/bin/sh
# POSIX sh（dash）対応。
# Railway の PORT = 公開 Web 専用。API / Worker は別ポート。
set -e

# 公開ポート（Railway 注入）。未設定時のみ 3000
PUBLIC_PORT="${PORT:-3000}"
export API_PORT="${API_PORT:-8081}"
export WORKER_METRICS_PORT="${WORKER_METRICS_PORT:-8082}"
export PORT="$PUBLIC_PORT"
export HOSTNAME="${HOSTNAME:-0.0.0.0}"
export API_INTERNAL_URL="${API_INTERNAL_URL:-http://127.0.0.1:${API_PORT}}"

export QUEUE_BACKEND="${QUEUE_BACKEND:-postgres}"
if [ -z "${RABBITMQ_URL:-}" ]; then
  export RABBITMQ_URL=disabled
fi

echo "[railway] public=${PORT} api=${API_PORT} worker_metrics=${WORKER_METRICS_PORT}"
echo "[railway] queue=${QUEUE_BACKEND} rabbit=${RABBITMQ_URL}"
echo "[railway] starting API on :${API_PORT}"
npm run start -w @bms/api &
API_PID=$!

start_worker() {
  echo "[railway] starting Worker (metrics :${WORKER_METRICS_PORT})"
  npm run start -w @bms/worker &
  WORKER_PID=$!
}

start_worker

i=0
while [ "$i" -lt 45 ]; do
  if curl -sf "http://127.0.0.1:${API_PORT}/health" >/dev/null; then
    echo "[railway] API healthy"
    break
  fi
  i=$((i + 1))
  sleep 1
done

echo "[railway] starting Web on :${PORT}"
node apps/web/server.js &
WEB_PID=$!

term() {
  echo "[railway] shutting down"
  kill "$API_PID" "$WORKER_PID" "$WEB_PID" 2>/dev/null || true
  wait 2>/dev/null || true
  exit 0
}
trap term INT TERM

while true; do
  if ! kill -0 "$WEB_PID" 2>/dev/null; then
    echo "[railway] web exited — stopping"
    term
  fi
  if ! kill -0 "$API_PID" 2>/dev/null; then
    echo "[railway] api exited — restarting"
    npm run start -w @bms/api &
    API_PID=$!
  fi
  if ! kill -0 "$WORKER_PID" 2>/dev/null; then
    echo "[railway] worker exited — restarting in 5s"
    sleep 5
    start_worker
  fi
  sleep 2
done
