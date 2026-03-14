// main.js
//
// THE ORCHESTRATOR — wires state, rendering, input, layout, and UI together.
//
// ARCHITECTURE RULE:
//   main.js is the ONLY place that imports both state.js and the rendering
//   layer (grid.js / hand.js / ui.js). It is the switchboard.
//
// DATA FLOW:
//   [Player/Hand input]
//       ↓
//   state.cycleColor / resetTileColor    ← mutates source of truth
//       ↓
//   grid.renderTile(row, col, color)     ← updates visual
//       ↓
//   checkWin()                           ← evaluates consequences
//
// LAYOUT FLOW:
//   ResizeObserver fires layoutGame()
//       ↓
//   Compute grid scale from available screen space
//       ↓
//   Derive panel width from scaled grid width
//       ↓
//   panel.layoutFixed(x, y, w, h)  — panel sits flush against grid
//       ↓
//   grid.container scale/x/y set directly

import { createGlowButton, GamePanel } from "./ui.js";
import { GridManager } from "./grid.js";
import { HandManager } from "./hand.js";
import { createGameState } from "./state.js";
import { getSettings, getSetting, setSetting } from "./settings.js";

// Expose settings on window so GamePanel's radio buttons can write to it
// without needing a direct import (ui.js stays decoupled from settings.js).
import * as SettingsModule from "./settings.js";
window._tileSettings = SettingsModule;

let app;
let state;
let grid;
let hands;
let panel;
let gameRoot;
let currentLevel = 1;
let gameAreaRect = { x: 0, y: 0, width: 0, height: 0 };
let isPaused = false;

// ── LAYOUT ───────────────────────────────────────────────────────────────────
//
// ORDER OF OPERATIONS — this is critical:
//   1. Compute how large the grid wants to be at current screen size
//   2. Derive panel width from grid width (they stay the same)
//   3. Compute grid rect (available space after panel is reserved)
//   4. Tell panel its width and position
//   5. Centre grid inside its rect
//   6. Reposition hands (they live inside grid.container, scale auto-follows)
//
// This order ensures the panel never stretches wider than the grid.

function layoutGame() {
  if (!grid || !panel) return;

  const sw = app.renderer.width;
  const sh = app.renderer.height;

  const isLandscape = sw > sh;
  const isMobileWidth = sw < 1024;
  const mode = isLandscape && isMobileWidth ? "landscape-side" : "portrait";
  const panelSide = getSetting("panelSide");

  const OUTER_PAD = 12; // gap between the outermost hand tip and screen edge

  const rawGridW = grid.cols * (grid.tileSize + grid.padding) - grid.padding;
  const rawGridH = grid.rows * (grid.tileSize + grid.padding) - grid.padding;

  // Hands live in grid.container local space and extend one tileSize beyond
  // the grid edge on every side. Total hand extent = handLen + gap from edge.
  // handLen = tileSize (set in createHandSprite), gap = hands.gap (25 default).
  const handGap = hands ? hands.gap : 25;
  const handExtent = grid.tileSize + handGap;

  if (mode === "portrait") {
    const panelH = panel.portraitHeight();

    const availW = sw - OUTER_PAD * 2;
    const availH = sh - panelH - OUTER_PAD * 2;

    // Scale to fit (grid + hands) in available space
    const scaleByW = availW / (rawGridW + 2 * handExtent);
    const scaleByH = availH / (rawGridH + 2 * handExtent);
    const scale = Math.min(2.0, Math.max(0.5, Math.min(scaleByW, scaleByH)));

    const scaledGridW = rawGridW * scale;
    const scaledGridH = rawGridH * scale;
    const scaledHandExtent = handExtent * scale;

    // Grid (tiles only) is centred in the screen horizontally
    const gridX = (sw - scaledGridW) / 2;
    const gridY = panelH + OUTER_PAD + (availH - scaledGridH) / 2;

    // Panel spans from left-hand edge to right-hand edge (grid + both hands)
    const panelW = scaledGridW + scaledHandExtent * 2;
    const panelX = gridX - scaledHandExtent;

    panel.layoutFixed(panelX, 0, panelW, panelH);

    grid.container.scale.set(scale);
    grid.container.x = gridX;
    grid.container.y = gridY;

    // Store the full game area (grid + hands) in screen space for the overlay
    gameAreaRect = {
      x: panelX,
      y: panelH,
      width: panelW,
      height: sh - panelH,
    };
  } else {
    const panelW = panel.landscapeWidth();
    const availW = sw - panelW - OUTER_PAD * 2;
    const availH = sh - OUTER_PAD * 2;

    const scaleByW = availW / (rawGridW + 2 * handExtent);
    const scaleByH = availH / (rawGridH + 2 * handExtent);
    const scale = Math.min(2.0, Math.max(0.5, Math.min(scaleByW, scaleByH)));

    const scaledGridW = rawGridW * scale;
    const scaledGridH = rawGridH * scale;

    const gridAreaX = panelSide === "left" ? panelW + OUTER_PAD : OUTER_PAD;
    const gridX = gridAreaX + (availW - scaledGridW) / 2;
    const gridY = OUTER_PAD + (availH - scaledGridH) / 2;

    const panelX = panelSide === "left" ? 0 : sw - panelW;
    panel.layoutFixed(panelX, 0, panelW, sh);

    grid.container.scale.set(scale);
    grid.container.x = gridX;
    grid.container.y = gridY;

    // Store the full game area in screen space for the overlay
    const gameAreaX = panelSide === "left" ? panelW : 0;
    gameAreaRect = {
      x: gameAreaX,
      y: 0,
      width: sw - panelW,
      height: sh,
    };
  }

  if (hands) hands.positionHands();
}

