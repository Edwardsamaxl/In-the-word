import { gsap } from "gsap";
import "./styles.css";
import { InputController } from "./input.js";
import { LEVEL_ONE, STAGE, STATES } from "./level-one.js";
import { LevelTwoGame } from "./level-two-game.js";

class LevelOneGame {
  constructor() {
    this.stage = document.querySelector("#game");
    this.viewport = document.querySelector("#viewport");
    this.poem = document.querySelector("#poem");
    this.actor = document.querySelector("#actor");
    this.trail = document.querySelector("#trail");
    this.hint = document.querySelector("#hint");
    this.light = document.querySelector("#light");
    this.moon = document.querySelector("#moon");
    this.pageWash = document.querySelector("#page-wash");
    this.handoff = document.querySelector("#handoff");
    this.resetButton = document.querySelector("#reset");
    this.frostOverlay = document.querySelector("#frost-overlay");
    this.canvas = document.querySelector("#fx");
    this.ctx = this.canvas.getContext("2d");
    this.qaScene = new URLSearchParams(window.location.search).get("scene");

    this.state = STATES.INTRO;
    this.row = 0;
    this.col = 0;
    this.jumpY = 0;
    this.sinkY = 0;
    this.sinkProgress = 0;
    this.rollAngle = 0;
    this.holdLeft = false;
    this.holdRight = false;
    this.isJumping = false;
    this.actorPose = "auto";
    this.moonCreated = false;
    this.triggerCooldown = new Map();
    this.timers = new Set();
    this.particles = [];
    this.lastFrame = performance.now();
    this.lastCell = 0;
    this.wallFeedbackReady = true;
    this.sinkTimer = null;
    this.jumpTl = null;

    this.renderPoem();
    this.configureCanvas();
    this.input = new InputController(this.stage, (intent) => this.handleIntent(intent));
    this.resetButton.addEventListener("click", () => this.handleIntent("reset"));
    window.addEventListener("resize", () => this.resizeStage());
    this.resizeStage();
    this.reset();
    requestAnimationFrame((time) => this.tick(time));
  }

  renderPoem() {
    this.poem.replaceChildren();
    LEVEL_ONE.lines.forEach((line, row) => {
      const lineElement = document.createElement("div");
      lineElement.className = "poem-line";
      lineElement.dataset.row = String(row);

      [...line].forEach((char, col) => {
        const charElement = document.createElement("span");
        charElement.className = "char";
        charElement.textContent = char;
        charElement.dataset.row = String(row);
        charElement.dataset.col = String(col);
        charElement.dataset.char = char;

        if (row === 1 && col >= 5) charElement.classList.add("is-locked");
        if (row === 0 && (col === 2 || col === 3)) charElement.classList.add("is-moon-word");
        lineElement.append(charElement);
      });

      this.poem.append(lineElement);
    });
  }

  configureCanvas() {
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    this.canvas.width = STAGE.width * dpr;
    this.canvas.height = STAGE.height * dpr;
    this.canvas.style.width = `${STAGE.width}px`;
    this.canvas.style.height = `${STAGE.height}px`;
    this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }

  resizeStage() {
    const padding = 16;
    const scale = Math.min(
      1,
      (window.innerWidth - padding) / STAGE.width,
      (window.innerHeight - padding) / STAGE.height,
    );

    this.stage.style.transform = `scale(${scale})`;
    this.viewport.style.width = `${STAGE.width * scale}px`;
    this.viewport.style.height = `${STAGE.height * scale}px`;
  }

  reset() {
    gsap.globalTimeline.clear();
    this.clearTimers();
    this.cancelSink();
    this.sinkAttemptTween?.kill();
    this.sinkAttemptTween = null;
    this.lightFadeTimer = null;
    this.lastLightRefresh = 0;
    this.renderPoem();
    this.particles = [];
    this.ctx.clearRect(0, 0, STAGE.width, STAGE.height);

    this.state = STATES.INTRO;
    this.row = 0;
    this.col = 0;
    this.lastCell = 0;
    this.jumpY = 0;
    this.sinkY = 0;
    this.sinkProgress = 0;
    this.rollAngle = 0;
    this.holdLeft = false;
    this.holdRight = false;
    this.isJumping = false;
    this.actorPose = "auto";
    this.moonCreated = false;
    this.discoveryHintShown = false;
    this.triggerCooldown.clear();
    this.jumpTl = null;

    this.stage.className = "game-stage";
    this.actor.style.opacity = "0";
    this.actor.style.scale = "";
    this.trail.style.opacity = "0";
    this.light.style.opacity = "0";
    this.moon.style.opacity = "0";
    this.moon.style.background = "";
    this.pageWash.style.opacity = "0";
    this.pageWash.style.transform = "translateY(100%)";
    this.handoff.style.opacity = "0";
    this.handoff.setAttribute("aria-hidden", "true");
    this.setHint("");
    this.updateActor();
    this.setActiveRow(0);
    if (this.qaScene) {
      this.showQaScene(this.qaScene);
    } else {
      this.playIntro();
    }
  }

