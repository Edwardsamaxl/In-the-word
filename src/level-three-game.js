import { gsap } from "gsap";
import { journey } from "./journey.js";

const STAGE_WIDTH = 412;
const ACTOR_SIZE = 22;
const ENTRY_REVEAL_DURATION = 720;
const PATH_TOP = 454;
const PATH_START = 64;
const PATH_END_PADDING = 108;
const CHAR_STEP = 34;
const SEA_ROWS = 9;
const SEA_COLS = 35;
const SHARE_CARD_URL = "/assets/share/settlement-card-v1.png";
const LEVEL_HINT = "一直游下去。";

// Continuous yellow→blue water ramp. The page opens muddy ochre ("海是黄的")
// and the blue front (blueProgress, monotonic) sweeps it to sea-blue behind the swimmer.
const SILT_PAPER = [214, 190, 131]; // 暖浊赭黄纸面
const MIST_PAPER = [158, 196, 214]; // --sea-mist 淡青过渡
const SEA_PAPER = [23, 107, 155]; // --sea 终章海蓝
const INK_SILT = [74, 58, 22]; // 土黄墨：黄流段字色
const INK_BLUE = [23, 107, 155]; // 蓝段字色

const PATH_SEGMENTS = [
  { text: "海是黄的", tone: "silt" },
  { text: "书上说海是蓝的", tone: "doubt" },
  { text: "于是我一直游", tone: "swim" },
  { text: "一直游到海水变蓝", tone: "blue" },
];

const clamp = (value, min = 0, max = 1) => Math.min(max, Math.max(min, value));
const lerp = (start, end, amount) => start + (end - start) * amount;
const smoothstep = (start, end, value) => {
  const amount = clamp((value - start) / (end - start));
  return amount * amount * (3 - 2 * amount);
};

const resistanceBand = (start, center, end, progress) =>
  smoothstep(start, center, progress) * (1 - smoothstep(center, end, progress));

const loadImage = (src) =>
  new Promise((resolve, reject) => {
    const image = new Image();
    image.decoding = "async";
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error(`Failed to load image: ${src}`));
    image.src = src;
  });

const shareCardImage = loadImage(SHARE_CARD_URL);

const canvasToBlob = (canvas) =>
  new Promise((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (blob) resolve(blob);
      else reject(new Error("Failed to create share card"));
    }, "image/png");
  });

const drawRoundedRect = (ctx, x, y, width, height, radius) => {
  const corner = Math.min(radius, width / 2, height / 2);
  ctx.beginPath();
  ctx.moveTo(x + corner, y);
  ctx.arcTo(x + width, y, x + width, y + height, corner);
  ctx.arcTo(x + width, y + height, x, y + height, corner);
  ctx.arcTo(x, y + height, x, y, corner);
  ctx.arcTo(x, y, x + width, y, corner);
  ctx.closePath();
};

export const getLevelThreeForwardSpeed = (progress) => {
  const acceleration = smoothstep(0.04, 1, progress);
  const baseSpeed = lerp(0.06, 0.132, acceleration);
  const resistance =
    resistanceBand(0.12, 0.21, 0.31, progress) * 0.28 +
    resistanceBand(0.36, 0.45, 0.55, progress) * 0.2 +
    resistanceBand(0.57, 0.64, 0.71, progress) * 0.1;
  return baseSpeed * (1 - resistance);
};

const mixColor = (from, to, amount) => {
  const channel = (index) => Math.round(lerp(from[index], to[index], amount));
  return `rgb(${channel(0)} ${channel(1)} ${channel(2)})`;
};

// "r g b" triplet for CSS `rgb(var(--char-rgb) / a)` color application.
const mixTriplet = (from, to, amount) => {
  const channel = (index) => Math.round(lerp(from[index], to[index], amount));
  return `${channel(0)} ${channel(1)} ${channel(2)}`;
};

export class LevelThreeGame {
  constructor(refs, handoffDetail = {}) {
    this.stage = refs.stage;
    this.scene = refs.scene;
    this.actor = refs.actor;
    this.trail = refs.trail;
    this.hint = refs.hint;
    this.header = refs.headerL3;
    this.paper = refs.paper;
    this.endLine = refs.endLine;

    this.disposed = false;
    this.finished = false;
    this.lastFrame = performance.now();
    this.progress = 0;
    this.blueProgress = 0;
    this.holdLeft = false;
    this.holdRight = false;
    this.entering = handoffDetail.entry === "ink-sea";
    this.pathChars = [];
    this.seaChars = [];
    this.lastActiveIndex = -1;
    this.settlementResult = null;

    this.renderScene();
    this.activate();
    requestAnimationFrame((time) => this.tick(time));
  }

