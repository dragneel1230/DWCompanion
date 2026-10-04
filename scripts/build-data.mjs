// Builds the compact app database from Warframe Public Export Plus + warframe.market item list.
// Output: static/data/<lang>/db.json per interface language (loaded by the app at startup).
// Every record keeps `ru` and `en` (recognition of the Russian client, search, warframe.market) and
// gets `name`: the display text in the file's language. Node / mission / tier names are in that language.
// Run: pnpm data
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";

// The package's "exports" map hides the raw JSON files, so read them from disk.
const PE_DIR = "node_modules/warframe-public-export-plus";
const pe = (f) => JSON.parse(readFileSync(`${PE_DIR}/${f}`, "utf8"));

const en = pe("dict.en.json");
const ru = pe("dict.ru.json");
// Interface languages: one output folder each.
const DICTS = { ru, en };
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
// DE markup in names ("<ARCHWING> Odonata Prime") is dropped.
const tr = (dict, key) => (dict[key] ?? en[key] ?? null)?.replace(/<[^>]+>\s*/g, "") ?? null;

// Blueprints have no name: the game uses "|ITEM| Blueprint" with the result's name.
function itemNames(id) {
  const recipe = recipes[id];
  if (recipe) {
    const result = named[recipe.resultType];
    if (!result) return null;
    return { en: tr(en, result.name), ru: tr(ru, result.name), bp: true, key: result.name };
  }
  const item = named[id];
  if (!item?.name) return null;
  return { en: tr(en, item.name), ru: tr(ru, item.name), bp: false, key: item.name };
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
// Russian names from the market for items DE's export doesn't name (the "My orders" list, wfm.json).
const wfmRu = new Map();
try {
  const r = await fetch("https://api.warframe.market/v2/items", { headers: { Language: "ru" } });
  for (const x of (await r.json()).data) if (x.i18n?.ru?.name) wfmRu.set(x.id, x.i18n.ru.name);
} catch {
  // English names then
}

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
    key: names.key,
    bp: names.bp || undefined,
    icon: icon(id),
    ducats: ducatsOf(id) || undefined,
    slug: wfm?.slug,
    mname: wfm?.i18n?.en?.name, // exact warframe.market name, used in trade whispers
    relics: [],
  };
  return items[id];
}

// Which relics drop now: DE's drop tables (build-drops.mjs, run first). ExportRelics' vaultedAt misses
// many vaulted relics (142 "active" vs. 35 in the drop tables on 2026-09-30). Requiem relics come
// from Kuva Liches/Siphons, which the tables don't list: they keep the export's flag.
const dropsNow = new Set(Object.keys(JSON.parse(readFileSync("static/data/ru/drops.json", "utf8")).relics));

// EE.log names squad relics by type ("T1VoidProjectionProteaPrimeAPlatinum"): name without quality -> relic key.
const projections = {};
for (const [uid, r] of Object.entries(relicsExport)) {
  const key = `${r.era} ${r.category}`;
  projections[uid.split("/").pop().replace(/(Bronze|Silver|Gold|Platinum)$/, "")] = key;
  const vaulted = r.era === "Requiem" ? !!r.vaultedAt && r.vaultedAt > (r.introducedAt ?? 0) : !dropsNow.has(key);
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
    mname: wfmByRef.get(baseUid)?.i18n?.en?.name,
    rewards,
  };
}

