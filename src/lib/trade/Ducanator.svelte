<script lang="ts" module>
  const KEY = "dwc.ducanator";
  const defaults = { mastered: false, vault: "all", copies: 1, sets: false, maxPrice: 0, sort: "ratio" };
  function read() {
    try { return { ...defaults, ...JSON.parse(localStorage.getItem(KEY) ?? "{}") }; }
    catch { return { ...defaults }; }
  }
  const filters = $state(read());
</script>
<script lang="ts">
  import { t, num } from "$lib/i18n/index.svelte";
  import { getDb, iconUrl, normalize } from "$lib/db";
  import { invView } from "$lib/inv/invView.svelte";
  import { isMastered } from "$lib/ownership.svelte";
  import type { View } from "$lib/hub/hub";
  import OwnBadges from "$lib/components/OwnBadges.svelte";
  import Price from "$lib/inv/Price.svelte";
  import Cur from "$lib/components/Cur.svelte";
  let { onopen }: { onopen: (v: View) => void } = $props();
  const db = getDb();
  let query = $state("");
  let shown = $state(80);
  $effect(() => { query; JSON.stringify(filters); shown = 80; });
  $effect(() => {
    const value = JSON.stringify(filters);
    try { localStorage.setItem(KEY, value); } catch { /* storage unavailable */ }
  });
  const rows = $derived.by(() => {
    const sets = new Map(invView.sets.map(s => [s.id, s]));
    return invView.trade.filter(r => r.ducats > 0).map(r => {
      const relics = db.items[r.id]?.relics ?? [];
      const vaulted = relics.length ? relics.every(x => db.relics[x.relic]?.vaulted === true) : null;
      const price = r.price?.price ?? null;
      return { ...r, vaulted, full: sets.get(r.setId ?? "")?.full ?? 0, mastered: r.setId ? isMastered(r.setId) : null,
        value: price != null && price > 0 ? r.ducats / price : null };
    }).filter(r => (!query.trim() || normalize(r.name).includes(normalize(query))) && r.count >= Math.max(1, filters.copies || 1)
      && (!filters.mastered || r.mastered === true)
      && (!filters.sets || r.full > 1)
      && (filters.vault === "all" || r.vaulted === (filters.vault === "vaulted"))
      && (!filters.maxPrice || (r.price != null && r.price.price <= filters.maxPrice)))
      .sort((a,b) => filters.sort === "price"
        ? (a.price?.price ?? Infinity) - (b.price?.price ?? Infinity) || b.ducats - a.ducats
        : (b.value ?? -1) - (a.value ?? -1) || b.ducats - a.ducats);
  });
  const pieces = $derived(rows.reduce((n, r) => n + r.count, 0));
  const ducats = $derived(rows.reduce((n, r) => n + r.count * r.ducats, 0));