  renderScene() {
    this.moon = document.createElement("div");
    this.moon.className = "l3-moon";
    this.moon.setAttribute("aria-hidden", "true");

    this.viewport = document.createElement("div");
    this.viewport.className = "l3-word-viewport";

    this.world = document.createElement("div");
    this.world.className = "l3-word-world";
    this.viewport.append(this.world);

    this.seaField = document.createElement("div");
    this.seaField.className = "l3-sea-field";
    this.world.append(this.seaField);

    this.path = document.createElement("div");
    this.path.className = "l3-text-path";
    this.world.append(this.path);

    this.renderSea();
    this.renderPath();

    this.endLine.className = "level-three-end";
    this.endLine.textContent = "海，已经蓝了。";
    this.buildSettlement();
    this.scene.replaceChildren(
      this.moon,
      this.viewport,
      this.endLine,
      this.settlement,
    );
  }

  buildSettlement() {
    this.settlement = document.createElement("div");
    this.settlement.className = "l3-settlement";
    this.settlement.setAttribute("aria-hidden", "true");

    const lead = document.createElement("p");
    lead.className = "l3-settle-lead";
    lead.textContent = "你真的游到了海水变蓝。";

    const arc = document.createElement("p");
    arc.className = "l3-settle-arc";
    arc.textContent = "从故乡，一直游到海水变蓝。";

    const stats = document.createElement("dl");
    stats.className = "l3-settle-stats";
    this.statTime = document.createElement("dd");
    this.statSteps = document.createElement("dd");
    const timeLabel = document.createElement("dt");
    timeLabel.textContent = "用时";
    const stepLabel = document.createElement("dt");
    stepLabel.textContent = "步数";
    stats.append(timeLabel, this.statTime, stepLabel, this.statSteps);

    const actions = document.createElement("div");
    actions.className = "l3-settle-actions";
    this.shareButton = document.createElement("button");
    this.shareButton.type = "button";
    this.shareButton.className = "l3-share-button";
    this.shareButton.textContent = "分享";
    this.shareButton.addEventListener("click", () => this.captureShare());
    this.replayButton = document.createElement("button");
    this.replayButton.type = "button";
    this.replayButton.className = "l3-replay-button";
    this.replayButton.textContent = "再走一次";
    this.replayButton.addEventListener("click", () => this.replay());
    actions.append(this.shareButton, this.replayButton);

    this.settlement.append(lead, arc, stats, actions);
  }

  replay() {
    this.stage.dispatchEvent(new CustomEvent("level-three-replay"));
  }

