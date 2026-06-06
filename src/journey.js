// Whole-journey counters: total steps (床前明月光 → 海水变蓝) and elapsed time.
// The settlement card (§8.7) reads these so the share line stays "用 N 步，从李白游到余华".
export const journey = {
  startedAt: null,
  steps: 0,
  start() {
    if (this.startedAt === null) this.startedAt = performance.now();
  },
  step(count = 1) {
    this.start();
    this.steps += count;
  },
  reset() {
    this.startedAt = null;
    this.steps = 0;
  },
  elapsedMs() {
    return this.startedAt === null ? 0 : performance.now() - this.startedAt;
  },
  format() {
    const totalSeconds = Math.max(0, Math.round(this.elapsedMs() / 1000));
    const minutes = Math.floor(totalSeconds / 60);
    const seconds = totalSeconds % 60;
    return {
      time: `${minutes} 分 ${String(seconds).padStart(2, "0")} 秒`,
      steps: `${this.steps} 步`,
    };
  },
};

if (typeof window !== "undefined") {
  window.__journey = journey;
}
