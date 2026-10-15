FROM python:3.12-slim
ENV PYTHONDONTWRITEBYTECODE=1 PYTHONUNBUFFERED=1
WORKDIR /app
RUN apt-get update \
    && apt-get install -y --no-install-recommends gosu ca-certificates \
    && rm -rf /var/lib/apt/lists/*
RUN groupadd --system academy && useradd --system --gid academy --home-dir /app academy
COPY requirements.txt ./requirements.txt
RUN pip install --no-cache-dir -r requirements.txt
COPY app ./app
COPY docker-entrypoint.sh ./docker-entrypoint.sh
RUN chmod 755 ./docker-entrypoint.sh && mkdir -p /data /quarantine && chown -R academy:academy /app /data /quarantine
EXPOSE 8000
ENTRYPOINT ["/app/docker-entrypoint.sh"]