  playIntro() {
    const chars = this.getChars();
    const paper = this.stage.querySelector(".paper-layer");
    const entrance = { value: -30 };
    gsap.set(chars, { opacity: 0, y: 0, x: 0, rotate: 0, scale: 1 });
    this.jumpY = entrance.value;

    const timeline = gsap.timeline();
    timeline.to(paper, { opacity: 1, duration: 0.5, ease: "power1.out" });

    chars.forEach((char, index) => {
      timeline.to(
        char,
        { opacity: char.classList.contains("is-locked") ? 0.35 : 1, duration: 0.01 },
        0.5 + index * 0.06,
      );
    });

    timeline
      .to(this.poem, { y: 2, duration: 0.08, ease: "power2.in" }, 1.98)
      .to(this.poem, { y: 0, duration: 0.1, ease: "power3.out" })
      .set(this.actor, { opacity: 1 }, 2.08)
      .to(entrance, {
        value: 0,
        duration: 0.32,
        ease: "power2.in",
        onUpdate: () => {
          this.jumpY = entrance.value;
        },
      }, 2.08)
      .to(entrance, {
        value: -4,
        duration: 0.08,
        ease: "power2.out",
        onUpdate: () => {
          this.jumpY = entrance.value;
        },
      })
      .to(entrance, {
        value: 0,
        duration: 0.1,
        ease: "power2.in",
        onUpdate: () => {
          this.jumpY = entrance.value;
        },
      })
      .call(() => {
        this.jumpY = 0;
        this.state = STATES.IDLE;
        this.setHint("按住左右两侧，开始走");
      });
  }

  showQaScene(scene) {
    const paper = this.stage.querySelector(".paper-layer");
    gsap.set(paper, { opacity: 1 });
    gsap.set(this.getChars(), { opacity: 1 });
    this.poem.querySelectorAll(".char.is-locked").forEach((char) => {
      gsap.set(char, { opacity: 0.35 });
    });
    gsap.set(this.actor, { opacity: 1 });

    if (scene === "postmoon" || scene === "sink") {
      this.state = STATES.PLAYING_POST_MOON;
      this.row = 1;
      this.col = 6;
      this.moonCreated = true;
      this.setActiveRow(1);
      this.poem.querySelectorAll('.char[data-row="0"]').forEach((char) => {
        gsap.set(char, { opacity: 0 });
      });
      this.poem.querySelectorAll(".char.is-locked").forEach((char) => {
        char.classList.remove("is-locked");
        gsap.set(char, { opacity: 1 });
      });
      gsap.set(this.moon, { opacity: 1, y: 0, scale: 1 });
      if (scene === "sink") {
        this.actorPose = "sinking";
        this.sinkProgress = 0.62;
        this.sinkY = 6;
        this.stage.classList.add("is-sinking");
      }
      this.setHint("低下头，往下看……");
      return;
    }

    if (scene === "jump") {
      this.state = STATES.PLAYING;
      this.row = 0;
      this.col = 4;
      this.jumpY = -54;
      this.actorPose = "jump-apex";
      this.setHint("");
      return;
    }

    if (scene === "handoff") {
      this.state = STATES.HANDOFF;
      this.stage.classList.add("is-handoff");
      this.handoff.setAttribute("aria-hidden", "false");
      gsap.set(this.actor, { opacity: 0 });
      gsap.set(this.moon, {
        left: 308,
        top: 108,
        y: 0,
        scale: 1,
        opacity: 1,
      });
      gsap.set(this.handoff, { opacity: 1 });
      return;
    }

    this.state = STATES.IDLE;
    this.setHint("按住左右两侧，开始走");
  }

  handleIntent(intent) {
    if (intent === "reset") {
      this.reset();
      return;
    }

    if (this.state === STATES.INTRO || this.state === STATES.TRANSITION_TO_LEVEL_2) return;

    if (this.state === STATES.IDLE && !intent.startsWith("release") && intent !== "cancel-sink") {
      this.state = STATES.PLAYING;
    }

    switch (intent) {
      case "hold-left":
        this.holdLeft = true;
        if (this.sinkTimer) this.cancelSink();
        break;
      case "release-left":
        this.holdLeft = false;
        break;
      case "hold-right":
        this.holdRight = true;
        if (this.sinkTimer) this.cancelSink();
        break;
      case "release-right":
        this.holdRight = false;
        break;
      case "jump":
        this.jump();
        break;
      case "sink-attempt":
        this.attemptSink();
        break;
      case "cancel-sink":
        this.cancelSink();
        break;
      default:
        break;
    }
  }