// ── TILE INTERACTION ─────────────────────────────────────────────────────────
//
// Player click → advance tile forward through sequence
// Hand click   → reset tile back to start of sequence
// Both paths: mutate state → render tile → check win

function handlePlayerClick(row, col) {
  if (state.getTileColor(row, col) === state.getFinalColorValue()) return;

  const newColor = state.cycleColor(row, col);
  grid.renderTile(row, col, newColor);

  const isNowFinal = newColor === state.getFinalColorValue();
  grid.setTileLocked(row, col, isNowFinal);

  if (state.checkWin()) onWin();
}

function handleHandClick(row, col) {
  // Hand resets tile to start — always unlock it so the player can click again
  const newColor = state.resetTileColor(row, col);
  grid.renderTile(row, col, newColor);
  grid.setTileLocked(row, col, false);
}

// ── PAUSE ─────────────────────────────────────────────────────────────────────

function handlePause(paused) {
  isPaused = paused;
  if (paused) {
    // Freeze state, send hands home, stop them launching
    state.freeze();
    hands.retreatAll();
    hands.setTargetColor(null);
  } else {
    // Unfreeze and start the countdown before hands resume
    state.unfreeze();
    panel.clearPause();
    showCountdown(currentLevel, () => {
      hands.setTargetColor(state.getFinalColorValue());
      hands.resumeAll();
    });
  }
}
//
// onWin()        — called the moment checkWin() returns true
// beginLevel(n)  — applies new level state + repaints board + starts countdown
// showCountdown  — overlay animation on the grid, calls back when done

function onWin() {
  // 1. Freeze state so no clicks or hand resets alter tiles during transition
  state.freeze();

  // 2. Send all moving hands home immediately
  hands.retreatAll();

  // 3. Advance level, load new state
  currentLevel++;
  beginLevel(currentLevel);
}

/**
 * Load a level: update state, repaint board and UI, show countdown.
 * Called for level 1 (first start) AND every subsequent win.
 *
 * @param {number} level
 */
function beginLevel(level) {
  const ROWS = grid.rows,
    COLS = grid.cols;

  // Update state for new level
  state.startLevel(level);

  // Repaint all tiles from fresh state
  grid.renderAll((r, c) => state.getTileColor(r, c));

  // Apply tile locks for any that start at final color
  const finalVal = state.getFinalColorValue();
  for (let r = 0; r < ROWS; r++) {
    for (let c = 0; c < COLS; c++) {
      grid.setTileLocked(r, c, state.getTileColor(r, c) === finalVal);
    }
  }

  // Update panel UI
  panel.updateSequence(state.getSequence());
  panel.updateLevel(level);
  panel.clearPause();

  // Apply new hand difficulty settings
  const settings = state.getLevelSettings(level);
  hands.setTargetColor(state.getFinalColorValue());
  hands.applySettings(settings);

  // Show countdown — hands resume and state unfreezes when it finishes
  showCountdown(level, () => {
    state.unfreeze();
    hands.resumeAll();
  });
}

