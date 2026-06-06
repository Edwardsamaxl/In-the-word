import { gsap } from "gsap";
import "./styles.css";
import { InputController } from "./input.js";
import { LEVEL_ONE, STAGE, STATES } from "./level-one.js";

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
    this.canvas = document.querySelector("#fx");
    this.ctx = this.canvas.getContext("2d");
    this.qaScene = new URLSearchParams(window.location.search).get("scene");

    this.state = STATES.INTRO;
    this.row = 0;
    this.col = 0;
    this.jumpY = 0;
    this.sinkY = 0;
    this.holdLeft = false;
    this.holdRight = false;
    this.isJumping = false;
    this.moonCreated = false;
    this.triggerCooldown = new Map();
    this.timers = new Set();
    this.particles = [];
    this.lastFrame = performance.now();
    this.lastCell = 0;
    this.wallFeedbackReady = true;
    this.sinkTimer = null;

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
    this.renderPoem();
    this.particles = [];
    this.ctx.clearRect(0, 0, STAGE.width, STAGE.height);

    this.state = STATES.INTRO;
    this.row = 0;
    this.col = 0;
    this.lastCell = 0;
    this.jumpY = 0;
    this.sinkY = 0;
    this.holdLeft = false;
    this.holdRight = false;
    this.isJumping = false;
    this.moonCreated = false;
    this.triggerCooldown.clear();

    this.stage.className = "game-stage";
    this.actor.style.opacity = "0";
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
        this.setHint("按住左右两侧，开始走", "opening");
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

    if (scene === "postmoon") {
      this.state = STATES.PLAYING_POST_MOON;
      this.row = 1;
      this.col = 6;
      this.moonCreated = true;
      this.poem.querySelectorAll('.char[data-row="0"]').forEach((char) => {
        gsap.set(char, { opacity: 0 });
      });
      this.poem.querySelectorAll(".char.is-locked").forEach((char) => {
        char.classList.remove("is-locked");
        gsap.set(char, { opacity: 1 });
      });
      gsap.set(this.moon, { opacity: 1, y: -8, scale: 1 });
      this.setHint("低下头，往下看……");
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
        backgroundColor: "#e8d9a8",
      });
      gsap.set(this.handoff, { opacity: 1 });
      return;
    }

    this.state = STATES.IDLE;
    this.setHint("按住左右两侧，开始走", "opening");
  }

  handleIntent(intent) {
    if (intent === "reset") {
      this.reset();
      return;
    }

    if (this.state === STATES.INTRO || this.state === STATES.TRANSITION_TO_LEVEL_2) return;

    if (this.state === STATES.IDLE && !intent.startsWith("release") && intent !== "cancel-sink") {
      this.state = STATES.PLAYING;
      this.setHint("");
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
        this.startSink();
        break;
      case "cancel-sink":
        this.cancelSink();
        break;
      default:
        break;
    }
  }

  jump() {
    if (this.state === STATES.BULLET_TIME) {
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
    const jump = { value: 0 };
    gsap
      .timeline({
        onComplete: () => {
          this.isJumping = false;
          this.jumpY = 0;
        },
      })
      .to(jump, {
        value: -69,
        duration: 0.22,
        ease: "power2.out",
        onUpdate: () => {
          this.jumpY = jump.value;
        },
      })
      .to(jump, {
        value: 0,
        duration: 0.26,
        ease: "power2.in",
        onUpdate: () => {
          this.jumpY = jump.value;
        },
      });
  }

  startSink() {
    if (
      this.state !== STATES.PLAYING_POST_MOON ||
      this.row !== LEVEL_ONE.triggers.sink.row ||
      Math.abs(this.col - LEVEL_ONE.triggers.sink.col) > 0.5 ||
      this.holdLeft ||
      this.holdRight ||
      this.sinkTimer
    ) {
      return;
    }

    const sink = { value: 0 };
    this.sinkTween = gsap.to(sink, {
      value: 9,
      duration: 1,
      ease: "power1.in",
      onUpdate: () => {
        this.sinkY = sink.value;
      },
    });

    this.sinkTimer = window.setTimeout(() => {
      this.sinkTimer = null;
      this.transitionToLevelTwo();
    }, 1000);
    this.timers.add(this.sinkTimer);
  }

  cancelSink() {
    if (this.sinkTimer) {
      window.clearTimeout(this.sinkTimer);
      this.timers.delete(this.sinkTimer);
      this.sinkTimer = null;
    }
    this.sinkTween?.kill();
    this.sinkTween = null;
    gsap.to(this, { sinkY: 0, duration: 0.16, ease: "power2.out" });
  }

  tick(time) {
    const dt = Math.min((time - this.lastFrame) / 1000, 0.05);
    this.lastFrame = time;
    this.updateMovement(dt);
    this.updateActor();
    this.updateEffects(dt);
    requestAnimationFrame((nextTime) => this.tick(nextTime));
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

    const timeScale = this.state === STATES.BULLET_TIME ? 0.3 : 1;
    const previousCol = this.col;
    this.col += direction * STAGE.speed * timeScale * dt;

    if (!this.moonCreated && this.row === LEVEL_ONE.softWall.row && this.col > 5) {
      this.col = 5;
      this.showWallFeedback();
    }

    if (this.row === 0 && this.col > 11.72) {
      this.startWrap(1, 0, 1);
      return;
    }

    if (this.row === 1 && this.col < -0.72) {
      this.startWrap(0, 11, -1);
      return;
    }

    if (this.row === 0) this.col = Math.max(0, this.col);
    if (this.row === 1) this.col = Math.min(11, this.col);

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
      if (col >= 0 && col <= 11) this.triggerCell(this.row, col);
    }
    this.lastCell = currentCell;
  }

  triggerCell(row, col) {
    const key = `${row}:${col}`;
    const now = performance.now();
    if (now - (this.triggerCooldown.get(key) || 0) < 800) return;
    this.triggerCooldown.set(key, now);

    if (row === 0 && col === 4) this.triggerLight();
    if (row === 0 && col === 10) this.triggerFrost();
    if (row === 1 && col === 0 && this.state === STATES.PLAYING) this.triggerBulletTime();

    if (row === 1 && col === 6 && this.state === STATES.PLAYING_POST_MOON) {
      this.setHint("低下头，往下看……");
    } else if (
      this.state === STATES.PLAYING_POST_MOON &&
      this.hint.textContent.includes("低下头")
    ) {
      this.setHint("");
    }

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
    char?.classList.add("is-lit");
    this.stage.classList.add("is-warm");
    this.light.style.left = `${this.actorX()}px`;
    this.light.style.top = `${this.actorY()}px`;

    gsap.fromTo(
      this.light,
      { opacity: 0, scale: 0.4 },
      { opacity: 1, scale: 1, duration: 0.42, ease: "power3.out" },
    );

    this.setTimer(() => {
      gsap.to(this.light, { opacity: 0, scale: 1.1, duration: 0.7, ease: "power2.inOut" });
      this.stage.classList.remove("is-warm");
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

  triggerBulletTime() {
    this.state = STATES.BULLET_TIME;
    this.stage.classList.add("is-bullet-time", "is-cool");
    this.setTimer(() => {
      if (this.state !== STATES.BULLET_TIME) return;
      this.state = STATES.PLAYING;
      this.stage.classList.remove("is-bullet-time", "is-cool");
      this.setHint("");
    }, 2000);
    this.setTimer(() => {
      if (this.state === STATES.BULLET_TIME) this.setHint("试着……抬头看看？");
    }, 200);
  }

  breakMoon() {
    if (this.state !== STATES.BULLET_TIME) return;
    this.state = STATES.MOON_BREAK;
    this.holdLeft = false;
    this.holdRight = false;
    this.setHint("");

    const jump = { value: this.jumpY };
    const firstLineChars = [...this.poem.querySelectorAll('.char[data-row="0"]')];
    const timeline = gsap.timeline({
      onComplete: () => {
        this.jumpY = 0;
        this.row = 1;
        this.col = 0;
        this.lastCell = 0;
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
          y: -8,
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
    const firstLine = this.poem.querySelector('.poem-line[data-row="0"]');
    const secondLine = this.poem.querySelector('.poem-line[data-row="1"]');

    gsap
      .timeline({
        onComplete: () => {
          this.row = targetRow;
          this.col = targetCol;
          this.lastCell = targetCol;
          this.state = previousState === STATES.PLAYING_POST_MOON
            ? STATES.PLAYING_POST_MOON
            : STATES.PLAYING;
          gsap.set([firstLine, secondLine], { x: 0, y: 0, opacity: 1 });
          this.triggerCell(targetRow, targetCol);
        },
      })
      .to(this.actor, { opacity: 0, duration: 0.12, ease: "power1.in" }, 0)
      .to(firstLine, { x: -18 * direction, opacity: 0.62, duration: 0.2 }, 0)
      .to(secondLine, { y: -8 * direction, duration: 0.2 }, 0)
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
    if (this.state !== STATES.PLAYING_POST_MOON) return;
    this.state = STATES.TRANSITION_TO_LEVEL_2;
    this.holdLeft = false;
    this.holdRight = false;
    this.setHint("");

    const lowChar = this.getChar(1, 6);
    gsap
      .timeline({
        onComplete: () => {
          this.state = STATES.HANDOFF;
          this.stage.classList.add("is-handoff");
          this.handoff.setAttribute("aria-hidden", "false");
          gsap.set(this.moon, { left: 308, top: 108, y: 0, scale: 1 });
          gsap.to(this.moon, {
            opacity: 1,
            backgroundColor: "#e8d9a8",
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
        sinkY: 23,
        duration: 0.3,
        ease: "power1.in",
      }, 0)
      .to(lowChar, { skewY: 8, y: 6, duration: 0.3, ease: "power1.in" }, 0)
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

  actorX() {
    return STAGE.gridLeft + this.col * STAGE.cellWidth + STAGE.cellWidth / 2;
  }

  actorY() {
    return (
      STAGE.gridTop +
      this.row * STAGE.lineHeight +
      30 +
      this.jumpY +
      this.sinkY
    );
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

  setHint(text, variant = "") {
    this.hint.textContent = text;
    this.hint.classList.toggle("is-visible", Boolean(text));
    this.hint.classList.toggle("is-opening", variant === "opening");
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
