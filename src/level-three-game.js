const STAGE_WIDTH = 412;
const ACTOR_SIZE = 22;
const MOVE_SPEED = 0.09;
const ENTRY_DRIFT_DURATION = 1100;
const SEA_ROWS = 11;
const SEA_COLS = 22;
const CELL_WIDTH = 33;
const CELL_HEIGHT = 37;
const SEA_LEFT = -70;
const SEA_TOP = 204;

const SEA_TEXT =
  "海潮风月星云舟岸远方深蓝回声光影字句行间漂流向前无尽";

const clamp = (value, min = 0, max = 1) => Math.min(max, Math.max(min, value));

export class LevelThreeGame {
  constructor(refs, handoffDetail = {}) {
    this.stage = refs.stage;
    this.scene = refs.scene;
    this.actor = refs.actor;
    this.trail = refs.trail;
    this.hint = refs.hint;
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
    this.cells = [];

    this.renderSea();
    this.activate();
    requestAnimationFrame((time) => this.tick(time));
  }

  renderSea() {
    this.seaField = document.createElement("div");
    this.seaField.className = "l3-sea-field";
    this.scene.replaceChildren(this.seaField, this.endLine);
    this.cells = [];

    for (let row = 0; row < SEA_ROWS; row += 1) {
      for (let col = 0; col < SEA_COLS; col += 1) {
        const index = row * SEA_COLS + col;
        const char = SEA_TEXT[(index * 7 + row * 3) % SEA_TEXT.length];
        const cell = document.createElement("span");
        const stagger = row % 2 ? CELL_WIDTH / 2 : 0;
        const x = SEA_LEFT + col * CELL_WIDTH + stagger + Math.sin(index * 1.73) * 5;
        const y = SEA_TOP + row * CELL_HEIGHT + Math.sin(index * 0.91) * 7;
        const fontSize = 17 + ((index * 7 + row) % 7);
        const alpha = 0.2 + ((index * 5 + row * 3) % 8) * 0.025;
        const tilt = -2.2 + ((index * 11) % 9) * 0.55;

        cell.className = "l3-sea-char";
        cell.textContent = char;
        cell.dataset.char = char;
        cell.style.left = `${x}px`;
        cell.style.top = `${y}px`;
        cell.style.setProperty("--sea-row", String(row));
        cell.style.setProperty("--sea-delay", `${((row * 5 + col * 3) % 17) * -0.18}s`);
        cell.style.setProperty("--sea-size", `${fontSize}px`);
        cell.style.setProperty("--sea-alpha", alpha.toFixed(3));
        cell.style.setProperty("--sea-tilt", `${tilt.toFixed(2)}deg`);
        cell.style.setProperty("--blue-level", "0");
        this.seaField.append(cell);
        this.cells.push({ element: cell, x, row, col });
      }
    }
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
    );
    this.stage.classList.add("is-level-three");
    this.stage.setAttribute("aria-label", "文字海互动尾声");
    this.scene.setAttribute("aria-hidden", "false");
    this.hint.textContent = "";
    this.hint.classList.remove("is-visible");
    this.trail.style.opacity = "0";
    this.endLine.classList.remove("is-visible");
    this.actor.style.opacity = "1";
    this.actor.dataset.direction = "right";
    this.actor.dataset.sheet = "motion";
    this.actor.dataset.frame = "0";
    this.actor.dataset.pose = "auto";
    this.paper.style.backgroundColor = "#f5f4ef";
    if (this.entering) {
      this.updateEntry(0, performance.now());
    } else {
      this.update(0, performance.now(), 0);
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
    this.entryStartedAt = null;
    this.lastFrame = performance.now();
    this.stage.classList.remove("is-level-three-complete");
    this.endLine.classList.remove("is-visible");
    this.actor.style.opacity = "1";
    this.seaField.style.transform = "translate3d(0, 0, 0)";
    this.paper.style.backgroundColor = "#f5f4ef";
    this.cells.forEach(({ element }) => element.style.setProperty("--blue-level", "0"));
    this.update(0, performance.now(), 0);
    if (shouldRestart) requestAnimationFrame((time) => this.tick(time));
  }

  finish() {
    this.progress = 1;
    this.blueProgress = 1;
    this.update(1, performance.now(), 1);
    this.finished = true;
    this.actor.style.opacity = "0";
    this.endLine.classList.add("is-visible");
    this.stage.classList.add("is-level-three-complete");
  }

  destroy() {
    this.disposed = true;
    this.stage.classList.remove("is-level-three", "is-level-three-complete");
    this.scene.setAttribute("aria-hidden", "true");
  }

  handleIntent(intent) {
    if (intent === "reset") {
      this.reset();
      return;
    }
    if (this.disposed || this.finished || this.entering) return;

    if (intent === "hold-left") this.holdLeft = true;
    if (intent === "release-left") this.holdLeft = false;
    if (intent === "hold-right") this.holdRight = true;
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
    const direction = Number(this.holdRight) - Number(this.holdLeft);

    if (direction !== 0) {
      this.progress = clamp(this.progress + direction * MOVE_SPEED * dt);
      if (direction > 0) this.blueProgress = Math.max(this.blueProgress, this.progress);
    }
    this.update(this.progress, time, direction);

    if (this.progress >= 1) {
      this.finish();
      return;
    }

    requestAnimationFrame((nextTime) => this.tick(nextTime));
  }

  updateEntry(progress, time) {
    const eased = 1 - Math.pow(1 - progress, 3);
    const actorX = 311 + (28 - 311) * eased;
    const actorY = 630 + (474 - 630) * eased + Math.sin(progress * Math.PI * 2) * 7;
    const frame = 1 + (Math.floor(time / 180) % 3);

    this.actor.dataset.sheet = "sink";
    this.actor.dataset.frame = String(frame);
    this.actor.style.transform = `translate3d(${actorX - ACTOR_SIZE / 2}px, ${actorY - ACTOR_SIZE}px, 0) scale(1.18)`;
    this.seaField.style.transform = `translate3d(${-eased * 18}px, 0, 0)`;
  }

  update(progress, time, direction) {
    const actorX = 28 + progress * 418;
    const actorY = 474 + Math.sin(progress * Math.PI * 8) * 2;
    const seaShift = -progress * 86;
    const moving = direction !== 0;
    const frame = moving ? 2 + (Math.floor(time / 140) % 2) : Math.floor(time / 720) % 2;

    if (direction !== 0) {
      this.actor.dataset.direction = direction < 0 ? "left" : "right";
    }
    this.actor.dataset.sheet = moving ? "move" : "motion";
    this.actor.dataset.frame = String(frame);
    this.actor.style.transform = `translate3d(${actorX - ACTOR_SIZE / 2}px, ${actorY - ACTOR_SIZE}px, 0) scale(1.18)`;
    this.seaField.style.transform = `translate3d(${seaShift}px, 0, 0)`;

    const blueFront = this.blueProgress * (STAGE_WIDTH + 210) - 42;
    this.cells.forEach(({ element, x, row, col }) => {
      const wave = Math.sin(row * 0.86 + col * 0.42) * 18;
      const level = clamp((blueFront - x - wave) / 92);
      element.style.setProperty("--blue-level", level.toFixed(3));
    });

    const paperBlue = clamp((this.blueProgress - 0.18) / 0.82) * 0.72;
    const r = Math.round(245 + (231 - 245) * paperBlue);
    const g = Math.round(244 + (239 - 244) * paperBlue);
    const b = Math.round(239 + (244 - 239) * paperBlue);
    this.paper.style.backgroundColor = `rgb(${r} ${g} ${b})`;
  }
}