/**
 * Display the countdown overlay on the grid area.
 * Shows "3 → 2 → 1 → GO!" with a scale-punch animation each tick.
 * Covers the grid only — the UI panel stays fully visible.
 *
 * @param {number}   level      shown as "Level N" above the countdown
 * @param {Function} onComplete called when countdown finishes
 */
function showCountdown(level, onComplete) {
  const TICKS = ["3", "2", "1", "GO!"];
  const TICK_MS = 1000; // ms per number
  const PUNCH_PEAK = 1.6; // max scale at start of each punch

  // Disable pause button for the duration of the countdown
  panel.setCountdownActive(true);

  // Overlay covers the full game area (grid + hands) in screen space.
  // gameAreaRect is stored by layoutGame() so it's always current.
  const overlay = new PIXI.Container();

  const gx = gameAreaRect.x;
  const gy = gameAreaRect.y;
  const gw = gameAreaRect.width;
  const gh = gameAreaRect.height;

  const bg = new PIXI.Graphics();
  bg.beginFill(0x000000, 0.55);
  bg.drawRect(gx, gy, gw, gh);
  bg.endFill();
  overlay.addChild(bg);

  // Level label
  const levelLabel = new PIXI.Text(`Level ${level}`, {
    fill: "#ffffff",
    fontSize: 22,
    fontWeight: "700",
    fontFamily: "sans-serif",
  });
  levelLabel.anchor.set(0.5, 0);
  levelLabel.x = gx + gw / 2;
  levelLabel.y = gy + gh * 0.28;
  overlay.addChild(levelLabel);

  // Countdown number (reused each tick)
  const countText = new PIXI.Text("", {
    fill: "#ffffff",
    fontSize: 96,
    fontWeight: "900",
    fontFamily: "sans-serif",
  });
  countText.anchor.set(0.5, 0.5);
  countText.x = gx + gw / 2;
  countText.y = gy + gh / 2;
  overlay.addChild(countText);

  // Add overlay above gameRoot but below the modal
  app.stage.addChildAt(overlay, app.stage.children.indexOf(panel._modal));

  let tickIndex = 0;

  function nextTick() {
    if (tickIndex >= TICKS.length) {
      app.stage.removeChild(overlay);
      panel.setCountdownActive(false);
      onComplete();
      return;
    }

    const label = TICKS[tickIndex++];
    countText.text = label;
    countText.scale.set(PUNCH_PEAK);

    // Animate scale punch: shrink from PUNCH_PEAK to 1.0 over TICK_MS
    const start = performance.now();
    const punchDone = label === "GO!" ? TICK_MS * 0.6 : TICK_MS;

    function animatePunch() {
      const t = Math.min((performance.now() - start) / punchDone, 1);
      const eased = 1 - Math.pow(1 - t, 2);
      const s = PUNCH_PEAK - (PUNCH_PEAK - 1.0) * eased;
      countText.scale.set(s);

      if (t < 1) {
        requestAnimationFrame(animatePunch);
      } else {
        // Brief pause at scale 1 before next tick (except GO! which exits immediately)
        const pause = label === "GO!" ? 200 : TICK_MS - punchDone;
        setTimeout(nextTick, Math.max(0, pause));
      }
    }

    requestAnimationFrame(animatePunch);
  }

  nextTick();
}

// ── GAME START ────────────────────────────────────────────────────────────────

function startGame() {
  const ROWS = 6,
    COLS = 6;
  currentLevel = 1;

  // 1. Initialize state object (rows/cols only — beginLevel sets the level)
  state = createGameState(ROWS, COLS);

  // 2. Create the single root container for all game visuals.
  gameRoot = new PIXI.Container();
  app.stage.addChild(gameRoot);

  // 3. Build grid renderer
  grid = new GridManager(app, ROWS, COLS, 60, 4, (row, col) => {
    handlePlayerClick(row, col);
  });

  // Move panel into gameRoot and lift modal to top of stage
  if (panel.container.parent)
    panel.container.parent.removeChild(panel.container);
  gameRoot.addChild(panel.container);
  gameRoot.addChild(grid.container);
  if (panel._modal.parent) panel._modal.parent.removeChild(panel._modal);
  app.stage.addChild(panel._modal);

  // 4. Build hands
  hands = new HandManager(
    app,
    grid,
    (row, col) => state.getTileColor(row, col),
    (row, col) => handleHandClick(row, col),
  );

  panel.container.visible = true;

  // 5. Layout first so grid dimensions are correct before countdown calculates
  //    overlay bounds
  layoutGame();

  // 6. beginLevel loads state, paints board, updates UI, and starts countdown
  beginLevel(currentLevel);
}

