// Ability numbers (damage, duration, range, cost…) from the community wiki (wiki.warframe.com, CC BY-SA):
// DE's Public Export has only the energy cost. Each ability page starts with an {{AbilityU10.3 …}} infobox:
//   | energy = 25 | strength = 1x / 1.5x / 2x / 2.5x (damage multiplier) | duration = … | range = … | misc = …
// Ranks are separated by "/", the last one is the max rank; several stats in one field are split by <br>.
// Checked against the game (Octavia Prime, 112% str / 222% dur / 202% rng): Mallet 2.5x → 2.8x, 20 s → 44.4 s.
// Output: data/wiki-abilities.json { fetchedAt, abilities: { "<uniqueName>": { title, energy, strength, duration, range, misc } } },
// each stat [{ v: "2.5x", n: 2.5, unit: "x", label: "damage multiplier" }]; read by build-frames.mjs.
// Offline: the old file stays. 50 pages per request (MediaWiki API).
import { existsSync, readFileSync, writeFileSync } from "node:fs";

const OUT = "data/wiki-abilities.json";
const API = "https://wiki.warframe.com/api.php";
const UA = "DWCompanion/0.1 (personal Warframe companion; build-time fetch, ~20 requests)";

const wfFrames = JSON.parse(readFileSync("node_modules/@wfcd/items/data/json/Warframes.json", "utf8"));
const wanted = new Map(); // uniqueName -> English name
for (const f of wfFrames) {
  if (f.productCategory !== "Suits" || !f.uniqueName.startsWith("/Lotus/Powersuits/")) continue;
  for (const a of f.abilities ?? []) if (a.uniqueName && a.name) wanted.set(a.uniqueName, a.name);
}
// Helminth's own abilities (Feast, Pillage...: not on any warframe), named by DE's English dictionary.
const PE = "node_modules/warframe-public-export-plus";
const dictEn = JSON.parse(readFileSync(`${PE}/dict.en.json`, "utf8"));
const unshout = (s) => (s && s === s.toUpperCase() ? s.replace(/(\w)(\w*)/g, (_, a, r) => a + r.toLowerCase()) : s);
for (const [id, a] of Object.entries(JSON.parse(readFileSync(`${PE}/ExportAbilities.json`, "utf8")))) {
  if (/Helminth[^/]*Ability$/.test(id) && dictEn[a.name]) wanted.set(id, unshout(dictEn[a.name]));
}

