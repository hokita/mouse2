import Phaser from 'phaser';
import { isMuted, onMuteChange, playSfx, setMuted } from '../audio/bus';
import { WIDTH, HEIGHT } from '../gameConfig';
import { PALETTE, RADIUS, displayStyle, labelStyle, shade } from './theme';
import { TEX, ensureFxTextures, ensureGradient, ensureStarTextures } from './textures';

/** Shared stacking order, so no scene has to guess a depth number. */
export const DEPTH = {
  backdrop: 0,
  world: 10,
  effects: 20,
  hud: 50,
  overlay: 100,
} as const;

// --- backdrop -------------------------------------------------------------

export interface Starfield {
  /** Scrolls the sky down by `distance` px of parallax travel. */
  scroll(distance: number): void;
}

/**
 * Vertical gradient plus two parallax star layers. The near layer moves at
 * full speed and the far one at a third of it, which is what stops a dark
 * background from reading as a flat black rectangle.
 */
export function createStarBackdrop(
  scene: Phaser.Scene,
  top: number = PALETTE.skyTop,
  bottom: number = PALETTE.skyBottom
): Starfield {
  ensureStarTextures(scene);
  ensureFxTextures(scene);

  scene.add
    .image(WIDTH / 2, HEIGHT / 2, ensureGradient(scene, top, bottom))
    .setDisplaySize(WIDTH, HEIGHT)
    .setDepth(DEPTH.backdrop);

  // A soft coloured bloom near the horizon gives the gradient somewhere to
  // come from instead of just fading.
  scene.add
    .image(WIDTH * 0.5, HEIGHT * 0.12, TEX.glow)
    .setDisplaySize(WIDTH * 1.6, HEIGHT * 0.5)
    .setTint(PALETTE.violet)
    .setAlpha(0.28)
    .setDepth(DEPTH.backdrop);

  const far = scene.add
    .tileSprite(WIDTH / 2, HEIGHT / 2, WIDTH, HEIGHT, TEX.starsFar)
    .setDepth(DEPTH.backdrop)
    .setAlpha(0.8);
  const near = scene.add
    .tileSprite(WIDTH / 2, HEIGHT / 2, WIDTH, HEIGHT, TEX.starsNear)
    .setDepth(DEPTH.backdrop);

  return {
    scroll(distance: number): void {
      // TileSprite samples at +tilePosition, so subtracting moves the drawn
      // content *down* the screen.
      far.tilePositionY -= distance * 0.35;
      near.tilePositionY -= distance;
    },
  };
}

// --- buttons --------------------------------------------------------------

/** How far a button's face sits above its plinth, and so how far it drops. */
const DEPTH_DROP = 5;

/**
 * Interaction config for a Container of `width` x `height` whose children are
 * laid out around its centre.
 *
 * Two things make this fiddly enough to be worth centralising. First, the hit
 * area is given explicitly rather than derived: a derived area is snapshotted
 * from the object's size once, at setInteractive() time, and never refreshed,
 * which is exactly how a re-labelled control ends up untappable. Second, the
 * rectangle is expressed from the top-left even though the container's own
 * children sit around (0, 0) — Phaser's hit test adds the container's
 * displayOrigin (half its width and height) to the local point before testing
 * it, so a rectangle centred on the origin lands half a control up and to the
 * left of the thing it is supposed to cover.
 */
function hitAreaFor(width: number, height: number): Phaser.Types.Input.InputConfiguration {
  return {
    hitArea: new Phaser.Geom.Rectangle(0, 0, width, height),
    hitAreaCallback: Phaser.Geom.Rectangle.Contains,
    useHandCursor: true,
  };
}

export interface ButtonOptions {
  x: number;
  y: number;
  width: number;
  height: number;
  label: string;
  /** Filled and loud, or outlined and quiet. */
  variant?: 'primary' | 'secondary';
  accent?: number;
  onTap: () => void;
  /**
   * Taps are dropped unless this returns true.
   *
   * Not a substitute for hiding the control: Phaser skips hit-testing an
   * object that is transparent or whose container is hidden, so an off-screen
   * button is already unreachable (measured, not assumed). This gates on the
   * caller's own state instead, which keeps a button's meaning tied to what
   * the game is doing rather than to how the card happens to be concealed.
   */
  isArmed?: () => boolean;
}