  jump() {
    const canBreakMoon =
      !this.moonCreated &&
      (this.state === STATES.BULLET_TIME ||
        (this.state === STATES.PLAYING && this.isAtMoonTrigger()));
    if (canBreakMoon) {
      this.breakMoon();
      return;
    }

    if (
      this.isJumping ||
      ![STATES.PLAYING, STATES.PLAYING_POST_MOON].includes(this.state)
    ) {
      return;
    }

    this.isJumping = true;
    this.actorPose = "jump-anticipation";
    const jump = { value: 0 };
    this.jumpTl = gsap
      .timeline({
        onComplete: () => {
          this.isJumping = false;
          this.jumpY = 0;
          this.actorPose = "auto";
          this.jumpTl = null;
          const landedCol = Math.round(this.col);
          if (landedCol >= 0 && landedCol < LEVEL_ONE.lines[this.row].length) {
            this.triggerCell(this.row, landedCol);
          }
        },
      })
      .call(() => {
        this.actorPose = "jump-rise";
      }, null, 0.06)
      .to(jump, {
        value: -69,
        duration: 0.22,
        ease: "power2.out",
        onUpdate: () => {
          this.jumpY = jump.value;
        },
      })
      .call(() => {
        this.actorPose = "jump-apex";
      }, null, 0.28)
      .call(() => {
        this.actorPose = "jump-fall";
      }, null, 0.34)
      .to(jump, {
        value: 0,
        duration: 0.26,
        ease: "power2.in",
        onUpdate: () => {
          this.jumpY = jump.value;
        },
      })
      .call(() => {
        this.actorPose = "jump-land";
        this.shudderOnLand();
      }, null, 0.5)
      .call(() => {
        this.actorPose = "jump-recover";
      }, null, 0.56);
  }

  shudderOnLand() {
    if (this.state === STATES.MOON_BREAK || this.state === STATES.TRANSITION_TO_LEVEL_2) return;
    gsap.killTweensOf(this.poem, "y");
    gsap.timeline()
      .to(this.poem, { y: 1.6, duration: 0.07, ease: "power2.in" })
      .to(this.poem, { y: 0, duration: 0.22, ease: "elastic.out(1, 0.42)" });
  }

  startSink() {
    const sinkableState =
      this.state === STATES.PLAYING_POST_MOON ||
      (this.state === STATES.BULLET_TIME && this.moonCreated);
    const sinkRange = this.state === STATES.BULLET_TIME ? 1.5 : 0.5;
    if (
      !sinkableState ||
      this.row !== LEVEL_ONE.triggers.sink.row ||
      Math.abs(this.col - LEVEL_ONE.triggers.sink.col) > sinkRange ||
      this.holdLeft ||
      this.holdRight ||
      this.sinkTimer
    ) {
      return;
    }

    this.actorPose = "sinking";
    this.sinkProgress = 0;
    this.stage.classList.add("is-sinking");
    const sink = { value: 0 };
    this.sinkTween = gsap.to(sink, {
      value: 1,
      duration: 1,
      ease: "power2.in",
      onUpdate: () => {
        this.sinkProgress = sink.value;
        this.sinkY = sink.value * 9;
      },
    });

    this.sinkTimer = window.setTimeout(() => {
      this.sinkTimer = null;
      this.transitionToLevelTwo();
    }, 1000);
    this.timers.add(this.sinkTimer);
  }

  attemptSink() {
    if (this.isJumping) return;
    if (this.holdLeft || this.holdRight) return;
    if (this.sinkTimer || this.sinkAttemptTween) return;
    const allowedStates = [STATES.PLAYING, STATES.PLAYING_POST_MOON, STATES.BULLET_TIME];
    if (!allowedStates.includes(this.state)) return;

    const sinkableState =
      this.state === STATES.PLAYING_POST_MOON ||
      (this.state === STATES.BULLET_TIME && this.moonCreated);
    const sinkRange = this.state === STATES.BULLET_TIME ? 1.5 : 0.5;
    const validPosition =
      sinkableState &&
      this.row === LEVEL_ONE.triggers.sink.row &&
      Math.abs(this.col - LEVEL_ONE.triggers.sink.col) <= sinkRange;

    if (validPosition) {
      this.startSink();
    } else {
      this.playSinkAttemptFeedback();
    }
  }

  playSinkAttemptFeedback() {
    this.actorPose = "sinking";
    const attempt = { value: 0 };
    this.sinkAttemptTween = gsap
      .timeline({
        onComplete: () => {
          this.sinkY = 0;
          this.sinkProgress = 0;
          this.actorPose = "auto";
          this.sinkAttemptTween = null;
        },
      })
      .to(attempt, {
        value: 0.3,
        duration: 0.22,
        ease: "power2.out",
        onUpdate: () => {
          this.sinkProgress = attempt.value;
          this.sinkY = attempt.value * 4;
        },
      })
      .to(attempt, {
        value: 0.28,
        duration: 0.14,
        ease: "sine.inOut",
        onUpdate: () => {
          this.sinkProgress = attempt.value;
          this.sinkY = attempt.value * 4;
        },
      })
      .to(attempt, {
        value: 0,
        duration: 0.3,
        ease: "power2.in",
        onUpdate: () => {
          this.sinkProgress = attempt.value;
          this.sinkY = attempt.value * 4;
        },
      });
  }

