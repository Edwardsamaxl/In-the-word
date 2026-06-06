import { spawn } from "node:child_process";
import { mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

const executablePath = "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe";
const baseUrl = process.env.BASE_URL || "http://127.0.0.1:5173";
const port = 9900 + Math.floor(Math.random() * 80);
const userDataDir = await mkdtemp(path.join(tmpdir(), "in-the-word-l3-shot-"));
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
  await new Promise((resolve) => socket.addEventListener("open", resolve, { once: true }));
  socket.addEventListener("message", (event) => {
    const message = JSON.parse(event.data);
    if (!message.id || !pending.has(message.id)) return;
    const task = pending.get(message.id);
    pending.delete(message.id);
    if (message.error) task.reject(new Error(message.error.message));
    else task.resolve(message.result);
  });

  await command("Page.enable");
  await command("Runtime.enable");
  await command("Emulation.setDeviceMetricsOverride", {
    width: 412,
    height: 732,
    deviceScaleFactor: 2,
    mobile: true,
  });
  await command("Page.navigate", { url: `${baseUrl}/?scene=l3` });
  await waitForExpression("window.__levelThree", 7000);
  await sleep(700);

  await capture("l3-redesign-start");

  await evaluate(`
    window.__levelThree.progress = 0.52;
    window.__levelThree.blueProgress = 0.52;
    window.__levelThree.update(0.52, performance.now(), 0);
  `);
  await sleep(450);
  await capture("l3-redesign-mid");

  await evaluate("window.__levelThree.finish()");
  await sleep(1900);
  await capture("l3-redesign-end");
} finally {
  socket?.close();
  chrome.kill();
}

async function capture(name) {
  const screenshot = await command("Page.captureScreenshot", { format: "png" });
  const file = path.resolve(`artifacts/${name}.png`);
  await writeFile(file, Buffer.from(screenshot.data, "base64"));
  console.log("wrote", file);
}

async function waitForTarget(debugPort) {
  const deadline = Date.now() + 8000;
  while (Date.now() < deadline) {
    try {
      const targets = await fetch(`http://127.0.0.1:${debugPort}/json/list`).then((res) =>
        res.json(),
      );
      const page = targets.find((target) => target.type === "page");
      if (page) return page;
    } catch {
      // Chrome is still starting.
    }
    await sleep(100);
  }
  throw new Error("Chrome debugging target did not start.");
}

function command(method, params = {}) {
  return new Promise((resolve, reject) => {
    const id = ++nextId;
    pending.set(id, { resolve, reject });
    socket.send(JSON.stringify({ id, method, params }));
  });
}

async function evaluate(expression) {
  const result = await command("Runtime.evaluate", {
    expression,
    awaitPromise: true,
    returnByValue: true,
  });
  if (result.exceptionDetails) {
    throw new Error(result.exceptionDetails.text || "Runtime evaluation failed.");
  }
  return result.result.value;
}

async function waitForExpression(expression, timeout) {
  const deadline = Date.now() + timeout;
  while (Date.now() < deadline) {
    if (await evaluate(`Boolean(${expression})`)) return;
    await sleep(50);
  }
  throw new Error(`Timed out waiting for ${expression}`);
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
