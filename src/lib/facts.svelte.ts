// Short facts for mini cards (search results, market rows, tiles): what the player holds of it (inventory)
// and what it is worth (yesterday's deals / the day's average). One place, so every list says the same.
import { getDb, type EntryKind } from "$lib/db";
import { bulkSell, loadBulk } from "$lib/api";
import { dayPrice, loadMarketDay } from "$lib/marketDay";
import { inventory } from "$lib/inventory.svelte";
import { t } from "$lib/i18n/index.svelte";

// Prices arrive after the first render: a tick makes the chips read them again.
const tick = $state({ v: 0 });
let loading = false;
function wantPrices() {
  if (loading) return;
  loading = true;
  loadBulk().then(() => tick.v++).catch(() => {});
  loadMarketDay().then(() => tick.v++).catch(() => {});
}

export interface Facts {
  own: string | null; // "у тебя 3", "части 2/4", "в арсенале · 3 формы"
  full: boolean; // the player has it whole (a complete set, the item in the arsenal)
  plat: number | null;
}

// Relics held, by relic key, all refinements together.
let relicCache: { at: number; map: Map<string, number> } | null = null;
function relicsHeld(): Map<string, number> {
  const inv = inventory.data;
  if (!inv) return new Map();
  if (relicCache?.at === inv.got) return relicCache.map;
  const db = getDb();
  const map = new Map<string, number>();
  for (const [id, n] of Object.entries(inv.items)) {
    if (!id.includes("/Projections/") || n <= 0) continue;
    const base = id.split("/").pop()!.replace(/(Bronze|Silver|Gold|Platinum)$/, "");
    const key = db.projections[base];
    if (key) map.set(key, (map.get(key) ?? 0) + n);
  }
  relicCache = { at: inv.got, map };
  return map;
}

// Arsenal line: "в арсенале · 3 формы · реактор".
export function gearLine(id: string, frameLike: boolean): string | null {
  if (!inventory.inArsenal(id)) return null;
  const g = inventory.gearOf(id);
  const parts = [t("fact.inArsenal")];
  if (g?.forma) parts.push(t("fact.forma", { n: g.forma }));
  if (g?.potato) parts.push(frameLike ? t("fact.reactor") : t("fact.catalyst"));
  return parts.join(" · ");
}

export function factsOf(kind: EntryKind, id: string, slug?: string): Facts {
  wantPrices();
  void tick.v;
  const db = getDb();
  const inv = inventory.data;
  const out: Facts = { own: null, full: false, plat: null };
  if (kind === "set") {
    const s = db.sets[id];
    if (!s) return out;
    out.plat = bulkSell(s.slug) ?? dayPrice(s.slug)?.price ?? null;
    if (inv) {
      const parts = s.parts.filter((p) => (inv.items[p] ?? 0) > 0).length;
      const whole = Math.min(...s.parts.map((p) => inv.items[p] ?? 0));
      if (whole > 0) (out.own = t("fact.sets", { n: whole })), (out.full = true);
      else if (parts) out.own = t("fact.parts", { a: parts, b: s.parts.length });
    }
  } else if (kind === "item") {
    const it = db.items[id];
    if (!it) return out;
    out.plat = (it.slug && (bulkSell(it.slug) ?? dayPrice(it.slug)?.price)) || null;
    const n = inventory.count(id);
    if (n) out.own = t("fact.have", { n });
  } else if (kind === "relic") {
    const r = db.relics[id];
    if (!r) return out;
    out.plat = dayPrice(r.slug)?.price ?? null;
    const n = relicsHeld().get(id);
    if (n) out.own = t("fact.have", { n });
  } else if (kind === "mod" || kind === "arcane") {
    out.plat = dayPrice(slug)?.price ?? null;
    const m = inv?.mods[id];
    if (m) out.own = m[0] > 1 ? t("fact.copies", { n: m[0], r: m[1] }) : t("fact.rank", { r: m[1] });
  } else if (kind === "resource") {
    const n = inventory.count(id);
    if (n) out.own = t("fact.have", { n });
  } else if (kind === "frame" || kind === "craft") {
    const line = gearLine(id, kind === "frame");
    if (line) (out.own = line), (out.full = true);
  }
  return out;
}
