// Notification filters at work. The main window (startNotifyWatch in +layout) ticks once a minute: the
// foundry and open-world cycles are worked out locally, DE's worldState is asked every 3 minutes (only while
// some world rule is on), warframe.market prices every 10 minutes (only for price rules). Each event is
// notified once (`dwc.notify.seen`, until it expires). With «quiet» on, nothing is sent during a mission and
// nothing is marked seen, so it comes when the player is back on the ship. Settings use `ruleEvents` for the
// "matches now" preview.
import { isPermissionGranted, requestPermission, sendNotification } from "@tauri-apps/plugin-notification";
import { t } from "$lib/i18n/index.svelte";
import { getDb } from "$lib/db";
import { getAlerts, getInvasions, getPrice, type Alert, type Invasion, type Reward } from "$lib/api";
import { refreshWorld, world } from "$lib/hub/worldData.svelte";
import { cycles } from "$lib/cycles";
import { baroItems, type BaroItem } from "$lib/baro";
import { describe, loadInvCtx, type InvCtx } from "$lib/inv/ctx";
import { inventory } from "$lib/inventory.svelte";
import { missionState } from "$lib/missionState.svelte";
import { building } from "$lib/ship/foundry";
import { notify, type Rule } from "./rules.svelte";

const SEEN_KEY = "dwc.notify.seen";
const MIN = 60_000;
const WORLD_EVERY = 3 * MIN;
const PRICE_EVERY = 10 * MIN;

export interface NEvent {
  key: string; // once per key
  until: number; // forget the key after this
  title: string;
  body: string;
}

// What the world rules look at, fetched together.
export interface WorldData {
  invasions: Invasion[];
  alerts: Alert[];
  baro: BaroItem[]; // his stock while he is here
  prices: Record<string, number | null>; // slug -> cheapest online seller
}

const dur = (ms: number) => {
  const m = Math.max(0, Math.round(ms / MIN));
  return m >= 60 ? t("unit.hm", { h: Math.floor(m / 60), m: m % 60 }) : t("unit.minutes", { v: m });
};
const words = (text: string | undefined) =>
  (text ?? "")
    .split(",")
    .map((w) => w.trim().toLowerCase())
    .filter(Boolean);

function rewardText(c: InvCtx, list: Reward[]): { names: string[]; text: string } {
  const names = list.map((r) => describe(c, r.id).name);
  return { names, text: list.map((r, i) => (r.n > 1 ? `${names[i]} ×${r.n}` : names[i])).join(", ") };
}
const hits = (names: string[], w: string[]) => w.length > 0 && names.some((n) => w.some((x) => n.toLowerCase().includes(x)));

// Events a rule matches now. `c` names rewards; `d` is null until world data came (world rules then match nothing).
export function ruleEvents(r: Rule, c: InvCtx | null, d: WorldData | null, now = Date.now()): NEvent[] {
  const out: NEvent[] = [];
  if (r.kind === "fissure") {
    const types = getDb().world.missionType;
    const missions = new Set((r.missions ?? []).map((m) => types[m] ?? m));
    for (const f of world.fissures) {
      if (f.expiry - now < 10 * MIN) continue;
      if (r.tiers?.length && !r.tiers.includes(f.tierNum)) continue;
      if (missions.size && !missions.has(f.mission)) continue;
      const mode = r.mode ?? "any";
      if (mode === "storm" ? !f.isStorm : mode === "hard" ? !f.isHard || f.isStorm : mode === "normal" ? f.isHard || f.isStorm : false) continue;
      const kind = f.isStorm ? t("notify.storm") : f.isHard ? t("notify.sp") : "";
      out.push({
        key: `fis:${f.id}`,
        until: f.expiry,
        title: t("notify.fissure.title", { tier: f.tier, mission: f.mission }),
        body: t("notify.fissure.body", { node: f.node, kind: kind ? ` · ${kind}` : "", left: dur(f.expiry - now) }),
      });
    }
  } else if (r.kind === "invasion" && c && d) {
    const w = words(r.text);
    for (const v of d.invasions) {
      const rw = rewardText(c, v.rewards);
      if (!hits(rw.names, w)) continue;
      out.push({ key: `inv:${v.id}`, until: now + 3 * 24 * 60 * MIN, title: t("notify.invasion.title"), body: t("notify.invasion.body", { rewards: rw.text, node: v.node }) });
    }
  } else if (r.kind === "alert" && c && d) {
    const w = words(r.text);
    for (const a of d.alerts) {
      const rw = rewardText(c, a.rewards);
      if (!hits(rw.names, w)) continue;
      out.push({ key: `alert:${a.id}`, until: a.expiry, title: t("notify.alert.title"), body: t("notify.alert.body", { rewards: rw.text, mission: a.mission, node: a.node, left: dur(a.expiry - now) }) });
    }
  } else if (r.kind === "baro") {
    const b = world.timers?.baro;
    if (!b || b.from > now || b.to <= now) return out;
    const w = words(r.text);
    if (!w.length) {
      out.push({ key: `baro:${b.from}`, until: b.to, title: t("notify.baro.title"), body: t("notify.baro.body", { relay: b.relay, left: dur(b.to - now) }) });
    } else if (d) {
      const found = d.baro.filter((x) => hits([x.name], w));
      if (found.length)
        out.push({
          key: `baro:${b.from}:${r.id}`,
          until: b.to,
          title: t("notify.baroItems.title"),
          body: t("notify.baroItems.body", { items: found.map((x) => x.name).join(", "), relay: b.relay }),
        });
    }
  } else if (r.kind === "cycle" && r.cycle && world.timers) {
    const [place, state] = r.cycle.split("-");
    const cy = cycles(now, world.timers.cetusEnd).find((x) => x.id === place);
    if (!cy) return out;
    const before = (r.before ?? 0) * MIN;
    const label = `${t(`cycle.${state}` as never)} — ${cy.place}`;
    if (cy.kind === state && !before) out.push({ key: `cyc:${r.id}:${cy.ends}`, until: cy.ends, title: label, body: t("notify.cycle.now", { left: dur(cy.ends - now) }) });
    else if (cy.kind !== state && before && cy.ends - now <= before)
      out.push({ key: `cyc:${r.id}:${cy.ends}`, until: cy.ends + MIN, title: label, body: t("notify.cycle.soon", { left: dur(cy.ends - now) }) });
  } else if (r.kind === "price" && r.slug && d) {
    const p = d.prices[r.slug];
    if (p != null && p <= (r.below ?? 0))
      out.push({ key: `price:${r.id}`, until: now + 24 * 60 * MIN, title: t("notify.price.title", { name: r.name ?? r.slug }), body: t("notify.price.body", { p, below: r.below ?? 0 }) });
  }
  return out;
}

