// Screenshots of main-window pages through CDP (app started with the debug port, see CLAUDE.md).
// Usage: node scripts/page-shots.mjs <dir> <name>=<path> [<name>=<path> ...]
import { writeFileSync } from "node:fs";

const [OUT, ...pages] = process.argv.slice(2);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const targets = await (await fetch("http://127.0.0.1:9222/json")).json();
const main = targets.find((t) => t.type === "page" && t.url.includes(":1420") && !/\/(hub|overlay)$/.test(t.url));
const ws = new WebSocket(main.webSocketDebuggerUrl);
await new Promise((r) => ws.addEventListener("open", r));
let id = 0;
const pending = new Map();
ws.addEventListener("message", (ev) => {
  const msg = JSON.parse(ev.data);
  if (msg.id && pending.has(msg.id)) pending.get(msg.id)(msg), pending.delete(msg.id);
  if (msg.method === "Runtime.exceptionThrown") console.log("EXCEPTION", JSON.stringify(msg.params.exceptionDetails).slice(0, 300));
});
const send = (method, params = {}) =>
  new Promise((r) => {
    const mid = ++id;
    pending.set(mid, r);
    ws.send(JSON.stringify({ id: mid, method, params }));
  });
const js = (expr) => send("Runtime.evaluate", { expression: expr, awaitPromise: true });
await send("Runtime.enable");

for (const p of pages) {
  const cut = p.indexOf("=");
  const [name, path] = [p.slice(0, cut), p.slice(cut + 1)];
  // Menu links when there is one; otherwise an anchor that stays in the page until the router took it
  // (a removed one is ignored). From Git Bash run with MSYS_NO_PATHCONV=1, or "x=/frames" turns into a Windows path.
  const P = JSON.stringify(path);
  await js(`(async () => {
    let a = [...document.querySelectorAll('nav a')].find((x) => x.getAttribute('href') === ${P});
    if (!a) { a = document.createElement('a'); a.href = ${P}; a.id = '__shot'; document.body.appendChild(a); }
    a.click();
    await new Promise((r) => setTimeout(r, 1500));
    document.getElementById('__shot')?.remove();
  })()`);
  await sleep(3000);
  const res = await send("Page.captureScreenshot", { format: "png" });
  writeFileSync(`${OUT}/${name}.png`, Buffer.from(res.result.data, "base64"));
  console.log("saved", name);
}
process.exit(0);
