// PERSONAL USE ONLY. Collects popular builds from overframe.gg into data/builds.overframe.json.
// Not part of the app and never shipped: the builds are Overframe users' content.
//
// Polite by design: real (visible) Edge window, one page every PAGE_GAP ms, disk cache.
// If Cloudflare asks "Verify you are human", the script waits for YOU to tick it in the window;
// it never clicks the challenge itself. The pass is kept in .overframe-profile/.
//
// Usage:
//   pnpm overframe                         top builds for every warframe (slow, hours with cache cold)
//   pnpm overframe "Saryn Prime" "Mesa"    only these frames (English names)
//   options: --per 5  builds per frame, --fresh  ignore cache
import { chromium } from "playwright-core";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { createHash } from "node:crypto";

const args = process.argv.slice(2);
const opt = (name, def) => {
  const i = args.indexOf(name);
  return i >= 0 ? args.splice(i, 2)[1] : def;
};
const PER_FRAME = Number(opt("--per", 5));
const FRESH = args.includes("--fresh") ? (args.splice(args.indexOf("--fresh"), 1), true) : false;
const ONLY = new Set(args);

const BASE = "https://overframe.gg";
const PAGE_GAP = 4000;
const CACHE_DIR = ".overframe-cache";
const CACHE_TTL = 7 * 24 * 3600 * 1000;
const OUT = "data/builds.overframe.json";

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
mkdirSync(CACHE_DIR, { recursive: true });

const ctx = await chromium.launchPersistentContext(".overframe-profile", {
  channel: "msedge",
  headless: false,
  locale: "en-US",
  viewport: { width: 1280, height: 900 },
});
const page = ctx.pages()[0] ?? (await ctx.newPage());

let lastLoad = 0;

// Returns the page's __NEXT_DATA__ pageProps, from cache when fresh.
async function nextData(path) {
  const file = `${CACHE_DIR}/${createHash("sha1").update(path).digest("hex")}.json`;
  if (!FRESH && existsSync(file)) {
    const cached = JSON.parse(readFileSync(file, "utf8"));
    if (Date.now() - cached.at < CACHE_TTL) return cached.data;
  }

  const wait = lastLoad + PAGE_GAP - Date.now();
  if (wait > 0) await sleep(wait);
  lastLoad = Date.now();

  await page.goto(BASE + path, { waitUntil: "domcontentloaded", timeout: 60000 });
  await waitForHuman();
  const raw = await page.$eval("#__NEXT_DATA__", (s) => s.textContent).catch(() => null);
  if (!raw) throw new Error(`no __NEXT_DATA__ on ${path}`);
  const data = JSON.parse(raw).props.pageProps;
  writeFileSync(file, JSON.stringify({ at: Date.now(), path, data }));
  return data;
}

async function waitForHuman() {
  let told = false;
  for (let i = 0; i < 600; i++) {
    const title = await page.title().catch(() => "");
    if (!title.includes("Just a moment")) return;
    if (!told && i > 8) {
      console.log("\n>>> Cloudflare спрашивает «Verify you are human» — поставь галочку в окне Edge. Жду до 10 минут...\n");
      told = true;
    }
    await sleep(1000);
  }
  throw new Error("Cloudflare check was not passed");
}

// ---- Our frames (to map Overframe items by uniqueName and to pick which to fetch).
const ours = JSON.parse(readFileSync("static/data/frames.json", "utf8")).frames;
const wanted = Object.entries(ours).filter(([, f]) => !ONLY.size || ONLY.has(f.en));
console.log(`Frames to fetch: ${wanted.length}, builds per frame: ${PER_FRAME}`);

// ---- Overframe item ids: every item page lists its variants (base + prime) with ids.
// Start from the warframes listing and remember ids as we go.
const ofIdByUnique = new Map();
async function learnFrameIds() {
  const list = await nextData("/items/warframes/");
  const items = list.items ?? list.results ?? [];
  for (const it of items) if (it.path) ofIdByUnique.set(it.path, it.id);
  console.log(`Overframe frames known: ${ofIdByUnique.size}`);
}

const result = existsSync(OUT) ? JSON.parse(readFileSync(OUT, "utf8")) : {};

try {
  await learnFrameIds();
  for (const [uid, f] of wanted) {
    const ofId = ofIdByUnique.get(uid);
    if (!ofId) {
      console.log(`- ${f.en}: not found on Overframe, skip`);
      continue;
    }
    const item = await nextData(`/items/arsenal/${ofId}/`);
    const top = [...(item.builds ?? [])].sort((a, b) => b.score - a.score).slice(0, PER_FRAME);
    const builds = [];
    for (const b of top) {
      const detail = await nextData(b.url);
      builds.push({ id: b.id, url: BASE + b.url, title: b.title, author: b.author?.username, score: b.score, updated: b.updated, formas: b.formas, raw: pickBuild(detail) });
    }
    result[uid] = { frame: f.en, fetchedAt: new Date().toISOString(), builds };
    writeFileSync(OUT, JSON.stringify(result, null, 1));
    console.log(`+ ${f.en}: ${builds.length} builds`);
  }
} finally {
  await ctx.close();
}

// TODO: map the build page JSON (mods, arcanes, shards) once its structure is inspected.
// For now keep the raw pageProps keys that look like build data.
function pickBuild(props) {
  return props.build ?? props;
}
