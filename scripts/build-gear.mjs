// Builds static/data/<lang>/gear.json: everything besides warframes that takes mods — primary, secondary and
// melee weapons, companions and their weapons, archwings, arch-guns, arch-melee, necramechs.
// Stats are DE's (Public Export Plus: damage by type, crit, status, fire rate, multishot, magazine, reload;
// health / shield / armor / energy), slot polarities WFCD's (@wfcd/items), names from DE's dictionaries.
// `classes` + `tags` decide which mods fit (a mod's `compat` is a DE weapon class; the export has no class tree,
// so the roots are derived here from the weapon's category — see compatClasses()).
// Run: pnpm data (after build-frames.mjs)
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { resolve as resolvePath } from "node:path";

const read = (p) => JSON.parse(readFileSync(p, "utf8"));
const WFCD = "node_modules/@wfcd/items/data/json";
const PE = "node_modules/warframe-public-export-plus";
const pe = (f) => read(`${PE}/${f}`);
const peWeapons = pe("ExportWeapons.json");
const peSentinels = pe("ExportSentinels.json");
const peSuits = pe("ExportWarframes.json");
const images = pe("ExportImages.json");
const dictEn = pe("dict.en.json");
const dictRuAll = pe("dict.ru.json");
const scaled = createRequire(import.meta.url)(resolvePath(PE, "supplementals/getScaledPowersuitValues.js"));
const img = (path) => {
  const hash = path && images[path]?.contentHash;
  return hash ? `https://content.warframe.com/PublicExport${path}!${hash.replace(/\+/g, "%2B")}` : (path ?? null);
};
const unshout = (s) => (s && s === s.toUpperCase() ? s[0] + s.slice(1).toLowerCase() : s);
const clean = (s) => (s ?? "").replace(/<[^>]+>\s*/g, "").trim();

// WFCD rows by uniqueName: polarities and the primary's kind (Rifle / Shotgun / Sniper / Launcher / Bow).
const wfcd = new Map();
const weaponRows = new Set(); // WFCD's weapon files: player weapons (DE's categories also hold pet parts and the like)
for (const f of ["Primary", "Secondary", "Melee", "Arch-Gun", "Arch-Melee", "SentinelWeapons", "Sentinels", "Pets", "Archwing", "Warframes"])
  for (const x of read(`${WFCD}/${f}.json`)) {
    wfcd.set(x.uniqueName, x);
    if (["Primary", "Secondary", "Melee", "Arch-Gun", "Arch-Melee", "SentinelWeapons"].includes(f)) weaponRows.add(x.uniqueName);
  }

const KIND = { LongGuns: "primary", Pistols: "secondary", Melee: "melee", SpaceGuns: "archgun", SpaceMelee: "archmelee", SentinelWeapons: "cweapon" };
const SLOTS = { primary: 8, secondary: 8, melee: 8, archgun: 8, archmelee: 8, cweapon: 8, companion: 10, archwing: 8, mech: 12 };

// DE's damage array order (index.d.ts: DT_IMPACT … DT_RADIANT, DT_SENTIENT…): the first 15 are the ones modding knows.
const DT = 15;