// Blueprints that became ready within the last 12 hours (older ones were surely seen in the game).
export function foundryEvents(c: InvCtx, now = Date.now()): NEvent[] {
  const inv = inventory.data;
  if (!inv) return [];
  return building(c, inv)
    .filter((b) => b.done <= now && b.done > now - 12 * 60 * MIN)
    .map((b) => ({ key: `fdy:${b.oid}`, until: b.done + 14 * 24 * 60 * MIN, title: t("notify.foundry.title"), body: b.name }));
}

const WORLD_KINDS = new Set(["invasion", "alert", "baro"]);

// World data for the given rules (settings preview, the watcher).
export async function worldFor(rules: Rule[]): Promise<WorldData> {
  const on = (k: string) => rules.some((r) => r.kind === k);
  const d: WorldData = { invasions: [], alerts: [], baro: [], prices: {} };
  await Promise.all([
    on("invasion") ? getInvasions().then((x) => (d.invasions = x)) : null,
    on("alert") ? getAlerts().then((x) => (d.alerts = x)) : null,
    on("baro") && world.timers?.baro?.items?.length ? baroItems(world.timers.baro.items).then((x) => (d.baro = x)) : null,
    ...rules
      .filter((r) => r.kind === "price" && r.slug)
      .map((r) => getPrice(r.slug!).then((p) => (d.prices[r.slug!] = p?.sell ?? null)).catch(() => {})),
  ]);
  return d;
}

// ---------- main window only

function readSeen(): Record<string, number> {
  try {
    return JSON.parse(localStorage.getItem(SEEN_KEY) ?? "{}");
  } catch {
    return {};
  }
}
function writeSeen(s: Record<string, number>) {
  try {
    localStorage.setItem(SEEN_KEY, JSON.stringify(s));
  } catch {
    // storage unavailable
  }
}

export async function ensurePermission(): Promise<boolean> {
  try {
    if (await isPermissionGranted()) return true;
    return (await requestPermission()) === "granted";
  } catch {
    return false;
  }
}

let started = false;
export function startNotifyWatch() {
  if (started) return;
  started = true;
  missionState.start();
  let lastWorld = 0;
  let lastPrice = 0;
  let data: WorldData | null = null;
  let busy = false;

  const tick = async () => {
    if (busy) return;
    busy = true;
    try {
      const s = notify.value;
      const rules = s.rules.filter((r) => r.on);
      if (!s.foundry && !rules.length) return;
      const now = Date.now();
      const c = await loadInvCtx();
      // worldState: fissures / Baro / cycles (refreshWorld) and invasions / alerts (worldFor) every 3 min.
      const needWorld = rules.some((r) => r.kind !== "price");
      if (needWorld && now - lastWorld >= WORLD_EVERY) {
        lastWorld = now;
        await refreshWorld();
        const w = await worldFor(rules.filter((r) => WORLD_KINDS.has(r.kind)));
        data = { ...(data ?? { prices: {} }), invasions: w.invasions, alerts: w.alerts, baro: w.baro, prices: data?.prices ?? {} };
      }
      if (rules.some((r) => r.kind === "price") && now - lastPrice >= PRICE_EVERY) {
        lastPrice = now;
        const w = await worldFor(rules.filter((r) => r.kind === "price"));
        data = { ...(data ?? { invasions: [], alerts: [], baro: [] }), prices: w.prices };
      }
      const seen = Object.fromEntries(Object.entries(readSeen()).filter(([, until]) => until > now));
      // A price back above the line: the next drop notifies again.
      for (const r of rules)
        if (r.kind === "price" && r.slug && data && (data.prices[r.slug] ?? 0) > (r.below ?? 0)) delete seen[`price:${r.id}`];
      const events = [...(s.foundry ? foundryEvents(c, now) : []), ...rules.flatMap((r) => ruleEvents(r, c, data, now))].filter((e) => !seen[e.key]);
      // Dedupe (two rules matching one fissure).
      const fresh = [...new Map(events.map((e) => [e.key, e])).values()];
      if (!fresh.length || (s.quiet && missionState.value?.active)) {
        writeSeen(seen);
        return;
      }
      if (!(await ensurePermission())) return;
      // Up to three separate notifications; the rest in one.
      for (const e of fresh.slice(0, 3)) sendNotification({ title: e.title, body: e.body });
      if (fresh.length > 3) sendNotification({ title: t("notify.more.title"), body: fresh.slice(3).map((e) => e.title).join("; ") });
      for (const e of fresh) seen[e.key] = e.until;
      writeSeen(seen);
    } catch {
      // network or data hiccup: the next tick tries again
    } finally {
      busy = false;
    }
  };
  setTimeout(tick, 5_000);
  setInterval(tick, MIN);
}
