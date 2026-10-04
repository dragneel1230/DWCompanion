// Recommended farming nodes per resource from the community wiki (wiki.warframe.com, CC BY-SA):
// the "Farming Locations" section of each resource page lists nodes as {{MissionTable|Node|Node|...}}.
// These are players' advice, not DE's data: shown apart and labelled as the wiki's.
// Output: data/wiki-farming.json { fetchedAt, pages: { "<English name>": { title, nodes } } },
// read by build-drops.mjs. Offline: the old file stays. Pages are fetched 50 per request (MediaWiki API).
import { existsSync, readFileSync, writeFileSync } from "node:fs";

const PE_DIR = "node_modules/warframe-public-export-plus";
const pe = (f) => JSON.parse(readFileSync(`${PE_DIR}/${f}`, "utf8"));
const en = pe("dict.en.json");
const resources = pe("ExportResources.json");

const OUT = "data/wiki-farming.json";
const API = "https://wiki.warframe.com/api.php";
const UA = "DWCompanion/0.1 (personal Warframe companion; build-time fetch, ~15 requests)";

const unshout = (s) => (s && s === s.toUpperCase() && /[a-z]/i.test(s) ? s[0] + s.slice(1).toLowerCase() : s);
const names = [
  ...new Set(
    Object.values(resources)
      .filter((e) => e.productCategory === "MiscItems" && en[e.name])
      .map((e) => unshout(en[e.name]).replace(/<[^>]+>/g, "").trim())
      .filter((n) => n && !/[|#<>[\]{}]/.test(n)),
  ),
];

// Nodes from {{MissionTable|...}} inside "Farming Locations" (up to the next heading of level 2 or 3).
function farming(text) {
  const start = text.search(/^===?\s*Farming Locations\s*===?\s*$/m);
  if (start < 0) return [];
  const rest = text.slice(start).replace(/^.*\n/, "");
  const end = rest.search(/^===?[^=]/m);
  const body = end < 0 ? rest : rest.slice(0, end);
  const nodes = [];
  for (const m of body.matchAll(/\{\{\s*MissionTable\s*\|([^}]*)\}\}/g))
    for (const n of m[1].split("|").map((s) => s.trim()))
      if (n && !n.includes("=") && !nodes.includes(n)) nodes.push(n);
  return nodes;
}

const pages = {};
try {
  console.log(`Fetching wiki farming locations for ${names.length} resources...`);
  for (let i = 0; i < names.length; i += 50) {
    const batch = names.slice(i, i + 50);
    const url = `${API}?action=query&format=json&formatversion=2&redirects=1&prop=revisions&rvprop=content&rvslots=main&titles=${encodeURIComponent(batch.join("|"))}`;
    const res = await fetch(url, { headers: { "User-Agent": UA } });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const j = await res.json();
    // asked name -> final page title (normalization, then redirects)
    const final = new Map(batch.map((n) => [n, n]));
    for (const x of j.query?.normalized ?? []) for (const [k, v] of final) if (v === x.from) final.set(k, x.to);
    for (const x of j.query?.redirects ?? []) for (const [k, v] of final) if (v === x.from) final.set(k, x.to);
    const text = new Map((j.query?.pages ?? []).map((p) => [p.title, p.revisions?.[0]?.slots?.main?.content ?? ""]));
    for (const [name, title] of final) {
      const nodes = farming(text.get(title) ?? "");
      if (nodes.length) pages[name] = { title, nodes };
    }
    await new Promise((r) => setTimeout(r, 1000)); // be gentle with the wiki
  }
  writeFileSync(OUT, JSON.stringify({ fetchedAt: new Date().toISOString(), pages }, null, 1));
  console.log(`  ${Object.keys(pages).length} resources with wiki farming nodes -> ${OUT}`);
} catch (e) {
  if (!existsSync(OUT)) throw e;
  console.log(`  offline (${e.message}), keeping ${OUT}`);
}
