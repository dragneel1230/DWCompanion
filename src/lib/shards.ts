// Archon shards on warframes: 5 sockets per frame. DE's export has the shard items (names, icons: frames.json
// `shards`), not the bonuses — those and their numbers are from the wiki (wiki.warframe.com/w/Archon_Shard,
// checked 2026-10-07). A socket is stored as the game's upgrade name without the path:
// "WarframeAbilityStrength", tauforged "WarframeAbilityStrengthMythic" (inventory ArchonCrystalUpgrades).
import { num, t, type Key } from "$lib/i18n/index.svelte";

export type ShardColor = "ACC_RED" | "ACC_YELLOW" | "ACC_BLUE" | "ACC_PURPLE" | "ACC_ORANGE" | "ACC_GREEN";
export const SHARD_COLORS: ShardColor[] = ["ACC_RED", "ACC_YELLOW", "ACC_BLUE", "ACC_PURPLE", "ACC_ORANGE", "ACC_GREEN"];
export const SHARD_PATH = "/Lotus/Upgrades/Invigorations/ArchonCrystalUpgrades/ArchonCrystalUpgrade";
export const SHARD_SLOTS = 5;

// Paint for the socket (the game's shard hues).
export const SHARD_HUE: Record<ShardColor, string> = {
  ACC_RED: "#e5484d",
  ACC_YELLOW: "#f0b232",
  ACC_BLUE: "#3e9bff",
  ACC_PURPLE: "#a66cff",
  ACC_ORANGE: "#ff8a3d",
  ACC_GREEN: "#3ccf8e",
};

// What a bonus adds to the build's stat panel. Health / shield / armor / energy are flat, after all mods (wiki).
type StatFx = "str" | "dur" | "hp" | "sh" | "arm" | "en";

interface Bonus {
  color: ShardColor;
  v: [number, number]; // regular, tauforged
  cap?: [number, number];
  fx?: StatFx;
}

export const SHARD_BONUSES: Record<string, Bonus> = {
  WarframeAbilityStrength: { color: "ACC_RED", v: [10, 15], fx: "str" },
  WarframeAbilityDuration: { color: "ACC_RED", v: [10, 15], fx: "dur" },
  MeleeCritDamage: { color: "ACC_RED", v: [25, 37.5] },
  PrimaryStatusChance: { color: "ACC_RED", v: [25, 37.5] },
  SecondaryCritChance: { color: "ACC_RED", v: [25, 37.5] },
  WarframeCastingSpeed: { color: "ACC_YELLOW", v: [25, 37.5] },
  WarframeStartingEnergy: { color: "ACC_YELLOW", v: [30, 45] },
  WarframeGlobeEffectHealth: { color: "ACC_YELLOW", v: [100, 150] },
  WarframeGlobeEffectEnergy: { color: "ACC_YELLOW", v: [50, 75] },
  WarframeParkourVelocity: { color: "ACC_YELLOW", v: [15, 22.5] },
  WarframeHealthMax: { color: "ACC_BLUE", v: [150, 225], fx: "hp" },
  WarframeShieldMax: { color: "ACC_BLUE", v: [150, 225], fx: "sh" },
  WarframeEnergyMax: { color: "ACC_BLUE", v: [50, 75], fx: "en" },
  WarframeArmourMax: { color: "ACC_BLUE", v: [150, 225], fx: "arm" },
  WarframeRegen: { color: "ACC_BLUE", v: [5, 7.5] },
  WarframeElectricDamageBoost: { color: "ACC_PURPLE", v: [10, 15] },
  WarframeElectricDamage: { color: "ACC_PURPLE", v: [30, 45], cap: [10, 15] }, // cap: extra per Crimson/Azure/Violet
  WarframeCritDamageBoost: { color: "ACC_PURPLE", v: [25, 37.5] },
  Equilibrium: { color: "ACC_PURPLE", v: [20, 30] },
  WarframeHPBoostFromImpact: { color: "ACC_ORANGE", v: [1, 2], cap: [300, 450] },
  WarframeBlastProc: { color: "ACC_ORANGE", v: [5, 7.5] },
  WeaponCritBoostFromHeat: { color: "ACC_ORANGE", v: [1, 1.5], cap: [50, 75] },
  WarframeRadiationDamageBoost: { color: "ACC_ORANGE", v: [10, 15] },
  WarframeToxinDamage: { color: "ACC_GREEN", v: [30, 45] },
  WarframeToxinHeal: { color: "ACC_GREEN", v: [2, 3] },
  WarframeCorrosiveDamageBoost: { color: "ACC_GREEN", v: [10, 15] },
  WarframeCorrosiveStack: { color: "ACC_GREEN", v: [2, 3] },
};

export const bonusesOf = (c: ShardColor) => Object.keys(SHARD_BONUSES).filter((k) => SHARD_BONUSES[k].color === c);

export interface ShardInfo {
  key: string; // bonus without "Mythic"
  tau: boolean;
  bonus: Bonus | undefined; // unknown: a bonus added to the game after this table
  color: ShardColor | null;
}

export function shardInfo(id: string): ShardInfo {
  const tau = id.endsWith("Mythic");
  const key = tau ? id.slice(0, -6) : id;
  const bonus = SHARD_BONUSES[key];
  return { key, tau, bonus, color: bonus?.color ?? null };
}

export const shardId = (key: string, tau: boolean) => (tau ? `${key}Mythic` : key);

// The color code of an inventory socket ("ACC_RED_MYTHIC") -> frames.json `shards` key.
export const colorKey = (c: ShardColor, tau: boolean) => (tau ? `${c}_MYTHIC` : c);

// "+15% к силе способностей": the bonus line in the interface language.
export function shardText(id: string, all: (string | null)[] = []): string {
  const s = shardInfo(id);
  if (!s.bonus) return s.key.replace(/([a-z])([A-Z])/g, "$1 $2");
  const i = s.tau ? 1 : 0;
  const v = s.bonus.v[i];
  const cap = s.bonus.cap?.[i];
  const text = t(`shard.b.${s.key}` as Key, { v: fmt(v), cap: cap == null ? "" : fmt(cap) });
  // Violet electricity: the extra part grows with Crimson / Azure / Violet shards on the frame.
  if (s.key === "WarframeElectricDamage" && cap != null) {
    const n = all.filter((x) => x && ["ACC_RED", "ACC_BLUE", "ACC_PURPLE"].includes(shardInfo(x).color ?? "")).length;
    if (n) return `${text} ${t("shard.now", { v: fmt(v + cap * n) })}`;
  }
  return text;
}

const fmt = (n: number) => num(n, 1);

// Sum of the stat-panel effects of the sockets.
export function shardFx(shards: (string | null)[] | undefined): Record<StatFx, number> {
  const out: Record<StatFx, number> = { str: 0, dur: 0, hp: 0, sh: 0, arm: 0, en: 0 };
  for (const id of shards ?? []) {
    if (!id) continue;
    const s = shardInfo(id);
    if (s.bonus?.fx) out[s.bonus.fx] += s.bonus.v[s.tau ? 1 : 0];
  }
  return out;
}

// Inventory ArchonCrystalUpgrades -> socket ids (empty sockets come as {} in the game's list).
export function shardsFromInv(list: unknown): (string | null)[] {
  if (!Array.isArray(list)) return [];
  return list.slice(0, SHARD_SLOTS).map((x) => {
    const u = (x as { UpgradeType?: unknown })?.UpgradeType;
    return typeof u === "string" && u.startsWith(SHARD_PATH) ? u.slice(SHARD_PATH.length) : null;
  });
}
