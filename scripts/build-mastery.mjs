// Collection / mastery data: every masterable item (WFCD @wfcd/items, `masterable`) with its
// category, rank cap and MR requirement, Russian names and icons from DE's export; star chart nodes
// with their mastery XP (ExportRegions). Output: static/data/<lang>/mastery.json and account.json per
// interface language (lazy, Collection tab); `name` is in the file's language, `ru` / `en` stay for search.
// The player's progress itself comes from DE's public profile at runtime (src/lib/profile.svelte.ts).
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";

const PE_DIR = "node_modules/warframe-public-export-plus";
const pe = (f) => JSON.parse(readFileSync(`${PE_DIR}/${f}`, "utf8"));
const wf = (f) => JSON.parse(readFileSync(`node_modules/@wfcd/items/data/json/${f}`, "utf8"));

const en = pe("dict.en.json");
const ru = pe("dict.ru.json");
const images = pe("ExportImages.json");
const regions = pe("ExportRegions.json");
const img = (path) => {
  const hash = path && images[path]?.contentHash;
  return hash ? `https://content.warframe.com/PublicExport${path}!${hash.replace(/\+/g, "%2B")}` : (path ?? null);
};
const named = {};
for (const f of ["ExportWarframes.json", "ExportWeapons.json", "ExportSentinels.json"]) Object.assign(named, pe(f));
// DE's names carry tags: "<ARCHWING> Odonata" -> "Odonata".
const clean = (s) => s?.replace(/<[^>]+>\s*/g, "").trim();
const unshout = (s) => (s && s === s.toUpperCase() && /[a-zа-я]/i.test(s) ? s[0] + s.slice(1).toLowerCase() : s);

// Category by source file / product category. "Frame-like" items give 200 mastery per rank and need
// 1000 x rank^2 affinity; weapons give 100 per rank and need 500 x rank^2 (wiki "Mastery Rank").
function category(file, x) {
  const pc = x.productCategory;
  if (file === "Warframes.json") return pc === "MechSuits" ? "necramech" : "warframe";
  if (file === "Archwing.json") return "archwing";
  if (file === "Arch-Gun.json" || file === "Arch-Melee.json") return "archweapon";
  if (file === "Sentinels.json" || file === "Pets.json") return "companion";
  if (file === "SentinelWeapons.json") return "companionweapon";
  if (pc === "OperatorAmps") return "amp";
  if (file === "Primary.json") return "primary";
  if (file === "Secondary.json" || file === "Misc.json") return "secondary"; // Misc: kitgun chambers
  if (file === "Melee.json") return "melee";
  return "other";
}
const FRAME_LIKE = new Set(["warframe", "necramech", "archwing", "companion"]);

const builtAt = new Date().toISOString();
for (const [LANG, D] of Object.entries({ ru, en })) {

const items = {};
const FILES = ["Warframes.json", "Primary.json", "Secondary.json", "Melee.json", "Archwing.json", "Arch-Gun.json",
  "Arch-Melee.json", "Sentinels.json", "Pets.json", "SentinelWeapons.json", "Misc.json"];
for (const file of FILES) {
  for (const x of wf(file)) {
    if (!x.masterable || items[x.uniqueName]) continue;
    const n = named[x.uniqueName];
    const cat = category(file, x);
    items[x.uniqueName] = {
      ru: clean(unshout(n?.name && ru[n.name])) || clean(x.name),
      en: clean((n?.name && en[n.name]) || x.name),
      name: clean(unshout(n?.name && D[n.name])) || clean(x.name),
      icon: img(n?.icon) ?? (x.imageName ? `https://cdn.warframestat.us/img/${x.imageName}` : null),
      cat,
      fl: FRAME_LIKE.has(cat) || undefined,
      max: x.maxLevelCap ?? (cat === "necramech" ? 40 : 30), // WFCD has no cap for necramechs (they go to 40)
      mr: x.masteryReq || undefined,
      prime: x.isPrime || undefined,
    };
  }
}

// Star chart: nodes that give mastery (normal and again on the Steel Path) and junctions.
const nodes = {};
for (const [tag, r] of Object.entries(regions)) {
  if (r.missionType === "MT_JUNCTION") nodes[tag] = { xp: r.masteryExp ?? 0, j: 1 };
  else if (r.masteryExp) nodes[tag] = { xp: r.masteryExp };
}

mkdirSync(`static/data/${LANG}`, { recursive: true });
writeFileSync(`static/data/${LANG}/mastery.json`, JSON.stringify({ builtAt, items, nodes }));
const by = {};
for (const it of Object.values(items)) by[it.cat] = (by[it.cat] ?? 0) + 1;
console.log(`${LANG} mastery: ${Object.keys(items).length} items ${JSON.stringify(by)}, ${Object.keys(nodes).length} nodes`);

// ---- account.json: names for the rest of the public profile (lazy: Syndicates / Stats sub-tabs).
// Syndicates with a daily standing limit, their ranks; ability and enemy names for the stats;
// names of profile items the mastery list lacks (companion pets etc.).
const syndicates = {};
for (const [tag, s] of Object.entries(pe("ExportSyndicates.json"))) {
  if (!s.dailyLimitBin || s.dailyLimitBin === "STANDING_LIMIT_BIN_NONE" || !ru[s.name]) continue;
  syndicates[tag] = {
    name: clean(unshout(D[s.name] ?? en[s.name])),
    icon: img(s.icon),
    color: s.colour?.value ? `#${s.colour.value.slice(-6)}` : null,
    bin: s.dailyLimitBin.replace("STANDING_LIMIT_BIN_", ""),
    titles: (s.titles ?? [])
      .map((t) => ({ lvl: t.level, name: clean(unshout(D[t.name] ?? en[t.name] ?? "")), min: t.minStanding, max: t.maxStanding }))
      .sort((a, b) => a.lvl - b.lvl),
  };
}
const abilities = {};
for (const w of Object.values(pe("ExportWarframes.json"))) {
  for (const a of w.abilities ?? []) if (D[a.name]) abilities[a.uniqueName] = { name: clean(unshout(D[a.name])), icon: img(a.icon) };
}
for (const [id, a] of Object.entries(pe("ExportAbilities.json"))) if (D[a.name]) abilities[id] = { name: clean(unshout(D[a.name])), icon: img(a.icon) };
const enemies = {};
for (const [id, a] of Object.entries(pe("ExportEnemies.json").avatars)) if (a.name && D[a.name]) enemies[id] = clean(unshout(D[a.name]));
const names = {};
for (const [id, x] of Object.entries(named)) {
  if (!items[id] && x.name && D[x.name]) names[id] = { name: clean(unshout(D[x.name])), icon: img(x.icon) };
}
const account = { syndicates, abilities, enemies, names };
writeFileSync(`static/data/${LANG}/account.json`, JSON.stringify(account));
console.log(
  `${LANG} account: ${Object.keys(syndicates).length} syndicates, ${Object.keys(abilities).length} abilities, ` +
  `${Object.keys(enemies).length} enemies, ${Object.keys(names).length} names, ${(JSON.stringify(account).length / 1024).toFixed(0)} KB`,
);
}