// ── TRANSITIONS ───────────────────────────────────────────────────────────────

function fadeOut(container, onComplete) {
  const duration = 600;
  const start = performance.now();
  const blur = new PIXI.BlurFilter();
  blur.blur = 0;
  container.filters = [blur];

  function animate() {
    const t = Math.min((performance.now() - start) / duration, 1);
    const eased = 1 - Math.pow(1 - t, 3);
    container.alpha = 1 - eased;
    blur.blur = eased * 20;
    container.scale.set(1 - eased * 0.1);
    if (t < 1) requestAnimationFrame(animate);
    else {
      container.visible = false;
      onComplete();
    }
  }

  requestAnimationFrame(animate);
}

function fadeIn(container, onComplete) {
  const duration = 600;
  const start = performance.now();
  container.alpha = 0;
  // DO NOT set scale here — layoutGame owns the scale
  const blur = new PIXI.BlurFilter();
  blur.blur = 20;
  container.filters = [blur];

  function animate() {
    const t = Math.min((performance.now() - start) / duration, 1);
    const eased = 1 - Math.pow(1 - t, 3);
    container.alpha = eased;
    blur.blur = (1 - eased) * 20;
    // scale is intentionally not touched here
    if (t < 1) requestAnimationFrame(animate);
    else {
      container.filters = [];
      onComplete && onComplete();
    }
  }

  requestAnimationFrame(animate);
}

// ── BOOT ──────────────────────────────────────────────────────────────────────

window.onload = async () => {
  const gameContainer = document.getElementById("game-container");

  // Get the header height so we can size the game area to fill everything below it.
  // This is more reliable than resizeTo:window which doesn't account for the header.
  function getGameSize() {
    const header = document.querySelector(".app-header");
    const headerH = header ? header.getBoundingClientRect().height : 0;
    return {
      w: window.innerWidth,
      h: window.innerHeight - headerH,
    };
  }

  const initSize = getGameSize();

  app = new PIXI.Application();
  await app.init({
    width: initSize.w,
    height: initSize.h,
    backgroundColor: 0x1f1f1f,
    antialias: true,
    // No resizeTo — we manage sizing ourselves to account for the header
  });

  // Size the container to fill the space below the header
  gameContainer.style.width = "100%";
  gameContainer.style.height = initSize.h + "px";
  gameContainer.style.overflow = "hidden";

  // Canvas fills its container exactly
  app.canvas.style.width = "100%";
  app.canvas.style.height = "100%";
  app.canvas.style.display = "block";

  gameContainer.appendChild(app.canvas);

  // Build panel but keep it hidden — it only shows once the game starts.
  panel = new GamePanel(
    app,
    () => layoutGame(),
    (isPaused) => handlePause(isPaused),
  );
  panel.container.visible = false;
  app.stage.addChild(panel.container);

  // ResizeObserver watches the WINDOW (via a small sentinel div) — not the
  // canvas itself — so it never triggers the canvas-crushes-itself feedback loop.
  const ro = new ResizeObserver(() => {
    const { w, h } = getGameSize();
    gameContainer.style.height = h + "px";
    app.renderer.resize(w, h);
    layoutGame();
  });
  ro.observe(document.documentElement);

  // Hero screen
  await PIXI.Assets.load(["images/hero.png"]);

  const heroScreen = new PIXI.Container();
  app.stage.addChild(heroScreen);

  const hero = PIXI.Sprite.from("images/hero.png");
  hero.anchor.set(0.5);
  hero.x = app.renderer.width / 2;
  hero.y = app.renderer.height / 2;
  heroScreen.addChild(hero);

  const startButton = createGlowButton(
    app,
    "START",
    app.renderer.width / 2,
    app.renderer.height / 2 + 200,
  );

  startButton.on("pointerdown", () => {
    fadeOut(heroScreen, () => startGame());
  });

  heroScreen.addChild(startButton);
};