  cancelSink() {
    if (this.sinkTimer) {
      window.clearTimeout(this.sinkTimer);
      this.timers.delete(this.sinkTimer);
      this.sinkTimer = null;
    }
    this.sinkTween?.kill();
    this.sinkTween = null;
    this.actorPose = "auto";
    this.stage.classList.remove("is-sinking");
    gsap.to(this, {
      sinkY: 0,
      sinkProgress: 0,
      duration: 0.2,
      ease: "power2.out",
    });
  }

  tick(time) {
    if (this.disposed) return;
    const dt = Math.min((time - this.lastFrame) / 1000, 0.05);
    this.lastFrame = time;
    this.updateMovement(dt);
    this.maintainLight(time);
    this.maintainIdle(time);
    this.updateActor();
    this.updateActorVisual(time);
    this.updateEffects(dt);
    requestAnimationFrame((nextTime) => this.tick(nextTime));
  }

  maintainIdle(time) {
    const idleStates = [STATES.IDLE, STATES.PLAYING, STATES.PLAYING_POST_MOON];
    const isIdleVisual =
      idleStates.includes(this.state) &&
      this.actorPose === "auto" &&
      !this.isJumping &&
      !this.sinkTimer &&
      !this.sinkAttemptTween &&
      !this.holdLeft &&
      !this.holdRight;

    if (!isIdleVisual) {
      this.idleSince = 0;
      this.nextIdleLookAt = 0;
      return;
    }

    if (!this.idleSince) this.idleSince = time;
    if (time - this.idleSince < 3200) return;

    if (!this.nextIdleLookAt) {
      this.nextIdleLookAt = time + 3800 + Math.random() * 4400;
      return;
    }

    if (time >= this.nextIdleLookAt) {
      const current = this.actor.dataset.direction === "right" ? "right" : "left";
      this.actor.dataset.direction = current === "right" ? "left" : "right";
      this.nextIdleLookAt = time + 4200 + Math.random() * 5200;
    }
  }

  maintainLight(time) {
    const movableStates = [STATES.PLAYING, STATES.BULLET_TIME, STATES.PLAYING_POST_MOON];
    if (!movableStates.includes(this.state)) return;
    if (this.row !== 0) return;
    if (Math.abs(this.col - 4) >= 0.55) return;
    if (time - (this.lastLightRefresh || 0) < 280) return;
    this.lastLightRefresh = time;
    this.triggerLight();
  }

  updateMovement(dt) {
    const movableStates = [
      STATES.PLAYING,
      STATES.BULLET_TIME,
      STATES.PLAYING_POST_MOON,
    ];
    if (!movableStates.includes(this.state)) return;

    const direction = Number(this.holdRight) - Number(this.holdLeft);
    if (direction === 0) {
      this.trail.style.opacity = "0";
      return;
    }

    const timeScale = this.state === STATES.BULLET_TIME ? STAGE.bulletTimeScale : 1;
    const previousCol = this.col;
    this.col += direction * STAGE.speed * timeScale * dt;

    if (!this.moonCreated && this.row === LEVEL_ONE.softWall.row && this.col > 5) {
      this.col = 5;
      this.showWallFeedback();
    }

    const rowLastCol = LEVEL_ONE.lines[this.row].length - 1;
    if (this.row === 0 && this.col > rowLastCol + 0.5) {
      this.startWrap(1, 0, 1);
      return;
    }

    if (this.row === 1 && this.col < -0.5) {
      this.startWrap(0, LEVEL_ONE.lines[0].length - 1, -1);
      return;
    }

    if (this.row === 0) this.col = Math.max(0, this.col);
    if (this.row === 1) this.col = Math.min(rowLastCol, this.col);

    const distance = (this.col - previousCol) * STAGE.cellWidth;
    const radius = STAGE.actorSize / 2;
    this.rollAngle += (distance / radius) * (180 / Math.PI);

    this.checkCellCrossing(previousCol, this.col);
    this.trail.style.opacity = "1";
    this.trail.dataset.direction = direction > 0 ? "right" : "left";
  }

  checkCellCrossing(previousCol, currentCol) {
    const previousCell = Math.round(previousCol);
    const currentCell = Math.round(currentCol);
    if (previousCell === currentCell) return;

    const step = currentCell > previousCell ? 1 : -1;
    for (let col = previousCell + step; step > 0 ? col <= currentCell : col >= currentCell; col += step) {
      if (col >= 0 && col < LEVEL_ONE.lines[this.row].length) {
        this.triggerCell(this.row, col);
      }
    }
    this.lastCell = currentCell;
  }

