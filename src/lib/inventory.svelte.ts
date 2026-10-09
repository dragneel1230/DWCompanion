// The player's inventory: DE's inventory.php answer, which the app never fetches itself. After the
// player's consent the app installs warframe-api-helper (an outside open-source tool) and runs it on a
// button press or, when the player turned it on, after a mission (src-tauri/src/inv_helper.rs); or it
// imports an inventory.json made by any tool. See docs/DESIGN.md §2E. Kept compact in localStorage
// (`dwc.inventory`, shared by the app windows), with a log of what changed between snapshots.
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { getDb } from "$lib/db";
import { journal } from "$lib/journal.svelte";
import { missionState } from "$lib/missionState.svelte";
import { DEFAULT_PREFS, type Prefs } from "$lib/inv/worth";
import { shardsFromInv } from "$lib/shards";

export interface InvData {
  at: number; // when the game synced it (LastInventorySync), ms
  got: number; // when it reached the app
  mods: Record<string, [number, number]>; // mod / arcane id -> [copies, best rank]
  items: Record<string, number>; // resources, parts, blueprints, relics, consumables -> count
  arsenal: string[]; // warframes, weapons, companions… in the arsenal now
  // Per arsenal item (best copy): forma used (Polarized), reactor / catalyst installed (Features bit 1).
  // Absent in snapshots taken before 2026-10-06.
  gear?: Record<string, [number, boolean]>;
  // Mod configs on each warframe and other modded gear (best-ranked copy). Absent in snapshots taken before
  // 2026-10-06; only warframes before 2026-10-08.
  loadouts?: Record<string, InvLoadout>;
  // The warframe equipped now (current loadout preset) and its config index. Absent before 2026-10-07.
  current?: { frame: string; cfg: number };
  // Everything equipped now (warframe, weapons, companion and its weapon, archwing gear, necramech) -> config index.
  // Absent before 2026-10-08.
  equipped?: Record<string, number>;
  xp: Record<string, number>; // item -> affinity (also for things sold or used up)
  // Blueprints building in the foundry: recipe id, when it is ready (ms), ItemId (one notification each).
  // Absent before 2026-10-08.
  foundry?: InvFoundry[];
  // Helminth (InfestedFoundry), when the player has it. Absent before 2026-10-08.
  helminth?: InvHelminth;
  // Weekly activities (the «Сейчас» weekly panel). Absent before 2026-10-09.
  week?: InvWeek;
  credits: number;
  plat: number;
  ducats: number;
}

// A warframe's configs A/B/C as the game keeps them: slots 0-7, 8 aura, 9 exilus, 10-11 arcanes.
export interface InvLoadout {
  xp: number;
  potato: boolean;
  pol: [number, string][]; // forma'd slot (same indexes) -> polarity, AP_* names
  cfg: { n?: string; m: ([string, number] | null)[]; h?: [string, number] }[]; // index = config; mod / arcane id + rank; Helminth ability + replaced slot
  // Archon shards (5 sockets, ids as in shards.ts). Absent in snapshots taken before 2026-10-07.
  shards?: (string | null)[];
}

export interface InvFoundry {
  id: string;
  done: number;
  oid: string;
}

export interface InvHelminth {
  xp: number; // DE's value: 100 × the affinity the game shows
  res: Record<string, number>; // secretion -> tenths of a percent
  fed: string[]; // warframes subsumed
  offers: string[]; // this week's Invigoration warframes (base suits)
  // Invigorated warframes now: warframe -> [offensive, utility, until ms]. Fields as SpaceNinjaServer names them.
  invig: Record<string, [string, string, number]>;
}

