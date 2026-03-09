// hand.js
//
// NAMING CONVENTION:
//   hand.side  = which side of the grid the hand sits on: "left" | "right" | "top" | "bottom"
//   hand.index = which lane: row index for left/right sides, col index for top/bottom sides
//
//   The hand always points TOWARD the grid and moves TOWARD it.
//
//   side "left"   → sits LEFT of grid,  points RIGHT, moves right  (rotation = 0)
//   side "right"  → sits RIGHT of grid, points LEFT,  moves left   (rotation = PI)
//   side "top"    → sits ABOVE grid,    points DOWN,  moves down   (rotation = PI/2)
//   side "bottom" → sits BELOW grid,    points UP,    moves up     (rotation = -PI/2)

export class HandManager {
  constructor(app, grid, targetColor = null) {
    this.app = app;
    this.grid = grid;
    this.targetColor = targetColor; // hex number e.g. 0xff0000. null = hands frozen.

    this.hands = [];

    // Tiles currently claimed by a moving hand. Prevents two hands targeting
    // the same tile simultaneously. Stored as "row,col" strings.
    this.claimedTiles = new Set();

    // All speed values are in LOCAL grid coords per ticker delta unit.
    this.gap = 25;
    this.creepSpeed = 0.5;
    this.fastSpeed = 3.0;

    this.createHands();
    this.positionHands();

    this.app.ticker.add((ticker) => this.update(ticker.deltaTime));
  }

  // -------------------------------------------------------
  // PUBLIC API — call from game logic when the target color changes
  // -------------------------------------------------------
  setTargetColor(color) {
    this.targetColor = color;
  }

  // -------------------------------------------------------
  // CREATE
  // -------------------------------------------------------
  createHands() {
    const sides = ["left", "right", "top", "bottom"];

    for (let side of sides) {
      for (let i = 0; i < this.grid.rows; i++) {
        const hand = this.createHandSprite();
        hand.side = side;
        hand.index = i;
        hand.state = "idle";
        hand.targetTile = null; // { row, col, tile } — set when hand starts moving
        hand.nextMoveTime = performance.now() + this.randomDelay();

        this.grid.container.addChild(hand);
        this.hands.push(hand);
      }
    }
  }

  // -------------------------------------------------------
  // SHAPE
  //
  // Triangle drawn pointing RIGHT in local space:
  //   base-top (0, 0) · tip (handLen, halfH) · base-bot (0, ts)
  //   pivot at (0, halfH) — blunt end center
  // -------------------------------------------------------
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

  // -------------------------------------------------------
  // POSITION — all local coordinates, no scaling math needed.
  // Hands are grid.container children so scale/resize is free.
  // -------------------------------------------------------
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

  // -------------------------------------------------------
  // TIP POSITION (local space)
  // Tip is always handLen ahead of pivot in the pointing direction.
  // -------------------------------------------------------
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

  // -------------------------------------------------------
  // TILE SCANNING
  //
  // Find all tiles in this hand's lane that match targetColor
  // and are not already claimed by another hand.
  //
  // For left/right: lane = row `hand.index`, scan all cols.
  // For top/bottom: lane = col `hand.index`, scan all rows.
  //
  // Returns array of { row, col, tile, centerX, centerY }
  // -------------------------------------------------------
  findEligibleTiles(hand) {
    if (this.targetColor === null) return [];

    const ts = this.grid.tileSize;
    const pad = this.grid.padding;
    const half = ts / 2;
    const results = [];

    const tileMatches = (tile) => {
      // Tint 0xffffff means "no tint applied" = original color.
      // Compare against targetColor. When real tile color data exists,
      // swap this for tile.colorValue === this.targetColor.
      return tile.tint === this.targetColor;
    };

    const claimKey = (row, col) => `${row},${col}`;

    if (hand.side === "left" || hand.side === "right") {
      const row = hand.index;
      for (let col = 0; col < this.grid.cols; col++) {
        const tile = this.grid.tiles[row][col];
        if (tileMatches(tile) && !this.claimedTiles.has(claimKey(row, col))) {
          results.push({
            row,
            col,
            tile,
            centerX: col * (ts + pad) + half,
            centerY: row * (ts + pad) + half,
          });
        }
      }
    }

    if (hand.side === "top" || hand.side === "bottom") {
      const col = hand.index;
      for (let row = 0; row < this.grid.rows; row++) {
        const tile = this.grid.tiles[row][col];
        if (tileMatches(tile) && !this.claimedTiles.has(claimKey(row, col))) {
          results.push({
            row,
            col,
            tile,
            centerX: col * (ts + pad) + half,
            centerY: row * (ts + pad) + half,
          });
        }
      }
    }

    return results;
  }

