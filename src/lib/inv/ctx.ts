// What the inventory tab reads besides the snapshot: mods and arcanes (names, market slugs), crafting and
// drops (names of everything else, where relics drop), market item ids (the player's orders).
import { getDb, iconUrl, itemName } from "$lib/db";
import { loadFrames, loadOtherMods, type Arcane, type FramesDb, type Mod } from "$lib/frames";
import { loadCraft, type CraftDb } from "$lib/craft";
import { loadDrops, type DropsDb } from "$lib/drops";
import { loadWfmItems } from "$lib/wfm.svelte";
import { REFINE_RU, type Refine } from "$lib/relicValue";
import { t } from "$lib/i18n/index.svelte";

export interface InvCtx {
  frames: FramesDb;
  other: Record<string, Mod>;
  craft: CraftDb;
  drops: DropsDb;
  wfmId: Map<string, string>; // slug -> market item id
  bpOf: Map<string, string>; // blueprint id -> the item it builds
}

let load: Promise<InvCtx> | null = null;
export function loadInvCtx(): Promise<InvCtx> {
  load ??= Promise.all([loadFrames(), loadOtherMods().catch(() => ({})), loadCraft(), loadDrops(), loadWfmItems()]).then(
    ([frames, other, craft, drops, items]) => {
      const bpOf = new Map<string, string>();
      for (const [id, c] of Object.entries(craft.items)) {
        if (c.r) bpOf.set(c.r, id);
        if (c.bp) bpOf.set(c.bp, id);
      }
      return { frames, other, craft, drops, wfmId: new Map([...items.values()].map((it) => [it.slug, it.id])), bpOf };
    },
  );
  load.catch(() => (load = null));
  return load;
}

const REFINE_OF: Record<string, Refine> = { Bronze: "intact", Silver: "exceptional", Gold: "flawless", Platinum: "radiant" };

// Name and icon of anything the inventory holds.
export function describe(c: InvCtx, id: string): { name: string; icon: string; slug?: string; mod?: Mod; arcane?: Arcane } {
  const db = getDb();
  const it = db.items[id];
  if (it) return { name: itemName(it), icon: iconUrl(it.icon), slug: it.slug };
  if (id.includes("/Projections/")) {
    const m = id.split("/").pop()!.match(/^(.*?)(Bronze|Silver|Gold|Platinum)$/);
    const r = m ? db.relics[db.projections[m[1]]] : undefined;
    if (m && r) return { name: `${r.s} · ${REFINE_RU[REFINE_OF[m[2]]]}`, icon: iconUrl(r.icon), slug: r.slug };
  }
  const arcane = c.frames.arcanes[id];
  if (arcane) return { name: arcane.name, icon: iconUrl(arcane.icon), slug: arcane.slug, arcane };
  const mod = c.frames.mods[id] ?? c.other[id];
  if (mod) return { name: mod.name, icon: iconUrl(mod.icon), slug: mod.slug, mod };
  const cr = c.craft.items[id] ?? c.craft.names[id];
  if (cr) return { name: cr.name, icon: iconUrl(cr.icon) };
  const res = c.drops.resources[id];
  if (res) return { name: res.name, icon: iconUrl(res.icon) };
  const built = c.bpOf.get(id);
  if (built) return { name: t("inv.bpOf", { n: c.craft.items[built].name }), icon: iconUrl(c.craft.items[built].icon) };
  const bn = c.craft.bpNames?.[id];
  if (bn) return { name: t("inv.bpOf", { n: bn[0] }), icon: iconUrl(bn[1]) };
  return { name: id.split("/").pop()!.replace(/([a-z])([A-Z])/g, "$1 $2"), icon: "" };
}
