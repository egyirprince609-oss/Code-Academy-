#!/bin/sh
set -eu
# Named Docker volumes are root-owned the first time they are mounted. Assign only
# the volume directories (not the contents) to the low-privilege API account.
chown academy:academy /data /quarantine
exec gosu academy uvicorn app.main:app --host 0.0.0.0 --port 8000 --proxy-headers --forwarded-allow-ips 127.0.0.1
