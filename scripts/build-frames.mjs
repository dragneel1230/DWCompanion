// Builds static/data/<lang>/frames.json per interface language: warframes, warframe mods/arcanes and builds.
// Stats/texts from WFCD @wfcd/items (MIT, English base + Russian i18n), icons/flags from Public Export Plus.
// Records keep `ru` / `en` names (search, the Russian client's mod screen) and get `name` + texts in the file's language.
// Run: pnpm data
import { mkdirSync, readFileSync, writeFileSync, existsSync } from "node:fs";
import { createRequire } from "node:module";
import { resolve as resolvePath } from "node:path";

const read = (p) => JSON.parse(readFileSync(p, "utf8"));
const WFCD = "node_modules/@wfcd/items/data/json";
const PE = "node_modules/warframe-public-export-plus";

const wfFrames = read(`${WFCD}/Warframes.json`);
const wfMods = read(`${WFCD}/Mods.json`);
const wfArcanes = read(`${WFCD}/Arcanes.json`);
const ruI18nAll = read(`${WFCD}/i18n/ru.json`);
const peFrames = read(`${PE}/ExportWarframes.json`);
const peUpgrades = read(`${PE}/ExportUpgrades.json`);
const peArcanes = read(`${PE}/ExportArcanes.json`);
const pe = (f) => read(`${PE}/${f}`);
const wfComponents = new Map(read(`${WFCD}/Components.json`).map((c) => [c.uniqueName, c]));
const dictEn = pe("dict.en.json");
const dictRuAll = pe("dict.ru.json");
const peModSets = pe("ExportModSet.json");
// DE's own rank scaling (health/shield/energy/armor at rank 30), shipped with Public Export Plus.
const scaled = createRequire(import.meta.url)(resolvePath(PE, "supplementals/getScaledPowersuitValues.js"));

// Icons: DE's own CDN when ExportImages has a content hash (better quality), else the bare game
// path, which the app loads from browse.wf.
const images = pe("ExportImages.json");
const img = (path) => {
  const hash = path && images[path]?.contentHash;
  return hash ? `https://content.warframe.com/PublicExport${path}!${hash.replace(/\+/g, "%2B")}` : (path ?? null);
};


// Game rich-text markers like <DT_VIRAL_COLOR> and escaped newlines.
// Placeholders like |DURATION| have no values in the data, show them as "X". Drop duplicate lines.
const clean = (s) =>
  [...new Set((s ?? "").replace(/<[^>]+>/g, "").replace(/\\n/g, "\n").replace(/\|[A-Z_0-9]+\|/g, "X").split("\n"))]
    .join("\n")
    .trim();

const POLARITY = {
  AP_ATTACK: "madurai", AP_DEFENSE: "vazarin", AP_TACTIC: "naramon", AP_POWER: "zenurik",
  AP_PRECEPT: "penjaga", AP_WARD: "unairu", AP_UMBRA: "umbra", AP_UNIVERSAL: "any", AP_ANY: "any",
};

// warframe.market slugs by gameRef (= our uniqueName), for the market page.
console.log("Fetching warframe.market items...");
const wfmRes = await fetch("https://api.warframe.market/v2/items");
if (!wfmRes.ok) throw new Error(`warframe.market ${wfmRes.status}`);
const wfm = new Map((await wfmRes.json()).data.filter((x) => x.gameRef).map((x) => [x.gameRef, x]));

