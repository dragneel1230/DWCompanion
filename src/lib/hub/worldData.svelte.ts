// World data of the hub (fissures, timers) kept across hub opens and app restarts.
// The hub unmounts its content when hidden, so state lives here: the cached copy is shown at once,
// then refreshed in the background. Rows that did not change keep their objects, so a keyed {#each}
// only adds the new ones and drops the gone ones.
import { getFissures, getTimers, type Fissure, type Timers } from "$lib/api";

const KEY = "dwc.hub.world";

interface Saved {
  fissures: Fissure[];
  timers: Timers | null;
}

function load(): Saved {
  try {
    const s = JSON.parse(localStorage.getItem(KEY) ?? "null") as Saved | null;
    if (s) return { fissures: s.fissures.filter((f) => f.expiry > Date.now()), timers: s.timers };
  } catch {
    // storage unavailable or broken
  }
  return { fissures: [], timers: null };
}

function save() {
  try {
    localStorage.setItem(KEY, JSON.stringify({ fissures: world.fissures, timers: world.timers }));
  } catch {
    // storage unavailable
  }
}

const saved = load();

export const world = $state({
  fissures: saved.fissures,
  timers: saved.timers,
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
