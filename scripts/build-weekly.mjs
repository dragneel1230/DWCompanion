// Names for the weekly panel of «Сейчас» (src/lib/weekly.ts): Nightwave and 1999 calendar challenges, calendar
// rewards, Circuit Incarnon Genesis adapters and the weapons they go on, Archon shards by boss.
// Output: static/data/<lang>/weekly.json. Run: pnpm data
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";

const PE_DIR = "node_modules/warframe-public-export-plus";
const pe = (f) => JSON.parse(readFileSync(`${PE_DIR}/${f}`, "utf8"));

const en = pe("dict.en.json");
const DICTS = { ru: pe("dict.ru.json"), en };
const nightwave = pe("ExportNightwave.json");
const challenges = pe("ExportChallenges.json");
const resources = pe("ExportResources.json");
const weapons = pe("ExportWeapons.json");
const images = pe("ExportImages.json");

const img = (path) => {
  const hash = path && images[path]?.contentHash;
  return hash ? `https://content.warframe.com/PublicExport${path}!${hash.replace(/\+/g, "%2B")}` : (path ?? null);
};
const tr = (dict, key) => (dict[key] ?? en[key] ?? null)?.replace(/<[^>]+>\s*/g, "").trim() ?? null;
// "Kill |COUNT| enemies" -> "Kill 150 enemies".
const fill = (s, n) => (s ? s.replace(/\|COUNT\|/g, n != null ? String(n) : "").replace(/\s+/g, " ").trim() : s);

// Calendar rewards: packs, bundles, endo, resources (Forma, shards). The app maps "/Lotus/StoreItems/" ids to them.
const named = {};
for (const f of ["ExportResources.json", "ExportBundles.json", "ExportBoosterPacks.json", "ExportFusionBundles.json"]) Object.assign(named, pe(f));

// Incarnon Genesis adapters: ".../IncarnonAdapters/<Kind>/<Choice>IncarnonUnlocker" — the Circuit's Steel Path
// choice is <Choice>. The weapons it goes on: the adapter's weapon name ("Soma Incarnon Genesis" -> "Soma")
// and its variants ("Soma Prime").
const ENG_SUFFIX = /\s*Incarnon Genesis$/;
function incarnons() {
  const out = {};
  for (const [id, r] of Object.entries(resources)) {
    const m = id.match(/\/IncarnonAdapters\/[^/]+\/(\w+)IncarnonUnlocker$/);
    if (!m) continue;
    const base = tr(en, r.name)?.replace(ENG_SUFFIX, "");
    const fits = base
      ? Object.entries(weapons)
          .filter(([, w]) => {
            const n = tr(en, w.name);
            return n && (n === base || n.startsWith(`${base} `));
          })
          .map(([wid]) => wid)
      : [];
    out[m[1]] = { id, key: r.name, icon: img(r.icon), fits };
  }
  return out;
}

const ARCHONS = { SORTIE_BOSS_AMAR: "Amar", SORTIE_BOSS_NIRA: "Nira", SORTIE_BOSS_BOREAL: "Boreal" };
const ARCHON_COLOR = { Amar: "ACC_RED", Nira: "ACC_YELLOW", Boreal: "ACC_BLUE" };

const inc = incarnons();
for (const [lang, dict] of Object.entries(DICTS)) {
  const nw = {};
  for (const [id, c] of Object.entries(nightwave.challenges ?? {}))
    nw[id.split("/").pop()] = [tr(dict, c.name) ?? id.split("/").pop(), fill(tr(dict, c.description), c.required), c.standing ?? 0];
  const cal = {};
  for (const [id, c] of Object.entries(challenges))
    if (id.includes("/Calendar1999/")) cal[id] = fill(tr(dict, c.description) ?? tr(dict, c.name), c.requiredCount);
  const rew = {};
  for (const [id, x] of Object.entries(named)) if (x?.name && (id.includes("Calendar") || resources[id] || id.includes("FusionBundles"))) {
    const n = tr(dict, x.name);
    if (n) rew[id] = n;
  }
  const archons = {};
  for (const [boss, a] of Object.entries(ARCHONS)) {
    const id = `/Lotus/Types/Gameplay/NarmerSorties/ArchonCrystal${a}`;
    archons[boss] = [tr(dict, resources[id]?.name) ?? a, img(resources[id]?.icon), ARCHON_COLOR[a]];
  }
  const incOut = Object.fromEntries(Object.entries(inc).map(([k, v]) => [k, [tr(dict, v.key) ?? k, v.icon, v.id, v.fits]]));
  const out = { nw, cal, rew, archons, inc: incOut };
  mkdirSync(`static/data/${lang}`, { recursive: true });
  writeFileSync(`static/data/${lang}/weekly.json`, JSON.stringify(out));
  console.log(
    `${lang}: weekly — nightwave ${Object.keys(nw).length}, calendar ${Object.keys(cal).length}, rewards ${Object.keys(rew).length}, ` +
      `incarnons ${Object.keys(incOut).length}, size ${(JSON.stringify(out).length / 1024).toFixed(0)} KB`,
  );
}
