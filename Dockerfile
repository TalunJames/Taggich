# syntax=docker/dockerfile:1.7
# Taggich — Immich tag manager
FROM python:3.12-slim

ARG APP_UID=1000
ARG APP_GID=1000

ENV PYTHONUNBUFFERED=1 \
    PYTHONDONTWRITEBYTECODE=1 \
    PIP_DISABLE_PIP_VERSION_CHECK=1 \
    PIP_NO_CACHE_DIR=1 \
    CONFIG_DIR=/data \
    PORT=5000 \
    HOST=0.0.0.0

# Non-root user. /data is the volume that holds config.json.
RUN groupadd -g ${APP_GID} taggich \
 && useradd  -u ${APP_UID} -g taggich -d /app -M -s /usr/sbin/nologin taggich \
 && mkdir -p /app /data \
 && chown -R taggich:taggich /app /data

WORKDIR /app

COPY --chown=taggich:taggich requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY --chown=taggich:taggich app.py .
COPY --chown=taggich:taggich templates ./templates
COPY --chown=taggich:taggich static    ./static

VOLUME ["/data"]

EXPOSE 5000

USER taggich

# Lightweight healthcheck — no extra deps, no external network call.
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
    CMD python -c "import urllib.request,sys; \
sys.exit(0 if urllib.request.urlopen('http://127.0.0.1:5000/healthz', timeout=4).status==200 else 1)" \
    || exit 1

CMD ["python", "app.py"]