export function createButton(scene: Phaser.Scene, options: ButtonOptions): Phaser.GameObjects.Container {
  const { x, y, width, height, label, variant = 'primary', accent = PALETTE.cyan, onTap, isArmed } = options;

  const container = scene.add.container(x, y);
  const bg = scene.add.graphics();
  const halfW = width / 2;
  const halfH = height / 2;

  const text = scene.add
    .text(0, 0, label, {
      ...displayStyle(20, variant === 'primary' ? PALETTE.skyTop : PALETTE.text),
      fontStyle: '800',
    })
    .setOrigin(0.5, 0.5);
  text.setLetterSpacing(1.5);

  // The face sits on a darker plinth and drops onto it when pressed, which
  // gives the button real depth. A flat panel with a lighter top half was the
  // other option, but the seam where the highlight stops is visible as a line
  // straight across the button.
  const paint = (pressed: boolean): void => {
    const drop = pressed ? DEPTH_DROP - 2 : 0;
    bg.clear();
    if (variant === 'primary') {
      bg.fillStyle(shade(accent, -0.5), 1);
      bg.fillRoundedRect(-halfW, -halfH, width, height + DEPTH_DROP, RADIUS.button);
      bg.fillStyle(accent, 1);
      bg.fillRoundedRect(-halfW, -halfH + drop, width, height, RADIUS.button);
    } else {
      bg.fillStyle(PALETTE.surfaceEdge, 0.85);
      bg.fillRoundedRect(-halfW, -halfH, width, height + DEPTH_DROP, RADIUS.button);
      bg.fillStyle(PALETTE.surface, 1);
      bg.fillRoundedRect(-halfW, -halfH + drop, width, height, RADIUS.button);
      bg.lineStyle(2, PALETTE.surfaceEdge, 1);
      bg.strokeRoundedRect(-halfW, -halfH + drop, width, height, RADIUS.button);
    }
    text.y = drop;
  };
  paint(false);

  container.add([bg, text]);
  container.setSize(width, height + DEPTH_DROP);
  container.setInteractive(hitAreaFor(width, height + DEPTH_DROP));

  const release = (): void => paint(false);

  container.on(
    'pointerdown',
    (
      _pointer: Phaser.Input.Pointer,
      _localX: number,
      _localY: number,
      event: Phaser.Types.Input.EventData
    ) => {
      if (isArmed && !isArmed()) {
        return;
      }
      // Stop the tap here so it never also reaches the scene-wide pointer
      // handler: restarting flips the game back to 'playing' synchronously,
      // and this same tap would then be read as a movement command, yanking
      // the just-recentred player over to wherever the button was.
      event.stopPropagation();
      paint(true);
      onTap();
    }
  );
  container.on('pointerup', release);
  container.on('pointerout', release);

  return container;
}

// --- HUD ------------------------------------------------------------------

export interface StatPill {
  setValue(value: string): void;
  container: Phaser.GameObjects.Container;
}

export interface StatPillOptions {
  /** Left edge when aligned left, right edge when aligned right. */
  x: number;
  y: number;
  width: number;
  label: string;
  align?: 'left' | 'right';
  accent?: number;
}

/** Height of a stat pill — exported so scenes can keep clear of the HUD. */
export const STAT_PILL_HEIGHT = 54;

/** Frosted readout panel — the score and speed displays both use it. */
export function createStatPill(scene: Phaser.Scene, options: StatPillOptions): StatPill {
  const { x, y, width, label, align = 'left', accent = PALETTE.text } = options;
  const height = STAT_PILL_HEIGHT;
  const pad = 14;
  const left = align === 'left' ? 0 : -width;

  const container = scene.add.container(x, y).setDepth(DEPTH.hud);

  const bg = scene.add.graphics();
  bg.fillStyle(PALETTE.skyTop, 0.55);
  bg.fillRoundedRect(left, 0, width, height, RADIUS.pill);
  bg.lineStyle(1.5, PALETTE.surfaceEdge, 0.7);
  bg.strokeRoundedRect(left, 0, width, height, RADIUS.pill);

  const textX = align === 'left' ? left + pad : left + width - pad;
  const originX = align === 'left' ? 0 : 1;

  const labelText = scene.add.text(textX, 9, label.toUpperCase(), labelStyle(11)).setOrigin(originX, 0);
  labelText.setLetterSpacing(2.4);

  const valueText = scene.add
    .text(textX, 24, '', { ...displayStyle(22, accent) })
    .setOrigin(originX, 0);

  container.add([bg, labelText, valueText]);

  return {
    container,
    setValue(value: string): void {
      valueText.setText(value);
    },
  };
}

