#!/bin/sh
# RIFFA backend entrypoint.
#
# Запускается под root → выправляет владельца mounted-volume
# /app/media (там Docker создаёт корневую папку как root, и наш
# unprivileged appuser не может писать аватары), затем сбрасывает
# привилегии и запускает uvicorn от appuser через gosu.
set -e

# Идемпотентный chown — на старте контейнера всегда.
if [ -d /app/media ]; then
  mkdir -p /app/media/avatars
  chown -R appuser:appuser /app/media 2>/dev/null || true
fi

# Drop privileges and exec the actual command.
exec gosu appuser "$@"
