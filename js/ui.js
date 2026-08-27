const elements = Object.fromEntries([
  'dropZone','fileInput','folderInput','browseButton','folderButton','qualitySlider','qualityOutput','compressAllButton',
  'queueSection','queueCount','selectionSummary','selectAllCheckbox','searchInput','filterSelect','sortSelect','batchBar','batchCount',
  'compressSelectedButton','downloadSelectedButton','deleteSelectedButton','progressPanel','progressTitle','progressCount','overallProgress',
  'pauseButton','cancelButton','imageGrid','emptyResults','loadMorePanel','loadMoreSummary','loadMoreButton','clearAllButton','downloadAllButton','gridViewButton','listViewButton',
  'statUploaded','statConverted','statOriginal','statCompressed','statSaved','statAverage','statTime','statSpeed','toastRegion','previewDialog',
  'dialogClose','confirmDialog','confirmTitle','confirmMessage','confirmCancel','confirmAccept','welcomeDialog','welcomeClose','welcomeContinue','aboutDeveloperButton','developerDialog','developerDialogClose','privacyPolicyButton','privacyDialog','privacyDialogClose','privacyAcknowledge','animationToggle','imageCardTemplate'
].map(id => [id, document.getElementById(id)]));

function syncPopupScrollLock() {
  document.body.classList.toggle('popup-open', Boolean(document.querySelector('dialog[open]')));
}

document.querySelectorAll('dialog').forEach(dialog => {
  dialog.addEventListener('cancel', event => event.preventDefault());
  dialog.addEventListener('close', syncPopupScrollLock);
});

const lazyImageObserver = 'IntersectionObserver' in window ? new IntersectionObserver(entries => {
  entries.forEach(entry => {
    if (!entry.isIntersecting) return;
    const image = entry.target;
    image.src = image.dataset.src;
    delete image.dataset.src;
    lazyImageObserver.unobserve(image);
  });
}, { rootMargin: '500px 0px' }) : null;

function loadPreviewLazily(image, url) {
  if (!url) return;
  if (lazyImageObserver) {
    image.dataset.src = url;
    lazyImageObserver.observe(image);
  } else image.src = url;
}

function stopObservingPreviews(container) {
  if (!lazyImageObserver || !container) return;
  container.querySelectorAll('img[data-src]').forEach(image => lazyImageObserver.unobserve(image));
}

function setRangeFill(input) {
  input.style.setProperty('--range-fill', `${input.value}%`);
}

function toast(title, message = '', type = 'info') {
  const node = document.createElement('div');
  node.className = `toast ${type}`;
  const body = document.createElement('div');
  const strong = document.createElement('strong'); strong.textContent = title;
  const text = document.createElement('p'); text.textContent = message;
  body.append(strong, text); node.append(body); elements.toastRegion.append(node);
  setTimeout(() => node.remove(), 4300);
}

let confirmResolver = null;

function finishConfirmation(accepted) {
  if (!confirmResolver) return;
  const resolve = confirmResolver;
  confirmResolver = null;
  elements.confirmDialog.close();
  resolve(accepted);
}

function confirmAction(title, message, confirmLabel = 'Confirm') {
  if (confirmResolver) finishConfirmation(false);
  elements.confirmTitle.textContent = title;
  elements.confirmMessage.textContent = message;
  elements.confirmAccept.textContent = confirmLabel;
  elements.confirmDialog.showModal();
  syncPopupScrollLock();
  requestAnimationFrame(() => elements.confirmCancel.focus());
  return new Promise(resolve => { confirmResolver = resolve; });
}

elements.confirmCancel.addEventListener('click', () => finishConfirmation(false));
elements.confirmAccept.addEventListener('click', () => finishConfirmation(true));

function filteredItems(state) {
  const query = state.search.trim().toLowerCase();
  const filtered = state.items.filter(item => (!query || item.name.toLowerCase().includes(query)) && (state.filter === 'all' || item.status === state.filter));
  return filtered.sort((a, b) => {
    if (state.sort === 'name') return a.name.localeCompare(b.name);
    if (state.sort === 'size-desc') return b.file.size - a.file.size;
    if (state.sort === 'size-asc') return a.file.size - b.file.size;
    return a.uploadedAt - b.uploadedAt;
  });
}