  async captureShare() {
    const { time, steps } = this.settlementResult || journey.format();
    const idleLabel = "分享";
    this.shareButton.disabled = true;
    this.shareButton.textContent = "生成中…";

    try {
      const [cardImage] = await Promise.all([
        shareCardImage,
        document.fonts?.ready || Promise.resolve(),
      ]);
      const canvas = document.createElement("canvas");
      canvas.width = 1080;
      canvas.height = 1920;
      const ctx = canvas.getContext("2d");
      ctx.drawImage(cardImage, 0, 0, canvas.width, canvas.height);

      ctx.textAlign = "center";
      ctx.fillStyle = "#173e58";
      ctx.font = "500 32px 'Source Han Serif SC', 'Noto Serif SC', serif";
      ctx.fillText("字 里 行 间 · 旅 程 结 算", 540, 280);

      ctx.fillStyle = "#123a55";
      ctx.font = "600 82px 'Source Han Serif SC', 'Noto Serif SC', serif";
      ctx.fillText("你真的游到了", 540, 530);
      ctx.fillText("海水变蓝。", 540, 642);

      ctx.fillStyle = "rgba(23, 62, 88, 0.68)";
      ctx.font = "400 36px 'Source Han Serif SC', 'Noto Serif SC', serif";
      ctx.fillText("从故乡，一直游到海水变蓝。", 540, 748);

      ctx.strokeStyle = "rgba(23, 62, 88, 0.24)";
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(310, 814);
      ctx.lineTo(770, 814);
      ctx.stroke();

      drawRoundedRect(ctx, 246, 868, 588, 222, 22);
      ctx.fillStyle = "rgba(250, 244, 224, 0.72)";
      ctx.fill();
      ctx.strokeStyle = "rgba(23, 62, 88, 0.2)";
      ctx.stroke();

      ctx.fillStyle = "rgba(23, 62, 88, 0.58)";
      ctx.font = "500 28px 'Source Han Serif SC', 'Noto Serif SC', serif";
      ctx.fillText("用 时", 390, 934);
      ctx.fillText("步 数", 690, 934);

      ctx.fillStyle = "#143d58";
      ctx.font = "600 46px 'Source Han Serif SC', 'Noto Serif SC', serif";
      ctx.fillText(time, 390, 1010);
      ctx.fillText(steps, 690, 1010);

      ctx.fillStyle = "rgba(23, 62, 88, 0.62)";
      ctx.font = "400 28px 'Source Han Serif SC', 'Noto Serif SC', serif";
      ctx.fillText("一次关于文字的远行", 540, 1178);

      ctx.fillStyle = "#173e58";
      ctx.font = "500 30px 'Source Han Serif SC', 'Noto Serif SC', serif";
      ctx.fillText("字 里 行 间", 540, 1250);

      const blob = await canvasToBlob(canvas);
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = "字里行间-一直游到海水变蓝.png";
      document.body.append(link);
      link.click();
      link.remove();
      window.setTimeout(() => URL.revokeObjectURL(url), 1000);
      this.shareButton.textContent = "已保存";
    } catch (error) {
      console.error(error);
      this.shareButton.textContent = "保存失败";
    } finally {
      window.setTimeout(() => {
        if (this.disposed) return;
        this.shareButton.disabled = false;
        this.shareButton.textContent = idleLabel;
      }, 1400);
    }
  }

  renderSea() {
    this.seaChars = [];
    for (let row = 0; row < SEA_ROWS; row += 1) {
      for (let col = 0; col < SEA_COLS; col += 1) {
        const index = row * SEA_COLS + col;
        const cell = document.createElement("span");
        const x = 10 + col * 31 + (row % 2 ? 14 : 0) + Math.sin(index * 1.71) * 4;
        const y = 224 + row * 43 + Math.sin(index * 0.83) * 7;
        const size = 18 + ((index * 5 + row) % 6);
        const alpha = 0.075 + ((index * 3 + row) % 6) * 0.018;

        cell.className = "l3-sea-char";
        cell.textContent = "海";
        cell.dataset.char = "海";
        cell.style.left = `${x}px`;
        cell.style.top = `${y}px`;
        cell.style.setProperty("--sea-size", `${size}px`);
        cell.style.setProperty("--sea-alpha", alpha.toFixed(3));
        cell.style.setProperty("--sea-delay", `${((row * 5 + col * 3) % 19) * -0.17}s`);
        this.seaField.append(cell);
        this.seaChars.push({ element: cell, x, row, col });
      }
    }
  }

  renderPath() {
    this.pathChars = [];
    let charIndex = 0;

    PATH_SEGMENTS.forEach((segment, segmentIndex) => {
      [...segment.text].forEach((char, indexInSegment) => {
        const element = document.createElement("span");
        const x = PATH_START + charIndex * CHAR_STEP;
        element.className = "l3-path-char";
        element.textContent = char;
        element.dataset.char = char;
        element.dataset.tone = segment.tone;
        element.dataset.segment = String(segmentIndex);
        element.style.left = `${x}px`;
        this.path.append(element);
        this.pathChars.push({
          element,
          x,
          char,
          segmentIndex,
          indexInSegment,
        });
        charIndex += 1;
      });

      if (segmentIndex < PATH_SEGMENTS.length - 1) {
        const breath = document.createElement("span");
        breath.className = "l3-path-breath";
        breath.style.left = `${PATH_START + charIndex * CHAR_STEP + 8}px`;
        this.path.append(breath);
        charIndex += 1;
      }
    });

    this.pathLength = Math.max(1, PATH_START + (charIndex - 1) * CHAR_STEP);
    this.worldWidth = this.pathLength + PATH_END_PADDING;
    this.world.style.width = `${this.worldWidth}px`;
    this.path.style.width = `${this.worldWidth}px`;
    this.seaField.style.width = `${this.worldWidth}px`;
  }

