import { gsap } from "gsap";
import {
  STAGE_L2,
  LEVEL_TWO,
  STATES_L2,
  rowTopOf,
  getLine,
  getFall,
} from "./level-two.js";

const VAST_BOOST = 1.32;

export class LevelTwoGame {
  constructor(refs, handoffDetail = {}) {
    this.refs = refs;
    this.stage = refs.stage;
    this.poemL2 = refs.poemL2;
    this.inkSeaEl = refs.inkSea;
    this.moon = refs.moon;
    this.moonGlow = refs.moonGlow;
    this.actor = refs.actor;
    this.trail = refs.trail;
    this.hint = refs.hint;
    this.handoffEl = refs.handoff;
    this.headerL1 = refs.headerL1;
    this.headerL2 = refs.headerL2;
    this.canvas = refs.canvas;
    this.ctx = this.canvas ? this.canvas.getContext("2d") : null;
    this.handoffDetail = handoffDetail;
    this.qaScene = refs.qaScene || null;

    this.disposed = false;
    this.timers = new Set();
    this.triggerCooldown = new Map();
    this.triggerOnce = new Set();
    this.checkpoint = { row: 0, col: 0 };

    this.lastFrame = performance.now();
    this.holdLeft = false;
    this.holdRight = false;
    this.row = 0;
    this.col = 0;
    this.speedMultiplier = 1;
    this.fallY = 0;
    this.entryY = 0;
    this.rollAngle = 0;
    this.actorPose = "auto";
    this.overrideActorX = null;
    this.overrideActorY = null;
    this.inkSeaSpawned = false;
    this.activeZone = "sky";
    this.state = STATES_L2.INTRO;

    this.renderPoem();
    this.renderInkSea();
    this.activateStage();

    if (this.qaScene && this.qaScene.startsWith("l2-")) {
      this.applyQaScene(this.qaScene);
    } else {
      this.playIntro();
    }

    requestAnimationFrame((time) => this.tick(time));
  }

  destroy() {
    this.disposed = true;
    this.clearTimers();
    gsap.killTweensOf([this.actor, this.moon, this.moonGlow, this.inkSeaEl]);
  }

  renderPoem() {
    this.poemL2.replaceChildren();
    LEVEL_TWO.lines.forEach((line) => {
      const lineElement = document.createElement("div");
      lineElement.className = "l2-line";
      lineElement.dataset.row = String(line.row);
      lineElement.dataset.zone = line.zone;
      lineElement.style.top = `${rowTopOf(line.row)}px`;
      lineElement.style.left = `${STAGE_L2.gridLeft + line.indent * STAGE_L2.cellWidth}px`;

      line.chars.forEach((char, localCol) => {
        const col = line.indent + localCol;
        const charEl = document.createElement("span");
        charEl.className = "l2-char";
        charEl.dataset.row = String(line.row);
        charEl.dataset.col = String(col);
        charEl.dataset.char = char;
        charEl.textContent = char;
        lineElement.append(charEl);
      });

      this.poemL2.append(lineElement);
    });
  }

  renderInkSea() {
    this.inkSeaEl.replaceChildren();
    this.inkSeaEl.style.left = `${LEVEL_TWO.inkSea.left}px`;
    this.inkSeaEl.style.top = `${LEVEL_TWO.inkSea.top}px`;

    for (let r = 0; r < LEVEL_TWO.inkSea.rows; r += 1) {
      for (let c = 0; c < LEVEL_TWO.inkSea.cols; c += 1) {
        const cell = document.createElement("span");
        cell.className = "ink-sea-cell";
        cell.dataset.seaRow = String(r);
        cell.dataset.seaCol = String(c);
        cell.textContent = "海";
        this.inkSeaEl.append(cell);
      }
    }
  }

  activateStage() {
    this.stage.classList.remove("is-handoff", "is-bullet-time", "is-cool", "is-warm", "is-frozen");
    this.stage.classList.add("is-level-two");
    this.poemL2.classList.add("is-entering");
    this.poemL2.setAttribute("aria-hidden", "false");
    this.poemL2.dataset.activeZone = "sky";
    this.headerL2?.setAttribute("aria-hidden", "false");
    this.handoffEl?.setAttribute("aria-hidden", "true");
    gsap.set(this.actor, { opacity: 0 });
    this.moonGlow.classList.remove("is-active", "is-silvered");
  }

