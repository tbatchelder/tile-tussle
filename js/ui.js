// ui.js
//
// UI COMPONENTS for Tile Tussle.
//
// EXPORTS
//   createGlowButton(app, labelText, x, y)       → PIXI.Container
//   GamePanel(app, onSettingsChanged, onPause)    → GamePanel instance

// ─────────────────────────────────────────────────────────────────────────────
// GLOW BUTTON
// ─────────────────────────────────────────────────────────────────────────────

export function createGlowButton(app, labelText, x, y) {
  const button = new PIXI.Container();
  button.x = x;
  button.y = y;
  button.eventMode = "static";
  button.cursor = "pointer";

  const glow = new PIXI.Graphics();
  glow.beginFill(0xffffff, 0.25);
  glow.drawRoundedRect(-120, -40, 240, 80, 20);
  glow.endFill();
  glow.alpha = 0.6;

  const base = new PIXI.Graphics();
  base.beginFill(0x7ecbff);
  base.drawRoundedRect(-100, -30, 200, 60, 16);
  base.endFill();

  const label = new PIXI.Text(labelText, {
    fill: "#1a1a1a",
    fontSize: 36,
    fontWeight: "900",
  });
  label.anchor.set(0.5);

  button.addChild(glow, base, label);

  let t = 0;
  app.ticker.add(() => {
    t += 0.05;
    const pulse = 1 + Math.sin(t) * 0.08;
    glow.scale.set(pulse);
    glow.alpha = 0.5 + Math.sin(t) * 0.2;
  });

  return button;
}

// ─────────────────────────────────────────────────────────────────────────────
// CONSTANTS
// ─────────────────────────────────────────────────────────────────────────────

const PANEL_BG = 0x2a2a2a;
const PANEL_BORDER = 0x444444;
const TEXT_COLOR = "#cccccc";
const TEXT_COLOR_DIM = "#888888";
const POWER_IDLE_BG = 0x3a3a3a;
const POWER_IDLE_FILL = 0x555555;
const POWER_GOOD_FILL = 0x22aa55;
const POWER_BAD_FILL = 0xcc3333;
const PADDING = 12;

// Side columns — reserved width on each side for level number and buttons
const SIDE_COL_W = 52;

// Instruction label — centred in middle column
const INSTR_FONT_SIZE = 18;
const INSTR_H = 22;

// Final color rect — fixed width, centred in middle column
const FINAL_W = 130;
const FINAL_H = 32;

// Sequence boxes
const SEQ_BOX_W = 40;
const SEQ_BOX_H = 26;
const SEQ_ARROW_W = 16;

const POWER_BAR_H = 26;

// Icon buttons (gear + pause) — square with rounded corners
const ICON_BTN_SIZE = 28; // outer size of the button background
const ICON_FONT_SIZE = 18; // glyph size inside

// Level number
const LEVEL_FONT_SIZE = 36;

// Portrait panel height — must stay in sync with _layoutContents()
const PORTRAIT_H =
  PADDING + // top gap
  INSTR_H + // instruction label
  PADDING * 0.5 +
  FINAL_H + // final color rect
  PADDING +
  SEQ_BOX_H + // sequence strip
  PADDING +
  POWER_BAR_H + // power bar
  PADDING * 1.5; // bottom gap

// Landscape side panel width
const LANDSCAPE_W = 220;

// ─────────────────────────────────────────────────────────────────────────────
// GAME PANEL
// ─────────────────────────────────────────────────────────────────────────────

export class GamePanel {
  /**
   * @param {PIXI.Application} app
   * @param {Function} onSettingsChanged  called when panel side setting changes
   * @param {Function} onPause            called with (isPaused: boolean) when
   *                                      pause/resume is toggled
   */
  constructor(app, onSettingsChanged, onPause) {
    this.app = app;
    this.onSettingsChanged = onSettingsChanged;
    this.onPause = onPause;

    this._power = null;
    this._sequence = null;
    this._level = 1;
    this._paused = false;
    this._countdownActive = false; // pause disabled during countdown
    this._panelW = 0;
    this._panelH = 0;

    this.container = new PIXI.Container();

    this._buildPanel();
    this._buildSettingsModal();

    this.app.ticker.add((ticker) => this._tickPower(ticker.deltaMS));
  }

