import { pickBuild, pickGear } from "./buildsSel.svelte";
import { GEAR_KINDS, type GearTab } from "$lib/gear";

// Sub-tabs of the sections shared by the app and the hub ("Торговля", "Реликвии"): one remembered choice
// for both windows (localStorage is shared), so the hub opens where the app was left and back.
export type TradeSub = "sell" | "sets" | "market" | "orders" | "log";
export type RelicsSub = "mine" | "farm" | "journal";
export type ShipSub = "foundry" | "helminth";

export const TRADE_SUBS: TradeSub[] = ["sell", "sets", "market", "orders", "log"];
export const RELICS_SUBS: RelicsSub[] = ["mine", "farm", "journal"];
export const SHIP_SUBS: ShipSub[] = ["foundry", "helminth"];

// A new order asked for by a link: item, side, and (from the sell list) how many and at what rank.
export type NewOrderAsk = { slug: string; type?: "sell" | "buy"; qty?: number; rank?: number };

const KEY = "dwc.subs";

function load(): { trade: TradeSub; relics: RelicsSub; ship: ShipSub } {
  try {
    const s = JSON.parse(localStorage.getItem(KEY) ?? "null");
    return {
      trade: TRADE_SUBS.includes(s?.trade) ? s.trade : "sell",
      relics: RELICS_SUBS.includes(s?.relics) ? s.relics : "mine",
      ship: SHIP_SUBS.includes(s?.ship) ? s.ship : "foundry",
    };
  } catch {
    return { trade: "sell", relics: "mine", ship: "foundry" };
  }
}

export const subs = $state({
  ...load(),
  // A new order asked for by a "Выставить" button: the desk opens its form once.
  newOrder: null as NewOrderAsk | null,
});

function save() {
  try {
    localStorage.setItem(KEY, JSON.stringify({ trade: subs.trade, relics: subs.relics, ship: subs.ship }));
  } catch {
    // storage unavailable
  }
}

export function setTrade(v: TradeSub) {
  subs.trade = v;
  save();
}
export function setRelics(v: RelicsSub) {
  subs.relics = v;
  save();
}
export function setShip(v: ShipSub) {
  subs.ship = v;
  save();
}

if (typeof window !== "undefined")
  window.addEventListener("storage", (e) => {
    if (e.key !== KEY) return;
    const s = load();
    subs.trade = s.trade;
    subs.relics = s.relics;
    subs.ship = s.ship;
  });

// Links into the sections ("/trade?tab=orders&new=slug", "/relics?tab=journal") -> sub-tab state.
// Returns the section, or null for any other link.
export function followSection(href: string): "trade" | "relics" | "builds" | "ship" | null {
  const u = new URL(href, "http://x");
  const tab = u.searchParams.get("tab");
  if (u.pathname === "/trade") {
    if (TRADE_SUBS.includes(tab as TradeSub)) setTrade(tab as TradeSub);
    const slug = u.searchParams.get("new");
    if (slug) {
      setTrade("orders");
      const num = (k: string) => (u.searchParams.has(k) ? Math.max(0, Math.round(Number(u.searchParams.get(k)))) || undefined : undefined);
      subs.newOrder = { slug, type: u.searchParams.get("type") === "buy" ? "buy" : "sell", qty: num("qty"), rank: num("rank") };
    }
    return "trade";
  }
  if (u.pathname === "/relics") {
    if (RELICS_SUBS.includes(tab as RelicsSub)) setRelics(tab as RelicsSub);
    return "relics";
  }
  if (u.pathname === "/ship") {
    if (SHIP_SUBS.includes(tab as ShipSub)) setShip(tab as ShipSub);
    return "ship";
  }
  // "/frames?id=<frame>&build=<build>" / "/frames?gear=<item>&kind=<kind>&build=<build>": the build in «Билды».
  if (u.pathname === "/frames") {
    followBuilds(u.searchParams);
    return "builds";
  }
  return null;
}

export function followBuilds(q: URLSearchParams) {
  const id = q.get("id");
  const gear = q.get("gear");
  const kind = q.get("kind") as GearTab | null;
  if (id) pickBuild(id, q.get("build") ?? "");
  else if (gear && kind && (kind === "exalted" || GEAR_KINDS.includes(kind))) pickGear(kind, gear, q.get("build") ?? "");
}
