// Where things drop: relics and resources. Output: static/data/<lang>/drops.json and craft.json per
// interface language (loaded lazily by the Resources tab and relic pages). Run first in `pnpm data`:
// build-data.mjs reads which relics drop now.
//
// Sources (both DE's own):
// - Official drop tables https://www.warframe.com/droptables (HTML): missions with rotations,
//   dynamic locations, bounties, enemy/container drops. English names; translated here with DE's
//   dictionaries (dict.en -> the file's language) and ExportRegions. Cached in data/droptables.html for offline builds.
//   (WFCD's packaged copy was checked on 2026-09-30 and is stale: 34 relics vs. 35 on the site, other lists.)
// - Planet resources (what enemies and containers drop on each planet) from DE's ExportSystems.
// Plus players' advice, kept apart and labelled: recommended farming nodes from the wiki
// (data/wiki-farming.json, fetched by scripts/fetch-wiki-farming.mjs).
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";

const PE_DIR = "node_modules/warframe-public-export-plus";
const pe = (f) => JSON.parse(readFileSync(`${PE_DIR}/${f}`, "utf8"));

const en = pe("dict.en.json");
const ru = pe("dict.ru.json");
const regions = pe("ExportRegions.json");
const systems = pe("ExportSystems.json");
const missionTypes = pe("ExportMissionTypes.json");
const factions = pe("ExportFactions.json");
const resources = pe("ExportResources.json");
const upgrades = pe("ExportUpgrades.json"); // mods
const arcanes = pe("ExportArcanes.json");
const nightwave = pe("ExportNightwave.json");
const enemyFaction = new Map(); // English enemy name -> faction ("Corpus", "Infestation"…)
for (const v of Object.values(pe("ExportEnemies.json").avatars)) if (en[v.name] && !enemyFaction.has(en[v.name])) enemyFaction.set(en[v.name], v.faction);
const images = pe("ExportImages.json");
const img = (path) => {
  const hash = path && images[path]?.contentHash;
  return hash ? `https://content.warframe.com/PublicExport${path}!${hash.replace(/\+/g, "%2B")}` : (path ?? null);
};
const unshout = (s) => (s && s === s.toUpperCase() && /[a-zа-я]/i.test(s) ? s[0] + s.slice(1).toLowerCase() : s);
const DICTS = { ru, en };
// Our own wording around DE's names, per language.
const GLUE = {
  ru: {
    bounty: "Заказ", lvl: "ур.", extra: "доп. награда", event: "событие", dark: "Тёмный сектор",
    mode: { caches: "Тайники", conclave: "Конклав", archwing: "Арчвинг", sharkwing: "Акулье крыло" },
    circuit: (n) => `Цепь, уровень ${n}`,
    words: { "duviri circuit": "Цепь (Дувири)", "zariman ten zero": "Зариман", hard: "Стальной путь", normal: "Обычный", relay: "Реле", camp: "Лагерь Скитальца", chipper: "Чиппер", ascension: "режим «Вознесение»", arbitration: "Почести Арбитража" },
    quest: (q) => `локация квеста «${q}»`,
  },
  en: {
    bounty: "Bounty", lvl: "lvl", extra: "extra reward", event: "event", dark: "Dark Sector",
    mode: { caches: "Caches", conclave: "Conclave", archwing: "Archwing", sharkwing: "Sharkwing" },
    circuit: (n) => `The Circuit, tier ${n}`,
    words: { "duviri circuit": "The Circuit (Duviri)", "zariman ten zero": "Zariman", hard: "Steel Path", normal: "Normal", relay: "Relay", camp: "Drifter's Camp", chipper: "Chipper", ascension: "Ascension mode", arbitration: "Arbitration Honors" },
    quest: (q) => `${q} quest area`,
  },
};
let D = ru; // dictionary of the language being built (set in the loop below)
let G = GLUE.ru;
const tr = (key) => D[key] ?? en[key] ?? null;
// DE markup in names/descriptions: "<RETRO_TM>" -> "™", other tags dropped.
const clean = (s) => (s ?? "").replace(/<RETRO_TM>/g, "™").replace(/<[^>]+>/g, "").trim();

// ---- drop tables page
const CACHE = "data/droptables.html";
let html;
try {
  console.log("Fetching warframe.com/droptables...");
  const res = await fetch("https://www.warframe.com/droptables");
  if (!res.ok) throw new Error(String(res.status));
  html = await res.text();
  writeFileSync(CACHE, html);
} catch (e) {
  if (!existsSync(CACHE)) throw e;
  console.log(`  offline (${e.message}), using ${CACHE}`);
  html = readFileSync(CACHE, "utf8");
}

const decode = (s) =>
  s.replace(/<[^>]+>/g, "").replace(/&amp;/g, "&").replace(/&#39;|&apos;/g, "'").replace(/&quot;/g, '"').replace(/\s+/g, " ").trim();

// Rows of one section as [{th: [...], td: [...]}].
function section(id) {
  const start = html.indexOf(`id="${id}"`);
  if (start < 0) return [];
  const end = html.indexOf("<h3", start + 10);
  const body = html.slice(start, end < 0 ? undefined : end);
  return [...body.matchAll(/<tr[^>]*>(.*?)<\/tr>/gs)].map((m) => ({
    th: [...m[1].matchAll(/<th[^>]*>(.*?)<\/th>/gs)].map((x) => decode(x[1])),
    td: [...m[1].matchAll(/<td[^>]*>(.*?)<\/td>/gs)].map((x) => decode(x[1])).filter(Boolean),
  }));
}

// "Uncommon (11.06%)" -> 11.06
const pct = (s) => Number(s?.match(/\(([\d.]+)%\)/)?.[1] ?? s?.match(/([\d.]+)%/)?.[1] ?? NaN);
// "100X Oxium" -> Oxium (quantity kept apart), "Lith S18 Relic" stays.
const itemName = (s) => s.replace(/^[\d,]+X /, "");
const qtyOf = (s) => Number(s.match(/^([\d,]+)X /)?.[1].replace(/,/g, "") ?? 1);
// "Mercury/Apollodorus (Survival)" -> "survival"
const modeOf = (place) => place.match(/\(([^)]+)\)(?: Extra)?$/)?.[1].toLowerCase() ?? "";

