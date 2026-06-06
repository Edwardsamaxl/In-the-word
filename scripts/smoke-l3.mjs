import { spawn } from "node:child_process";
import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

const executablePath = "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe";
const baseUrl = process.env.BASE_URL || "http://127.0.0.1:5173";
const port = 9700 + Math.floor(Math.random() * 200);
const userDataDir = await mkdtemp(path.join(tmpdir(), "in-the-word-l3-"));
const chrome = spawn(
  executablePath,
  [
    "--headless=new",
    "--disable-gpu",
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
  const target = await waitForTarget(port);
  socket = new WebSocket(target.webSocketDebuggerUrl);
  await new Promise((resolve, reject) => {
    socket.addEventListener("open", resolve, { once: true });
    socket.addEventListener("error", reject, { once: true });
  });
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
  await command("Page.navigate", { url: `${baseUrl}/?scene=l3` });
  await sleep(1000);

  const samples = [];
  for (const delay of [1000, 6000, 11000]) {
    await sleep(delay);
    samples.push(await evaluate(`({
      now: performance.now(),
      startedAt: window.__levelThree?.startedAt,
      finished: window.__levelThree?.finished,
      actor: document.querySelector('#actor')?.style.transform,
      endVisible: document.querySelector('#level-three-end')?.classList.contains('is-visible')
    })`));
  }

  const result = samples.at(-1);
  if (!result.finished || !result.endVisible) {
    throw new Error(`Level three did not finish: ${JSON.stringify(samples)}`);
  }
  console.log(JSON.stringify(samples));
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

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
