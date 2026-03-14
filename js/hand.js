// hand.js
//
// RENDERING + ANIMATION LAYER for the enemy hands.
//
// ARCHITECTURE RULE:
//   HandManager does NOT own tile color data.
//   It reads tile colors from state via getTileColor(row, col).
//   It advances tile colors via onHandClick(row, col) — a callback set by main.js.
//   main.js is the one that calls state.cycleColor() and grid.renderTile().
//
// HandManager only knows: where to move, when to move, and when it has arrived.
// What happens to the tile when it arrives is not HandManager's business.
//
// NAMING CONVENTION:
//   hand.side  = "left" | "right" | "top" | "bottom"
//   hand.index = row index (left/right) or col index (top/bottom)

export class HandManager {
  /**
   * @param {PIXI.Application} app
   * @param {GridManager}      grid
   * @param {Function}         getTileColor   (row, col) => colorValue  — reads state
   * @param {Function}         onHandClick    (row, col) => void        — mutates state + re-renders
   */
  constructor(app, grid, getTileColor, onHandClick) {
    this.app = app;
    this.grid = grid;

    // These are injected by main.js so HandManager never imports state directly.
    this.getTileColor = getTileColor;
    this.onHandClick = onHandClick;

    // The color value hands are hunting for.
    // Set by main.js via setTargetColor() when a new level starts.
    this.targetColor = null;

    this.hands = [];
    this.claimedTiles = new Set(); // "row,col" strings

    // ── CONCURRENCY CONTROL ──────────────────────────────────────────────────
    // How many hands are currently in an active (creeping or fast) state.
    // Retreating hands do NOT count — they are no longer a threat.
    this.activeCount = 0;

    // Set by applySettings() when a level starts. Defaults are very
    // conservative so the game is playable before the first call.
    this.maxActive = 1;
    this.cooldownMs = 8000;
    // ────────────────────────────────────────────────────────────────────────

    this.gap = 25;
    this.creepSpeed = 0.5;
    this.fastSpeed = 3.0;

    this.createHands();
    this.positionHands();

    this.app.ticker.add((ticker) => this.update(ticker.deltaTime));
  }

  /**
   * Immediately send every active hand home.
   * Called on win — hands retreat before the countdown starts.
   * Slapped hands stay slapped (they're already out of play).
   */
  retreatAll() {
    for (const hand of this.hands) {
      if (hand.state === "creeping" || hand.state === "fast") {
        // Release active slot and claimed tile before forcing retreat
        this.activeCount--;
        if (hand.targetTile) {
          this.claimedTiles.delete(
            `${hand.targetTile.row},${hand.targetTile.col}`,
          );
          hand.targetTile = null;
        }
        hand.state = "retreating";
      } else if (hand.state === "idle") {
        // Push idle hands' next move time far into the future so they
        // don't launch during the countdown. Will be reset by applySettings.
        hand.nextMoveTime = performance.now() + 999999;
      }
    }
  }

  /**
   * Reset all hands to idle with a fresh cooldown.
   * Called after the countdown ends to resume normal play.
   */
  resumeAll() {
    for (const hand of this.hands) {
      if (hand.state === "slapped") continue;
      // Let retreating hands finish naturally; only reset idle ones
      if (hand.state === "idle") {
        hand.nextMoveTime = performance.now() + this.cooldown();
      }
    }
  }
  /* Called from main.js after startLevel() sets up the sequence.
   *
   * @param {number|null} color  Pixi hex value e.g. 0xE69F00, or null to freeze hands
   */
  setTargetColor(color) {
    this.targetColor = color;
  }

  /**
   * Apply difficulty settings from the HAND_SCHEDULE for the current level.
   * Call this from main.js every time a new level starts.
   *
   * @param {{ maxActive: number, cooldownMs: number }} settings
   */
  applySettings(settings) {
    this.maxActive = settings.maxActive;
    this.cooldownMs = settings.cooldownMs;
  }

  // ── CREATE ─────────────────────────────────────────────────────────────────

  createHands() {
    const sides = ["left", "right", "top", "bottom"];

    for (let side of sides) {
      for (let i = 0; i < this.grid.rows; i++) {
        const hand = this.createHandSprite();
        hand.side = side;
        hand.index = i;
        hand.state = "idle";
        hand.targetTile = null;
        hand.nextMoveTime = performance.now() + this.cooldown();

        this.grid.container.addChild(hand);
        this.hands.push(hand);
      }
    }
  }