function makeCard(item, globalQuality, processing) {
  const card = elements.imageCardTemplate.content.firstElementChild.cloneNode(true);
  card.dataset.id = item.id;
  card.classList.toggle('selected', item.selected);
  card.classList.toggle('completed', item.status === 'completed');
  const checkbox = card.querySelector('.select-image');
  checkbox.checked = item.selected;
  checkbox.setAttribute('aria-label', `Select ${item.name}`);
  const badge = card.querySelector('.status-badge');
  badge.className = `status-badge ${item.status}`;
  badge.textContent = item.status;
  if (item.error) badge.title = item.error;
  loadPreviewLazily(card.querySelector('.before-image'), item.originalUrl);
  if (item.compressedUrl) loadPreviewLazily(card.querySelector('.after-image'), item.compressedUrl);
  card.querySelector('.file-name').textContent = item.name;
  card.querySelector('.file-details').textContent = `${item.file.type.split('/')[1] || 'image'} · ${item.width || '?'} × ${item.height || '?'}`;
  card.querySelector('.original-size').textContent = formatBytes(item.file.size);
  const quality = item.qualityOverride ?? globalQuality;
  const estimatedSize = Math.max(256, Math.round(item.file.size * (.2 + quality / 100 * .62)));
  card.querySelector('.compressed-size').textContent = item.compressedBlob ? formatBytes(item.compressedBlob.size) : `~${formatBytes(estimatedSize)}`;
  card.querySelector('.saved-percent').textContent = item.compressedBlob ? `${compressionPercent(item.file.size, item.compressedBlob.size)}%` : 'Est.';
  const qualityInput = card.querySelector('.card-quality');
  qualityInput.value = quality; setRangeFill(qualityInput);
  card.querySelector('.individual-quality output').textContent = item.qualityOverride === null ? `Global · ${quality}%` : `${quality}%`;
  card.querySelector('.reset-quality').hidden = item.qualityOverride === null;
  card.querySelector('.item-progress span').style.width = `${item.progress}%`;
  card.querySelector('.download-one').disabled = !item.compressedBlob;
  card.querySelector('.compress-one').disabled = item.status === 'processing';
  card.querySelector('.delete-one').disabled = processing;
  bindComparison(card.querySelector('.comparison'));
  return card;
}

function updateQueueSummary(state) {
  const selected = state.items.filter(item => item.selected);
  elements.queueCount.textContent = state.items.length;
  elements.selectionSummary.textContent = `${selected.length} selected · ${state.items.filter(item => item.status === 'completed').length} converted`;
  elements.batchCount.textContent = `${selected.length} selected`;
  elements.downloadAllButton.disabled = !state.items.some(item => item.compressedBlob);
  elements.downloadSelectedButton.disabled = !selected.some(item => item.compressedBlob);
}

function updateLoadMore(state, matchingCount, renderedCount) {
  const hasMore = matchingCount > renderedCount;
  elements.loadMorePanel.hidden = !hasMore;
  elements.loadMoreSummary.textContent = `Showing ${renderedCount} of ${matchingCount} images`;
  const nextCount = Math.min(4, matchingCount - renderedCount);
  elements.loadMoreButton.textContent = `Load ${nextCount} more`;
}

function refreshSelectionState(state) {
  const selected = state.items.filter(item => item.selected);
  updateQueueSummary(state);
  elements.batchBar.hidden = selected.length === 0;
  elements.selectAllCheckbox.checked = state.items.length > 0 && selected.length === state.items.length;
  elements.selectAllCheckbox.indeterminate = selected.length > 0 && selected.length < state.items.length;
}

