"""Render entrypoint that adds a homepage to the Academy Safe Browser API."""
from fastapi.responses import HTMLResponse
from .main import app


@app.get("/", response_class=HTMLResponse, include_in_schema=False)
async def academy_api_home():
    """Give the service root a useful status page instead of a 404."""
    return HTMLResponse(r'''<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="theme-color" content="#07101f">
<meta name="description" content="Academy Safe Browser API status, search-service readiness and security-service diagnostics.">
<title>Academy Safe Browser · API Status</title>
<style>
:root{color-scheme:dark;--bg:#070b14;--panel:#0f172a;--line:#26364e;--text:#edf4ff;--muted:#a5b4cc;--cyan:#67e8f9;--blue:#818cf8;--green:#34d399;--amber:#fbbf24;--red:#fb7185}*{box-sizing:border-box}body{margin:0;background:radial-gradient(ellipse at 80% 0,#172554 0,transparent 42%),var(--bg);color:var(--text);font:16px/1.5 system-ui,-apple-system,Segoe UI,Roboto,sans-serif;min-height:100vh;padding:24px;display:grid;place-items:center}.wrap{width:min(760px,100%)}.brand{display:flex;align-items:center;gap:12px;margin:0 0 22px}.logo{width:46px;height:46px;border-radius:15px;background:linear-gradient(135deg,#0891b2,#4f46e5);display:grid;place-items:center;font-size:23px;box-shadow:0 10px 30px #0891b233}.eyebrow{color:var(--cyan);text-transform:uppercase;font-size:11px;font-weight:800;letter-spacing:.16em}.brand h1{margin:0;font-size:19px}.panel{border:1px solid var(--line);border-radius:24px;background:linear-gradient(145deg,#111c31ed,#0b1020f5);padding:clamp(20px,5vw,34px);box-shadow:0 24px 80px #0005}.top{display:flex;align-items:flex-start;justify-content:space-between;gap:14px}.top h2{font-size:clamp(25px,5vw,38px);letter-spacing:-.04em;line-height:1.1;margin:7px 0 8px}.muted{color:var(--muted)}.badge{white-space:nowrap;border:1px solid var(--line);padding:7px 11px;border-radius:999px;color:var(--muted);font-weight:750;font-size:12px}.badge.good{color:var(--green);border-color:#34d39966}.badge.warn{color:var(--amber);border-color:#fbbf2466}.grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:12px;margin:24px 0}.feature{border:1px solid var(--line);border-radius:16px;padding:15px;background:#08111f88;min-width:0}.feature .label{font-size:12px;color:var(--muted);display:block;margin-bottom:6px}.feature strong{font-size:14px;overflow-wrap:anywhere}.dot{display:inline-block;width:8px;height:8px;border-radius:50%;background:var(--muted);margin-right:7px}.dot.good{background:var(--green)}.dot.bad{background:var(--red)}.dot.warn{background:var(--amber)}.links{display:flex;flex-wrap:wrap;gap:10px;margin-top:22px}.link{display:inline-flex;align-items:center;justify-content:center;min-height:45px;padding:11px 15px;border-radius:13px;border:1px solid var(--line);text-decoration:none;color:var(--text);font-weight:750;background:#111c31}.link.primary{background:linear-gradient(110deg,#0891b2,#4f46e5);border:0}.hint{font-size:13px;color:var(--muted);margin-top:22px}.raw{margin-top:16px;border-top:1px solid var(--line);padding-top:14px}.raw summary{cursor:pointer;font-size:13px;color:var(--muted);font-weight:700}pre{white-space:pre-wrap;overflow-wrap:anywhere;background:#050912;border:1px solid var(--line);border-radius:12px;padding:12px;font-size:12px;color:#c7d2fe;max-height:260px;overflow:auto}.foot{text-align:center;color:#7685a0;font-size:12px;margin:18px 0 0}@media(max-width:480px){body{padding:14px}.top{display:block}.badge{display:inline-flex;margin-top:10px}.grid{grid-template-columns:1fr}.panel{border-radius:20px}}
</style>
</head>
<body><main class="wrap">
<div class="brand"><div class="logo" aria-hidden="true">⬡</div><div><div class="eyebrow">Code Academy</div><h1>Safe Browser API</h1></div></div>
<section class="panel">
<div class="top"><div><div class="eyebrow">Backend monitor</div><h2>API service status</h2><div class="muted">This is the service endpoint, not the browser interface.</div></div><span id="overall" class="badge">Checking…</span></div>
<div class="grid">
<div class="feature"><span class="label">API health</span><strong id="api"><span class="dot"></span>Checking…</strong></div>
<div class="feature"><span class="label">Web search · SearXNG</span><strong id="search"><span class="dot"></span>Checking…</strong></div>
<div class="feature"><span class="label">File scanning · ClamAV</span><strong id="clam"><span class="dot"></span>Checking…</strong></div>
<div class="feature"><span class="label">Known-threat lookup</span><strong id="risk"><span class="dot"></span>Checking…</strong></div>
</div>
<div class="links"><a class="link primary" href="https://codeacademybywm.web.app/browser.html">Open Academy Browser</a><a class="link" href="/api/health">Health JSON</a><a class="link" href="/api/config">Public API config</a><a class="link" href="/docs">API docs</a></div>
<details class="raw"><summary>View diagnostic response</summary><pre id="raw">Waiting for health response…</pre></details>
<p class="hint">A healthy API does not automatically mean all supporting services are ready. The indicators above use the live health response. If Render's free instance has been idle, the first request may take a while.</p>
</section><p class="foot">Academy Safe Browser · An unverified URL or file is not guaranteed safe.</p>
</main><script>
(async()=>{const set=(id,label,kind)=>{const el=document.getElementById(id);el.innerHTML='<span class="dot '+(kind||'')+'"></span>'+label};const overall=document.getElementById('overall');try{const r=await fetch('/api/health',{cache:'no-store'});const d=await r.json();document.getElementById('raw').textContent=JSON.stringify(d,null,2);if(!r.ok||d.ok!==true){overall.textContent='API issue';overall.className='badge warn';set('api','Health check failed','bad');return}overall.textContent='API responding';overall.className='badge good';set('api','Online · v'+(d.version||'unknown'),'good');const f=d.features||{};set('search',f.searxng_reachable?'Available':'Not reachable',f.searxng_reachable?'good':'bad');set('clam',f.clamav_reachable?'Available':'Not reachable',f.clamav_reachable?'good':'bad');set('risk',f.google_webrisk?'Configured':'Not configured',f.google_webrisk?'good':'warn')}catch(e){overall.textContent='Health check failed';overall.className='badge warn';set('api','Unable to load /api/health','bad');document.getElementById('raw').textContent=String(e)}})();
</script></body></html>''')