  triggerCell(row, col) {
    if (!this.discoveryHintShown && row === 0 && col === 1) {
      this.discoveryHintShown = true;
      this.setHint("留意脚下，有些字也许会回应你");
    }

    const isBulletTimeTrigger =
      row === 1 &&
      (LEVEL_ONE.triggers.bulletTime.cols.includes(col) ||
        LEVEL_ONE.triggers.bulletTimeSink.cols.includes(col));

    if (isBulletTimeTrigger) {
      const isMoonTrigger = LEVEL_ONE.triggers.bulletTime.cols.includes(col);
      if (isMoonTrigger && this.state === STATES.PLAYING) {
        this.triggerBulletTime(STATES.PLAYING, "试着……抬头看看？");
        return;
      }
      if (!isMoonTrigger && this.state === STATES.PLAYING_POST_MOON) {
        this.triggerBulletTime(STATES.PLAYING_POST_MOON, "低下头，往下看……");
        return;
      }
    }

    if (row === 0 && col === 4) this.triggerLight();

    const key = `${row}:${col}`;
    const now = performance.now();
    if (now - (this.triggerCooldown.get(key) || 0) < 800) return;
    this.triggerCooldown.set(key, now);

    if (row === 0 && col === 10) this.triggerFrost();

    const char = this.getChar(row, col);
    if (char) {
      char.classList.remove("is-lit");
      void char.offsetWidth;
      char.classList.add("is-lit");
      this.setTimer(() => char.classList.remove("is-lit"), 480);
    }
  }

  triggerLight() {
    const char = this.getChar(0, 4);
    if (char && !char.classList.contains("is-lit")) {
      char.classList.add("is-lit");
      this.setTimer(() => char.classList.remove("is-lit"), 480);
    }
    this.stage.classList.add("is-warm");
    this.light.style.left = `${this.actorX()}px`;
    this.light.style.top = `${this.actorY()}px`;

    gsap.killTweensOf(this.light);
    const currentOpacity = parseFloat(this.light.style.opacity) || 0;
    if (currentOpacity > 0.6) {
      gsap.to(this.light, { opacity: 1, scale: 1, duration: 0.28, ease: "power2.out" });
    } else {
      gsap.fromTo(
        this.light,
        { opacity: 0, scale: 0.4 },
        { opacity: 1, scale: 1, duration: 0.42, ease: "power3.out" },
      );
    }

    if (this.lightFadeTimer) {
      window.clearTimeout(this.lightFadeTimer);
      this.timers.delete(this.lightFadeTimer);
      this.lightFadeTimer = null;
    }

    this.lightFadeTimer = this.setTimer(() => {
      gsap.to(this.light, { opacity: 0, scale: 1.1, duration: 0.7, ease: "power2.inOut" });
      this.stage.classList.remove("is-warm");
      this.lightFadeTimer = null;
    }, 1300);
  }

  triggerFrost() {
    if (this.state !== STATES.PLAYING) return;
    const char = this.getChar(0, 10);
    const previousState = this.state;
    this.state = STATES.FROZEN;
    this.stage.classList.add("is-frozen");
    char?.classList.add("is-frosted");
    this.spawnFrost(this.actorX(), this.actorY());

    this.setTimer(() => {
      this.stage.classList.remove("is-frozen");
      char?.classList.remove("is-frosted");
      if (this.state === STATES.FROZEN) this.state = previousState;
    }, 800);
  }

  triggerBulletTime(previousState, hint) {
    this.state = STATES.BULLET_TIME;
    this.stage.classList.add("is-bullet-time", "is-cool");
    this.setTimer(() => {
      this.stage.classList.remove("is-bullet-time", "is-cool");
      if (this.state !== STATES.BULLET_TIME) return;
      this.state = previousState;
    }, 2000);
    this.setTimer(() => {
      if (this.state === STATES.BULLET_TIME) this.setHint(hint);
    }, 200);
  }

  isAtMoonTrigger() {
    return (
      this.row === 1 &&
      LEVEL_ONE.triggers.bulletTime.cols.includes(Math.round(this.col))
    );
  }