const T = "/Lotus/Weapons/Tenno/";
function weaponClasses(id, w, kind, type) {
  const c = new Set([id, w.parentName].filter(Boolean));
  const tags = w.compatibilityTags ?? [];
  const holster = w.holsterCategory;
  const gun = (shotgun) => {
    c.add(`${T}LotusLongGun`);
    if (shotgun) c.add(`${T}Shotgun/LotusShotgun`);
    else c.add(`${T}Rifle/LotusRifle`);
    if (/Assault/.test(w.parentName ?? "")) c.add(`${T}Rifle/LotusAssaultRifle`);
    if (holster === "SNIPER" || type === "Sniper" || /Sniper/.test(w.parentName ?? "")) c.add(`${T}Rifle/LotusSniperRifle`);
    if (holster === "BOW" || type === "Bow") c.add(`${T}Bows/LotusBow`);
  };
  const melee = () => {
    c.add(`${T}Melee/PlayerMeleeWeapon`);
    if (tags.includes("GLAIVES_STANCE")) c.add(`${T}Melee/LotusGlaiveWeaponBase`);
    if (tags.includes("DAGGERS_STANCE") || tags.includes("DUAL_DAGGERS_STANCE")) c.add(`${T}Melee/LotusDagger`);
  };
  if (kind === "primary") gun(type === "Shotgun" || holster === "SHOTGUN");
  else if (kind === "secondary") c.add(`${T}Pistol/LotusPistol`);
  else if (kind === "melee") melee();
  else if (kind === "archgun") c.add(`${T}Archwing/Primary/ArchGun`);
  else if (kind === "archmelee") c.add(`${T}Archwing/Melee/ArchMeleeWeapon`);
  else if (kind === "cweapon") {
    if (holster === "MELEE") melee();
    else if (holster === "SHOTGUN") gun(true);
    else if (holster === "RIFLE" || holster === "SNIPER") gun(false);
    else c.add(`${T}Pistol/LotusPistol`);
  }
  return [...c];
}

// Companion families: DE's mod classes (compat) and family tags (a mod's compatibilityTags).
const P = "/Lotus/Types/";
function companionClasses(id, cat) {
  const c = new Set([id, `${P}Game/SentinelPowerSuit`]);
  const tags = [];
  if (cat === "Sentinels") {
    c.add(`${P}Game/Pets/RoboticPetPowerSuit`).add(`${P}Sentinels/SentinelPowerSuit`);
    // Precepts are written for the base suit: "CarrierBasePowerSuit" fits Carrier and Carrier Prime.
    const base = id.split("/").pop().replace(/Prime|Base/g, "");
    for (const k of sentinelBases) if (k.split("/").pop().replace(/Prime|Base/g, "") === base) c.add(k);
  } else if (cat === "MoaPets") {
    c.add(`${P}Game/Pets/RoboticPetPowerSuit`);
    if (/Zanuka/.test(id)) c.add(`${P}Friendly/Pets/ZanukaPets/ZanukaPetPowerSuit`), tags.push("ZANUKA_MOD");
    else c.add(`${P}Friendly/Pets/MoaPets/MoaPetPowerSuit`), tags.push("MOA_MOD");
  } else {
    c.add(`${P}Game/Pets/PetPowerSuit`);
    if (/InfestedCatbrow/.test(id)) c.add(`${P}Friendly/Pets/CreaturePets/BaseInfestedCatbrowPetPowerSuit`), tags.push("VULPAPHYLA_MOD");
    else if (/Catbrow|KavatPowerSuit/.test(id)) c.add(`${P}Game/CatbrowPet/CatbrowPetPowerSuit`), tags.push("KAVAT_MOD");
    else if (/PredatorKubrow/.test(id)) tags.push("PREDASITE_MOD");
    else if (/ChargerKubrow/.test(id)) tags.push("HELMINTH_MOD");
    else tags.push("KUBROW_MOD");
  }
  return { classes: [...c], tags };
}
const sentinelBases = new Set(
  Object.values(pe("ExportUpgrades.json"))
    .map((u) => u.compat)
    .filter((c) => c && c.startsWith(`${P}Sentinels/SentinelPowersuits/`)),
);

const POL = {
  AP_ATTACK: "madurai", AP_DEFENSE: "vazarin", AP_TACTIC: "naramon", AP_POWER: "zenurik",
  AP_PRECEPT: "penjaga", AP_WARD: "unairu", AP_UMBRA: "umbra", AP_UNIVERSAL: "any", AP_ANY: "any",
};
const pol = (p) => (p ? (POL[p] ?? p) : null);
const r2 = (n) => Math.round(n * 1000) / 1000;