</script>
<section class="ducanator">
  <div class="bar">
    <div class="seg" aria-label={t("duc.vault")}>
      <button class:on={filters.vault === "all"} onclick={() => filters.vault = "all"}>{t("duc.all")}</button>
      <button class:on={filters.vault === "vaulted"} onclick={() => filters.vault = "vaulted"}>{t("duc.vaulted")}</button>
      <button class:on={filters.vault === "active"} onclick={() => filters.vault = "active"}>{t("duc.active")}</button>
    </div>
    <input class="search" bind:value={query} placeholder={t("inv.search")} aria-label={t("inv.search")} spellcheck="false" />
    <div class="seg" aria-label={t("duc.ratio")}>
      <button class:on={filters.sort === "ratio"} onclick={() => filters.sort = "ratio"}>{t("duc.ratio")}</button>
      <button class:on={filters.sort === "price"} onclick={() => filters.sort = "price"}>{t("duc.price")}</button>
    </div>
  </div>
  <div class="bar secondary">
    <label class="chk"><input type="checkbox" bind:checked={filters.mastered} /> {t("duc.mastered")}</label>
    <label class="chk"><input type="checkbox" bind:checked={filters.sets} /> {t("duc.sets")}</label>
    <label class="field">{t("duc.copiesShort")} <input type="number" min="1" step="1" bind:value={filters.copies} /></label>
    <label class="field">{t("duc.priceLimit")} <input type="number" min="0" title={t("duc.priceLimitHint")} bind:value={filters.maxPrice} /></label>
  </div>
  <div class="summary">
    <span>{t("inv.sum.pieces", { n: pieces })}</span>
    <span class="big" title={t("duc.total")}><Cur kind="ducats" value={ducats} size={16} /></span>
    <details><summary>{t("duc.explain")}</summary><p>{t("duc.foot", { date: invView.mdate ?? t("duc.unknown") })}</p></details>
  </div>
  <div class="rows">
    {#if !invView.ctx}<p class="empty">{t("coll.loading")}</p>
    {:else if !rows.length}<p class="empty">{t("duc.none")}</p>{/if}
    {#each rows.slice(0, shown) as r (r.id)}
      <button class="row line" onclick={() => onopen({ kind: "item", id: r.id })}>
        <span class="ic"><img src={iconUrl(r.icon)} alt="" loading="lazy" /></span>
        <span class="name"><b>{r.name}</b><small>{r.vaulted == null ? t("duc.unknown") : t(r.vaulted ? "duc.vaulted" : "duc.active")}{#if r.setId} <OwnBadges id={r.setId} size={14} />{/if}</small></span>
        <span class="qty" title={t("duc.qty")}>×{num(r.count)}</span>
        <span class="price"><Price p={r.price} speed={false} /><small><Cur kind="ducats" value={r.ducats} size={12} /> · {t("duc.perCopy")}</small></span>
        <span class="value"><b>{r.value == null ? "—" : num(Math.round(r.value * 100) / 100)}</b><small>{t("duc.ratio")}</small></span>
        <span class="total"><Cur kind="ducats" value={r.ducats * r.count} size={14} /><small>{t("duc.total")}</small></span>
      </button>
    {/each}
  </div>
  {#if rows.length > shown}<button class="more" onclick={() => shown += 120}>{t("coll.showMore", { a: Math.min(120, rows.length - shown), b: rows.length - shown })}</button>{/if}
</section>
<style>
  .bar { display: flex; flex-wrap: wrap; align-items: center; gap: 10px; margin-bottom: 12px; }
  .secondary { gap: 12px 22px; }
  .chk, .field { display: flex; align-items: center; gap: 6px; font-size: 12px; color: var(--text-dim); }
  .chk { cursor: pointer; }
  .chk input { accent-color: var(--accent); }
  .search, .field input { padding: 6px 10px; border-radius: 8px; border: 1px solid var(--line); background: var(--surface); color: var(--text); font-size: 12px; }
  .search { flex: 1; min-width: 140px; }
  .field input { width: 64px; }
  input:focus-visible { outline: 2px solid var(--accent); outline-offset: 2px; }
  .summary { display: flex; flex-wrap: wrap; align-items: baseline; gap: 14px; margin: 4px 4px 14px; font-size: 12px; color: var(--text-dim); }
  .big { font-size: 16px; font-weight: 600; }
  details { margin-left: auto; max-width: 100%; }
  summary { cursor: pointer; color: var(--text-faint); }
  details p { max-width: 680px; line-height: 1.5; }
  .row.line { gap: 14px; padding: 7px 12px; width: 100%; text-align: left; }
  .row.line:hover { background: var(--surface-2); }
  .row.line:focus-visible { outline: 2px solid var(--accent); outline-offset: -2px; }
  .ic { width: 66px; height: 40px; flex: none; display: flex; align-items: center; justify-content: center; }
  .ic img { width: 38px; height: 38px; object-fit: contain; }
  .name b { font-size: 14px; font-weight: 500; }
  .name small { display: flex; align-items: center; gap: 6px; }
  .qty { width: 54px; text-align: right; color: var(--text-dim); font-variant-numeric: tabular-nums; }
  .price, .value, .total { display: flex; flex-direction: column; flex: none; gap: 3px; font-variant-numeric: tabular-nums; }
  .price { width: 130px; font-size: 13px; }
  .price small, .value small, .total small { font-size: 11px; font-weight: 400; color: var(--text-faint); }
  .value { width: 110px; text-align: right; color: var(--ducat); }
  .value b { font-size: 15px; font-weight: 600; }
  .total { width: 92px; align-items: flex-end; font-weight: 600; }
  .empty { padding: 18px; color: var(--text-dim); margin: 0; }
  .more { display: block; margin: 10px auto 0; color: var(--accent); font-size: 13px; }
  @media (max-width: 850px) {
    .ic { width: 42px; }
    .price { width: 90px; }
    .value { width: 96px; }
    .total { width: 78px; }
    .row.line { gap: 10px; }
  }
  @media (max-width: 650px) {
    .row.line { flex-wrap: wrap; }
    .name { flex-basis: calc(100% - 100px); }
    .qty { width: 42px; }
    .price { margin-left: 52px; flex: 1; }
    details { margin-left: 0; }
  }
</style>