  // ── SIZING HELPERS ────────────────────────────────────────────────────────

  portraitHeight() {
    return PORTRAIT_H;
  }
  landscapeWidth() {
    return LANDSCAPE_W;
  }

  // ── BUILD ─────────────────────────────────────────────────────────────────

  _buildPanel() {
    this._bg = new PIXI.Graphics();
    this.container.addChild(this._bg);

    // LEFT COLUMN — "Level" label + number
    this._levelWordLabel = new PIXI.Text("Level", {
      fill: TEXT_COLOR_DIM,
      fontSize: 11,
      fontWeight: "600",
      fontFamily: "sans-serif",
    });
    this._levelWordLabel.anchor.set(0.5, 0.5);
    this.container.addChild(this._levelWordLabel);

    this._levelLabel = new PIXI.Text("1", {
      fill: "#ffffff",
      fontSize: LEVEL_FONT_SIZE,
      fontWeight: "900",
      fontFamily: "sans-serif",
    });
    this._levelLabel.anchor.set(0.5, 0.5);
    this.container.addChild(this._levelLabel);

    // CENTRE COLUMN

    // 1. Instruction label
    this._instrLabel = new PIXI.Text("Turn all tiles:", {
      fill: TEXT_COLOR,
      fontSize: INSTR_FONT_SIZE,
      fontWeight: "600",
      fontFamily: "sans-serif",
    });
    this._instrLabel.anchor.set(0.5, 0);
    this.container.addChild(this._instrLabel);

    // 2. Final color rect
    this._finalRect = new PIXI.Graphics();
    this.container.addChild(this._finalRect);

    // 3. Sequence strip
    this._seqContainer = new PIXI.Container();
    this.container.addChild(this._seqContainer);

    // 4. Power bar
    this._powerBg = new PIXI.Graphics();
    this._powerFill = new PIXI.Graphics();
    this._powerLabel = new PIXI.Text("No Power Active", {
      fill: TEXT_COLOR_DIM,
      fontSize: 11,
      fontFamily: "sans-serif",
    });
    this._powerLabel.anchor.set(0.5, 0.5);
    this.container.addChild(this._powerBg, this._powerFill, this._powerLabel);

    // RIGHT COLUMN — gear (top) + pause (below)
    this._gearBtn = this._makeIconBtn("\u2699", () => this._openSettings());
    this._pauseBtn = this._makeIconBtn("\u23f8", () => this._togglePause());
    this.container.addChild(this._gearBtn);
    this.container.addChild(this._pauseBtn);
  }

  // ── ICON BUTTON FACTORY ───────────────────────────────────────────────────

  _makeIconBtn(glyph, onClick) {
    const btn = new PIXI.Container();
    btn.eventMode = "static";
    btn.cursor = "pointer";

    const bg = new PIXI.Graphics();
    bg.beginFill(0x444444, 0.8);
    bg.drawRoundedRect(0, 0, ICON_BTN_SIZE, ICON_BTN_SIZE, 5);
    bg.endFill();

    const icon = new PIXI.Text(glyph, {
      fill: TEXT_COLOR_DIM,
      fontSize: ICON_FONT_SIZE,
      fontFamily: "sans-serif",
    });
    icon.anchor.set(0.5, 0.5);
    icon.x = ICON_BTN_SIZE / 2;
    icon.y = ICON_BTN_SIZE / 2;

    btn.addChild(bg, icon);
    btn._bg = bg;
    btn._icon = icon;

    btn.on("pointerdown", onClick);
    btn.on("pointerover", () => {
      bg.tint = 0xaaaaaa;
      icon.style.fill = "#ffffff";
    });
    btn.on("pointerout", () => {
      bg.tint = 0xffffff;
      icon.style.fill = TEXT_COLOR_DIM;
    });

    return btn;
  }

  // ── SETTINGS MODAL ────────────────────────────────────────────────────────

