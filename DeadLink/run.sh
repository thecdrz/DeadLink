#!/bin/sh

# Load .env if present (exports all vars)
if [ -f .env ]; then
  set -a
  . ./.env
  set +a
fi

# Auto restart
until node index.js; do
  echo "Application closed with exit code $?. Restarting in 5s, press Ctrl+C to cancel." >&2
  sleep 5
done
read -p "Press enter to continue"
