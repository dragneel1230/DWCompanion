// The player's public Warframe profile: DE's getProfileViewingData (the same file the game reads to
// show someone's profile). No login or session token: only the account id, which EE.log gives
// (journal.rs, "<account> gets reward") or the player types in. Cached in localStorage (shared by
// the app and the hub window); the endpoint is rate-limited, so at most one request per minute.
import { invoke } from "@tauri-apps/api/core";
import { fetch } from "@tauri-apps/plugin-http";
import { t } from "$lib/i18n/index.svelte";

export interface Profile {
  at: number;
  account: string;
  name: string;
  mr: number;
  xp: Record<string, number>; // item uniqueName -> affinity
  missions: { tag: string; sp: boolean }[];
  skills: Record<string, number>; // intrinsics
  // Below: added 2026-10-01, absent in older caches.
  created?: number;
  clan?: string;
  syndicates?: { tag: string; standing: number; title: number }[];
  daily?: Record<string, number>; // standing still allowed today by limit bin: NORMAL, CETUS, … (as of `at`)
  dailyFocus?: number;
  loadout?: Gear[];
  focus?: string; // AP_POWER …
  stats?: Stats;
}

export interface Gear {
  slot: "suit" | "primary" | "secondary" | "melee";
  type: string;
  xp: number;
  forma: number;
  name?: string; // the player's own name for it
}

export interface UseStat {
  type: string;
  time: number; // seconds equipped
  kills: number;
  headshots: number;
  xp: number;
}

export interface Stats {
  played: number; // seconds
  missions: { done: number; failed: number; quit: number };
  kills: number;
  headshots: number;
  meleeKills: number;
  income: number;
  deaths: number;
  revives: number;
  pickups: number;
  fish: number;
  ciphers: number;
  scans: number;
  destroyed: number;
  gear: UseStat[]; // most used first, top 120
  enemies: { type: string; kills: number }[]; // top 12
  abilities: { type: string; used: number }[]; // top 12
}

type Raw = Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any

// Standing still allowed today, by limit bin: "DailyAffiliationCetus" -> CETUS, "DailyAffiliation" -> NORMAL.
function dailyOf(r: Raw): Record<string, number> {
  const out: Record<string, number> = {};
  for (const [k, v] of Object.entries(r)) {
    const m = k.match(/^DailyAffiliation(\w*)$/);
    if (m && typeof v === "number") out[m[1] ? m[1].toUpperCase() : "NORMAL"] = v;
  }
  return out;
}

function statsOf(s: Raw | undefined): Stats | undefined {
  if (!s) return undefined;
  const enemies = (s.Enemies ?? []) as Raw[];
  const top = <T>(list: T[], key: (x: T) => number, n: number) => [...list].sort((a, b) => key(b) - key(a)).slice(0, n);
  return {
    played: s.TimePlayedSec ?? 0,
    missions: { done: s.MissionsCompleted ?? 0, failed: s.MissionsFailed ?? 0, quit: s.MissionsQuit ?? 0 },
    kills: enemies.reduce((n, e) => n + (e.kills ?? 0), 0),
    headshots: enemies.reduce((n, e) => n + (e.headshots ?? 0), 0),
    meleeKills: s.MeleeKills ?? 0,
    income: s.Income ?? 0,
    deaths: s.Deaths ?? 0,
    revives: s.ReviveCount ?? 0,
    pickups: s.PickupCount ?? 0,
    fish: s.FishCount ?? 0,
    ciphers: s.CiphersSolved ?? 0,
    scans: ((s.Scans ?? []) as Raw[]).reduce((n, x) => n + (x.scans ?? 0), 0),
    destroyed: s.DestroyCount ?? 0,
    gear: top((s.Weapons ?? []) as Raw[], (w) => w.equipTime ?? 0, 120).map((w) => ({
      type: w.type, time: w.equipTime ?? 0, kills: w.kills ?? 0, headshots: w.headshots ?? 0, xp: w.xp ?? 0,
    })),
    enemies: top(enemies, (e) => e.kills ?? 0, 12).map((e) => ({ type: e.type, kills: e.kills ?? 0 })),
    abilities: top((s.Abilities ?? []) as Raw[], (a) => a.used ?? 0, 12).map((a) => ({ type: a.type, used: a.used ?? 0 })),
  };
}