// What the player did this week, as the inventory keeps it (field names as SpaceNinjaServer documents them;
// a field shows up only once the player did the activity at least once).
export interface InvWeek {
  netra?: [number, number]; // Netracells done in the period, when the period resets (ms)
  descent: Record<string, [number, number]>; // DM_COH_NORMAL / DM_COH_HARD -> [floor claimed, expires ms]
  archon: string[]; // SortieId of the last Archon hunt rewarded
  sortie: string[]; // the same for the Sortie
  // 1999 calendar: season, its iteration and version, last completed day index, upgrades picked this year.
  cal?: { season: string; it: number; ver: number; day: number; up: string[] };
  circuit: Record<string, { choices: string[]; earn: number; claim: number; until: number }>; // EXC_NORMAL / EXC_HARD
  nw: string[]; // Nightwave challenge ids done (SeasonChallengeHistory)
  incarnon: string[]; // weapons with an Incarnon Genesis installed (Features bit 512)
}

type Raw = Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any

const KEY = "dwc.inventory";
const HELPER_KEY = "dwc.invHelper";
const RISK_KEY = "dwc.invRisk";
const AUTO_KEY = "dwc.invAuto";
const PREFS_KEY = "dwc.invPrefs";
const LOG_KEY = "dwc.invLog";
const LOG_MAX = 40;

// Everything the arsenal holds as separate items (not counted stacks).
const ARSENAL = [
  "Suits", "LongGuns", "Pistols", "Melee", "SpaceSuits", "SpaceGuns", "SpaceMelee", "Sentinels", "SentinelWeapons",
  "KubrowPets", "MoaPets", "MechSuits", "OperatorAmps", "Hoverboards", "CrewShipWeapons", "Horses", "DrifterMelee",
];
// Arsenal items with mod configs (builds); SpecialItems: exalted weapons, Venari (they come with their warframe).
const MODDED = ["Suits", "LongGuns", "Pistols", "Melee", "SpaceSuits", "SpaceGuns", "SpaceMelee", "Sentinels", "SentinelWeapons", "KubrowPets", "MoaPets", "MechSuits", "SpecialItems"];
// Loadout presets and their place in CurrentLoadOutIds; the slots of each preset that hold modded gear.
const PRESETS: [string, number, string[]][] = [
  ["NORMAL", 0, ["s", "p", "l", "m", "h"]],
  ["SENTINEL", 1, ["s", "l"]],
  ["ARCHWING", 2, ["s", "l", "m"]],
  ["MECH", 8, ["s"]],
];
// Counted stacks: [ItemType, ItemCount].
const STACKS = ["MiscItems", "Recipes", "Consumables", "FusionTreasures", "LevelKeys", "ShipDecorations", "CrewShipRawSalvage"];

// Mongo ObjectId: the first 4 bytes are seconds since 1970.
function oidTime(v: unknown): number {
  const hex = typeof v === "object" && v ? (v as Raw).$oid : null;
  return typeof hex === "string" && hex.length >= 8 ? parseInt(hex.slice(0, 8), 16) * 1000 : 0;
}

// Mongo date: { $date: { $numberLong } } (or a plain number of ms).
function dateMs(v: unknown): number {
  const d = typeof v === "object" && v ? (v as Raw).$date : v;
  const n = typeof d === "object" && d ? Number((d as Raw).$numberLong) : Number(d);
  return Number.isFinite(n) ? n : 0;
}

function rankOf(fp: unknown): number {
  try {
    const lvl = JSON.parse(String(fp ?? "{}")).lvl;
    return typeof lvl === "number" ? lvl : 0;
  } catch {
    return 0;
  }
}

