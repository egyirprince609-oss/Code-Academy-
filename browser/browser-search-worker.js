/**
 * Code Academy Browser Search Worker (Cloudflare Workers)
 * ------------------------------------------------------
 * Deploy this file as a Cloudflare Worker, then paste its HTTPS URL into
 * Browser Settings -> Search Worker URL. This is a search endpoint only; it
 * does not proxy arbitrary destinations or bypass a website's frame policy.
 *
 * Routes: GET /health, /search, /headlines and /share-preview
 * Search provider: DuckDuckGo HTML results. Provider markup/rate limits can
 * change, so failures are returned rather than inventing placeholder results.
 */
const ALLOWED_CATEGORIES = new Set(['web', 'videos', 'news', 'documents']);
const MAX_QUERY_LENGTH = 240;
const MAX_RESULTS = 15;
const DEFAULT_APP_BASE = 'https://codeacademybywm.web.app/';
const NEWS_FEEDS = [
  { url: 'https://feeds.bbci.co.uk/news/world/rss.xml', label: 'BBC News · World' },
  { url: 'https://feeds.bbci.co.uk/news/technology/rss.xml', label: 'BBC News · Technology' },
  { url: 'https://www.theguardian.com/world/rss', label: 'The Guardian · World' }
];
// Best-effort per-isolate throttling. Also configure a Cloudflare rate-limit/WAF rule for production.
const requestBuckets = new Map();
const RATE_WINDOW_MS = 60_000;
const RATE_MAX_REQUESTS = 90;
const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
  'Access-Control-Max-Age': '86400',
  'Vary': 'Origin'
};