// Wiki markup inside a value: {{D|Viral}} -> Viral, [[Armor|armor]] -> armor, '''x''' -> x.
const plain = (s) =>
  s
    .replace(/\{\{\s*(?:D|Stat|A|WF|M|Tooltip)\s*\|([^|}]+)(?:\|[^}]*)?\}\}/gi, "$1")
    .replace(/\{\{[^}]*\}\}/g, "")
    .replace(/\[\[(?:[^|\]]*\|)?([^\]]+)\]\]/g, "$1")
    .replace(/'''?/g, "")
    .replace(/<[^>]+>/g, "")
    .replace(/&nbsp;/g, " ")
    .replace(/&infin;/g, "∞")
    .replace(/&amp;/g, "&")
    .replace(/\s+/g, " ")
    .trim();

// "1x / 1.5x / 2x / 2.5x (damage multiplier)" -> max rank value + label. Ranks are split by " / " with spaces:
// "200 /s" (per second), "N/A", "HP/SP", "24 m/s" keep their slash.
function stat(line) {
  const t = plain(line);
  if (!t || /^n\/a$/i.test(t)) return null;
  const lm = t.match(/\(([^()]*(?:\([^()]*\)[^()]*)*)\)\s*$/);
  const label = lm ? lm[1].trim() : "";
  const body = (lm ? t.slice(0, lm.index) : t).trim();
  const last = body.split(/\s+\/\s+/).pop().trim();
  if (!/\d|∞/.test(last)) return null; // "{{D|Stagger}} per hit": no number to show
  const m = last.match(/^\+?\s*([+-]?\d[\d,]*(?:\.\d+)?)\s*(x|%|m\/s|\/s|s|m)?(?![a-z])/i);
  // A range ("1 - 5"), "≤ 50", "∞" stay text; English prose and template leftovers are dropped.
  if (!m || /^\d+\s*-\s*\d/.test(last)) return /^[\d\s.,%+\-–≤≥=∞]+(?:\s*(?:%|m|s))?$/.test(last) ? { v: last, label } : null;
  // "m/s" -> "mps" (meters per second), "/s" -> "ps" (per second), others as they are.
  const UNIT = { "m/s": "mps", "/s": "ps" };
  const raw = (m[2] ?? "").toLowerCase();
  return { v: last, n: Number(m[1].replace(/,/g, "")), unit: UNIT[raw] ?? raw, label };
}

function infobox(text) {
  const start = text.search(/\{\{\s*Ability/i);
  if (start < 0) return null;
  const body = text.slice(start);
  const field = (name) => {
    const m = body.match(new RegExp(`\\n\\s*\\|\\s*${name}\\s*=([\\s\\S]*?)(?=\\n\\s*\\|\\s*[a-z_]+\\s*=)`, "i"));
    if (!m) return [];
    return m[1]
      .split(/<br\s*\/?>|\n/i)
      .map(stat)
      .filter((x) => x && x.v && !/^n\/?a$/i.test(x.v));
  };
  const energy = field("energy")[0];
  return { energy, strength: field("strength"), duration: field("duration"), range: field("range"), misc: field("misc") };
}

async function fetchPages(titles) {
  const out = new Map(); // asked title -> { title, text }
  for (let i = 0; i < titles.length; i += 50) {
    const batch = titles.slice(i, i + 50);
    const url = `${API}?action=query&format=json&formatversion=2&redirects=1&prop=revisions&rvprop=content&rvslots=main&titles=${encodeURIComponent(batch.join("|"))}`;
    const res = await fetch(url, { headers: { "User-Agent": UA } });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const j = await res.json();
    const final = new Map(batch.map((n) => [n, n]));
    for (const x of j.query?.normalized ?? []) for (const [k, v] of final) if (v === x.from) final.set(k, x.to);
    for (const x of j.query?.redirects ?? []) for (const [k, v] of final) if (v === x.from) final.set(k, x.to);
    const text = new Map((j.query?.pages ?? []).map((p) => [p.title, p.revisions?.[0]?.slots?.main?.content ?? ""]));
    for (const [name, title] of final) out.set(name, { title, text: text.get(title) ?? "" });
    await new Promise((r) => setTimeout(r, 1000)); // be gentle with the wiki
  }
  return out;
}

const abilities = {};
try {
  const names = [...new Set(wanted.values())];
  console.log(`Fetching wiki ability stats for ${names.length} abilities...`);
  const first = await fetchPages(names);
  // Names shared with items or other pages ("Shield", "Smite"): the "(Ability)" page.
  const retry = names.filter((n) => !infobox(first.get(n)?.text ?? ""));
  const second = retry.length ? await fetchPages(retry.map((n) => `${n} (Ability)`)) : new Map();
  for (const [uniqueName, name] of wanted) {
    let page = first.get(name);
    if (!infobox(page?.text ?? "")) page = second.get(`${name} (Ability)`);
    const box = page && infobox(page.text);
    if (box) abilities[uniqueName] = { title: page.title, ...box };
  }
  writeFileSync(OUT, JSON.stringify({ fetchedAt: new Date().toISOString(), abilities }, null, 1));
  console.log(`  ${Object.keys(abilities).length} of ${wanted.size} abilities with wiki stats -> ${OUT}`);
} catch (e) {
  if (!existsSync(OUT)) throw e;
  console.log(`  offline (${e.message}), keeping ${OUT}`);
}