// inventory.php JSON -> what the app uses. Throws on something that isn't an inventory.
export function parseInventory(text: string): InvData {
  const j = JSON.parse(text) as Raw;
  if (!j || typeof j !== "object" || !Array.isArray(j.Suits) || !Array.isArray(j.MiscItems)) throw new Error("not-inventory");
  const mods: InvData["mods"] = {};
  const addMod = (id: string, n: number, rank: number) => {
    const m = (mods[id] ??= [0, 0]);
    m[0] += n;
    m[1] = Math.max(m[1], rank);
  };
  for (const u of j.RawUpgrades ?? []) if (u?.ItemType) addMod(u.ItemType, u.ItemCount ?? 1, 0);
  for (const u of j.Upgrades ?? []) if (u?.ItemType) addMod(u.ItemType, 1, rankOf(u.UpgradeFingerprint));
  const items: Record<string, number> = {};
  for (const k of STACKS) for (const x of j[k] ?? []) if (x?.ItemType) items[x.ItemType] = (items[x.ItemType] ?? 0) + (x.ItemCount ?? 1);
  const arsenal = new Set<string>();
  const gear: Record<string, [number, boolean]> = {};
  const incarnon = new Set<string>();
  for (const k of ARSENAL)
    for (const x of j[k] ?? []) {
      if (!x?.ItemType) continue;
      arsenal.add(x.ItemType);
      if ((Number(x.Features) || 0) & 512) incarnon.add(x.ItemType);
      const g = (gear[x.ItemType] ??= [0, false]);
      g[0] = Math.max(g[0], Number(x.Polarized) || 0);
      g[1] ||= ((Number(x.Features) || 0) & 1) === 1;
    }
  // Configs reference upgrades by id; an unranked one (never fused) is written as its path.
  const ups = new Map<string, [string, number]>();
  for (const u of j.Upgrades ?? []) if (u?.ItemId?.$oid && u.ItemType) ups.set(u.ItemId.$oid, [u.ItemType, rankOf(u.UpgradeFingerprint)]);
  const loadouts: Record<string, InvLoadout> = {};
  for (const x of MODDED.flatMap((k) => (j[k] ?? []) as Raw[])) {
    if (!x?.ItemType || (loadouts[x.ItemType] && loadouts[x.ItemType].xp >= (x.XP ?? 0))) continue;
    const cfg = (x.Configs ?? []).map((c: Raw) => {
      const m = Array.from({ length: 12 }, (_, k): [string, number] | null => {
        const v = c?.Upgrades?.[k];
        if (typeof v !== "string" || !v) return null;
        return v.startsWith("/") ? [v, 0] : (ups.get(v) ?? null);
      });
      const ho = c?.AbilityOverride;
      const h: [string, number] | undefined = typeof ho?.Ability === "string" && typeof ho.Index === "number" ? [ho.Ability, ho.Index] : undefined;
      return { n: typeof c?.Name === "string" && c.Name ? c.Name : undefined, m, h };
    });
    loadouts[x.ItemType] = {
      xp: x.XP ?? 0,
      potato: ((Number(x.Features) || 0) & 1) === 1,
      pol: (x.Polarity ?? []).filter((p: Raw) => typeof p?.Slot === "number" && p.Value).map((p: Raw) => [p.Slot, p.Value]),
      cfg,
      shards: (j.Suits ?? []).includes(x) ? shardsFromInv(x.ArchonCrystalUpgrades) : undefined,
    };
  }
  const byOid = new Map<string, string>();
  for (const k of MODDED) for (const x of j[k] ?? []) if (x?.ItemId?.$oid && x.ItemType) byOid.set(x.ItemId.$oid, x.ItemType);
  const equipped: Record<string, number> = {};
  for (const [name, idx, keys] of PRESETS) {
    const cur = j.CurrentLoadOutIds?.[idx]?.$oid;
    const p = (j.LoadOutPresets?.[name] ?? []).find((x: Raw) => x?.ItemId?.$oid === cur);
    for (const k of keys) {
      const it = p && byOid.get(p[k]?.ItemId?.$oid);
      if (it) equipped[it] = Number(p[k].mod) || 0;
    }
  }
  // Equipped now: the current NORMAL preset names the warframe copy and its config.
  let current: InvData["current"];
  const curId = j.CurrentLoadOutIds?.[0]?.$oid;
  const preset = (j.LoadOutPresets?.NORMAL ?? []).find((p: Raw) => p?.ItemId?.$oid === curId);
  const suit = preset?.s?.ItemId?.$oid ? (j.Suits ?? []).find((x: Raw) => x?.ItemId?.$oid === preset.s.ItemId.$oid) : null;
  if (suit?.ItemType) current = { frame: suit.ItemType, cfg: Number(preset.s.mod) || 0 };
  const xp: Record<string, number> = {};
  for (const x of j.XPInfo ?? []) if (x?.ItemType) xp[x.ItemType] = x.XP ?? 0;
  const foundry: InvFoundry[] = (j.PendingRecipes ?? [])
    .filter((r: Raw) => r?.ItemType)
    .map((r: Raw) => ({ id: r.ItemType, done: dateMs(r.CompletionDate), oid: r.ItemId?.$oid ?? `${r.ItemType}:${dateMs(r.CompletionDate)}` }));
  const f = j.InfestedFoundry as Raw | undefined;
  const invig: InvHelminth["invig"] = {};
  for (const x of j.Suits ?? []) {
    const until = dateMs(x?.UpgradesExpiry);
    if (x?.ItemType && until > Date.now() && (x.OffensiveUpgrade || x.DefensiveUpgrade)) invig[x.ItemType] = [x.OffensiveUpgrade ?? "", x.DefensiveUpgrade ?? "", until];
  }
  const helminth: InvHelminth | undefined = f
    ? {
        xp: Number(f.XP) || 0,
        res: Object.fromEntries((f.Resources ?? []).filter((r: Raw) => r?.ItemType).map((r: Raw) => [r.ItemType, Number(r.Count) || 0])),
        fed: (f.ConsumedSuits ?? []).map((c: Raw) => c?.s).filter((s: unknown) => typeof s === "string"),
        offers: (f.InvigorationSuitOfferings ?? []).filter((s: unknown) => typeof s === "string"),
        invig,
      }
    : undefined;
  const sortieIds = (v: unknown) => (Array.isArray(v) ? v.map((r: Raw) => r?.SortieId?.$oid).filter((x): x is string => typeof x === "string") : []);
  const cp = j.CalendarProgress as Raw | undefined;
  const week: InvWeek = {
    netra: j.EntratiVaultCountResetDate ? [Number(j.EntratiVaultCountLastPeriod) || 0, dateMs(j.EntratiVaultCountResetDate)] : undefined,
    descent: Object.fromEntries(((j.DescentRewards ?? []) as Raw[]).filter((d) => d?.Category).map((d) => [d.Category, [Number(d.FloorClaimed) || 0, dateMs(d.Expiry)]])),
    archon: sortieIds(j.LastLiteSortieReward),
    sortie: sortieIds(j.LastSortieReward),
    cal: cp?.SeasonProgress
      ? {
          season: String(cp.SeasonProgress.SeasonType ?? ""),
          it: Number(cp.Iteration) || 0,
          ver: Number(cp.Version) || 0,
          day: Number(cp.SeasonProgress.LastCompletedDayIdx ?? -1),
          up: (cp.YearProgress?.Upgrades ?? []).filter((u: unknown) => typeof u === "string"),
        }
      : undefined,
    circuit: Object.fromEntries(
      ((j.EndlessXP ?? []) as Raw[])
        .filter((e) => e?.Category)
        .map((e) => [e.Category, { choices: (e.Choices ?? []).filter((c: unknown) => typeof c === "string"), earn: Number(e.Earn) || 0, claim: Number(e.Claim) || 0, until: dateMs(e.Expiry) }]),
    ),
    nw: ((j.SeasonChallengeHistory ?? []) as Raw[]).map((c) => c?.id).filter((x): x is string => typeof x === "string"),
    incarnon: [...incarnon],
  };
  return {
    at: oidTime(j.LastInventorySync) || Date.now(),
    got: Date.now(),
    mods,
    items,
    arsenal: [...arsenal],
    gear,
    loadouts,
    current,
    equipped,
    xp,
    foundry,
    helminth,
    week,
    credits: j.RegularCredits ?? 0,
    plat: (j.PremiumCredits ?? 0) + (j.PremiumCreditsFree ?? 0),
    ducats: j.PrimeTokens ?? 0,
  };
}

