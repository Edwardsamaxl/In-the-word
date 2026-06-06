const KEY_TO_INTENT = {
  ArrowLeft: ["hold-left", "release-left"],
  a: ["hold-left", "release-left"],
  A: ["hold-left", "release-left"],
  ArrowRight: ["hold-right", "release-right"],
  d: ["hold-right", "release-right"],
  D: ["hold-right", "release-right"],
  ArrowDown: ["sink-attempt", "cancel-sink"],
  s: ["sink-attempt", "cancel-sink"],
  S: ["sink-attempt", "cancel-sink"],
};

const JUMP_KEYS = new Set(["ArrowUp", "w", "W", " "]);

export class InputController {
  constructor(stage, onIntent) {
    this.stage = stage;
    this.onIntent = onIntent;
    this.pointer = null;

    this.onKeyDown = this.onKeyDown.bind(this);
    this.onKeyUp = this.onKeyUp.bind(this);
    this.onPointerDown = this.onPointerDown.bind(this);
    this.onPointerMove = this.onPointerMove.bind(this);
    this.onPointerUp = this.onPointerUp.bind(this);
    this.clearHeldInput = this.clearHeldInput.bind(this);

    window.addEventListener("keydown", this.onKeyDown);
    window.addEventListener("keyup", this.onKeyUp);
    window.addEventListener("blur", this.clearHeldInput);
    stage.addEventListener("pointerdown", this.onPointerDown);
    stage.addEventListener("pointermove", this.onPointerMove);
    stage.addEventListener("pointerup", this.onPointerUp);
    stage.addEventListener("pointercancel", this.onPointerUp);
  }

  onKeyDown(event) {
    if (event.key === "r" || event.key === "R") {
      event.preventDefault();
      this.onIntent("reset");
      return;
    }

    if (JUMP_KEYS.has(event.key)) {
      event.preventDefault();
      if (!event.repeat) this.onIntent("jump");
      return;
    }

    const mapping = KEY_TO_INTENT[event.key];
    if (!mapping) return;
    event.preventDefault();
    if (!event.repeat) this.onIntent(mapping[0]);
  }

  onKeyUp(event) {
    const mapping = KEY_TO_INTENT[event.key];
    if (!mapping) return;
    event.preventDefault();
    this.onIntent(mapping[1]);
  }

  onPointerDown(event) {
    if (event.target.closest("button")) return;
    if (this.pointer) return;

    const rect = this.stage.getBoundingClientRect();
    const logicalX = ((event.clientX - rect.left) / rect.width) * 412;
    const movementIntent = logicalX < 206 ? "hold-left" : "hold-right";

    this.pointer = {
      id: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      movementIntent,
      mode: "move",
    };

    this.stage.setPointerCapture(event.pointerId);
    this.onIntent(movementIntent);
  }

  onPointerMove(event) {
    if (!this.pointer || event.pointerId !== this.pointer.id || this.pointer.mode !== "move") {
      return;
    }

    const dx = event.clientX - this.pointer.startX;
    const dy = event.clientY - this.pointer.startY;
    const distance = Math.hypot(dx, dy);
    if (distance < 30) return;

    const verticalAngle = Math.atan2(Math.abs(dx), Math.abs(dy)) * (180 / Math.PI);
    if (verticalAngle >= 30) return;

    this.onIntent(this.pointer.movementIntent === "hold-left" ? "release-left" : "release-right");

    if (dy < 0) {
      this.pointer.mode = "jump";
      this.onIntent("jump");
    } else {
      this.pointer.mode = "sink";
      this.onIntent("sink-attempt");
    }
  }

  onPointerUp(event) {
    if (!this.pointer || event.pointerId !== this.pointer.id) return;

    if (this.pointer.mode === "move") {
      this.onIntent(this.pointer.movementIntent === "hold-left" ? "release-left" : "release-right");
    }

    if (this.pointer.mode === "sink") {
      this.onIntent("cancel-sink");
    }

    this.pointer = null;
  }

  clearHeldInput() {
    this.pointer = null;
    this.onIntent("release-left");
    this.onIntent("release-right");
    this.onIntent("cancel-sink");
  }
}
