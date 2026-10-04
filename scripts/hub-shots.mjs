// Screenshots of the hub (overlay opened by the hotkey) without the game: opens it through the
// hub_toggle command, fakes a fissure mission, walks search -> set -> relic. Needs the app started with
// WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS=--remote-debugging-port=9222. Usage: node scripts/hub-shots.mjs <dir>
import { writeFileSync } from "node:fs";

const OUT = process.argv[2] ?? ".";
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function targets() {
  for (let i = 0; i < 90; i++) {
    try {
      const t = await (await fetch("http://127.0.0.1:9222/json")).json();
      if (t.some((x) => x.type === "page" && x.url.endsWith("/hub"))) return t;
    } catch {}
    await sleep(1000);
  }
  throw new Error("no hub page on the CDP port");
}

async function connect(url) {
  const ws = new WebSocket(url);
  await new Promise((r) => ws.addEventListener("open", r));
  let id = 0;
  const pending = new Map();
  ws.addEventListener("message", (ev) => {
    const msg = JSON.parse(ev.data);
    if (msg.id && pending.has(msg.id)) pending.get(msg.id)(msg), pending.delete(msg.id);
    if (msg.method === "Runtime.exceptionThrown") console.log("EXCEPTION", JSON.stringify(msg.params.exceptionDetails).slice(0, 400));
    if (msg.method === "Runtime.consoleAPICalled" && msg.params.type === "error")
      console.log("console.error", msg.params.args.map((a) => a.value ?? a.description).join(" ").slice(0, 400));
  });
  const send = (method, params = {}) =>
    new Promise((r) => {
      const mid = ++id;
      pending.set(mid, r);
      ws.send(JSON.stringify({ id: mid, method, params }));
    });
  const js = async (expr) => (await send("Runtime.evaluate", { expression: expr, awaitPromise: true, returnByValue: true })).result?.result?.value;
  await send("Runtime.enable");
  return { send, js };
}

const t = await targets();
const main = await connect(t.find((x) => x.type === "page" && x.url.includes(":1420") && !/\/(hub|overlay)$/.test(x.url)).webSocketDebuggerUrl);
const hub = await connect(t.find((x) => x.type === "page" && x.url.endsWith("/hub")).webSocketDebuggerUrl);

const invoke = (c, cmd, args = {}) => c.js(`window.__TAURI_INTERNALS__.invoke(${JSON.stringify(cmd)}, ${JSON.stringify(args)})`);
const emit = (c, event, payload) => invoke(c, "plugin:event|emit", { event, payload });

async function shot(name) {
  const res = await hub.send("Page.captureScreenshot", { format: "png" });
  writeFileSync(`${OUT}/${name}.png`, Buffer.from(res.result.data, "base64"));
  console.log("saved", name);
}
async function type(text) {
  await hub.js(`(() => { const i = document.querySelector('.hub input'); i.focus(); i.value = ${JSON.stringify(text)}; i.dispatchEvent(new Event('input', { bubbles: true })); })()`);
  await sleep(900);
}
const click = (sel, nth = 0) => hub.js(`document.querySelectorAll(${JSON.stringify(sel)})[${nth}]?.click()`);

await sleep(4000);
await invoke(main, "hub_toggle");
await sleep(1500);
// A fissure mission with two relics (the projection names are the game's, as in EE.log).
const mission = { active: true, name: "Martialis (Марс) - Разрыв: Лит", node: null, relics: [] };
const proj = await main.js(`fetch('/data/ru/db.json').then(r => r.json()).then(d => Object.keys(d.projections).slice(0, 2))`);
mission.relics = [proj[0] + "Platinum", proj[1] + "Bronze"];
// Pretend the game runs; keep the real background frame the hotkey path took.
const bg = await hub.js(`document.querySelector('.hub .bg')?.src ?? null`);
await emit(main, "hub-open", { bg, game: true });
await emit(main, "mission-state", mission);
await sleep(9000); // prices of ~12 rewards at ~3 requests/s
await shot("hub_1_overview");

await type("сарина прайм");
await shot("hub_2_search");
await click(".hub .list button", 0);
await sleep(4500);
await shot("hub_3_set");
await click(".hub .detail button.row", 0);
await sleep(2500);
await click(".hub .detail button.row", 0);
await sleep(4500);
await shot("hub_4_relic");

await hub.js(`document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true })); window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }))`);
console.log("done");
process.exit(0);
