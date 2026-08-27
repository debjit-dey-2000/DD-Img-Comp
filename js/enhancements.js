const enhancementElements = Object.fromEntries([
  'compressionPreset', 'skipLargerToggle', 'autoDownloadToggle', 'notificationToggle',
  'compatibilityButton', 'compatibilityDialog', 'compatibilityClose', 'compatibilityAcknowledge', 'compatibilityResults',
  'toolHelpButton', 'helpDialog', 'helpDialogClose', 'helpAcknowledge',
  'bulkRenameButton', 'bulkRenameDialog', 'bulkRenameClose', 'bulkRenamePrefix', 'bulkRenameApply',
  'retryFailedButton', 'errorReportButton', 'undoBar', 'undoMessage', 'undoDeleteButton'
].map(id => [id, document.getElementById(id)]));

const presetQualities = { small: 55, balanced: 80, quality: 92 };
state.preferences.skipLarger ??= true;
state.preferences.autoDownload ??= false;
state.preferences.notifications ??= false;

function presetForQuality(quality) {
  return Object.entries(presetQualities).find(([, value]) => value === quality)?.[0] || 'custom';
}

function syncEnhancementControls() {
  enhancementElements.compressionPreset.value = presetForQuality(state.preferences.quality);
  enhancementElements.skipLargerToggle.checked = state.preferences.skipLarger;
  enhancementElements.autoDownloadToggle.checked = state.preferences.autoDownload;
  enhancementElements.notificationToggle.checked = state.preferences.notifications;
  enhancementElements.retryFailedButton.disabled = state.processing || !state.items.some(item => item.status === 'failed');
  enhancementElements.errorReportButton.disabled = !state.items.some(item => item.status === 'failed' || item.status === 'skipped');
}

const baseRender = render;
render = function enhancedRender(nextState) { baseRender(nextState); syncEnhancementControls(); };
syncEnhancementControls();
persist();

enhancementElements.compressionPreset.addEventListener('change', event => {
  const quality = presetQualities[event.target.value];
  if (!quality) return;
  elements.qualitySlider.value = quality;
  elements.qualitySlider.dispatchEvent(new Event('input', { bubbles: true }));
});
elements.qualitySlider.addEventListener('input', () => {
  enhancementElements.compressionPreset.value = presetForQuality(Number(elements.qualitySlider.value));
});
enhancementElements.skipLargerToggle.addEventListener('change', event => { state.preferences.skipLarger = event.target.checked; persist(); });
enhancementElements.autoDownloadToggle.addEventListener('change', event => { state.preferences.autoDownload = event.target.checked; persist(); });
enhancementElements.notificationToggle.addEventListener('change', async event => {
  if (event.target.checked && 'Notification' in window && Notification.permission === 'default') {
    const permission = await Notification.requestPermission();
    if (permission !== 'granted') event.target.checked = false;
  }
  if (event.target.checked && (!('Notification' in window) || Notification.permission === 'denied')) {
    event.target.checked = false;
    toast('Notifications unavailable', 'Your browser has blocked completion notifications.', 'error');
  }
  state.preferences.notifications = event.target.checked; persist();
});

function openLockedDialog(dialog, focusTarget) {
  dialog.showModal(); syncPopupScrollLock(); requestAnimationFrame(() => focusTarget?.focus());
}

enhancementElements.toolHelpButton.addEventListener('click', () => openLockedDialog(enhancementElements.helpDialog, enhancementElements.helpDialogClose));
[enhancementElements.helpDialogClose, enhancementElements.helpAcknowledge].forEach(button => button.addEventListener('click', () => enhancementElements.helpDialog.close()));

function renderCompatibility() {
  const folderProbe = document.createElement('input'); folderProbe.type = 'file';
  const checks = [
    ['WEBP encoding', supportsWebP()], ['Canvas processing', Boolean(document.createElement('canvas').getContext)],
    ['Fast image decoding', 'createImageBitmap' in window], ['Clipboard image paste', 'ClipboardEvent' in window],
    ['Folder selection', 'webkitdirectory' in folderProbe], ['Completion notifications', 'Notification' in window]
  ];
  enhancementElements.compatibilityResults.replaceChildren(...checks.map(([label, supported]) => {
    const row = document.createElement('div'); row.className = 'compatibility-item';
    const name = document.createElement('span'); name.textContent = label;
    const result = document.createElement('span'); result.className = supported ? 'supported' : 'unsupported'; result.textContent = supported ? 'Supported' : 'Unavailable';
    row.append(name, result); return row;
  }));
}
enhancementElements.compatibilityButton.addEventListener('click', () => { renderCompatibility(); openLockedDialog(enhancementElements.compatibilityDialog, enhancementElements.compatibilityClose); });
[enhancementElements.compatibilityClose, enhancementElements.compatibilityAcknowledge].forEach(button => button.addEventListener('click', () => enhancementElements.compatibilityDialog.close()));

