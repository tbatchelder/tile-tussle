// colors.js
//
// Color system for Tile Tussle.
//
// Built on the Wong (2011) palette — 8 colors designed to be distinguishable
// by people with deuteranopia, protanopia, and tritanopia, as well as full
// color vision. Colors also differ meaningfully in luminance so they remain
// distinct even in grayscale or high-contrast modes.
//
// Reference: Wong, B. (2011). Points of view: Color blindness.
//            Nature Methods, 8(6), 441.
//
// PUBLIC API
// ----------
//   getSequenceForCount(count)          → ColorEntry[]
//   nextColor(hexValue, sequence)       → hex number (next in sequence, wraps to start)
//   isAtFinalColor(hexValue, sequence)  → boolean
//   isAtStartColor(hexValue, sequence)  → boolean
//   getFinalColor(sequence)             → ColorEntry
//   getStartColor(sequence)             → ColorEntry
//   hexToNumber(cssHex)                 → number  e.g. "#E69F00" → 0xE69F00
//   numberToHex(n)                      → string  e.g. 0xE69F00  → "#E69F00"

// ─────────────────────────────────────────────────────────────────────────────
// MASTER POOL
//
// Each entry:
//   id        — stable identifier, never changes (used for save/load later)
//   hex       — CSS hex string
//   value     — Pixi-ready hex number (0xRRGGBB)
//   label     — human-readable name shown in UI
//   luminance — perceived brightness 0–100 (WCAG relative luminance, rounded)
//               Used to sort/display the sequence strip clearly.
// ─────────────────────────────────────────────────────────────────────────────
export const COLOR_POOL = [
  {
    id: "black",
    hex: "#000000",
    value: 0x000000,
    label: "Black",
    luminance: 0,
  },
  {
    id: "orange",
    hex: "#E69F00",
    value: 0xe69f00,
    label: "Orange",
    luminance: 60,
  },
  {
    id: "sky",
    hex: "#56B4E9",
    value: 0x56b4e9,
    label: "Sky Blue",
    luminance: 53,
  },
  {
    id: "green",
    hex: "#009E73",
    value: 0x009e73,
    label: "Bluish Green",
    luminance: 35,
  },
  {
    id: "yellow",
    hex: "#F0E442",
    value: 0xf0e442,
    label: "Yellow",
    luminance: 87,
  },
  {
    id: "blue",
    hex: "#0072B2",
    value: 0x0072b2,
    label: "Blue",
    luminance: 18,
  },
  {
    id: "vermillion",
    hex: "#D55E00",
    value: 0xd55e00,
    label: "Vermillion",
    luminance: 30,
  },
  {
    id: "purple",
    hex: "#CC79A7",
    value: 0xcc79a7,
    label: "Reddish Purple",
    luminance: 42,
  },
];

// ─────────────────────────────────────────────────────────────────────────────
// SEQUENCE BUILDER
//
// Picks `count` colors from the pool in a random order with no repeats.
// Pure function — call it again for a new order each level.
// ─────────────────────────────────────────────────────────────────────────────
function buildSequence(count) {
  const shuffled = [...COLOR_POOL].sort(() => Math.random() - 0.5);
  return shuffled.slice(0, count);
}

/**
 * Build a sequence with an explicit color count.
 * Used by state.js which owns the level→color-count mapping via LEVEL_SCHEDULE.
 * Count is clamped to [2, COLOR_POOL.length].
 *
 * @param {number} count
 * @returns {ColorEntry[]}
 */
export function getSequenceForCount(count) {
  const clamped = Math.min(Math.max(count, 2), COLOR_POOL.length);
  return buildSequence(clamped);
}

// ─────────────────────────────────────────────────────────────────────────────
// PUBLIC API
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Given the current hex VALUE of a tile, returns the NEXT color value
 * in the sequence. Wraps back to the start color if at the end.
 *
 * Used by: grid tile click handler (player click) AND hand clickTile.
 *
 * @param {number}       currentValue  e.g. 0xE69F00
 * @param {ColorEntry[]} sequence
 * @returns {number}  next hex value
 */
export function nextColor(currentValue, sequence) {
  const idx = sequence.findIndex((c) => c.value === currentValue);

  if (idx === -1) {
    // Tile color not in current sequence — snap to start.
    // This handles tiles that were mid-sequence when a new level begins.
    return sequence[0].value;
  }

  const nextIdx = (idx + 1) % sequence.length;
  return sequence[nextIdx].value;
}

/**
 * Returns true if the tile is sitting on the FINAL color in the sequence.
 * Hands only target tiles where this returns true.
 *
 * @param {number}       currentValue
 * @param {ColorEntry[]} sequence
 * @returns {boolean}
 */
export function isAtFinalColor(currentValue, sequence) {
  return currentValue === sequence[sequence.length - 1].value;
}

/**
 * Returns true if the tile is at the START color.
 * Useful for win-condition check (all tiles at start = board is "clean").
 *
 * @param {number}       currentValue
 * @param {ColorEntry[]} sequence
 * @returns {boolean}
 */
export function isAtStartColor(currentValue, sequence) {
  return currentValue === sequence[0].value;
}

/**
 * Convenience: the final ColorEntry in the sequence.
 */
export function getFinalColor(sequence) {
  return sequence[sequence.length - 1];
}

/**
 * Convenience: the start ColorEntry in the sequence.
 */
export function getStartColor(sequence) {
  return sequence[0];
}

// ─────────────────────────────────────────────────────────────────────────────
// UTILITY
// ─────────────────────────────────────────────────────────────────────────────

/** "#E69F00"  →  0xE69F00 */
export function hexToNumber(cssHex) {
  return parseInt(cssHex.replace("#", ""), 16);
}

/** 0xE69F00  →  "#E69F00" */
export function numberToHex(n) {
  return "#" + n.toString(16).padStart(6, "0").toUpperCase();
}