function json(body, status = 200, extraHeaders = {}) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', ...extraHeaders }
  });
}
function escapeHtml(value) {
  return String(value ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}
function cleanText(value, max = 240) {
  return String(value ?? '').replace(/[\u0000-\u001f\u007f]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, max);
}
function publicShareTarget(value) {
  try {
    const url = new URL(String(value || ''));
    if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password) return null;
    const host = url.hostname.toLowerCase().replace(/\.$/, '');
    if (!host || host === 'localhost' || host.endsWith('.localhost') || host.endsWith('.local') || host.endsWith('.internal') || host.endsWith('.lan')) return null;
    // This sharing endpoint does not fetch the destination; reject IP literals and unsafe URL schemes anyway.
    if (/^\d{1,3}(?:\.\d{1,3}){3}$/.test(host) || host.includes(':') || !host.includes('.')) return null;
    url.hash = url.hash.slice(0, 600);
    return url;
  } catch { return null; }
}
function allowRequest(request, now = Date.now()) {
  const key = request.headers.get('CF-Connecting-IP') || 'unknown-client';
  const current = requestBuckets.get(key);
  if (!current || now - current.startedAt >= RATE_WINDOW_MS) {
    requestBuckets.set(key, { startedAt: now, count: 1 });
    if (requestBuckets.size > 4000) {
      for (const [candidate, bucket] of requestBuckets) if (now - bucket.startedAt > RATE_WINDOW_MS * 2) requestBuckets.delete(candidate);
    }
    return true;
  }
  current.count += 1;
  return current.count <= RATE_MAX_REQUESTS;
}
function xmlText(block, tag) {
  const match = String(block || '').match(new RegExp(`<${tag}(?:\\s[^>]*)?>([\\s\\S]*?)<\\/${tag}>`, 'i'));
  if (!match) return '';
  return stripTags(decodeEntities(match[1].replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1')));
}
async function fetchHeadlines(limitCount = 9) {
  const settled = await Promise.allSettled(NEWS_FEEDS.map(async feed => {
    const response = await fetch(feed.url, {
      headers: { 'Accept': 'application/rss+xml, application/xml, text/xml;q=0.9' },
      redirect: 'follow',
      cf: { cacheTtl: 300, cacheEverything: true },
      signal: AbortSignal.timeout(9000)
    });
    if (!response.ok) throw new Error(`${feed.label} returned HTTP ${response.status}`);
    const xml = (await response.text()).slice(0, 1_500_000);
    const blocks = [...xml.matchAll(/<item\b[^>]*>([\s\S]*?)<\/item>/gi)].map(match => match[1]);
    const items = blocks.map(block => {
      const title = xmlText(block, 'title');
      const link = realResultUrl(xmlText(block, 'link'));
      const description = xmlText(block, 'description');
      const published = xmlText(block, 'pubDate') || xmlText(block, 'dc:date');
      const imageMatch = block.match(/<(?:media:thumbnail|media:content|enclosure)\b[^>]*\burl=["']([^"']+)["']/i);
      let image = '';
      if (imageMatch) {
        try { const parsedImage = new URL(decodeEntities(imageMatch[1])); if (['https:', 'http:'].includes(parsedImage.protocol)) image = parsedImage.href; } catch {}
      }
      if (!title || !link) return null;
      let domain = ''; try { domain = new URL(link).hostname.replace(/^www\./, ''); } catch {}
      return { title: cleanText(title, 220), url: link, snippet: cleanText(description, 360), source: feed.label || domain, published, image, domain };
    }).filter(Boolean);
    return items;
  }));
  const combined = [];
  for (const result of settled) if (result.status === 'fulfilled') combined.push(...result.value);
  const unique = []; const seen = new Set();
  for (const item of combined) { if (seen.has(item.url)) continue; seen.add(item.url); unique.push(item); if (unique.length >= limitCount) break; }
  if (!unique.length) throw new Error('No configured RSS news feed responded with parseable current items.');
  return unique;
}
function sharePreviewResponse(request, env) {
  const requestUrl = new URL(request.url);
  const target = publicShareTarget(requestUrl.searchParams.get('url'));
  if (!target) return json({ ok: false, error: 'Supply a public HTTP or HTTPS website URL to share.' }, 400);
  const title = cleanText(requestUrl.searchParams.get('title') || target.hostname, 170);
  const summary = cleanText(requestUrl.searchParams.get('description') || `Open ${title} with Code Academy Browser.`, 240);
  const pageTitle = `${title} | Code Academy Browser`;
  const description = `${summary} Shared with Code Academy Browser by Code Academy. Search, browse, discover news and keep your tabs together in one focused workspace.`;
  const configuredBase = cleanText(env?.APP_BASE_URL || DEFAULT_APP_BASE, 400);
  let imageUrl = `${DEFAULT_APP_BASE}browser_image_preview.png`;
  let appIconUrl = `${DEFAULT_APP_BASE}browser-icon-192.png`;
  try {
    const baseUrl = configuredBase.endsWith('/') ? configuredBase : `${configuredBase}/`;
    imageUrl = new URL('browser_image_preview.png', baseUrl).href;
    appIconUrl = new URL('browser-icon-192.png', baseUrl).href;
  } catch {}
  const shareUrl = requestUrl.href;
  const targetHref = escapeHtml(target.href);
  const safeTitle = escapeHtml(title);
  const pageTitleEscaped = escapeHtml(pageTitle);
  const safeDescription = escapeHtml(description);
  const escapedShareUrl = escapeHtml(shareUrl);
  const safeImage = escapeHtml(imageUrl);
  const safeAppIcon = escapeHtml(appIconUrl);
  const html = `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex,nofollow"><meta name="description" content="${safeDescription}"><meta name="theme-color" content="#080d19"><meta property="og:type" content="website"><meta property="og:site_name" content="Code Academy Browser"><meta property="og:title" content="${pageTitleEscaped}"><meta property="og:description" content="${safeDescription}"><meta property="og:url" content="${escapedShareUrl}"><meta property="og:image" content="${safeImage}"><meta property="og:image:alt" content="Code Academy Browser — Search, browse and discover"><meta property="og:image:width" content="1200"><meta property="og:image:height" content="630"><meta name="twitter:card" content="summary_large_image"><meta name="twitter:title" content="${pageTitleEscaped}"><meta name="twitter:description" content="${safeDescription}"><meta name="twitter:image" content="${safeImage}"><title>${pageTitleEscaped}</title><style>*{box-sizing:border-box}body{margin:0;min-height:100vh;display:grid;place-items:center;padding:22px;background:radial-gradient(ellipse at 15% 0,#163957,transparent 42%),#080d19;color:#eff6ff;font:16px system-ui,sans-serif}.card{width:min(610px,100%);border:1px solid #314967;border-radius:24px;background:#101a2c;overflow:hidden;box-shadow:0 22px 75px #0008}.hero{padding:26px;background:linear-gradient(140deg,#122844,#211f42)}.brand{display:flex;align-items:center;gap:11px;font-weight:800}.brand img{width:42px;height:42px;object-fit:contain;border-radius:12px;background:#ffffff12}.eyebrow{font-size:11px;letter-spacing:1.8px;text-transform:uppercase;color:#79dfe6;margin:22px 0 9px}.hero h1{font-size:clamp(24px,5vw,35px);line-height:1.1;letter-spacing:-1px;margin:0}.hero p{line-height:1.65;color:#b2c3da;font-size:14px}.details{padding:23px 26px}.site{font-weight:800;font-size:18px;margin:0 0 8px;overflow-wrap:anywhere}.domain{color:#85dbe4;font-size:12px;overflow-wrap:anywhere}.description{font-size:13px;line-height:1.7;color:#a6b7cf}.actions{display:flex;gap:10px;flex-wrap:wrap;margin-top:20px}.actions a{padding:12px 16px;border-radius:12px;background:#4bd1dd;color:#071220;text-decoration:none;font-weight:800;font-size:13px}.actions a.secondary{background:#192b43;color:#dceafb;border:1px solid #3b5574}.foot{padding:0 26px 23px;color:#7f95b2;font-size:11px}</style></head><body><main class="card"><section class="hero"><div class="brand"><img src="${safeAppIcon}" alt=""><span>Code Academy Browser</span></div><div class="eyebrow">A link shared from Code Academy</div><h1>${safeTitle}</h1><p>${safeDescription}</p></section><section class="details"><p class="site">${safeTitle}</p><div class="domain">${escapeHtml(target.hostname)}</div><p class="description">This link was shared through Code Academy Browser. Open the original publisher to view its latest content and site-specific features.</p><div class="actions"><a href="${targetHref}" rel="noopener noreferrer">Open original website ↗</a><a class="secondary" href="${escapeHtml(configuredBase)}">Explore Code Academy</a></div></section><div class="foot">Search. Browse. Stay focused. · Code Academy</div></main></body></html>`;
  return new Response(html, { status: 200, headers: {
    'Content-Type': 'text/html; charset=utf-8',
    'Cache-Control': 'public, max-age=60, s-maxage=300',
    'X-Content-Type-Options': 'nosniff',
    'Referrer-Policy': 'strict-origin-when-cross-origin',
    'Content-Security-Policy': "default-src 'none'; style-src 'unsafe-inline'; img-src https: data:; base-uri 'none'; form-action 'none'; frame-ancestors 'none'",
    'X-Frame-Options': 'DENY'
  }});
}

function decodeEntities(value) {
  return String(value || '')
    .replace(/&amp;/gi, '&').replace(/&quot;/gi, '"').replace(/&#39;|&apos;/gi, "'")
    .replace(/&lt;/gi, '<').replace(/&gt;/gi, '>')
    .replace(/&#(\d+);/g, (_, number) => String.fromCodePoint(Number(number)))
    .replace(/&#x([0-9a-f]+);/gi, (_, number) => String.fromCodePoint(parseInt(number, 16)));
}
function stripTags(value) {
  return decodeEntities(String(value || '').replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, ' ').replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, ' ').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim());
}
function extractAttribute(attributes, name) {
  const expression = new RegExp(`(?:^|\\s)${name}\\s*=\\s*(["'])(.*?)\\1`, 'i');
  const match = String(attributes || '').match(expression);
  return match ? decodeEntities(match[2]) : '';
}
function realResultUrl(href) {
  try {
    const initial = new URL(href, 'https://html.duckduckgo.com');
    if (initial.hostname.endsWith('duckduckgo.com')) {
      const target = initial.searchParams.get('uddg');
      if (target) href = decodeURIComponent(target);
    }
    const final = new URL(href);
    if (!['http:', 'https:'].includes(final.protocol)) return '';
    if (final.hostname.endsWith('duckduckgo.com') && final.pathname.includes('/l/')) return '';
    return final.href;
  } catch { return ''; }
}
function parseResults(html, maxResults) {
  const anchors = [...String(html || '').matchAll(/<a\b([^>]*)>([\s\S]*?)<\/a>/gi)];
  const parsed = [];
  const seen = new Set();
  for (let index = 0; index < anchors.length && parsed.length < maxResults; index++) {
    const match = anchors[index];
    const attributes = match[1] || '';
    const classes = extractAttribute(attributes, 'class');
    if (!/(^|\s)result__a(\s|$)/i.test(classes)) continue;
    const url = realResultUrl(extractAttribute(attributes, 'href'));
    const title = stripTags(match[2]);
    if (!url || !title || seen.has(url)) continue;
    seen.add(url);
    const start = (match.index || 0) + match[0].length;
    const nextResultAnchor = anchors.slice(index + 1).find(item => /result__a/.test(extractAttribute(item[1], 'class')));
    const end = nextResultAnchor ? nextResultAnchor.index : Math.min(String(html).length, start + 2600);
    const section = String(html).slice(start, end);
    const snippetMatch = section.match(/<(?:a|div|span)\b([^>]*class=["'][^"']*result__snippet[^"']*["'][^>]*)>([\s\S]*?)<\/(?:a|div|span)>/i);
    const snippet = snippetMatch ? stripTags(snippetMatch[2]) : '';
    parsed.push({ title: title.slice(0, 300), url, snippet: snippet.slice(0, 700), domain: new URL(url).hostname });
  }
  return parsed;
}
function providerQuery(q, category) {
  if (category === 'documents') return `${q} (filetype:pdf OR filetype:doc OR filetype:docx OR filetype:ppt OR filetype:pptx OR filetype:xls OR filetype:xlsx)`;
  return q;
}

export default {
  async fetch(request, env, ctx) {
    if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: corsHeaders });
    if (request.method !== 'GET') return json({ ok: false, error: `Method not allowed: ${request.method}` }, 405, { Allow: 'GET, OPTIONS' });
    const requestUrl = new URL(request.url);
    if (requestUrl.pathname.endsWith('/health')) return json({ ok: true, service: 'Code Academy Browser Search', providers: ['DuckDuckGo HTML search', 'public RSS headlines', 'branded share previews'], time: new Date().toISOString() });
    if (requestUrl.pathname.endsWith('/share-preview')) {
      if (!allowRequest(request)) return json({ ok: false, error: 'Rate limit reached. Wait a minute and try again.' }, 429, { 'Retry-After': '60' });
      return sharePreviewResponse(request, env);
    }
    if (requestUrl.pathname.endsWith('/headlines')) {
      if (!allowRequest(request)) return json({ ok: false, error: 'Rate limit reached. Wait a minute and try again.' }, 429, { 'Retry-After': '60' });
      const requested = Number(requestUrl.searchParams.get('limit') || 9);
      const count = Number.isFinite(requested) ? Math.min(12, Math.max(1, Math.floor(requested))) : 9;
      try {
        const items = await fetchHeadlines(count);
        return json({ ok: true, source: 'BBC News and The Guardian public RSS feeds', count: items.length, items, updatedAt: new Date().toISOString() }, 200, { 'Cache-Control': 'public, max-age=60, s-maxage=300' });
      } catch (error) { return json({ ok: false, error: `Live headlines unavailable: ${error instanceof Error ? error.message : String(error)}` }, 502); }
    }
    if (!requestUrl.pathname.endsWith('/search')) return json({ ok: false, error: `Unknown endpoint: ${requestUrl.pathname}. Use /search, /headlines, /share-preview or /health.` }, 404);
    if (!allowRequest(request)) return json({ ok: false, error: 'Rate limit reached. Wait a minute and try again.' }, 429, { 'Retry-After': '60' });
    const rawQuery = String(requestUrl.searchParams.get('q') || '').trim();
    const category = String(requestUrl.searchParams.get('category') || 'web').toLowerCase();
    const safe = requestUrl.searchParams.get('safe') !== '0';
    if (!rawQuery) return json({ ok: false, error: 'Missing required query parameter: q' }, 400);
    if (rawQuery.length > MAX_QUERY_LENGTH) return json({ ok: false, error: `Query is too long. Maximum length is ${MAX_QUERY_LENGTH} characters.` }, 400);
    if (!ALLOWED_CATEGORIES.has(category)) return json({ ok: false, error: `Unsupported category: ${category}. Use web, videos, news or documents.` }, 400);

    const providerUrl = new URL('https://html.duckduckgo.com/html/');
    providerUrl.searchParams.set('q', providerQuery(rawQuery, category));
    if (category === 'videos') providerUrl.searchParams.set('ia', 'videos');
    if (category === 'news') providerUrl.searchParams.set('ia', 'news');
    if (safe) providerUrl.searchParams.set('kp', '1');

    try {
      const response = await fetch(providerUrl.href, {
        method: 'GET',
        headers: {
          'Accept': 'text/html,application/xhtml+xml',
          'User-Agent': 'CodeAcademyBrowserSearch/1.0 (+https://codeacademybywm.web.app/)'
        },
        cf: { cacheTtl: 90, cacheEverything: true },
        signal: AbortSignal.timeout(12000)
      });
      if (!response.ok) return json({ ok: false, error: `Search provider returned HTTP ${response.status}. Retry later or check provider availability.` }, 502);
      const html = await response.text();
      if (/anomaly-modal|challenge-form|captcha/i.test(html) && !/class=["']result__a/i.test(html)) {
        return json({ ok: false, error: 'The search provider requested an anti-bot verification. No results were fabricated; retry later or switch to another authorized search provider.' }, 503);
      }
      const results = parseResults(html, MAX_RESULTS);
      return json({ ok: true, query: rawQuery, category, provider: 'DuckDuckGo', count: results.length, results, note: results.length ? '' : 'The provider returned no parseable results for this request.' });
    } catch (error) {
      return json({ ok: false, error: `Search request failed: ${error instanceof Error ? `${error.name}: ${error.message}` : String(error)}` }, 502);
    }
  }
};
