import { spawn } from "node:child_process";
import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

const executablePath = "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe";
const baseUrl = process.env.BASE_URL || "http://127.0.0.1:5173";
const port = 9300 + Math.floor(Math.random() * 400);
const userDataDir = await mkdtemp(path.join(tmpdir(), "in-the-word-smoke-"));

const chrome = spawn(
  executablePath,
  [
    "--headless=new",
    "--disable-gpu",
    "--hide-scrollbars",
    `--remote-debugging-port=${port}`,
    `--user-data-dir=${userDataDir}`,
    "--window-size=375,667",
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
  await new Promise((resolve, reject) => {
    socket.addEventListener("open", resolve, { once: true });
    socket.addEventListener("error", reject, { once: true });
  });

  socket.addEventListener("message", (event) => {
    const message = JSON.parse(event.data);
    if (!message.id || !pending.has(message.id)) return;
    const { resolve, reject } = pending.get(message.id);
    pending.delete(message.id);
    if (message.error) reject(new Error(message.error.message));
    else resolve(message.result);
  });

  await command("Page.enable");
  await command("Runtime.enable");
  await command("Emulation.setDeviceMetricsOverride", {
    width: 375,
    height: 667,
    deviceScaleFactor: 1,
    mobile: true,
  });
  await command("Page.navigate", { url: baseUrl });

  await waitForExpression("window.__levelOne?.state === 'IDLE'", 6000);
  const visibleChars = await evaluate(
    "[...document.querySelectorAll('.char')].filter((char) => Number.parseFloat(getComputedStyle(char).opacity) > 0).length",
  );
  assert(visibleChars === 24, `Expected 24 visible characters, received ${visibleChars}.`);

  await key("ArrowRight", "ArrowRight", 39, "keyDown");
  await waitForExpression("window.__levelOne?.state === 'BULLET_TIME'", 6000);
  await key(" ", "Space", 32, "keyDown");
  await key(" ", "Space", 32, "keyUp");
  await key("ArrowRight", "ArrowRight", 39, "keyUp");

  await waitForExpression("window.__levelOne?.state === 'PLAYING_POST_MOON'", 4000);
  await key("ArrowRight", "ArrowRight", 39, "keyDown");
  await waitForExpression(
    "window.__levelOne?.row === 1 && Math.abs(window.__levelOne?.col - 6) < 0.4",
    4000,
  );
  await key("ArrowRight", "ArrowRight", 39, "keyUp");
  await key("ArrowDown", "ArrowDown", 40, "keyDown");
  await waitForExpression("window.__levelOne?.state === 'HANDOFF'", 5000);
  await waitForExpression(
    "Number.parseFloat(getComputedStyle(document.querySelector('#handoff')).opacity) > 0.9",
    2000,
  );
  await key("ArrowDown", "ArrowDown", 40, "keyUp");

  const result = await evaluate(`({
    state: window.__levelOne.state,
    moonCreated: window.__levelOne.moonCreated,
    handoffOpacity: getComputedStyle(document.querySelector('#handoff')).opacity
  })`);

  assert(result.state === "HANDOFF", `Expected HANDOFF, received ${result.state}.`);
  assert(result.moonCreated === true, "Moon was not created.");
  assert(Number.parseFloat(result.handoffOpacity) > 0.9, "Handoff scene is not visible.");
  console.log(JSON.stringify(result));
} finally {
  socket?.close();
  chrome.kill();
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
  throw new Error(`Timed out waiting for: ${expression}`);
}

function key(keyValue, code, windowsVirtualKeyCode, type) {
  return command("Input.dispatchKeyEvent", {
    type,
    key: keyValue,
    code,
    windowsVirtualKeyCode,
    nativeVirtualKeyCode: windowsVirtualKeyCode,
  });
}

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
