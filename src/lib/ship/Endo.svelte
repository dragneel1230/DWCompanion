<script lang="ts">
  // «Орбитер» → «Растворить»: spare unranked mods and the Endo they give (endo.ts), with yesterday's price of
  // one copy so the player sees what dissolving gives up. Prices: marketDay (one file a day, no WFM requests).
  import { num, t, type Key } from "$lib/i18n/index.svelte";
  import { inventory } from "$lib/inventory.svelte";
  import { loadFrames, loadOtherMods, type Mod } from "$lib/frames";
  import { loadMarketDay, marketDate } from "$lib/marketDay";
  import ItemThumb from "$lib/components/ItemThumb.svelte";
  import Cur from "$lib/components/Cur.svelte";
  import { dissolveRows } from "./endo";

  let { compact = false }: { compact?: boolean } = $props();

  let mods = $state<Record<string, Mod> | null>(null);
  let priced = $state(false);
  Promise.all([loadFrames(), loadOtherMods()])
    .then(([f, o]) => (mods = { ...o, ...f.mods }))
    .catch(() => (mods = {}));
  loadMarketDay().finally(() => (priced = true));

  // Price cap: copies that sell for more stay out of the list (not traded / no price always in).
  type Cap = "all" | 1 | 3 | 5;
  const CAPS: { id: Cap; label: Key; v?: number }[] = [
    { id: "all", label: "endo.cap.all" },
    { id: 1, label: "endo.cap.le", v: 1 },
    { id: 3, label: "endo.cap.le", v: 3 },
    { id: 5, label: "endo.cap.le", v: 5 },
  ];
  type Sort = "endo" | "price";
  const KEY = "dwc.endo";
  const saved = (() => {
    try {
      return JSON.parse(localStorage.getItem(KEY) ?? "{}") as { cap?: Cap; sort?: Sort };
    } catch {
      return {};
    }
  })();
  let cap = $state<Cap>(saved.cap ?? "all");
  let sort = $state<Sort>(saved.sort ?? "endo");
  $effect(() => {
    const v = JSON.stringify({ cap, sort });
    try {
      localStorage.setItem(KEY, v);
    } catch {
      // storage unavailable
    }
  });

  const inv = $derived(inventory.data);
  const rows = $derived(inv && mods && priced ? dissolveRows(inv, mods, inventory.prefs) : []);
  const shown = $derived(
    rows
      .filter((r) => cap === "all" || !r.price || r.price.price <= cap)
      .sort((a, b) => (sort === "endo" ? b.total - a.total : (a.price?.price ?? 0) - (b.price?.price ?? 0) || b.total - a.total)),
  );
  const total = $derived(shown.reduce((s, r) => s + r.total, 0));
  const copies = $derived(shown.reduce((s, r) => s + r.spare, 0));
  // Platinum given up per 1000 Endo: how cheap the Endo is when you dissolve instead of selling.
  const per1k = (r: (typeof rows)[number]) => (r.price ? (r.price.price / r.each) * 1000 : null);
  let limit = $state(150);
</script>

<div class="endo" class:compact>
  {#if !inv}
    <p class="note">{t("quest.noInv")}</p>
  {:else if !inv.rawMods}
    <p class="note">{t("endo.oldInv")}</p>
  {:else}
    <section class="block">
      <div class="head">
        <h2>{t("endo.title")}</h2>
        <span class="sum">{t("endo.sum", { e: num(total), n: num(copies) })}</span>
      </div>
      <div class="bar">
        <div class="seg">
          {#each CAPS as c (c.id)}
            <button class:on={cap === c.id} onclick={() => (cap = c.id)}>{t(c.label, { v: c.v ?? 0 })}</button>
          {/each}
        </div>
        <div class="seg">
          <button class:on={sort === "endo"} onclick={() => (sort = "endo")}>{t("endo.sortEndo")}</button>
          <button class:on={sort === "price"} onclick={() => (sort = "price")}>{t("endo.sortPrice")}</button>
        </div>
      </div>
      <div class="cols">
        <span></span><span>{t("market.col.name")}</span><span class="r">{t("endo.col.copies")}</span><span class="r">{t("endo.col.endo")}</span><span class="r" title={t("endo.col.priceHint")}>{t("endo.col.price")}</span><span class="r" title={t("endo.col.per1kHint")}>{t("endo.col.per1k")}</span>
      </div>
      {#if !mods || !priced}
        <p class="muted">{t("common.loading")}</p>
      {:else if !shown.length}
        <p class="muted">{t("endo.none")}</p>
      {/if}
      {#each shown.slice(0, limit) as r (r.id)}
        <div class="line">
          <ItemThumb id={r.id} icon={r.mod.icon} name={r.mod.name} w={40} />
          <span class="name">{r.mod.name}</span>
          <span class="r">{num(r.spare)}</span>
          <span class="r e">{num(r.total)} <small>({num(r.each)})</small></span>
          <span class="r">{#if r.price}<Cur kind="plat" value={num(r.price.price)} size={13} />{:else}<small>{r.mod.slug ? t("endo.noPrice") : t("endo.untradeable")}</small>{/if}</span>
          <span class="r dim">{per1k(r) != null ? num(Math.round(per1k(r)!)) : "—"}</span>
        </div>
      {/each}
      {#if shown.length > limit}
        <button class="more" onclick={() => (limit += 150)}>{t("endo.more", { n: shown.length - limit })}</button>
      {/if}
      <p class="foot">{t("endo.foot", { keep: inventory.prefs.keepCopies, date: marketDate() ?? "—" })}</p>
    </section>
  {/if}
</div>

<style>
  .note {
    font-size: 13px;
    color: var(--warn);
  }
  .muted {
    color: var(--text-faint);
    padding: 16px 0;
  }
  .block {
    padding: 16px 20px;
    border-radius: 16px;
    background: var(--surface);
  }
  .head {
    display: flex;
    align-items: baseline;
    gap: 14px;
    flex-wrap: wrap;
  }
  h2 {
    margin: 0;
    font-size: 16px;
    font-weight: 600;
  }
  .sum {
    font-size: 13px;
    color: var(--text-dim);
  }
  .bar {
    display: flex;
    gap: 10px;
    flex-wrap: wrap;
    margin: 12px 0 8px;
  }
  .cols,
  .line {
    display: grid;
    grid-template-columns: 40px minmax(0, 1fr) 60px 100px 80px 120px;
    align-items: center;
    gap: 12px;
  }
  .cols {
    padding: 4px 0 6px;
    font-size: 11px;
    letter-spacing: 0.08em;
    text-transform: uppercase;
    color: var(--text-faint);
  }
  .line {
    padding: 4px 0;
    font-size: 13px;
  }
  .compact .cols,
  .compact .line {
    grid-template-columns: 40px minmax(0, 1fr) 44px 84px 64px;
  }
  .compact .cols > :last-child,
  .compact .line > :last-child {
    display: none;
  }
  .name {
    min-width: 0;
  }
  .r {
    text-align: right;
    font-variant-numeric: tabular-nums;
  }
  .e {
    color: var(--accent);
  }
  small {
    font-size: 11px;
    color: var(--text-faint);
  }
  .dim {
    color: var(--text-dim);
  }
  .more {
    margin-top: 8px;
    font-size: 12.5px;
    color: var(--accent);
  }
  .foot {
    margin: 12px 0 0;
    font-size: 12px;
    line-height: 1.4;
    color: var(--text-faint);
  }
</style>