// Every drop: { item (English name), place, mode, rot, chance, qty, kind }.
const drops = [];

// Missions: "Mercury/Apollodorus (Survival)" then optional "Rotation A".
for (const id of ["missionRewards", "transientRewards", "sortieRewards", "keyRewards"]) {
  let place = null;
  let rot = "";
  for (const r of section(id)) {
    if (r.th.length && !r.td.length) {
      const t = r.th[0];
      if (/^Rotation [A-Z]$/.test(t)) rot = t.slice(-1);
      else (place = t), (rot = "");
    } else if (r.th.length && /^Rotation [A-Z]$/.test(r.th[0])) {
      rot = r.th[0].slice(-1); // transientRewards: <th>Rotation A</th><td></td>
    } else if (place && r.td.length >= 2) {
      drops.push({
        item: itemName(r.td[0]), place, mode: modeOf(place), rot, chance: pct(r.td[1]), qty: qtyOf(r.td[0]),
        kind: id === "missionRewards" ? "mission" : "other",
      });
    }
  }
}

// Bounties: "Level 5 - 15 Cetus Bounty", "Rotation A", "Stage 1" ... Best chance over stages per rotation.
const BOUNTY_PLACE = {
  cetusRewards: "Cetus", solarisRewards: "Orb Vallis", deimosRewards: "Cambion Drift",
  zarimanRewards: "Zariman Ten Zero", entratiLabRewards: "Sanctum Anatomica", hexRewards: "Höllvania",
};
for (const [id, where] of Object.entries(BOUNTY_PLACE)) {
  let head = null;
  let rot = "";
  for (const r of section(id)) {
    const t = r.th[0];
    if (t && /^Level/.test(t)) (head = t), (rot = "");
    else if (t && /^Rotation [A-Z]$/.test(t)) rot = t.slice(-1);
    else if (head && !r.th.length && r.td.length >= 2) {
      drops.push({ item: itemName(r.td[0]), place: `${where}|${head}`, rot, chance: pct(r.td[1]), qty: qtyOf(r.td[0]), kind: "bounty" });
    }
  }
}

// By source (enemies, containers): chance per kill = drop chance x item chance.
for (const id of ["resourceByAvatar", "relicByAvatar", "blueprintByAvatar"]) {
  let src = null;
  let dropChance = 0;
  for (const r of section(id)) {
    if (r.th.length >= 2) (src = r.th[0]), (dropChance = pct(r.th[1]));
    else if (src && r.td.length >= 2 && r.td[0] !== "Region Resource") {
      drops.push({ item: itemName(r.td[0]), place: src, rot: "", chance: (dropChance * pct(r.td[1])) / 100, qty: qtyOf(r.td[0]), kind: "enemy" });
    }
  }
}

// Mods and arcanes by enemy ("Mod Drops by Source"): kept apart, they only feed the mods' own sources.
const modRows = [];
{
  let src = null;
  let dropChance = 0;
  for (const r of section("modByAvatar")) {
    if (r.th.length >= 2) (src = r.th[0]), (dropChance = pct(r.th[1]));
    else if (src && r.td.length >= 2) modRows.push({ item: itemName(r.td[0]), place: src, rot: "", chance: (dropChance * pct(r.td[1])) / 100, qty: 1, kind: "enemy" });
  }
}
const modByItem = new Map();
for (const d of modRows) {
  if (!Number.isFinite(d.chance)) continue;
  const k = d.item.toLowerCase();
  modByItem.set(k, [...(modByItem.get(k) ?? []), d]);
}

