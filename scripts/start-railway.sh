#!/bin/sh
# POSIX sh（dash）対応。wait -n は使わない。
set -e

export API_PORT="${API_PORT:-8080}"
export PORT="${PORT:-3000}"
export HOSTNAME="${HOSTNAME:-0.0.0.0}"
# Railway では既定で Postgres キュー（RabbitMQ プラグイン不要）
export QUEUE_BACKEND="${QUEUE_BACKEND:-postgres}"
if [ -z "${RABBITMQ_URL:-}" ]; then
  export RABBITMQ_URL=disabled
fi

echo "[railway] queue=${QUEUE_BACKEND} rabbit=${RABBITMQ_URL}"
echo "[railway] starting API on :${API_PORT}"
npm run start -w @bms/api &
API_PID=$!

start_worker() {
  echo "[railway] starting Worker"
  npm run start -w @bms/worker &
  WORKER_PID=$!
}

start_worker

# API の起動待ち
i=0
while [ "$i" -lt 30 ]; do
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

# Web を主プロセスとして維持。Worker は落ちても再起動。
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
