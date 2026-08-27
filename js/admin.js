const elements = Object.fromEntries([
  'loginView','loginForm','adminEmail','adminPassword','loginError','loginButton','dashboardView','lastUpdated',
  'refreshButton','logoutButton','dashboardError','metricImages','metricSessions','metricOriginal','metricCompressed',
  'metricSaved','metricSavingRate','metricTime','metricSpeed','chartTotal','activityChart','chartEmpty',
  'activityRows','activityEmpty','loadingOverlay','autoRefreshToggle','exportCsvButton','dateRangeForm','dateFrom','dateTo','clearDateRange',
  'chartMetricSelect','chartSubtitle','pageSizeSelect','pageSummary','previousPage','nextPage'
].map(id => [id, document.getElementById(id)]));

const state = { authorization: '', period: 'daily', latestData: null, autoRefreshTimer: 0, from: '', to: '', page: 1, pageSize: 10, chartMetric: 'imageCount' };

function greetingForHour(hour) {
  if (hour >= 5 && hour < 12) return 'Good morning';
  if (hour >= 12 && hour < 17) return 'Good afternoon';
  if (hour >= 17 && hour < 21) return 'Good evening';
  return 'Good night';
}

document.getElementById('adminGreeting').textContent = `${greetingForHour(new Date().getHours())}, Debjit`;

