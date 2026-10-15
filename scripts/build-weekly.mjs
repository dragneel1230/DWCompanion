// Data of the «Неделя» tab (src/lib/weekly.ts): Nightwave and 1999 calendar challenges, calendar rewards, Circuit
// Incarnon Genesis adapters and the weapons they go on, Archon shards by boss; reward tables of the weekly
// activities (Archon hunt, Netracells, Deep / Temporal Archimedea from DE's ExportRewards, the Descendia from the
// official drop tables), Archimedea modifiers, Teshin's weekly Steel Path offer.
// Archimedea modifier names are not in the export's dictionaries: they come from DE's own strings as
// oracle.browse.wf serves them (the dictionaries browse.wf shows), cached in data/oracle-dict.<lang>.json.
// Output: static/data/<lang>/weekly.json. Run: pnpm data (after build-drops.mjs, which refreshes data/droptables.html)
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";

const PE_DIR = "node_modules/warframe-public-export-plus";
const pe = (f) => JSON.parse(readFileSync(`${PE_DIR}/${f}`, "utf8"));

const en = pe("dict.en.json");
const DICTS = { ru: pe("dict.ru.json"), en };
const nightwave = pe("ExportNightwave.json");
const challenges = pe("ExportChallenges.json");
const resources = pe("ExportResources.json");
const weapons = pe("ExportWeapons.json");
const images = pe("ExportImages.json");
const missionTypes = pe("ExportMissionTypes.json");
const factions = pe("ExportFactions.json");

const img = (path) => {
  const hash = path && images[path]?.contentHash;
  return hash ? `https://content.warframe.com/PublicExport${path}!${hash.replace(/\+/g, "%2B")}` : (path ?? null);
};
const tr = (dict, key) => (dict[key] ?? en[key] ?? null)?.replace(/<[^>]+>\s*/g, "").trim() ?? null;
const unshout = (s) => (s && s === s.toUpperCase() && /[a-zа-я]/i.test(s) ? s[0] + s.slice(1).toLowerCase() : s);
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

// ---- names and icons of reward paths ("/Lotus/StoreItems/…" or the item path itself)
const all = {};
for (const f of ["ExportResources", "ExportUpgrades", "ExportArcanes", "ExportRecipes", "ExportBoosters", "ExportFusionBundles",
  "ExportWeapons", "ExportWarframes", "ExportGear", "ExportCustoms", "ExportFlavour", "ExportBundles", "ExportBoosterPacks",
  "ExportKeys", "ExportSentinels", "ExportDrones"])
  for (const [k, v] of Object.entries(pe(`${f}.json`))) all[k] ??= v;
const entryOf = (path) => all[path] ?? all[path.replace("/StoreItems/", "/")];
// A blueprint is named after what it builds: DE's "|ITEM| Blueprint" / "ЧЕРТЁЖ: |ITEM|". An Endo bundle counts its
// Endo (fusionPoints each): [name, icon, multiplier, item id]. The id is what the app links to: a blueprint's
// result, else the item itself (without "/StoreItems/").
function itemOf(dict, path) {
  const e = entryOf(path);
  if (!e) return null;
  if (e.resultType) {
    const r = entryOf(e.resultType);
    const n = r?.name && tr(dict, r.name);
    return n ? [unshout(tr(dict, "/Lotus/Language/Items/BlueprintAndItem") ?? "|ITEM|").replace(/\|ITEM\|/i, unshout(n)), img(r.icon ?? e.icon), 1, e.resultType] : null;
  }
  const n = e.name && tr(dict, e.name);
  return n ? [unshout(n), img(e.icon), e.fusionPoints ?? 1, all[path] ? path : path.replace("/StoreItems/", "/")] : null;
}
const REW = pe("ExportRewards.json");
// A reward deck -> [name, icon, count, chance, item id], likeliest first. Items the export can't name are left out.
function deck(dict, id) {
  return (REW[id]?.[0] ?? [])
    .map((x) => {
      const it = itemOf(dict, x.type);
      return it ? [it[0], it[1], (x.itemCount ?? 1) * it[2], x.probability, it[3]] : null;
    })
    .filter(Boolean)
    .sort((a, b) => b[3] - a[3]);
}
const DECKS = {
  archon: "/Lotus/Types/Game/MissionDecks/ArchonSortieRewards",
  netra: "/Lotus/Types/Game/MissionDecks/EntratiMissionRewards/EntratiVaultRewards",
  lab: ["Silver", "Gold", "Arcane"].map((t) => `/Lotus/Types/Game/MissionDecks/EntratiLabConquestRewards/EntratiLabConquest${t}Rewards`),
  hex: ["Silver", "Gold", "Arcane"].map((t) => `/Lotus/Types/Game/MissionDecks/1999ConquestRewards/1999Conquest${t}Rewards`),
};

