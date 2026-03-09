export class GridManager {
  constructor(app, rows = 6, cols = 6, tileSize = 60, padding = 4) {
    this.app = app;
    this.rows = rows;
    this.cols = cols;
    this.tileSize = tileSize;
    this.padding = padding;

    this.container = new PIXI.Container();
    this.tiles = [];

    this.buildGrid();
  }

  buildGrid() {
    for (let row = 0; row < this.rows; row++) {
      this.tiles[row] = [];

      for (let col = 0; col < this.cols; col++) {
        const tile = this.createTile(row, col);
        this.tiles[row][col] = tile;
        this.container.addChild(tile);
      }
    }

    this.centerGrid();
  }

  createTile(row, col) {
    const tile = new PIXI.Graphics();
    tile.beginFill(0x00aaff);
    tile.drawRect(0, 0, this.tileSize, this.tileSize);
    tile.endFill();

    tile.x = col * (this.tileSize + this.padding);
    tile.y = row * (this.tileSize + this.padding);

    tile.eventMode = "static";
    tile.cursor = "pointer";

    tile.on("pointerdown", () => {
      tile.tint = Math.random() * 0xffffff;
    });

    return tile;
  }

  computeGridScale(totalWidth, totalHeight) {
    const viewportWidth = this.app.renderer.width;
    const viewportHeight = this.app.renderer.height;

    const maxWidth = viewportWidth * 0.9;
    const maxHeight = viewportHeight * 0.9;

    const scaleX = maxWidth / totalWidth;
    const scaleY = maxHeight / totalHeight;

    const scale = Math.min(scaleX, scaleY);

    return Math.min(2.0, Math.max(0.5, scale));
  }

  centerGrid() {
    const totalWidth =
      this.cols * (this.tileSize + this.padding) - this.padding;
    const totalHeight =
      this.rows * (this.tileSize + this.padding) - this.padding;

    const scale = this.computeGridScale(totalWidth, totalHeight);
    this.container.scale.set(scale);

    const scaledWidth = totalWidth * scale;
    const scaledHeight = totalHeight * scale;

    this.container.x = (this.app.renderer.width - scaledWidth) / 2;
    this.container.y = (this.app.renderer.height - scaledHeight) / 2;
  }
}
