#!/bin/bash
# Ежедневный бэкап PostgreSQL
set -euo pipefail

BACKUP_DIR="/root/backups/postgres"
DATE=$(date +%Y-%m-%d_%H-%M)
FILE="$BACKUP_DIR/riffa_$DATE.sql.gz"
KEEP_DAYS=14

# Дамп БД прямо из контейнера, сразу сжимаем
docker exec ops-postgres-1 \
    pg_dump -U riffa riffa | gzip > "$FILE"

# Удаляем бэкапы старше 14 дней
find "$BACKUP_DIR" -name "*.sql.gz" -mtime +$KEEP_DAYS -delete

echo "[$(date)] Бэкап создан: $FILE ($(du -sh "$FILE" | cut -f1))"
echo "[$(date)] Бэкапов сохранено: $(ls "$BACKUP_DIR"/*.sql.gz 2>/dev/null | wc -l)"