function load(): InvData | null {
  try {
    return JSON.parse(localStorage.getItem(KEY) ?? "null");
  } catch {
    return null;
  }
}

// What changed between two snapshots (counts: + came, − went).
export interface InvChange {
  at: number; // the new snapshot
  from: number; // the previous one
  auto: boolean; // refreshed after a mission
  items: Record<string, number>;
  mods: Record<string, number>;
  plat: number;
  ducats: number;
  credits: number;
  picks: { entry: string; relic: string | null; item: string }[]; // relic rewards the player took (journal)
}

function readJson<T>(key: string, fallback: T): T {
  try {
    return JSON.parse(localStorage.getItem(key) ?? "null") ?? fallback;
  } catch {
    return fallback;
  }
}
function write(key: string, v: unknown) {
  try {
    localStorage.setItem(key, typeof v === "string" ? v : JSON.stringify(v));
  } catch {
    // storage full or unavailable: lives for this session
  }
}

function delta(a: Record<string, number>, b: Record<string, number>): Record<string, number> {
  const out: Record<string, number> = {};
  for (const k of new Set([...Object.keys(a), ...Object.keys(b)])) {
    const d = (b[k] ?? 0) - (a[k] ?? 0);
    if (d) out[k] = d;
  }
  return out;
}
const copies = (m: InvData["mods"]) => Object.fromEntries(Object.entries(m).map(([k, v]) => [k, v[0]]));

