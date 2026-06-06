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
    const header = document.querySelector('#page-header-l2');
    const hint = document.querySelector('#hint');
    return {
      lineCount: lines.length,
      activeZone: document.querySelector('#poem-l2')?.dataset.activeZone,
      headerText: header?.textContent.replace(/\\s+/g, ''),
      headerTop: getComputedStyle(header).top,
      headerDisplay: getComputedStyle(header).display,
      hintTop: getComputedStyle(hint).top,
      hintLabel: getComputedStyle(hint, '::before').content,
      moonLeft: document.querySelector('#moon').offsetLeft,
      moonTop: document.querySelector('#moon').offsetTop,
      moonAsset: getComputedStyle(document.querySelector('#moon'), '::before').backgroundImage,
    };
  })()`);
  assert(renderCheck.lineCount === 8, `Expected 8 L2 lines, got ${renderCheck.lineCount}`);
  assert(renderCheck.moonAsset.includes("moon-normal-v1.png"), `Expected normal moon asset, got ${renderCheck.moonAsset}`);
  assert(renderCheck.headerText === "02《故乡》——鲁迅", `Unexpected L2 header: ${renderCheck.headerText}`);
  assert(renderCheck.headerTop === "28px", `Expected L2 header at 28px, got ${renderCheck.headerTop}`);
  assert(renderCheck.headerDisplay === "flex", `Expected L2 header flex layout, got ${renderCheck.headerDisplay}`);
  assert(renderCheck.hintTop === "116px", `Expected L2 hint at 116px, got ${renderCheck.hintTop}`);
  assert(renderCheck.hintLabel.includes("操作提示"), `Unexpected L2 hint label: ${renderCheck.hintLabel}`);
  assert(renderCheck.moonLeft === 308, `Expected moon at x=308, got ${renderCheck.moonLeft}`);
  assert(renderCheck.activeZone === "action", `Expected action zone, got ${renderCheck.activeZone}`);

  await evaluate(`window.__levelTwo.triggerMoonSuture()`);
  const moonLit = await evaluate(`(() => ({
    glowing: document.querySelector('#moon').classList.contains('is-glowing'),
    asset: getComputedStyle(document.querySelector('#moon'), '::before').backgroundImage,
  }))()`);
  assert(moonLit.glowing, "Expected moon trigger to enable glowing state");
  assert(moonLit.asset.includes("moon-glow-v1.png"), `Expected glowing moon asset, got ${moonLit.asset}`);

  // Trigger pierce by walking right on row 7 (行动区末行「向一匹猹尽力的刺去」)
  await evaluate(`window.__levelTwo.holdRight = true;`);
  await waitForExpression("window.__levelTwo?.state === 'L2_PIERCE'", 5000);
  await waitForExpression("window.__levelTwo?.state === 'L2_LANDED_SEA'", 3500);
  await evaluate(`window.__levelTwo.holdRight = false;`);

  const landed = await evaluate(`(() => {
    const moon = document.querySelector('#moon');
    return {
      state: window.__levelTwo.state,
      moonSilvered: moon.classList.contains('is-silvered'),
      inkSeaVisible: document.querySelector('#ink-sea').classList.contains('is-visible'),
      hint: document.querySelector('#hint').textContent,
      row7Pierced: document.querySelector('.l2-line[data-row="7"]').classList.contains('is-pierced'),
    };
  })()`);
  assert(landed.state === "L2_LANDED_SEA", `Expected LANDED_SEA, got ${landed.state}`);
  assert(landed.moonSilvered, "Expected moon to be silvered after pierce");
  assert(landed.inkSeaVisible, "Expected ink sea to be visible");
  assert(landed.row7Pierced, "Expected row 7 to have is-pierced class");
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

  // ─── Moon hint sequence: narrative echo -> jump suggestion -> dismiss on jump ───
  await command("Page.navigate", { url: `${baseUrl}?scene=l2-moon` });
  await waitForExpression("window.__levelTwo?.state === 'L2_PLAYING'", 6000);
  await waitForExpression(
    "document.querySelector('#hint')?.textContent === '月亮落低了，再抬头看看？'",
    3200,
  );
  const moonHint = await evaluate(`document.querySelector('#hint').textContent`);
  await evaluate(`window.__levelTwo.handleIntent('jump')`);
  const jumpCheck = await evaluate(`(() => ({
    state: window.__levelTwo.state,
    hint: document.querySelector('#hint').textContent,
  }))()`);
  assert(jumpCheck.state === "L2_CROSSING", `Expected moon jump to cross zones, got ${jumpCheck.state}`);
  assert(jumpCheck.hint === "", `Expected jump to dismiss hint, got ${jumpCheck.hint}`);

  console.log(JSON.stringify({
    ok: true,
    landed,
    render: renderCheck,
    sand: sandCheck,
    moonHint,
    jump: jumpCheck,
  }, null, 2));
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
