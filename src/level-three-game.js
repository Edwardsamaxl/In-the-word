const STAGE_WIDTH = 412;
const ACTOR_SIZE = 22;
const ENTRY_DRIFT_DURATION = 1100;
const PATH_TOP = 454;
const PATH_START = 64;
const PATH_END_PADDING = 108;
const CHAR_STEP = 34;
const SEA_ROWS = 9;
const SEA_COLS = 35;
const LEVEL_HINT = "一直游下去。";

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

const mixColor = (from, to, amount) => {
  const channel = (index) => Math.round(lerp(from[index], to[index], amount));
  return `rgb(${channel(0)} ${channel(1)} ${channel(2)})`;
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
    this.entryStartedAt = null;
    this.pathChars = [];
    this.seaChars = [];
    this.lastActiveIndex = -1;

    this.renderScene();
    this.activate();
    requestAnimationFrame((time) => this.tick(time));
  }

  renderScene() {
    this.moon = document.createElement("div");
    this.moon.className = "l3-moon";
    this.moon.setAttribute("aria-hidden", "true");

    this.reflection = document.createElement("div");
    this.reflection.className = "l3-moon-reflection";
    this.reflection.setAttribute("aria-hidden", "true");

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
    this.scene.replaceChildren(
      this.moon,
      this.reflection,
      this.viewport,
      this.endLine,
    );
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
        cell.style.setProperty("--blue-level", "0");
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
    this.showHint();
    this.trail.style.opacity = "0";
    this.endLine.classList.remove("is-visible");
    this.actor.style.opacity = "1";
    this.actor.dataset.direction = "right";
    this.actor.dataset.sheet = "motion";
    this.actor.dataset.frame = "0";
    this.actor.dataset.pose = "auto";
    this.paper.style.backgroundColor = "#f7f6f2";
    this.update(0, performance.now(), 0);
    if (this.entering) this.updateEntry(0, performance.now());
  }

  reset() {
    const shouldRestart = this.finished;
    this.finished = false;
    this.progress = 0;
    this.blueProgress = 0;
    this.holdLeft = false;
    this.holdRight = false;
    this.entering = false;
    this.entryStartedAt = null;
    this.lastFrame = performance.now();
    this.lastActiveIndex = -1;
    this.stage.classList.remove("is-level-three-complete");
    this.endLine.classList.remove("is-visible");
    this.actor.style.opacity = "1";
    this.showHint();
    this.header?.classList.remove("is-dissolved");
    this.moon.classList.remove("is-settled");
    this.reflection.classList.remove("is-settled");
    this.paper.style.backgroundColor = "#f7f6f2";
    this.pathChars.forEach(({ element }) => {
      element.classList.remove("is-current", "is-passed");
      element.style.removeProperty("--reveal");
      element.style.removeProperty("--sink");
      element.style.removeProperty("--blue-level");
    });
    this.seaChars.forEach(({ element }) => element.style.setProperty("--blue-level", "0"));
    this.update(0, performance.now(), 0);
    if (shouldRestart) requestAnimationFrame((time) => this.tick(time));
  }

  finish() {
    this.progress = 1;
    this.blueProgress = 1;
    this.update(1, performance.now(), 1);
    this.finished = true;
    this.holdLeft = false;
    this.holdRight = false;
    this.actor.dataset.sheet = "motion";
    this.actor.dataset.frame = "0";
    this.actor.style.transform = `translate3d(${STAGE_WIDTH / 2 - ACTOR_SIZE / 2}px, 330px, 0) scale(1.2)`;
    this.stage.classList.add("is-level-three-complete");
    this.header?.classList.add("is-dissolved");
    this.hideHint();
    this.moon.classList.add("is-settled");
    this.reflection.classList.add("is-settled");
    window.setTimeout(() => {
      if (this.disposed) return;
      this.endLine.classList.add("is-visible");
    }, 650);
  }

  destroy() {
    this.disposed = true;
    this.stage.classList.remove("is-level-three", "is-level-three-complete");
    this.scene.setAttribute("aria-hidden", "true");
    this.header?.setAttribute("aria-hidden", "true");
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
      this.hideHint();
    }
    if (intent === "release-right") this.holdRight = false;
  }

  tick(time) {
    if (this.disposed || this.finished) return;
    if (this.entering) {
      if (this.entryStartedAt === null) this.entryStartedAt = time;
      const entryProgress = clamp((time - this.entryStartedAt) / ENTRY_DRIFT_DURATION);
      this.updateEntry(entryProgress, time);
      if (entryProgress >= 1) {
        this.entering = false;
        this.lastFrame = time;
        this.update(0, time, 0);
      }
      requestAnimationFrame((nextTime) => this.tick(nextTime));
      return;
    }

    const dt = Math.min((time - this.lastFrame) / 1000, 0.05);
    this.lastFrame = time;
    const intent = Number(this.holdRight) - Number(this.holdLeft);
    let travelDirection = 0;

    if (intent > 0) {
      const release = smoothstep(0.12, 0.86, this.progress);
      const speed = lerp(0.052, 0.098, release);
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

  updateEntry(progress, time) {
    const eased = 1 - Math.pow(1 - progress, 3);
    const actorX = lerp(311, 64, eased);
    const actorY = lerp(630, PATH_TOP, eased) + Math.sin(progress * Math.PI * 2) * 7;
    const frame = 1 + (Math.floor(time / 180) % 3);

    this.actor.dataset.sheet = "sink";
    this.actor.dataset.frame = String(frame);
    this.actor.style.transform = `translate3d(${actorX - ACTOR_SIZE / 2}px, ${actorY - ACTOR_SIZE}px, 0) scale(1.18)`;
    this.viewport.style.transform = `translate3d(${lerp(18, 0, eased)}px, 0, 0)`;
  }

  update(progress, time, direction) {
    const worldX = PATH_START + progress * (this.pathLength - PATH_START);
    const maxCamera = Math.max(0, this.worldWidth - STAGE_WIDTH);
    const cameraX = clamp(worldX - 112, 0, maxCamera);
    const actorX = worldX - cameraX;
    const effort = 1 - smoothstep(0.08, 0.72, progress);
    const moving = direction > 0;
    const slowing = direction < 0;
    const swimBob = moving
      ? Math.sin(time / lerp(180, 115, progress)) * lerp(3.8, 1.8, progress)
      : Math.sin(time / 620) * 1.2;
    const actorY = PATH_TOP - 4 + swimBob + effort * 3;
    const frame = moving
      ? 2 + (Math.floor(time / lerp(190, 125, progress)) % 2)
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

      item.element.style.setProperty("--reveal", clamp(reveal, 0.06, 1).toFixed(3));
      item.element.style.setProperty("--sink", sink.toFixed(3));
      item.element.style.setProperty("--blue-level", blueLevel.toFixed(3));
      item.element.classList.toggle("is-passed", passed);
    });

    if (activeIndex !== this.lastActiveIndex) {
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
      element.style.setProperty("--blue-level", level.toFixed(3));
      element.style.setProperty("--wake", proximity.toFixed(3));
    });
  }

  updatePaper() {
    const paleBlue = [158, 196, 214];
    const seaBlue = [23, 107, 155];
    const paper = [247, 246, 242];
    const firstPhase = smoothstep(0.12, 0.76, this.blueProgress);
    const finalPhase = smoothstep(0.76, 1, this.blueProgress);
    const middle = [
      lerp(paper[0], paleBlue[0], firstPhase),
      lerp(paper[1], paleBlue[1], firstPhase),
      lerp(paper[2], paleBlue[2], firstPhase),
    ];
    this.paper.style.backgroundColor = mixColor(middle, seaBlue, finalPhase);
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