  breakMoon() {
    if (this.moonCreated) return;
    if (![STATES.BULLET_TIME, STATES.PLAYING].includes(this.state)) return;
    this.jumpTl?.kill();
    this.jumpTl = null;
    this.isJumping = false;
    this.state = STATES.MOON_BREAK;
    this.holdLeft = false;
    this.holdRight = false;

    const jump = { value: this.jumpY };
    const firstLineChars = [...this.poem.querySelectorAll('.char[data-row="0"]')];
    const timeline = gsap.timeline({
      onComplete: () => {
        this.jumpY = 0;
        this.row = 1;
        this.col = 0;
        this.lastCell = 0;
        this.setActiveRow(1);
        this.state = STATES.PLAYING_POST_MOON;
      },
    });

    timeline
      .to(jump, {
        value: -115,
        duration: 0.2,
        ease: "power3.out",
        onUpdate: () => {
          this.jumpY = jump.value;
        },
      })
      .call(() => {
        this.stage.classList.remove("is-bullet-time", "is-cool");
        this.spawnInkFragments(firstLineChars);
        firstLineChars.forEach((char, index) => {
          gsap.to(char, {
            opacity: 0,
            x: (index - 5.5) * 4,
            y: 18 + (index % 3) * 5,
            rotate: (index % 2 ? 1 : -1) * (6 + index),
            duration: 0.6,
            ease: "power2.out",
          });
        });
      })
      .call(() => {
        this.moonCreated = true;
        gsap.to(this.moon, {
          opacity: 1,
          y: 0,
          scale: 1,
          duration: 0.3,
          ease: "power3.out",
        });
        this.poem.querySelectorAll(".char.is-locked").forEach((char) => {
          char.classList.remove("is-locked");
          gsap.to(char, { opacity: 1, duration: 0.5, ease: "power2.out" });
        });
      }, null, 0.4)
      .to(jump, {
        value: 0,
        duration: 0.5,
        ease: "power2.in",
        onUpdate: () => {
          this.jumpY = jump.value;
        },
      }, 0.7);
  }

  startWrap(targetRow, targetCol, direction) {
    if (this.state === STATES.WRAPPING) return;
    const previousState = this.state;
    this.state = STATES.WRAPPING;
    this.row = targetRow;
    this.col = targetCol;
    this.lastCell = targetCol;
    this.setActiveRow(targetRow);
    const firstLine = this.poem.querySelector('.poem-line[data-row="0"]');
    const secondLine = this.poem.querySelector('.poem-line[data-row="1"]');
    const outgoingLine = direction > 0 ? firstLine : secondLine;
    const incomingLine = direction > 0 ? secondLine : firstLine;

    gsap.set(incomingLine, {
      y: direction > 0 ? 14 : -14,
      opacity: 0,
    });

    gsap
      .timeline({
        onComplete: () => {
          this.state = previousState === STATES.PLAYING_POST_MOON
            ? STATES.PLAYING_POST_MOON
            : STATES.PLAYING;
          gsap.set([firstLine, secondLine], { x: 0, y: 0, opacity: 1 });
          this.triggerCell(targetRow, targetCol);
        },
      })
      .to(this.actor, { opacity: 0, duration: 0.12, ease: "power1.in" }, 0)
      .to(outgoingLine, {
        x: -18 * direction,
        y: -8 * direction,
        opacity: 0,
        duration: 0.2,
        ease: "power1.in",
      }, 0)
      .to(incomingLine, {
        y: 0,
        opacity: 1,
        duration: 0.2,
        ease: "power1.out",
      }, 0)
      .set(this.actor, { opacity: 1 }, 0.2);
  }

  showWallFeedback() {
    if (!this.wallFeedbackReady) return;
    this.wallFeedbackReady = false;
    const line = this.poem.querySelector('.poem-line[data-row="1"]');
    line.classList.remove("is-blocked");
    void line.offsetWidth;
    line.classList.add("is-blocked");
    this.spawnInkDust(this.actorX(), this.actorY(), 8);
    this.setTimer(() => {
      this.wallFeedbackReady = true;
      line.classList.remove("is-blocked");
    }, 400);
  }

  transitionToLevelTwo() {
    const canTransition =
      this.state === STATES.PLAYING_POST_MOON ||
      (this.state === STATES.BULLET_TIME && this.moonCreated);
    if (!canTransition) return;

    this.state = STATES.TRANSITION_TO_LEVEL_2;
    this.stage.classList.remove("is-bullet-time", "is-cool");
    this.stage.classList.add("is-sinking");
    this.holdLeft = false;
    this.holdRight = false;
    this.actorPose = "submerging";
    this.setHint("");

    const sinkChars = [this.getChar(1, 6), this.getChar(1, 7)].filter(Boolean);
    gsap
      .timeline({
        onComplete: () => {
          this.state = STATES.HANDOFF;
          this.stage.classList.add("is-handoff");
          this.handoff.setAttribute("aria-hidden", "false");
          gsap.set(this.moon, { left: 308, top: 108, y: 0, scale: 1 });
          gsap.to(this.moon, {
            opacity: 1,
            duration: 0.6,
            ease: "power2.out",
          });
          gsap.to(this.handoff, { opacity: 1, duration: 0.6, delay: 0.2 });
          this.stage.dispatchEvent(
            new CustomEvent("level-one-complete", {
              detail: { moon: true, entry: "sink", sourceChar: "低" },
            }),
          );
        },
      })
      .to(this, {
        sinkY: 14,
        sinkProgress: 1,
        duration: 0.3,
        ease: "power1.in",
      }, 0)
      .to(sinkChars, { skewY: 8, y: 6, duration: 0.3, ease: "power1.in" }, 0)
      .to(this.moon, { y: 130, duration: 0.5, ease: "power1.in" }, 0.3)
      .to(this.pageWash, { y: 0, opacity: 1, duration: 0.5, ease: "power2.in" }, 0.3)
      .to([this.actor, this.trail], { opacity: 0, duration: 0.25 }, 0.6)
      .to(this.pageWash, { opacity: 0, duration: 0.25 }, 0.82);
  }