// ---- Relics the export doesn't have yet (a patch newer than the package): contents from DE's drop
// tables (data/droptables.html, saved by build-drops.mjs), rewards matched by English name.
const itemByEn = new Map();
const enName = (id) => {
  const n = itemNames(id);
  return n && (n.bp ? `${n.en} Blueprint` : n.en);
};
for (const id of [...Object.keys(recipes), ...Object.keys(named)]) {
  const n = enName(id);
  if (n && !itemByEn.has(n.toLowerCase())) itemByEn.set(n.toLowerCase(), id);
}
// Russian part names as the game writes them ("Receiver" -> "Приёмник") and a part's icon, from existing prime parts.
const partRu = new Map();
const partIcon = new Map();
for (const it of Object.values(items)) {
  const m = it.en.match(/ Prime (.+)$/);
  const r = it.ru.match(/ Прайм: (.+)$/);
  if (m && r && !partRu.has(m[1])) partRu.set(m[1], r[1]);
  if (m && it.icon && !partIcon.has(m[1])) partIcon.set(m[1], it.icon);
}
// Item that no export knows yet: "Steflos Prime Receiver" -> "Стефлос Прайм: Ствольная коробка".
function newItem(name) {
  const m = name.match(/^(.+?) Prime (.+?)( Blueprint)?$/);
  const baseRu = m && tr(ru, named[itemByEn.get(m[1].toLowerCase())]?.name);
  const part = m && (m[3] ? (m[2] === "Blueprint" ? null : partRu.get(`${m[2]} Blueprint`) ?? partRu.get(m[2])) : partRu.get(m[2]));
  const id = `/DWC/New/${name.replace(/\s+/g, "")}`;
  // No art yet: the same part of another prime, else the non-prime item.
  const partKey = m && (m[3] ? `${m[2]} Blueprint` : m[2]);
  const baseIcon = m && img(named[itemByEn.get(m[1].toLowerCase())]?.icon);
  items[id] = {
    en: name.replace(/ Blueprint$/, ""),
    ru: baseRu ? (part ? `${baseRu} Прайм: ${part}` : `${baseRu} Прайм`) : name.replace(/ Blueprint$/, ""),
    bp: / Blueprint$/.test(name) || undefined,
    icon: (part && (partIcon.get(partKey) ?? partIcon.get(m[2]))) || baseIcon || null,
    relics: [],
  };
  return id;
}
const RARITY_BY_CHANCE = { 25.33: "COMMON", 11: "UNCOMMON", 2: "RARE" };
{
  const dt = readFileSync("data/droptables.html", "utf8");
  const start = dt.indexOf('id="relicRewards"');
  const body = dt.slice(start, dt.indexOf("<h3", start + 10));
  let cur = null;
  const tables = {};
  for (const m of body.matchAll(/<tr[^>]*>(.*?)<\/tr>/gs)) {
    const th = m[1].match(/<th[^>]*>(.*?)<\/th>/);
    const td = [...m[1].matchAll(/<td[^>]*>(.*?)<\/td>/g)].map((x) => x[1]);
    if (th) cur = th[1].match(/^(\w+) (\w+) Relic \(Intact\)$/);
    else if (cur && td.length >= 2) (tables[`${cur[1]} ${cur[2]}`] ??= []).push(td);
  }
  const eraIcon = {};
  for (const r of Object.values(relics)) eraIcon[r.era] ??= r.icon;
  for (const [key, rows] of Object.entries(tables)) {
    if (relics[key]) continue;
    const [era, cat] = key.split(" ");
    const rewards = [];
    for (const [nameRaw, chanceRaw] of rows) {
      const cnt = Number(nameRaw.match(/^(\d+)X /)?.[1] ?? 1);
      const name = nameRaw.replace(/^\d+X /, "").replace(/&amp;/g, "&");
      const chance = Number(chanceRaw.match(/\(([\d.]+)%\)/)?.[1]);
      const known = itemByEn.get(name.toLowerCase());
      const id = known && addItem(known) ? known : newItem(name);
      rewards.push({ id, rarity: RARITY_BY_CHANCE[chance] ?? "UNCOMMON", count: cnt });
    }
    relics[key] = {
      era,
      cat,
      en: relicTemplate(en).replace("|ERA|", eraName(en, era)).replace("|CATEGORY|", cat),
      ru: relicTemplate(ru).replace("|ERA|", eraName(ru, era)).replace("|CATEGORY|", cat),
      icon: eraIcon[era],
      vaulted: !dropsNow.has(key),
      rewards,
    };
  }
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
    key: main.name,
    icon: img(main.icon),
    slug: w.slug,
    mname: w.i18n?.en?.name,
    parts,
  };
  for (const p of parts) items[p].set = w.gameRef;
  items[mainBp].main = true;
}

// ---- World state: official worldState.php uses raw keys (SolNode126, MT_RESCUE, VoidT2), names per language.
function world(dict) {
  const faction = (fc) => unshout(tr(dict, factions[fc]?.name)) ?? fc;
  const regionNames = {};
  for (const [key, reg] of Object.entries(regions)) {
    const name = tr(dict, reg.name);
    if (!name) continue;
    const sys = tr(dict, reg.systemName);
    // m: node's own mission name (Void Storms only give the node).
    regionNames[key] = { n: sys ? `${name} (${sys})` : name, f: faction(reg.faction), m: unshout(tr(dict, reg.missionName)) };
  }
  const missionType = {};
  for (const [key, mt] of Object.entries(missionTypes)) missionType[key] = unshout(tr(dict, mt.name)) ?? key;
  // Fissure modifier VoidT1..VoidT6 -> era name.
  const tier = {};
  ["Lith", "Meso", "Neo", "Axi", "Requiem", "Omnia"].forEach((era, i) => {
    tier[`VoidT${i + 1}`] = tr(dict, `/Lotus/Language/Relics/Era_${era === "Omnia" ? "OMNI" : ERA_KEYS[era]}`);
  });
  return { regions: regionNames, missionType, tier, byName };
}

// Node key by its name as the game client writes it in EE.log ("Martialis (Марс)", "Martialis (Mars)"):
// the client's language is not the interface's, so every client language is listed.
const byName = {};
for (const dict of [ru, en]) {
  for (const [key, reg] of Object.entries(regions)) {
    const name = tr(dict, reg.name);
    const sys = tr(dict, reg.systemName);
    if (name && sys) byName[`${name} (${sys})`] ??= key;
  }
}

