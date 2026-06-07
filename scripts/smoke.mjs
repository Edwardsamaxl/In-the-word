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
  assert(visibleChars === 22, `Expected 22 visible characters, received ${visibleChars}.`);

  const pageCopy = await evaluate(`({
    meta: document.querySelector('.poem-meta').textContent.replace(/\\s+/g, ''),
    poem: document.querySelector('#poem').textContent,
    hint: document.querySelector('#hint').textContent,
    hintTop: document.querySelector('#hint').getBoundingClientRect().top,
    poemTop: document.querySelector('#poem').getBoundingClientRect().top
  })`);
  assert(pageCopy.meta === "《静夜思》——李白", `Unexpected poem metadata: ${pageCopy.meta}`);
  assert(!pageCopy.poem.includes("。"), "Poem should not render full stops.");
  assert(pageCopy.hint === "按住左右两侧，开始走", `Unexpected opening hint: ${pageCopy.hint}`);
  assert(pageCopy.hintTop < pageCopy.poemTop, "Opening hint should be above the poem.");
  const hintAlignment = await evaluate(`(() => {
    const hint = document.querySelector('#hint').getBoundingClientRect();
    const stage = document.querySelector('#game').getBoundingClientRect();
    return Math.abs((hint.left + hint.width / 2) - (stage.left + stage.width / 2));
  })()`);
  assert(hintAlignment < 1, `Expected centered hint, received ${hintAlignment}px offset.`);

  const actorLayout = await evaluate(`(() => {
    const actor = document.querySelector('#actor').getBoundingClientRect();
    const firstChar = document.querySelector('.char').getBoundingClientRect();
    return {
      actorBottom: actor.bottom,
      textTop: firstChar.top,
      borderRadius: getComputedStyle(document.querySelector('#actor')).borderRadius,
      spriteImage: getComputedStyle(document.querySelector('.actor-sprite')).backgroundImage
    };
  })()`);
  assert(
    actorLayout.actorBottom <= actorLayout.textTop + 1,
    `Expected actor above text, received actor bottom ${actorLayout.actorBottom} and text top ${actorLayout.textTop}.`,
  );
  assert(actorLayout.borderRadius === "50%", "Expected actor to render as a ball.");
  assert(
    actorLayout.spriteImage.includes("ink-spirit-idle-jump-v2.png"),
    "Expected idle actor to render from the idle and jump sprite sheet.",
  );

  await key("ArrowRight", "ArrowRight", 39, "keyDown");
  await waitForExpression("window.__levelOne?.state === 'WRAPPING'", 6000);
  await sleep(80);
  const wrapFrame = await evaluate(`(() => {
    const lines = [...document.querySelectorAll('.poem-line')];
    return {
      col: window.__levelOne.col,
      firstOpacity: Number.parseFloat(getComputedStyle(lines[0]).opacity),
      secondOpacity: Number.parseFloat(getComputedStyle(lines[1]).opacity)
    };
  })()`);
  assert(wrapFrame.col < 10.7, `Expected wrap at the text edge, received column ${wrapFrame.col}.`);
  assert(
    wrapFrame.firstOpacity > 0 && wrapFrame.firstOpacity < 1,
    `Expected outgoing line mid-fade, received opacity ${wrapFrame.firstOpacity}.`,
  );
  assert(
    wrapFrame.secondOpacity > 0 && wrapFrame.secondOpacity < 1,
    `Expected incoming line mid-fade, received opacity ${wrapFrame.secondOpacity}.`,
  );
  await waitForExpression("window.__levelOne?.state === 'BULLET_TIME'", 6000);
  await sleep(500);
  const bulletEntryCol = await evaluate("window.__levelOne.col");
  assert(
    bulletEntryCol < 0.8,
    `Expected slow movement after wrapping near line start, received column ${bulletEntryCol}.`,
  );
  const rollAngle = await evaluate("window.__levelOne?.rollAngle");
  assert(Math.abs(rollAngle) > 90, `Expected actor to roll while moving, received ${rollAngle} degrees.`);
  await key("ArrowRight", "ArrowRight", 39, "keyUp");
  await waitForExpression("window.__levelOne?.state === 'PLAYING'", 3000);
  await evaluate(`
    window.__levelOne.col = 2;
    window.__levelOne.triggerCell(1, 1);
  `);
  await waitForExpression("window.__levelOne?.state === 'BULLET_TIME'", 1000);
  await key(" ", "Space", 32, "keyDown");
  await key(" ", "Space", 32, "keyUp");

  await waitForExpression("window.__levelOne?.state === 'PLAYING_POST_MOON'", 4000);
  const moonVisual = await evaluate(`(() => {
    const moon = document.querySelector('#moon');
    return {
      left: moon.offsetLeft,
      top: moon.offsetTop,
      backgroundImage: getComputedStyle(moon, '::before').backgroundImage
    };
  })()`);
  assert(moonVisual.left === 308, `Expected moon at x=308, received ${moonVisual.left}.`);
  assert(moonVisual.top === 108, `Expected moon at y=108, received ${moonVisual.top}.`);
  assert(
    moonVisual.backgroundImage.includes("moon-"),
    "Expected the moon to use the current moon artwork.",
  );
  await key("ArrowRight", "ArrowRight", 39, "keyDown");
  await waitForExpression(
    "window.__levelOne?.row === 1 && Math.abs(window.__levelOne?.col - 6) < 0.4",
    4000,
  );
  await key("ArrowRight", "ArrowRight", 39, "keyUp");
  await evaluate(`
    window.__levelOne.state = 'PLAYING_POST_MOON';
    window.__levelOne.stage.classList.remove('is-bullet-time', 'is-cool');
    window.__levelOne.col = 5;
    window.__levelOne.updateActor();
  `);
  const sinkStartedAt = Date.now();
  await key("ArrowDown", "ArrowDown", 40, "keyDown");
  await waitForExpression("Boolean(window.__levelOne?.sinkTimer)", 1000);
  await sleep(250);
  const sinkVisual = await evaluate(`(() => {
    const actor = document.querySelector('#actor');
    return {
      pose: actor.dataset.pose,
      sheet: actor.dataset.sheet,
      frame: actor.dataset.frame
    };
  })()`);
  assert(sinkVisual.pose === "sinking", `Expected sinking pose, received ${sinkVisual.pose}.`);
  assert(sinkVisual.sheet === "sink", `Expected sink sheet, received ${sinkVisual.sheet}.`);
  assert(["0", "1", "2", "3"].includes(sinkVisual.frame), "Expected a dedicated sink frame.");
  await waitForExpression("window.__levelOne?.state === 'TRANSITION_TO_LEVEL_2'", 1000);
  const sinkHoldDuration = Date.now() - sinkStartedAt;
  assert(
    sinkHoldDuration < 850,
    `Expected a shorter sink hold, received ${sinkHoldDuration}ms.`,
  );
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
  console.log(JSON.stringify({ ...result, sinkHoldDuration }));
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
