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