  updateActor() {
    const x = this.actorX();
    const y = this.actorY();
    const direction = Number(this.holdRight) - Number(this.holdLeft);
    this.actor.style.transform = `translate3d(${x - STAGE.actorSize / 2}px, ${y - STAGE.actorSize}px, 0)`;

    const trailX = direction < 0 ? x + 5 : x - 22;
    this.trail.style.transform = `translate3d(${trailX}px, ${y - 11}px, 0) scaleX(${direction < 0 ? -1 : 1})`;

    if (this.light.style.opacity !== "0") {
      this.light.style.left = `${x}px`;
      this.light.style.top = `${y}px`;
    }
  }

  updateActorVisual(time) {
    const direction = Number(this.holdRight) - Number(this.holdLeft);
    if (direction !== 0) {
      this.actor.dataset.direction = direction < 0 ? "left" : "right";
    }

    let frame;
    let sheet;
    if (this.state === STATES.FROZEN) {
      sheet = "move";
      frame = 7;
    } else if (this.actorPose === "sinking" || this.actorPose === "submerging") {
      sheet = "sink";
      if (this.sinkProgress < 0.18) frame = 0;
      else if (this.sinkProgress < 0.38) frame = 1;
      else if (this.sinkProgress < 0.58) frame = 2;
      else frame = 3;
    } else if (this.actorPose === "jump-anticipation") {
      sheet = "motion";
      frame = 2;
    } else if (this.actorPose === "jump-rise") {
      sheet = "motion";
      frame = 3;
    } else if (this.actorPose === "jump-apex") {
      sheet = "motion";
      frame = 4;
    } else if (this.actorPose === "jump-fall") {
      sheet = "motion";
      frame = 5;
    } else if (this.actorPose === "jump-land") {
      sheet = "motion";
      frame = 6;
    } else if (this.actorPose === "jump-recover") {
      sheet = "motion";
      frame = 7;
    } else if (direction !== 0) {
      sheet = "move";
      frame = 2 + (Math.floor(time / 140) % 2);
    } else {
      sheet = "motion";
      frame = (time % 1080) > 870 ? 1 : 0;
    }

    this.actor.dataset.sheet = sheet;
    this.actor.dataset.frame = String(frame);
    this.actor.dataset.pose = this.actorPose;
    this.actor.style.setProperty(
      "--actor-sprite-opacity",
      sheet === "sink" ? String(1 - this.sinkProgress * 0.9) : "1",
    );
  }

  actorX() {
    return STAGE.gridLeft + this.col * STAGE.cellWidth + STAGE.cellWidth / 2;
  }

  actorY() {
    return (
      STAGE.gridTop +
      this.visualRowTop(this.row) +
      this.jumpY +
      this.sinkY
    );
  }

  visualRowTop(row) {
    let y = 0;
    for (let r = 1; r <= row; r += 1) {
      y += r === this.row ? STAGE.lineHeight : STAGE.lineHeightTight;
    }
    return y;
  }

  setActiveRow(row) {
    this.poem.dataset.activeRow = String(row);
  }

  spawnInkFragments(chars) {
    chars.forEach((char, charIndex) => {
      const rect = char.getBoundingClientRect();
      const stageRect = this.stage.getBoundingClientRect();
      const scale = stageRect.width / STAGE.width;
      const centerX = (rect.left - stageRect.left + rect.width / 2) / scale;
      const centerY = (rect.top - stageRect.top + rect.height / 3) / scale;

      for (let index = 0; index < 5; index += 1) {
        const angle = -Math.PI + Math.random() * Math.PI;
        const speed = 34 + Math.random() * 58;
        this.particles.push({
          x: centerX + (Math.random() - 0.5) * 12,
          y: centerY + (Math.random() - 0.5) * 12,
          vx: Math.cos(angle) * speed + (charIndex - 5.5) * 2,
          vy: Math.sin(angle) * speed + 24,
          size: 1.5 + Math.random() * 3,
          rotation: Math.random() * Math.PI,
          vr: (Math.random() - 0.5) * 4,
          life: 0.65,
          maxLife: 0.65,
          color: "#20201e",
        });
      }
    });
  }