enhancementElements.bulkRenameButton.addEventListener('click', () => {
  if (!state.items.some(item => item.selected)) return;
  openLockedDialog(enhancementElements.bulkRenameDialog, enhancementElements.bulkRenamePrefix); enhancementElements.bulkRenamePrefix.select();
});
enhancementElements.bulkRenameClose.addEventListener('click', () => enhancementElements.bulkRenameDialog.close());
enhancementElements.bulkRenameApply.addEventListener('click', () => {
  const selected = state.items.filter(item => item.selected);
  const prefix = safeFilename(enhancementElements.bulkRenamePrefix.value).replace(/\.webp$/i, '') || 'image';
  const digits = Math.max(2, String(selected.length).length);
  selected.forEach((item, index) => { item.name = `${prefix}-${String(index + 1).padStart(digits, '0')}.webp`; });
  enhancementElements.bulkRenameDialog.close(); render(state);
  toast('Files renamed', `${selected.length} selected image${selected.length === 1 ? '' : 's'} renamed.`, 'success');
});

enhancementElements.retryFailedButton.addEventListener('click', () => {
  const failed = state.items.filter(item => item.status === 'failed');
  failed.forEach(item => { item.status = 'pending'; item.error = ''; item.progress = 0; }); processItems(failed);
});

function downloadTextFile(filename, text) {
  const blob = new Blob([text], { type: 'text/csv;charset=utf-8' }); const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a'); anchor.href = url; anchor.download = filename; anchor.click(); setTimeout(() => URL.revokeObjectURL(url), 1000);
}
enhancementElements.errorReportButton.addEventListener('click', () => {
  const issues = state.items.filter(item => item.status === 'failed' || item.status === 'skipped');
  const escapeCsv = value => `"${String(value ?? '').replace(/"/g, '""')}"`;
  const rows = [['Filename', 'Status', 'Reason', 'Original bytes', 'Processing ms'], ...issues.map(item => [item.name, item.status, item.error, item.file.size, item.processingTime || 0])];
  downloadTextFile(`dd-img-comp-report-${new Date().toISOString().slice(0, 10)}.csv`, rows.map(row => row.map(escapeCsv).join(',')).join('\n'));
});

let undoRecord = null;
let undoTimer = 0;
function finalizeUndo() {
  if (undoRecord) undoRecord.items.forEach(cleanupItem);
  undoRecord = null; clearTimeout(undoTimer); enhancementElements.undoBar.hidden = true;
}
deleteItems = function deleteItemsWithUndo(ids) {
  if (state.processing) { toast('Processing in progress', 'Cancel the current batch before removing images.'); return; }
  finalizeUndo();
  const idSet = new Set(ids); const removed = state.items.filter(item => idSet.has(item.id));
  if (!removed.length) return;
  undoRecord = { items: removed }; state.items = state.items.filter(item => !idSet.has(item.id));
  if (!state.items.length) state.visibleLimit = 10;
  render(state); enhancementElements.undoMessage.textContent = `${removed.length} image${removed.length === 1 ? '' : 's'} removed`; enhancementElements.undoBar.hidden = false;
  undoTimer = setTimeout(finalizeUndo, 7000);
};
enhancementElements.undoDeleteButton.addEventListener('click', () => {
  if (!undoRecord) return;
  const restored = undoRecord.items; undoRecord = null; clearTimeout(undoTimer); enhancementElements.undoBar.hidden = true;
  state.items.push(...restored); state.items.sort((a, b) => a.uploadedAt - b.uploadedAt); render(state);
  toast('Deletion undone', `${restored.length} image${restored.length === 1 ? '' : 's'} restored.`, 'success');
});
window.addEventListener('beforeunload', finalizeUndo);

const baseProcessItems = processItems;
processItems = async function processItemsWithCompletionActions(items) {
  const candidates = items.filter(Boolean); await baseProcessItems(candidates);
  if (!candidates.length || state.processing) return;
  const completed = candidates.filter(item => item.status === 'completed' && item.compressedBlob);
  if (state.preferences.autoDownload && completed.length) {
    if (completed.length === 1) downloadImage(completed[0]); else await zipItems(completed);
  }
  if (state.preferences.notifications && 'Notification' in window && Notification.permission === 'granted') {
    new Notification('DD Img Comp', { body: `${completed.length} image${completed.length === 1 ? '' : 's'} ready to download.`, icon: 'assets/favicon.svg' });
  }
};

document.addEventListener('keydown', event => {
  if (event.key !== '?' || ['INPUT', 'TEXTAREA', 'SELECT'].includes(document.activeElement?.tagName) || document.querySelector('dialog[open]')) return;
  event.preventDefault(); openLockedDialog(enhancementElements.helpDialog, enhancementElements.helpDialogClose);
});

document.querySelectorAll('.faq-section details').forEach(details => {
  const summary = details.querySelector('summary');
  let animation = null;

  function finish(open) {
    details.open = open;
    details.classList.remove('is-closing');
    details.style.height = '';
    details.style.overflow = '';
    animation = null;
  }

  summary.addEventListener('click', event => {
    event.preventDefault();
    if (animation) animation.cancel();

    const startHeight = details.offsetHeight;
    const opening = !details.open;
    if (opening) details.open = true;
    details.classList.toggle('is-closing', !opening);

    const styles = getComputedStyle(details);
    const closedHeight = summary.offsetHeight + parseFloat(styles.paddingTop) + parseFloat(styles.paddingBottom);
    const endHeight = opening ? details.scrollHeight : closedHeight;
    details.style.overflow = 'hidden';

    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      finish(opening);
      return;
    }

    animation = details.animate(
      { height: [`${startHeight}px`, `${endHeight}px`] },
      { duration: 280, easing: 'cubic-bezier(.2,.75,.25,1)' }
    );
    animation.onfinish = () => finish(opening);
    animation.oncancel = () => { animation = null; };
  });
});
