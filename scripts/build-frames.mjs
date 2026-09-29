// Builds static/data/frames.json: warframes, warframe mods/arcanes and builds.
// Stats/texts from WFCD @wfcd/items (MIT, has Russian i18n), icons/flags from Public Export Plus.
// Run: pnpm data
import { mkdirSync, readFileSync, writeFileSync, existsSync } from "node:fs";

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

// ---------- Warframes
const frames = {};
for (const f of wfFrames) {
  if (f.productCategory !== "Suits" || !f.uniqueName.startsWith("/Lotus/Powersuits/")) continue;
  const pe = peFrames[f.uniqueName];
  if (!pe) continue;
  const ru = ruI18n[f.uniqueName] ?? {};
  const ruAbilities = new Map((ru.abilities ?? []).map((a) => [a.abilityUniqueName, a]));
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
  mods[m.uniqueName] = {
    ru: ru.name ?? m.name,
    en: m.name,
    icon: img(pe.icon),
    pol: POLARITY[pe.polarity] ?? m.polarity ?? "any",
    rarity: m.rarity, // Common | Uncommon | Rare | Legendary | Peculiar
    drain: m.baseDrain ?? 0,
    max: m.fusionLimit ?? 0,
    stats: clean((stats[stats.length - 1]?.stats ?? []).join("\n")),
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
writeFileSync("static/data/frames.json", JSON.stringify({ frames, mods, arcanes, builds }));
console.log(
  `frames ${Object.keys(frames).length}, mods ${Object.keys(mods).length}, arcanes ${Object.keys(arcanes).length}, ` +
  `builds ${Object.keys(builds).length}`,
);
