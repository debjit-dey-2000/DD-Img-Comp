const KEY = 'dd-img-comp-preferences-v1';
const defaults = {
  quality: 80, layout: 'grid', animations: true, outputFormat: 'image/webp',
  transform: { mode: 'none', width: null, height: null }
};

function loadPreferences() {
  try {
    const saved = JSON.parse(localStorage.getItem(KEY));
    const preferences = { ...defaults, ...(saved && typeof saved === 'object' ? saved : {}) };
    preferences.transform = { ...defaults.transform, ...(preferences.transform || {}) };
    return preferences;
  } catch { return { ...defaults }; }
}

function savePreferences(preferences) {
  try { localStorage.setItem(KEY, JSON.stringify(preferences)); } catch { /* Storage can be unavailable in private contexts. */ }
}
