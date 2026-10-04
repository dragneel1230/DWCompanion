// What the player put aside for now (categories, single items, Steel Path): the MR plan and the
// "fastest way" lists leave it out. localStorage `dwc.coll.skip`, shared by the app and the hub.
import type { MasteryCat, Row } from "$lib/mastery";

const KEY = "dwc.coll.skip";
type Saved = { cats: MasteryCat[]; ids: string[]; sp: boolean };

function read(): Saved {
  try {
    const s = JSON.parse(localStorage.getItem(KEY) ?? "null");
    if (s) return { cats: s.cats ?? [], ids: s.ids ?? [], sp: !!s.sp };
  } catch {
    // storage unavailable
  }
  return { cats: [], ids: [], sp: false };
}

export const skip = $state<Saved>(read());

function save() {
  try {
    localStorage.setItem(KEY, JSON.stringify(skip));
  } catch {
    // storage unavailable
  }
}

// The other window changed it.
if (typeof window !== "undefined")
  window.addEventListener("storage", (e) => {
    if (e.key === KEY) Object.assign(skip, read());
  });

export const skipped = (r: Row) => skip.cats.includes(r.it.cat) || skip.ids.includes(r.id);
export const skipCount = () => skip.cats.length + skip.ids.length + (skip.sp ? 1 : 0);

export function toggleCat(c: MasteryCat) {
  skip.cats = skip.cats.includes(c) ? skip.cats.filter((x) => x !== c) : [...skip.cats, c];
  save();
}
export function toggleId(id: string) {
  skip.ids = skip.ids.includes(id) ? skip.ids.filter((x) => x !== id) : [...skip.ids, id];
  save();
}
export function toggleSp() {
  skip.sp = !skip.sp;
  save();
}
