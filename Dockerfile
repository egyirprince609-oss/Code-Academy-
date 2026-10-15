# Academy Safe Browser backend — all source files are in the repository root.
FROM python:3.12-slim

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PORT=10000 \
    APP_ENV=production \
    DATABASE_PATH=/data/academy-browser.sqlite3 \
    QUARANTINE_DIR=/quarantine \
    ALLOWED_ORIGINS=https://egyirprince609-oss.github.io

WORKDIR /app

RUN apt-get update \
    && apt-get install -y --no-install-recommends ca-certificates \
    && rm -rf /var/lib/apt/lists/*

COPY requirements.txt ./requirements.txt
RUN pip install --no-cache-dir -r ./requirements.txt
COPY main.py ./main.py

RUN groupadd --system academy \
    && useradd --system --gid academy --home-dir /app academy \
    && mkdir -p /data /quarantine \
    && chown -R academy:academy /app /data /quarantine

USER academy:academy
EXPOSE 10000
CMD ["sh", "-c", "exec uvicorn main:app --host 0.0.0.0 --port \"${PORT:-10000}\""]