// ---- Vendor names: Baro Ki'Teer's stock (worldState VoidTraders.Manifest) is any store item, so every
// named export goes in, keyed by uniqueName without "/Lotus/" (the app maps "/StoreItems/" paths to it).
// Kept small (loaded only for the Baro list): no plain resources, store packages or gear blueprints, and
// icons as bare game paths (browse.wf serves them) without the common "/Lotus/Interface/Icons/".
// Row: [name, icon, kind, market slug?, blueprint?]
// kind: m mod, w weapon, c cosmetic, d ship decoration, o other.
const VENDOR_SOURCES = {
  "ExportUpgrades.json": "m", "ExportArcanes.json": "m", "ExportWeapons.json": "w", "ExportSentinels.json": "w",
  "ExportCustoms.json": "c", "ExportFlavour.json": "c", "ExportResources.json": "o", "ExportGear.json": "o",
  "ExportBundles.json": "o", "ExportBoosterPacks.json": "o", "ExportKeys.json": "o", "ExportWarframes.json": "w",
};
const keys = pe("ExportKeys.json");
const vendorExports = Object.entries(VENDOR_SOURCES).map(([f, kind]) => [pe(f), kind]);
const ICONS = /^\/Lotus\/Interface\/Icons\//;
const SKIP = /\/StoreItems\/Packages\/|\/Types\/Items\/(?!ShipDecos|SongItems|ShipFeatureItems)/;
const short = (id) => id.replace(/^\/Lotus\//, "");
function vendor(dict) {
  const out = {};
  const row = (id, x, kind, bp) => {
    const name = tr(dict, x.name);
    if (!name) return;
    const k = kind === "o" && id.includes("/ShipDecos/") ? "d" : kind;
    const r = [name, (x.icon ?? "").replace(ICONS, ""), k];
    const slug = wfmByRef.get(id)?.slug;
    if (slug || bp) r.push(slug ?? "");
    if (bp) r.push(1);
    out[short(id)] = r;
  };
  for (const [table, kind] of vendorExports) for (const [id, x] of Object.entries(table)) if (x?.name && !SKIP.test(id)) row(id, x, kind);
  // Quest key blueprints: the key's name.
  for (const [id, r] of Object.entries(recipes)) {
    const res = keys[r.resultType];
    if (res?.name && !out[short(id)]) row(id, res, "o", true);
  }
  return { items: out };
}

// Name in the file's language: the dictionary key when known, else the built name (items the export
// doesn't have yet are only named in en / ru).
const named_ = (o, lang, dict) => (o.key ? tr(dict, o.key) : null) ?? o[lang] ?? o.en;
const strip = ({ key, ...o }) => o;
const builtAt = new Date().toISOString();
for (const [lang, dict] of Object.entries(DICTS)) {
  const db = {
    builtAt,
    items: Object.fromEntries(Object.entries(items).map(([id, it]) => [id, { ...strip(it), name: named_(it, lang, dict) }])),
    // s: short name for lists ("Лит P9" / "Lith P9")
    relics: Object.fromEntries(
      Object.entries(relics).map(([k, r]) => [
        k,
        { ...r, name: relicTemplate(dict).replace("|ERA|", eraName(dict, r.era)).replace("|CATEGORY|", r.cat), s: `${eraName(dict, r.era)} ${r.cat}` },
      ]),
    ),
    sets: Object.fromEntries(Object.entries(sets).map(([id, st]) => [id, { ...strip(st), name: named_(st, lang, dict) }])),
    projections,
    world: world(dict),
  };
  mkdirSync(`static/data/${lang}`, { recursive: true });
  writeFileSync(`static/data/${lang}/db.json`, JSON.stringify(db));
  // Market item id -> [slug, name, thumb, maxRank, subtypes, bulk]: the player's own orders (wfm.svelte.ts).
  const wfm = {};
  for (const x of wfmItems) {
    const own = x.tags?.includes("set") ? null : named[x.gameRef]?.name; // a set's gameRef is the item itself
    const name = (own && dict[own] ? unshout(dict[own]) : null) ?? (lang === "ru" ? wfmRu.get(x.id) : null) ?? x.i18n?.en?.name ?? x.slug;
    wfm[x.id] = [x.slug, name.replace(/<[^>]+>/g, ""), x.i18n?.en?.thumb ?? "", x.maxRank ?? 0, x.subtypes ?? 0, x.bulkTradable ? 1 : 0];
  }
  writeFileSync(`static/data/${lang}/wfm.json`, JSON.stringify(wfm));
  const v = vendor(dict);
  writeFileSync(`static/data/${lang}/vendor.json`, JSON.stringify(v));
  console.log(`${lang}: vendor names ${Object.keys(v.items).length}, size ${(JSON.stringify(v).length / 1024).toFixed(0)} KB`);
  console.log(
    `${lang}: items ${Object.keys(items).length}, relics ${Object.keys(relics).length}, sets ${Object.keys(sets).length}, ` +
    `nodes ${Object.keys(db.world.regions).length}, size ${(JSON.stringify(db).length / 1024).toFixed(0)} KB`,
  );
}
