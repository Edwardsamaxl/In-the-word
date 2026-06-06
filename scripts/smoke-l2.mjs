import { spawn } from "node:child_process";
import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

const executablePath = "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe";
const baseUrl = process.env.BASE_URL || "http://127.0.0.1:5173";
const port = 9700 + Math.floor(Math.random() * 400);
const userDataDir = await mkdtemp(path.join(tmpdir(), "in-the-word-smoke-l2-"));

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
const logs = [];

try {
  const pageTarget = await waitForTarget(port);
  socket = new WebSocket(pageTarget.webSocketDebuggerUrl);
  await new Promise((resolve, reject) => {
    socket.addEventListener("open", resolve, { once: true });
    socket.addEventListener("error", reject, { once: true });
  });

  socket.addEventListener("message", (event) => {
    const message = JSON.parse(event.data);
    if (message.method === "Runtime.consoleAPICalled") {
      const args = (message.params.args || []).map((a) => a.value ?? a.description ?? "").join(" ");
      logs.push(`[${message.params.type}] ${args}`);
    }
    if (message.method === "Runtime.exceptionThrown") {
      logs.push(`[EX] ${message.params.exceptionDetails?.text || ""} ${message.params.exceptionDetails?.exception?.description || ""}`);
    }
    if (!message.id || !pending.has(message.id)) return;
    const { resolve, reject } = pending.get(message.id);
    pending.delete(message.id);
    if (message.error) reject(new Error(message.error.message));
    else resolve(message.result);
  });

  await command("Page.enable");
  await command("Runtime.enable");
  await command("Emulation.setDeviceMetricsOverride", {
    width: 412,
    height: 732,
    deviceScaleFactor: 1,
    mobile: true,
  });

  // ─── Direct L2 entry test ───
  await command("Page.navigate", { url: `${baseUrl}?scene=l2-pierce` });
  await waitForExpression("window.__levelTwo?.state === 'L2_PLAYING'", 6000);

  const renderCheck = await evaluate(`(() => {
    const lines = [...document.querySelectorAll('.l2-line')];
    return {
      lineCount: lines.length,
      activeZone: document.querySelector('#poem-l2')?.dataset.activeZone,
      headerText: document.querySelector('#page-header-l2')?.textContent.replace(/\\s+/g, ''),
      moonLeft: document.querySelector('#moon').offsetLeft,
      moonTop: document.querySelector('#moon').offsetTop,
    };
  })()`);
  assert(renderCheck.lineCount === 9, `Expected 9 L2 lines, got ${renderCheck.lineCount}`);
  assert(renderCheck.headerText === "《故乡》——鲁迅", `Unexpected L2 header: ${renderCheck.headerText}`);
  assert(renderCheck.moonLeft === 308, `Expected moon at x=308, got ${renderCheck.moonLeft}`);
  assert(renderCheck.activeZone === "action", `Expected action zone, got ${renderCheck.activeZone}`);

  // Trigger pierce by walking right on row 8
  await evaluate(`window.__levelTwo.holdRight = true;`);
  await waitForExpression("window.__levelTwo?.state === 'L2_PIERCE'", 4000);
  await waitForExpression("window.__levelTwo?.state === 'L2_LANDED_SEA'", 3500);
  await evaluate(`window.__levelTwo.holdRight = false;`);

  const landed = await evaluate(`(() => {
    const moon = document.querySelector('#moon');
    return {
      state: window.__levelTwo.state,
      moonSilvered: moon.classList.contains('is-silvered'),
      inkSeaVisible: document.querySelector('#ink-sea').classList.contains('is-visible'),
      hint: document.querySelector('#hint').textContent,
      row8Pierced: document.querySelector('.l2-line[data-row="8"]').classList.contains('is-pierced'),
    };
  })()`);
  assert(landed.state === "L2_LANDED_SEA", `Expected LANDED_SEA, got ${landed.state}`);
  assert(landed.moonSilvered, "Expected moon to be silvered after pierce");
  assert(landed.inkSeaVisible, "Expected ink sea to be visible");
  assert(landed.row8Pierced, "Expected row 8 to have is-pierced class");
  assert(landed.hint === "一直游下去。", `Unexpected final hint: ${landed.hint}`);

  // ─── Sky-entry test: verify intro + fall sequence ───
  await command("Page.navigate", { url: `${baseUrl}?scene=l2-sand` });
  await waitForExpression("window.__levelTwo?.state === 'L2_PLAYING'", 6000);
  const sandCheck = await evaluate(`(() => ({
    activeZone: document.querySelector('#poem-l2')?.dataset.activeZone,
    row: window.__levelTwo.row,
    col: window.__levelTwo.col,
  }))()`);
  assert(sandCheck.activeZone === "sand", `Expected sand zone, got ${sandCheck.activeZone}`);
  assert(sandCheck.row === 2, `Expected row 2, got ${sandCheck.row}`);

  console.log(JSON.stringify({ ok: true, landed, render: renderCheck, sand: sandCheck }, null, 2));
} catch (err) {
  console.error("L2 SMOKE FAILED:", err.message);
  console.error("Logs:");
  for (const line of logs) console.error("  " + line);
  process.exitCode = 1;
} finally {
  socket?.close();
  chrome.kill();
}

async function waitForTarget(debugPort) {
  const deadline = Date.now() + 8000;
  while (Date.now() < deadline) {
    try {
      const targets = await fetch(`http://127.0.0.1:${debugPort}/json/list`).then((res) => res.json());
      const page = targets.find((target) => target.type === "page");
      if (page) return page;
    } catch {
      /* still starting */
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
  const result = await command("Runtime.evaluate", { expression, awaitPromise: true, returnByValue: true });
  if (result.exceptionDetails) throw new Error(result.exceptionDetails.text || "Runtime eval failed");
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

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
