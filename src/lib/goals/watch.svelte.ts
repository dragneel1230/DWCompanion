// Goals outside the guide page. The main window (startGoalWatch in +layout) works out which relic rewards
// the goals still need and publishes them (localStorage `dwc.goals.need`) for the reward overlay, the hub and
// the journal; it also watches fissures in the background and sends a Windows notification when one opens
// that a goal's relic can be cracked in. Other windows only read (`needs`).
import { isPermissionGranted, requestPermission, sendNotification } from "@tauri-apps/plugin-notification";
import { t } from "$lib/i18n/index.svelte";
import { loadDrops } from "$lib/drops";
import { loadCraft } from "$lib/craft";
import { journal } from "$lib/journal.svelte";
import { profile } from "$lib/profile.svelte";
import { refreshWorld, world } from "$lib/hub/worldData.svelte";
import type { Fissure } from "$lib/api";
import { ERA_NUM, makePlan } from "./plan";
import { goals, stepState } from "./goals.svelte";

const NEED_KEY = "dwc.goals.need";
const NOTIFY_KEY = "dwc.goals.notify";
const SEEN_KEY = "dwc.goals.seen";

// Relic eras a goal is waiting on: era -> [goal name, part name, relic short name].
type Waiting = Record<string, { goal: string; part: string; relic: string }[]>;

interface Published {
  need: Record<string, string[]>; // reward id -> goals that still need it
  uses: Record<string, string[]>; // reward id -> goals it belongs to (done or not)
  eras: Waiting;
}

function readPublished(): Published {
  try {
    const s = JSON.parse(localStorage.getItem(NEED_KEY) ?? "null");
    if (s?.need) return { need: s.need, uses: s.uses ?? {}, eras: s.eras ?? {} };
  } catch {
    // storage unavailable or broken
  }
  return { need: {}, uses: {}, eras: {} };
}

class Needs {
  need = $state<Record<string, string[]>>({});
  uses = $state<Record<string, string[]>>({});
  eras = $state<Waiting>({});
  notify = $state(true);

  constructor() {
    this.#read();
    window.addEventListener("storage", (e) => (e.key === NEED_KEY || e.key === NOTIFY_KEY) && this.#read());
  }
  #read() {
    const p = readPublished();
    this.need = p.need;
    this.uses = p.uses;
    this.eras = p.eras;
    try {
      this.notify = localStorage.getItem(NOTIFY_KEY) !== "0";
    } catch {
      this.notify = true;
    }
  }
  // Re-read now: the overlay reads at the moment a reward screen shows.
  refresh() {
    this.#read();
  }
  setNotify(on: boolean) {
    this.notify = on;
    try {
      localStorage.setItem(NOTIFY_KEY, on ? "1" : "0");
    } catch {
      // storage unavailable
    }
    if (on) ensurePermission();
  }
  publish(p: Published) {
    this.need = p.need;
    this.uses = p.uses;
    this.eras = p.eras;
    try {
      localStorage.setItem(NEED_KEY, JSON.stringify(p));
    } catch {
      // storage unavailable
    }
  }
}

export const needs = new Needs();

// ---------- main window only

let started = false;

export function startGoalWatch() {
  if (started) return;
  started = true;
  journal.start();
  profile.start();
  Promise.all([loadDrops(), loadCraft()]).then(([drops, craft]) => {
    $effect.root(() => {
      // Recomputed when goals, marks, the journal or the profile change.
      $effect(() => {
        const facts = { journal: journal.list, profile: profile.data };
        const out: Published = { need: {}, uses: {}, eras: {} };
        const add = (m: Record<string, string[]>, k: string, v: string) => (m[k] ??= []).includes(v) || m[k].push(v);
        for (const g of goals.list) {
          const p = makePlan(craft, drops, g.id);
          if (!p) continue;
          for (const sec of p.sections)
            for (const s of sec.steps) {
              if (s.kind !== "relic" || !s.reward) continue;
              add(out.uses, s.reward, p.item.name);
              if (stepState(g, p, s, facts).done) continue;
              add(out.need, s.reward, p.item.name);
              const part = s.name.startsWith(p.item.name + ": ") ? s.name.slice(p.item.name.length + 2) : s.name;
              for (const r of s.relics ?? []) {
                if (r.vaulted) continue;
                (out.eras[r.era] ??= []).push({ goal: p.item.name, part, relic: r.s });
              }
            }
        }
        needs.publish(out);
      });
    });
    pollFissures();
  });
}

// Background fissure check: only while some goal waits on a relic and notifications are on. worldState is
// DE's public file (the hub polls it too); one request every 3 minutes.
let poll: ReturnType<typeof setInterval> | undefined;
function pollFissures() {
  $effect.root(() => {
    $effect(() => {
      clearInterval(poll);
      if (!needs.notify || !Object.keys(needs.eras).length) return;
      const tick = () => refreshWorld().then(check).catch(() => {});
      tick();
      poll = setInterval(tick, 3 * 60_000);
    });
  });
}

function readSeen(): Record<string, number> {
  try {
    return JSON.parse(localStorage.getItem(SEEN_KEY) ?? "{}");
  } catch {
    return {};
  }
}

const TIER_ERA: Record<number, string> = Object.fromEntries(Object.entries(ERA_NUM).map(([e, n]) => [n, e]));

// Which waiting relics a fissure takes: its own tier; Omnia takes any but Requiem.
function waitingFor(f: Fissure): { goal: string; part: string; relic: string }[] {
  if (f.isStorm) return [];
  if (f.tierNum === 6) return Object.entries(needs.eras).flatMap(([era, w]) => (era === "Requiem" ? [] : w));
  return needs.eras[TIER_ERA[f.tierNum]] ?? [];
}

async function check() {
  const now = Date.now();
  const seen = Object.fromEntries(Object.entries(readSeen()).filter(([, exp]) => exp > now));
  const fresh = world.fissures.filter((f) => f.expiry - now > 10 * 60_000 && !seen[f.id] && waitingFor(f).length);
  for (const f of world.fissures) if (f.expiry > now && waitingFor(f).length) seen[f.id] = f.expiry;
  try {
    localStorage.setItem(SEEN_KEY, JSON.stringify(seen));
  } catch {
    // storage unavailable
  }
  if (!fresh.length || !(await ensurePermission())) return;
  // One notification per check: the longest-lasting new fissure, the rest as a count.
  const f = [...fresh].sort((a, b) => b.expiry - a.expiry)[0];
  const w = waitingFor(f)[0];
  const mins = Math.round((f.expiry - now) / 60_000);
  const left = mins >= 60 ? t("unit.hm", { h: Math.floor(mins / 60), m: mins % 60 }) : t("unit.minutes", { v: mins });
  sendNotification({
    title: t("goal.notify.title", { tier: f.tier, goal: w.goal }),
    body:
      t("goal.notify.body", { relic: w.relic, part: w.part, mission: f.mission, node: f.node, left, hard: f.isHard ? t("goal.notify.sp") : "" }) +
      (fresh.length > 1 ? " " + t("goal.notify.more", { n: fresh.length - 1 }) : ""),
  });
}

async function ensurePermission(): Promise<boolean> {
  try {
    if (await isPermissionGranted()) return true;
    return (await requestPermission()) === "granted";
  } catch {
    return false;
  }
}

// The item in an overlay card / journal row: which goals still need it.
export const neededBy = (id: string | undefined | null): string[] => (id ? (needs.need[id] ?? []) : []);
