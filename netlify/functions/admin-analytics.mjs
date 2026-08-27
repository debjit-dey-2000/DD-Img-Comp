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

function parseDate(value, endOfDay = false) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value || '')) return null;
  const date = new Date(`${value}T${endOfDay ? '23:59:59.999' : '00:00:00.000'}Z`);
  return Number.isNaN(date.getTime()) ? null : date;
}

function aggregate(events, period, options = {}) {
  const cutoff = options.from || (options.to ? new Date(0) : rangeStart(period));
  const end = options.to || new Date('9999-12-31T23:59:59.999Z');
  const relevant = events.filter(event => {
    const createdAt = new Date(event.createdAt);
    return createdAt >= cutoff && createdAt <= end;
  });
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

  const ordered = [...relevant].sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  const totalItems = ordered.length;
  const totalPages = Math.max(1, Math.ceil(totalItems / options.pageSize));
  const page = Math.min(options.page, totalPages);
  const offset = (page - 1) * options.pageSize;

  return {
    summary,
    series: Array.from(buckets, ([label, values]) => ({ label, ...values })).sort((a, b) => a.label.localeCompare(b.label)),
    recent: ordered.slice(offset, offset + options.pageSize),
    pagination: { page, pageSize: options.pageSize, totalItems, totalPages }
  };
}

export { aggregate, parseDate };

export default async (request) => {
  if (request.method !== 'GET') return json({ error: 'Method not allowed' }, 405);
  if (!isAuthorized(request)) {
    await new Promise(resolve => setTimeout(resolve, 350));
    return json({ error: 'Invalid email or password' }, 401);
  }

  const params = new URL(request.url).searchParams;
  const period = params.get('period') || 'daily';
  if (!['daily', 'weekly', 'monthly'].includes(period)) return json({ error: 'Invalid period' }, 400);
  const page = Math.max(1, Number.parseInt(params.get('page') || '1', 10));
  const pageSize = Math.min(100, Math.max(5, Number.parseInt(params.get('pageSize') || '10', 10)));
  if (!Number.isInteger(page) || !Number.isInteger(pageSize)) return json({ error: 'Invalid pagination' }, 400);
  const from = params.has('from') ? parseDate(params.get('from')) : null;
  const to = params.has('to') ? parseDate(params.get('to'), true) : null;
  if ((params.has('from') && !from) || (params.has('to') && !to) || (from && to && from > to)) return json({ error: 'Invalid date range' }, 400);
  if (from && to && to - from > 10 * 366 * 86_400_000) return json({ error: 'Date range cannot exceed 10 years' }, 400);

  const store = getStore('dd-img-comp-analytics');
  const { blobs } = await store.list({ prefix: 'events/' });
  const events = (await Promise.all(blobs.map(blob => store.get(blob.key, { type: 'json' })))).filter(Boolean);
  return json({
    period,
    range: { from: from?.toISOString() || null, to: to?.toISOString() || null },
    generatedAt: new Date().toISOString(),
    ...aggregate(events, period, { from, to, page, pageSize })
  });
};
