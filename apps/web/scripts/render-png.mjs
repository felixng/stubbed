// Renders one element of a local HTML file to a PNG with a transparent
// background, cropped to the element. Used by press-assets.sh for the
// horizontal logo, whose width depends on the rendered wordmark.
//
//   node scripts/render-png.mjs <file.html> <out.png> [selector]
import { spawn } from "node:child_process";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

const [file, out, selector = "#render"] = process.argv.slice(2);
const chromePath = process.env.CHROME ?? "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
const port = 9400 + Math.floor(Math.random() * 400);
const chrome = spawn(chromePath, [
  "--headless=new", "--disable-gpu", `--remote-debugging-port=${port}`,
  `--user-data-dir=${mkdtempSync(join(tmpdir(), "render-"))}`, "about:blank",
], { stdio: "ignore" });

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
try {
  let target;
  for (let i = 0; i < 50 && !target; i++) {
    await sleep(200);
    try { target = (await (await fetch(`http://127.0.0.1:${port}/json`)).json()).find((t) => t.type === "page"); } catch {}
  }
  if (!target) throw new Error("Chrome didn't start");
  const ws = new WebSocket(target.webSocketDebuggerUrl);
  await new Promise((r) => (ws.onopen = r));
  let id = 0;
  const pending = new Map();
  ws.onmessage = (m) => { const d = JSON.parse(m.data); pending.get(d.id)?.(d.result); pending.delete(d.id); };
  const send = (method, params = {}) => new Promise((r) => { pending.set(++id, r); ws.send(JSON.stringify({ id, method, params })); });

  await send("Emulation.setDefaultBackgroundColorOverride", { color: { r: 0, g: 0, b: 0, a: 0 } });
  await send("Page.enable");
  await send("Page.navigate", { url: `file://${resolve(file)}` });
  await sleep(1500);
  const box = await send("Runtime.evaluate", { returnByValue: true, expression:
    `(() => { const r = document.querySelector(${JSON.stringify(selector)}).getBoundingClientRect(); return { x: r.x, y: r.y, width: Math.ceil(r.width), height: Math.ceil(r.height) }; })()` });
  const shot = await send("Page.captureScreenshot", { format: "png", captureBeyondViewport: true, clip: { ...box.result.value, scale: 1 } });
  writeFileSync(out, Buffer.from(shot.data, "base64"));
  ws.close();
} finally {
  chrome.kill();
}