const unshout = (s) => (s && s === s.toUpperCase() ? s[0] + s.slice(1).toLowerCase() : s);
// Our own wording around DE's names, per language.
const GLUE = {
  ru: { bounty: "заказ", rotation: "ротация", simaris: "Цефалон Симарис: после «$1»", blueprint: "Чертёж" },
  en: { bounty: "bounty", rotation: "rotation", simaris: "Cephalon Simaris: after “$1”", blueprint: "Blueprint" },
};
// Ability numbers at max rank (wiki infoboxes, scripts/fetch-wiki-abilities.mjs) and Russian for their labels
// (data/ability-labels.ru.tsv). Missing file: abilities simply have no numbers.
const wikiAbilities = existsSync("data/wiki-abilities.json") ? read("data/wiki-abilities.json").abilities : {};
const labelRu = new Map(
  existsSync("data/ability-labels.ru.tsv")
    ? readFileSync("data/ability-labels.ru.tsv", "utf8").split(/\r?\n/).filter((l) => l && !l.startsWith("#")).map((l) => l.split("\t"))
    : [],
);
// Ability names the Russian labels keep in English ("снижение брони от Redline"): DE's Russian name instead.
const abilityRu = new Map();
for (const f of wfFrames)
  for (const a of f.abilities ?? []) {
    const r = (ruI18nAll[f.uniqueName]?.abilities ?? []).find((x) => x.abilityUniqueName === a.uniqueName);
    if (r?.abilityName && a.name) abilityRu.set(a.name, r.abilityName);
  }
const abilityNames = [...abilityRu.keys()].sort((a, b) => b.length - a.length);
// Energy cost: DE's own number (ExportWarframes abilities), the wiki's only when DE has none.
function abilityStats(uniqueName, LANG, deCost) {
  const w = wikiAbilities[uniqueName];
  if (!w) return undefined;
  const label = (l) => {
    if (!l || LANG !== "ru") return l || undefined;
    let r = labelRu.get(l) ?? l;
    for (const n of abilityNames) if (r.includes(n)) r = r.split(n).join(`«${abilityRu.get(n)}»`);
    return r;
  };
  const list = (xs) => xs.map((x) => ({ v: x.v, n: x.n, u: x.unit || undefined, l: label(x.label) }));
  return {
    cost: deCost || w.energy?.n, // DE has 0 for a few (Spores): the wiki then
    str: list(w.strength),
    dur: list(w.duration),
    rng: list(w.range),
    misc: list(w.misc),
    wiki: w.title,
  };
}