for (const LANG of ["ru", "en"]) {
  const dict = LANG === "ru" ? dictRuAll : dictEn;
  const name = (key, fallback) => unshout(clean(dict[key] ?? dictEn[key] ?? fallback));
  const items = {};
  const base = (id, row, w) => ({
    name: name(row.name, w?.name ?? id),
    ru: unshout(clean(dictRuAll[row.name] ?? w?.name ?? id)),
    en: unshout(clean(dictEn[row.name] ?? w?.name ?? id)),
    icon: img(row.icon),
    mr: row.masteryReq || undefined,
    pols: (w?.polarities ?? []).map(pol),
  });

  // Weapons: the ones WFCD lists (player weapons), stats from DE.
  for (const [id, wpn] of Object.entries(peWeapons)) {
    const kind = KIND[wpn.productCategory];
    const w = wfcd.get(id);
    if (!kind || !w || !weaponRows.has(id) || w.type === "Zaw Component") continue;
    const type = kind === "primary" ? w.type : undefined;
    items[id] = {
      ...base(id, wpn, w),
      kind,
      type,
      prime: !!w.isPrime || undefined,
      maxRank: wpn.maxLevelCap ?? 30,
      slots: SLOTS[kind],
      exilus: ["primary", "secondary", "melee"].includes(kind) || undefined,
      stance: kind === "melee" || undefined,
      arcane: ["primary", "secondary", "melee"].includes(kind) || undefined,
      exPol: pol(w.exilusPolarity) ?? undefined,
      stPol: pol(w.stancePolarity) ?? undefined,
      classes: weaponClasses(id, wpn, kind, type),
      tags: wpn.compatibilityTags?.length ? wpn.compatibilityTags : undefined,
      w: {
        dmg: (wpn.damagePerShot ?? []).slice(0, DT).map(r2),
        cc: wpn.criticalChance ?? 0,
        cm: wpn.criticalMultiplier ?? 1,
        sc: wpn.procChance ?? 0,
        fr: r2(wpn.fireRate ?? 1),
        ms: wpn.multishot ?? 1,
        mag: wpn.magazineSize || undefined,
        rel: wpn.reloadTime || undefined,
        trig: wpn.trigger || undefined,
        range: wpn.range || undefined,
      },
    };
  }

  // Companions: DE's numbers are the rank-30 ones (the wiki's "max rank" infobox matches them).
  for (const [id, s] of Object.entries(peSentinels)) {
    if (!["Sentinels", "KubrowPets", "MoaPets"].includes(s.productCategory)) continue;
    const w = wfcd.get(id);
    const { classes, tags } = companionClasses(id, s.productCategory);
    items[id] = {
      ...base(id, s, w),
      kind: "companion",
      type: s.productCategory,
      prime: /Prime/.test(id) || undefined,
      maxRank: 30,
      slots: SLOTS.companion,
      classes,
      tags,
      d: s.health != null ? { health: s.health, shield: s.shield ?? 0, armor: s.armor ?? 0, energy: s.power ?? 0 } : undefined,
    };
  }

  // Archwings and necramechs: DE's rank scaling (supplementals/getScaledPowersuitValues).
  for (const [id, s] of Object.entries(peSuits)) {
    const kind = s.productCategory === "SpaceSuits" ? "archwing" : s.productCategory === "MechSuits" ? "mech" : null;
    if (!kind) continue;
    const w = wfcd.get(id);
    const r30 = await scaled(id, 30);
    items[id] = {
      ...base(id, s, w),
      kind,
      prime: /Prime/.test(id) || undefined,
      maxRank: kind === "mech" ? 40 : 30,
      slots: SLOTS[kind],
      classes: [id, s.parentName].filter(Boolean),
      d: { health: r30.health, shield: r30.shield, armor: r30.armor, energy: r30.power },
    };
  }

  mkdirSync(`static/data/${LANG}`, { recursive: true });
  writeFileSync(`static/data/${LANG}/gear.json`, JSON.stringify({ items }));
  const n = {};
  for (const g of Object.values(items)) n[g.kind] = (n[g.kind] ?? 0) + 1;
  console.log(`${LANG}: gear ${JSON.stringify(n)}, ${(JSON.stringify(items).length / 1024).toFixed(0)} KB`);
}
