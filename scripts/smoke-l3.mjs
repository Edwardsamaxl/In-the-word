import { spawn } from "node:child_process";
import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

const executablePath = "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe";
const baseUrl = process.env.BASE_URL || "http://127.0.0.1:5173";
const directLevelThree = process.env.L3_DIRECT === "1";
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

  let aligned = [];
  let cocked = [];
  let seaFlowStart = null;
  let seaFlowEnd = null;
  if (directLevelThree) {
    await command("Page.navigate", { url: `${baseUrl}/?scene=l3` });
    await sleep(700);
  } else {
    await command("Page.navigate", { url: `${baseUrl}/?scene=l2-action` });
    await sleep(700);
    aligned = await actionLineLefts();
    if (Math.max(...aligned) - Math.min(...aligned) > 1) {
      throw new Error(`Action lines were not initially aligned: ${JSON.stringify(aligned)}`);
    }
    seaFlowStart = await seaFlowSample();
    await sleep(320);
    seaFlowEnd = await seaFlowSample();
    if (
      !seaFlowStart.stageActive ||
      !seaFlowStart.inkSeaVisible ||
      seaFlowStart.animationNames.some((name) => !name.includes("l2-sea-current")) ||
      seaFlowStart.transforms.every((value, index) => value === seaFlowEnd.transforms[index])
    ) {
      throw new Error(`Sea-side text flow was not active: ${JSON.stringify({
        seaFlowStart,
        seaFlowEnd,
      })}`);
    }

    await command("Page.navigate", { url: `${baseUrl}/?scene=l2-spear` });
    await sleep(700);
    cocked = await actionLineLefts();
    if (Math.abs(cocked[0] - cocked[2]) > 1 || cocked[1] > cocked[0] - 18) {
      throw new Error(`Spear line did not pull back independently: ${JSON.stringify(cocked)}`);
    }

    await command("Page.navigate", { url: `${baseUrl}/?scene=l2-pierce` });
    await waitForExpression("window.__levelThree", 6000);
    const entryStart = await sample();
    if (
      !entryStart.entering ||
      entryStart.headerVisible ||
      entryStart.hintVisible
    ) {
      throw new Error(`Level three entry controls appeared too early: ${JSON.stringify(entryStart)}`);
    }
    const entrySamples = [entryStart];
    while (entrySamples.at(-1).entering && entrySamples.length < 20) {
      await sleep(70);
      entrySamples.push(await sample());
    }
    const revealSamples = entrySamples.filter(
      ({ actorOpacity, seaOpacity }) => actorOpacity > 0.05 || seaOpacity > 0.05,
    );
    if (
      revealSamples.length < 2 ||
      revealSamples.some(({ actorOpacity, seaOpacity }) => Math.abs(actorOpacity - seaOpacity) > 0.18)
    ) {
      throw new Error(`Level three actor and words did not reveal together: ${JSON.stringify(
        revealSamples.map(({ actorOpacity, seaOpacity, pathOpacity }) => ({
          actorOpacity,
          seaOpacity,
          pathOpacity,
        })),
      )}`);
    }
    await waitForExpression(
      "window.__levelThree && !window.__levelThree.entering",
      6000,
    );
    const entryEnd = await sample();
    if (
      entryEnd.pathOpacity < 0.95 ||
      entryEnd.seaOpacity < 0.95 ||
      entryEnd.actorOpacity < 0.95 ||
      !entryEnd.headerVisible ||
      !entryEnd.hintVisible
    ) {
      throw new Error(`Level three words did not appear after the water entry: ${JSON.stringify(entryEnd)}`);
    }
  }

  const idleStart = await sample();
  if (idleStart.entering || idleStart.progress !== 0 || idleStart.blueProgress !== 0) {
    throw new Error(`Level two handoff did not settle at the level three start: ${JSON.stringify(idleStart)}`);
  }
  if (!idleStart.headerVisible || idleStart.headerText !== "03《一直游到海水变蓝》——余华") {
    throw new Error(`Level three header did not match the PRD: ${JSON.stringify(idleStart)}`);
  }
  if (!idleStart.hintVisible || idleStart.hintText !== "一直游下去。") {
    throw new Error(`Level three hint was not visible at rest: ${JSON.stringify(idleStart)}`);
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
  const motionSamples = [];
  for (let index = 0; index < 8; index += 1) {
    await sleep(90);
    motionSamples.push(await sample());
  }
  const actorYs = motionSamples.map(({ actor }) => transformY(actor));
  if (Math.max(...actorYs) - Math.min(...actorYs) > 0.05) {
    throw new Error(`Level three actor jittered vertically: ${JSON.stringify(actorYs)}`);
  }
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
  if (moved.hintVisible) {
    throw new Error(`Level three hint did not fade after forward input: ${JSON.stringify(moved)}`);
  }

  await sleep(900);
  const stopped = await sample();
  if (Math.abs(stopped.progress - moved.progress) > 0.002) {
    throw new Error(`Level three kept moving after release: ${JSON.stringify({ moved, stopped })}`);
  }

  const earlySpeed = await measureSpeedAt(0.08);
  const firstResistance = await measureSpeedAt(0.21);
  const middleSpeed = await measureSpeedAt(0.34);
  const secondResistance = await measureSpeedAt(0.45);
  const lateSpeed = await measureSpeedAt(0.76);
  if (
    firstResistance >= earlySpeed ||
    secondResistance >= middleSpeed ||
    lateSpeed <= middleSpeed
  ) {
    throw new Error(`Level three speed curve did not slow then accelerate: ${JSON.stringify({
      earlySpeed,
      firstResistance,
      middleSpeed,
      secondResistance,
      lateSpeed,
    })}`);
  }

  await evaluate(`window.__levelThree.progress = 0.96`);
  await command("Input.dispatchKeyEvent", {
    type: "keyDown",
    key: "ArrowRight",
    code: "ArrowRight",
    windowsVirtualKeyCode: 39,
  });
  await sleep(1300);
  const result = await sample();
  if (!result.finished || !result.endVisible) {
    throw new Error(`Level three did not finish under player input: ${JSON.stringify(result)}`);
  }
  console.log(JSON.stringify({
    aligned,
    seaFlowStart,
    seaFlowEnd,
    cocked,
    idleStart,
    idleEnd,
    moved,
    stopped,
    result,
  }));
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

async function measureSpeedAt(progress) {
  await evaluate(`window.__levelThree.progress = ${progress}`);
  const start = await sample();
  await command("Input.dispatchKeyEvent", {
    type: "keyDown",
    key: "ArrowRight",
    code: "ArrowRight",
    windowsVirtualKeyCode: 39,
  });
  await sleep(240);
  await command("Input.dispatchKeyEvent", {
    type: "keyUp",
    key: "ArrowRight",
    code: "ArrowRight",
    windowsVirtualKeyCode: 39,
  });
  const end = await sample();
  return end.progress - start.progress;
}

function seaFlowSample() {
  return evaluate(`(() => {
    const lines = [...document.querySelectorAll('.l2-line-current')];
    return {
      stageActive: document.querySelector('#game').classList.contains('is-paper-sea'),
      inkSeaVisible: document.querySelector('#ink-sea').classList.contains('is-visible'),
      animationNames: lines.map((line) => getComputedStyle(line).animationName),
      transforms: lines.map((line) => getComputedStyle(line).transform)
    };
  })()`);
}

function transformY(transform) {
  const match = transform?.match(/translate3d\([^,]+,\s*([-\d.]+)px/);
  if (!match) throw new Error(`Could not parse actor transform: ${transform}`);
  return Number(match[1]);
}

function sample() {
  return evaluate(`({
    progress: window.__levelThree?.progress,
    blueProgress: window.__levelThree?.blueProgress,
    entering: window.__levelThree?.entering,
    finished: window.__levelThree?.finished,
    actor: document.querySelector('#actor')?.style.transform,
    actorOpacity: Number(getComputedStyle(document.querySelector('#actor')).opacity),
    endVisible: document.querySelector('#level-three-end')?.classList.contains('is-visible'),
    headerVisible: getComputedStyle(document.querySelector('#page-header-l3')).display !== 'none'
      && Number(getComputedStyle(document.querySelector('#page-header-l3')).opacity) > 0.5,
    headerText: document.querySelector('#page-header-l3')?.textContent.replace(/\\s/g, ''),
    hintVisible: document.querySelector('#hint')?.classList.contains('is-visible'),
    hintText: document.querySelector('#hint')?.textContent,
    pathOpacity: Number(getComputedStyle(document.querySelector('.l3-text-path')).opacity),
    seaOpacity: Number(getComputedStyle(document.querySelector('.l3-sea-field')).opacity)
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
