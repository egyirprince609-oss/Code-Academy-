'use strict';

// Code Academy Live Map API
// Environment secrets stay on Render. Never add actual tokens to this file.
// Browser map rendering requires a pk. PUBLIC token; sk. is server-only.

const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');

const app = express();
const PORT = Number(process.env.PORT) || 10000;
app.set('trust proxy', 1);
app.disable('x-powered-by');

const DEFAULT_ORIGINS = [
  'https://egyirprince609-oss.github.io',
  'https://codeacademy.netlify.app'
];
const allowedOrigins = new Set(
  (process.env.ALLOWED_ORIGINS || DEFAULT_ORIGINS.join(','))
    .split(',')
    .map(value => value.trim().replace(/\/$/, ''))
    .filter(Boolean)
);

app.use(helmet({
  crossOriginResourcePolicy: { policy: 'cross-origin' },
  contentSecurityPolicy: false
}));
app.use(cors({
  origin(origin, callback) {
    // Non-browser clients and same-machine health checks may have no Origin.
    if (!origin || allowedOrigins.has(origin.replace(/\/$/, ''))) return callback(null, true);
    return callback(new Error('Origin is not allowed by the Code Academy Map API CORS policy.'));
  },
  methods: ['GET', 'HEAD', 'OPTIONS'],
  allowedHeaders: ['Accept', 'Content-Type'],
  maxAge: 600
}));
app.use(express.json({ limit: '16kb', strict: true }));

const apiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 240,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  message: { error: 'Too many requests. Please wait a little and try again.' }
});
const searchLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 60,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  message: { error: 'Location search is temporarily rate-limited. Please try again later.' }
});
app.use('/api', apiLimiter);

function publicMapToken() {
  const token = String(process.env.MAPBOX_PUBLIC_TOKEN || '').trim();
  return token.startsWith('pk.') ? token : '';
}
function backendMapToken() {
  const secret = String(process.env.MAPBOX_SECRET_TOKEN || '').trim();
  if (secret.startsWith('sk.')) return secret;
  return publicMapToken();
}
function setNoStore(res) {
  res.set('Cache-Control', 'no-store, max-age=0');
  res.set('Pragma', 'no-cache');
}
function getFirstFeatureLabel(feature) {
  const p = feature && feature.properties ? feature.properties : {};
  // Prefer a readable area/place label. Never log or store a user's coordinates here.
  return String(p.full_address || p.place_formatted || p.name || '').trim().slice(0, 180);
}
async function fetchMapbox(url, token) {
  const requestUrl = new URL(url);
  requestUrl.searchParams.set('access_token', token);
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 12000);
  try {
    const response = await fetch(requestUrl, {
      method: 'GET',
      headers: { Accept: 'application/json', 'User-Agent': 'Code-Academy-Live-Map/1.0' },
      signal: controller.signal
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) {
      const err = new Error(response.status === 401 || response.status === 403
        ? 'Mapbox rejected the server token. Check its scopes and that it has not been revoked.'
        : 'Mapbox could not complete this location request.');
      err.status = response.status === 429 ? 429 : 502;
      throw err;
    }
    return data;
  } finally {
    clearTimeout(timer);
  }
}

app.get('/health', (_req, res) => {
  res.set('Cache-Control', 'no-store');
  res.json({
    ok: true,
    service: 'code-academy-live-map-api',
    hasPublicMapToken: Boolean(publicMapToken()),
    hasServerMapToken: Boolean(String(process.env.MAPBOX_SECRET_TOKEN || '').trim().startsWith('sk.'))
  });
});

// This endpoint intentionally returns only a pk. public token. Never return an sk. token.
app.get('/api/map-config', (req, res) => {
  setNoStore(res);
  const token = publicMapToken();
  if (!token) {
    return res.status(503).json({
      error: 'Mapbox public token is not configured. Add MAPBOX_PUBLIC_TOKEN (must start with pk.) in Render Environment.'
    });
  }
  return res.json({ mapboxPublicToken: token, provider: 'Mapbox', mapVersion: 'gl-js-v3' });
});

app.get('/api/geocode', searchLimiter, async (req, res, next) => {
  const q = String(req.query.q || '').trim().replace(/[\u0000-\u001f]/g, ' ').slice(0, 160);
  if (q.length < 2) return res.status(400).json({ error: 'Enter at least two characters to search.' });
  const token = backendMapToken();
  if (!token) return res.status(503).json({ error: 'Set MAPBOX_PUBLIC_TOKEN in Render, or set a server-only MAPBOX_SECRET_TOKEN with Geocoding read permission.' });
  try {
    const url = new URL('https://api.mapbox.com/search/geocode/v6/forward');
    url.searchParams.set('q', q);
    url.searchParams.set('limit', '5');
    url.searchParams.set('autocomplete', 'true');
    url.searchParams.set('types', 'country,region,postcode,district,place,locality,neighborhood,street,address');
    const data = await fetchMapbox(url.toString(), token);
    res.set('Cache-Control', 'private, max-age=30');
    return res.json({ features: Array.isArray(data.features) ? data.features.slice(0, 5) : [] });
  } catch (error) { return next(error); }
});

app.get('/api/reverse-geocode', searchLimiter, async (req, res, next) => {
  const lat = Number(req.query.lat);
  const lng = Number(req.query.lng);
  if (!Number.isFinite(lat) || lat < -90 || lat > 90 || !Number.isFinite(lng) || lng < -180 || lng > 180) {
    return res.status(400).json({ error: 'Latitude or longitude is outside the valid range.' });
  }
  const token = backendMapToken();
  if (!token) return res.status(503).json({ error: 'Mapbox server token is not configured.' });
  try {
    const url = new URL('https://api.mapbox.com/search/geocode/v6/reverse');
    url.searchParams.set('latitude', String(lat));
    url.searchParams.set('longitude', String(lng));
    url.searchParams.set('limit', '1');
    const data = await fetchMapbox(url.toString(), token);
    const feature = Array.isArray(data.features) ? data.features[0] : null;
    res.set('Cache-Control', 'no-store');
    return res.json({ label: feature ? getFirstFeatureLabel(feature) : '' });
  } catch (error) { return next(error); }
});

app.use((error, _req, res, _next) => {
  // Do not log token values or user coordinates.
  if (error && /CORS policy/.test(error.message || '')) {
    return res.status(403).json({ error: 'This website origin is not permitted. Update ALLOWED_ORIGINS in Render.' });
  }
  if (error && error.name === 'AbortError') return res.status(504).json({ error: 'Mapbox timed out. Please retry.' });
  const status = Number(error && error.status) || 500;
  if (status >= 500) console.error('[Code Academy Map API]', String(error && error.message || 'Request failed'));
  return res.status(status).json({ error: error && error.message ? error.message : 'Unexpected map API error.' });
});

app.get('/', (_req, res) => res.type('text/plain').send('Code Academy Live Map API is running. Use /health to check service status.'));
app.listen(PORT, '0.0.0.0', () => {
  console.log(`Code Academy Live Map API listening on port ${PORT}`);
});
