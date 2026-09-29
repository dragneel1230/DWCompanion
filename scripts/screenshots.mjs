// Drives the running Tauri WebView2 via CDP and saves screenshots.
import { writeFileSync } from "node:fs";

const OUT = process.argv[2];
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

let targets;
for (let i = 0; i < 60; i++) {
  try {
    targets = await (await fetch("http://127.0.0.1:9222/json")).json();
    if (targets.some((t) => t.type === "page" && t.url.includes("1420"))) break;
  } catch {}
  await sleep(1000);
}
const page = targets.find((t) => t.type === "page" && t.url.includes("1420"));
const ws = new WebSocket(page.webSocketDebuggerUrl);
await new Promise((r) => ws.addEventListener("open", r));

let id = 0;
const pending = new Map();
ws.addEventListener("message", (ev) => {
  const msg = JSON.parse(ev.data);
  if (msg.id && pending.has(msg.id)) {
    pending.get(msg.id)(msg);
    pending.delete(msg.id);
  }
});
const send = (method, params = {}) =>
  new Promise((r) => {
    const mid = ++id;
    pending.set(mid, r);
    ws.send(JSON.stringify({ id: mid, method, params }));
  });
const js = async (expr) => (await send("Runtime.evaluate", { expression: expr, awaitPromise: true })).result;

async function shot(name) {
  const res = await send("Page.captureScreenshot", { format: "png" });
  writeFileSync(`${OUT}/${name}.png`, Buffer.from(res.result.data, "base64"));
  console.log("saved", name);
}

// Client-side navigation keeps the loaded db and price cache.
async function go(path, wait = 4000) {
  await js(`(async () => { const a = document.createElement('a'); a.href = ${JSON.stringify(path)}; document.body.appendChild(a); a.click(); a.remove(); })()`);
  await sleep(wait);
}

async function type(text) {
  await js(`(() => { const i = document.querySelector('input'); i.focus(); i.value = ${JSON.stringify(text)}; i.dispatchEvent(new Event('input', { bubbles: true })); })()`);
  await sleep(800);
}

await send("Page.enable");
await sleep(3000);
const scroll = (y) => js(`document.querySelector('main').scrollTo(0, ${y})`);
await go("/set?id=" + encodeURIComponent("/Lotus/Powersuits/Saryn/SarynPrime"), 5000);
await shot("1_set_icons");
await go("/relic?id=" + encodeURIComponent("Lith S18"), 5000);
await shot("2_relic_icons");
await go("/frames", 2500);
await shot("3_frames");
await type("са");
await shot("4_frames_search");
await go("/frame?id=" + encodeURIComponent("/Lotus/Powersuits/Saryn/SarynPrime"), 2500);
await js(`document.querySelector('.ability').click()`);
await sleep(400);
await shot("5_frame_saryn");
await go("/build?id=demo-saryn-strength", 3500);
// Mark a few mods as owned to show the "have" state.
await js(`[...document.querySelectorAll('.own')].slice(0, 4).forEach((b) => b.click())`);
await sleep(600);
await scroll(0);
await shot("6_build_board");
await scroll(620);
await sleep(300);
await shot("7_build_mods");
ws.close();
