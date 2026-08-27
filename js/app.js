const state = {
  items: [], preferences: loadPreferences(), search: '', filter: 'all', sort: 'upload',
  processing: false, paused: false, cancelled: false, visibleLimit: 10
};

applyPreferences(state.preferences);
render(state);

document.body.classList.add('welcome-modal-open');
elements.welcomeDialog.showModal();
syncPopupScrollLock();
let welcomeStarting = false;

function revealWebsite() {
  document.body.classList.remove('welcome-pending');
  document.body.classList.add('site-revealed');
  setTimeout(() => document.body.classList.remove('site-revealed'), 800);
}

function closeWelcomeDialog() {
  if (elements.welcomeDialog.open) elements.welcomeDialog.close();
}

elements.welcomeClose.addEventListener('click', closeWelcomeDialog);
elements.welcomeContinue.addEventListener('click', () => {
  if (welcomeStarting) return;
  welcomeStarting = true;
  elements.welcomeContinue.disabled = true;
  elements.welcomeDialog.classList.add('is-loading');
  elements.welcomeDialog.setAttribute('aria-busy', 'true');
  setTimeout(closeWelcomeDialog, 600);
});
elements.welcomeDialog.addEventListener('close', () => {
  document.body.classList.remove('welcome-modal-open');
  revealWebsite();
});

if (!supportsWebP()) {
  toast('Browser not supported', 'This browser cannot encode WEBP images. Try a current version of Chrome, Edge, Firefox, or Safari.', 'error');
  elements.compressAllButton.disabled = true;
}

function persist() { savePreferences(state.preferences); }
function findItem(id) { return state.items.find(item => item.id === id); }

async function addFiles(files) {
  const wasEmpty = state.items.length === 0;
  const { accepted, rejected } = ingestFiles(files, state.items);
  state.items.push(...accepted);
  if (wasEmpty) state.visibleLimit = 10;
  render(state);
  if (wasEmpty && accepted.length) requestAnimationFrame(() => elements.queueSection.scrollIntoView({ behavior: state.preferences.animations ? 'smooth' : 'auto', block: 'start' }));
  if (accepted.length) toast('Images added', `${accepted.length} image${accepted.length === 1 ? '' : 's'} ready to compress.`, 'success');
  if (rejected.length) {
    const duplicates = rejected.filter(entry => entry.reason.includes('Duplicate')).length;
    toast(`${rejected.length} file${rejected.length === 1 ? '' : 's'} skipped`, duplicates === rejected.length ? 'Duplicate images were ignored.' : rejected[0].reason, 'error');
  }
  let nextIndex = 0;
  const decodeWorker = async () => {
    while (nextIndex < accepted.length) {
      const item = accepted[nextIndex++];
      try {
        Object.assign(item, await readDimensions(item));
        refreshItemDimensions(item);
      } catch (error) {
        item.status = 'failed'; item.error = error.message;
        refreshItem(state, item);
      }
      await new Promise(resolve => setTimeout(resolve, 0));
    }
  };
  await Promise.all(Array.from({ length: Math.min(4, accepted.length) }, decodeWorker));
  renderStats(state.items);
}

function invalidate(item) {
  if (item.compressedUrl) URL.revokeObjectURL(item.compressedUrl);
  item.compressedUrl = ''; item.compressedBlob = null; item.status = 'pending'; item.progress = 0; item.error = '';
}

async function waitWhilePaused() {
  while (state.paused && !state.cancelled) await new Promise(resolve => setTimeout(resolve, 120));
}

async function recordCompressionAnalytics(processedItems) {
  const completedItems = processedItems.filter(item => item.status === 'completed' && item.compressedBlob);
  if (!completedItems.length) return;
  const payload = completedItems.reduce((totals, item) => ({
    imageCount: totals.imageCount + 1,
    originalBytes: totals.originalBytes + item.file.size,
    compressedBytes: totals.compressedBytes + item.compressedBlob.size,
    processingMs: totals.processingMs + item.processingTime
  }), { imageCount: 0, originalBytes: 0, compressedBytes: 0, processingMs: 0 });

  try {
    await fetch('/.netlify/functions/record-compression', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
      keepalive: true
    });
  } catch {
    // Analytics must never interrupt or delay local image compression.
  }
}