  activate() {
    this.stage.classList.remove(
      "is-handoff",
      "is-level-two",
      "is-paper-deepblue",
      "is-paper-verdant",
      "is-paper-sea",
      "is-warm",
      "is-cool",
      "is-frozen",
      "is-sinking",
      "is-level-three-complete",
    );
    this.stage.classList.add("is-level-three");
    this.stage.setAttribute("aria-label", "一直游到海水变蓝互动关卡");
    this.scene.setAttribute("aria-hidden", "false");
    this.header?.setAttribute("aria-hidden", "false");
    this.header?.classList.remove("is-dissolved");
    this.trail.style.opacity = "0";
    this.endLine.classList.remove("is-visible");
    this.actor.style.opacity = "1";
    this.actor.dataset.direction = "right";
    this.actor.dataset.sheet = "motion";
    this.actor.dataset.frame = "0";
    this.actor.dataset.pose = "auto";
    this.paper.style.backgroundColor = mixColor(SILT_PAPER, SILT_PAPER, 0);
    this.update(0, performance.now(), 0);
    if (this.entering) {
      this.prepareEntry();
      this.revealEntry();
    } else {
      this.showEntryWords();
    }
  }

  reset() {
    const shouldRestart = this.finished;
    this.finished = false;
    this.progress = 0;
    this.blueProgress = 0;
    this.holdLeft = false;
    this.holdRight = false;
    this.entering = false;
    this.lastFrame = performance.now();
    this.lastActiveIndex = -1;
    this.settlementResult = null;
    this.stage.classList.remove("is-level-three-complete");
    this.endLine.classList.remove("is-visible");
    this.settlement.classList.remove("is-visible");
    this.settlement.setAttribute("aria-hidden", "true");
    this.actor.style.opacity = "1";
    this.showEntryWords();
    this.header?.classList.remove("is-dissolved");
    this.moon.classList.remove("is-settled");
    this.paper.style.backgroundColor = mixColor(SILT_PAPER, SILT_PAPER, 0);
    this.pathChars.forEach(({ element }) => {
      element.classList.remove("is-current", "is-passed");
      element.style.removeProperty("--reveal");
      element.style.removeProperty("--sink");
      element.style.removeProperty("--char-rgb");
    });
    this.seaChars.forEach(({ element }) => element.style.removeProperty("--char-rgb"));
    this.update(0, performance.now(), 0);
    if (shouldRestart) requestAnimationFrame((time) => this.tick(time));
  }

  finish() {
    this.progress = 1;
    this.blueProgress = 1;
    this.update(1, performance.now(), 1);
    this.finished = true;
    this.settlementResult = journey.format();
    this.holdLeft = false;
    this.holdRight = false;
    this.actor.dataset.sheet = "motion";
    this.actor.dataset.frame = "0";
    this.actor.style.transform = `translate3d(${STAGE_WIDTH / 2 - ACTOR_SIZE / 2}px, 250px, 0) scale(1.2)`;
    this.stage.classList.add("is-level-three-complete");
    this.header?.classList.add("is-dissolved");
    this.hideHint();
    this.moon.classList.add("is-settled");
    window.setTimeout(() => {
      if (this.disposed) return;
      this.endLine.classList.add("is-visible");
    }, 650);
    window.setTimeout(() => {
      if (this.disposed) return;
      this.revealSettlement();
    }, 2400);
  }

  revealSettlement() {
    const { time, steps } = this.settlementResult || journey.format();
    this.statTime.textContent = time;
    this.statSteps.textContent = steps;
    this.endLine.classList.remove("is-visible");
    this.settlement.setAttribute("aria-hidden", "false");
    this.settlement.classList.add("is-visible");
  }

  destroy() {
    this.disposed = true;
    gsap.killTweensOf([
      this.actor,
      this.moon,
      this.viewport,
      this.path,
      this.seaField,
      this.header,
      this.hint,
      this.endLine,
      this.settlement,
      this.paper,
    ]);
    this.stage.classList.remove("is-level-three", "is-level-three-complete");
    this.stage.style.removeProperty("--l3-progress");
    this.stage.style.removeProperty("--l3-effort");
    this.scene.style.removeProperty("--l3-progress");
    this.scene.style.removeProperty("--l3-effort");
    this.scene.setAttribute("aria-hidden", "true");
    this.scene.replaceChildren(this.endLine);
    this.header?.setAttribute("aria-hidden", "true");
    if (this.header) gsap.set(this.header, { opacity: 0 });
    this.paper.style.removeProperty("background-color");
    this.endLine.classList.remove("is-visible");
  }