  // Triangle pointing RIGHT in local space. Pivot at blunt end center.
  createHandSprite() {
    const ts = this.grid.tileSize;
    const handLen = ts;
    const halfH = ts * 0.5;

    const hand = new PIXI.Graphics();

    hand.beginFill(0xffcc00);
    hand.drawPolygon([0, 0, handLen, halfH, 0, ts]);
    hand.endFill();

    hand.beginFill(0xff9944, 0.5);
    hand.drawRect(0, halfH - 3, handLen * 0.65, 6);
    hand.endFill();

    hand.pivot.set(0, halfH);
    hand.eventMode = "static";
    hand.cursor = "pointer";
    hand.on("pointerdown", () => this.slapHand(hand));

    hand._handLen = handLen;

    return hand;
  }

  // ── POSITION ───────────────────────────────────────────────────────────────

  positionHands() {
    const ts = this.grid.tileSize;
    const pad = this.grid.padding;
    const L = this.grid.tileSize;
    const gap = this.gap;
    const totalW = this.getTotalW();
    const totalH = this.getTotalH();

    for (let hand of this.hands) {
      const i = hand.index;
      const lane = i * (ts + pad) + ts / 2;

      switch (hand.side) {
        case "left":
          hand.rotation = 0;
          hand.x = -gap - L;
          hand.y = lane;
          break;
        case "right":
          hand.rotation = Math.PI;
          hand.x = totalW + gap + L;
          hand.y = lane;
          break;
        case "top":
          hand.rotation = Math.PI / 2;
          hand.x = lane;
          hand.y = -gap - L;
          break;
        case "bottom":
          hand.rotation = -Math.PI / 2;
          hand.x = lane;
          hand.y = totalH + gap + L;
          break;
      }

      hand.homeX = hand.x;
      hand.homeY = hand.y;
    }
  }

  // ── TIP POSITION (local space) ─────────────────────────────────────────────

  tipX(hand) {
    if (hand.side === "left") return hand.x + hand._handLen;
    if (hand.side === "right") return hand.x - hand._handLen;
    return hand.x;
  }

  tipY(hand) {
    if (hand.side === "top") return hand.y + hand._handLen;
    if (hand.side === "bottom") return hand.y - hand._handLen;
    return hand.y;
  }

  // ── TILE SCANNING ──────────────────────────────────────────────────────────
  //
  // KEY CHANGE: reads tile color from state (via this.getTileColor),
  // NOT from tile.tint. The visual object is never consulted for logic.

  findEligibleTiles(hand) {
    if (this.targetColor === null) return [];

    const ts = this.grid.tileSize;
    const pad = this.grid.padding;
    const half = ts / 2;
    const results = [];

    const tileMatches = (row, col) =>
      this.getTileColor(row, col) === this.targetColor;

    const claimKey = (row, col) => `${row},${col}`;

    if (hand.side === "left" || hand.side === "right") {
      const row = hand.index;
      for (let col = 0; col < this.grid.cols; col++) {
        if (
          tileMatches(row, col) &&
          !this.claimedTiles.has(claimKey(row, col))
        ) {
          results.push({
            row,
            col,
            centerX: col * (ts + pad) + half,
            centerY: row * (ts + pad) + half,
          });
        }
      }
    }

    if (hand.side === "top" || hand.side === "bottom") {
      const col = hand.index;
      for (let row = 0; row < this.grid.rows; row++) {
        if (
          tileMatches(row, col) &&
          !this.claimedTiles.has(claimKey(row, col))
        ) {
          results.push({
            row,
            col,
            centerX: col * (ts + pad) + half,
            centerY: row * (ts + pad) + half,
          });
        }
      }
    }

    return results;
  }

  shouldHandMove(hand) {
    const eligible = this.findEligibleTiles(hand);
    if (eligible.length === 0) return false;

    // Pick randomly from all eligible tiles in this lane so the hands are
    // unpredictable. A player should never be able to "hide" tiles by working
    // from a predictable direction — any final-color tile in the lane is fair game.
    const target = eligible[Math.floor(Math.random() * eligible.length)];

    this.claimedTiles.add(`${target.row},${target.col}`);
    hand.targetTile = target;
    return true;
  }

  // ── UPDATE LOOP ────────────────────────────────────────────────────────────

  update(delta) {
    const safeDelta = Math.min(delta, 1);
    const now = performance.now();

    for (let hand of this.hands) {
      if (hand.state === "slapped") continue;

      if (hand.state === "idle" && now >= hand.nextMoveTime) {
        // Only launch if we're under the concurrency limit for this level
        if (this.activeCount < this.maxActive && this.shouldHandMove(hand)) {
          hand.state = "creeping";
          this.activeCount++; // slot consumed — hand is now active
        } else {
          // Nothing to do yet — check again after a short retry interval
          hand.nextMoveTime = now + 500 + Math.random() * 500;
        }
      }

      if (hand.state === "creeping") this.moveHandCreep(hand, safeDelta);
      if (hand.state === "fast") this.moveHandFast(hand, safeDelta);
      if (hand.state === "retreating") this.moveHandRetreat(hand, safeDelta);
    }
  }

