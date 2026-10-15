# Root-level Dockerfile for Render.
# Build context must be the repository root so the COPY paths below can
# access academy-safe-browser-backend/.
FROM python:3.12-slim

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    DATABASE_PATH=/data/academy-browser.sqlite3 \
    QUARANTINE_DIR=/quarantine \
    PORT=10000

WORKDIR /app

RUN apt-get update \
    && apt-get install -y --no-install-recommends gosu ca-certificates \
    && rm -rf /var/lib/apt/lists/*

RUN groupadd --system academy \
    && useradd --system --gid academy --home-dir /app academy

# Pull the app files from the existing backend folder in the repository.
COPY academy-safe-browser-backend/requirements.txt ./requirements.txt
RUN pip install --no-cache-dir -r ./requirements.txt

COPY academy-safe-browser-backend/app ./app
COPY academy-safe-browser-backend/docker-entrypoint.sh ./docker-entrypoint.sh

# Render supplies PORT at runtime (normally 10000). The original backend
# entrypoint used a fixed port 8000, so adapt it for Render.
RUN chmod 755 ./docker-entrypoint.sh \
    && sed -i 's/--port 8000/--port "${PORT:-10000}"/' ./docker-entrypoint.sh \
    && mkdir -p /data /quarantine \
    && chown -R academy:academy /app /data /quarantine

EXPOSE 10000
ENTRYPOINT ["/app/docker-entrypoint.sh"]
