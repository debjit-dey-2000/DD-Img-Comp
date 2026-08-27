const extensionPattern = /\.(png|jpe?g|avif|webp)$/i;

function validateFile(file) {
  if (!(file instanceof File)) return 'Not a valid file.';
  if (!ACCEPTED_TYPES.has(file.type) && !extensionPattern.test(file.name)) return 'Unsupported format. Use PNG, JPG, JPEG, AVIF, or WEBP.';
  if (file.size > MAX_FILE_SIZE) return 'File is larger than the 100 MB safety limit.';
  if (file.size === 0) return 'The file is empty.';
  return null;
}

function fileSignature(file) {
  return `${file.name.toLowerCase()}::${file.size}::${file.lastModified}`;
}

function ingestFiles(fileList, existingItems, outputFormat = 'image/webp') {
  const accepted = [];
  const rejected = [];
  const signatures = new Set(existingItems.map(item => item.signature));
  const capacity = Math.max(0, MAX_IMAGES - existingItems.length);

  for (const file of Array.from(fileList || [])) {
    if (accepted.length >= capacity) {
      rejected.push({ file, reason: `The ${MAX_IMAGES}-image limit has been reached.` });
      continue;
    }
    const error = validateFile(file);
    const signature = fileSignature(file);
    if (error) rejected.push({ file, reason: error });
    else if (signatures.has(signature)) rejected.push({ file, reason: 'Duplicate image skipped.' });
    else {
      signatures.add(signature);
      accepted.push({
        id: uid(), file, signature, name: outputFilename(file.name, outputFormat), width: 0, height: 0,
        originalUrl: URL.createObjectURL(file), compressedUrl: '', compressedBlob: null,
        status: 'pending', selected: false, qualityOverride: null, progress: 0,
        processingTime: 0, error: '', uploadedAt: Date.now() + accepted.length
      });
    }
  }
  return { accepted, rejected };
}

async function readDimensions(item) {
  try {
    if ('createImageBitmap' in window) {
      const bitmap = await createImageBitmap(item.file);
      const dimensions = { width: bitmap.width, height: bitmap.height };
      bitmap.close();
      return dimensions;
    }
    return await new Promise((resolve, reject) => {
      const image = new Image();
      image.onload = () => resolve({ width: image.naturalWidth, height: image.naturalHeight });
      image.onerror = () => reject(new Error('The image could not be decoded.'));
      image.src = item.originalUrl;
    });
  } catch {
    throw new Error('This image is corrupted or its format is not supported by this browser.');
  }
}

function cleanupItem(item) {
  if (item.originalUrl) URL.revokeObjectURL(item.originalUrl);
  if (item.compressedUrl) URL.revokeObjectURL(item.compressedUrl);
}