// Which card the player took from each relic opened between the snapshots: the journal knows the cards on
// the screen (overlay) and the player's own reward (EE.log); the inventory knows what actually arrived.
// An endless mission opens several relics before the next snapshot, and their cards overlap: an opening
// with a single candidate left is settled first, its item is taken out of what arrived, and that may leave
// another opening with a single candidate — until nothing changes. What stays ambiguous is left to the
// player (marked by hand in the journal), never guessed.
function resolvePicks(prev: InvData, next: InvData, items: Record<string, number>): InvChange["picks"] {
  const db = getDb();
  const got = new Map(Object.entries(items).filter(([id, n]) => n > 0 && db.items[id]));
  const out: InvChange["picks"] = [];
  let open = journal.list
    .filter((e) => e.t >= prev.at - 60_000 && e.t <= next.at + 60_000 && !e.picked)
    .sort((a, b) => a.t - b.t);
  const cands = (e: (typeof open)[number]) => [...new Set([...(e.offer ?? []), e.reward])].filter((id) => (got.get(id) ?? 0) > 0);
  const settle = (e: (typeof open)[number], id: string, offer?: string[]) => {
    got.set(id, got.get(id)! - 1);
    out.push({ entry: e.id, relic: e.relic, item: id });
    // Confirmed by what arrived; the overlay's cards make it a real choice worth recording.
    journal.pick(e.id, id, "inv", offer);
  };
  for (let changed = true; changed; ) {
    changed = false;
    const rest: typeof open = [];
    for (const e of open) {
      const c = cands(e);
      if (c.length !== 1) {
        if (c.length) rest.push(e);
        continue;
      }
      settle(e, c[0]);
      changed = true;
    }
    open = rest;
  }
  // OCR can take one part of a set for another (a name cut short: "Чертёж: Ярели Прайм: Каркас" read as
  // the main blueprint). An opening none of whose cards arrived, while exactly one other part of a carded
  // set did, got that part: the card is corrected. Only when a single opening and a single part fit.
  const lost = journal.list.filter((e) => e.t >= prev.at - 60_000 && e.t <= next.at + 60_000 && !e.picked && e.offer?.length && !cands(e).length);
  const fixes = lost.map((e) => {
    const sets = new Set(e.offer!.map((id) => db.items[id]?.set).filter(Boolean));
    const parts = [...got].filter(([id, n]) => n > 0 && sets.has(db.items[id]?.set) && !e.offer!.includes(id)).map(([id]) => id);
    return { e, parts };
  });
  for (const { e, parts } of fixes) {
    if (parts.length !== 1 || fixes.some((f) => f.e !== e && f.parts.includes(parts[0]))) continue;
    const id = parts[0];
    const set = db.items[id].set;
    let swapped = false;
    const offer = e.offer!.map((x) => (!swapped && db.items[x]?.set === set ? ((swapped = true), id) : x));
    settle(e, id, offer);
  }
  return out;
}