  playIntro() {
    this.entryY = -34;
    this.row = 0;
    this.col = 0;

    // 两次 RAF 让 is-entering 的 opacity:0 先生效，再交还给 CSS 默认 opacity → 触发逐行淡入
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        this.poemL2.classList.remove("is-entering");
      });
    });

    const tl = gsap.timeline();
    tl.to(this.handoffEl, { opacity: 0, duration: 0.45, ease: "power1.in" }, 0)
      .to(this.headerL2, { opacity: 1, duration: 0.6, ease: "power1.out" }, 0.18)
      .set(this.actor, { opacity: 1 }, 0.62)
      .to(this, { entryY: 0, duration: 0.46, ease: "power2.in" }, 0.62)
      .to(this, { entryY: -3, duration: 0.08, ease: "power2.out" })
      .to(this, { entryY: 0, duration: 0.1, ease: "power2.in" })
      .call(() => {
        this.state = STATES_L2.PLAYING;
        this.setHint(LEVEL_TWO.hints.intro);
        this.setTimer(() => this.setHint(""), 2400);
        this.triggerCell(0, 0);
      });
  }

  applyQaScene(scene) {
    if (scene === "l2-intro") {
      this.playIntro();
      return;
    }

    this.poemL2.classList.remove("is-entering");
    gsap.set(this.actor, { opacity: 1 });
    gsap.set(this.headerL2, { opacity: 1 });
    gsap.set(this.handoffEl, { opacity: 0 });

    if (scene === "l2-sand") {
      this.row = 2;
      this.col = 7;
      this.updateActiveZone("sand");
      this.state = STATES_L2.PLAYING;
      return;
    }

    if (scene === "l2-sea-preview") {
      this.row = 2;
      this.col = 4;
      this.updateActiveZone("sand");
      this.triggerSeaSide();
      this.state = STATES_L2.PLAYING;
      return;
    }

    if (scene === "l2-action") {
      this.row = 6;
      this.col = 6;
      this.updateActiveZone("action");
      this.triggerSeaSide();
      this.state = STATES_L2.PLAYING;
      return;
    }

    if (scene === "l2-pierce") {
      this.row = 8;
      this.col = 0;
      this.updateActiveZone("action");
      this.triggerSeaSide();
      this.state = STATES_L2.PLAYING;
      this.setTimer(() => {
        this.holdRight = true;
      }, 200);
      return;
    }

    this.state = STATES_L2.PLAYING;
  }

  handleIntent(intent) {
    if (intent === "reset") {
      this.reset();
      return;
    }

    if (this.disposed) return;
    if (this.state === STATES_L2.INTRO || this.state === STATES_L2.FALLING) return;
    if (this.state === STATES_L2.PIERCE || this.state === STATES_L2.LANDED_SEA) return;

    switch (intent) {
      case "hold-left":
        this.holdLeft = true;
        break;
      case "release-left":
        this.holdLeft = false;
        break;
      case "hold-right":
        this.holdRight = true;
        break;
      case "release-right":
        this.holdRight = false;
        break;
      default:
        break;
    }
  }

  reset() {
    this.clearTimers();
    gsap.killTweensOf([this.actor, this.moon, this.moonGlow, this.inkSeaEl, this]);
    this.particles = [];

    this.triggerCooldown.clear();
    this.triggerOnce.clear();
    this.inkSeaSpawned = false;
    this.holdLeft = false;
    this.holdRight = false;
    this.fallY = 0;
    this.entryY = 0;
    this.overrideActorX = null;
    this.overrideActorY = null;
    this.speedMultiplier = 1;
    this.actorPose = "auto";
    this.state = STATES_L2.INTRO;
    this.row = 0;
    this.col = 0;

    this.poemL2
      .querySelectorAll(".l2-char")
      .forEach((c) => c.classList.remove("is-lit", "is-mooning", "is-verdant", "is-spearing", "is-pierce-glyph", "is-checkpoint"));
    this.poemL2
      .querySelectorAll(".l2-line")
      .forEach((l) => l.classList.remove("is-deepblue", "is-pierced"));
    this.poemL2.dataset.activeZone = "sky";
    this.inkSeaEl.classList.remove("is-visible");
    this.inkSeaEl.setAttribute("aria-hidden", "true");
    this.inkSeaEl.querySelectorAll(".ink-sea-cell").forEach((c) => c.classList.remove("is-landed"));
    this.moon.classList.remove("is-silvered");
    this.moonGlow.classList.remove("is-active", "is-silvered");
    this.stage.classList.remove("is-paper-deepblue", "is-paper-verdant", "is-paper-sea");
    this.setHint("");

    gsap.set(this.moon, { left: LEVEL_TWO.moonSeam.handoffLeft, top: LEVEL_TWO.moonSeam.handoffTop, y: 0, scale: 1, opacity: 1 });
    gsap.set(this.actor, { opacity: 0 });

    this.playIntro();
  }

  tick(time) {
    if (this.disposed) return;
    const dt = Math.min((time - this.lastFrame) / 1000, 0.05);
    this.lastFrame = time;
    this.updateMovement(dt);
    this.updateActor();
    this.updateActorVisual(time);
    requestAnimationFrame((next) => this.tick(next));
  }

  updateMovement(dt) {
    if (this.state !== STATES_L2.PLAYING) return;

    const direction = Number(this.holdRight) - Number(this.holdLeft);
    if (direction === 0) return;

    const line = getLine(this.row);
    const previousCol = this.col;
    this.col += direction * STAGE_L2.speed * this.speedMultiplier * dt;

    if (this.col > line.maxCol + 0.5) {
      const fall = getFall(this.row, 1);
      if (fall) {
        this.col = line.maxCol + 0.5;
        this.startFall(fall);
        return;
      }
      this.col = line.maxCol;
    }
    if (this.col < line.minCol - 0.5) {
      const fall = getFall(this.row, -1);
      if (fall) {
        this.col = line.minCol - 0.5;
        this.startFall(fall);
        return;
      }
      this.col = line.minCol;
    }

    const distance = (this.col - previousCol) * STAGE_L2.cellWidth;
    const radius = STAGE_L2.actorSize / 2;
    this.rollAngle += (distance / radius) * (180 / Math.PI);

    this.checkCellCrossing(previousCol, this.col);
  }

  checkCellCrossing(previousCol, currentCol) {
    const previousCell = Math.round(previousCol);
    const currentCell = Math.round(currentCol);
    if (previousCell === currentCell) return;

    const step = currentCell > previousCell ? 1 : -1;
    for (
      let col = previousCell + step;
      step > 0 ? col <= currentCell : col >= currentCell;
      col += step
    ) {
      const line = getLine(this.row);
      if (col >= line.minCol && col <= line.maxCol) {
        this.triggerCell(this.row, col);
      }
    }
  }

  startFall(fall) {
    this.state = STATES_L2.FALLING;
    this.holdLeft = false;
    this.holdRight = false;
    this.actorPose = "fall";

    const fromY = rowTopOf(fall.from);
    const toY = rowTopOf(fall.to);
    const dy = toY - fromY;
    const startCol = this.col;
    const endCol = fall.landCol;

    const t = { p: 0 };
    gsap.to(t, {
      p: 1,
      duration: STAGE_L2.fallDuration,
      ease: "power3.in",
      onUpdate: () => {
        const p = t.p;
        this.col = startCol + (endCol - startCol) * p;
        this.fallY = dy * p;
      },
      onComplete: () => {
        this.row = fall.to;
        this.col = endCol;
        this.fallY = 0;
        this.actorPose = "land";

        // 落地微回弹：actor 沉 4px 再回正
        const bounce = { v: 0 };
        gsap.to(bounce, {
          v: 4,
          duration: 0.08,
          ease: "power2.out",
          yoyo: true,
          repeat: 1,
          onUpdate: () => {
            this.fallY = bounce.v;
          },
          onComplete: () => {
            this.fallY = 0;
            this.actorPose = "auto";
          },
        });

        const targetZone = getLine(fall.to).zone;
        if (targetZone !== this.activeZone) this.updateActiveZone(targetZone);

        const landCell = Math.round(endCol);
        this.triggerCell(fall.to, landCell);

        this.state = STATES_L2.PLAYING;
      },
    });
  }

  triggerCell(row, col) {
    const key = `${row}:${col}`;
    const now = performance.now();
    if (now - (this.triggerCooldown.get(key) || 0) < 800) return;
    this.triggerCooldown.set(key, now);

    const triggers = LEVEL_TWO.triggers;

    if (this.matchTrigger(row, col, triggers.deepBlue)) this.triggerDeepBlue();
    if (this.matchTrigger(row, col, triggers.sky)) this.triggerSkyMark(col);
    if (this.matchTrigger(row, col, triggers.moon)) this.triggerMoonSuture();
    if (this.matchTrigger(row, col, triggers.seaSide)) this.triggerSeaSide();
    if (this.matchTrigger(row, col, triggers.vast)) this.triggerVast();
    if (this.matchTrigger(row, col, triggers.verdant)) this.triggerVerdant(col);
    if (this.matchTrigger(row, col, triggers.boy)) this.triggerCheckpoint(col);
    if (this.matchTrigger(row, col, triggers.necklace)) this.triggerNecklace();
    if (this.matchTrigger(row, col, triggers.spear)) this.triggerSpear(col);
    if (this.matchTrigger(row, col, triggers.pierce)) this.triggerPierce();

    const charEl = this.getChar(row, col);
    if (charEl) {
      charEl.classList.remove("is-lit");
      void charEl.offsetWidth;
      charEl.classList.add("is-lit");
      this.setTimer(() => charEl.classList.remove("is-lit"), 480);
    }
  }

  matchTrigger(row, col, def) {
    return def && def.row === row && def.cols.includes(col);
  }

  triggerDeepBlue() {
    if (this.triggerOnce.has("deepBlue")) return;
    this.triggerOnce.add("deepBlue");
    const row0 = this.poemL2.querySelector('.l2-line[data-row="0"]');
    row0?.classList.add("is-deepblue");
    this.stage.classList.add("is-paper-deepblue");
    this.setTimer(() => this.stage.classList.remove("is-paper-deepblue"), 2400);
  }

  triggerSkyMark() {
    /* hook for future 落层 visual; prototype keeps it bare */
  }

  triggerMoonSuture() {
    if (this.triggerOnce.has("moon")) return;
    this.triggerOnce.add("moon");

    this.moonGlow.classList.add("is-active");
    gsap
      .timeline()
      .to(this.moon, {
        y: LEVEL_TWO.moonSeam.sutureLift,
        scale: LEVEL_TWO.moonSeam.sutureScale,
        duration: 0.42,
        ease: "power2.out",
      })
      .to(this.moon, {
        y: -2,
        scale: 1.02,
        duration: 0.6,
        ease: "power1.inOut",
      });

    [11, 12].forEach((col, index) => {
      const charEl = this.getChar(1, col);
      if (!charEl) return;
      this.setTimer(() => {
        charEl.classList.remove("is-mooning");
        void charEl.offsetWidth;
        charEl.classList.add("is-mooning");
      }, index * 90);
    });

    this.setHint(LEVEL_TWO.hints.moonSuture);
    this.setTimer(() => this.setHint(""), 2400);
  }

  triggerSeaSide() {
    if (this.inkSeaSpawned) return;
    this.inkSeaSpawned = true;
    this.inkSeaEl.setAttribute("aria-hidden", "false");
    this.inkSeaEl.classList.add("is-visible");
    this.stage.classList.add("is-paper-sea");
    this.setHint(LEVEL_TWO.hints.seaSide);
    this.setTimer(() => this.setHint(""), 2200);
  }

  triggerVast() {
    if (this.triggerOnce.has("vast")) return;
    this.triggerOnce.add("vast");
    gsap.to(this, { speedMultiplier: VAST_BOOST, duration: 0.4, ease: "power1.out" });
    this.setTimer(() => {
      gsap.to(this, { speedMultiplier: 1, duration: 0.6, ease: "power1.inOut" });
    }, 2400);
  }

  triggerVerdant(col) {
    this.stage.classList.add("is-paper-verdant");
    const charEl = this.getChar(4, col);
    if (charEl) {
      charEl.classList.remove("is-verdant");
      void charEl.offsetWidth;
      charEl.classList.add("is-verdant");
    }
    this.setTimer(() => this.stage.classList.remove("is-paper-verdant"), 1400);
  }

  triggerCheckpoint(col) {
    if (this.triggerOnce.has("boy")) return;
    this.triggerOnce.add("boy");
    this.checkpoint = { row: 5, col };
    [10, 11].forEach((c) => this.getChar(5, c)?.classList.add("is-checkpoint"));
  }

  triggerNecklace() {
    /* generic ink-bloom suffices */
  }

  triggerSpear(col) {
    if (this.triggerOnce.has(`spear:${col}`)) return;
    this.triggerOnce.add(`spear:${col}`);
    const charEl = this.getChar(7, col);
    charEl?.classList.add("is-spearing");
  }

  triggerPierce() {
    if (this.triggerOnce.has("pierce")) return;
    this.triggerOnce.add("pierce");

    this.state = STATES_L2.PIERCE;
    this.holdLeft = false;
    this.holdRight = false;
    this.setHint(LEVEL_TWO.hints.pierce);

    const row8 = this.poemL2.querySelector('.l2-line[data-row="8"]');
    row8?.classList.add("is-pierced");
    [7, 8].forEach((c) => this.getChar(8, c)?.classList.add("is-pierce-glyph"));

    const startX = this.actorXBase();
    const startY = this.actorYBase();
    const sea = LEVEL_TWO.inkSea;
    const targetX = sea.left + sea.cellWidth / 2;
    const targetY = sea.top + sea.rowHeight - 6;

    const railX = startX + STAGE_L2.pierceDistance * 0.5;
    const t = { p: 0 };

    gsap.to(t, {
      p: 1,
      duration: STAGE_L2.pierceDuration,
      ease: "power2.inOut",
      onUpdate: () => {
        const p = t.p;
        if (p < 0.38) {
          const k = p / 0.38;
          this.overrideActorX = startX + (railX - startX) * k;
          this.overrideActorY = startY;
        } else {
          const k = (p - 0.38) / 0.62;
          this.overrideActorX = railX + (targetX - railX) * k;
          this.overrideActorY = startY + (targetY - startY) * k - Math.sin(k * Math.PI) * 22;
        }
      },
      onComplete: () => {
        this.overrideActorX = targetX;
        this.overrideActorY = targetY;
        this.state = STATES_L2.LANDED_SEA;
        this.onLandedSea();
      },
    });
  }

  onLandedSea() {
    this.moon.classList.add("is-silvered");
    this.moonGlow.classList.remove("is-active");
    this.moonGlow.classList.add("is-silvered");

    const firstCell = this.inkSeaEl.querySelector('.ink-sea-cell[data-sea-row="0"][data-sea-col="0"]');
    firstCell?.classList.add("is-landed");

    this.setHint(LEVEL_TWO.hints.landed);
  }

  updateActiveZone(zone) {
    this.activeZone = zone;
    this.poemL2.dataset.activeZone = zone;
  }

  updateActor() {
    const x = this.overrideActorX ?? this.actorXBase();
    const y = this.overrideActorY ?? this.actorYBase();
    this.actor.style.transform = `translate3d(${x - STAGE_L2.actorSize / 2}px, ${y - STAGE_L2.actorSize}px, 0)`;
  }

  updateActorVisual(time) {
    const direction = Number(this.holdRight) - Number(this.holdLeft);
    if (direction !== 0) {
      this.actor.dataset.direction = direction < 0 ? "left" : "right";
    }

    let sheet = "motion";
    let frame = 0;

    if (this.state === STATES_L2.INTRO) {
      sheet = "motion";
      frame = Math.floor(time / 720) % 2;
    } else if (this.state === STATES_L2.FALLING || this.actorPose === "fall") {
      sheet = "motion";
      frame = 5;
    } else if (this.actorPose === "land") {
      sheet = "motion";
      frame = 6;
    } else if (this.state === STATES_L2.PIERCE) {
      sheet = "motion";
      frame = 5;
    } else if (this.state === STATES_L2.LANDED_SEA) {
      sheet = "sink";
      frame = 1;
    } else if (direction !== 0) {
      sheet = "move";
      frame = 2 + (Math.floor(time / 140) % 2);
    } else {
      sheet = "motion";
      frame = Math.floor(time / 720) % 2;
    }

    this.actor.dataset.sheet = sheet;
    this.actor.dataset.frame = String(frame);
    this.actor.dataset.pose = this.actorPose;
    this.actor.style.setProperty("--actor-sprite-opacity", "1");
  }

  actorXBase() {
    return STAGE_L2.gridLeft + this.col * STAGE_L2.cellWidth + STAGE_L2.cellWidth / 2;
  }

  actorYBase() {
    return rowTopOf(this.row) + this.fallY + this.entryY;
  }

  getChar(row, col) {
    return this.poemL2.querySelector(`.l2-char[data-row="${row}"][data-col="${col}"]`);
  }

  setHint(text) {
    this.hint.textContent = text;
    this.hint.classList.toggle("is-visible", Boolean(text));
  }

  setTimer(callback, delay) {
    const timer = window.setTimeout(() => {
      this.timers.delete(timer);
      callback();
    }, delay);
    this.timers.add(timer);
    return timer;
  }

  clearTimers() {
    this.timers.forEach((timer) => window.clearTimeout(timer));
    this.timers.clear();
  }
}