  handleIntent(intent) {
    if (intent === "reset") {
      this.reset();
      return;
    }
    if (this.disposed || this.finished || this.entering) return;

    if (intent === "hold-left") this.holdLeft = true;
    if (intent === "release-left") this.holdLeft = false;
    if (intent === "hold-right") {
      this.holdRight = true;
    }
    if (intent === "release-right") this.holdRight = false;
  }

  tick(time) {
    if (this.disposed || this.finished) return;
    if (this.entering) {
      requestAnimationFrame((nextTime) => this.tick(nextTime));
      return;
    }

    const dt = Math.min((time - this.lastFrame) / 1000, 0.05);
    this.lastFrame = time;
    const intent = Number(this.holdRight) - Number(this.holdLeft);
    let travelDirection = 0;

    if (intent > 0) {
      const speed = getLevelThreeForwardSpeed(this.progress);
      this.progress = clamp(this.progress + speed * dt);
      this.blueProgress = Math.max(this.blueProgress, this.progress);
      travelDirection = 1;
    } else if (intent < 0) {
      travelDirection = -1;
    }

    this.update(this.progress, time, travelDirection);

    if (this.progress >= 1) {
      this.finish();
      return;
    }

    requestAnimationFrame((nextTime) => this.tick(nextTime));
  }

  prepareEntry() {
    this.hint.textContent = LEVEL_HINT;
    this.hint.classList.remove("is-visible");
    gsap.set(this.hint, { opacity: 0, transition: "none" });
    gsap.set(this.header, { opacity: 0, transition: "none" });
    gsap.set(this.seaField, { opacity: 0, y: 10 });
    gsap.set(this.path, { opacity: 0, y: 8 });
    gsap.set(this.actor, { opacity: 0, transition: "none" });
    this.actor.dataset.sheet = "motion";
    this.actor.dataset.frame = "0";
    this.actor.dataset.pose = "auto";
    this.actor.style.transform = `translate3d(${PATH_START - ACTOR_SIZE / 2}px, ${PATH_TOP - ACTOR_SIZE}px, 0) scale(1.14)`;
    this.viewport.style.transform = "translate3d(0, 0, 0)";
  }

  revealEntry() {
    const duration = ENTRY_REVEAL_DURATION / 1000;

    gsap
      .timeline({
        onComplete: () => {
          if (this.disposed) return;
          gsap.set([this.actor, this.header], { clearProps: "transition" });
          gsap.set(this.hint, { clearProps: "opacity,transition" });
          this.entering = false;
          this.lastFrame = performance.now();
          this.update(0, this.lastFrame, 0);
          this.showHint();
        },
      })
      .to(this.seaField, {
        opacity: 1,
        y: 0,
        duration,
        ease: "power2.out",
      }, 0)
      .to(this.path, {
        opacity: 1,
        y: 0,
        duration: duration * 0.9,
        ease: "power2.out",
      }, 0.04)
      .to(this.actor, {
        opacity: 1,
        duration,
        ease: "power2.out",
      }, 0)
      .to(this.header, {
        opacity: 1,
        duration: duration * 0.66,
        ease: "power1.out",
      }, 0.18);
  }

  showEntryWords() {
    gsap.set([this.path, this.seaField, this.header], {
      opacity: 1,
      y: 0,
    });
    this.showHint();
  }