// --- back to menu ---------------------------------------------------------

const BACK_WIDTH = 84;
const BACK_HEIGHT = 44;
// Centred against the 54px stat pills that sit at y = 18, so the three
// readouts across the top of a game line up on one axis.
const BACK_Y = 18 + 54 / 2;

export interface BackButtonOptions {
  /** The game's own accent, so the way out belongs to the game it leaves. */
  accent?: number;
  onTap: () => void;
  /** Taps are dropped unless this returns true — see `ButtonOptions`. */
  isArmed?: () => boolean;
}

/**
 * The in-run way back to the menu, as a chip in the gap between the two HUD
 * pills.
 *
 * Top centre rather than anywhere nearer the thumb: every game is played by
 * dragging or tapping the lower half of the screen, and a quit control down
 * there is one stray finger away from ending a run nobody wanted to end. For
 * the same reason this is the one control in the app that fires on release
 * instead of on press — a press that slides off the chip is treated as a
 * change of mind, not as a tap.
 */
export function createBackButton(scene: Phaser.Scene, options: BackButtonOptions): Phaser.GameObjects.Container {
  const { accent = PALETTE.text, onTap, isArmed } = options;

  const container = scene.add.container(WIDTH / 2, BACK_Y).setDepth(DEPTH.hud);
  const halfW = BACK_WIDTH / 2;
  const halfH = BACK_HEIGHT / 2;

  const bg = scene.add.graphics();
  const paint = (pressed: boolean): void => {
    bg.clear();
    bg.fillStyle(pressed ? PALETTE.surface : PALETTE.skyTop, pressed ? 1 : 0.55);
    bg.fillRoundedRect(-halfW, -halfH, BACK_WIDTH, BACK_HEIGHT, RADIUS.pill);
    bg.lineStyle(1.5, accent, pressed ? 0.95 : 0.5);
    bg.strokeRoundedRect(-halfW, -halfH, BACK_WIDTH, BACK_HEIGHT, RADIUS.pill);
  };
  paint(false);

  const label = scene.add.text(0, 0, '‹ MENU', labelStyle(13, accent)).setOrigin(0.5, 0.5);
  label.setLetterSpacing(2);

  container.add([bg, label]);
  container.setSize(BACK_WIDTH, BACK_HEIGHT);
  container.setInteractive(hitAreaFor(BACK_WIDTH, BACK_HEIGHT));

  /** True only while a press that started on this chip is still on it. */
  let holding = false;

  container.on(
    'pointerdown',
    (
      _pointer: Phaser.Input.Pointer,
      _localX: number,
      _localY: number,
      event: Phaser.Types.Input.EventData
    ) => {
      if (isArmed && !isArmed()) {
        return;
      }
      // Stop the press here so it never also reaches the scene-wide pointer
      // handler, which would read it as a steer and yank the player across
      // the screen — see the same guard in createButton.
      event.stopPropagation();
      holding = true;
      paint(true);
    }
  );

  container.on(
    'pointerup',
    (
      _pointer: Phaser.Input.Pointer,
      _localX: number,
      _localY: number,
      event: Phaser.Types.Input.EventData
    ) => {
      if (!holding) {
        return;
      }
      holding = false;
      paint(false);
      if (isArmed && !isArmed()) {
        return;
      }
      event.stopPropagation();
      onTap();
    }
  );

  container.on('pointerout', () => {
    holding = false;
    paint(false);
  });

  return container;
}

const SOUND_RADIUS = 21;
/** Directly under the back chip: the top row is already three items wide. */
const SOUND_Y = BACK_Y + 52;

export interface SoundButtonOptions {
  accent?: number;
  x?: number;
  y?: number;
}

/**
 * The mute toggle. Round rather than a pill so it never reads as a second
 * back button, and drawn rather than typed: a speaker emoji renders
 * differently on every platform and arrives as a hollow box on some.
 */
