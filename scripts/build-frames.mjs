// Builds static/data/frames.json: warframes, warframe mods/arcanes and builds.
// Stats/texts from WFCD @wfcd/items (MIT, has Russian i18n), icons/flags from Public Export Plus.
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
const ruI18n = read(`${WFCD}/i18n/ru.json`);
const peFrames = read(`${PE}/ExportWarframes.json`);
const peUpgrades = read(`${PE}/ExportUpgrades.json`);
const peArcanes = read(`${PE}/ExportArcanes.json`);
const pe = (f) => read(`${PE}/${f}`);
const wfComponents = new Map(read(`${WFCD}/Components.json`).map((c) => [c.uniqueName, c]));
const dictEn = pe("dict.en.json");
const dictRu = pe("dict.ru.json");
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

// ---------- Drop locations: "Sedna/Merrow (Assassination), Rotation C" -> Russian where the
// official dictionary knows the node / mission type; anything else stays in English.
const unshout = (s) => (s && s === s.toUpperCase() ? s[0] + s.slice(1).toLowerCase() : s);
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
const simarisRu = "Цефалон Симарис";
function dropLocation(loc) {
  let [, place, rot] = /^(.*?)(?:, Rotation ([A-C]))?$/.exec(loc);
  const m = /^([^/()]+)\/([^()]+?) \(([^()]+)\)$/.exec(place);
  if (m) {
    const node = nodeRu.get(`${m[1]}/${m[2]}`) ?? nodeByName.get(m[2]);
    const bounty = /^Level\s+(\d+) - (\d+) .*Bounty$/.exec(m[3]);
    const what = bounty ? `баунти ${bounty[1]}–${bounty[2]}` : (missionRu.get(m[3].toLowerCase()) ?? m[3]);
    if (node) place = `${node}, ${what}`;
  }
  place = place.replace(/^Cephalon Simaris, Complete (.+)$/, `${simarisRu}: после «$1»`);
  return rot ? `${place} · ротация ${rot}` : place;
}

// warframe.market slugs by gameRef (= our uniqueName), for the market page.
console.log("Fetching warframe.market items...");
const wfmRes = await fetch("https://api.warframe.market/v2/items");
if (!wfmRes.ok) throw new Error(`warframe.market ${wfmRes.status}`);
const wfm = new Map((await wfmRes.json()).data.filter((x) => x.gameRef).map((x) => [x.gameRef, x]));

// ---------- Warframes
const frames = {};
for (const f of wfFrames) {
  if (f.productCategory !== "Suits" || !f.uniqueName.startsWith("/Lotus/Powersuits/")) continue;
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
          return {
            ru: c.uniqueName.endsWith("Blueprint") ? "Чертёж" : (ruI18n[c.uniqueName]?.name ?? w?.name ?? "?"),
            drops: (w?.drops ?? [])
              .map((d) => ({ loc: dropLocation(d.location), chance: d.chance }))
              .sort((a, b) => b.chance - a.chance),
          };
        });
  frames[f.uniqueName] = {
    ru: ru.name ?? f.name,
    en: f.name,
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
    aura: f.aura ?? null,
    polarities: f.polarities ?? [],
    released: f.releaseDate ?? null,
    passive: clean(ru.passiveDescription ?? f.passiveDescription),
    abilities: (f.abilities ?? []).map((a) => {
      const r = ruAbilities.get(a.uniqueName);
      return {
        ru: r?.abilityName ?? a.name,
        en: a.name,
        desc: clean(r?.description ?? a.description),
        icon: img(pe.abilities?.find((x) => x.uniqueName === a.uniqueName)?.icon),
      };
    }),
  };
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
function parseFx(levels) {
  const fx = {};
  levels.forEach((lv, rank) => {
    for (const line of lv.stats ?? []) {
      for (const [re, key] of FX) {
        const m = re.exec(line.trim());
        if (m) (fx[key] ??= Array(levels.length).fill(0))[rank] = Number(m[1]);
      }
    }
  });
  return Object.keys(fx).length ? fx : undefined;
}

const sets = {};

// ---------- Mods usable on warframes: generic, aura, augments (compatName = frame name).
const frameCompat = new Set(wfFrames.map((f) => f.name.replace(/ Prime$/, "").toUpperCase()));
const mods = {};
for (const m of wfMods) {
  const pe = peUpgrades[m.uniqueName];
  if (!pe || m.isFrivolous) continue;
  const isAura = m.compatName === "AURA";
  const forFrames = m.type === "Warframe Mod" || isAura || frameCompat.has(m.compatName);
  if (!forFrames) continue;
  const ru = ruI18n[m.uniqueName] ?? {};
  const stats = ru.levelStats ?? m.levelStats ?? [];
  if (m.modSet && !sets[m.modSet]) {
    const ps = peModSets[m.modSet];
    sets[m.modSet] = { desc: clean(dictRu[ps?.description] ?? ""), n: ps?.numUpgradesInSet ?? 0, values: m.modSetValues ?? [] };
  }
  mods[m.uniqueName] = {
    ru: ru.name ?? m.name,
    en: m.name,
    icon: img(pe.icon),
    pol: POLARITY[pe.polarity] ?? m.polarity ?? "any",
    rarity: m.rarity, // Common | Uncommon | Rare | Legendary | Peculiar
    drain: m.baseDrain ?? 0,
    max: m.fusionLimit ?? 0,
    stats: clean((stats[stats.length - 1]?.stats ?? []).join("\n")),
    levels: stats.map((l) => clean((l.stats ?? []).join("\n"))),
    fx: parseFx(m.levelStats ?? []),
    set: m.modSet,
    aura: isAura || undefined,
    exilus: pe.isUtility || undefined,
    augment: m.isAugment && frameCompat.has(m.compatName) ? m.compatName : undefined,
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
    ru: ru.name ?? a.name,
    en: a.name,
    icon: img(pe.icon),
    rarity: a.rarity,
    max: stats.length - 1,
    stats: clean((stats[stats.length - 1]?.stats ?? []).join("\n")),
    levels: stats.map((l) => clean((l.stats ?? []).join("\n"))),
    wf: a.type === "Warframe Arcane" || a.type === "Arcane" || undefined,
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

mkdirSync("static/data", { recursive: true });
writeFileSync("static/data/frames.json", JSON.stringify({ frames, mods, arcanes, builds, sets }));
console.log(
  `frames ${Object.keys(frames).length}, mods ${Object.keys(mods).length}, arcanes ${Object.keys(arcanes).length}, ` +
  `builds ${Object.keys(builds).length}`,
);
