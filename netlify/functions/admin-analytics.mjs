import { getStore } from '@netlify/blobs';
import { scryptSync, timingSafeEqual } from 'node:crypto';

const DEFAULT_EMAIL = 'deydebjit2000@gmail.com';
const DEFAULT_SALT = '813d936ee64098574d8f87efc20f16eb';
const DEFAULT_HASH = '6e0b64182d8c0458b17981bf779748fbf0e918ddb8546bce62431c56d6dcee219b29a08dba9fb0cd346928c5407d00a4423e081e538a191bbf26ab660a52665d';

const json = (body, status = 200) => Response.json(body, {
  status,
  headers: { 'Cache-Control': 'no-store, private', 'X-Content-Type-Options': 'nosniff' }
});

function isAuthorized(request) {
  const header = request.headers.get('authorization') || '';
  if (!header.startsWith('Basic ')) return false;
  try {
    const decoded = Buffer.from(header.slice(6), 'base64').toString('utf8');
    const separator = decoded.indexOf(':');
    if (separator < 0) return false;
    const email = decoded.slice(0, separator);
    const password = decoded.slice(separator + 1);
    const expectedEmail = process.env.ADMIN_EMAIL || DEFAULT_EMAIL;
    const salt = process.env.ADMIN_PASSWORD_SALT || DEFAULT_SALT;
    const expectedHash = Buffer.from(process.env.ADMIN_PASSWORD_HASH || DEFAULT_HASH, 'hex');
    const actualHash = scryptSync(password, salt, expectedHash.length);
    return email === expectedEmail && timingSafeEqual(actualHash, expectedHash);
  } catch { return false; }
}

function startOfBucket(date, period) {
  const value = new Date(date);
  if (period === 'monthly') return `${value.getUTCFullYear()}-${String(value.getUTCMonth() + 1).padStart(2, '0')}`;
  if (period === 'weekly') {
    const day = (value.getUTCDay() + 6) % 7;
    value.setUTCDate(value.getUTCDate() - day);
  }
  return value.toISOString().slice(0, 10);
}

function rangeStart(period) {
  const value = new Date();
  if (period === 'daily') value.setUTCDate(value.getUTCDate() - 29);
  if (period === 'weekly') value.setUTCDate(value.getUTCDate() - (7 * 11));
  if (period === 'monthly') value.setUTCMonth(value.getUTCMonth() - 11, 1);
  value.setUTCHours(0, 0, 0, 0);
  return value;
}

function aggregate(events, period) {
  const cutoff = rangeStart(period);
  const relevant = events.filter(event => new Date(event.createdAt) >= cutoff);
  const buckets = new Map();
  const empty = () => ({ imageCount: 0, originalBytes: 0, compressedBytes: 0, savedBytes: 0, processingMs: 0, sessions: 0 });

  relevant.forEach(event => {
    const key = startOfBucket(event.createdAt, period);
    const bucket = buckets.get(key) || empty();
    bucket.imageCount += event.imageCount;
    bucket.originalBytes += event.originalBytes;
    bucket.compressedBytes += event.compressedBytes;
    bucket.savedBytes += event.savedBytes;
    bucket.processingMs += event.processingMs;
    bucket.sessions += 1;
    buckets.set(key, bucket);
  });

  const summary = relevant.reduce((total, event) => ({
    imageCount: total.imageCount + event.imageCount,
    originalBytes: total.originalBytes + event.originalBytes,
    compressedBytes: total.compressedBytes + event.compressedBytes,
    savedBytes: total.savedBytes + event.savedBytes,
    processingMs: total.processingMs + event.processingMs,
    sessions: total.sessions + 1
  }), empty());

  return {
    summary,
    series: Array.from(buckets, ([label, values]) => ({ label, ...values })).sort((a, b) => a.label.localeCompare(b.label)),
    recent: relevant.sort((a, b) => b.createdAt.localeCompare(a.createdAt)).slice(0, 50)
  };
}

export default async (request) => {
  if (request.method !== 'GET') return json({ error: 'Method not allowed' }, 405);
  if (!isAuthorized(request)) {
    await new Promise(resolve => setTimeout(resolve, 350));
    return json({ error: 'Invalid email or password' }, 401);
  }

  const period = new URL(request.url).searchParams.get('period') || 'daily';
  if (!['daily', 'weekly', 'monthly'].includes(period)) return json({ error: 'Invalid period' }, 400);

  const store = getStore('dd-img-comp-analytics');
  const { blobs } = await store.list({ prefix: 'events/' });
  const events = (await Promise.all(blobs.map(blob => store.get(blob.key, { type: 'json' })))).filter(Boolean);
  return json({ period, generatedAt: new Date().toISOString(), ...aggregate(events, period) });
};
