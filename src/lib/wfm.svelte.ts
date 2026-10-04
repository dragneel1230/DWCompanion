// The player's warframe.market account: sign-in (the site's own page in our window, src-tauri/src/wfm.rs)
// and their orders. The token never comes here: Rust keeps it and calls a few whitelisted endpoints.
// Requests only on the player's action (open the tab, press a button): WFM's rules, see memory budget.
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { dataUrl, fromRust } from "$lib/i18n/index.svelte";
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
      return new Map(
        Object.entries(all).map(([id, [slug, name, thumb, maxRank, subtypes]]) => [
          id,
          { id, slug, name: own.get(slug) ?? name, thumb: thumb ? `https://warframe.market/static/assets/${thumb}` : "", maxRank, subtypes: subtypes || [] },
        ]),
      );
    });
  return itemsLoad;
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