// The Descendia's tables exist only on the official drop tables page (English names): matched back to items
// by their English names, "… Blueprint" by the item it builds.
const DROPS = "data/droptables.html";
const html = existsSync(DROPS) ? readFileSync(DROPS, "utf8") : "";
const enIndex = new Map();
for (const [k, v] of Object.entries(all)) {
  const n = v.name && en[v.name] && tr(en, v.name).toLowerCase();
  if (n && !enIndex.has(n)) enIndex.set(n, k);
}
for (const [k, v] of Object.entries(all)) {
  const r = v.resultType && all[v.resultType];
  const n = r?.name && en[r.name] && `${tr(en, r.name).toLowerCase()} blueprint`;
  if (n && !enIndex.has(n)) enIndex.set(n, k);
}
const DESCENT = {
  arc: "The Descendia: Infernum 6 and 13 Arcane Rewards (Steel Path)",
  tri: "The Descendia: Infernum 20 Triple Arcane Rewards",
  triSp: "The Descendia: Infernum 20 Triple Arcane Rewards (Steel Path)",
  boss: "The Descendia: Roathe",
  rare: "The Descendia: Rare Rewards (Steel Path)",
  unc: "The Descendia: Uncommon Rewards (Steel Path)",
  com: "The Descendia: Common Rewards (Steel Path)",
};
const descentPaths = new Set();
function dropTable(dict, title) {
  const at = html.indexOf(`<th colspan="2">${title}</th>`);
  if (at < 0) return [];
  const end = html.indexOf("blank-row", at);
  return [...html.slice(at, end).matchAll(/<td>([^<]*)<\/td><td>[^<(]*\(([\d.]+)%\)<\/td>/g)]
    .map(([, raw, p]) => {
      // "3X Arcane Ice", "3 Day Affinity Booster", "75X Ignia"
      const m = raw.match(/^(?:([\d,]+)X |\d+ Day )?(.+)$/);
      const n = m[1] ? Number(m[1].replace(/,/g, "")) : 1;
      const path = enIndex.get(m[2].toLowerCase());
      if (path) descentPaths.add(path);
      const it = path && itemOf(dict, path);
      return it ? [it[0], it[1], n * it[2], Number(p) / 100, it[3]] : null;
    })
    .filter(Boolean)
    .sort((a, b) => b[3] - a[3]);
}

// Teshin's weekly Steel Path offer: an 8-week rotation from Monday 2025-01-06 (as browse.wf keeps it).
const TESHIN_EPOCH = Date.UTC(2025, 0, 6);
const TESHIN = [
  ["/Lotus/Types/Recipes/Components/UmbraFormaBlueprint", 1],
  ["/Lotus/Types/Items/MiscItems/Kuva", 50000],
  ["/Lotus/Upgrades/Mods/Randomized/RawModularPistolRandomMod", 1],
  ["/Lotus/Types/Items/MiscItems/Forma", 3],
  ["/Lotus/Upgrades/Mods/Randomized/RawModularMeleeRandomMod", 1],
  ["/Lotus/Upgrades/Mods/FusionBundles/RareFusionBundle", 375], // 80 Endo each: 30 000
  ["/Lotus/Upgrades/Mods/Randomized/RawRifleRandomMod", 1],
  ["/Lotus/Upgrades/Mods/Randomized/RawShotgunRandomMod", 1],
];

// DE's own strings for what the export lacks (Archimedea modifiers, activity titles).
const ORACLE_KEYS = /^\/Lotus\/Language\/(Conquest\/|1999Echoes\/1999HexConquestNode|WorldStateWindow\/LiteSortieMissionName)/;
async function oracle(lang) {
  const file = `data/oracle-dict.${lang}.json`;
  try {
    const res = await fetch(`https://oracle.browse.wf/dicts/${lang}.json`);
    if (!res.ok) throw new Error(String(res.status));
    const d = Object.fromEntries(Object.entries(await res.json()).filter(([k]) => ORACLE_KEYS.test(k)).sort(([a], [b]) => (a < b ? -1 : 1)));
    writeFileSync(file, JSON.stringify(d, null, 1));
    return d;
  } catch (e) {
    if (!existsSync(file)) throw e;
    console.log(`  oracle.browse.wf offline (${e.message}), using ${file}`);
    return JSON.parse(readFileSync(file, "utf8"));
  }
}
const ORACLE = { ru: await oracle("ru"), en: await oracle("en") };
// worldState tag -> DE's string key (browse.wf's mapping: a few tags differ from their string's name).
const RISK_KEY = { EMPBlackHole: "MagneticHounds" };
const VAR_KEY = { DullBlades: "ComboCountChance", Undersupplied: "MaxAmmo" };
function conquest(dict, od) {
  const s = (k) => (od[k] ?? ORACLE.en[k] ?? null)?.replace(/<[^>]+>/g, "").replace(/\r?\n/g, " ").trim() ?? null;
  const out = { lab: {}, hex: {}, risk: {}, mod: {} };
  for (const k of Object.keys(ORACLE.en)) {
    const m = k.match(/^\/Lotus\/Language\/Conquest\/(?:MissionVariant_(Lab|Hex)Conquest|(Condition)|PersonalMod)_(\w+)$/);
    if (!m || /_Desc(_\w+)?$/.test(k)) continue;
    const box = m[1] ? out[m[1].toLowerCase()] : m[2] ? out.risk : out.mod;
    // Some descriptions carry numbers the game fills in (|val|, |PERCENT|): left out rather than shown with holes.
    const desc = s(`${k}_Desc`);
    box[m[3]] = [s(k), desc && !/\|[A-Za-z]+\|/.test(desc) ? desc : null];
  }
  for (const [tag, key] of Object.entries(RISK_KEY)) if (out.risk[key]) out.risk[tag] = out.risk[key];
  for (const [tag, key] of Object.entries(VAR_KEY)) if (out.mod[key]) out.mod[tag] = out.mod[key];
  const mt = {};
  for (const [id, x] of Object.entries(missionTypes)) if (x.name) mt[id] = unshout(tr(dict, x.name));
  // Deep Archimedea's defense is the two-target one.
  const dual = tr(dict, "/Lotus/Language/Missions/MissionName_DualDefense");
  if (dual) mt["LAB:MT_DEFENSE"] = unshout(dual);
  const fac = {};
  for (const [id, x] of Object.entries(factions)) if (x.name) fac[id] = unshout(tr(dict, x.name));
  return {
    ...out,
    mt,
    fac,
    title: {
      archon: s("/Lotus/Language/WorldStateWindow/LiteSortieMissionName"),
      lab: s("/Lotus/Language/Conquest/SolarMapLabConquestNode"),
      hex: s("/Lotus/Language/1999Echoes/1999HexConquestNode"),
      netra: unshout(tr(dict, "/Lotus/Language/Missions/MissionName_Vaults")),
      descent: unshout(tr(dict, "/Lotus/Language/Missions/MissionName_Descent")),
      circuit: unshout(tr(dict, "/Lotus/Language/Duviri/MapNodeEndless")),
      clem: unshout(tr(dict, "/Lotus/Language/G1Quests/GetClemWeeklyObjective")),
      maroo: unshout(tr(dict, "/Lotus/Language/G1Quests/TreasureHuntWeeklyObjective")),
      teshin: unshout(tr(dict, "/Lotus/Language/Game/Teshin")),
      roathe: unshout(tr(dict, "/Lotus/Language/CircleOfHell/CoHProtoframeDevil")),
      roatheName: unshout(tr(dict, "/Lotus/Language/CircleOfHell/RoatheName")),
    },
  };
}

const ARCHONS = { SORTIE_BOSS_AMAR: "Amar", SORTIE_BOSS_NIRA: "Nira", SORTIE_BOSS_BOREAL: "Boreal" };
const ARCHON_COLOR = { Amar: "ACC_RED", Nira: "ACC_YELLOW", Boreal: "ACC_BLUE" };

const inc = incarnons();
for (const [lang, dict] of Object.entries(DICTS)) {
  const nw = {};
  for (const [id, c] of Object.entries(nightwave.challenges ?? {}))
    nw[id.split("/").pop()] = [tr(dict, c.name) ?? id.split("/").pop(), fill(tr(dict, c.description), c.required), c.standing ?? 0, c.required ?? 1];
  const cal = {};
  for (const [id, c] of Object.entries(challenges))
    if (id.includes("/Calendar1999/")) cal[id] = fill(tr(dict, c.description) ?? tr(dict, c.name), c.requiredCount);
  const rew = {};
  const rewi = {}; // calendar reward -> icon
  const rewr = {}; // calendar blueprint -> what it builds (the app links to it)
  for (const [id, x] of Object.entries(named)) if (x?.name && (id.includes("Calendar") || resources[id] || id.includes("FusionBundles"))) {
    // A blueprint DE left untranslated ("Weapon Utility Unlocker Blueprint"): named after what it builds, below.
    const n = dict[x.name] || !id.includes("/Recipes/") ? tr(dict, x.name) : null;
    if (n) rew[id] = x.fusionPoints > 1 ? `${x.fusionPoints} ${n}` : n;
    if (n && x.icon && /Calendar|MiscItems|NarmerSorties|FusionBundles|Recipes/.test(id)) rewi[id] = img(x.icon);
  }
  // Calendar blueprints (Exilus adapters etc.) are recipes: named after what they build.
  for (const id of Object.keys(all)) if (id.includes("/Recipes/Components/") && !rew[id]) {
    const it = itemOf(dict, id);
    if (it) (rew[id] = it[0]), it[1] && (rewi[id] = it[1]), (rewr[id] = it[3]);
  }
  const archons = {};
  for (const [boss, a] of Object.entries(ARCHONS)) {
    const id = `/Lotus/Types/Gameplay/NarmerSorties/ArchonCrystal${a}`;
    archons[boss] = [tr(dict, resources[id]?.name) ?? a, img(resources[id]?.icon), ARCHON_COLOR[a], tr(dict, `/Lotus/Language/Narmer/Archon${a}`) ?? a];
  }
  const incOut = Object.fromEntries(Object.entries(inc).map(([k, v]) => [k, [tr(dict, v.key) ?? k, v.icon, v.id, v.fits]]));
  const rw = {
    archon: deck(dict, DECKS.archon),
    netra: deck(dict, DECKS.netra),
    lab: DECKS.lab.map((d) => deck(dict, d)),
    hex: DECKS.hex.map((d) => deck(dict, d)),
    descent: Object.fromEntries(Object.entries(DESCENT).map(([k, title]) => [k, dropTable(dict, title)])),
  };
  const drew = {};
  const descentNamed = new Set([
    ...descentPaths,
    ...Object.keys(all).filter((id) => id.includes("/FusionBundles/") || id.includes("/Boosters/")),
  ]);
  for (const id of descentNamed) {
    const it = itemOf(dict, id);
    if (it) drew[id] = it;
  }
  // Credits are a pickup StoreItem and therefore have no Public Export item record, but their name is in DE's dictionary.
  const credits = "/Lotus/StoreItems/Types/PickUps/Credits/10000Credits";
  const creditsName = tr(dict, "/Lotus/Language/Items/10000CreditsName");
  if (creditsName) drew[credits] = [unshout(creditsName), null, 1];
  const teshin = { epoch: TESHIN_EPOCH, items: TESHIN.map(([p, n]) => {
    const [name, icon, mul, id] = itemOf(dict, p) ?? [p.split("/").pop(), null, 1, p];
    return [name, icon, n * mul, id];
  }) };
  const cq = conquest(dict, ORACLE[lang]);
  const out = { nw, cal, rew, rewi, rewr, drew, archons, inc: incOut, rw, cq, teshin };
  mkdirSync(`static/data/${lang}`, { recursive: true });
  writeFileSync(`static/data/${lang}/weekly.json`, JSON.stringify(out));
  console.log(
    `${lang}: weekly — nightwave ${Object.keys(nw).length}, calendar ${Object.keys(cal).length}, rewards ${Object.keys(rew).length}, ` +
      `incarnons ${Object.keys(incOut).length}, descent ${Object.values(rw.descent).map((x) => x.length).join("/")}, ` +
      `archimedea ${Object.keys(cq.lab).length}+${Object.keys(cq.hex).length}+${Object.keys(cq.risk).length}+${Object.keys(cq.mod).length}, ` +
      `size ${(JSON.stringify(out).length / 1024).toFixed(0)} KB`,
  );
}