  _buildSettingsModal() {
    this._modal = new PIXI.Container();
    this._modal.visible = false;
    this._modal.eventMode = "static";

    const overlay = new PIXI.Graphics();
    overlay.beginFill(0x000000, 0.6);
    overlay.drawRect(0, 0, 4000, 4000);
    overlay.endFill();
    overlay.eventMode = "static";
    overlay.on("pointerdown", () => this._closeSettings());
    this._modal.addChild(overlay);

    this._modalBox = new PIXI.Graphics();
    this._modalTitle = new PIXI.Text("Panel Position (landscape/mobile)", {
      fill: "#ffffff",
      fontSize: 14,
      fontWeight: "700",
      fontFamily: "sans-serif",
    });
    this._modalTitle.anchor.set(0.5, 0);

    this._modalSub = new PIXI.Text("Only applies in landscape on mobile", {
      fill: "#888888",
      fontSize: 11,
      fontFamily: "sans-serif",
    });
    this._modalSub.anchor.set(0.5, 0);

    this._radioRight = this._makeRadio("Right side  (default)", "right");
    this._radioLeft = this._makeRadio("Left side", "left");

    this._closeBtn = new PIXI.Text("\u2715  Close", {
      fill: "#aaaaaa",
      fontSize: 12,
      fontFamily: "sans-serif",
    });
    this._closeBtn.anchor.set(0.5, 0);
    this._closeBtn.eventMode = "static";
    this._closeBtn.cursor = "pointer";
    this._closeBtn.on("pointerdown", () => this._closeSettings());
    this._closeBtn.on("pointerover", () => {
      this._closeBtn.style.fill = "#ffffff";
    });
    this._closeBtn.on("pointerout", () => {
      this._closeBtn.style.fill = "#aaaaaa";
    });

    this._modal.addChild(
      this._modalBox,
      this._modalTitle,
      this._modalSub,
      this._radioRight.container,
      this._radioLeft.container,
      this._closeBtn,
    );

    this.app.stage.addChild(this._modal);
  }

  _makeRadio(labelText, value) {
    const container = new PIXI.Container();
    container.eventMode = "static";
    container.cursor = "pointer";

    const circle = new PIXI.Graphics();
    container.addChild(circle);

    const label = new PIXI.Text(labelText, {
      fill: "#cccccc",
      fontSize: 13,
      fontFamily: "sans-serif",
    });
    label.x = 22;
    label.anchor.set(0, 0.5);
    container.addChild(label);

    container.on("pointerdown", () => {
      window._tileSettings.setSetting("panelSide", value);
      this._syncRadios();
      if (this.onSettingsChanged) this.onSettingsChanged();
    });

    return { container, circle, label, value };
  }

  _syncRadios() {
    const current = window._tileSettings.getSetting("panelSide");
    for (const r of [this._radioRight, this._radioLeft]) {
      const sel = r.value === current;
      r.circle.clear();
      r.circle.lineStyle(2, 0x888888);
      r.circle.drawCircle(8, 0, 8);
      if (sel) {
        r.circle.beginFill(0x7ecbff);
        r.circle.drawCircle(8, 0, 4);
        r.circle.endFill();
      }
      r.label.style.fill = sel ? "#ffffff" : "#cccccc";
    }
  }

  _openSettings() {
    this._syncRadios();
    this._positionModal();
    this._modal.visible = true;
  }
  _closeSettings() {
    this._modal.visible = false;
  }

  _positionModal() {
    const sw = this.app.renderer.width;
    const sh = this.app.renderer.height;
    const bw = 290,
      bh = 175;
    const bx = (sw - bw) / 2;
    const by = (sh - bh) / 2;

    this._modalBox.clear();
    this._modalBox.beginFill(0x1e1e1e);
    this._modalBox.lineStyle(1, 0x555555);
    this._modalBox.drawRoundedRect(bx, by, bw, bh, 12);
    this._modalBox.endFill();

    this._modalTitle.x = bx + bw / 2;
    this._modalTitle.y = by + 14;
    this._modalSub.x = bx + bw / 2;
    this._modalSub.y = by + 34;
    this._radioRight.container.x = bx + 32;
    this._radioRight.container.y = by + 66;
    this._radioLeft.container.x = bx + 32;
    this._radioLeft.container.y = by + 96;
    this._closeBtn.x = bx + bw / 2;
    this._closeBtn.y = by + 142;
  }

