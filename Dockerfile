# syntax=docker/dockerfile:1.7
# Root-level Dockerfile for the Academy Safe Browser API on Render.
# IMPORTANT: Render Root Directory must be blank and Docker Context must be the repository root.
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

# These paths are relative to the GitHub repository root.
COPY academy-safe-browser-backend/requirements.txt ./requirements.txt
RUN pip install --no-cache-dir -r ./requirements.txt
COPY academy-safe-browser-backend/app ./app
COPY academy-safe-browser-backend/docker-entrypoint.sh ./docker-entrypoint.sh

# Build the status homepage into the image. This avoids depending on a separately
# uploaded entrypoint.py file and makes the root URL return a useful page.
RUN <<'BASH'
cat > ./app/entrypoint.py <<'PY'
from fastapi.responses import HTMLResponse
from .main import app

@app.get("/", response_class=HTMLResponse, include_in_schema=False)
async def academy_api_home():
    return HTMLResponse(r'''<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="theme-color" content="#07101f"><meta name="description" content="Academy Safe Browser backend status and diagnostics."><title>Academy Safe Browser · API Status</title>
<style>
:root{color-scheme:dark;--bg:#070b14;--panel:#101a2d;--line:#293953;--text:#edf4ff;--muted:#a5b4cc;--cyan:#67e8f9;--green:#34d399;--amber:#fbbf24;--red:#fb7185}*{box-sizing:border-box}body{margin:0;min-height:100vh;padding:22px;background:radial-gradient(ellipse at 80% 0,#172554,transparent 45%),var(--bg);color:var(--text);font:16px/1.5 system-ui,-apple-system,Segoe UI,Roboto,sans-serif;display:grid;place-items:center}.wrap{width:min(760px,100%)}.brand{display:flex;gap:12px;align-items:center;margin-bottom:20px}.logo{width:46px;height:46px;border-radius:15px;background:linear-gradient(135deg,#0891b2,#4f46e5);display:grid;place-items:center;font-size:24px}.eyebrow{color:var(--cyan);font-size:11px;font-weight:800;letter-spacing:.15em;text-transform:uppercase}.brand h1{font-size:19px;margin:0}.panel{border:1px solid var(--line);border-radius:23px;background:#101a2deF;padding:clamp(20px,5vw,34px);box-shadow:0 24px 80px #0006}.top{display:flex;align-items:flex-start;justify-content:space-between;gap:12px}.top h2{font-size:clamp(25px,5vw,38px);line-height:1.12;letter-spacing:-.04em;margin:7px 0}.muted{color:var(--muted)}.badge{border:1px solid var(--line);border-radius:999px;padding:7px 11px;font-size:12px;font-weight:800;white-space:nowrap;color:var(--muted)}.good{color:var(--green)!important}.warn{color:var(--amber)!important}.bad{color:var(--red)!important}.grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:12px;margin:24px 0}.feature{border:1px solid var(--line);background:#07111f;border-radius:15px;padding:15px;overflow-wrap:anywhere}.label{display:block;font-size:12px;color:var(--muted);margin-bottom:6px}.dot{display:inline-block;width:8px;height:8px;border-radius:50%;background:currentColor;margin-right:8px}.links{display:flex;flex-wrap:wrap;gap:10px}.link{display:inline-flex;align-items:center;justify-content:center;min-height:44px;padding:10px 14px;border:1px solid var(--line);border-radius:12px;color:var(--text);text-decoration:none;font-weight:750;background:#111e33}.primary{background:linear-gradient(110deg,#0891b2,#4f46e5);border:0}.raw{border-top:1px solid var(--line);margin-top:20px;padding-top:15px}.raw summary{cursor:pointer;color:var(--muted);font-weight:700;font-size:13px}pre{white-space:pre-wrap;overflow-wrap:anywhere;background:#050912;border:1px solid var(--line);border-radius:12px;padding:12px;font-size:12px;max-height:270px;overflow:auto}.hint,.foot{color:var(--muted);font-size:12px}.foot{text-align:center;margin-top:16px}@media(max-width:480px){body{padding:13px}.top{display:block}.badge{display:inline-block;margin-top:10px}.grid{grid-template-columns:1fr}}
</style></head><body><main class="wrap"><div class="brand"><div class="logo">⬡</div><div><div class="eyebrow">Code Academy</div><h1>Safe Browser API</h1></div></div><section class="panel"><div class="top"><div><div class="eyebrow">Backend monitor</div><h2>API service status</h2><div class="muted">This is the backend status page, not the browser interface.</div></div><span id="overall" class="badge">Checking…</span></div><div class="grid"><div class="feature"><span class="label">API health</span><strong id="api">Checking…</strong></div><div class="feature"><span class="label">Web search · SearXNG</span><strong id="search">Checking…</strong></div><div class="feature"><span class="label">File scanning · ClamAV</span><strong id="clam">Checking…</strong></div><div class="feature"><span class="label">Known-threat lookup</span><strong id="risk">Checking…</strong></div></div><div class="links"><a class="link primary" href="https://egyirprince609-oss.github.io/Code-Academy-/browser.html">Open Academy Browser</a><a class="link" href="/api/health">Health JSON</a><a class="link" href="/api/config">Public API config</a><a class="link" href="/docs">API docs</a></div><details class="raw"><summary>View diagnostic response</summary><pre id="raw">Waiting for health response…</pre></details><p class="hint">The API can be online while optional search or scanning services are unavailable. These checks report the current response rather than assuming all features work.</p></section><p class="foot">Academy Safe Browser · No automated check guarantees that a site or file is completely safe.</p></main><script>
(async()=>{const text=(id,s,kind='')=>{const e=document.getElementById(id);e.textContent=s;e.className=kind};const overall=document.getElementById('overall');try{const r=await fetch('/api/health',{cache:'no-store'});let d=await r.json();document.getElementById('raw').textContent=JSON.stringify(d,null,2);if(!r.ok||d.ok!==true){text('overall','API issue','badge warn');text('api','Health check failed','bad');return}overall.textContent='API responding';overall.className='badge good';text('api','Online · v'+(d.version||'unknown'),'good');const f=d.features||{};text('search',f.searxng_reachable?'Reachable':'Not reachable',f.searxng_reachable?'good':'bad');text('clam',f.clamav_reachable?'Reachable':'Not reachable',f.clamav_reachable?'good':'bad');text('risk',f.google_webrisk?'Configured':'Not configured',f.google_webrisk?'good':'warn')}catch(e){overall.textContent='Health check failed';overall.className='badge warn';text('api','Unable to load /api/health','bad');document.getElementById('raw').textContent=String(e)}})();
</script></body></html>''')
PY
chmod 755 ./docker-entrypoint.sh
sed -i 's/app\.main:app/app.entrypoint:app/' ./docker-entrypoint.sh
sed -i 's/--port 8000/--port "${PORT:-10000}"/' ./docker-entrypoint.sh
mkdir -p /data /quarantine
chown -R academy:academy /app /data /quarantine
BASH

EXPOSE 10000
ENTRYPOINT ["/app/docker-entrypoint.sh"]