class Inventory {
  data = $state<InvData | null>(load());
  helper = $state<string>(localStorage.getItem(HELPER_KEY) ?? "");
  risk = $state(localStorage.getItem(RISK_KEY) === "1"); // the player accepted the warning
  auto = $state(localStorage.getItem(AUTO_KEY) === "1"); // refresh after missions
  prefs = $state<Prefs>({ ...DEFAULT_PREFS, ...readJson<Partial<Prefs>>(PREFS_KEY, {}) });
  log = $state<InvChange[]>(readJson<InvChange[]>(LOG_KEY, []));
  busy = $state(false);
  error = $state(""); // rust.* key or "inv.notInventory"
  #arsenal = $derived(new Set(this.data?.arsenal ?? []));

  constructor() {
    // The hub window reads the same snapshot: follow it when the main window refreshes.
    window.addEventListener("storage", (e) => {
      if (e.key === KEY) this.data = load();
      if (e.key === HELPER_KEY) this.helper = e.newValue ?? "";
      if (e.key === RISK_KEY) this.risk = e.newValue === "1";
      if (e.key === AUTO_KEY) this.auto = e.newValue === "1";
      if (e.key === PREFS_KEY) this.prefs = { ...DEFAULT_PREFS, ...readJson<Partial<Prefs>>(PREFS_KEY, {}) };
      if (e.key === LOG_KEY) this.log = readJson<InvChange[]>(LOG_KEY, []);
    });
  }

  // Ready once the player accepted the risk: the app reads the session from the game itself (inv_session.rs),
  // no external tool to install. `helper` stays only for a manually kept warframe-api-helper path (legacy).
  get ready(): boolean {
    return this.risk;
  }

  // Lookups for the rest of the app: null when there is no snapshot (nothing is known).
  hasMod(id: string): boolean {
    return !!this.data?.mods[id];
  }
  // Best rank among the copies; null when not owned or no snapshot.
  modRank(id: string): number | null {
    return this.data?.mods[id]?.[1] ?? null;
  }
  count(id: string): number | null {
    return this.data ? (this.data.items[id] ?? 0) : null;
  }
  inArsenal(id: string): boolean {
    return this.#arsenal.has(id);
  }
  // Forma and reactor / catalyst of an arsenal item; null when unknown (not owned, or an old snapshot).
  gearOf(id: string): { forma: number; potato: boolean } | null {
    const g = this.data?.gear?.[id];
    return g ? { forma: g[0], potato: g[1] } : null;
  }
  xpOf(id: string): number | undefined {
    return this.data?.xp[id];
  }

  setHelper(path: string) {
    this.helper = path.trim();
    write(HELPER_KEY, this.helper);
  }
  setRisk(v: boolean) {
    this.risk = v;
    write(RISK_KEY, v ? "1" : "0");
    if (!v) {
      this.setAuto(false);
      invoke("inv_session_clear").catch(() => {}); // drop the cached game session
    }
  }
  setAuto(v: boolean) {
    this.auto = v;
    write(AUTO_KEY, v ? "1" : "0");
  }
  setPrefs(p: Partial<Prefs>) {
    this.prefs = { ...this.prefs, ...p };
    write(PREFS_KEY, this.prefs);
  }
  clearLog() {
    this.log = [];
    write(LOG_KEY, []);
  }