function compressionConcurrency(items) {
  const hardwareThreads = navigator.hardwareConcurrency || 4;
  const deviceMemory = navigator.deviceMemory;
  const averageSize = items.reduce((sum, item) => sum + item.file.size, 0) / Math.max(1, items.length);
  const averagePixels = items.reduce((sum, item) => sum + (item.width * item.height || 0), 0) / Math.max(1, items.length);
  let limit = hardwareThreads >= 8 ? 4 : hardwareThreads >= 4 ? 3 : 2;
  if (deviceMemory && deviceMemory <= 4) limit = Math.min(limit, 2);
  if (averageSize > 12 * 1024 * 1024) limit = Math.min(limit, 2);
  if (averagePixels > 10_000_000) limit = Math.min(limit, 2);
  if (averagePixels > 30_000_000) limit = 1;
  if (averageSize > 30 * 1024 * 1024) limit = 1;
  return Math.min(limit, items.length);
}

async function processItems(items) {
  if (state.processing || !items.length) return;
  state.processing = true; state.cancelled = false; state.paused = false;
  elements.pauseButton.textContent = 'Pause';
  render(state);
  const concurrency = compressionConcurrency(items);
  const progressById = new Map(items.map(item => [item.id, 0]));
  const activeNames = new Set();
  let nextIndex = 0;
  let completed = 0;

  const updateOverallProgress = () => {
    const totalProgress = Array.from(progressById.values()).reduce((sum, value) => sum + value, 0);
    const percent = Math.round(totalProgress / items.length);
    const title = state.paused
      ? 'Processing paused'
      : activeNames.size > 1 ? `Compressing ${activeNames.size} images in parallel…`
        : activeNames.size === 1 ? `Compressing ${activeNames.values().next().value}` : 'Preparing images…';
    updateProgress(completed, items.length, title, percent);
  };

  const worker = async () => {
    while (nextIndex < items.length) {
      await waitWhilePaused();
      if (state.cancelled) return;
      const item = items[nextIndex++];
      activeNames.add(item.name);
      item.status = 'processing'; item.progress = 5; item.error = '';
      progressById.set(item.id, 5);
      refreshItem(state, item);
      updateOverallProgress();
      try {
        const quality = item.qualityOverride ?? state.preferences.quality;
        const result = await compressImage(item, quality, progress => {
          item.progress = progress;
          progressById.set(item.id, progress);
          updateOverallProgress();
          const bar = elements.imageGrid.querySelector(`[data-id="${item.id}"] .item-progress span`);
          if (bar) bar.style.width = `${progress}%`;
        });
        if (item.compressedUrl) URL.revokeObjectURL(item.compressedUrl);
        item.compressedBlob = result.blob;
        item.compressedUrl = URL.createObjectURL(result.blob);
        item.width = result.width; item.height = result.height; item.processingTime = result.time;
        item.status = 'completed'; item.progress = 100;
        progressById.set(item.id, 100);
      } catch (error) {
        item.status = 'failed'; item.progress = 0; item.error = error.message;
        progressById.set(item.id, 100);
      }
      activeNames.delete(item.name);
      completed += 1;
      refreshItem(state, item);
      updateOverallProgress();
    }
  };

  await Promise.all(Array.from({ length: concurrency }, worker));
  void recordCompressionAnalytics(items);
  state.processing = false; state.paused = false;
  const wasCancelled = state.cancelled;
  state.cancelled = false;
  updateProgress(completed, items.length, wasCancelled ? 'Processing cancelled' : 'Processing complete', Math.round(completed / items.length * 100));
  render(state);
  setTimeout(() => { if (!state.processing) hideProgress(); }, 1400);
  const failures = items.filter(item => item.status === 'failed').length;
  toast(wasCancelled ? 'Batch cancelled' : 'Batch complete', failures ? `${failures} image${failures === 1 ? '' : 's'} failed to compress.` : `${completed} image${completed === 1 ? '' : 's'} processed locally.`, failures ? 'error' : 'success');
}

function deleteItems(ids) {
  if (state.processing) { toast('Processing in progress', 'Cancel the current batch before removing images.'); return; }
  const set = new Set(ids);
  state.items.filter(item => set.has(item.id)).forEach(cleanupItem);
  state.items = state.items.filter(item => !set.has(item.id));
  if (!state.items.length) state.visibleLimit = 10;
  render(state);
}

