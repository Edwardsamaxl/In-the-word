import { spawn } from "node:child_process";
import { mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

const executablePath = "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe";
const baseUrl = process.env.BASE_URL || "http://127.0.0.1:5173";
const port = 9800 + Math.floor(Math.random() * 200);
const userDataDir = await mkdtemp(path.join(tmpdir(), "in-the-word-shot-"));
const scenes = ["l2-intro", "l2-sand", "l2-action", "l2-pierce"];

const chrome = spawn(
  executablePath,
  [
    "--headless=new",
    "--disable-gpu",
    "--hide-scrollbars",
    `--remote-debugging-port=${port}`,
    `--user-data-dir=${userDataDir}`,
    "--window-size=412,732",
    "about:blank",
  ],
  { stdio: "ignore" },
);

let socket;
let nextId = 0;
const pending = new Map();

try {
  const pageTarget = await waitForTarget(port);
  socket = new WebSocket(pageTarget.webSocketDebuggerUrl);
  await new Promise((r) => socket.addEventListener("open", r, { once: true }));
  socket.addEventListener("message", (e) => {
    const m = JSON.parse(e.data);
    if (!m.id || !pending.has(m.id)) return;
    const { resolve, reject } = pending.get(m.id);
    pending.delete(m.id);
    if (m.error) reject(new Error(m.error.message));
    else resolve(m.result);
  });
  await command("Page.enable");
  await command("Runtime.enable");
  await command("Emulation.setDeviceMetricsOverride", {
    width: 412, height: 732, deviceScaleFactor: 2, mobile: true,
  });

  for (const scene of scenes) {
    await command("Page.navigate", { url: `${baseUrl}?scene=${scene}` });
    await waitForExpression("window.__levelTwo?.state === 'L2_PLAYING' || window.__levelTwo?.state === 'L2_INTRO'", 7000);
    await sleep(1500);
    const snap = await command("Page.captureScreenshot", { format: "png" });
    const file = path.resolve(`artifacts/l2-${scene}.png`);
    await writeFile(file, Buffer.from(snap.data, "base64"));
    console.log("wrote", file);
  }
} finally {
  socket?.close();
  chrome.kill();
}

async function waitForTarget(p) {
  const deadline = Date.now() + 8000;
  while (Date.now() < deadline) {
    try {
      const targets = await fetch(`http://127.0.0.1:${p}/json/list`).then((r) => r.json());
      const page = targets.find((t) => t.type === "page");
      if (page) return page;
    } catch {}
    await sleep(100);
  }
  throw new Error("Chrome not ready");
}
function command(method, params = {}) {
  return new Promise((resolve, reject) => {
    const id = ++nextId;
    pending.set(id, { resolve, reject });
    socket.send(JSON.stringify({ id, method, params }));
  });
}
async function evaluate(e) {
  const r = await command("Runtime.evaluate", { expression: e, awaitPromise: true, returnByValue: true });
  if (r.exceptionDetails) throw new Error(r.exceptionDetails.text);
  return r.result.value;
}
async function waitForExpression(e, t) {
  const deadline = Date.now() + t;
  while (Date.now() < deadline) {
    if (await evaluate(`Boolean(${e})`)) return;
    await sleep(50);
  }
  throw new Error("timeout: " + e);
}
function sleep(ms) { return new Promise((r) => setTimeout(r, ms)); }