  // Reads the session from the running game once per launch (cached), then just asks DE for the inventory
  // (inv_session.rs). The game must be running and logged in.
  async refresh(auto = false): Promise<boolean> {
    if (!this.ready || this.busy) return false;
    this.busy = true;
    this.error = "";
    try {
      const text = await invoke<string>("inv_session_fetch");
      const ok = this.#keep(text, auto);
      // «Коллекция» takes the account id from the same session when the log hasn't shown it yet.
      if (ok) import("$lib/profile.svelte").then((m) => m.profile.inventoryRead()).catch(() => {});
      return ok;
    } catch (e) {
      this.error = String(e);
      return false;
    } finally {
      this.busy = false;
    }
  }

  // An inventory.json the player picked.
  import(text: string): boolean {
    this.error = "";
    return this.#keep(text, false);
  }

  clear() {
    this.data = null;
    try {
      localStorage.removeItem(KEY);
    } catch {
      // storage unavailable
    }
  }

  #keep(text: string, auto: boolean): boolean {
    let d: InvData;
    try {
      d = parseInventory(text);
    } catch {
      this.error = "inv.notInventory";
      return false;
    }
    const prev = this.data;
    this.data = d;
    write(KEY, d);
    if (prev && d.at !== prev.at) this.#record(prev, d, auto);
    return true;
  }

  #record(prev: InvData, d: InvData, auto: boolean) {
    const items = delta(prev.items, d.items);
    const mods = delta(copies(prev.mods), copies(d.mods));
    const c: InvChange = {
      at: d.at,
      from: prev.at,
      auto,
      items,
      mods,
      plat: d.plat - prev.plat,
      ducats: d.ducats - prev.ducats,
      credits: d.credits - prev.credits,
      picks: [],
    };
    try {
      c.picks = resolvePicks(prev, d, items);
    } catch {
      // database not loaded in this window
    }
    if (!Object.keys(items).length && !Object.keys(mods).length && !c.plat && !c.ducats) return;
    this.log = [c, ...this.log].slice(0, LOG_MAX);
    write(LOG_KEY, this.log);
  }
}

export const inventory = new Inventory();

// Affinity from the profile or the inventory, whichever is newer (larger): undefined when neither knows.
export function bestXp(profileXp: number | undefined, id: string): number | undefined {
  const ix = inventory.xpOf(id);
  return profileXp == null ? ix : ix == null ? profileXp : Math.max(profileXp, ix);
}

// "Refresh after a mission" (main window only, so the tool never runs twice): the game asks DE for the
// inventory itself when the player is back on the ship (EE.log, inv_helper.rs on_line); the tool runs a
// few seconds after that. Never during a mission (an endless one opens many relics: one snapshot after it
// settles them all), and at most once a minute and a half — a signal inside that gap is not dropped but
// waits for the gap to end, so the snapshot after the last mission is always taken.
const AFTER_SYNC = 6_000;
const MIN_GAP = 90_000;
export function startInventoryAuto() {
  missionState.start();
  let timer: ReturnType<typeof setTimeout> | undefined;
  let last = 0;
  const run = () => {
    timer = undefined;
    if (!inventory.auto || !inventory.ready) return;
    if (missionState.value?.active) return; // back on the ship sends the signal again
    last = Date.now();
    void inventory.refresh(true);
  };
  listen("game-inventory-sync", () => {
    if (!inventory.auto || !inventory.ready) return;
    clearTimeout(timer);
    timer = setTimeout(run, Math.max(AFTER_SYNC, last + MIN_GAP - Date.now()));
  });
}