  // -------------------------------------------------------
  // SHOULD THIS HAND MOVE?
  //
  // Scans lane for eligible tiles. If found, claims the closest
  // one (nearest to the hand's entry edge) and stores it on the hand.
  // -------------------------------------------------------
  shouldHandMove(hand) {
    const eligible = this.findEligibleTiles(hand);
    if (eligible.length === 0) return false;

    // Pick the tile closest to this hand's entry edge
    // so it doesn't have to travel further than necessary.
    let target;
    if (hand.side === "left") {
      target = eligible.reduce((a, b) => (a.col < b.col ? a : b));
    } else if (hand.side === "right") {
      target = eligible.reduce((a, b) => (a.col > b.col ? a : b));
    } else if (hand.side === "top") {
      target = eligible.reduce((a, b) => (a.row < b.row ? a : b));
    } else {
      // bottom
      target = eligible.reduce((a, b) => (a.row > b.row ? a : b));
    }

    // Claim it so no other hand can take it
    this.claimedTiles.add(`${target.row},${target.col}`);
    hand.targetTile = target;

    return true;
  }

  // -------------------------------------------------------
  // UPDATE
  // -------------------------------------------------------
  update(delta) {
    const safeDelta = Math.min(delta, 1);
    const now = performance.now();

    for (let hand of this.hands) {
      if (hand.state === "slapped") continue;

      if (hand.state === "idle" && now >= hand.nextMoveTime) {
        if (this.shouldHandMove(hand)) {
          hand.state = "creeping";
        } else {
          hand.nextMoveTime = now + this.randomDelay();
        }
      }

      if (hand.state === "creeping") this.moveHandCreep(hand, safeDelta);
      if (hand.state === "fast") this.moveHandFast(hand, safeDelta);
      if (hand.state === "retreating") this.moveHandRetreat(hand, safeDelta);
    }
  }

  randomDelay() {
    return 1000 + Math.random() * 3000;
  }

  // -------------------------------------------------------
  // MOVEMENT
  // -------------------------------------------------------
  advanceHand(hand, speed) {
    if (hand.side === "left") hand.x += speed;
    if (hand.side === "right") hand.x -= speed;
    if (hand.side === "top") hand.y += speed;
    if (hand.side === "bottom") hand.y -= speed;
  }

  // Creep until tip crosses the grid edge, then switch to fast
  moveHandCreep(hand, delta) {
    this.advanceHand(hand, this.creepSpeed * delta);
    if (this.isTipOnGrid(hand)) hand.state = "fast";
  }

  // Fast until tip reaches the center of the target tile
  moveHandFast(hand, delta) {
    this.advanceHand(hand, this.fastSpeed * delta);
    if (this.hasTipReachedTarget(hand)) {
      this.clickTile(hand);
      hand.state = "retreating";
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
      hand.nextMoveTime = performance.now() + this.randomDelay();
      // Release the claimed tile so other hands can target it next round
      if (hand.targetTile) {
        this.claimedTiles.delete(
          `${hand.targetTile.row},${hand.targetTile.col}`,
        );
        hand.targetTile = null;
      }
    }
  }

  // -------------------------------------------------------
  // GRID CHECKS
  // -------------------------------------------------------
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

  // Tip has crossed the grid edge → switch from creep to fast
  isTipOnGrid(hand) {
    if (hand.side === "left") return this.tipX(hand) >= 0;
    if (hand.side === "right") return this.tipX(hand) <= this.getTotalW();
    if (hand.side === "top") return this.tipY(hand) >= 0;
    if (hand.side === "bottom") return this.tipY(hand) <= this.getTotalH();
  }

  // Tip has reached the center of the claimed target tile → click and retreat
  hasTipReachedTarget(hand) {
    if (!hand.targetTile) return false;
    const { centerX, centerY } = hand.targetTile;
    if (hand.side === "left") return this.tipX(hand) >= centerX;
    if (hand.side === "right") return this.tipX(hand) <= centerX;
    if (hand.side === "top") return this.tipY(hand) >= centerY;
    if (hand.side === "bottom") return this.tipY(hand) <= centerY;
  }

  // -------------------------------------------------------
  // CLICK TILE — tip is at target tile center
  // -------------------------------------------------------
  clickTile(hand) {
    if (!hand.targetTile) return;
    const { tile } = hand.targetTile;

    // TODO: replace with real game logic — cycle tile to next color in sequence
    // For now: reset tint to white (base color) as a visible dummy effect
    tile.tint = 0xaaaaaa;
  }

  // -------------------------------------------------------
  // SLAP — player stops this hand by clicking it
  // -------------------------------------------------------
  slapHand(hand) {
    if (hand.state === "slapped") return;
    hand.state = "slapped";

    // Release the claim immediately on slap so other hands can take over
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
    hand.nextMoveTime = performance.now() + this.randomDelay();
  }
}
