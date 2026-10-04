// Hub open timings without the game: opens and closes the hub N times and prints what hub_bench
// (hub.rs) measured: background frame, show, first paint, first change on screen, animations done.
// Needs the app started with WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS=--remote-debugging-port=9222.
// Usage: [GAME=<window title>] node scripts/hub-bench.mjs [runs]
const RUNS = Number(process.argv[2] ?? 10);
// GAME=<window title>: that window stands in for the game (window capture path), e.g. a full-screen animation.
const GAME = process.env.GAME || null;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function mainPage() {
  for (let i = 0; i < 120; i++) {
    try {
      const t = await (await fetch("http://127.0.0.1:9222/json")).json();
      const m = t.find((x) => x.type === "page" && x.url.includes(":1420") && !/\/(hub|overlay)$/.test(x.url));
      if (m && t.some((x) => x.url.endsWith("/hub"))) return m.webSocketDebuggerUrl;
    } catch {}
    await sleep(1000);
  }
  throw new Error("no app on the CDP port");
}

const ws = new WebSocket(await mainPage());
await new Promise((r) => ws.addEventListener("open", r));
let id = 0;
const pending = new Map();
ws.addEventListener("message", (ev) => {
  const msg = JSON.parse(ev.data);
  if (msg.id && pending.has(msg.id)) pending.get(msg.id)(msg), pending.delete(msg.id);
});
const evaluate = (expr) =>
  new Promise((r) => {
    const mid = ++id;
    pending.set(mid, r);
    ws.send(JSON.stringify({ id: mid, method: "Runtime.evaluate", params: { expression: expr, awaitPromise: true, returnByValue: true } }));
  }).then((m) => {
    const res = m.result;
    if (res?.exceptionDetails) throw new Error(JSON.stringify(res.exceptionDetails).slice(0, 300));
    return res?.result?.value;
  });
const invoke = (cmd, args = {}) => evaluate(`window.__TAURI_INTERNALS__.invoke(${JSON.stringify(cmd)}, ${JSON.stringify(args)})`);

const stat = (xs) => {
  const s = [...xs].sort((a, b) => a - b);
  const q = (p) => s[Math.min(s.length - 1, Math.floor(p * s.length))];
  return `медиана ${q(0.5).toFixed(0).padStart(4)}  мин ${s[0].toFixed(0).padStart(4)}  p90 ${q(0.9).toFixed(0).padStart(4)}`;
};

await sleep(3000);
await invoke("hub_bench", { runs: 2, game: GAME }); // warm-up
const runs = await invoke("hub_bench", { runs: RUNS, game: GAME });
console.log(`== ${GAME ? `игра: «${GAME}»` : "без игры"} (${runs.length} открытий, мс от бинда)`);
for (const k of ["snap_ms", "show_ms", "paint_ms", "visible_ms", "settled_ms"]) {
  const xs = runs.map((r) => r[k]).filter((x) => x >= 0);
  console.log(`  ${k.padEnd(11)} ${xs.length ? stat(xs) : "нет данных"}`);
}
console.log("\nJSON " + JSON.stringify(runs));
process.exit(0);
