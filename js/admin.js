const elements = Object.fromEntries([
  'loginView','loginForm','adminEmail','adminPassword','loginError','loginButton','dashboardView','lastUpdated',
  'refreshButton','logoutButton','dashboardError','metricImages','metricSessions','metricOriginal','metricCompressed',
  'metricSaved','metricSavingRate','metricTime','metricSpeed','chartTotal','activityChart','chartEmpty',
  'activityRows','activityEmpty','loadingOverlay'
].map(id => [id, document.getElementById(id)]));

const state = { authorization: '', period: 'daily' };

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

function renderDashboard(data) {
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

  elements.activityChart.replaceChildren();
  const max = Math.max(1, ...data.series.map(item => item.imageCount));
  const chartFragment = document.createDocumentFragment();
  data.series.forEach(item => {
    const column = document.createElement('div'); column.className = 'chart-column';
    const value = document.createElement('span'); value.className = 'chart-value'; value.textContent = item.imageCount;
    const bar = document.createElement('span'); bar.className = 'chart-bar'; bar.style.height = `${Math.max(3, item.imageCount / max * 185)}px`; bar.title = `${item.imageCount} images · ${formatBytes(item.originalBytes)}`;
    const label = document.createElement('span'); label.className = 'chart-label'; label.textContent = labelForBucket(item.label);
    column.append(value, bar, label); chartFragment.append(column);
  });
  elements.activityChart.append(chartFragment);
  elements.activityChart.hidden = data.series.length === 0;
  elements.chartEmpty.hidden = data.series.length > 0;

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
  elements.dashboardError.hidden = true;
}

async function loadAnalytics() {
  setLoading(true);
  try {
    const response = await fetch(`/.netlify/functions/admin-analytics?period=${state.period}`, {
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
  document.querySelectorAll('[data-period]').forEach(item => item.classList.toggle('active', item === button));
  loadAnalytics();
}));
elements.refreshButton.addEventListener('click', loadAnalytics);
elements.logoutButton.addEventListener('click', logout);
