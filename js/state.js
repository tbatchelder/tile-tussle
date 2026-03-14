// state.js
//
// THE SOURCE OF TRUTH for Tile Tussle.
//
// This module is intentionally 100% pure JavaScript — no PIXI, no DOM,
// no rendering of any kind. It only holds data and mutates it.
//
// The rendering layer (grid.js) reads from this state to decide what to draw.
// The logic layer (hand.js, main.js) calls methods here to change the world.
//
// ARCHITECTURE RULE:
//   Nothing in this file should ever import PIXI or touch the DOM.
//   If you find yourself doing that here, stop — it belongs in grid.js or main.js.
//
// PUBLIC API
// ----------
//   createGameState(rows, cols)      → GameState object
//
// GameState methods:
//   startLevel(level)                → void  (builds sequence + randomizes tile colors)
//   cycleColor(row, col)             → number (advances color forward, returns new value)
//   resetTileColor(row, col)         → number (snaps tile back to start color, returns it)
//   getTileColor(row, col)           → number
//   checkWin()                       → boolean  (all tiles at FINAL color = player wins)
//   getLevelSettings(level)          → { colors, maxActive, cooldownMs }
//   freeze()                         → void  (blocks cycleColor/resetTileColor)
//   unfreeze()                       → void  (resumes normal play)
//   getSequence()                    → ColorEntry[]
//   getFinalColorValue()             → number

import {
  getSequenceForCount,
  nextColor,
  getStartColor,
  getFinalColor,
} from "./colors.js";

// ─────────────────────────────────────────────────────────────────────────────
// LEVEL SCHEDULE
//
// Controls how many colors appear in the sequence at each level.
// The highest entry whose `level` is <= current level wins.
// Colors cap at 8 (the full Wong palette) and stay there.
//
// TO TUNE: edit this table only. No logic changes needed anywhere else.
// ─────────────────────────────────────────────────────────────────────────────
const LEVEL_SCHEDULE = [
  { level: 1, colors: 2 },
  { level: 3, colors: 4 },
  { level: 5, colors: 6 },
  { level: 7, colors: 8 },
];

// ─────────────────────────────────────────────────────────────────────────────
// HAND DIFFICULTY SCHEDULE
//
// Each entry defines hand behaviour FROM that level onward.
// The highest entry whose `level` is <= current level wins.
//
// maxActive  — how many hands may be creeping/fast simultaneously.
//              Retreating hands do NOT count against this limit.
// cooldownMs — minimum ms a hand waits at home before it may move again.
//              A random jitter of up to 2000ms is added on top in HandManager
//              so hands don't all fire at the exact same moment.
//
// TO TUNE: just edit this table. No logic changes needed anywhere else.
// ─────────────────────────────────────────────────────────────────────────────
const HAND_SCHEDULE = [
  { level: 1, maxActive: 1, cooldownMs: 12000 },
  { level: 3, maxActive: 1, cooldownMs: 10000 },
  { level: 5, maxActive: 2, cooldownMs: 10000 },
  { level: 7, maxActive: 2, cooldownMs: 8000 },
  { level: 9, maxActive: 3, cooldownMs: 8000 },
];

// ─────────────────────────────────────────────────────────────────────────────
// FACTORY
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Creates and returns a fresh GameState object.
 * Call this once in main.js and pass it to GridManager and HandManager.
 *
 * @param {number} rows
 * @param {number} cols
 * @returns {GameState}
 */
