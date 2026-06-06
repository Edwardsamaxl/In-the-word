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

  await command("Page.navigate", { url: `${baseUrl}/?scene=l2-action` });
  await sleep(700);
  const aligned = await actionLineLefts();
  if (Math.max(...aligned) - Math.min(...aligned) > 1) {
    throw new Error(`Action lines were not initially aligned: ${JSON.stringify(aligned)}`);
  }

  await command("Page.navigate", { url: `${baseUrl}/?scene=l2-spear` });
  await sleep(700);
  const cocked = await actionLineLefts();
  if (Math.abs(cocked[0] - cocked[2]) > 1 || cocked[1] > cocked[0] - 18) {
    throw new Error(`Spear line did not pull back independently: ${JSON.stringify(cocked)}`);
  }

  await command("Page.navigate", { url: `${baseUrl}/?scene=l2-pierce` });
  await sleep(2600);

  const idleStart = await sample();
  if (idleStart.entering || idleStart.progress !== 0 || idleStart.blueProgress !== 0) {
    throw new Error(`Level two handoff did not settle at the level three start: ${JSON.stringify(idleStart)}`);
  }
  await sleep(1200);
  const idleEnd = await sample();
  if (idleStart.progress !== idleEnd.progress || idleEnd.blueProgress !== 0) {
    throw new Error(`Level three moved without input: ${JSON.stringify({ idleStart, idleEnd })}`);
  }

  await command("Input.dispatchKeyEvent", {
    type: "keyDown",
    key: "ArrowRight",
    code: "ArrowRight",
    windowsVirtualKeyCode: 39,
  });
  await sleep(1500);
  await command("Input.dispatchKeyEvent", {
    type: "keyUp",
    key: "ArrowRight",
    code: "ArrowRight",
    windowsVirtualKeyCode: 39,
  });
  const moved = await sample();
  if (moved.progress <= 0 || moved.blueProgress <= 0) {
    throw new Error(`Right input did not move or reveal blue: ${JSON.stringify(moved)}`);
  }

  await sleep(900);
  const stopped = await sample();
  if (Math.abs(stopped.progress - moved.progress) > 0.002) {
    throw new Error(`Level three kept moving after release: ${JSON.stringify({ moved, stopped })}`);
  }

  await evaluate(`window.__levelThree.progress = 0.96`);
  await command("Input.dispatchKeyEvent", {
    type: "keyDown",
    key: "ArrowRight",
    code: "ArrowRight",
    windowsVirtualKeyCode: 39,
  });
  await sleep(900);
  const result = await sample();
  if (!result.finished || !result.endVisible) {
    throw new Error(`Level three did not finish under player input: ${JSON.stringify(result)}`);
  }
  console.log(JSON.stringify({ aligned, cocked, idleStart, idleEnd, moved, stopped, result }));
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

function sample() {
  return evaluate(`({
    progress: window.__levelThree?.progress,
    blueProgress: window.__levelThree?.blueProgress,
    entering: window.__levelThree?.entering,
    finished: window.__levelThree?.finished,
    actor: document.querySelector('#actor')?.style.transform,
    endVisible: document.querySelector('#level-three-end')?.classList.contains('is-visible')
  })`);
}

function actionLineLefts() {
  return evaluate(`[5, 6, 7].map((row) =>
    document.querySelector('.l2-line[data-row="' + row + '"]')?.getBoundingClientRect().left
  )`);
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
