// World data of the hub (fissures, timers, this week's activities) kept across hub opens and app restarts.
// The hub unmounts its content when hidden, so state lives here: the cached copy is shown at once,
// then refreshed in the background. Rows that did not change keep their objects, so a keyed {#each}
// only adds the new ones and drops the gone ones.
import { getFissures, getTimers, getWeek, type Fissure, type Timers, type Week } from "$lib/api";

const KEY = "dwc.hub.world";

interface Saved {
  fissures: Fissure[];
  timers: Timers | null;
  week?: Week | null;
}

function load(): Saved {
  try {
    const s = JSON.parse(localStorage.getItem(KEY) ?? "null") as Saved | null;
    if (s) return { fissures: s.fissures.filter((f) => f.expiry > Date.now()), timers: s.timers, week: s.week ?? null };
  } catch {
    // storage unavailable or broken
  }
  return { fissures: [], timers: null, week: null };
}

function save() {
  try {
    localStorage.setItem(KEY, JSON.stringify({ fissures: world.fissures, timers: world.timers, week: world.week }));
  } catch {
    // storage unavailable
  }
}

const saved = load();

export const world = $state({
  fissures: saved.fissures,
  timers: saved.timers,
  week: saved.week ?? null,
  loaded: saved.fissures.length > 0, // something to show, even if from the cache
  error: "",
});

// Same id and expiry = same fissure: keep the old object.
function merge(old: Fissure[], fresh: Fissure[]): Fissure[] {
  const byId = new Map(old.map((f) => [f.id, f]));
  return fresh.map((f) => {
    const o = byId.get(f.id);
    return o && o.expiry === f.expiry && o.node === f.node ? o : f;
  });
}

let inflight: Promise<void> | null = null;

export function refreshWorld(): Promise<void> {
  inflight ??= Promise.all([
    getFissures().then((f) => {
      world.fissures = merge(world.fissures, f);
      world.loaded = true;
    }),
    getTimers().then((t) => (world.timers = t)),
    getWeek().then((w) => (world.week = w)),
  ])
    .then(() => {
      world.error = "";
      save();
    })
    .catch((e) => {
      world.error = String(e);
    })
    .finally(() => (inflight = null));
  return inflight;
}

// While the hub is open: refresh now and once a minute.
let poll: ReturnType<typeof setInterval> | undefined;
export function watchWorld(open: boolean) {
  clearInterval(poll);
  if (!open) return;
  refreshWorld();
  poll = setInterval(refreshWorld, 60_000);
}
