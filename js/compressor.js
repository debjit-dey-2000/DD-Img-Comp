async function decodeImage(item) {
  if ('createImageBitmap' in window) return createImageBitmap(item.file, { imageOrientation: 'from-image' });
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error('Image decoding failed.'));
    image.src = item.originalUrl;
  });
}

function canvasToBlob(canvas, quality) {
  if (typeof canvas.convertToBlob === 'function') {
    return canvas.convertToBlob({ type: 'image/webp', quality: quality / 100 });
  }
  return new Promise((resolve, reject) => canvas.toBlob(
    blob => blob ? resolve(blob) : reject(new Error('WEBP encoding is unavailable or failed.')),
    'image/webp', quality / 100
  ));
}

async function compressImage(item, quality, onProgress = () => {}) {
  const started = performance.now();
  let source;
  let canvas;
  try {
    onProgress(12);
    await nextFrame();
    source = await decodeImage(item);
    const width = source.width || source.naturalWidth;
    const height = source.height || source.naturalHeight;
    if (!width || !height) throw new Error('Image dimensions are invalid.');

    onProgress(40);
    await nextFrame();
    canvas = typeof OffscreenCanvas !== 'undefined'
      ? new OffscreenCanvas(width, height)
      : document.createElement('canvas');
    canvas.width = width; canvas.height = height;
    const context = canvas.getContext('2d', { alpha: true, desynchronized: true });
    if (!context) throw new Error('Canvas rendering is not supported.');
    context.imageSmoothingEnabled = true;
    context.imageSmoothingQuality = 'high';
    context.drawImage(source, 0, 0, width, height);

    onProgress(72);
    await nextFrame();
    const blob = await canvasToBlob(canvas, Math.max(1, Math.min(100, quality)));
    onProgress(100);
    return { blob, width, height, time: performance.now() - started };
  } catch (error) {
    throw new Error(error.message || 'Compression failed.');
  } finally {
    if (source && typeof source.close === 'function') source.close();
    if (canvas) { canvas.width = 1; canvas.height = 1; }
  }
}
