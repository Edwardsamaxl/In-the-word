import { gsap } from "gsap";
import {
  STAGE_L2,
  LEVEL_TWO,
  STATES_L2,
  rowTopOf,
  getLine,
  getWrapTarget,
} from "./level-two.js";
import { journey } from "./journey.js";

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
    this.activeRow = 0;
    this.speedMultiplier = 1;
    this.entryY = 0;
    this.jumpY = 0;
    this.rollAngle = 0;
    this.actorPose = "auto";
    this.overrideActorX = null;
    this.overrideActorY = null;
    this.inkSeaSpawned = false;
    this.activeZone = "sky";
    this.isJumping = false;
    this.watermelonTimer = null;
    this.watermelonTriggered = false;
    this.deepBlueFadeTimer = null;
    this.lastDeepBlueRefresh = 0;
    this.baseHint = "";
    this.bulletTime = false;
    this.bulletTimer = null;
    this.state = STATES_L2.INTRO;

    this.melonShadow = document.createElement("div");
    this.melonShadow.className = "melon-shadow";
    this.melonShadow.setAttribute("aria-hidden", "true");
    (this.stage.querySelector(".world-layer") || this.stage).append(this.melonShadow);

    this.melonBall = document.createElement("div");
    this.melonBall.className = "melon-ball";
    this.melonBall.setAttribute("aria-hidden", "true");
    (this.stage.querySelector(".world-layer") || this.stage).append(this.melonBall);

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
    gsap.killTweensOf([
      this.actor,
      this.moon,
      this.moonGlow,
      this.inkSeaEl,
      this.melonBall,
      ...this.actionLines(),
      this,
    ]);
    this.melonShadow?.remove();
    this.melonBall?.remove();
  }

  renderPoem() {
    this.poemL2.replaceChildren();
    LEVEL_TWO.lines.forEach((line) => {
      const lineElement = document.createElement("div");
      lineElement.className = "l2-line";
      lineElement.dataset.row = String(line.row);
      lineElement.dataset.zone = line.zone;
      lineElement.style.left = `${STAGE_L2.gridLeft + line.indent * STAGE_L2.cellWidth}px`;
      lineElement.style.setProperty("--sea-flow-delay", `${line.row * 110}ms`);
      lineElement.style.setProperty("--sea-flow-duration", `${4.2 + (line.row % 3) * 0.55}s`);

      const currentElement = document.createElement("div");
      currentElement.className = "l2-line-current";

      line.chars.forEach((char, localCol) => {
        const col = line.indent + localCol;
        const charEl = document.createElement("span");
        charEl.className = "l2-char";
        charEl.dataset.row = String(line.row);
        charEl.dataset.col = String(col);
        charEl.dataset.char = char;
        charEl.textContent = char;
        currentElement.append(charEl);
      });

      lineElement.append(currentElement);
      this.poemL2.append(lineElement);
    });
    this.layoutLines(this.activeRow);
  }

  // 当前行撑开、其余行收紧（沿用第一关版式）。每次焦点行变化时重排所有行的 top。
  layoutLines(activeRow) {
    const layoutFocus = getLine(activeRow).zone === "action" ? 5 : activeRow;
    LEVEL_TWO.lines.forEach((line) => {
      const el = this.poemL2.querySelector(`.l2-line[data-row="${line.row}"]`);
      if (el) el.style.top = `${rowTopOf(line.row, layoutFocus)}px`;
    });
  }

  setActiveRow(row) {
    if (this.activeRow === row) return;
    this.activeRow = row;
    this.layoutLines(row);
    this.updateActiveZone(getLine(row).zone);
  }

  renderInkSea() {
    const sea = LEVEL_TWO.inkSea;
    this.inkSeaEl.replaceChildren();
    this.inkSeaEl.style.left = `${sea.left}px`;
    this.inkSeaEl.style.top = `${sea.top}px`;
    this.inkSeaEl.style.gridTemplateColumns = `repeat(${sea.cols}, ${sea.cellWidth}px)`;
    this.inkSeaEl.style.gridTemplateRows = `repeat(${sea.rows}, ${sea.rowHeight}px)`;

    for (let r = 0; r < sea.rows; r += 1) {
      for (let c = 0; c < sea.cols; c += 1) {
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
    if (this.trail) gsap.set(this.trail, { opacity: 0 });
    this.moon.classList.remove("is-glowing", "is-silvered");
    this.moonGlow.classList.remove("is-active", "is-silvered");
    // L2 自持月亮初态：无论从「沉入」还是「下一关」跳入，月亮都在缝合位、可见。
    gsap.set(this.moon, {
      left: LEVEL_TWO.moonSeam.handoffLeft,
      top: LEVEL_TWO.moonSeam.handoffTop,
      y: 0,
      scale: 1,
      opacity: 1,
    });
  }

  playIntro() {
    this.entryY = -34;
    this.row = 0;
    this.col = 0;
    this.updateActiveZone("sky");

    // 两次 RAF 让 is-entering 的 opacity:0 先生效，再交还给 CSS → 触发逐行淡入
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
        this.baseHint = LEVEL_TWO.hints.discovery;
        this.setHint(LEVEL_TWO.hints.intro);
        this.restoreHintAfter(LEVEL_TWO.hints.intro, 2400);
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
    this.state = STATES_L2.PLAYING;

    if (scene === "l2-moon") {
      this.row = 1;
      this.col = 8;
      this.updateActiveZone("sky");
      this.triggerMoonSuture();
      return;
    }

    if (scene === "l2-sand") {
      this.row = 2;
      this.col = 8;
      this.updateActiveZone("sand");
      return;
    }

    if (scene === "l2-sea-preview") {
      this.row = 2;
      this.col = 12;
      this.updateActiveZone("sand");
      this.triggerSeaSide();
      return;
    }

    if (scene === "l2-action") {
      this.row = 5;
      this.col = 10;
      this.updateActiveZone("action");
      this.triggerSeaSide();
      this.triggerCheckpoint(10);
      return;
    }

    if (scene === "l2-spear") {
      this.row = 6;
      this.col = 4;
      this.updateActiveZone("action");
      this.triggerSeaSide();
      this.triggerSpear(4);
      return;
    }

    if (scene === "l2-pierce") {
      this.row = 7;
      this.col = 7;
      this.updateActiveZone("action");
      this.triggerSeaSide();
      this.triggerSpear(4);
      this.triggerPierce();
      return;
    }
  }

  handleIntent(intent) {
    if (intent === "reset") {
      this.reset();
      return;
    }

    if (this.disposed) return;
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
      case "jump":
        this.jump();
        break;
      default:
        break;
    }
  }

  reset() {
    this.clearTimers();
    gsap.killTweensOf([this.actor, this.moon, this.moonGlow, this.inkSeaEl, this.melonBall, this]);
    this.cancelWatermelon();
    this.clearBulletTime();
    this.bulletTimer = null;

    this.triggerCooldown.clear();
    this.triggerOnce.clear();
    this.inkSeaSpawned = false;
    this.watermelonTriggered = false;
    this.deepBlueFadeTimer = null;
    this.lastDeepBlueRefresh = 0;
    this.holdLeft = false;
    this.holdRight = false;
    this.entryY = 0;
    this.jumpY = 0;
    this.isJumping = false;
    this.overrideActorX = null;
    this.overrideActorY = null;
    this.speedMultiplier = 1;
    this.actorPose = "auto";
    this.state = STATES_L2.INTRO;
    this.row = 0;
    this.col = 0;
    this.actor.dataset.direction = "right";

    this.poemL2
      .querySelectorAll(".l2-char")
      .forEach((c) =>
        c.classList.remove("is-lit", "is-mooning", "is-verdant", "is-spearing", "is-pierce-glyph", "is-checkpoint"),
      );
    this.poemL2
      .querySelectorAll(".l2-line")
      .forEach((l) => l.classList.remove("is-deepblue", "is-pierced"));
    this.poemL2.classList.remove(
      "is-pierce",
      "is-spear-cocked",
      "is-spear-pull",
      "is-spear-thrust",
    );
    gsap.killTweensOf(this.actionLines());
    gsap.set(this.actionLines(), { x: 0 });
    this.actor.classList.remove("is-piercing");
    this.poemL2.dataset.activeZone = "sky";
    this.poemL2.classList.add("is-entering");
    this.inkSeaEl.classList.remove("is-visible");
    this.inkSeaEl.setAttribute("aria-hidden", "true");
    this.inkSeaEl.querySelectorAll(".ink-sea-cell").forEach((c) => c.classList.remove("is-landed"));
    this.moon.classList.remove("is-glowing", "is-silvered");
    this.moonGlow.classList.remove("is-active", "is-silvered");
    this.melonBall.classList.remove("is-visible");
    gsap.set(this.melonBall, { opacity: 0, clearProps: "transform" });
    this.stage.classList.remove("is-paper-deepblue", "is-paper-verdant", "is-paper-sea");
    this.setHint("");

    gsap.set(this.moon, {
      left: LEVEL_TWO.moonSeam.handoffLeft,
      top: LEVEL_TWO.moonSeam.handoffTop,
      y: 0,
      scale: 1,
      opacity: 1,
    });
    gsap.set(this.actor, { opacity: 0 });

    this.playIntro();
  }

  tick(time) {
    if (this.disposed) return;
    const dt = Math.min((time - this.lastFrame) / 1000, 0.05);
    this.lastFrame = time;
    this.updateMovement(dt);
    this.setActiveRow(this.row);
    this.maintainDeepBlue(time);
    this.maintainWatermelon();
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
    const timeScale = this.bulletTime ? STAGE_L2.bulletTimeScale : 1;
    this.col += direction * STAGE_L2.speed * this.speedMultiplier * timeScale * dt;

    // 区内自动卷轴换行；区边界（区首/区尾）则夹住，由特殊动作跨区。
    if (this.col > line.maxCol + 0.5) {
      const target = getWrapTarget(this.row, 1);
      if (target !== null) {
        this.startWrap(target, 1);
        return;
      }
      this.col = line.maxCol;
    }
    if (this.col < line.minCol - 0.5) {
      const target = getWrapTarget(this.row, -1);
      if (target !== null) {
        this.startWrap(target, -1);
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

    journey.step(Math.abs(currentCell - previousCell));
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

  // 区内 200ms 自动卷轴换行（沿用第一关 §6.5 手感）：方块淡出当前行末，淡入下一行首。
  startWrap(targetRow, direction) {
    this.state = STATES_L2.WRAPPING;
    const toLine = getLine(targetRow);
    const targetCol = direction > 0 ? toLine.minCol : toLine.maxCol;

    gsap
      .timeline({
        onComplete: () => {
          this.state = STATES_L2.PLAYING;
          this.triggerCell(targetRow, Math.round(targetCol));
        },
      })
      .to(this.actor, { opacity: 0, duration: STAGE_L2.wrapDuration / 2, ease: "power1.in" })
      .add(() => {
        this.row = targetRow;
        this.col = targetCol;
      })
      .to(this.actor, { opacity: 1, duration: STAGE_L2.wrapDuration / 2, ease: "power1.out" });
  }

  jump() {
    if (this.state !== STATES_L2.PLAYING || this.isJumping) return;

    const cross = LEVEL_TWO.crossings.jump;
    const atMoon = this.row === cross.row && cross.cols.includes(Math.round(this.col));
    if (atMoon) {
      this.jumpCross(cross.to);
      return;
    }
    this.emptyJump();
  }

  // 全关唯一一次玩家主动跳跃跨区：天空 → 沙地。高弧线「翻篇下落」，落点编排在沙地行首，主轴向下。
  jumpCross(target) {
    this.state = STATES_L2.CROSSING;
    this.clearBulletTime();
    this.holdLeft = false;
    this.holdRight = false;
    this.actorPose = "jump-rise";
    this.setHint(this.baseHint);

    const startX = this.actorXBase();
    const startY = this.actorYBase();
    // 先把目标行撑开（焦点下移到沙地），方块朝最终落点飞，避免落地后文字再滑动。
    this.setActiveRow(target.row);
    const endX = STAGE_L2.gridLeft + target.col * STAGE_L2.cellWidth + STAGE_L2.cellWidth / 2;
    const endY = rowTopOf(target.row, target.row);
    const arc = STAGE_L2.jumpArc;

    const t = { p: 0 };
    gsap.to(t, {
      p: 1,
      duration: STAGE_L2.jumpCrossDuration,
      ease: "power1.inOut",
      onUpdate: () => {
        const p = t.p;
        this.overrideActorX = startX + (endX - startX) * p;
        this.overrideActorY = startY + (endY - startY) * p - Math.sin(p * Math.PI) * arc;
        this.actorPose = p < 0.5 ? "jump-rise" : "jump-fall";
      },
      onComplete: () => {
        this.overrideActorX = null;
        this.overrideActorY = null;
        this.row = target.row;
        this.col = target.col;
        this.actorPose = "land";
        this.bounceLand();
        this.triggerCell(target.row, Math.round(this.col));
        this.state = STATES_L2.PLAYING;
      },
    });
  }

  // 其余位置按跳跃 = 落回原地的空跳，既不跨区也够不到海。
  emptyJump() {
    this.isJumping = true;
    this.actorPose = "jump-rise";
    const j = { v: 0 };
    gsap
      .timeline({
        onComplete: () => {
          this.isJumping = false;
          this.jumpY = 0;
          this.actorPose = "auto";
        },
      })
      .to(j, {
        v: -STAGE_L2.jumpHeight,
        duration: 0.22,
        ease: "power2.out",
        onUpdate: () => {
          this.jumpY = j.v;
        },
      })
      .add(() => {
        this.actorPose = "jump-fall";
      })
      .to(j, {
        v: 0,
        duration: 0.26,
        ease: "power2.in",
        onUpdate: () => {
          this.jumpY = j.v;
        },
      });
  }

  bounceLand() {
    const b = { v: 0 };
    gsap.to(b, {
      v: 4,
      duration: 0.08,
      ease: "power2.out",
      yoyo: true,
      repeat: 1,
      onUpdate: () => {
        this.jumpY = b.v;
      },
      onComplete: () => {
        this.jumpY = 0;
        if (this.actorPose === "land") this.actorPose = "auto";
      },
    });
  }

  // 西瓜撞落：在「碧绿的西瓜」上被动停留满 1 秒（向左移动即取消、重新计时）。
  maintainWatermelon() {
    if (this.state !== STATES_L2.PLAYING || this.watermelonTriggered) {
      if (this.watermelonTimer) this.cancelWatermelon();
      return;
    }

    const def = LEVEL_TWO.crossings.watermelon;
    const onMelon = this.row === def.row && def.cols.includes(Math.round(this.col)) && !this.holdLeft;

    if (onMelon) {
      if (!this.watermelonTimer) this.startWatermelon();
    } else if (this.watermelonTimer) {
      this.cancelWatermelon();
    }
  }

  startWatermelon() {
    this.melonShadow.style.left = `${this.actorXBase()}px`;
    this.melonShadow.style.top = `${this.actorYBase() - STAGE_L2.actorSize / 2}px`;
    this.melonShadow.classList.add("is-charging");
    this.setHint(LEVEL_TWO.hints.watermelon);
    this.watermelonTimer = this.setTimer(() => {
      this.watermelonTimer = null;
      this.smashWatermelon();
    }, STAGE_L2.watermelonDwell);
  }

  cancelWatermelon() {
    if (this.watermelonTimer) {
      window.clearTimeout(this.watermelonTimer);
      this.timers.delete(this.watermelonTimer);
      this.watermelonTimer = null;
    }
    this.melonShadow.classList.remove("is-charging");
    if (this.hint.textContent === LEVEL_TWO.hints.watermelon) this.setHint(this.baseHint);
  }

  smashWatermelon() {
    if (this.watermelonTriggered) return;
    this.watermelonTriggered = true;

    const def = LEVEL_TWO.crossings.watermelon;
    const target = def.to;
    this.state = STATES_L2.CROSSING;
    this.clearBulletTime();
    this.holdLeft = false;
    this.holdRight = false;
    this.actorPose = "auto";

    const verdant = this.getChar(4, 12) || this.getChar(4, 11);
    verdant?.classList.add("is-verdant");

    const startX = this.actorXBase();
    const startY = this.actorYBase();
    const endX = STAGE_L2.gridLeft + target.col * STAGE_L2.cellWidth + STAGE_L2.cellWidth / 2;
    const endY = rowTopOf(target.row, target.row);

    // 西瓜只负责落下撞击；命中后留在原地，精灵独立被砸飞到行动区入口。
    this.melonBall.style.left = `${startX}px`;
    this.melonBall.style.top = `${startY - STAGE_L2.actorSize}px`;
    gsap.set(this.melonBall, { x: 130, y: -196, xPercent: -50, yPercent: -50, opacity: 1, scale: 1, rotation: 0 });
    this.melonBall.classList.add("is-visible");

    const t = { p: 0 };
    gsap
      .timeline()
      .to(this.melonBall, {
        x: 0,
        y: 0,
        rotation: 90,
        duration: STAGE_L2.melonFallDuration,
        ease: "power3.in",
      })
      .add(() => {
        this.melonShadow.classList.remove("is-charging");
        this.melonShadow.classList.add("is-smash");
        this.setTimer(() => this.melonShadow.classList.remove("is-smash"), 420);
        this.actorPose = "fall";
        this.setActiveRow(target.row);
      })
      .addLabel("impact")
      .to(
        this.melonBall,
        {
          y: 8,
          scaleX: 1.18,
          scaleY: 0.72,
          rotation: 104,
          duration: 0.08,
          ease: "power2.out",
        },
        "impact",
      )
      .to(
        this.melonBall,
        {
          y: 18,
          opacity: 0,
          scaleX: 0.76,
          scaleY: 0.76,
          rotation: 126,
          duration: 0.22,
          ease: "power1.out",
          onComplete: () => {
            this.melonBall.classList.remove("is-visible");
          },
        },
        "impact+=0.08",
      )
      .to(
        t,
        {
          p: 1,
          duration: STAGE_L2.smashDuration,
          ease: "power3.out",
          onUpdate: () => {
            const p = t.p;
            this.overrideActorX = startX + (endX - startX) * p;
            this.overrideActorY = startY + (endY - startY) * p - Math.sin(p * Math.PI) * 22;
          },
          onComplete: () => {
            this.overrideActorX = null;
            this.overrideActorY = null;
            this.row = target.row;
            this.col = target.col;
            this.actorPose = "land";
            this.triggerCheckpoint(target.col);
            this.bounceLand();
            this.state = STATES_L2.PLAYING;
            this.setHint(this.baseHint);
          },
        },
        "impact",
      );
  }

  triggerCell(row, col) {
    const key = `${row}:${col}`;
    const now = performance.now();
    if (now - (this.triggerCooldown.get(key) || 0) < 800) return;
    this.triggerCooldown.set(key, now);

    const triggers = LEVEL_TWO.triggers;

    if (this.matchTrigger(row, col, triggers.deepBlue)) this.applyDeepBlue();
    if (this.matchTrigger(row, col, triggers.moon)) this.triggerMoonSuture();
    if (this.matchTrigger(row, col, triggers.seaSide)) this.triggerSeaSide();
    if (this.matchTrigger(row, col, triggers.vast)) this.triggerVast();
    if (this.matchTrigger(row, col, triggers.watermelon)) this.triggerWatermelonNotice();
    if (this.matchTrigger(row, col, triggers.boy)) this.triggerCheckpoint(col);
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

  // 接近「深蓝」即持续染色，离开后才淡出（沿用第一关「光」的 maintainLight 手感）。
  maintainDeepBlue(time) {
    if (this.state !== STATES_L2.PLAYING) return;
    const def = LEVEL_TWO.triggers.deepBlue;
    if (this.row !== def.row) return;
    const nearEdge = def.cols[def.cols.length - 1] + 0.6;
    if (this.col > nearEdge) return;
    if (time - this.lastDeepBlueRefresh < 280) return;
    this.lastDeepBlueRefresh = time;
    this.applyDeepBlue();
  }

  applyDeepBlue() {
    const row0 = this.poemL2.querySelector('.l2-line[data-row="0"]');
    row0?.classList.add("is-deepblue");
    this.stage.classList.add("is-paper-deepblue");
    if (this.deepBlueFadeTimer) {
      window.clearTimeout(this.deepBlueFadeTimer);
      this.timers.delete(this.deepBlueFadeTimer);
    }
    this.deepBlueFadeTimer = this.setTimer(() => {
      row0?.classList.remove("is-deepblue");
      this.stage.classList.remove("is-paper-deepblue");
      this.deepBlueFadeTimer = null;
    }, 1300);
  }

  triggerMoonSuture() {
    if (this.triggerOnce.has("moon")) return;
    this.triggerOnce.add("moon");

    this.enterBulletTime();
    this.moon.classList.add("is-glowing");
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

    LEVEL_TWO.triggers.moon.cols.forEach((col, index) => {
      const charEl = this.getChar(1, col);
      if (!charEl) return;
      this.setTimer(() => {
        charEl.classList.remove("is-mooning");
        void charEl.offsetWidth;
        charEl.classList.add("is-mooning");
      }, index * 90);
    });

    this.setHint(LEVEL_TWO.hints.moonSuture);
    this.setTimer(() => {
      if (this.hint.textContent !== LEVEL_TWO.hints.moonSuture) return;
      if (this.state === STATES_L2.PLAYING && this.row === 1) {
        this.setHint(LEVEL_TWO.hints.moonJump);
      } else {
        this.setHint(this.baseHint);
      }
    }, 2400);
  }

  triggerSeaSide() {
    if (this.inkSeaSpawned) return;
    this.inkSeaSpawned = true;
    this.enterBulletTime();
    this.inkSeaEl.setAttribute("aria-hidden", "false");
    this.inkSeaEl.classList.add("is-visible");
    this.stage.classList.add("is-paper-sea");
    this.setHint(LEVEL_TWO.hints.seaSide);
    this.restoreHintAfter(LEVEL_TWO.hints.seaSide, 2200);
  }

  triggerVast() {
    if (this.triggerOnce.has("vast")) return;
    this.triggerOnce.add("vast");
    gsap.to(this, { speedMultiplier: VAST_BOOST, duration: 0.4, ease: "power1.out" });
    this.setTimer(() => {
      gsap.to(this, { speedMultiplier: 1, duration: 0.6, ease: "power1.inOut" });
    }, 2400);
  }

  // 到达「西瓜」即定格减速，提示在此停留撞落（停留计时仍走真实时钟，互不冲突）。
  triggerWatermelonNotice() {
    if (this.triggerOnce.has("watermelonNotice") || this.watermelonTriggered) return;
    this.triggerOnce.add("watermelonNotice");
    this.enterBulletTime(LEVEL_TWO.hints.watermelon);
  }

  triggerCheckpoint(col) {
    if (this.triggerOnce.has("boy")) return;
    this.triggerOnce.add("boy");
    this.checkpoint = { row: 5, col };
    LEVEL_TWO.triggers.boy.cols.forEach((c) => this.getChar(5, c)?.classList.add("is-checkpoint"));
  }

  triggerSpear(col) {
    if (this.triggerOnce.has(`spear:${col}`)) return;
    this.triggerOnce.add(`spear:${col}`);
    this.poemL2.classList.add("is-spear-cocked");
    const middleLine = this.getLineElement(6);
    if (middleLine) {
      gsap.to(middleLine, {
        x: -24,
        duration: 0.22,
        ease: "power2.inOut",
      });
    }
    this.getChar(6, col)?.classList.add("is-spearing");
  }

  triggerPierce() {
    if (this.triggerOnce.has("pierce")) return;
    this.triggerOnce.add("pierce");

    this.state = STATES_L2.PIERCE;
    this.clearBulletTime();
    this.holdLeft = false;
    this.holdRight = false;
    this.setHint(LEVEL_TWO.hints.pierce);

    // 三行是同一个钢叉状态机：并列 → 中行后退 → 整体后拉 → 整体前刺 → 命中飞出。
    this.poemL2.classList.add("is-pierce", "is-spear-pull");

    const startX = this.actorXBase();
    const startY = this.actorYBase();
    const sea = LEVEL_TWO.inkSea;
    const targetX = sea.left + sea.cellWidth / 2;
    const targetY = sea.top + sea.rowHeight - 6;

    const topLine = this.getLineElement(5);
    const middleLine = this.getLineElement(6);
    const bottomLine = this.getLineElement(7);
    const outerLines = [topLine, bottomLine].filter(Boolean);
    const allLines = [topLine, middleLine, bottomLine].filter(Boolean);
    const t = { p: 0 };

    gsap.killTweensOf(allLines);
    gsap
      .timeline()
      .add(() => {
        this.poemL2.classList.add("is-spear-pull");
      }, 0)
      .to(outerLines, {
        x: -22,
        duration: 0.24,
        ease: "power2.in",
      }, 0)
      .to(middleLine, {
        x: -46,
        duration: 0.24,
        ease: "power2.in",
      }, 0)
      .add(() => {
        this.poemL2.classList.remove("is-spear-pull");
        this.poemL2.classList.add("is-spear-thrust");
      }, 0.24)
      .to(outerLines, {
        x: 96,
        duration: 0.15,
        ease: "power4.in",
      }, 0.24)
      .to(middleLine, {
        x: 72,
        duration: 0.15,
        ease: "power4.in",
      }, 0.24)
      .add(() => {
        this.actorPose = "fall";
      }, 0.39)
      .to(t, {
        p: 1,
        duration: 0.82,
        ease: "power2.out",
        onUpdate: () => {
          const p = t.p;
          this.overrideActorX = startX + (targetX - startX) * p;
          this.overrideActorY = startY + (targetY - startY) * p - Math.sin(p * Math.PI) * 42;
        },
        onComplete: () => {
          this.overrideActorX = targetX;
          this.overrideActorY = targetY;
          this.state = STATES_L2.LANDED_SEA;
          this.onLandedSea();
        },
      }, 0.39);
  }

  onLandedSea() {
    this.moon.classList.add("is-silvered");
    this.moonGlow.classList.remove("is-active");
    this.moonGlow.classList.add("is-silvered");

    const firstCell = this.inkSeaEl.querySelector(
      '.ink-sea-cell[data-sea-row="0"][data-sea-col="0"]',
    );
    firstCell?.classList.add("is-landed");

    this.setHint(LEVEL_TWO.hints.landed);
    this.stage.dispatchEvent(
      new CustomEvent("level-two-complete", {
        detail: { entry: "ink-sea" },
      }),
    );
  }

  updateActiveZone(zone) {
    this.activeZone = zone;
    this.poemL2.dataset.activeZone = zone;
  }

  // 关键字「子弹时间」：碰到关键字时整体减速 + 冷色定格，让玩家留意这一笔（沿用第一关举头/低头）。
  enterBulletTime(hint, duration = 1600) {
    this.bulletTime = true;
    this.stage.classList.add("is-bullet-time", "is-cool");
    if (hint) this.setHint(hint);
    if (this.bulletTimer) {
      window.clearTimeout(this.bulletTimer);
      this.timers.delete(this.bulletTimer);
    }
    this.bulletTimer = this.setTimer(() => {
      this.bulletTimer = null;
      this.bulletTime = false;
      this.stage.classList.remove("is-bullet-time", "is-cool");
    }, duration);
  }

  clearBulletTime() {
    if (this.bulletTimer) {
      window.clearTimeout(this.bulletTimer);
      this.timers.delete(this.bulletTimer);
      this.bulletTimer = null;
    }
    this.bulletTime = false;
    this.stage.classList.remove("is-bullet-time", "is-cool");
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
      frame = Math.floor(time / 720) % 2;
    } else if (this.actorPose === "jump-rise") {
      frame = 4;
    } else if (this.actorPose === "jump-fall" || this.actorPose === "fall") {
      frame = 5;
    } else if (this.actorPose === "land") {
      frame = 6;
    } else if (this.state === STATES_L2.PIERCE) {
      frame = 5;
    } else if (this.state === STATES_L2.LANDED_SEA) {
      sheet = "sink";
      frame = 1;
    } else if (direction !== 0) {
      sheet = "move";
      frame = 2 + (Math.floor(time / 140) % 2);
    } else {
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
    const layoutFocus = getLine(this.row).zone === "action" ? 5 : this.row;
    return rowTopOf(this.row, layoutFocus) + this.entryY + this.jumpY;
  }

  getChar(row, col) {
    return this.poemL2.querySelector(`.l2-char[data-row="${row}"][data-col="${col}"]`);
  }

  getLineElement(row) {
    return this.poemL2.querySelector(`.l2-line[data-row="${row}"]`);
  }

  actionLines() {
    return [5, 6, 7].map((row) => this.getLineElement(row)).filter(Boolean);
  }

  setHint(text) {
    this.hint.textContent = text;
    this.hint.classList.toggle("is-visible", Boolean(text));
  }

  // 瞬时提示结束后回落到常驻提示（baseHint），而非清空 —— 让「留意脚下…」始终在场。
  restoreHintAfter(text, delay) {
    this.setTimer(() => {
      if (this.hint.textContent === text) this.setHint(this.baseHint);
    }, delay);
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
