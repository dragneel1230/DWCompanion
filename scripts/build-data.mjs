// Builds the compact app database from Warframe Public Export Plus + warframe.market item list.
// Output: static/data/db.json (loaded by the app at startup).
// Run: pnpm data
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";

// The package's "exports" map hides the raw JSON files, so read them from disk.
const PE_DIR = "node_modules/warframe-public-export-plus";
const pe = (f) => JSON.parse(readFileSync(`${PE_DIR}/${f}`, "utf8"));

const en = pe("dict.en.json");
const ru = pe("dict.ru.json");
const relicsExport = pe("ExportRelics.json");
const rewardsExport = pe("ExportRewards.json");
const recipes = pe("ExportRecipes.json");
const regions = pe("ExportRegions.json");
const missionTypes = pe("ExportMissionTypes.json");
const factions = pe("ExportFactions.json");

// Icons: DE's own CDN when ExportImages has a content hash (better quality), else the bare game
// path, which the app loads from browse.wf.
const images = pe("ExportImages.json");
const img = (path) => {
  const hash = path && images[path]?.contentHash;
  return hash ? `https://content.warframe.com/PublicExport${path}!${hash.replace(/\+/g, "%2B")}` : (path ?? null);
};


// Every export that has a `name` field, merged into one lookup by uniqueName.
const named = {};
for (const f of [
  "ExportResources.json", "ExportWarframes.json", "ExportWeapons.json", "ExportSentinels.json",
  "ExportUpgrades.json", "ExportArcanes.json", "ExportCustoms.json", "ExportGear.json",
  "ExportKeys.json", "ExportDrones.json", "ExportRailjackWeapons.json",
]) Object.assign(named, pe(f));

// Some dictionary entries are ALL CAPS (UI labels); bring them to sentence case.
const unshout = (s) => (s && s === s.toUpperCase() ? s[0] + s.slice(1).toLowerCase() : s);
const tr = (dict, key) => dict[key] ?? en[key] ?? null;

// Blueprints have no name: the game uses "|ITEM| Blueprint" with the result's name.
function itemNames(id) {
  const recipe = recipes[id];
  if (recipe) {
    const result = named[recipe.resultType];
    if (!result) return null;
    return { en: tr(en, result.name), ru: tr(ru, result.name), bp: true };
  }
  const item = named[id];
  if (!item?.name) return null;
  return { en: tr(en, item.name), ru: tr(ru, item.name), bp: false };
}

function icon(id) {
  const recipe = recipes[id];
  const item = recipe ? named[recipe.resultType] : named[id];
  return img(item?.icon);
}

const ducatsOf = (id) => recipes[id]?.primeSellingPrice ?? named[id]?.primeSellingPrice ?? 0;

// warframe.market: gameRef === uniqueName, gives us the trade slug.
console.log("Fetching warframe.market items...");
const wfmRes = await fetch("https://api.warframe.market/v2/items");
if (!wfmRes.ok) throw new Error(`warframe.market ${wfmRes.status}`);
const wfmItems = (await wfmRes.json()).data;
const wfmByRef = new Map(wfmItems.filter((x) => x.gameRef).map((x) => [x.gameRef, x]));

// ---- Relics: 4 refinement variants per relic, collapse them by era + category.
const ERA_KEYS = {
  Lith: "LITH", Meso: "MESO", Neo: "NEO", Axi: "AXI", Requiem: "REQUIEM", Vanguard: "VANGUARD",
};
const eraName = (dict, era) => tr(dict, `/Lotus/Language/Relics/Era_${ERA_KEYS[era]}`) ?? era;
const relicTemplate = (dict) => tr(dict, "/Lotus/Language/Relics/VoidProjectionName");

const items = {};
const relics = {};

function addItem(id) {
  if (items[id]) return items[id];
  const names = itemNames(id);
  if (!names) return null;
  const wfm = wfmByRef.get(id);
  items[id] = {
    en: names.en,
    ru: names.ru,
    bp: names.bp || undefined,
    icon: icon(id),
    ducats: ducatsOf(id) || undefined,
    slug: wfm?.slug,
    relics: [],
  };
  return items[id];
}