function render(state) {
  const matching = filteredItems(state);
  const visible = matching.slice(0, state.visibleLimit);
  const fragment = document.createDocumentFragment();
  visible.forEach(item => fragment.append(makeCard(item, state.preferences.quality, state.processing)));
  stopObservingPreviews(elements.imageGrid);
  elements.imageGrid.replaceChildren(fragment);
  elements.imageGrid.classList.toggle('list-view', state.preferences.layout === 'list');
  elements.emptyResults.hidden = matching.length > 0;
  updateLoadMore(state, matching.length, visible.length);
  elements.queueSection.hidden = state.items.length === 0;
  const selected = state.items.filter(item => item.selected);
  updateQueueSummary(state);
  refreshSelectionState(state);
  elements.compressAllButton.disabled = state.items.length === 0 || state.processing;
  elements.downloadAllButton.disabled = !state.items.some(item => item.compressedBlob);
  elements.compressSelectedButton.disabled = state.processing;
  elements.deleteSelectedButton.disabled = state.processing;
  elements.clearAllButton.disabled = state.processing;
  elements.downloadSelectedButton.disabled = !selected.some(item => item.compressedBlob);
  elements.gridViewButton.classList.toggle('active', state.preferences.layout === 'grid');
  elements.listViewButton.classList.toggle('active', state.preferences.layout === 'list');
  elements.gridViewButton.setAttribute('aria-pressed', state.preferences.layout === 'grid');
  elements.listViewButton.setAttribute('aria-pressed', state.preferences.layout === 'list');
  renderStats(state.items);
}

function refreshItem(state, item) {
  if (state.filter !== 'all') { render(state); return; }
  const existing = elements.imageGrid.querySelector(`[data-id="${item.id}"]`);
  const matching = filteredItems(state);
  const visibleItems = matching.slice(0, state.visibleLimit);
  const visible = visibleItems.some(candidate => candidate.id === item.id);
  if (existing && !visible) {
    stopObservingPreviews(existing);
    existing.remove();
  } else if (!existing && visible) {
    elements.imageGrid.append(makeCard(item, state.preferences.quality, state.processing));
  } else if (existing) {
    stopObservingPreviews(existing);
    existing.replaceWith(makeCard(item, state.preferences.quality, state.processing));
  }
  elements.emptyResults.hidden = matching.length > 0;
  updateLoadMore(state, matching.length, visibleItems.length);
  updateQueueSummary(state);
  renderStats(state.items);
}

function refreshItemDimensions(item) {
  const card = elements.imageGrid.querySelector(`[data-id="${item.id}"]`);
  if (!card) return;
  card.querySelector('.file-details').textContent = `${item.file.type.split('/')[1] || 'image'} · ${item.width || '?'} × ${item.height || '?'}`;
}

function renderStats(items) {
  const completed = items.filter(item => item.status === 'completed' && item.compressedBlob);
  const original = items.reduce((sum, item) => sum + item.file.size, 0);
  const compressed = completed.reduce((sum, item) => sum + item.compressedBlob.size, 0);
  const completedOriginal = completed.reduce((sum, item) => sum + item.file.size, 0);
  const saved = Math.max(0, completedOriginal - compressed);
  const time = completed.reduce((sum, item) => sum + item.processingTime, 0);
  elements.statUploaded.textContent = items.length;
  elements.statConverted.textContent = `${completed.length} converted`;
  elements.statOriginal.textContent = formatBytes(original);
  elements.statCompressed.textContent = formatBytes(compressed);
  elements.statSaved.textContent = formatBytes(saved);
  elements.statAverage.textContent = `${completedOriginal ? Math.round(saved / completedOriginal * 100) : 0}% average`;
  elements.statTime.textContent = formatDuration(time);
  elements.statSpeed.textContent = formatSpeed(completedOriginal, time);
}

function updateProgress(current, total, title, percent) {
  elements.progressPanel.hidden = false;
  elements.progressTitle.textContent = title;
  elements.progressCount.textContent = `${current} / ${total}`;
  elements.overallProgress.style.width = `${percent}%`;
}

function hideProgress() { elements.progressPanel.hidden = true; }

function applyPreferences(preferences) {
  document.documentElement.dataset.theme = 'dark';
  document.body.classList.toggle('no-animations', !preferences.animations);
  elements.qualitySlider.value = preferences.quality;
  elements.qualityOutput.textContent = `${preferences.quality}%`;
  setRangeFill(elements.qualitySlider);
}
