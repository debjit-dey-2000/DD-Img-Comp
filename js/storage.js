const KEY = 'dd-img-comp-preferences-v1';
const defaults = { quality: 80, layout: 'grid', animations: true };

function loadPreferences() {
  try {
    const saved = JSON.parse(localStorage.getItem(KEY));
    return { ...defaults, ...(saved && typeof saved === 'object' ? saved : {}) };
  } catch { return { ...defaults }; }
}

function savePreferences(preferences) {
  try { localStorage.setItem(KEY, JSON.stringify(preferences)); } catch { /* Storage can be unavailable in private contexts. */ }
}
