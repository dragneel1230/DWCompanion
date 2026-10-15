// Any item by its DE id (uniqueName): how to draw it (mods and arcanes in their game frames, rivens in the
// riven frame) and which app page shows it. For reward lists that only know ids (the «Неделя» tables).
// Tables load on first use; a plain <a href> to the page also opens a card in the hub (hub.ts viewOf).
import { getDb } from "$lib/db";
import { loadFrames, loadOtherMods, type Arcane, type FramesDb, type Mod } from "$lib/frames";
import { loadCraft, type CraftDb } from "$lib/craft";
import { loadDrops, type DropsDb } from "$lib/drops";

let frames = $state<FramesDb | null>(null);
let other = $state<Record<string, Mod>>({});
let craft = $state<CraftDb | null>(null);
let drops = $state<DropsDb | null>(null);
let started = false;

function start() {
  if (started) return;
  started = true;
  loadFrames().then((f) => (frames = f)).catch(() => {});
  loadOtherMods().then((m) => (other = m)).catch(() => {});
  loadCraft().then((c) => (craft = c)).catch(() => {});
  loadDrops().then((d) => (drops = d)).catch(() => {});
}

const q = encodeURIComponent;
const plain = (id: string) => id.replace("/StoreItems/", "/");
// Rivens are random: no single mod record, only the weapon class ("Мод Разлома для Пистолетов").
export const isRiven = (id: string | undefined) => !!id && id.includes("/Mods/Randomized/");

export function cardOf(id: string | undefined): { mod?: Mod; arcane?: Arcane; riven?: boolean } {
  start();
  if (!id) return {};
  if (isRiven(id)) return { riven: true };
  const k = plain(id);
  const mod = frames?.mods[k] ?? other[k];
  if (mod) return { mod };
  const arcane = frames?.arcanes[k];
  return arcane ? { arcane } : {};
}

export function pageOf(id: string | undefined): string | null {
  start();
  if (!id || isRiven(id)) return null;
  const k = plain(id);
  if (frames?.mods[k] || other[k]) return `/market?id=${q(k)}`;
  if (frames?.arcanes[k]) return `/market?id=${q(k)}&k=arcane`;
  if (frames?.frames[k]) return `/frame?id=${q(k)}`;
  // Kuva, Forma…: «Добыча» rather than a relic reward page.
  if (drops?.resources[k]) return `/resources?id=${q(k)}`;
  try {
    const db = getDb();
    if (db.sets[k]) return `/set?id=${q(k)}`;
    if (db.items[k]) return `/item?id=${q(k)}`;
    if (db.relics[k]) return `/relic?id=${q(k)}`;
  } catch {
    // database not loaded in this window
  }
  if (craft?.items[k]) return `/resources?craft=${q(k)}`;
  return null;
}