function loadoutOf(inv: Raw): Gear[] {
  const SLOTS: [string, Gear["slot"]][] = [["Suits", "suit"], ["LongGuns", "primary"], ["Pistols", "secondary"], ["Melee", "melee"]];
  return SLOTS.flatMap(([key, slot]) =>
    ((inv?.[key] ?? []) as Raw[]).slice(0, 1).map((x) => ({ slot, type: x.ItemType, xp: x.XP ?? 0, forma: x.Polarized ?? 0, name: x.ItemName || undefined })),
  );
}

const URL = "https://api.warframe.com/cdn/getProfileViewingData.php?playerId=";
const KEY = "dwc.profile";
const KEY_ACC = "dwc.account"; // typed in by the player, wins over the one from the log
const STALE = 10 * 60_000;
const MIN_GAP = 60_000;
export const ID_RE = /^[0-9a-f]{24}$/i;

type Status = "idle" | "loading" | "ok" | "noaccount" | "empty" | "error";

function readCache(): Profile | null {
  try {
    return JSON.parse(localStorage.getItem(KEY) ?? "null");
  } catch {
    return null;
  }
}

class ProfileStore {
  data = $state<Profile | null>(readCache());
  status = $state<Status>("idle");
  error = $state("");
  account = $state<string | null>(null);
  manual = $state(false);
  #last = 0;
  #started = false;

  async start() {
    if (this.#started) return;
    this.#started = true;
    window.addEventListener("storage", (e) => {
      if (e.key === KEY) this.data = readCache();
    });
    await this.findAccount();
    const old = !this.data?.stats; // cached before syndicates / stats were read
    if (!this.data || old || Date.now() - this.data.at > STALE || this.data.account !== this.account) this.refresh();
    else this.status = "ok";
  }

  async findAccount() {
    let typed: string | null = null;
    try {
      typed = localStorage.getItem(KEY_ACC);
    } catch {
      // storage unavailable
    }
    const fromLog = await invoke<string | null>("account_id").catch(() => null);
    this.manual = !!typed;
    this.account = typed || fromLog;
    if (!this.account) this.status = "noaccount";
  }

  setAccount(id: string | null) {
    try {
      if (id) localStorage.setItem(KEY_ACC, id.trim());
      else localStorage.removeItem(KEY_ACC);
    } catch {
      // storage unavailable
    }
    this.#last = 0;
    this.findAccount().then(() => {
      if (this.account) this.refresh(true);
    });
  }

  async refresh(force = false) {
    if (!this.account) return this.findAccount();
    if (this.status === "loading" || (!force && Date.now() - this.#last < MIN_GAP)) return;
    this.#last = Date.now();
    this.status = "loading";
    try {
      const res = await fetch(URL + this.account);
      if (!res.ok) throw new Error(t("profile.httpError", { status: res.status }));
      const text = await res.text();
      if (!text.trim()) {
        this.status = "empty"; // unknown id, or DE's rate limit
        return;
      }
      const full = JSON.parse(text);
      const r = full.Results?.[0];
      const xpInfo = r?.LoadOutInventory?.XPInfo as { ItemType: string; XP: number }[] | undefined;
      if (!r || !xpInfo) {
        this.status = "empty";
        return;
      }
      const p: Profile = {
        at: Date.now(),
        account: this.account,
        name: r.DisplayName ?? "",
        mr: r.PlayerLevel ?? 0,
        xp: Object.fromEntries(xpInfo.map((x) => [x.ItemType, x.XP])),
        missions: (r.Missions ?? []).map((m: { Tag: string; Tier?: number }) => ({ tag: m.Tag, sp: m.Tier === 1 })),
        skills: r.PlayerSkills ?? {},
        created: Number(r.Created?.$date?.$numberLong) || undefined,
        clan: r.GuildName || undefined,
        syndicates: ((r.Affiliations ?? []) as Raw[]).map((a) => ({ tag: a.Tag, standing: a.Standing ?? 0, title: a.Title ?? 0 })),
        daily: dailyOf(r),
        dailyFocus: r.DailyFocus,
        loadout: loadoutOf(r.LoadOutInventory),
        focus: r.LoadOutPreset?.FocusSchool,
        stats: statsOf(full.Stats),
      };
      this.data = p;
      this.status = "ok";
      this.error = "";
      try {
        localStorage.setItem(KEY, JSON.stringify(p));
      } catch {
        // storage unavailable: lasts for this session
      }
    } catch (e) {
      this.status = "error";
      this.error = String(e);
    }
  }
}

export const profile = new ProfileStore();
