FROM python:3.12-slim AS builder

ENV PYTHONUNBUFFERED=1 \
    PYTHONDONTWRITEBYTECODE=1 \
    PIP_NO_CACHE_DIR=1 \
    PIP_DISABLE_PIP_VERSION_CHECK=1

WORKDIR /app

RUN apt-get update && apt-get install -y --no-install-recommends \
    build-essential libpq-dev curl && rm -rf /var/lib/apt/lists/*

COPY pyproject.toml ./
COPY app ./app
COPY static_dist ./static_dist

RUN pip install --upgrade pip && pip install -e .

# Drop root: run as unprivileged user
RUN useradd -r -u 1001 -s /sbin/nologin appuser && \
    mkdir -p /app/media/avatars && \
    chown -R appuser:appuser /app

USER appuser

EXPOSE 8000

CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000"]