async function zipItems(items) {
  try {
    updateProgress(0, items.length, 'Building ZIP archive…', 0);
    await downloadZip(items, percent => updateProgress(items.length, items.length, 'Building ZIP archive…', percent));
    toast('Download ready', 'Your WEBP archive has been created.', 'success');
  } catch (error) { toast('Download failed', error.message, 'error'); }
  finally { setTimeout(hideProgress, 800); }
}

elements.browseButton.addEventListener('click', event => { event.stopPropagation(); elements.fileInput.click(); });
elements.folderButton.addEventListener('click', event => { event.stopPropagation(); elements.folderInput.click(); });
elements.dropZone.addEventListener('click', event => { if (!event.target.closest('button')) elements.fileInput.click(); });
elements.dropZone.addEventListener('keydown', event => {
  if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); elements.fileInput.click(); }
});
elements.fileInput.addEventListener('change', event => { addFiles(event.target.files); event.target.value = ''; });
elements.folderInput.addEventListener('change', event => { addFiles(event.target.files); event.target.value = ''; });
['dragenter', 'dragover'].forEach(type => elements.dropZone.addEventListener(type, event => { event.preventDefault(); elements.dropZone.classList.add('dragover'); }));
['dragleave', 'drop'].forEach(type => elements.dropZone.addEventListener(type, event => { event.preventDefault(); elements.dropZone.classList.remove('dragover'); }));
elements.dropZone.addEventListener('drop', event => addFiles(event.dataTransfer.files));
document.addEventListener('paste', event => {
  const directFiles = Array.from(event.clipboardData?.files || []);
  const itemFiles = Array.from(event.clipboardData?.items || [])
    .filter(item => item.kind === 'file')
    .map(item => item.getAsFile())
    .filter(Boolean);
  const files = directFiles.length ? directFiles : itemFiles;
  if (files.length) { event.preventDefault(); addFiles(files); }
});

const applyGlobalQuality = debounce(() => {
  state.items.filter(item => item.qualityOverride === null && item.status === 'completed').forEach(invalidate);
  render(state);
}, 240);
elements.qualitySlider.addEventListener('input', event => {
  state.preferences.quality = Number(event.target.value);
  elements.qualityOutput.textContent = `${event.target.value}%`;
  setRangeFill(event.target); persist(); applyGlobalQuality();
});

elements.compressAllButton.addEventListener('click', () => processItems([...state.items]));
elements.compressSelectedButton.addEventListener('click', () => processItems(state.items.filter(item => item.selected)));
elements.pauseButton.addEventListener('click', () => {
  state.paused = !state.paused;
  elements.pauseButton.textContent = state.paused ? 'Resume' : 'Pause';
  elements.progressTitle.textContent = state.paused ? 'Processing paused' : 'Resuming…';
});
elements.cancelButton.addEventListener('click', () => { state.cancelled = true; state.paused = false; });

elements.imageGrid.addEventListener('input', event => {
  const card = event.target.closest('.image-card');
  const item = findItem(card?.dataset.id);
  if (!item) return;
  if (event.target.matches('.select-image')) {
    item.selected = event.target.checked;
    card.classList.toggle('selected', item.selected);
    refreshSelectionState(state);
  }
  if (event.target.matches('.card-quality')) {
    item.qualityOverride = Number(event.target.value); setRangeFill(event.target);
    card.querySelector('.individual-quality output').textContent = `${event.target.value}%`;
    card.querySelector('.reset-quality').hidden = false;
  }
});
elements.imageGrid.addEventListener('change', event => {
  if (!event.target.matches('.card-quality')) return;
  const item = findItem(event.target.closest('.image-card')?.dataset.id);
  if (item?.status === 'completed') { invalidate(item); render(state); }
});
elements.imageGrid.addEventListener('click', event => {
  const card = event.target.closest('.image-card');
  const item = findItem(card?.dataset.id);
  if (!item) return;
  if (event.target.closest('.delete-one')) deleteItems([item.id]);
  else if (event.target.closest('.compress-one')) processItems([item]);
  else if (event.target.closest('.download-one')) { try { downloadImage(item); } catch (error) { toast('Download failed', error.message, 'error'); } }
  else if (event.target.closest('.full-preview')) openPreview(elements.previewDialog, item);
  else if (event.target.closest('.reset-quality')) { item.qualityOverride = null; if (item.status === 'completed') invalidate(item); render(state); }
  else if (event.target.closest('.rename-one')) {
    const proposed = prompt('Rename WEBP file:', item.name);
    if (proposed !== null) { item.name = webpName(safeFilename(proposed)); render(state); }
  }
});

