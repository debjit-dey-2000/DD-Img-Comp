const ACCEPTED_TYPES = new Set(['image/png', 'image/jpeg', 'image/avif']);
const MAX_IMAGES = 200;
const MAX_FILE_SIZE = 100 * 1024 * 1024;

const uid = () => `${Date.now().toString(36)}-${crypto.getRandomValues(new Uint32Array(1))[0].toString(36)}`;

function formatBytes(bytes = 0) {
  if (!Number.isFinite(bytes) || bytes <= 0) return '0 B';
  const units = ['B', 'KB', 'MB', 'GB'];
  const index = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), units.length - 1);
  const value = bytes / (1024 ** index);
  return `${value.toFixed(index === 0 ? 0 : value >= 10 ? 1 : 2)} ${units[index]}`;
}

function formatDuration(ms = 0) {
  if (ms < 1000) return `${Math.round(ms)} ms`;
  return `${(ms / 1000).toFixed(2)} s`;
}

function formatSpeed(bytes = 0, milliseconds = 0) {
  if (!bytes || !milliseconds) return '0 MB/s';
  const megabytesPerSecond = (bytes / 1_000_000) / (milliseconds / 1000);
  return `${megabytesPerSecond.toFixed(megabytesPerSecond >= 10 ? 1 : 2)} MB/s`;
}

function webpName(name) {
  return `${name.replace(/\.[^.]+$/, '') || 'image'}.webp`;
}

function safeFilename(name) {
  return name.replace(/[\\/:*?"<>|\u0000-\u001F]/g, '-').replace(/\s+/g, ' ').trim().slice(0, 180) || 'image.webp';
}

function compressionPercent(original, compressed) {
  if (!original || !compressed) return 0;
  return Math.round((1 - compressed / original) * 100);
}

function nextFrame() {
  return new Promise(resolve => requestAnimationFrame(() => resolve()));
}

function debounce(fn, delay = 160) {
  let timer;
  return (...args) => {
    clearTimeout(timer);
    timer = setTimeout(() => fn(...args), delay);
  };
}

function supportsWebP() {
  try {
    const canvas = document.createElement('canvas');
    canvas.width = canvas.height = 1;
    return canvas.toDataURL('image/webp').startsWith('data:image/webp');
  } catch { return false; }
}

function createRipple(event) {
  const button = event.target.closest('.button');
  if (!button || button.disabled) return;
  const rect = button.getBoundingClientRect();
  const size = Math.max(rect.width, rect.height);
  const ripple = document.createElement('span');
  ripple.className = 'ripple';
  ripple.style.cssText = `width:${size}px;height:${size}px;left:${event.clientX - rect.left - size / 2}px;top:${event.clientY - rect.top - size / 2}px`;
  button.append(ripple);
  ripple.addEventListener('animationend', () => ripple.remove(), { once: true });
}
