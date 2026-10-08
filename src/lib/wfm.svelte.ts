// The player's warframe.market account: sign-in (the site's own page in our window, src-tauri/src/wfm.rs)
// and their orders. The token never comes here: Rust keeps it and calls a few whitelisted endpoints.
// Requests only on the player's action (open the tab, press a button): WFM's rules, see memory budget.
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { dataUrl, fromRust, t } from "$lib/i18n/index.svelte";
import { getDb } from "$lib/db";

export interface WfmUser {
  id: string;
  ingameName: string;
  slug?: string;
  avatar?: string;
  reputation?: number;
  status?: string;
  platform?: string;
}

export interface MyOrder {
  id: string;
  type: "sell" | "buy";
  platinum: number; // of one trade (a pack when perTrade > 1)
  quantity: number;
  perTrade?: number;
  rank?: number;
  subtype?: string;
  visible: boolean;
  itemId: string;
  updatedAt: string;
}

export type OrderPatch = Partial<Pick<MyOrder, "platinum" | "quantity" | "visible" | "rank" | "subtype" | "perTrade">>;
export type NewOrder = Pick<MyOrder, "type" | "platinum" | "quantity" | "itemId" | "visible"> & Pick<MyOrder, "rank" | "subtype" | "perTrade">;

// Market item: [slug, name, thumb, maxRank, subtypes, bulk] (static/data/<lang>/wfm.json, build-data.mjs).
export interface WfmItem {
  id: string;
  slug: string;
  name: string;
  thumb: string;
  maxRank: number;
  subtypes: string[];
}
type Row = [string, string, string, number, string[] | 0, 0 | 1];

let itemsLoad: Promise<Map<string, WfmItem>> | null = null;
export function loadWfmItems(): Promise<Map<string, WfmItem>> {
  itemsLoad ??= fetch(dataUrl("wfm.json"))
    .then((r) => r.json() as Promise<Record<string, Row>>)
    .then((all) => {
      // Our own names where the app knows the item (prime parts, sets): the same as everywhere else.
      const own = new Map<string, string>();
      try {
        const db = getDb();
        for (const x of [...Object.values(db.items), ...Object.values(db.sets)]) if (x.slug) own.set(x.slug, x.name);
      } catch {
        // database not loaded in this window
      }
      // A set and its blueprint can share a name in DE's dictionary ("Эш Прайм"): sets say so.
      const setName = (slug: string, name: string) => (slug.endsWith("_set") && !/set|набор/i.test(name) ? t("trade.setName", { n: name }) : name);
      return new Map(
        Object.entries(all).map(([id, [slug, name, thumb, maxRank, subtypes]]) => [
          id,
          { id, slug, name: setName(slug, own.get(slug) ?? name), thumb: thumb ? `https://warframe.market/static/assets/${thumb}` : "", maxRank, subtypes: subtypes || [] },
        ]),
      );
    });
  return itemsLoad;
}

// Russian and English names of every market item (both files, whatever the interface language):
// search in both languages, whispers in the other player's language.
export type ItemNames = { ru: string; en: string };
let namesLoad: Promise<Map<string, ItemNames>> | null = null;
export function loadWfmNames(): Promise<Map<string, ItemNames>> {
  const file = (lang: string) => fetch(`/data/${lang}/wfm.json`).then((r) => r.json() as Promise<Record<string, Row>>);
  namesLoad ??= Promise.all([file("ru"), file("en")]).then(([ru, en]) => {
    const m = new Map<string, ItemNames>();
    for (const [id, row] of Object.entries(en)) {
      let r = ru[id]?.[1] ?? row[1];
      // Whispers to RU players name sets the way the market panel does: "Эш Прайм: набор".
      if (row[0].endsWith("_set") && !/набор/i.test(r)) r = `${r}: набор`;
      m.set(id, { en: row[1], ru: r });
    }
    return m;
  });
  return namesLoad;
}

class WfmAccount {
  user = $state<WfmUser | null>(null);
  checked = $state(false); // /v2/me answered at least once
  orders = $state<MyOrder[]>([]);
  loading = $state(false);
  busy = $state<string | null>(null); // order id (or "new") being saved
  error = $state("");

  constructor() {
    listen<WfmUser | null>("wfm-auth", (e) => {
      this.user = e.payload;
      this.checked = true;
      if (e.payload) void this.loadOrders();
      else this.orders = [];
    });
  }

  private fail(e: unknown) {
    this.error = fromRust(String(e));
  }

  async check() {
    try {
      this.user = await invoke<WfmUser | null>("wfm_me");
    } catch (e) {
      this.fail(e);
    } finally {
      this.checked = true;
    }
    if (this.user) await this.loadOrders();
  }

  async login() {
    this.error = "";
    try {
      await invoke("wfm_login");
    } catch (e) {
      this.fail(e);
    }
  }

  async logout() {
    await invoke("wfm_logout");
    this.user = null;
    this.orders = [];
  }

