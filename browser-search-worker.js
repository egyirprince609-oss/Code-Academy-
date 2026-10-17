/**
 * Code Academy Browser Search Worker (Cloudflare Workers)
 * ------------------------------------------------------
 * Deploy this file as a Cloudflare Worker, then paste its HTTPS URL into
 * Browser Settings -> Search Worker URL. This is a search endpoint only; it
 * does not proxy arbitrary destinations or bypass a website's frame policy.
 *
 * Routes: GET /health and GET /search?q=...&category=web|videos|news|documents
 * Search provider: DuckDuckGo HTML results. Provider markup/rate limits can
 * change, so failures are returned rather than inventing placeholder results.
 */
const ALLOWED_CATEGORIES = new Set(['web', 'videos', 'news', 'documents']);
const MAX_QUERY_LENGTH = 240;
const MAX_RESULTS = 15;
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
    if (requestUrl.pathname.endsWith('/health')) return json({ ok: true, service: 'Code Academy Browser Search', provider: 'DuckDuckGo HTML search', time: new Date().toISOString() });
    if (!requestUrl.pathname.endsWith('/search')) return json({ ok: false, error: `Unknown endpoint: ${requestUrl.pathname}. Use /search or /health.` }, 404);
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
          'User-Agent': 'CodeAcademyBrowserSearch/1.0 (+https://egyirprince609-oss.github.io/Code-Academy-/)'
        },
        cf: { cacheTtl: 90, cacheEverything: true }
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
