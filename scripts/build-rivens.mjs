// Riven data: per riven type (rifle, pistol, melee…) the stats it can roll with their base value, stat text and name
// syllables (DE's ExportUpgrades `upgradeEntries`); weapons a riven fits with their disposition (ExportWeapons
// `omegaAttenuation`) and warframe.market riven slug (v2/riven/weapons, one request, matched by gameRef);
// veiled-riven challenge texts. Output: static/data/<lang>/rivens.json. The math is in src/lib/rivens.ts.
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";

const PE_DIR = "node_modules/warframe-public-export-plus";
const pe = (f) => JSON.parse(readFileSync(`${PE_DIR}/${f}`, "utf8"));
const en = pe("dict.en.json");
const ru = pe("dict.ru.json");
const upgrades = pe("ExportUpgrades.json");
const weapons = pe("ExportWeapons.json");
const images = pe("ExportImages.json");
const img = (path) => {
  const hash = path && images[path]?.contentHash;
  return hash ? `https://content.warframe.com/PublicExport${path}!${hash.replace(/\+/g, "%2B")}` : (path ?? null);
};
// DE's texts carry color tags: "|val|% <DT_PUNCTURE_COLOR>Puncture" -> "|val|% Puncture".
const clean = (s) => s?.replace(/<[^>]+>\s*/g, "").replace(/\s+/g, " ").trim();
const unshout = (s) => (s && s === s.toUpperCase() && /[a-zа-я]/i.test(s) ? s[0] + s.slice(1).toLowerCase() : s);

console.log("Fetching warframe.market riven weapons...");
const wfm = new Map();
try {
  const r = await fetch("https://api.warframe.market/v2/riven/weapons");
  if (!r.ok) throw new Error(`warframe.market ${r.status}`);
  for (const w of (await r.json()).data ?? []) if (w.gameRef && w.slug) wfm.set(w.gameRef, w.slug);
} catch (e) {
  console.warn(`  no riven slugs: ${e.message}`); // links to the market are left out, the rest builds
}

const PREFIX = "/Lotus/Upgrades/Mods/Randomized/";
for (const [LANG, D] of Object.entries({ ru, en })) {
  const types = {};
  const raw = {};
  const fits = new Set();
  const challenges = {};
  const complications = {};
  for (const [id, u] of Object.entries(upgrades)) {
    if (!id.startsWith(PREFIX)) continue;
    const key = id.slice(PREFIX.length);
    const name = clean(unshout(D[u.name] ?? en[u.name])) ?? key;
    if (!u.upgradeEntries) {
      raw[key] = { name, icon: img(u.icon) };
      continue;
    }
    const stats = {};
    for (const e of u.upgradeEntries) {
      const v = e.upgradeValues?.[0];
      if (!v) continue;
      const text = clean(D[v.locTag] ?? en[v.locTag] ?? e.tag).replace("|STAT1|", "|val|");
      stats[e.tag] = {
        v: v.value,
        l: text,
        pre: D[e.prefixTag] ?? en[e.prefixTag] ?? "",
        suf: D[e.suffixTag] ?? en[e.suffixTag] ?? "",
        ...(v.reverseValueSymbol ? { rev: 1 } : {}),
      };
    }
    types[key] = { name, icon: img(u.icon), stats };
    for (const w of u.compatibleItems ?? []) fits.add(w);
    if (u.compat) fits.add(u.compat);
    for (const c of u.availableChallenges ?? []) {
      challenges[c.fullName] ??= clean(D[c.description] ?? en[c.description] ?? c.fullName);
      for (const x of c.complications ?? []) complications[x.fullName] ??= clean(D[x.description] ?? en[x.description] ?? x.fullName);
    }
  }
  // Every weapon with a disposition: rivens are rolled for the base weapon, but keep any the game may name.
  const wpn = {};
  for (const [id, w] of Object.entries(weapons)) {
    if (!w.omegaAttenuation || !(fits.has(id) || wfm.has(id))) continue;
    wpn[id] = {
      name: clean(unshout(D[w.name] ?? en[w.name])) ?? id,
      icon: img(w.icon),
      d: w.omegaAttenuation,
      ...(wfm.has(id) ? { slug: wfm.get(id) } : {}),
    };
  }
  mkdirSync(`static/data/${LANG}`, { recursive: true });
  const out = { types, raw, weapons: wpn, challenges, complications };
  writeFileSync(`static/data/${LANG}/rivens.json`, JSON.stringify(out));
  console.log(
    `${LANG} rivens: ${Object.keys(types).length} types, ${Object.keys(raw).length} veiled, ${Object.keys(wpn).length} weapons ` +
      `(${Object.values(wpn).filter((w) => w.slug).length} with market slug), ${(JSON.stringify(out).length / 1024).toFixed(0)} KB`,
  );
}