  // ── PAUSE ─────────────────────────────────────────────────────────────────

  _togglePause() {
    // Ignore clicks during countdown — pause is disabled then
    if (this._countdownActive) return;

    this._paused = !this._paused;

    // Swap icon: ⏸ when playing, ▶ when paused
    this._pauseBtn._icon.text = this._paused ? "\u25b6" : "\u23f8";

    if (this.onPause) this.onPause(this._paused);
  }

  /**
   * Called by main.js when a countdown starts/ends so we can
   * disable the pause button during the countdown.
   * @param {boolean} active
   */
  setCountdownActive(active) {
    this._countdownActive = active;
    // Dim the pause button visually when disabled
    this._pauseBtn.alpha = active ? 0.35 : 1.0;
  }

  /**
   * Force-clear the paused state (e.g. when a new level starts).
   */
  clearPause() {
    this._paused = false;
    this._pauseBtn._icon.text = "\u23f8";
  }

  // ── PUBLIC: UPDATE LEVEL ──────────────────────────────────────────────────

  /**
   * Update the displayed level number.
   * @param {number} level
   */
  updateLevel(level) {
    this._level = level;
    this._levelLabel.text = String(level);
  }

  // ── PUBLIC: UPDATE SEQUENCE ───────────────────────────────────────────────

  updateSequence(sequence) {
    this._sequence = sequence;
    this._buildSeqStrip(sequence);
    this._layoutContents();
  }

  _drawFinalRect(colorValue) {
    const centreW = this._panelW - SIDE_COL_W * 2;
    const fw = Math.min(FINAL_W, centreW - PADDING * 2);
    this._finalRect.clear();
    this._finalRect.beginFill(colorValue);
    this._finalRect.drawRoundedRect(0, 0, fw, FINAL_H, 6);
    this._finalRect.endFill();
    this._finalRect.lineStyle(1, 0xffffff, 0.25);
    this._finalRect.drawRoundedRect(0, 0, fw, FINAL_H, 6);
    this._finalRect._fw = fw; // cache for layout
  }

  _buildSeqStrip(sequence) {
    this._seqContainer.removeChildren();
    let x = 0;
    sequence.forEach((entry, i) => {
      const box = new PIXI.Graphics();
      box.beginFill(entry.value);
      box.drawRoundedRect(0, 0, SEQ_BOX_W, SEQ_BOX_H, 4);
      box.endFill();
      box.lineStyle(1, 0xffffff, 0.2);
      box.drawRoundedRect(0, 0, SEQ_BOX_W, SEQ_BOX_H, 4);
      box.x = x;
      this._seqContainer.addChild(box);
      x += SEQ_BOX_W;

      if (i < sequence.length - 1) {
        const arrow = new PIXI.Text("\u203a", {
          fill: "#aaaaaa",
          fontSize: 22,
          fontFamily: "sans-serif",
        });
        arrow.anchor.set(0.5, 0.5);
        arrow.x = x + SEQ_ARROW_W / 2;
        arrow.y = SEQ_BOX_H / 2;
        this._seqContainer.addChild(arrow);
        x += SEQ_ARROW_W;
      }
    });
  }

  // ── PUBLIC: POWER BAR ─────────────────────────────────────────────────────

  activatePower(power) {
    this._power = {
      ...power,
      remaining: power.durationMs,
      duration: power.durationMs,
    };
    this._renderPowerBar();
  }

  clearPower() {
    this._power = null;
    this._renderPowerBar();
  }

  _tickPower(deltaMS) {
    if (!this._power) return;
    this._power.remaining = Math.max(0, this._power.remaining - deltaMS);
    if (this._power.remaining <= 0) this._power = null;
    this._renderPowerBar();
  }