export function createGameState(rows, cols) {
  // Internal data — never accessed directly from outside.
  // Use the methods below as the only interface.
  let _rows = rows;
  let _cols = cols;
  let _level = 1;
  let _sequence = []; // ColorEntry[] — set by startLevel()
  let _phase = "idle"; // "idle" | "playing" | "won" | "lost"

  // 2D array of plain tile data objects.
  // Shape: _tiles[row][col] = { row, col, colorValue: number }
  // colorValue is a Pixi-ready hex number like 0xE69F00.
  let _tiles = [];

  // ── PRIVATE HELPERS ──────────────────────────────────────────────────────

  function _getLevelEntry(level) {
    let entry = LEVEL_SCHEDULE[0];
    for (const e of LEVEL_SCHEDULE) {
      if (level >= e.level) entry = e;
    }
    return entry;
  }

  function _getHandEntry(level) {
    let entry = HAND_SCHEDULE[0];
    for (const e of HAND_SCHEDULE) {
      if (level >= e.level) entry = e;
    }
    return entry;
  }

  function _buildTiles() {
    const totalTiles = _rows * _cols;
    const finalVal = getFinalColor(_sequence).value;

    // Assign each tile a random color from the sequence.
    // Guard: if every tile randomly landed on the final color, that would be
    // an instant win before the player does anything — reshuffle until safe.
    let colorValues;
    do {
      colorValues = Array.from({ length: totalTiles }, () => {
        const pick = Math.floor(Math.random() * _sequence.length);
        return _sequence[pick].value;
      });
    } while (colorValues.every((v) => v === finalVal));

    _tiles = [];
    let i = 0;
    for (let r = 0; r < _rows; r++) {
      _tiles[r] = [];
      for (let c = 0; c < _cols; c++) {
        _tiles[r][c] = { row: r, col: c, colorValue: colorValues[i++] };
      }
    }
  }

  // ── PUBLIC API ────────────────────────────────────────────────────────────

  /**
   * Initialize (or re-initialize) the game for a given level.
   * Picks a fresh color sequence and resets all tiles to the start color.
   * Call this at the start of each round.
   *
   * @param {number} level  1-based
   */
  function startLevel(level) {
    _level = level;
    const { colors } = _getLevelEntry(level);
    _sequence = getSequenceForCount(colors);
    _phase = "playing";
    _buildTiles();
  }

  /**
   * Advance one tile's color to the next step in the sequence.
   * Called when the PLAYER clicks a tile.
   *
   * @param {number} row
   * @param {number} col
   * @returns {number}  new colorValue
   */
  function cycleColor(row, col) {
    if (_phase !== "playing") return _tiles[row][col].colorValue;
    const current = _tiles[row][col].colorValue;
    const next = nextColor(current, _sequence);
    _tiles[row][col].colorValue = next;
    return next;
  }

  /**
   * Snap a tile back to the START color in the sequence.
   * Called when a HAND arrives at a final-color tile — it resets that tile,
   * forcing the player to work on it again from scratch.
   *
   * @param {number} row
   * @param {number} col
   * @returns {number}  new colorValue (the start color)
   */
  function resetTileColor(row, col) {
    if (_phase !== "playing") return _tiles[row][col].colorValue;
    const startVal = getStartColor(_sequence).value;
    _tiles[row][col].colorValue = startVal;
    return startVal;
  }

  /**
   * Read the current color value of a tile.
   * Used by HandManager to find eligible targets.
   *
   * @param {number} row
   * @param {number} col
   * @returns {number}  colorValue
   */
  function getTileColor(row, col) {
    return _tiles[row][col].colorValue;
  }

  /**
   * Returns true if ALL tiles have reached the FINAL color.
   * This is the WIN condition — the player has successfully advanced
   * every tile to the end of the sequence.
   */
  function checkWin() {
    if (_sequence.length === 0) return false;
    const finalVal = getFinalColor(_sequence).value;
    return _tiles.every((row) => row.every((t) => t.colorValue === finalVal));
  }

  /**
   * Returns the current color sequence for this level.
   * HandManager uses this to know what "final color" means.
   */
  function getSequence() {
    return _sequence;
  }

  /**
   * Returns the final color value in the current sequence.
   * Hands target tiles at this color.
   */
  function getFinalColorValue() {
    if (_sequence.length === 0) return null;
    return getFinalColor(_sequence).value;
  }

  /**
   * Returns everything main.js needs to configure a level in one call.
   * Combines LEVEL_SCHEDULE and HAND_SCHEDULE lookups.
   *
   * @param {number} level
   * @returns {{ colors: number, maxActive: number, cooldownMs: number }}
   */
  function getLevelSettings(level) {
    const l = _getLevelEntry(level);
    const h = _getHandEntry(level);
    return {
      colors: l.colors,
      maxActive: h.maxActive,
      cooldownMs: h.cooldownMs,
    };
  }

  /**
   * Freeze the game — cycleColor and resetTileColor become no-ops.
   * Called during the win countdown so no state changes happen while
   * the player is reading the new sequence.
   */
  function freeze() {
    _phase = "frozen";
  }

  /**
   * Unfreeze — resume normal play after countdown ends.
   */
  function unfreeze() {
    _phase = "playing";
  }

  // Return the public interface only.
  // Internal variables (_tiles, _sequence, etc.) are NOT exposed.
  return {
    startLevel,
    cycleColor,
    resetTileColor,
    getTileColor,
    checkWin,
    getLevelSettings,
    freeze,
    unfreeze,
    getSequence,
    getFinalColorValue,
  };
}