const builtAt = new Date().toISOString();
for (const [LANG, dict] of Object.entries(DICTS)) {
D = dict;
G = GLUE[LANG];

// ---- translation of places (English names of the drop tables -> the file's language)
const enToRu = new Map();
for (const [k, v] of Object.entries(en)) {
  if (typeof v !== "string" || v.length > 60 || !D[k]) continue;
  const key = v.toLowerCase();
  if (!enToRu.has(key)) enToRu.set(key, unshout(D[k]));
}
const ruOf = (s) => enToRu.get(s.toLowerCase().trim()) ?? null;
const ruOfX = (s) => EXTRA_RU[s.toLowerCase().trim()] ?? ruOf(s);

const regionByName = new Map();
for (const [key, r] of Object.entries(regions)) {
  const node = en[r.name];
  const sys = en[r.systemName];
  if (node && sys) regionByName.set(`${sys}/${node}`.toLowerCase(), key);
}
const missionRu = new Map();
for (const mt of Object.values(missionTypes)) if (en[mt.name]) missionRu.set(en[mt.name].toLowerCase(), unshout(tr(mt.name)));
const MODE_RU = G.mode;
// Names DE's dictionary has no whole string for (our wording, not the client's).
const EXTRA_RU = {
  ...Object.fromEntries([1, 2, 3, 4, 5, 6, 7].map((n) => [`endless: tier ${n}`, G.circuit(n)])), // Duviri "The Circuit"
  ...G.words,
};
const modeRu = (m) => {
  const dark = m.match(/^Dark Sector (.+)$/i);
  if (dark) return `${modeRu(dark[1])} (${G.dark})`;
  return MODE_RU[m.toLowerCase()] ?? missionRu.get(m.toLowerCase()) ?? ruOf(m) ?? m;
};

const unknown = new Map();
// English names are the drop tables' own: only other languages can miss a translation.
const miss = (s) => LANG !== "en" && unknown.set(s, (unknown.get(s) ?? 0) + 1);

function place(d) {
  if (d.kind === "bounty") {
    const [where, head] = d.place.split("|");
    const m = head.match(/^Level\s+(\d+)\s*-\s*(\d+)\s*(.*)$/);
    const what = m?.[3] ?? "";
    const event = what && !/bounty/i.test(what);
    const w = ruOfX(where) ?? where;
    if (w === where) miss(where);
    return { kind: "bounty", name: w, sub: `${event ? ruOf(what) ?? what : G.bounty}, ${G.lvl} ${m?.[1]}–${m?.[2]}` };
  }
  // "Saturn/Annihilation (Conclave) Extra" — the extra reward of the same node.
  const extra = / Extra$/.test(d.place);
  const m = d.place.replace(/ Extra$/, "").match(/^([^/(]+)\/(.+?)(?: \((.+)\))?$/);
  if (m) {
    const [, planet, node, mode] = m;
    // Conclave and event nodes are not farmable at will: never "the best place" among missions.
    const kind = /conclave/i.test(mode ?? "") || /^Event:/i.test(planet) ? "other" : d.kind;
    const r = placeOf(planet, node, mode, kind);
    return extra ? { ...r, sub: [r.sub, G.extra].filter(Boolean).join(" · ") } : r;
  }
  const lvl = d.place.match(/^(.*?) \((.+)\)$/);
  const name = lvl ? lvl[1] : d.place;
  const n = ruOfX(name);
  if (!n) miss(name);
  // Demolishers spawn only in Disruption missions of their faction: say where to meet them.
  const at = d.kind === "enemy" ? disruptionNodes(name) : undefined;
  if (at) return { kind: d.kind, name: n ?? name, sub: `${modeRu("Disruption")} · ${at.fac}`, at: at.nodes };
  return { kind: d.kind, name: n ?? name, sub: lvl ? (ruOf(lvl[2]) ?? lvl[2]) : undefined };
}

// "Demolisher Boiler" -> its faction (ExportEnemies) -> Disruption nodes of that faction, lowest level first.
function disruptionNodes(enemyEn) {
  if (!/^Demolisher /.test(enemyEn)) return undefined;
  const fc = { Corpus: "FC_CORPUS", Grineer: "FC_GRINEER", Infestation: "FC_INFESTATION" }[enemyFaction.get(enemyEn)];
  if (!fc) return undefined;
  const nodes = Object.values(regions)
    .filter((r) => r.missionType === "MT_ARTIFACT" && r.faction === fc && !r.hidden)
    .sort((a, b) => (a.minEnemyLevel ?? 0) - (b.minEnemyLevel ?? 0))
    .slice(0, 3)
    .map((r) => `${tr(r.name)} (${tr(r.systemName)}) ${G.lvl} ${r.minEnemyLevel}–${r.maxEnemyLevel}`);
  return nodes.length ? { fac: unshout(tr(factions[fc]?.name ?? "")), nodes } : undefined;
}

function placeOf(planet, node, mode, kind) {
  const reg = regionByName.get(`${planet}/${node}`.toLowerCase());
  if (reg) {
    const r0 = regions[reg];
    const fac = unshout(tr(factions[r0.faction]?.name ?? ""));
    return { kind, name: `${tr(r0.name)} (${tr(r0.systemName)})`, sub: [mode ? modeRu(mode) : unshout(tr(r0.missionName)), fac].filter(Boolean).join(" · "), node: reg };
  }
  const n = ruOfX(node) ?? node;
  if (n === node) miss(node);
  const ev = planet.match(/^Event:\s*(.+)$/);
  const pl = ev ? `${G.event}, ${ruOf(ev[1]) ?? ev[1]}` : (ruOf(planet) ?? planet);
  return { kind, name: `${n} (${pl})`, sub: mode ? (EXTRA_RU[mode.toLowerCase()] ?? modeRu(mode)) : undefined };
}

// Sources are shared by many drops: stored once, referenced by index.
const sources = [];
const sourceIdx = new Map();
function sourceOf(d) {
  const p = place(d);
  const key = `${p.kind}|${p.name}|${p.sub ?? ""}`;
  if (!sourceIdx.has(key)) {
    sourceIdx.set(key, sources.length);
    sources.push(p);
  }
  return sourceIdx.get(key);
}

// How fast a mission pays, for "≈ per hour" (rough minutes for a normal squad).
// Endless: minutes per rotation; rewards go A, A, B, C and repeat.
const ENDLESS_MIN = {
  survival: 5, defense: 4, "shrine defense": 4, excavation: 3, interception: 3.5, disruption: 2.5,
  "infested salvage": 4, defection: 4, "void flood": 3, "void cascade": 3, "void armageddon": 3, alchemy: 3,
  "legacyte harvest": 4, ascension: 4, arena: 3, "the circuit": 5, "sanctuary onslaught": 4,
};
// One reward per mission, its rotation set by progress (vaults, caches): best rotation counts.
const PROGRESS_MIN = { spy: 4, caches: 5, skirmish: 8, "the perita rebellion": 8 };
// One reward per mission.
const SINGLE_MIN = { capture: 2, exterminate: 3, assassination: 5, rescue: 3, "mobile defense": 5, sabotage: 4, rush: 4, pursuit: 3 };

// Expected pieces per hour from one mission node; rots = [[rotation, chance %, qty]].
function perHour(mode, rots) {
  const y = (r) => rots.filter((x) => x[0] === r).reduce((m, x) => Math.max(m, (x[1] / 100) * x[2]), 0);
  const any = Math.max(...rots.map((x) => (x[1] / 100) * x[2]));
  if (PROGRESS_MIN[mode]) return (any * 60) / PROGRESS_MIN[mode];
  if (SINGLE_MIN[mode] && rots.every((x) => !x[0])) return (any * 60) / SINGLE_MIN[mode];
  const rotated = rots.some((x) => x[0]);
  const min = ENDLESS_MIN[mode] ?? (rotated ? 5 : 4);
  const perRot = rotated ? (2 * y("A") + y("B") + y("C")) / 4 : any;
  return (perRot * 60) / min;
}

// Drops of one item grouped by source: [sourceIndex, [[rotation, chance%], ...], score], best first.
// Score: missions — expected pieces per hour (perHour); bounties — mean chance over rotations
// (a new rotation each bounty); enemies / other — the chance.
function group(list) {
  const by = new Map();
  for (const d of list) {
    const i = sourceOf(d);
    const g = by.get(i) ?? { mode: d.mode, kind: d.kind, rots: [] };
    const prev = g.rots.find((x) => x[0] === d.rot);
    if (prev) {
      if (d.chance * d.qty > prev[1] * prev[2]) (prev[1] = d.chance), (prev[2] = d.qty);
    } else g.rots.push([d.rot, d.chance, d.qty]);
    by.set(i, g);
  }
  return [...by]
    .map(([i, g]) => {
      const rots = g.rots.sort((a, b) => a[0].localeCompare(b[0]));
      const score =
        g.kind === "mission"
          ? perHour(g.mode, rots)
          : g.kind === "bounty"
            ? rots.reduce((s, x) => s + x[1] * x[2], 0) / Math.max(1, new Set(rots.map((x) => x[0])).size)
            : Math.max(...rots.map((x) => x[1] * x[2]));
      return [i, rots.map(([r, c, q]) => (q > 1 ? [r, Math.round(c * 100) / 100, q] : [r, Math.round(c * 100) / 100])), Math.round(score * 100) / 100];
    })
    .sort((a, b) => b[2] - a[2]);
}

const byItem = new Map();
for (const d of drops) {
  if (!Number.isFinite(d.chance)) continue;
  byItem.set(d.item.toLowerCase(), [...(byItem.get(d.item.toLowerCase()) ?? []), d]);
}

// ---- relics: "Lith S18 Relic" -> "Lith S18" (db.json key)
const relicDrops = {};
for (const [name, list] of byItem) {
  const m = name.match(/^(lith|meso|neo|axi|requiem) (\w+) relic$/);
  if (!m) continue;
  const key = `${m[1][0].toUpperCase()}${m[1].slice(1)} ${m[2].toUpperCase().replace(/^ETERNA$/, "Eterna")}`;
  relicDrops[key] = group(list);
}

// ---- resources: resource items by English name; planets from ExportSystems.
const planetRes = new Map();
for (const s of systems) {
  const planet = unshout(tr(s.name)) ?? s.name;
  for (const r of s.resources ?? []) {
    const id = r.StoreItem.replace("/Lotus/StoreItems/", "/Lotus/");
    planetRes.set(id, [...(planetRes.get(id) ?? []), [planet, r.Rarity.toLowerCase()]]);
  }
}
// Wiki farming nodes ("Gaia", "Io") -> our sources. A node name can repeat (Railjack, events): star chart first.
const wiki = existsSync("data/wiki-farming.json") ? JSON.parse(readFileSync("data/wiki-farming.json", "utf8")) : { pages: {} };
const nodeByName = new Map();
for (const [key, r] of Object.entries(regions)) {
  const n = en[r.name]?.toLowerCase();
  if (n && (!nodeByName.has(n) || (/^SolNode\d+$/.test(key) && !/^SolNode\d+$/.test(nodeByName.get(n))))) nodeByName.set(n, key);
}
function wikiSource(name) {
  const key = nodeByName.get(name.toLowerCase());
  const p = key
    ? placeOf(en[regions[key].systemName], en[regions[key].name], undefined, "mission")
    : { kind: "other", name: ruOfX(name) ?? (miss(name), name) };
  const k = `${p.kind}|${p.name}|${p.sub ?? ""}`;
  if (!sourceIdx.has(k)) sourceIdx.set(k, sources.length), sources.push(p);
  return sourceIdx.get(k);
}

// Endless missions on the planets that drop a resource: what players actually farm. Ranked by mission
// type (Survival keeps enemies and containers coming), the Dark Sector resource bonus and how common
// the resource is on that planet; lower enemy level breaks ties. Our ranking, from DE's ExportRegions.
const ENDLESS = {
  MT_SURVIVAL: 1, MT_EXCAVATE: 0.95, MT_DEFENSE: 0.85, MT_ARTIFACT: 0.8, MT_ENDLESS_EXTERMINATION: 0.75,
  MT_CORRUPTION: 0.7, MT_TERRITORY: 0.65, MT_VOID_CASCADE: 0.6, MT_ALCHEMY: 0.6, MT_EVACUATION: 0.55,
};
const RARITY_W = { common: 1, uncommon: 0.8, rare: 0.6 };
const sysRes = new Map(); // resource -> Map(systemIndex -> rarity)
for (const sy of systems) for (const r of sy.resources ?? []) {
  const rid = r.StoreItem.replace("/Lotus/StoreItems/", "/Lotus/");
  if (!sysRes.has(rid)) sysRes.set(rid, new Map());
  sysRes.get(rid).set(sy.index, r.Rarity.toLowerCase());
}
function endlessFor(rid) {
  const on = sysRes.get(rid);
  if (!on) return undefined;
  const c = [];
  for (const [key, r] of Object.entries(regions)) {
    const w = ENDLESS[r.missionType];
    const rar = on.get(r.systemIndex);
    if (!w || !rar || r.hidden || /^CrewBattle/.test(key) || /Space|Archwing/i.test(r.tileset ?? "") || /Archwing|Sharkwing/i.test(r.missionName ?? "")) continue;
    const bonus = r.darkSectorData?.resourceBonus ?? 0;
    c.push({ key, r, rar, bonus, score: w * (1 + bonus) * RARITY_W[rar] - (r.minEnemyLevel ?? 0) / 1000 });
  }
  c.sort((a, b) => b.score - a.score);
  const out = [];
  const perPlanet = new Map();
  for (const x of c) {
    const n = perPlanet.get(x.r.systemIndex) ?? 0;
    if (n >= 2) continue;
    perPlanet.set(x.r.systemIndex, n + 1);
    const p = placeOf(en[x.r.systemName], en[x.r.name], undefined, "mission");
    const k = `${p.kind}|${p.name}|${p.sub ?? ""}`;
    if (!sourceIdx.has(k)) sourceIdx.set(k, sources.length), sources.push(p);
    out.push([sourceIdx.get(k), x.r.minEnemyLevel ?? 0, x.r.maxEnemyLevel ?? 0, Math.round(x.bonus * 100), x.rar]);
    if (out.length >= 4) break;
  }
  return out.length ? out : undefined;
}
// Game terms for the farming tips, from DE's dictionary (never our own translation).
const term = (k) => unshout(clean(tr(`/Lotus/Language/${k}`) ?? ""));
const terms = {
  booster: term("Items/ResourceAmountBoosterName"), chanceBooster: term("Items/ResourceDropChanceBoosterName"),
  nekros: term("Suits/NekrosName"), desecrate: term("Suits/SearchTheDeadAbilityName"),
  hydroid: term("Suits/HydroidName"), pilferingSwarm: term("Suits/KrakenAbilityAugment1Name"),
  khora: term("Suits/KhoraName"), strangledome: term("Suits/KhoraCageAbilityAugment1Name"),
  ivara: term("Suits/IvaraName"), prowl: term("Suits/RangerStealAbilityName"),
  smeeta: term("Items/CheshireCatbrowName"), charm: term("Items/CatbrowLuckPreceptName"),
  thiefsWit: term("Items/WarframeModLootRadar"), animalInstinct: term("Mods/AnimalInstinctMod"),
  survival: term("Missions/MissionName_Survival"), excavation: term("Missions/MissionName_Excavation"),
  steelPath: G.words.hard, dark: G.dark,
};

const RESOURCE_PARENTS = /ResourceItem|GemItem|DuviriBaseResourceItem|BaseRailjackItem|PlantItem/;
const NOT_RESOURCE = /Photobooth|FusionOrnament|\/Forma$|KubrowPetEgg|DogTag|FishItem|RareFish/;
const res = {};
for (const [id, e] of Object.entries(resources)) {
  if (!e.name || !ru[e.name] || e.productCategory !== "MiscItems") continue;
  const list = byItem.get((en[e.name] ?? "").toLowerCase()) ?? [];
  const planets = planetRes.get(id);
  // Resource-like items, plus anything a planet or a drop table gives (open-world resources etc.),
  // minus what is not a resource: captura scenes, Ayatan stars, Forma, adapters, eggs, syndicate tokens, fish.
  if (!RESOURCE_PARENTS.test(e.parentName) && !planets && !list.length) continue;
  if (NOT_RESOURCE.test(e.parentName) || /Adapter$|^(Omni )?Forma$/i.test(en[e.name] ?? "")) continue;
  if (!planets && !list.length && e.codexSecret) continue;
  // The game's description often ends with where to find it ("Местонахождение: ...") — the only source
  // for gathered things (plants, ore, fish) and quest/event items that no drop table lists.
  const full = clean(D[e.description] ?? en[e.description] ?? "");
  const [desc, where] = full.split(/\s*(?:Местонахождени[еяй]|Location)\s*:\s*/);
  res[id] = {
    ru: clean(unshout(ru[e.name])),
    en: clean(unshout(en[e.name])),
    name: clean(unshout(D[e.name] ?? en[e.name])),
    icon: img(e.icon),
    rarity: e.rarity?.toLowerCase(),
    desc: desc || undefined,
    where: where?.trim() || undefined,
    planets,
    drops: list.length ? group(list) : undefined,
  };
  const endless = endlessFor(id);
  if (endless) res[id].endless = endless;
  const w = wiki.pages[res[id].en];
  if (w) (res[id].farm = w.nodes.map(wikiSource)), (res[id].wiki = w.title);
}

// Written after crafting below: blueprint drops of parts add their sources to `sources`.
// Same-named copies (tutorial / junction packs: "PolymerBundle240TutorialQuest") repeat the base resource.
for (const id of Object.keys(res)) {
  const base = Object.keys(res).find((b) => b !== id && id.startsWith(b) && res[b].en === res[id].en);
  if (base) delete res[id];
}
const out = { builtAt, wikiAt: wiki.fetchedAt, terms, sources, relics: relicDrops, resources: res };
mkdirSync(`static/data/${LANG}`, { recursive: true });
const top = [...unknown].sort((a, b) => b[1] - a[1]).slice(0, 20).map(([k, n]) => `${k}×${n}`);
console.log(
  `${LANG} drops: ${drops.length} rows, ${Object.keys(relicDrops).length} relics drop now, ${Object.keys(res).length} resources ` +
  `(${Object.values(res).filter((r) => r.drops || r.planets).length} with sources), ${sources.length} sources, ` +
  `${(JSON.stringify(out).length / 1024).toFixed(0)} KB\n  untranslated ${unknown.size}: ${top.join(", ")}`,
);

// ---- crafting: what a warframe / weapon / companion / gear needs, from ExportRecipes.
// Output static/data/<lang>/craft.json: items { id: { ru, en, name, icon, kind, credits, time, num, parts } },
// parts = [[ingredient id, count]]. An ingredient is a resource (drops.json `resources`), another
// craft item (components, weapons for dual / combined ones) or something else named in `names`.
// Resources are never expanded, even when they have a blueprint (Orokin Cell, Forma).
const recipes = pe("ExportRecipes.json");
const frames = pe("ExportWarframes.json");
const weapons = pe("ExportWeapons.json");
const sentinels = pe("ExportSentinels.json");
const gear = pe("ExportGear.json");
const recipeOf = new Map();
for (const r of Object.values(recipes)) if (!recipeOf.has(r.resultType)) recipeOf.set(r.resultType, r);

// ---- how a blueprint is obtained besides the drop tables (DE's exports): the market for credits,
// clan research in the dojo, quests, vendors (hub NPCs, events, syndicates). Ids without "/StoreItems".
const vendors = pe("ExportVendors.json");
const dojo = pe("ExportDojoRecipes.json");
const keysExport = pe("ExportKeys.json");
const syndicates = pe("ExportSyndicates.json");
const noStore = (s) => s.replace("/Lotus/StoreItems/", "/Lotus/");
const bpKey = new Map(); // result -> blueprint (recipe) id, same pick as recipeOf
for (const [k, r] of Object.entries(recipes)) if (!bpKey.has(r.resultType)) bpKey.set(r.resultType, k);
const named = (key) => (key ? unshout(clean(tr(key) ?? "")) || null : null);
// Vendor manifest folder / file -> where the player finds them (DE's names, looked up by their English text).
const VENDOR_PLACE = { Deimos: "Necralisk", Ostron: "Cetus", Solaris: "Fortuna", Zariman: "Chrysalith", EntratiLabs: "Sanctum Anatomica", TheHex: "Höllvania Central Mall", Duviri: "Duviri" };
// Hubs = the relays (no single DE word for "Relay": our glue). Ergo Glast trades Corpus Dogmat weapons for
// Corrupted Holokeys (Void Storms); Teshin sells Steel Path Honors for Steel Essence.
const VENDOR_NPC = {
  OtakLastWishManifest: "Otak", NightcapVendorManifest: "Nightcap", AcrithisKullervoShopManifest: "Acrithis", AcrithisVendorManifest: "Acrithis",
  HunhowVendorManifest: "Hunhow", PerrinSequenceWeaponVendorManifest: "Ergo Glast", TeshinHardModeVendorManifest: "Teshin",
  AspirantZorbaVendorManifest: "Aspirant Zorba", IronwakeFlawedModVendorManifest: "Palladino",
};
// Nora's offerings: only the running season's manifest sells now (older seasons stay in the export).
const NORA_NOW = nightwave.affiliationTag?.replace(/Syndicate$/, "VendorManifest");
const isMod = (id) => !!(upgrades[id] || arcanes[id]);
const vendorOf = new Map(); // bp -> [{ place, npc, event, cost: [[name, n]], syn: [name, rank, standing] }]
for (const [vk, v] of Object.entries(vendors)) {
  const [folder, file] = vk.split("/").slice(-2);
  // Prospectors, fishmongers and conservation take the player's gems / fish / tags in trade (their
  // "price" is what the player gets): not a place to buy.
  if (/Prospector|Fishmonger|Conservation/.test(file)) continue;
  const nora = /^RadioLegion/.test(file);
  const noraNow = nora && file === NORA_NOW;
  const event = !noraNow && (folder === "Events" || /RadioLegion|Event/.test(file));
  for (const it of v.items ?? []) {
    // A blueprint, or the thing itself sold ready-made (refined gems at the prospector, mods): "direct".
    const id = noStore(it.storeItem);
    const direct = !recipes[id];
    if (direct && !resources[id] && !weapons[id] && !frames[id] && !sentinels[id] && !isMod(id)) continue;
    // Mods of past Nightwave seasons are not sold any more.
    if (nora && !noraNow && isMod(id)) continue;
    const cost = (it.itemPrices ?? []).map((p) => [named(resources[p.ItemType]?.name) ?? p.ItemType.split("/").pop(), p.ItemCount]);
    // Prices can be a range ({ minValue, maxValue }) when the stock rotates.
    const amount = (x) => (typeof x === "object" ? (x.minValue === x.maxValue ? x.minValue : `${x.minValue}–${x.maxValue}`) : x);
    if (it.credits) cost.push(["credits", amount(it.credits)]);
    if (it.platinum) cost.push(["platinum", amount(it.platinum)]);
    const syn = it.syndicate ? [named(syndicates[it.syndicate.tag]?.name) ?? it.syndicate.tag, it.syndicate.minRank ?? 0, it.syndicate.standingCost ?? 0] : undefined;
    // Places DE has no single word for are our glue: the relays, Drifter's Camp (Chipper, Kahl's Stock),
    // the Ascension mode's shop (Jade, Vesper, Cantare).
    const place =
      folder === "Hubs" ? G.words.relay : folder === "Kahl" ? G.words.camp : file === "AscensionVendorManifest" ? G.words.ascension
      : folder === "Prequel" ? G.quest(unshout(ruOf("The Old Peace") ?? "The Old Peace"))
      : file === "IronwakeFlawedModVendorManifest" ? unshout(ruOf("Iron Wake") ?? "Iron Wake")
      : VENDOR_PLACE[folder] ? unshout(ruOf(VENDOR_PLACE[folder]) ?? VENDOR_PLACE[folder]) : undefined;
    const npc = file === "ChipperVendorManifest" ? G.words.chipper : file === "EliteAlertVendorManifest" ? G.words.arbitration
      : noraNow ? unshout(tr("/Lotus/Language/Syndicates/RadioLegionTitle"))
      : VENDOR_NPC[file] ? unshout(ruOf(VENDOR_NPC[file]) ?? VENDOR_NPC[file]) : undefined;
    const list = vendorOf.get(id) ?? [];
    if (!list.some((x) => x.place === place && x.npc === npc && !!x.event === event)) list.push({ place, npc, event: event || undefined, direct: direct || undefined, cost, syn });
    vendorOf.set(id, list);
  }
}
// Syndicate offerings (ExportSyndicates favours): blueprints or things sold for standing at a rank.
// Vox Solaris (Baruuk), Cephalon Simaris (Inaros), Ostron / Solaris United / Entrati (gem refining)…
const synOf = new Map(); // id -> [{ name, rank, title, standing, direct }]
for (const sy of Object.values(syndicates)) {
  const name = named(sy.name);
  if (!name) continue;
  for (const f of sy.favours ?? []) {
    const id = noStore(f.storeItem);
    const direct = !recipes[id];
    if (direct && !resources[id] && !weapons[id] && !frames[id] && !sentinels[id] && !isMod(id)) continue;
    const title = named((sy.titles ?? []).find((x) => x.level === f.requiredLevel)?.name);
    const list = synOf.get(id) ?? [];
    if (!list.some((x) => x.name === name)) list.push({ name, rank: f.requiredLevel ?? 0, title: title ?? undefined, standing: f.standingCost ?? 0, direct: direct || undefined });
    synOf.set(id, list);
  }
}
// Quests: blueprints sent or given at a stage; a mission key's quest is the key chain in its folder.
const questOf = new Map();
const chainIn = (k) => (/KeyChain$/.test(k) ? k : Object.keys(keysExport).find((x) => x.startsWith(k.slice(0, k.lastIndexOf("/") + 1)) && /KeyChain$/.test(x)) ?? k);
for (const [k, q] of Object.entries(keysExport)) {
  for (const st of q.chainStages ?? []) {
    for (const a of [...(st.messageToSendWhenTriggered?.attachments ?? []), ...(st.itemsToGiveWhenTriggered ?? [])]) {
      const id = noStore(typeof a === "string" ? a : (a.ItemType ?? ""));
      if (recipes[id] && !questOf.has(id)) questOf.set(id, keysExport[chainIn(k)]?.name ?? q.name);
    }
  }
}
const LAB = (bp) =>
  /ClanTech\/Bio|Research\/Bio/.test(bp) ? "Dojo/ResearchLabInfestedName"
  : /ClanTech\/Chemical|Research\/Chem/.test(bp) ? "Dojo/ResearchLabGrineerName"
  : /ClanTech\/Energy|Research\/Energy/.test(bp) ? "Dojo/ResearchLabCorpusName"
  : /Railjack|ShipFeature|Consumables|SolarRails|SpectreArmies/.test(bp) ? null
  : "Dojo/ResearchLabTennoName";
function sourcesOf(itemId) {
  const bp = bpKey.get(itemId);
  const out = [...(vendorOf.get(itemId) ?? []).map((v) => ({ k: "vendor", ...v })), ...(synOf.get(itemId) ?? []).map((v) => ({ k: "syndicate", ...v }))];
  if (!bp) return out.length ? out : undefined;
  const r = recipes[bp];
  if ((r.creditsCost || r.platinumCost) && !r.excludeFromMarket) out.push({ k: "market", cr: r.creditsCost, pl: r.platinumCost });
  if (dojo.research[bp]) {
    const lab = LAB(bp);
    out.push({ k: "lab", lab: lab ? term(lab) : unshout(ruOf("Dojo") ?? "Dojo") });
  }
  if (questOf.has(bp)) out.push({ k: "quest", name: named(questOf.get(bp)) });
  for (const v of vendorOf.get(bp) ?? []) out.push({ k: "vendor", ...v });
  for (const v of synOf.get(bp) ?? []) out.push({ k: "syndicate", ...v });
  return out.length ? out : undefined;
}

const KIND_OF = (id) =>
  frames[id] ? (frames[id].productCategory === "MechSuits" ? "mech" : frames[id].productCategory === "SpaceSuits" ? "archwing" : "frame")
  // DE files pet parts (antigens, mutagens, MOA / hound parts) as weapons: they are parts, nothing to master.
  : weapons[id] ? (/PetParts\//.test(id) ? "part" : "weapon") : sentinels[id] ? "companion" : gear[id] ? "gear" : "part";
const entryOf = (id) => frames[id] ?? weapons[id] ?? sentinels[id] ?? gear[id] ?? resources[id];

const craft = {};
const names = {};
function nameOf(id) {
  const e = entryOf(id);
  return e?.name
    ? { ru: clean(unshout(ru[e.name] ?? en[e.name])), en: clean(unshout(en[e.name] ?? "")), name: clean(unshout(D[e.name] ?? en[e.name])), icon: img(e.icon) }
    : null;
}
function addCraft(id, depth = 0) {
  if (craft[id] || depth > 4) return !!craft[id];
  const r = recipeOf.get(id);
  const n = nameOf(id);
  if (!r || !n || res[id]) return false;
  craft[id] = { ...n, kind: KIND_OF(id), credits: r.buildPrice ?? 0, time: r.buildTime ?? 0, num: r.num ?? 1, parts: [] };
  // Where its blueprint drops: frame parts are "Mesa Chassis Blueprint" in the tables, weapon parts
  // and whole items by their own name or "<name> Blueprint". Prime parts come from relics (not here).
  const key = n.en.toLowerCase();
  const found = byItem.get(`${key} blueprint`) ?? byItem.get(key);
  if (found) craft[id].drops = group(found);
  for (const ing of r.ingredients ?? []) {
    const t = ing.ItemType;
    if (!res[t] && !addCraft(t, depth + 1) && !names[t]) {
      const nn = nameOf(t);
      if (nn) names[t] = nn;
    }
    craft[id].parts.push([t, ing.ItemCount]);
  }
  return true;
}
for (const src of [frames, weapons, sentinels, gear]) {
  for (const [id, e] of Object.entries(src)) if (e.name && ru[e.name] && !e.codexSecret) addCraft(id);
}
// Resources built in the foundry (Fieldron, Detonite Injector, Mutagen Mass…): kind "resource",
// shown on the resource's own page; elsewhere a resource stays a leaf of the tree.
for (const id of Object.keys(res)) {
  const r = recipeOf.get(id);
  if (!r?.ingredients?.length) continue;
  craft[id] = { ...nameOf(id), name: res[id].name, kind: "resource", credits: r.buildPrice ?? 0, time: r.buildTime ?? 0, num: r.num ?? 1, parts: [] };
  for (const ing of r.ingredients) {
    if (!res[ing.ItemType] && !addCraft(ing.ItemType, 1) && !names[ing.ItemType]) {
      const nn = nameOf(ing.ItemType);
      if (nn) names[ing.ItemType] = nn;
    }
    craft[id].parts.push([ing.ItemType, ing.ItemCount]);
  }
  res[id].craft = 1;
}
for (const id of Object.keys(craft)) {
  const src = sourcesOf(id);
  if (src) craft[id].src = src;
  // The blueprint's id: a prime item's main blueprint is a relic reward (db.json items).
  const bp = bpKey.get(id);
  if (bp && /Prime/.test(bp)) craft[id].bp = bp;
  // Any other blueprint: the player's inventory lists blueprints by this id (Recipes).
  else if (bp) craft[id].r = bp;
}
// Plain resources some vendor sells (Railjack salvage, fish parts…): on the resource itself.
for (const id of Object.keys(res)) {
  if (craft[id]) continue;
  const v = [...(vendorOf.get(id) ?? []).map((x) => ({ k: "vendor", ...x })), ...(synOf.get(id) ?? []).map((x) => ({ k: "syndicate", ...x }))];
  if (v.length) res[id].src = v;
}
// Mods and arcanes: drop tables (missions, bounties, enemies, vaults…) by English name, vendors and
// syndicates by id. Per kind only the best few: a common mod drops from hundreds of enemies.
const modSrc = {};
const MOD_TOP = 5;
for (const [id, e] of [...Object.entries(upgrades), ...Object.entries(arcanes)]) {
  const name = en[e.name]?.toLowerCase();
  if (!name || !ru[e.name]) continue;
  const list = [...(byItem.get(name) ?? []), ...(modByItem.get(name) ?? [])];
  const g = list.length ? group(list) : [];
  const seen = new Map();
  const top = g.filter(([i]) => {
    const k = sources[i].kind;
    seen.set(k, (seen.get(k) ?? 0) + 1);
    return seen.get(k) <= MOD_TOP;
  });
  const src = [...(vendorOf.get(id) ?? []).map((x) => ({ k: "vendor", ...x })), ...(synOf.get(id) ?? []).map((x) => ({ k: "syndicate", ...x }))];
  if (!top.length && !src.length) continue;
  modSrc[id] = { drops: top.length ? top : undefined, src: src.length ? src : undefined };
}
out.mods = modSrc;
// Prime parts as ingredients are relic rewards: their blueprints drop, they are built from them.
// Blueprints whose result is not in the tree (Orokin Reactor, Exilus Adapter, decorations…): recipe id -> the
// result's name and icon, so the foundry, invasion rewards and the inventory name them.
const bpNames = {};
const inTree = new Set(Object.values(craft).flatMap((c) => [c.r, c.bp]).filter(Boolean));
for (const [rid, r] of Object.entries(recipes)) {
  if (inTree.has(rid) || r.hidden || !r.resultType || craft[r.resultType]) continue;
  const n = nameOf(r.resultType);
  if (n?.name) bpNames[rid] = [n.name, n.icon, r.buildTime ?? 0];
}
writeFileSync(`static/data/${LANG}/craft.json`, JSON.stringify({ items: craft, names, bpNames }));
writeFileSync(`static/data/${LANG}/drops.json`, JSON.stringify(out));
console.log(
  `${LANG} craft: ${Object.values(craft).filter((c) => c.kind !== "part").length} items, ` +
  `${Object.values(craft).filter((c) => c.kind === "part").length} parts, ${Object.keys(names).length} other names, ` +
  `${(JSON.stringify({ items: craft, names }).length / 1024).toFixed(0)} KB`,
);
}