  _renderPowerBar() {
    if (!this._panelW) return;
    const w = this._panelW - PADDING * 2;

    this._powerBg.clear();
    this._powerBg.beginFill(POWER_IDLE_BG);
    this._powerBg.drawRoundedRect(0, 0, w, POWER_BAR_H, 5);
    this._powerBg.endFill();

    this._powerFill.clear();
    if (this._power) {
      const ratio = this._power.remaining / this._power.duration;
      const col =
        this._power.type === "good" ? POWER_GOOD_FILL : POWER_BAD_FILL;
      this._powerFill.beginFill(col);
      this._powerFill.drawRoundedRect(0, 0, w * ratio, POWER_BAR_H, 5);
      this._powerFill.endFill();
      this._powerLabel.text = this._power.label;
      this._powerLabel.style.fill = "#ffffff";
    } else {
      this._powerFill.beginFill(POWER_IDLE_FILL, 0.35);
      this._powerFill.drawRoundedRect(0, 0, w, POWER_BAR_H, 5);
      this._powerFill.endFill();
      this._powerLabel.text = "No Power Active";
      this._powerLabel.style.fill = TEXT_COLOR_DIM;
    }

    this._powerLabel.x = this._powerBg.x + w / 2;
    this._powerLabel.y = this._powerBg.y + POWER_BAR_H / 2;
  }

  // ── PUBLIC: LAYOUT ────────────────────────────────────────────────────────

  layoutFixed(x, y, w, h) {
    this._panelW = w;
    this._panelH = h;
    this.container.x = x;
    this.container.y = y;

    this._drawBg(w, h);
    this._layoutContents();
    this._renderPowerBar();
  }

  // ── PRIVATE: LAYOUT ───────────────────────────────────────────────────────

  _drawBg(w, h) {
    this._bg.clear();
    this._bg.beginFill(PANEL_BG);
    this._bg.drawRect(0, 0, w, h);
    this._bg.endFill();
    this._bg.lineStyle(1, PANEL_BORDER);
    this._bg.drawRect(0, 0, w, h);
  }

  _layoutContents() {
    if (!this._panelW) return;

    const pw = this._panelW;
    const ph = this._panelH;

    // Centre column bounds
    const centreX = SIDE_COL_W;
    const centreW = pw - SIDE_COL_W * 2;
    const centreMid = centreX + centreW / 2;

    let y = PADDING;

    // ── CENTRE: instruction label
    this._instrLabel.x = centreMid;
    this._instrLabel.y = y;
    y += INSTR_H + PADDING * 0.5;

    // ── CENTRE: final color rect — centred in centre column
    const fw = Math.min(FINAL_W, centreW - PADDING * 2);
    this._finalRect.x = centreX + (centreW - fw) / 2;
    this._finalRect.y = y;
    if (this._sequence) {
      this._drawFinalRect(this._sequence[this._sequence.length - 1].value);
    }
    y += FINAL_H + PADDING;

    // ── CENTRE: sequence strip — centred in centre column
    const n = this._sequence ? this._sequence.length : 0;
    const stripW = n * SEQ_BOX_W + Math.max(0, n - 1) * SEQ_ARROW_W;
    this._seqContainer.x = centreX + Math.max(0, (centreW - stripW) / 2);
    this._seqContainer.y = y;
    y += SEQ_BOX_H + PADDING;

    // ── BOTTOM: power bar — full inner width
    this._powerBg.x = PADDING;
    this._powerBg.y = y;
    this._powerFill.x = PADDING;
    this._powerFill.y = y;

    // ── LEFT COLUMN: "Level" word + number — stacked, vertically centred
    const contentMidY = (y - PADDING) / 2;
    this._levelWordLabel.x = SIDE_COL_W / 2;
    this._levelWordLabel.y = contentMidY - LEVEL_FONT_SIZE * 0.6;
    this._levelLabel.x = SIDE_COL_W / 2;
    this._levelLabel.y = contentMidY + 8;

    // ── RIGHT COLUMN: gear (top), pause (below gear with gap)
    const btnX = pw - SIDE_COL_W + (SIDE_COL_W - ICON_BTN_SIZE) / 2;
    this._gearBtn.x = btnX;
    this._gearBtn.y = PADDING;
    this._pauseBtn.x = btnX;
    this._pauseBtn.y = PADDING + ICON_BTN_SIZE + 6;
  }
}
