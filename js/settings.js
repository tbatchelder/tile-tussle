// settings.js
//
// User preferences for Tile Tussle.
// Persists to localStorage so choices survive between sessions.
//
// ARCHITECTURE RULE:
//   Pure JS only — no PIXI, no DOM manipulation.
//   Reading and writing preferences is all this module does.
//
// PUBLIC API
// ----------
//   getSettings()              → { panelSide }  (full settings object)
//   getSetting(key)            → value
//   setSetting(key, value)     → void  (saves immediately to localStorage)
//   resetSettings()            → void  (restores all defaults)

const STORAGE_KEY = "tiletussle_settings";

// ─────────────────────────────────────────────────────────────────────────────
// DEFAULTS
//
// These are the out-of-the-box values for a first-time player.
// TO ADD A NEW SETTING: add it here and it will be merged in automatically
// for any player whose saved data predates it.
// ─────────────────────────────────────────────────────────────────────────────
const DEFAULTS = {
  // Which side the UI panel sits on in landscape+mobile mode.
  // "right" suits the right-handed majority; player can change in Settings.
  panelSide: "right",
};

// ─────────────────────────────────────────────────────────────────────────────
// INTERNAL LOAD / SAVE
// ─────────────────────────────────────────────────────────────────────────────

function _load() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return { ...DEFAULTS };

    // Merge saved data over defaults so new settings always have a fallback
    // even if the player's saved data is from an older version of the game.
    return { ...DEFAULTS, ...JSON.parse(raw) };
  } catch {
    // Corrupted or unavailable localStorage — fall back to defaults silently.
    return { ...DEFAULTS };
  }
}

function _save(data) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
  } catch {
    // Storage full or unavailable — continue without saving.
    // The in-memory values are still correct for this session.
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// IN-MEMORY CACHE
//
// Load once at module init. All reads hit this cache (fast).
// All writes update the cache AND persist to localStorage.
// ─────────────────────────────────────────────────────────────────────────────
let _cache = _load();

// ─────────────────────────────────────────────────────────────────────────────
// PUBLIC API
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Returns a copy of the full settings object.
 * Use this when you need multiple settings at once (e.g. initial layout).
 *
 * @returns {{ panelSide: string }}
 */
export function getSettings() {
  return { ..._cache };
}

/**
 * Returns a single setting value by key.
 *
 * @param {string} key
 * @returns {*}
 */
export function getSetting(key) {
  return _cache[key];
}

/**
 * Updates a single setting, persists to localStorage immediately.
 * Triggers no side effects — the caller (main.js) is responsible for
 * re-laying out the game after a relevant setting changes.
 *
 * @param {string} key
 * @param {*}      value
 */
export function setSetting(key, value) {
  _cache[key] = value;
  _save(_cache);
}

/**
 * Restores all settings to factory defaults and persists.
 */
export function resetSettings() {
  _cache = { ...DEFAULTS };
  _save(_cache);
}
