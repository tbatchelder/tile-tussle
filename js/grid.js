// grid.js
//
// RENDERING LAYER — responsible for drawing tiles and nothing else.
//
// ARCHITECTURE RULE:
//   GridManager does NOT make game decisions.
//   It does NOT store what color a tile "should" be.
//   It only draws what state.js tells it to draw.
//
// The one exception: it listens to pointerdown on tiles and forwards
// that event upward via onTileClick(row, col) — a callback set by main.js.
// The callback is what calls state.cycleColor() and then re-renders.
// GridManager never calls state directly.

export class GridManager {
  /**
   * @param {PIXI.Application} app
   * @param {number} rows
   * @param {number} cols
   * @param {number} tileSize
   * @param {number} padding
   * @param {Function} onTileClick  callback(row, col) — wired up in main.js
   */
  constructor(
    app,
    rows = 6,
    cols = 6,
    tileSize = 60,
    padding = 4,
    onTileClick = null,
  ) {
    this.app = app;
    this.rows = rows;
    this.cols = cols;
    this.tileSize = tileSize;
    this.padding = padding;

    // Called by main.js when a tile is tapped/clicked.
    // GridManager fires it; main.js decides what to do with it.
    this.onTileClick = onTileClick;

    this.container = new PIXI.Container();
    this.tiles = []; // 2D array of PIXI.Graphics — visual objects ONLY

    this.buildGrid();
  }

  // ── BUILD ──────────────────────────────────────────────────────────────────

  buildGrid() {
    for (let row = 0; row < this.rows; row++) {
      this.tiles[row] = [];
      for (let col = 0; col < this.cols; col++) {
        const tile = this.createTile(row, col);
        this.tiles[row][col] = tile;
        this.container.addChild(tile);
      }
    }
    // Initial position — will be properly centred by layoutGame() in main.js
    this.container.x = 0;
    this.container.y = 0;
  }

  createTile(row, col) {
    const tile = new PIXI.Graphics();

    tile.beginFill(0x333333);
    tile.drawRect(0, 0, this.tileSize, this.tileSize);
    tile.endFill();

    tile.x = col * (this.tileSize + this.padding);
    tile.y = row * (this.tileSize + this.padding);

    tile.eventMode = "static";
    tile.cursor = "pointer";

    // Lock overlay — sits on top of the tile color, invisible until locked.
    // Drawn as a child so it moves and scales with the tile automatically.
    const overlay = new PIXI.Graphics();
    overlay.beginFill(0x000000, 0.35);
    overlay.drawRect(0, 0, this.tileSize, this.tileSize);
    overlay.endFill();

    // Small "locked" indicator — a padlock-ish dot cluster in the centre
    overlay.beginFill(0xffffff, 0.25);
    overlay.drawRoundedRect(
      this.tileSize * 0.35,
      this.tileSize * 0.35,
      this.tileSize * 0.3,
      this.tileSize * 0.3,
      3,
    );
    overlay.endFill();

    overlay.visible = false;
    tile.addChild(overlay);
    tile._lockOverlay = overlay; // stored for easy access in setTileLocked

    // Forward the click upward. GridManager does NOT handle game logic here.
    tile.on("pointerdown", () => {
      if (this.onTileClick) this.onTileClick(row, col);
    });

    return tile;
  }

  // ── RENDERING ─────────────────────────────────────────────────────────────

  /**
   * Repaint a single tile to the given color.
   * Called by main.js after state.cycleColor() returns the new value.
   */
  renderTile(row, col, colorValue) {
    const tile = this.tiles[row][col];
    tile.clear();
    tile.beginFill(colorValue);
    tile.drawRect(0, 0, this.tileSize, this.tileSize);
    tile.endFill();
    // Re-add overlay as child after clear() — clear() removes all drawn content
    // but does NOT remove children, so the overlay child is still there. However
    // we re-draw the base rect which is fine; overlay sits on top as a child.
  }

  /**
   * Lock or unlock a tile for player interaction.
   * Locked tiles show a dim overlay and a "no entry" cursor.
   * Hands are unaffected — they use state directly, not tile events.
   *
   * @param {number}  row
   * @param {number}  col
   * @param {boolean} locked
   */
  setTileLocked(row, col, locked) {
    const tile = this.tiles[row][col];
    tile.cursor = locked ? "not-allowed" : "pointer";
    tile._lockOverlay.visible = locked;
  }

  /**
   * Repaint every tile on the board from a full 2D colorValue source.
   * Call this after startLevel() to paint the initial board state.
   *
   * @param {Function} getColor  (row, col) => colorValue
   */
  renderAll(getColor) {
    for (let r = 0; r < this.rows; r++) {
      for (let c = 0; c < this.cols; c++) {
        this.renderTile(r, c, getColor(r, c));
      }
    }
  }

  // ── LAYOUT ────────────────────────────────────────────────────────────────
  //
  // main.js now sets grid.container.scale / .x / .y directly in layoutGame().
  // This method is kept as a convenience no-op so any call that predates the
  // new layout system doesn't crash.
  centerGrid() {}
}