const formatBytes = bytes => {
  const mb = bytes / 1_000_000;
  if (mb >= 1000) return `${(mb / 1000).toFixed(2)} GB`;
  return `${mb.toFixed(mb >= 10 ? 1 : 2)} MB`;
};
const formatTime = ms => ms >= 60_000 ? `${(ms / 60_000).toFixed(1)} min` : `${(ms / 1000).toFixed(1)} s`;
const formatSpeed = (bytes, ms) => ms ? `${((bytes / 1_000_000) / (ms / 1000)).toFixed(2)} MB/s` : '0 MB/s';
const formatDate = iso => new Intl.DateTimeFormat(undefined, { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(iso));

function setLoading(loading) {
  elements.loadingOverlay.hidden = !loading;
  elements.refreshButton.disabled = loading;
}

function labelForBucket(label) {
  if (state.period === 'monthly') return new Intl.DateTimeFormat(undefined, { month: 'short', year: '2-digit', timeZone: 'UTC' }).format(new Date(`${label}-01T00:00:00Z`));
  return new Intl.DateTimeFormat(undefined, { month: 'short', day: 'numeric', timeZone: 'UTC' }).format(new Date(`${label}T00:00:00Z`));
}

const chartMetrics = {
  imageCount: { label: 'Images', subtitle: 'Image count by selected period', value: item => item.imageCount, format: value => value.toLocaleString() },
  originalBytes: { label: 'Original data', subtitle: 'Original data volume by selected period', value: item => item.originalBytes, format: formatBytes },
  savedBytes: { label: 'Data saved', subtitle: 'Saved data volume by selected period', value: item => item.savedBytes, format: formatBytes },
  processingMs: { label: 'Processing time', subtitle: 'Browser processing time by selected period', value: item => item.processingMs, format: formatTime }
};

function renderChart(data) {
  const metric = chartMetrics[state.chartMetric];
  elements.chartSubtitle.textContent = metric.subtitle;
  elements.activityChart.replaceChildren();
  const max = Math.max(1, ...data.series.map(metric.value));
  const chartFragment = document.createDocumentFragment();
  data.series.forEach(item => {
    const metricValue = metric.value(item);
    const column = document.createElement('div'); column.className = 'chart-column';
    const value = document.createElement('span'); value.className = 'chart-value'; value.textContent = metric.format(metricValue);
    const bar = document.createElement('span'); bar.className = 'chart-bar'; bar.style.height = `${Math.max(3, metricValue / max * 185)}px`; bar.title = `${labelForBucket(item.label)} · ${metric.label}: ${metric.format(metricValue)} · ${item.imageCount} images`;
    const label = document.createElement('span'); label.className = 'chart-label'; label.textContent = labelForBucket(item.label);
    column.append(value, bar, label); chartFragment.append(column);
  });
  elements.activityChart.append(chartFragment);
  elements.activityChart.hidden = data.series.length === 0;
  elements.chartEmpty.hidden = data.series.length > 0;
}

function renderDashboard(data) {
  state.latestData = data;
  const summary = data.summary;
  elements.metricImages.textContent = summary.imageCount.toLocaleString();
  elements.metricSessions.textContent = `${summary.sessions.toLocaleString()} session${summary.sessions === 1 ? '' : 's'}`;
  elements.metricOriginal.textContent = formatBytes(summary.originalBytes);
  elements.metricCompressed.textContent = formatBytes(summary.compressedBytes);
  elements.metricSaved.textContent = formatBytes(summary.savedBytes);
  elements.metricSavingRate.textContent = `${summary.originalBytes ? Math.round(summary.savedBytes / summary.originalBytes * 100) : 0}% average`;
  elements.metricTime.textContent = formatTime(summary.processingMs);
  elements.metricSpeed.textContent = formatSpeed(summary.originalBytes, summary.processingMs);
  elements.chartTotal.textContent = `${summary.imageCount.toLocaleString()} images`;
  elements.lastUpdated.textContent = `Updated ${new Date(data.generatedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`;

  renderChart(data);

  elements.activityRows.replaceChildren();
  const rows = document.createDocumentFragment();
  data.recent.forEach(item => {
    const row = document.createElement('tr');
    [formatDate(item.createdAt), item.imageCount.toLocaleString(), formatBytes(item.originalBytes), formatBytes(item.compressedBytes), formatBytes(item.savedBytes), formatTime(item.processingMs)].forEach((value, index) => {
      const cell = document.createElement('td'); cell.textContent = value;
      if (index === 4) cell.className = 'saved-cell';
      row.append(cell);
    });
    rows.append(row);
  });
  elements.activityRows.append(rows);
  elements.activityEmpty.hidden = data.recent.length > 0;
  const pagination = data.pagination;
  state.page = pagination.page;
  elements.pageSummary.textContent = `${pagination.totalItems.toLocaleString()} sessions · Page ${pagination.page} of ${pagination.totalPages}`;
  elements.previousPage.disabled = pagination.page <= 1;
  elements.nextPage.disabled = pagination.page >= pagination.totalPages;
  elements.dashboardError.hidden = true;
}

async function loadAnalytics() {
  setLoading(true);
  try {
    const params = new URLSearchParams({ period: state.period, page: state.page, pageSize: state.pageSize });
    if (state.from) params.set('from', state.from);
    if (state.to) params.set('to', state.to);
    const response = await fetch(`/.netlify/functions/admin-analytics?${params}`, {
      headers: { Authorization: state.authorization }, cache: 'no-store'
    });
    const data = await response.json();
    if (response.status === 401) throw new Error('Your admin session is invalid. Please sign in again.');
    if (!response.ok) throw new Error(data.error || 'Analytics could not be loaded.');
    elements.loginView.hidden = true;
    elements.dashboardView.hidden = false;
    renderDashboard(data);
  } catch (error) {
    elements.dashboardError.textContent = error.message;
    elements.dashboardError.hidden = false;
    if (error.message.includes('sign in')) logout();
  } finally { setLoading(false); }
}

function logout() {
  clearInterval(state.autoRefreshTimer);
  state.autoRefreshTimer = 0;
  elements.autoRefreshToggle.checked = false;
  state.authorization = '';
  elements.adminPassword.value = '';
  elements.dashboardView.hidden = true;
  elements.loginView.hidden = false;
  elements.loginError.hidden = true;
  elements.adminPassword.focus();
}

elements.loginForm.addEventListener('submit', async event => {
  event.preventDefault();
  elements.loginError.hidden = true;
  elements.loginButton.disabled = true;
  const credentials = `${elements.adminEmail.value.trim()}:${elements.adminPassword.value}`;
  state.authorization = `Basic ${btoa(unescape(encodeURIComponent(credentials)))}`;
  try {
    await loadAnalytics();
    if (!elements.dashboardView.hidden) elements.adminPassword.value = '';
  } catch { /* loadAnalytics renders failures. */ }
  if (elements.dashboardView.hidden) {
    elements.loginError.textContent = 'Invalid email or password, or analytics service is unavailable.';
    elements.loginError.hidden = false;
    state.authorization = '';
  }
  elements.loginButton.disabled = false;
});

document.querySelectorAll('[data-period]').forEach(button => button.addEventListener('click', () => {
  state.period = button.dataset.period;
  state.page = 1;
  document.querySelectorAll('[data-period]').forEach(item => item.classList.toggle('active', item === button));
  loadAnalytics();
}));
elements.refreshButton.addEventListener('click', loadAnalytics);
elements.logoutButton.addEventListener('click', logout);

elements.dateRangeForm.addEventListener('submit', event => {
  event.preventDefault();
  if (elements.dateFrom.value && elements.dateTo.value && elements.dateFrom.value > elements.dateTo.value) {
    elements.dashboardError.textContent = 'The From date must be before the To date.';
    elements.dashboardError.hidden = false;
    return;
  }
  state.from = elements.dateFrom.value;
  state.to = elements.dateTo.value;
  state.page = 1;
  loadAnalytics();
});

elements.clearDateRange.addEventListener('click', () => {
  elements.dateFrom.value = ''; elements.dateTo.value = '';
  state.from = ''; state.to = ''; state.page = 1; loadAnalytics();
});

elements.chartMetricSelect.addEventListener('change', event => {
  state.chartMetric = event.target.value;
  if (state.latestData) renderChart(state.latestData);
});

elements.pageSizeSelect.addEventListener('change', event => {
  state.pageSize = Number(event.target.value); state.page = 1; loadAnalytics();
});
elements.previousPage.addEventListener('click', () => { if (state.page > 1) { state.page -= 1; loadAnalytics(); } });
elements.nextPage.addEventListener('click', () => {
  if (state.latestData && state.page < state.latestData.pagination.totalPages) { state.page += 1; loadAnalytics(); }
});

elements.autoRefreshToggle.addEventListener('change', event => {
  clearInterval(state.autoRefreshTimer);
  state.autoRefreshTimer = event.target.checked ? setInterval(() => {
    if (!document.hidden && state.authorization) loadAnalytics();
  }, 60_000) : 0;
});

elements.exportCsvButton.addEventListener('click', () => {
  if (!state.latestData) return;
  const escapeCsv = value => `"${String(value ?? '').replace(/"/g, '""')}"`;
  const rows = [['Date and time', 'Images', 'Original bytes', 'Output bytes', 'Saved bytes', 'Processing ms']];
  state.latestData.recent.forEach(item => rows.push([item.createdAt, item.imageCount, item.originalBytes, item.compressedBytes, item.savedBytes, item.processingMs]));
  const blob = new Blob([rows.map(row => row.map(escapeCsv).join(',')).join('\n')], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob); const link = document.createElement('a');
  link.href = url; link.download = `dd-img-comp-${state.period}-${new Date().toISOString().slice(0, 10)}.csv`; link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
});
