async function decodeImage(item) {
  if ('createImageBitmap' in window) return createImageBitmap(item.file, { imageOrientation: 'from-image' });
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error('Image decoding failed.'));
    image.src = item.originalUrl;
  });
}

let avifEncoderPromise;

async function encodeAvif(context, width, height, quality) {
  avifEncoderPromise ||= import('../vendor/avif/encode.js').then(module => module.default);
  const encode = await avifEncoderPromise;
  const imageData = context.getImageData(0, 0, width, height);
  const buffer = await encode(imageData, { quality, qualityAlpha: quality, speed: 8 });
  return new Blob([buffer], { type: 'image/avif' });
}

function canvasToBlob(canvas, mimeType, quality, context) {
  if (mimeType === 'image/avif') return encodeAvif(context, canvas.width, canvas.height, quality);
  if (typeof canvas.convertToBlob === 'function') {
    return canvas.convertToBlob({ type: mimeType, quality: quality / 100 });
  }
  return new Promise((resolve, reject) => canvas.toBlob(
    blob => blob ? resolve(blob) : reject(new Error(`${outputFormatLabel(mimeType)} encoding is unavailable or failed.`)),
    mimeType, quality / 100
  ));
}

function renderPlan(sourceWidth, sourceHeight, transform = {}) {
  const mode = transform.mode || 'none';
  let targetWidth = Number(transform.width) || 0;
  let targetHeight = Number(transform.height) || 0;
  if (mode === 'none' || (!targetWidth && !targetHeight)) {
    return { width: sourceWidth, height: sourceHeight, sx: 0, sy: 0, sw: sourceWidth, sh: sourceHeight };
  }
  if (!targetWidth) targetWidth = Math.round(targetHeight * sourceWidth / sourceHeight);
  if (!targetHeight) targetHeight = Math.round(targetWidth * sourceHeight / sourceWidth);
  targetWidth = Math.max(1, Math.min(12000, Math.round(targetWidth)));
  targetHeight = Math.max(1, Math.min(12000, Math.round(targetHeight)));
  if (targetWidth * targetHeight > 100_000_000) throw new Error('Custom dimensions exceed the 100 megapixel safety limit.');

  if (mode === 'fit') {
    const scale = Math.min(targetWidth / sourceWidth, targetHeight / sourceHeight);
    return { width: Math.max(1, Math.round(sourceWidth * scale)), height: Math.max(1, Math.round(sourceHeight * scale)), sx: 0, sy: 0, sw: sourceWidth, sh: sourceHeight };
  }
  if (mode === 'cover') {
    const sourceRatio = sourceWidth / sourceHeight;
    const targetRatio = targetWidth / targetHeight;
    let sx = 0; let sy = 0; let sw = sourceWidth; let sh = sourceHeight;
    if (sourceRatio > targetRatio) { sw = sourceHeight * targetRatio; sx = (sourceWidth - sw) / 2; }
    else { sh = sourceWidth / targetRatio; sy = (sourceHeight - sh) / 2; }
    return { width: targetWidth, height: targetHeight, sx, sy, sw, sh };
  }
  return { width: targetWidth, height: targetHeight, sx: 0, sy: 0, sw: sourceWidth, sh: sourceHeight };
}

async function compressImage(item, quality, options = {}, onProgress = () => {}) {
  const started = performance.now();
  let source;
  let canvas;
  try {
    onProgress(12);
    await nextFrame();
    source = await decodeImage(item);
    const sourceWidth = source.width || source.naturalWidth;
    const sourceHeight = source.height || source.naturalHeight;
    if (!sourceWidth || !sourceHeight) throw new Error('Image dimensions are invalid.');
    const plan = renderPlan(sourceWidth, sourceHeight, options.transform);
    const mimeType = options.mimeType || 'image/webp';

    onProgress(40);
    await nextFrame();
    canvas = typeof OffscreenCanvas !== 'undefined'
      ? new OffscreenCanvas(plan.width, plan.height)
      : document.createElement('canvas');
    canvas.width = plan.width; canvas.height = plan.height;
    const context = canvas.getContext('2d', { alpha: true, desynchronized: true });
    if (!context) throw new Error('Canvas rendering is not supported.');
    context.imageSmoothingEnabled = true;
    context.imageSmoothingQuality = 'high';
    if (mimeType === 'image/jpeg') {
      context.fillStyle = '#fff';
      context.fillRect(0, 0, plan.width, plan.height);
    }
    context.drawImage(source, plan.sx, plan.sy, plan.sw, plan.sh, 0, 0, plan.width, plan.height);

    onProgress(72);
    await nextFrame();
    const blob = await canvasToBlob(canvas, mimeType, Math.max(1, Math.min(100, quality)), context);
    if (blob.type !== mimeType) throw new Error(`${outputFormatLabel(mimeType)} encoding is not supported by this browser.`);
    onProgress(100);
    return { blob, width: plan.width, height: plan.height, time: performance.now() - started };
  } catch (error) {
    throw new Error(error.message || 'Compression failed.');
  } finally {
    if (source && typeof source.close === 'function') source.close();
    if (canvas) { canvas.width = 1; canvas.height = 1; }
  }
}