  spawnFrost(x, y) {
    for (let index = 0; index < 22; index += 1) {
      const angle = Math.random() * Math.PI * 2;
      const speed = 16 + Math.random() * 34;
      this.particles.push({
        x,
        y: y - 8,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed + 9,
        size: 1 + Math.random() * 2,
        rotation: angle,
        vr: (Math.random() - 0.5) * 2,
        life: 0.8,
        maxLife: 0.8,
        color: "#aeb8c0",
      });
    }
  }

  spawnInkDust(x, y, amount) {
    for (let index = 0; index < amount; index += 1) {
      this.particles.push({
        x,
        y: y - 5,
        vx: -18 - Math.random() * 25,
        vy: (Math.random() - 0.5) * 25,
        size: 1 + Math.random() * 2,
        rotation: 0,
        vr: 0,
        life: 0.35,
        maxLife: 0.35,
        color: "#20201e",
      });
    }
  }

  updateEffects(dt) {
    this.ctx.clearRect(0, 0, STAGE.width, STAGE.height);
    this.particles = this.particles.filter((particle) => {
      particle.life -= dt;
      if (particle.life <= 0) return false;
      particle.x += particle.vx * dt;
      particle.y += particle.vy * dt;
      particle.vy += 42 * dt;
      particle.rotation += particle.vr * dt;

      this.ctx.save();
      this.ctx.globalAlpha = Math.max(0, particle.life / particle.maxLife);
      this.ctx.translate(particle.x, particle.y);
      this.ctx.rotate(particle.rotation);
      this.ctx.fillStyle = particle.color;
      this.ctx.fillRect(
        -particle.size / 2,
        -particle.size / 2,
        particle.size,
        particle.size * 0.7,
      );
      this.ctx.restore();
      return true;
    });
  }

  getChars() {
    return [...this.poem.querySelectorAll(".char")];
  }

  getChar(row, col) {
    return this.poem.querySelector(`.char[data-row="${row}"][data-col="${col}"]`);
  }

  setHint(text) {
    const nextText = text || "";
    const currentText = this.hint.textContent;
    const isVisible = this.hint.classList.contains("is-visible");

    if (this.hintSwapTimer) {
      window.clearTimeout(this.hintSwapTimer);
      this.timers.delete(this.hintSwapTimer);
      this.hintSwapTimer = null;
    }

    if (!nextText) {
      this.hint.classList.remove("is-visible");
      return;
    }

    if (nextText === currentText) {
      this.hint.classList.add("is-visible");
      return;
    }

    if (currentText && isVisible) {
      this.hint.classList.remove("is-visible");
      this.hintSwapTimer = this.setTimer(() => {
        this.hint.textContent = nextText;
        this.hint.classList.add("is-visible");
        this.hintSwapTimer = null;
      }, 300);
      return;
    }

    this.hint.textContent = nextText;
    requestAnimationFrame(() => this.hint.classList.add("is-visible"));
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

window.__levelOne = new LevelOneGame();

const refsForL2 = () => ({
  stage: document.querySelector("#game"),
  poemL2: document.querySelector("#poem-l2"),
  inkSea: document.querySelector("#ink-sea"),
  moon: document.querySelector("#moon"),
  moonGlow: document.querySelector("#moon-glow"),
  actor: document.querySelector("#actor"),
  trail: document.querySelector("#trail"),
  hint: document.querySelector("#hint"),
  handoff: document.querySelector("#handoff"),
  headerL1: document.querySelector(".text-layer .page-header:not(.page-header-l2)"),
  headerL2: document.querySelector("#page-header-l2"),
  canvas: document.querySelector("#fx"),
  qaScene: new URLSearchParams(window.location.search).get("scene"),
});

const startLevelTwo = (handoffDetail) => {
  if (window.__levelTwo) {
    window.__levelTwo.destroy();
  }
  const l1 = window.__levelOne;
  if (l1) {
    l1.disposed = true;
    if (l1.input) l1.input.onIntent = (intent) => window.__levelTwo?.handleIntent(intent);
  }
  window.__levelTwo = new LevelTwoGame(refsForL2(), handoffDetail || {});
};

window.__levelOne.stage.addEventListener("level-one-complete", (event) => {
  startLevelTwo(event.detail);
});

// QA shortcut: ?scene=l2-* hops directly into L2 without playing L1
const qaParam = new URLSearchParams(window.location.search).get("scene") || "";
if (qaParam.startsWith("l2-")) {
  window.setTimeout(() => {
    const stage = window.__levelOne?.stage;
    if (!stage) return;
    if (window.__levelOne) {
      window.__levelOne.state = STATES.HANDOFF;
      window.__levelOne.stage.classList.add("is-handoff");
      const moon = document.querySelector("#moon");
      if (moon) {
        moon.style.left = "308px";
        moon.style.top = "108px";
        moon.style.opacity = "1";
        moon.style.transform = "translateY(0) scale(1)";
      }
    }
    startLevelTwo({ moon: true, entry: "qa", sourceChar: qaParam });
  }, 80);
}