  /**
   * Returns a cooldown duration in ms for a hand returning home.
   * Uses this.cooldownMs (set by applySettings) plus a random jitter
   * so hands don't all fire in perfect synchrony.
   */
  cooldown() {
    return this.cooldownMs + Math.random() * 2000;
  }

  // ── MOVEMENT ───────────────────────────────────────────────────────────────

  advanceHand(hand, speed) {
    if (hand.side === "left") hand.x += speed;
    if (hand.side === "right") hand.x -= speed;
    if (hand.side === "top") hand.y += speed;
    if (hand.side === "bottom") hand.y -= speed;
  }

  moveHandCreep(hand, delta) {
    this.advanceHand(hand, this.creepSpeed * delta);
    if (this.isTipOnGrid(hand)) hand.state = "fast";
  }

  moveHandFast(hand, delta) {
    this.advanceHand(hand, this.fastSpeed * delta);
    if (this.hasTipReachedTarget(hand)) {
      this.arriveAtTile(hand);
      hand.state = "retreating";
      this.activeCount--; // slot released — retreating is not a threat
    }
  }

  moveHandRetreat(hand, delta) {
    hand.x += (hand.homeX - hand.x) * 0.15 * delta;
    hand.y += (hand.homeY - hand.y) * 0.15 * delta;

    if (
      Math.abs(hand.x - hand.homeX) < 0.5 &&
      Math.abs(hand.y - hand.homeY) < 0.5
    ) {
      hand.x = hand.homeX;
      hand.y = hand.homeY;
      hand.state = "idle";
      hand.nextMoveTime = performance.now() + this.cooldown();

      if (hand.targetTile) {
        this.claimedTiles.delete(
          `${hand.targetTile.row},${hand.targetTile.col}`,
        );
        hand.targetTile = null;
      }
    }
  }

  // ── GRID CHECKS ────────────────────────────────────────────────────────────

  getTotalW() {
    return (
      this.grid.cols * (this.grid.tileSize + this.grid.padding) -
      this.grid.padding
    );
  }
  getTotalH() {
    return (
      this.grid.rows * (this.grid.tileSize + this.grid.padding) -
      this.grid.padding
    );
  }

  isTipOnGrid(hand) {
    if (hand.side === "left") return this.tipX(hand) >= 0;
    if (hand.side === "right") return this.tipX(hand) <= this.getTotalW();
    if (hand.side === "top") return this.tipY(hand) >= 0;
    if (hand.side === "bottom") return this.tipY(hand) <= this.getTotalH();
  }

  hasTipReachedTarget(hand) {
    if (!hand.targetTile) return false;
    const { centerX, centerY } = hand.targetTile;
    if (hand.side === "left") return this.tipX(hand) >= centerX;
    if (hand.side === "right") return this.tipX(hand) <= centerX;
    if (hand.side === "top") return this.tipY(hand) >= centerY;
    if (hand.side === "bottom") return this.tipY(hand) <= centerY;
  }

  // ── ARRIVE AT TILE ─────────────────────────────────────────────────────────
  //
  // KEY CHANGE: renamed from clickTile(). No longer touches tile.tint.
  // Delegates entirely to the callback injected by main.js,
  // which handles state mutation and re-rendering.

  arriveAtTile(hand) {
    if (!hand.targetTile) return;
    const { row, col } = hand.targetTile;

    // Tell main.js "a hand just landed here" — it handles everything else.
    if (this.onHandClick) this.onHandClick(row, col);
  }

  // ── SLAP ───────────────────────────────────────────────────────────────────

  slapHand(hand) {
    if (hand.state === "slapped") return;

    // Release the active slot if this hand was advancing
    if (hand.state === "creeping" || hand.state === "fast") {
      this.activeCount--;
    }

    hand.state = "slapped";

    if (hand.targetTile) {
      this.claimedTiles.delete(`${hand.targetTile.row},${hand.targetTile.col}`);
      hand.targetTile = null;
    }

    const ox = hand.x,
      oy = hand.y;
    let t = 0;

    const shake = () => {
      t += 0.15;
      hand.x = ox + Math.sin(t * 25) * 5;
      hand.y = oy + Math.sin(t * 25 + 1) * 2;
      if (t < 1) requestAnimationFrame(shake);
      else this.respawnHand(hand);
    };

    shake();
  }

  respawnHand(hand) {
    hand.x = hand.homeX;
    hand.y = hand.homeY;
    hand.state = "idle";
    hand.nextMoveTime = performance.now() + this.cooldown();
  }
}