elements.selectAllCheckbox.addEventListener('change', event => { state.items.forEach(item => { item.selected = event.target.checked; }); render(state); });
elements.searchInput.addEventListener('input', debounce(event => { state.search = event.target.value; state.visibleLimit = 10; render(state); }, 100));
elements.filterSelect.addEventListener('change', event => { state.filter = event.target.value; state.visibleLimit = 10; render(state); });
elements.sortSelect.addEventListener('change', event => { state.sort = event.target.value; state.visibleLimit = 10; render(state); });
elements.loadMoreButton.addEventListener('click', () => { state.visibleLimit += 4; render(state); });
elements.downloadAllButton.addEventListener('click', () => zipItems(state.items));
elements.downloadSelectedButton.addEventListener('click', () => zipItems(state.items.filter(item => item.selected)));
elements.deleteSelectedButton.addEventListener('click', () => deleteItems(state.items.filter(item => item.selected).map(item => item.id)));
elements.clearAllButton.addEventListener('click', async () => {
  if (!state.items.length) return;
  const accepted = await confirmAction('Clear all images?', `Remove all ${state.items.length} images and their compressed results from this session?`, 'Clear all');
  if (accepted) {
    deleteItems(state.items.map(item => item.id));
    toast('Queue cleared', 'All images were removed from this session.', 'success');
    elements.dropZone.scrollIntoView({ behavior: state.preferences.animations ? 'smooth' : 'auto', block: 'center' });
  }
});

function setLayout(layout) { state.preferences.layout = layout; persist(); render(state); }
elements.gridViewButton.addEventListener('click', () => setLayout('grid'));
elements.listViewButton.addEventListener('click', () => setLayout('list'));
elements.themeToggle.addEventListener('click', () => { state.preferences.theme = state.preferences.theme === 'dark' ? 'light' : 'dark'; persist(); applyPreferences(state.preferences); });
elements.animationToggle.addEventListener('click', () => { state.preferences.animations = !state.preferences.animations; persist(); applyPreferences(state.preferences); toast('Animations updated', state.preferences.animations ? 'Motion effects are enabled.' : 'Motion effects are disabled.'); });
elements.dialogClose.addEventListener('click', () => elements.previewDialog.close());
elements.aboutDeveloperButton.addEventListener('click', () => {
  document.body.classList.add('developer-modal-open');
  elements.developerDialog.showModal();
  syncPopupScrollLock();
});
elements.developerDialogClose.addEventListener('click', () => elements.developerDialog.close());
elements.developerDialog.addEventListener('close', () => document.body.classList.remove('developer-modal-open'));
elements.privacyPolicyButton.addEventListener('click', () => {
  document.body.classList.add('privacy-modal-open');
  elements.privacyDialog.showModal();
  syncPopupScrollLock();
});
elements.privacyDialogClose.addEventListener('click', () => elements.privacyDialog.close());
elements.privacyAcknowledge.addEventListener('click', () => elements.privacyDialog.close());
elements.privacyDialog.addEventListener('close', () => document.body.classList.remove('privacy-modal-open'));
document.addEventListener('click', createRipple);

document.addEventListener('keydown', event => {
  const editing = ['INPUT', 'TEXTAREA', 'SELECT'].includes(document.activeElement?.tagName);
  if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'a' && !editing && state.items.length) {
    event.preventDefault(); state.items.forEach(item => { item.selected = true; }); render(state);
  }
  if ((event.key === 'Delete' || event.key === 'Backspace') && !editing) {
    const selected = state.items.filter(item => item.selected);
    if (selected.length) { event.preventDefault(); deleteItems(selected.map(item => item.id)); }
  }
});

window.addEventListener('beforeunload', () => state.items.forEach(cleanupItem));