export function createSoundButton(
  scene: Phaser.Scene,
  options: SoundButtonOptions = {}
): Phaser.GameObjects.Container {
  const { accent = PALETTE.text, x = WIDTH / 2, y = SOUND_Y } = options;

  const container = scene.add.container(x, y).setDepth(DEPTH.hud);
  const bg = scene.add.graphics();
  const glyph = scene.add.graphics();

  const paint = (pressed = false): void => {
    const on = !isMuted();

    bg.clear();
    bg.fillStyle(pressed ? PALETTE.surface : PALETTE.skyTop, pressed ? 1 : 0.55);
    bg.fillCircle(0, 0, SOUND_RADIUS);
    bg.lineStyle(1.5, accent, on ? 0.55 : 0.28);
    bg.strokeCircle(0, 0, SOUND_RADIUS);

    glyph.clear();
    const alpha = on ? 0.95 : 0.4;
    glyph.fillStyle(accent, alpha);
    // Neck, then the cone flaring to the right.
    glyph.fillRect(-9, -3.5, 5, 7);
    glyph.fillTriangle(-4, 0, 1, -8, 1, 8);

    if (on) {
      // Two arcs radiating off the cone.
      glyph.lineStyle(1.6, accent, 0.9);
      glyph.beginPath();
      glyph.arc(1, 0, 6, -0.85, 0.85);
      glyph.strokePath();
      glyph.beginPath();
      glyph.arc(1, 0, 10, -0.85, 0.85);
      glyph.strokePath();
    } else {
      glyph.lineStyle(2, accent, 0.75);
      glyph.beginPath();
      glyph.moveTo(-2, -9);
      glyph.lineTo(11, 8);
      glyph.strokePath();
    }
  };
  paint();

  container.add([bg, glyph]);
  container.setSize(SOUND_RADIUS * 2, SOUND_RADIUS * 2);
  container.setInteractive(hitAreaFor(SOUND_RADIUS * 2, SOUND_RADIUS * 2));

  let holding = false;

  container.on(
    'pointerdown',
    (
      _pointer: Phaser.Input.Pointer,
      _localX: number,
      _localY: number,
      event: Phaser.Types.Input.EventData
    ) => {
      // Same guard as the back chip: without it the press also reaches the
      // scene-wide handler and reads as a steer.
      event.stopPropagation();
      holding = true;
      paint(true);
    }
  );

  container.on(
    'pointerup',
    (
      _pointer: Phaser.Input.Pointer,
      _localX: number,
      _localY: number,
      event: Phaser.Types.Input.EventData
    ) => {
      if (!holding) {
        return;
      }
      event.stopPropagation();
      holding = false;
      setMuted(!isMuted());
      paint(false);
      // Unmuting should prove itself; muting has nothing to say.
      if (!isMuted()) {
        playSfx(scene, 'tap');
      }
    }
  );

  container.on('pointerout', () => {
    holding = false;
    paint(false);
  });

  // Every screen's chip tracks the same flag, so one going stale behind a
  // scene change would be a lie the next visit inherits.
  const unsubscribe = onMuteChange(() => paint(false));
  scene.events.once(Phaser.Scenes.Events.SHUTDOWN, unsubscribe);

  return container;
}

// --- game over ------------------------------------------------------------

/** Hit-area config for a centred Container — see `hitAreaFor`. */
export function containerHitArea(width: number, height: number): Phaser.Types.Input.InputConfiguration {
  return hitAreaFor(width, height);
}

export interface GameOverOverlay {
  show(title: string, statLabel: string, statValue: string): void;
  hide(): void;
}

export interface GameOverOptions {
  accent: number;
  onRestart: () => void;
  onMenu: () => void;
  isArmed: () => boolean;
  restartLabel?: string;
}

/**
 * The end-of-run card, shared by every game so a loss always looks the same:
 * the world dims, a panel scales in, and the two ways out sit under the score.
 */