for (const [uid, r] of Object.entries(relicsExport)) {
  const key = `${r.era} ${r.category}`;
  const vaulted = !!r.vaultedAt && r.vaultedAt > (r.introducedAt ?? 0);
  if (relics[key]) {
    relics[key].vaulted &&= vaulted;
    continue;
  }
  const table = rewardsExport[r.rewardManifest]?.[0] ?? [];
  const rewards = [];
  for (const rw of table) {
    const id = rw.type.replace("/Lotus/StoreItems/", "/Lotus/");
    const it = addItem(id);
    if (!it) continue;
    rewards.push({ id, rarity: rw.rarity, count: rw.itemCount });
  }
  // Base (non-refined) uniqueName is what warframe.market uses.
  const baseUid = uid.replace(/(Bronze|Silver|Gold|Platinum)$/, "");
  relics[key] = {
    era: r.era,
    cat: r.category,
    en: relicTemplate(en).replace("|ERA|", eraName(en, r.era)).replace("|CATEGORY|", r.category),
    ru: relicTemplate(ru).replace("|ERA|", eraName(ru, r.era)).replace("|CATEGORY|", r.category),
    icon: img(r.icon),
    vaulted,
    slug: wfmByRef.get(baseUid)?.slug,
    rewards,
  };
}

for (const [key, r] of Object.entries(relics)) {
  for (const rw of r.rewards) items[rw.id].relics.push({ relic: key, rarity: rw.rarity });
}

// ---- Prime sets: parent item whose recipe ingredients are relic rewards.
const recipeByResult = new Map(Object.entries(recipes).map(([k, v]) => [v.resultType, k]));
const sets = {};
for (const w of wfmItems) {
  if (!w.tags?.includes("set") || !w.gameRef) continue;
  const mainBp = recipeByResult.get(w.gameRef);
  if (!mainBp || !items[mainBp]) continue;
  const parts = [mainBp];
  for (const ing of recipes[mainBp].ingredients ?? []) {
    // Warframe components drop as blueprints, weapon parts drop as themselves.
    const partId = items[ing.ItemType] ? ing.ItemType : recipeByResult.get(ing.ItemType);
    if (partId && items[partId]) parts.push(partId);
  }
  const main = named[w.gameRef];
  if (!main?.name) continue;
  sets[w.gameRef] = {
    en: tr(en, main.name),
    ru: tr(ru, main.name),
    icon: img(main.icon),
    slug: w.slug,
    parts,
  };
  for (const p of parts) items[p].set = w.gameRef;
  items[mainBp].main = true;
}

// ---- World state translation: warframestat.us returns English strings.
const nodes = {};
for (const reg of Object.values(regions)) {
  if (!tr(en, reg.name) || !tr(en, reg.systemName)) continue;
  nodes[`${tr(en, reg.name)} (${tr(en, reg.systemName)})`] = `${tr(ru, reg.name)} (${tr(ru, reg.systemName)})`;
}
// Case-insensitive English -> Russian for every location / mission label in the dictionary.
// Covers Railjack nodes and mission types that ExportRegions / ExportMissionTypes miss.
const places = {};
const mission = {};
for (const [key, enName] of Object.entries(en)) {
  if (!enName || !ru[key]) continue;
  const lower = enName.toLowerCase();
  if (key.startsWith("/Lotus/Language/Locations/")) places[lower] ??= unshout(ru[key]);
  else if (key.startsWith("/Lotus/Language/Missions/MissionName_")) mission[lower] ??= unshout(ru[key]);
}
places["veil"] = places["veil proxima"];
for (const [key, mt] of Object.entries(missionTypes)) {
  const ruName = unshout(tr(ru, mt.name));
  if (!ruName) continue;
  mission[tr(en, mt.name).toLowerCase()] ??= ruName;
  // warframestat uses the MT_ key in title case ("MT_EXTERMINATION" -> "extermination").
  mission[key.replace(/^MT_/, "").replace(/_/g, " ").toLowerCase()] ??= ruName;
}
const faction = {};
for (const fc of Object.values(factions)) {
  const enName = tr(en, fc.name);
  if (enName) faction[enName.toLowerCase()] = unshout(tr(ru, fc.name));
}
faction["infested"] = faction["infestation"];
// Crossfire fissures report "Crossfire" as the enemy.
faction["crossfire"] = mission["crossfire"];
const tier = {};
for (const era of [...Object.keys(ERA_KEYS), "Omnia"]) {
  tier[era.toLowerCase()] = tr(ru, `/Lotus/Language/Relics/Era_${era === "Omnia" ? "OMNI" : ERA_KEYS[era]}`);
}

const db = {
  builtAt: new Date().toISOString(),
  items,
  relics,
  sets,
  world: { nodes, places, mission, faction, tier },
};

mkdirSync("static/data", { recursive: true });
writeFileSync("static/data/db.json", JSON.stringify(db));
console.log(
  `items ${Object.keys(items).length}, relics ${Object.keys(relics).length}, sets ${Object.keys(sets).length}, ` +
  `nodes ${Object.keys(nodes).length}, size ${(JSON.stringify(db).length / 1024).toFixed(0)} KB`,
);
