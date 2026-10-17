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
const wfcdRu = wf("i18n/ru.json");
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
// Junctions are shouted too, but each word is a name: "УЗЕЛ МЕРКУРИЯ" -> "Узел Меркурия".
const words = (s) => s?.toLowerCase().replace(/(^|\s)(\p{L})/gu, (_, a, c) => a + c.toUpperCase());
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
  if (pc === "OperatorAmps" || /\/OperatorAmplifiers\//.test(x.uniqueName)) return "amp";
  if (/\/Hoverboard\//.test(x.uniqueName)) return "kdrive";
  if (file === "Primary.json") return "primary";
  if (file === "Secondary.json" || file === "Misc.json") return "secondary"; // Misc: kitgun chambers
  if (file === "Melee.json") return "melee";
  return "other";
}
const FRAME_LIKE = new Set(["warframe", "necramech", "archwing", "companion", "modularcompanion", "kdrive"]);
// Modular gear levels by one part: the amp by its prism, the zaw by its strike, the kitgun by its chamber, the
// K-Drive by its board, the MOA / hound by its model. Some are not marked masterable by WFCD, so the ranked
// parts are added explicitly (the profile's XPInfo names that part).
const MODULAR = (id) =>
  /PvPVariant/.test(id) ? undefined
  : /OperatorAmplifiers\/.*\/Barrel\/|SentTrainingAmplifier\/.*Barrel/.test(id) ? "prism"
  : /ModularMelee[^/]*\/Tips?\//.test(id) ? "strike"
  : /InfKitGun\/Barrels\/|SUModular[^/]*\/Barrel\//.test(id) ? "chamber"
  : /Hoverboard\/.*Deck/.test(id) ? "board"
  : /MoaPetParts\/MoaPetHead|ZanukaPetParts\/ZanukaPetPartHead/.test(id) ? "model"
  : /CreaturePets\/.*(?:InfestedCatbrow|PredatorKubrow)PetPowerSuit/.test(id) ? "breed"
  : undefined;
// Two-in-one warframes are one masterable item: both halves gain affinity together, but the secondary son (Orion)
// gives no mastery (wiki "Sirius & Orion/Abilities"). WFCD still marks Orion masterable — it would sit in the list
// as a second, "never levelled" frame. Its XP is folded into the pair at runtime (mastery.ts foldPairs).
const HALVES = new Set(["/Lotus/Powersuits/SiriusOrion/OrionSuit"]);
// Copies the game uses for something else (the Grimoire of the Doppelganger): WFCD marks them masterable, so the
// list shows a second, never-levelled "Grimoire".
const COPY = /Doppelganger/;

const builtAt = new Date().toISOString();
for (const [LANG, D] of Object.entries({ ru, en })) {

const items = {};
const FILES = ["Warframes.json", "Primary.json", "Secondary.json", "Melee.json", "Archwing.json", "Arch-Gun.json",
  "Arch-Melee.json", "Sentinels.json", "Pets.json", "SentinelWeapons.json", "Misc.json"];
for (const file of FILES) {
  for (const x of wf(file)) {
    const modular = MODULAR(x.uniqueName);
    if (!(x.masterable || modular) || items[x.uniqueName] || HALVES.has(x.uniqueName) || COPY.test(x.uniqueName)) continue;
    const n = named[x.uniqueName];
    const cat = modular === "strike" ? "zaw"
      : modular === "chamber" ? "kitgun"
      : modular === "model" || modular === "breed" ? "modularcompanion"
      : category(file, x);
    items[x.uniqueName] = {
      ru: clean(unshout(n?.name && ru[n.name])) || clean(wfcdRu[x.uniqueName]?.name) || clean(x.name),
      en: clean((n?.name && en[n.name]) || x.name),
      name: clean(unshout(n?.name && D[n.name])) || (LANG === "ru" ? clean(wfcdRu[x.uniqueName]?.name) : null) || clean(x.name),
      icon: img(n?.icon) ?? (x.imageName ? `https://cdn.warframestat.us/img/${x.imageName}` : null),
      cat,
      fl: FRAME_LIKE.has(cat) || undefined,
      max: x.maxLevelCap ?? (cat === "necramech" ? 40 : 30), // WFCD has no cap for necramechs (they go to 40)
      mr: x.masteryReq || undefined,
      prime: x.isPrime || undefined,
      mod: modular,
    };
  }
}

// Star chart: nodes that give mastery (normal and again on the Steel Path) and junctions.
// DE's ExportRegions gives every junction masteryExp 0, but each junction grants 1000 mastery
// (wiki "Mastery Rank": "Each Junction completed grants 1,000 Mastery"), so junctions use that.
const JUNCTION_XP = 1000;
// Each node also carries its planet (`p`, DE's systemIndex), name and mission type for the «Звёздная карта» list.
const nodes = {};
const systems = {};
const chartNodes = {};
// Activity entry points are not star-chart completion missions.
const CHART_EXCLUDED_SYSTEMS = new Set([19, 24]);
const CHART_EXCLUDED_NODES = new Set(["CrewBattleNode556"]); // Free flight

for (const [tag, r] of Object.entries(regions)) {
  const isJ = r.missionType === "MT_JUNCTION";
  if (!CHART_EXCLUDED_SYSTEMS.has(r.systemIndex) && !CHART_EXCLUDED_NODES.has(tag) && (r.nodeType === 0 || r.nodeType === 4 || isJ) && r.name && r.systemName) {
    const chartSystem = r.systemIndex + (r.missionType === "MT_RAILJACK" ? 100 : 0);
    chartNodes[tag] = { xp: r.masteryExp || (isJ ? JUNCTION_XP : 0), ...(isJ ? { j: 1 } : {}), p: chartSystem, n: clean((isJ ? words : unshout)(D[r.name] ?? en[r.name] ?? tag)), m: clean(unshout(D[r.missionName] ?? en[r.missionName] ?? "")), unknownXp: !isJ && !r.masteryExp && r.missionType !== "MT_RAILJACK", sp: true };
    systems[chartSystem] ??= clean(D[r.systemName] ?? en[r.systemName] ?? String(r.systemIndex));
  }
  if (!isJ && !r.masteryExp) continue;
  nodes[tag] = { xp: r.masteryExp || JUNCTION_XP, ...(isJ ? { j: 1 } : {}), p: r.systemIndex, n: clean((isJ ? words : unshout)(D[r.name] ?? en[r.name] ?? tag)), m: clean(unshout(D[r.missionName] ?? en[r.missionName] ?? "")) };
  systems[r.systemIndex] ??= clean(D[r.systemName] ?? en[r.systemName] ?? String(r.systemIndex));
}

// Quests: DE's key chains (ExportKeys: name, description, stages, rewards). DE gives no quest order: the order
// and what unlocks what are the wiki's ("Quest", Quest Progression, ordered as in the Codex), by English name.
const QUEST_MAIN = ["Vor's Prize", "The Teacher", "Vox Solaris", "Once Awake", "Heart of Deimos", "The Archwing",
  "The Duviri Paradox", "Natah", "The Second Dream", "The War Within", "Rising Tide", "Chains of Harrow",
  "Apostasy Prologue", "The Sacrifice", "Chimera Prologue", "Erra", "The New War", "Whispers in the Walls", "The Lotus Eaters"];
const QUEST_AFTER = {
  "The Waverider": "Vox Solaris", "Stolen Dreams": "The Archwing", "The New Strange": "Stolen Dreams",
  "Octavia's Anthem": "The Second Dream", "The Silver Grove": "The Second Dream", "The Glast Gambit": "The War Within",
  "Angels of the Zariman": "The New War", "Veilbreaker": "The New War", "Jade Shadows": "The New War",
  "Jade Shadows: Constellations": "Jade Shadows", "The Hex": "The Lotus Eaters", "The Old Peace": "The Lotus Eaters",
};
const recipes = pe("ExportRecipes.json");
const keys = pe("ExportKeys.json");
const byEn = {};
for (const [id, k] of Object.entries(keys)) if (/KeyChain$/.test(id) && !k.excludeFromCodex && en[k.name]) byEn[clean(en[k.name])] = id;
// A reward as a name: the next quest, a blueprint (its result) or an item. Unnamed ones are left out.
const rewardOf = (r) => {
  const id = r.itemType.replace("/StoreItems/", "/");
  if (keys[id]) return { q: id };
  const res = recipes[id]?.resultType;
  const x = named[res ?? id];
  return x && D[x.name] ? { name: clean(unshout(D[x.name])), ...(res ? { bp: 1 } : {}) } : null;
};
const quests = [];
const order = [...QUEST_MAIN, ...Object.keys(QUEST_AFTER), ...Object.keys(byEn).filter((n) => !QUEST_MAIN.includes(n) && !QUEST_AFTER[n])];
for (const enName of order) {
  const id = byEn[enName];
  if (!id) { console.warn(`  quest not in ExportKeys: ${enName}`); continue; }
  const k = keys[id];
  const rw = (k.rewards ?? []).map(rewardOf).filter(Boolean);
  quests.push({
    id,
    name: clean(unshout(D[k.name] ?? en[k.name])),
    d: clean(D[k.description] ?? en[k.description] ?? "") || undefined,
    icon: img(k.icon),
    st: (k.chainStages ?? []).length,
    g: QUEST_MAIN.includes(enName) ? "main" : QUEST_AFTER[enName] ? "branch" : "side",
    after: QUEST_AFTER[enName] ? byEn[QUEST_AFTER[enName]] : undefined,
    rw: rw.length ? rw : undefined,
  });
}

mkdirSync(`static/data/${LANG}`, { recursive: true });
writeFileSync(`static/data/${LANG}/mastery.json`, JSON.stringify({ builtAt, items, nodes, chartNodes, systems, quests }));
const by = {};
for (const it of Object.values(items)) by[it.cat] = (by[it.cat] ?? 0) + 1;
console.log(`${LANG} mastery: ${Object.keys(items).length} items ${JSON.stringify(by)}, ${Object.keys(nodes).length} nodes, ${quests.length} quests`);

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
