import { getStore } from '@netlify/blobs';

const json = (body, status = 200) => Response.json(body, {
  status,
  headers: { 'Cache-Control': 'no-store' }
});

const validInteger = (value, min, max) => Number.isInteger(value) && value >= min && value <= max;

export default async (request) => {
  if (request.method !== 'POST') return json({ error: 'Method not allowed' }, 405);

  let payload;
  try { payload = await request.json(); }
  catch { return json({ error: 'Invalid JSON body' }, 400); }

  const { imageCount, originalBytes, compressedBytes, processingMs } = payload || {};
  const valid = validInteger(imageCount, 1, 200)
    && validInteger(originalBytes, 1, 40_000_000_000)
    && validInteger(compressedBytes, 1, 40_000_000_000)
    && Number.isFinite(processingMs) && processingMs > 0 && processingMs <= 86_400_000;

  if (!valid) return json({ error: 'Invalid compression metrics' }, 400);

  const createdAt = new Date().toISOString();
  const event = {
    imageCount,
    originalBytes,
    compressedBytes,
    savedBytes: Math.max(0, originalBytes - compressedBytes),
    processingMs: Math.round(processingMs),
    createdAt
  };

  const store = getStore('dd-img-comp-analytics');
  await store.setJSON(`events/${createdAt}/${crypto.randomUUID()}`, event);
  return json({ stored: true }, 202);
};
