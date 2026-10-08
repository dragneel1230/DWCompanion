// The app page of a tradable item (by its warframe.market slug): prime part, set, relic, mod or arcane.
// A plain <a href> to it opens the page in the app and a card in the hub (hub.ts viewOf).
import { getDb } from "$lib/db";
import { cardBySlug } from "$lib/modBySlug.svelte";

const q = (id: string) => encodeURIComponent(id);

export function pageOfSlug(slug: string | undefined): string | null {
  if (!slug) return null;
  const c = cardBySlug(slug);
  if (c.mod) return `/market?id=${q(c.id!)}`;
  if (c.arcane) return `/market?id=${q(c.id!)}&k=arcane`;
  let db;
  try {
    db = getDb();
  } catch {
    return null; // database not loaded in this window
  }
  for (const [id, s] of Object.entries(db.sets)) if (s.slug === slug) return `/set?id=${q(id)}`;
  for (const [id, it] of Object.entries(db.items)) if (it.slug === slug) return `/item?id=${q(id)}`;
  for (const [id, r] of Object.entries(db.relics)) if (r.slug === slug) return `/relic?id=${q(id)}`;
  return null;
}
