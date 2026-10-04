// Baro Ki'Teer's stock: worldState gives store paths ("/Lotus/StoreItems/Upgrades/..."), names come from
// static/data/<lang>/vendor.json (scripts/build-data.mjs), relic projections from db.json.
import { dataUrl } from "$lib/i18n/index.svelte";
import { getDb } from "$lib/db";
import type { BaroOffer } from "$lib/api";

// m mod, w weapon, c cosmetic, d ship decoration, o other, r relic
export type BaroKind = "m" | "w" | "c" | "d" | "o" | "r";

export interface BaroItem extends BaroOffer {
  id: string; // game uniqueName ("/Lotus/Upgrades/...")
  name: string;
  icon: string | null;
  kind: BaroKind;
  slug?: string; // warframe.market
  bp?: boolean;
  relic?: string; // db.relics key
}

type Row = [name: string, icon: string, kind: BaroKind, slug?: string, bp?: 1];
let cache: Promise<Record<string, Row>> | null = null;
function loadVendor(): Promise<Record<string, Row>> {
  cache ??= fetch(dataUrl("vendor.json"))
    .then((r) => r.json() as Promise<{ items: Record<string, Row> }>)
    .then((v) => v.items);
  cache.catch(() => (cache = null));
  return cache;
}

// Icon as kept in vendor.json: a game path, or one relative to /Lotus/Interface/Icons/.
const fullIcon = (p: string) => (!p ? null : p.startsWith("/") ? p : `/Lotus/Interface/Icons/${p}`);

export async function baroItems(offers: BaroOffer[]): Promise<BaroItem[]> {
  const v = await loadVendor();
  const db = getDb();
  return offers.map((o) => {
    const raw = o.type.replace(/^\/Lotus\//, "");
    const short = raw.replace(/^Types\/StoreItems\//, "Types/").replace("StoreItems/", "");
    const id = `/Lotus/${short}`;
    const relic = db.projections[short.split("/").pop()!.replace(/(Bronze|Silver|Gold|Platinum)$/, "")];
    if (relic) {
      const r = db.relics[relic];
      return { ...o, id, name: r.name, icon: r.icon, kind: "r", slug: r.slug, relic };
    }
    const row = v[short] ?? v[raw];
    if (!row) return { ...o, id, name: short.split("/").pop()!, icon: null, kind: "o" };
    const [name, icon, kind, slug, bp] = row;
    return { ...o, id, name, icon: fullIcon(icon), kind, slug: slug || undefined, bp: !!bp };
  });
}
