#!/usr/bin/env bash
# Applies pending migrations, then runs the API and nginx. If either stops, the container stops
# (and Docker's restart policy brings it back).
set -euo pipefail

cd /app/backend
npx prisma migrate deploy
if [ "${SEED_DEMO_DATA:-false}" = "true" ]; then
  npx prisma db seed
fi

node dist/index.js &
nginx -g "daemon off;" &

trap 'kill $(jobs -p) 2>/dev/null' TERM INT
set +e
wait -n
status=$?
kill $(jobs -p) 2>/dev/null
wait
exit "$status"
