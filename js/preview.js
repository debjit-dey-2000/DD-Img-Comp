function setComparisonPosition(element, percentage) {
  const value = Math.max(2, Math.min(98, percentage));
  element.dataset.position = String(value);
  element.querySelector('.after-layer').style.clipPath = `inset(0 0 0 ${value}%)`;
  element.querySelector('.compare-handle').style.left = `${value}%`;
}

function bindComparison(element) {
  setComparisonPosition(element, Number(element.dataset.position || 50));
  const move = clientX => {
    const rect = element.getBoundingClientRect();
    setComparisonPosition(element, ((clientX - rect.left) / rect.width) * 100);
  };
  element.addEventListener('pointerdown', event => {
    element.setPointerCapture(event.pointerId);
    move(event.clientX);
  });
  element.addEventListener('pointermove', event => {
    if (element.hasPointerCapture(event.pointerId)) move(event.clientX);
  });
  element.addEventListener('keydown', event => {
    if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return;
    event.preventDefault();
    const current = Number(element.dataset.position || 50);
    setComparisonPosition(element, event.key === 'Home' ? 2 : event.key === 'End' ? 98 : current + (event.key === 'ArrowLeft' ? -5 : 5));
  });
}

function openPreview(dialog, item) {
  const title = dialog.querySelector('#dialogTitle');
  const meta = dialog.querySelector('#dialogMeta');
  const host = dialog.querySelector('#dialogCompare');
  title.textContent = item.name;
  meta.textContent = `${item.width || '?'} × ${item.height || '?'} · ${item.status}`;
  host.replaceChildren();
  const comparison = document.createElement('div');
  comparison.className = 'comparison';
  comparison.innerHTML = `<img class="before-image" alt="Original full-size preview"><div class="after-layer"><img class="after-image" alt="Compressed full-size preview"></div><span class="compare-label before-label">Before</span><span class="compare-label after-label">After</span><div class="compare-handle"><span>↔</span></div><div class="preview-placeholder"><span>Compress this image to compare results</span></div>`;
  comparison.querySelector('.before-image').src = item.originalUrl;
  if (item.compressedUrl) {
    comparison.querySelector('.after-image').src = item.compressedUrl;
    comparison.querySelector('.preview-placeholder').remove();
  }
  host.append(comparison);
  bindComparison(comparison);
  dialog.showModal();
  syncPopupScrollLock();
}
