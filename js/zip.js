function uniqueName(name, used) {
  const safe = safeFilename(name);
  if (!used.has(safe.toLowerCase())) { used.add(safe.toLowerCase()); return safe; }
  const base = safe.replace(/\.webp$/i, '');
  let index = 2;
  while (used.has(`${base}-${index}.webp`.toLowerCase())) index += 1;
  const result = `${base}-${index}.webp`;
  used.add(result.toLowerCase());
  return result;
}

function downloadImage(item) {
  if (!item.compressedBlob) throw new Error('Compress this image before downloading.');
  if (typeof window.saveAs === 'function') window.saveAs(item.compressedBlob, safeFilename(item.name));
  else {
    const anchor = document.createElement('a');
    anchor.href = item.compressedUrl;
    anchor.download = safeFilename(item.name);
    anchor.click();
  }
}

async function downloadZip(items, onProgress = () => {}) {
  const ready = items.filter(item => item.compressedBlob);
  if (!ready.length) throw new Error('No compressed images are ready to download.');
  if (!window.JSZip) throw new Error('ZIP support did not load. Check your connection and try again.');
  const zip = new window.JSZip();
  const used = new Set();
  ready.forEach(item => zip.file(uniqueName(item.name, used), item.compressedBlob));
  const blob = await zip.generateAsync({ type: 'blob', compression: 'STORE', streamFiles: true }, metadata => onProgress(Math.round(metadata.percent)));
  const filename = `dd-img-comp-${new Date().toISOString().slice(0, 10)}.zip`;
  if (typeof window.saveAs === 'function') window.saveAs(blob, filename);
  else {
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url; anchor.download = filename; anchor.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
}
