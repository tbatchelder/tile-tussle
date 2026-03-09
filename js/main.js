import { createGlowButton } from "./ui.js";
import { GridManager } from "./grid.js";
import { HandManager } from "./hand.js";

let app; // <-- module-level, accessible everywhere
let grid;
let hands;

// Fade-out helper
function fadeOut(container, onComplete) {
  const duration = 600; // ms
  const start = performance.now();

  const blurFilter = new PIXI.BlurFilter();
  blurFilter.blur = 0;
  container.filters = [blurFilter];

  function animate() {
    const now = performance.now();
    const t = Math.min((now - start) / duration, 1);

    // Ease-out curve
    const eased = 1 - Math.pow(1 - t, 3);

    container.alpha = 1 - eased;
    blurFilter.blur = eased * 20;
    container.scale.set(1 - eased * 0.1);

    if (t < 1) {
      requestAnimationFrame(animate);
    } else {
      container.visible = false;
      onComplete();
    }
  }

  requestAnimationFrame(animate);
}

function fadeIn(container, onComplete) {
  const duration = 600; // ms
  const start = performance.now();

  // Start invisible, blurred, and slightly scaled down
  container.alpha = 0;
  container.scale.set(0.9);

  const blurFilter = new PIXI.BlurFilter();
  blurFilter.blur = 20;
  container.filters = [blurFilter];

  function animate() {
    const now = performance.now();
    const t = Math.min((now - start) / duration, 1);

    // Ease-out curve
    const eased = 1 - Math.pow(1 - t, 3);

    container.alpha = eased;
    blurFilter.blur = (1 - eased) * 20;
    container.scale.set(0.9 + eased * 0.1);

    if (t < 1) {
      requestAnimationFrame(animate);
    } else {
      container.filters = [];
      onComplete && onComplete();
    }
  }

  requestAnimationFrame(animate);
}

function startGame() {
  grid = new GridManager(app);
  app.stage.addChild(grid.container);

  fadeIn(grid.container);

  // In main.js, when you establish the target color:
  hands = new HandManager(app, grid, 0xffffff); // pass color at construction
}

window.onload = async () => {
  // Create the PixiJS application
  app = new PIXI.Application();

  await app.init({
    resizeTo: window,
    backgroundColor: 0x1f1f1f,
    antialias: true,
  });

  // Attach canvas to the game container (NOT body)
  const container = document.getElementById("game-container");
  container.appendChild(app.canvas);

  // Load hero assets
  await PIXI.Assets.load(["images/hero.png"]);

  // Create hero screen container
  const heroScreen = new PIXI.Container();
  app.stage.addChild(heroScreen);

  // Hero image
  const hero = PIXI.Sprite.from("images/hero.png");
  hero.anchor.set(0.5);
  hero.x = app.renderer.width / 2;
  hero.y = app.renderer.height / 2;
  heroScreen.addChild(hero);

  // Start button
  const startButton = createGlowButton(
    app,
    "START",
    app.renderer.width / 2,
    app.renderer.height / 2 + 200,
  );

  startButton.on("pointerdown", () => {
    fadeOut(heroScreen, () => {
      startGame();
    });
  });

  heroScreen.addChild(startButton);
};

// Listeners
window.addEventListener("resize", () => {
  if (grid) {
    grid.centerGrid();
  }
  if (hands) {
    hands.positionHands();
  }
});