export function createGameOverOverlay(scene: Phaser.Scene, options: GameOverOptions): GameOverOverlay {
  const { accent, onRestart, onMenu, isArmed, restartLabel = 'PLAY AGAIN' } = options;
  ensureFxTextures(scene);

  const CARD_W = 330;
  const CARD_H = 340;

  const root = scene.add.container(0, 0).setDepth(DEPTH.overlay).setVisible(false);

  const scrim = scene.add.rectangle(WIDTH / 2, HEIGHT / 2, WIDTH, HEIGHT, PALETTE.skyTop, 0.78);
  // Swallows taps that land outside the card, so a stray press on the dimmed
  // world can never reach the game behind it. Its input state is kept in step
  // with whether the overlay is on screen. Phaser already skips hit-testing
  // the children of a hidden container, so this is not load-bearing today —
  // it just keeps a full-screen tap-eater from depending on that behaviour.
  scrim.on('pointerdown', (_p: unknown, _x: unknown, _y: unknown, event: Phaser.Types.Input.EventData) => {
    event.stopPropagation();
  });
  scrim.disableInteractive();

  const card = scene.add.container(WIDTH / 2, HEIGHT / 2);

  const glow = scene.add
    .image(0, 0, TEX.glow)
    .setDisplaySize(CARD_W * 1.7, CARD_H * 1.4)
    .setTint(accent)
    .setAlpha(0.22);

  const panel = scene.add.graphics();
  panel.fillStyle(PALETTE.surface, 0.98);
  panel.fillRoundedRect(-CARD_W / 2, -CARD_H / 2, CARD_W, CARD_H, RADIUS.card);
  panel.lineStyle(2, PALETTE.surfaceEdge, 1);
  panel.strokeRoundedRect(-CARD_W / 2, -CARD_H / 2, CARD_W, CARD_H, RADIUS.card);
  // Accent bar across the top of the card.
  panel.fillStyle(accent, 1);
  panel.fillRoundedRect(-40, -CARD_H / 2 + 18, 80, 5, 3);

  // 34px keeps the longest title the games use ('GAME OVER') clear of the
  // card's rounded corners.
  const title = scene.add.text(0, -112, '', displayStyle(34)).setOrigin(0.5, 0.5);
  title.setLetterSpacing(2);

  const statLabel = scene.add.text(0, -44, '', labelStyle(12)).setOrigin(0.5, 0.5);
  statLabel.setLetterSpacing(3);

  const statValue = scene.add.text(0, -6, '', displayStyle(46, accent)).setOrigin(0.5, 0.5);

  const restart = createButton(scene, {
    x: 0,
    y: 60,
    width: 250,
    height: 56,
    label: restartLabel,
    variant: 'primary',
    accent,
    onTap: onRestart,
    isArmed,
  });

  const menu = createButton(scene, {
    x: 0,
    y: 128,
    width: 250,
    height: 52,
    label: 'MENU',
    variant: 'secondary',
    accent,
    onTap: onMenu,
    isArmed,
  });

  card.add([glow, panel, title, statLabel, statValue, restart, menu]);
  root.add([scrim, card]);

  return {
    show(titleText: string, statLabelText: string, statValueText: string): void {
      title.setText(titleText);
      statLabel.setText(statLabelText.toUpperCase());
      statValue.setText(statValueText);
      root.setVisible(true);
      root.setAlpha(0);
      card.setScale(0.9);
      scrim.setInteractive();
      scene.tweens.add({ targets: root, alpha: 1, duration: 180, ease: 'Quad.easeOut' });
      scene.tweens.add({ targets: card, scale: 1, duration: 320, ease: 'Back.easeOut' });
    },
    hide(): void {
      scene.tweens.killTweensOf(root);
      scene.tweens.killTweensOf(card);
      scrim.disableInteractive();
      root.setVisible(false);
    },
  };
}

// --- misc -----------------------------------------------------------------

/** Scenes with a hand-over already under way — see `transitionTo`. */
const departing = new WeakSet<Phaser.Scene>();

/**
 * Fades the camera out and then hands over to another scene.
 *
 * At most one hand-over per scene: a second call while the fade is still
 * running is ignored. Without that, each call would queue its own
 * FADE_OUT_COMPLETE listener, every one of them would fire together, and the
 * scene that happened to start last would win — so a stray second tap during
 * the fade could take the player somewhere they never chose.
 */
export function transitionTo(scene: Phaser.Scene, key: string): void {
  if (departing.has(scene)) {
    return;
  }
  departing.add(scene);
  // Scene instances outlive the scenes they run, so the flag has to be
  // cleared on the way out — otherwise a second visit could never leave.
  scene.events.once(Phaser.Scenes.Events.SHUTDOWN, () => departing.delete(scene));

  scene.cameras.main.fadeOut(220, 0, 0, 0);
  scene.cameras.main.once(Phaser.Cameras.Scene2D.Events.FADE_OUT_COMPLETE, () => {
    scene.scene.start(key);
  });
}