  private call<T>(method: string, path: string, body?: unknown) {
    return invoke<T>("wfm_call", { method, path, body: body ?? null });
  }

  async loadOrders() {
    this.loading = true;
    this.error = "";
    try {
      this.orders = (await this.call<{ data: MyOrder[] }>("GET", "/orders/my")).data ?? [];
    } catch (e) {
      this.fail(e);
    } finally {
      this.loading = false;
    }
  }

  private async save(id: string, run: () => Promise<void>) {
    this.busy = id;
    this.error = "";
    try {
      await run();
    } catch (e) {
      this.fail(e);
    } finally {
      this.busy = null;
    }
  }

  update(o: MyOrder, patch: OrderPatch) {
    return this.save(o.id, async () => {
      const r = await this.call<{ data: MyOrder }>("PATCH", `/order/${o.id}`, patch);
      this.orders = this.orders.map((x) => (x.id === o.id ? { ...x, ...(r.data ?? patch) } : x));
    });
  }

  remove(o: MyOrder) {
    return this.save(o.id, async () => {
      await this.call("DELETE", `/order/${o.id}`);
      this.orders = this.orders.filter((x) => x.id !== o.id);
    });
  }

  // Sold / bought: the market counts the trade in the player's statistics and lowers the quantity.
  close(o: MyOrder, quantity = 1) {
    return this.save(o.id, async () => {
      await this.call("POST", `/order/${o.id}/close`, { quantity });
      logTrade(o, quantity);
      const left = o.quantity - quantity;
      this.orders = left > 0 ? this.orders.map((x) => (x.id === o.id ? { ...x, quantity: left } : x)) : this.orders.filter((x) => x.id !== o.id);
    });
  }

  create(o: NewOrder) {
    return this.save("new", async () => {
      const r = await this.call<{ data: MyOrder }>("POST", "/order", o);
      if (r.data) this.orders = [r.data, ...this.orders];
    });
  }
}

export const wfm = new WfmAccount();

// ---------- trades closed from the app (local log: WFM's API has no history of the player's own trades)

export interface Trade {
  at: number;
  type: "sell" | "buy";
  itemId: string;
  rank?: number;
  subtype?: string;
  pieces: number;
  platinum: number; // total paid / received
}
const TRADES_KEY = "dwc.trades";
function readTrades(): Trade[] {
  try {
    return JSON.parse(localStorage.getItem(TRADES_KEY) ?? "[]");
  } catch {
    return [];
  }
}
export const trades = $state<{ list: Trade[] }>({ list: readTrades() });
window.addEventListener("storage", (e) => e.key === TRADES_KEY && (trades.list = readTrades()));
function logTrade(o: MyOrder, pieces: number) {
  const per = Math.max(1, o.perTrade ?? 1);
  const t: Trade = { at: Date.now(), type: o.type, itemId: o.itemId, rank: o.rank, subtype: o.subtype, pieces, platinum: Math.round((o.platinum / per) * pieces) };
  trades.list = [t, ...trades.list].slice(0, 500);
  try {
    localStorage.setItem(TRADES_KEY, JSON.stringify(trades.list));
  } catch {
    // storage unavailable
  }
}

// ---------- status on the site (src-tauri/src/wfm_status.rs keeps the socket)

export type WfmStatus = "ingame" | "online" | "invisible";
export interface StatusInfo {
  connected: boolean;
  status: string | null; // confirmed by WFM
  want: WfmStatus | null; // what the app keeps
  until: number | null; // unix ms
  auto: boolean;
  game: boolean;
  error: string | null;
}
const AUTO_KEY = "dwc.wfmAutoStatus";

class StatusState {
  info = $state<StatusInfo>({ connected: false, status: null, want: null, until: null, auto: false, game: false, error: null });

  constructor() {
    listen<StatusInfo>("wfm-status", (e) => (this.info = e.payload));
    invoke<StatusInfo>("wfm_status_get").then((i) => (this.info = i), () => {});
  }

  get error() {
    return this.info.error ? fromRust(this.info.error) : "";
  }

  // Main window, app start: "status by the game" survives restarts (a manual one doesn't need to:
  // WFM keeps a timed status itself).
  restore() {
    let on = false;
    try {
      on = localStorage.getItem(AUTO_KEY) === "1";
    } catch {
      // storage unavailable
    }
    if (on) void invoke("wfm_status_auto", { on: true });
  }

  set(status: WfmStatus, minutes: number | null) {
    this.remember(false);
    return invoke("wfm_status_set", { status, minutes });
  }

  auto(on: boolean) {
    this.remember(on);
    return invoke("wfm_status_auto", { on });
  }

  private remember(on: boolean) {
    try {
      localStorage.setItem(AUTO_KEY, on ? "1" : "0");
    } catch {
      // storage unavailable
    }
  }
}

export const wfmStatus = new StatusState();