  update(progress, time, direction) {
    const worldX = PATH_START + progress * (this.pathLength - PATH_START);
    const maxCamera = Math.max(0, this.worldWidth - STAGE_WIDTH);
    const cameraX = clamp(worldX - 112, 0, maxCamera);
    const actorX = worldX - cameraX;
    const effort = 1 - smoothstep(0.08, 0.72, progress);
    const moving = direction > 0;
    const slowing = direction < 0;
    // Resistance belongs to the forward speed curve; vertical movement made the
    // camera-follow section read as jitter because the actor stays near one X.
    const actorY = PATH_TOP;
    const frame = moving
      ? 2 + (Math.floor(worldX / 18) % 2)
      : slowing
        ? 1
        : Math.floor(time / 760) % 2;

    this.actor.dataset.direction = "right";
    this.actor.dataset.sheet = moving ? "move" : "motion";
    this.actor.dataset.frame = String(frame);
    this.actor.dataset.pose = slowing ? "braced" : "auto";
    this.actor.style.transform = `translate3d(${actorX - ACTOR_SIZE / 2}px, ${actorY - ACTOR_SIZE}px, 0) scale(${lerp(1.14, 1.2, progress)})`;
    this.viewport.style.transform = "translate3d(0, 0, 0)";
    this.world.style.transform = `translate3d(${-cameraX}px, 0, 0)`;
    this.scene.style.setProperty("--l3-progress", progress.toFixed(4));
    this.scene.style.setProperty("--l3-effort", effort.toFixed(4));
    this.stage.style.setProperty("--l3-progress", progress.toFixed(4));
    this.stage.style.setProperty("--l3-effort", effort.toFixed(4));

    this.updatePathChars(worldX);
    this.updateSeaChars(worldX);
    this.updatePaper();
  }

  updatePathChars(worldX) {
    let activeIndex = -1;
    let nearestDistance = Number.POSITIVE_INFINITY;

    this.pathChars.forEach((item, index) => {
      const distance = item.x - worldX;
      const absoluteDistance = Math.abs(distance);
      if (absoluteDistance < nearestDistance) {
        nearestDistance = absoluteDistance;
        activeIndex = index;
      }

      const reveal = distance >= 0
        ? 1 - smoothstep(66, 218, distance)
        : 1 - smoothstep(74, 220, -distance);
      const passed = distance < -46;
      const sink = passed ? smoothstep(46, 210, -distance) : 0;
      const blueFront =
        PATH_START + this.blueProgress * (this.pathLength - PATH_START) - 20;
      const blueLevel = this.blueProgress === 0
        ? 0
        : clamp((blueFront - item.x) / 145);

      item.element.style.setProperty("--char-rgb", mixTriplet(INK_SILT, INK_BLUE, blueLevel));
      item.element.style.setProperty("--reveal", clamp(reveal, 0.06, 1).toFixed(3));
      item.element.style.setProperty("--sink", sink.toFixed(3));
      item.element.classList.toggle("is-passed", passed);
    });

    if (activeIndex !== this.lastActiveIndex) {
      if (activeIndex > this.lastActiveIndex && this.lastActiveIndex >= 0) {
        journey.step(activeIndex - this.lastActiveIndex);
      }
      if (this.lastActiveIndex >= 0) {
        this.pathChars[this.lastActiveIndex]?.element.classList.remove("is-current");
      }
      this.pathChars[activeIndex]?.element.classList.add("is-current");
      this.lastActiveIndex = activeIndex;
    }
  }

  updateSeaChars(worldX) {
    const blueFront =
      PATH_START + this.blueProgress * (this.pathLength - PATH_START) - 20;
    this.seaChars.forEach(({ element, x, row, col }) => {
      const wave = Math.sin(row * 0.82 + col * 0.47) * 22;
      const level = this.blueProgress === 0
        ? 0
        : clamp((blueFront - x - wave) / 120);
      const proximity = 1 - smoothstep(90, 300, Math.abs(x - worldX));
      element.style.setProperty("--char-rgb", mixTriplet(INK_SILT, INK_BLUE, level));
      element.style.setProperty("--wake", proximity.toFixed(3));
    });
  }

  updatePaper() {
    // Opens muddy ochre, sweeps to mist, then deep sea — one continuous ramp.
    const firstPhase = smoothstep(0, 0.7, this.blueProgress);
    const finalPhase = smoothstep(0.55, 1, this.blueProgress);
    const middle = [
      lerp(SILT_PAPER[0], MIST_PAPER[0], firstPhase),
      lerp(SILT_PAPER[1], MIST_PAPER[1], firstPhase),
      lerp(SILT_PAPER[2], MIST_PAPER[2], firstPhase),
    ];
    this.paper.style.backgroundColor = mixColor(middle, SEA_PAPER, finalPhase);
  }

  showHint() {
    this.hint.textContent = LEVEL_HINT;
    this.hint.classList.add("is-visible");
  }

  hideHint() {
    if (this.hint.textContent !== LEVEL_HINT) return;
    this.hint.classList.remove("is-visible");
  }
}