for (const LANG of ["ru", "en"]) {
const G = GLUE[LANG];
// Texts of the file's language: WFCD's Russian i18n for ru, its English base otherwise.
const ruI18n = LANG === "ru" ? ruI18nAll : {};
const dictRu = LANG === "ru" ? dictRuAll : dictEn;

// ---------- Drop locations: "Sedna/Merrow (Assassination), Rotation C" -> the file's language where the
// official dictionary knows the node / mission type; anything else stays in English.
const nodeRu = new Map();
for (const r of Object.values(pe("ExportRegions.json"))) {
  const en = dictEn[r.name], sys = dictEn[r.systemName];
  if (en && sys) nodeRu.set(`${sys}/${en}`, `${dictRu[r.name] ?? en} (${dictRu[r.systemName] ?? sys})`);
}
const missionRu = new Map();
for (const [key, en] of Object.entries(dictEn)) {
  if (key.startsWith("/Lotus/Language/Missions/MissionName_") && dictRu[key]) missionRu.set(en.toLowerCase(), unshout(dictRu[key]));
}
for (const mt of Object.values(pe("ExportMissionTypes.json"))) {
  if (dictEn[mt.name] && dictRu[mt.name]) missionRu.set(dictEn[mt.name].toLowerCase(), unshout(dictRu[mt.name]));
}
// Railjack drops name the planet ("Pluto/Fenton's Field") while the region says "Pluto Proxima".
const nodeByName = new Map([...nodeRu].map(([k, v]) => [k.split("/")[1], v]));
function dropLocation(loc) {
  let [, place, rot] = /^(.*?)(?:, Rotation ([A-C]))?$/.exec(loc);
  const m = /^([^/()]+)\/([^()]+?) \(([^()]+)\)$/.exec(place);
  if (m) {
    const node = nodeRu.get(`${m[1]}/${m[2]}`) ?? nodeByName.get(m[2]);
    const bounty = /^Level\s+(\d+) - (\d+) .*Bounty$/.exec(m[3]);
    const what = bounty ? `${G.bounty} ${bounty[1]}–${bounty[2]}` : (missionRu.get(m[3].toLowerCase()) ?? m[3]);
    if (node) place = `${node}, ${what}`;
  }
  place = place.replace(/^Cephalon Simaris, Complete (.+)$/, G.simaris);
  return rot ? `${place} · ${G.rotation} ${rot}` : place;
}

// ---------- Warframes
const frames = {};
// Two-in-one warframes: Sirius & Orion is two suits (Orion is a SpecialItem, modded on its own). Each gets
// the pair's name with its own half: "Сириус и Орион (Сириус)", "Сириус и Орион (Орион)".
const PAIRS = { "/Lotus/Powersuits/SiriusOrion/SiriusSuit": "/Lotus/Powersuits/SiriusOrion/SiriusSuit", "/Lotus/Powersuits/SiriusOrion/OrionSuit": "/Lotus/Powersuits/SiriusOrion/SiriusSuit" };
const half = (s) => s.split(/\s+(?:&|и|and)\s+/)[0];
// WFCD's "aura" polarity is DE's AP_ANY (universal); Jade has two aura slots (an array).
const wfPol = (p) => (p === "aura" ? "any" : p);
for (const f of wfFrames) {
  if ((f.productCategory !== "Suits" && !PAIRS[f.uniqueName]) || !f.uniqueName.startsWith("/Lotus/Powersuits/")) continue;
  const pe = peFrames[f.uniqueName];
  if (!pe) continue;
  const ru = ruI18n[f.uniqueName] ?? {};
  const ruAbilities = new Map((ru.abilities ?? []).map((a) => [a.abilityUniqueName, a]));
  const r30 = await scaled(f.uniqueName, 30);
  // Non-prime parts with drop sources; prime parts come from the relic db (sets) in the app.
  const parts = f.isPrime
    ? []
    : (f.components ?? [])
        .filter((c) => c.uniqueName.includes("/Recipes/"))
        .map((c) => {
          const w = wfComponents.get(c.uniqueName);
          const bp = c.uniqueName.endsWith("Blueprint");
          return {
            name: bp ? G.blueprint : (ruI18n[c.uniqueName]?.name ?? w?.name ?? "?"),
            bp: bp || undefined,
            drops: (w?.drops ?? [])
              .map((d) => ({ loc: dropLocation(d.location), chance: d.chance }))
              .sort((a, b) => b.chance - a.chance),
          };
        });
  frames[f.uniqueName] = {
    ru: ruI18nAll[f.uniqueName]?.name ?? f.name,
    en: f.name,
    name: ru.name ?? f.name,
    icon: img(pe.icon),
    prime: !!f.isPrime,
    health: f.health,
    shield: f.shield,
    armor: f.armor,
    energy: f.power,
    sprint: f.sprintSpeed,
    r30: { health: r30.health, shield: r30.shield, energy: r30.power, armor: r30.armor },
    desc: clean(ru.description ?? f.description),
    parts,
    bpCost: f.isPrime ? undefined : f.bpCost,
    aura: wfPol([f.aura ?? null].flat()[0]) ?? null,
    aura2: Array.isArray(f.aura) && f.aura[1] ? wfPol(f.aura[1]) : undefined,
    polarities: (f.polarities ?? []).map(wfPol),
    released: f.releaseDate ?? null,
    passive: clean(ru.passiveDescription ?? f.passiveDescription),
    abilities: (f.abilities ?? []).map((a) => {
      const r = ruAbilities.get(a.uniqueName);
      return {
        id: a.uniqueName, // Helminth: a config's AbilityOverride names the ability by it
        name: r?.abilityName ?? a.name,
        en: a.name,
        desc: clean(r?.description ?? a.description),
        icon: img(pe.abilities?.find((x) => x.uniqueName === a.uniqueName)?.icon),
        stats: abilityStats(a.uniqueName, LANG, pe.abilities?.find((x) => x.uniqueName === a.uniqueName)?.energyRequiredToActivate),
      };
    }),
  };
}

// Two-in-one: the pair's name + the own half, in each name field (DE names Orion "Orion & Sirius").
{
  const orig = Object.fromEntries(Object.keys(PAIRS).filter((id) => frames[id]).map((id) => [id, { ...frames[id] }]));
  for (const [id, pairId] of Object.entries(PAIRS)) {
    if (!frames[id] || !orig[pairId]) continue;
    for (const k of ["ru", "en", "name"]) frames[id][k] = `${orig[pairId][k]} (${half(orig[id][k])})`;
  }
}

// Numeric effects the stat panel understands, parsed from the English level texts.
const FX = [
  [/^([+-]?[\d.]+)% Ability Strength$/, "str"],
  [/^([+-]?[\d.]+)% Ability Duration$/, "dur"],
  [/^([+-]?[\d.]+)% Ability Range$/, "rng"],
  [/^([+-]?[\d.]+)% Ability Efficiency$/, "eff"],
  [/^([+-]?[\d.]+)% Health$/, "hp"],
  [/^([+-]?[\d.]+) Health$/, "hpFlat"],
  [/^([+-]?[\d.]+)% Shield Capacity$/, "sh"],
  [/^([+-]?[\d.]+) Shield Capacity$/, "shFlat"],
  [/^x([\d.]+) Max Shield Capacity$/, "shMul"],
  [/^([+-]?[\d.]+)% Armor$/, "arm"],
  [/^([+-]?[\d.]+)% Energy Max$/, "en"],
  [/^([+-]?[\d.]+)% Sprint Speed$/, "spd"],
];
// Weapon mods (gear.ts): damage types by DE's damage array index (0 Impact … 12 Corrosive) as "e<index>".
const DT_INDEX = { IMPACT: 0, PUNCTURE: 1, SLASH: 2, FIRE: 3, FREEZE: 4, ELECTRICITY: 5, POISON: 6, EXPLOSION: 7, RADIATION: 8, GAS: 9, MAGNETIC: 10, VIRAL: 11, CORROSIVE: 12 };
const WFX = [
  [/^([+-]?[\d.]+)% (?:Melee )?Damage$/, "dmg"],
  [/^([+-]?[\d.]+)% Multishot$/, "ms"],
  [/^([+-]?[\d.]+)% Critical Chance(?: \(x[\d.]+ for Heavy Attacks\))?$/, "cc"],
  [/^([+-]?[\d.]+)% Critical Damage$/, "cd"],
  [/^([+-]?[\d.]+)% Status Chance$/, "sc"],
  [/^([+-]?[\d.]+)% (?:Fire Rate|Attack Speed)$/, "fr"],
  [/^([+-]?[\d.]+)% Magazine Capacity$/, "mag"],
  [/^([+-]?[\d.]+)% Reload Speed$/, "rel"],
  [/^([+-]?[\d.]+)% Status Duration$/, "sd"],
  [/^\+([\d.]+) (?:Melee )?Range$/, "range"],
  [/^\+([\d.]+) Punch Through$/, "pt"],
];
// One rank's numbers. Lines after a condition header ("On Kill:") are conditional: they go to `cond`, at full
// stacks ("Stacks up to 5x" multiplies, "Stacks up to 480%" is the cap); chance-based procs are left out.
// A line under a header that is also a rank's own entry (arcanes repeat "+30% Reload Speed") is unconditional.
const STACKS = /\.?\s*(?:Stacks up to ([\d.]+)(x|%)|\(Maximum ([\d.]+) stacks\)).*$/i;
function matchFx(line, table) {
  const el = /^([+-]?[\d.]+)% <DT_([A-Z]+)_COLOR>\s*[A-Za-z]+$/.exec(line);
  if (el && DT_INDEX[el[2]] != null) return [`e${DT_INDEX[el[2]]}`, Number(el[1])];
  for (const [re, key] of table) {
    const m = re.exec(line);
    if (m) return [key, Number(m[1])];
  }
  return null;
}
function lineFx(text, table, out, cond, own) {
  let inCond = false;
  for (const raw of text.split(/\\n|\r?\n/)) {
    const line = raw.trim();
    if (!line) continue;
    if (line.endsWith(":")) {
      inCond = true;
      continue;
    }
    if (!inCond || own.has(line)) {
      const bow = /^([+-]?[\d.]+)% Fire Rate \(x([\d.]+) for Bows\)$/.exec(line);
      if (bow) {
        out.fr = Number(bow[1]);
        out.frb = Number(bow[1]) * Number(bow[2]);
        continue;
      }
      const hit = matchFx(line, table);
      if (hit) out[hit[0]] = hit[1];
      continue;
    }
    if (/chance (?:for|to)/i.test(line)) continue;
    const st = STACKS.exec(line);
    const body = line.replace(STACKS, "").replace(/\s+for [\d.]+s\.?$/, "").replace(/\s+when Aiming$/, "").replace(/\.$/, "");
    const hit = matchFx(body, table);
    if (!hit) continue;
    const [key, v] = hit;
    const total = st?.[2] === "%" ? Number(st[1]) : v * Number(st?.[1] ?? st?.[3] ?? 1);
    cond[key] = (cond[key] ?? 0) + total;
  }
}
// Per-rank arrays: `fx` unconditional, `cfx` conditional (at full stacks).
function parseFx(levels, table = FX) {
  const fx = {};
  const cfx = {};
  levels.forEach((lv, rank) => {
    const one = {};
    const cond = {};
    const own = new Set((lv.stats ?? []).map((x) => x.trim()));
    for (const text of lv.stats ?? []) lineFx(text, table, one, cond, own);
    for (const [key, v] of Object.entries(one)) (fx[key] ??= Array(levels.length).fill(0))[rank] = v;
    for (const [key, v] of Object.entries(cond)) (cfx[key] ??= Array(levels.length).fill(0))[rank] = v;
  });
  return { fx: Object.keys(fx).length ? fx : undefined, cfx: Object.keys(cfx).length ? cfx : undefined };
}

const sets = {};

// ---------- Mods usable on warframes: generic, aura, augments (compatName = frame name).
const frameCompat = new Set(wfFrames.map((f) => f.name.replace(/ Prime$/, "").toUpperCase()));
const mods = {};
// The rest (weapon, companion, archwing mods, stances): own file, loaded lazily (Baro's stock, the hub's detail panel).
const otherMods = {};
for (const m of wfMods) {
  const pe = peUpgrades[m.uniqueName];
  if (!pe || m.isFrivolous) continue;
  const isAura = m.compatName === "AURA";
  const compat = m.compatName?.toUpperCase(); // WFCD writes most in caps, a few not ("Jade")
  const forFrames = m.type === "Warframe Mod" || isAura || frameCompat.has(compat);
  if (!forFrames) {
    if (m.type === "Focus Way" || m.type.includes("Riven")) continue;
    otherMods[m.uniqueName] = {
      ...modRow(m, pe),
      ...parseFx(m.levelStats ?? [], [...WFX, ...FX]),
      cat: pe.type,
      // Which gear it fits (gear.ts fits()): DE's class + family tags, exilus / stance slot.
      compat: pe.compat,
      tags: pe.compatibilityTags?.length ? pe.compatibilityTags : undefined,
      exilus: pe.isUtility || undefined,
      stance: pe.type === "STANCE" || undefined,
    };
    continue;
  }
  mods[m.uniqueName] = {
    ...modRow(m, pe),
    aura: isAura || undefined,
    exilus: pe.isUtility || undefined,
    augment: m.isAugment && frameCompat.has(compat) ? compat : undefined,
  };
}

function modRow(m, pe) {
  const ru = ruI18n[m.uniqueName] ?? {};
  const stats = ru.levelStats ?? m.levelStats ?? [];
  if (m.modSet && !sets[m.modSet]) {
    const ps = peModSets[m.modSet];
    sets[m.modSet] = { desc: clean(dictRu[ps?.description] ?? ""), n: ps?.numUpgradesInSet ?? 0, values: m.modSetValues ?? [] };
  }
  return {
    ru: ruI18nAll[m.uniqueName]?.name ?? m.name,
    en: m.name,
    name: ru.name ?? m.name,
    icon: img(pe.icon),
    pol: POLARITY[pe.polarity] ?? m.polarity ?? "any",
    rarity: m.rarity, // Common | Uncommon | Rare | Legendary | Peculiar
    // Own in-game frame: Galvanized (Steel Path, Arbitrations) and Amalgam mods (DE's icon / id folders).
    fr: /\/Galvanized\//.test(pe.icon ?? "") ? "Galvanized" : /\/DualSource\//.test(m.uniqueName) ? "Amalgam" : undefined,
    drain: m.baseDrain ?? 0,
    max: m.fusionLimit ?? 0,
    stats: clean((stats[stats.length - 1]?.stats ?? []).join("\n")),
    levels: stats.map((l) => clean((l.stats ?? []).join("\n"))),
    ...parseFx(m.levelStats ?? []),
    set: m.modSet,
    slug: wfm.get(m.uniqueName)?.slug,
    mname: wfm.get(m.uniqueName)?.i18n?.en?.name,
  };
}

const arcanes = {};
for (const a of wfArcanes) {
  const pe = peArcanes[a.uniqueName];
  if (!pe || pe.excludeFromCodex) continue;
  const ru = ruI18n[a.uniqueName] ?? {};
  const stats = ru.levelStats ?? a.levelStats ?? [];
  arcanes[a.uniqueName] = {
    ru: ruI18nAll[a.uniqueName]?.name ?? a.name,
    en: a.name,
    name: ru.name ?? a.name,
    icon: img(pe.icon),
    rarity: a.rarity,
    max: stats.length - 1,
    stats: clean((stats[stats.length - 1]?.stats ?? []).join("\n")),
    levels: stats.map((l) => clean((l.stats ?? []).join("\n"))),
    ...parseFx(a.levelStats ?? [], [...WFX, ...FX]),
    wf: a.type === "Warframe Arcane" || a.type === "Arcane" || undefined,
    // Weapon arcanes: the weapon slot (gear.ts), and the only primary kind for the Bow / Shotgun ones.
    use: { "Primary Arcane": "primary", "Bow Arcane": "primary", "Shotgun Arcane": "primary", "Secondary Arcane": "secondary", "Melee Arcane": "melee" }[a.type],
    only: { "Bow Arcane": "Bow", "Shotgun Arcane": "Shotgun" }[a.type],
    slug: wfm.get(a.uniqueName)?.slug,
    mname: wfm.get(a.uniqueName)?.i18n?.en?.name,
  };
}

// ---------- Builds: human-written seeds reference things by English name; resolve and validate.
const byEn = (table) => {
  const m = new Map();
  for (const [id, v] of Object.entries(table)) if (!m.has(v.en)) m.set(v.en, id);
  return m;
};
const frameByEn = byEn(frames);
const modByEn = byEn(mods);
const arcaneByEn = byEn(arcanes);

function resolve(map, name, what, buildId) {
  if (name == null) return null;
  const id = map.get(name);
  if (!id) throw new Error(`build ${buildId}: unknown ${what} "${name}"`);
  return id;
}

const builds = {};
const seedFile = "data/builds.json";
if (existsSync(seedFile)) {
  for (const b of read(seedFile)) {
    const mod = (name) => resolve(modByEn, name, "mod", b.id);
    builds[b.id] = {
      frame: resolve(frameByEn, b.frame, "frame", b.id),
      title: b.title,
      author: b.author,
      votes: b.votes ?? 0,
      demo: b.demo || undefined,
      note: b.note ?? "",
      tags: b.tags ?? [],
      aura: mod(b.aura),
      exilus: mod(b.exilus),
      slots: b.slots.map(mod),
      arcanes: (b.arcanes ?? []).map((n) => resolve(arcaneByEn, n, "arcane", b.id)),
    };
  }
}

// ---------- Archon shards: DE's names and icons per colour (inventory colour code -> loose shard item).
// Bonuses and their numbers are not in the export: src/lib/shards.ts (from the wiki).
const resources = pe("ExportResources.json");
const SHARD_ITEMS = { ACC_RED: "Amar", ACC_YELLOW: "Nira", ACC_BLUE: "Boreal", ACC_PURPLE: "Violet", ACC_ORANGE: "Orange", ACC_GREEN: "Green" };
const shards = {};
for (const [code, key] of Object.entries(SHARD_ITEMS)) {
  for (const t of [false, true]) {
    const item = `/Lotus/Types/Gameplay/NarmerSorties/ArchonCrystal${key}${t ? "Mythic" : ""}`;
    const r = resources[item];
    if (!r) throw new Error(`archon shard ${item} missing`);
    shards[t ? `${code}_MYTHIC` : code] = { item, name: (dictRu[r.name] ?? dictEn[r.name]).replace(/<[^>]+>\s*/g, "").trim(), icon: img(r.icon) };
  }
}

// ---------- Helminth's own abilities (a frame's ability subsumed elsewhere is found in `frames`).
const helminth = {};
for (const [id, a] of Object.entries(pe("ExportAbilities.json"))) {
  if (!/Helminth[^/]*Ability$/.test(id)) continue;
  const name = dictRu[a.name] ?? dictEn[a.name];
  if (!name) continue;
  const desc = dictRu[a.description] ?? dictEn[a.description];
  helminth[id] = {
    id,
    name: unshout(name),
    en: unshout(dictEn[a.name] ?? name),
    desc: desc ? clean(desc) : "",
    icon: img(a.icon),
    stats: abilityStats(id, LANG, a.energyRequiredToActivate),
  };
}

// ---------- Helminth's foundry (src/lib/ship/helminth.ts): secretions, what subsuming each warframe gives
// and costs (ExportRecipes "AbilityOverrides": result = the ability; secret ingredients = the warframe + the
// subsume cost; ingredients = the cost of each injection). Counts are tenths of a percent, as in the inventory.
// `base`: warframe -> its base suit (DE's parentName), how the weekly Invigoration offers name warframes.
const peRecipes = pe("ExportRecipes.json");
const secretions = {};
for (const [id, r] of Object.entries(resources)) {
  if (!id.startsWith("/Lotus/Types/Items/InfestedFoundry/Helminth") || !/Secretion/.test(r.name)) continue;
  secretions[id] = { name: unshout(dictRu[r.name] ?? dictEn[r.name] ?? id.split("/").pop()), icon: img(r.icon) };
}
const pairs = (list) => (list ?? []).filter((x) => secretions[x.ItemType]).map((x) => [x.ItemType, x.ItemCount]);
const subsume = {};
for (const [id, r] of Object.entries(peRecipes)) {
  if (!id.includes("/AbilityOverrides/") || r.secretIngredientAction !== "SIA_WARFRAME_ABILITY") continue;
  const frame = r.secretIngredients?.find((x) => x.ItemType.startsWith("/Lotus/Powersuits/"))?.ItemType;
  if (!frame) continue;
  subsume[frame] = { ab: r.resultType, cost: pairs(r.secretIngredients), inject: pairs(r.ingredients), time: r.buildTime };
}
const base = {};
for (const [id, f] of Object.entries(peFrames)) if (f.productCategory === "Suits" && f.parentName) base[id] = f.parentName;
const infest = { secretions, subsume, base };

mkdirSync(`static/data/${LANG}`, { recursive: true });
writeFileSync(`static/data/${LANG}/frames.json`, JSON.stringify({ frames, mods, arcanes, builds, sets, shards, helminth, infest }));
writeFileSync(`static/data/${LANG}/mods.json`, JSON.stringify({ mods: otherMods }));
console.log(`${LANG}: other mods ${Object.keys(otherMods).length}, size ${(JSON.stringify(otherMods).length / 1024).toFixed(0)} KB`);
console.log(
  `${LANG}: frames ${Object.keys(frames).length}, mods ${Object.keys(mods).length}, arcanes ${Object.keys(arcanes).length}, ` +
  `builds ${Object.keys(builds).length}`,
);
}
