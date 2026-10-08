<script lang="ts">
  // "Продать": everything tradeable the player owns, spare copies first. Price = yesterday's deals,
  // speed = deals a day; "Выставить" opens a ready sell order on the trade desk.
  import { normalize, iconUrl } from "$lib/db";
  import { num, t, type Key } from "$lib/i18n/index.svelte";
  import Cur from "$lib/components/Cur.svelte";
  import ModCard from "$lib/components/ModCard.svelte";
  import ArcaneCard from "$lib/components/ArcaneCard.svelte";
  import Price from "./Price.svelte";
  import { pageOfSlug } from "$lib/itemPage";
  import { forDucats, realValue, sellable, DUCATS_PER_PLAT, WEEK, type TradeKind, type TradeRow } from "./worth";

  let { rows, orders }: { rows: TradeRow[]; orders: Map<string, { qty: number; price: number }> } = $props();

  type Kind = "all" | TradeKind;
  type Sort = "total" | "price" | "speed" | "ducats";
  let kind = $state<Kind>("all");
  let sort = $state<Sort>("total");
  let spareOnly = $state(true);
  let query = $state("");
  let shown = $state(80);

  const KINDS: { id: Kind; label: Key }[] = [
    { id: "all", label: "mp.all" },
    { id: "part", label: "inv.kind.part" },
    { id: "mod", label: "inv.kind.mod" },
    { id: "arcane", label: "inv.kind.arcane" },
    { id: "misc", label: "inv.kind.misc" },
  ];
  const SORTS: { id: Sort; label: Key }[] = [
    { id: "total", label: "inv.sort.total" },
    { id: "price", label: "inv.sort.price" },
    { id: "speed", label: "inv.sort.speed" },
    { id: "ducats", label: "inv.sort.ducats" },
  ];

  const n = (r: TradeRow) => (spareOnly ? r.spare : r.count);
  const total = (r: TradeRow) => realValue(r, n(r));
  const list = $derived.by(() => {
    const q = normalize(query);
    const out = rows.filter((r) => (kind === "all" || r.kind === kind) && n(r) > 0 && (!q || normalize(r.name).includes(q)));
    const key: Record<Sort, (r: TradeRow) => number> = {
      total,
      price: (r) => r.price?.price ?? 0,
      speed: (r) => (r.price?.deals ?? 0) * 1000 + total(r) / 1000,
      ducats: (r) => r.ducats * n(r),
    };
    return out.sort((a, b) => key[sort](b) - key[sort](a));
  });
  const sum = $derived({
    plat: list.reduce((s, r) => s + total(r), 0),
    ducats: list.reduce((s, r) => s + r.ducats * n(r), 0),
    pieces: list.reduce((s, r) => s + n(r), 0),
  });
  $effect(() => {
    kind;
    sort;
    spareOnly;
    query;
    shown = 80;
  });

  const KEPT: Record<NonNullable<TradeRow["kept"]>, Key> = { goal: "inv.kept.goal", set: "inv.kept.set", copies: "inv.kept.copies" };
</script>

<div class="bar">
  <div class="seg">{#each KINDS as k (k.id)}<button class:on={kind === k.id} onclick={() => (kind = k.id)}>{t(k.label)}</button>{/each}</div>
  <label class="chk"><input type="checkbox" bind:checked={spareOnly} /> {t("inv.spareOnly")}</label>
  <input class="search" bind:value={query} placeholder={t("inv.search")} spellcheck="false" />
  <div class="seg">{#each SORTS as s (s.id)}<button class:on={sort === s.id} onclick={() => (sort = s.id)}>{t(s.label)}</button>{/each}</div>
</div>

<div class="sum">
  <span>{t("inv.sum.pieces", { n: sum.pieces })}</span>
  <span class="big"><Cur kind="plat" value={Math.round(sum.plat)} size={16} /></span>
  {#if sum.ducats}<span class="or">{t("inv.orDucats")} <Cur kind="ducats" value={sum.ducats} size={14} /></span>{/if}
</div>

<div class="rows">
  {#each list.slice(0, shown) as r (r.id)}
    {@const o = orders.get(r.slug)}
    {@const page = pageOfSlug(r.slug)}
    <div class="row line" class:ducat={forDucats(r)}>
      <span class="ic">
        {#if r.mod}<ModCard mod={r.mod} rank={r.rank} scale={0.22} bare />{:else if r.arcane}<ArcaneCard arcane={r.arcane} scale={0.11} bare />{:else}<img src={iconUrl(r.icon)} alt="" loading="lazy" />{/if}
      </span>
      <span class="name">
        {#if page}<a class="nm" href={page} title={t("trade.openPage")}>{r.name}</a>{:else}<b>{r.name}</b>{/if}
        <small>
          {t(`inv.kind.${r.kind}`)}
          {#if r.kind !== "part" && r.rank > 0} · {t("inv.rank", { r: r.rank })}{/if}
          {#if r.keep && r.kept} · <span class="kept">{t(KEPT[r.kept], { n: r.keep })}</span>{/if}
          {#if forDucats(r)} · <span class="tobaro" title={t("inv.toBaroHint", { v: DUCATS_PER_PLAT })}>{t("inv.toBaro")}</span>{/if}
        </small>
      </span>
      <span class="qty">×{n(r)}{#if spareOnly && r.count !== r.spare}<small>/{r.count}</small>{/if}</span>
      <span class="pr"><Price p={r.price} /></span>
      <span class="tot">
        {#if r.price?.basis === "deals"}<Cur kind="plat" value={Math.round(total(r))} />{:else}<em title={t("inv.noDealsHint")}>{t("inv.noDeals")}</em>{/if}
        {#if r.price?.basis === "deals" && sellable(r, n(r)) < n(r)}<small class="cap" title={t("inv.capHint", { v: WEEK })}>{t("inv.cap", { n: sellable(r, n(r)) })}</small>{/if}
        {#if r.ducats}<small><Cur kind="ducats" value={r.ducats * n(r)} size={12} /></small>{/if}
      </span>
      {#if o}
        <a class="act on" href="/trade?tab=orders" title={t("inv.listedHint")}>{t("inv.listed", { q: o.qty, p: o.price })}</a>
      {:else}
        <a class="act" href="/trade?new={r.slug}&type=sell&qty={n(r)}{r.kind !== 'part' && r.rank > 0 ? `&rank=${r.rank}` : ''}">{t("inv.post")}</a>
      {/if}
    </div>
  {:else}
    <p class="empty">{t("inv.sellEmpty")}</p>
  {/each}
</div>
{#if list.length > shown}
  <button class="more" onclick={() => (shown += 120)}>{t("coll.showMore", { a: Math.min(120, list.length - shown), b: list.length - shown })}</button>
{/if}

<style>
  .bar {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 10px;
    margin-bottom: 12px;
  }
  .chk {
    display: flex;
    align-items: center;
    gap: 6px;
    font-size: 12px;
    color: var(--text-dim);
    cursor: pointer;
  }
  .chk input {
    accent-color: var(--accent);
  }
  .search {
    flex: 1;
    min-width: 140px;
    padding: 6px 10px;
    border-radius: 8px;
    border: 1px solid var(--line);
    background: var(--surface);
    color: var(--text);
    font-size: 12px;
  }
  .sum {
    display: flex;
    align-items: baseline;
    gap: 14px;
    margin: 0 4px 10px;
    font-size: 12px;
    color: var(--text-dim);
  }
  .sum .big {
    font-size: 16px;
    font-weight: 600;
  }
  .row.line {
    gap: 14px;
    padding: 7px 12px;
  }
  .row.ducat {
    box-shadow: inset 2px 0 0 var(--ducat);
  }
  .ic {
    width: 66px;
    height: 40px;
    flex: none;
    display: flex;
    align-items: center;
    justify-content: center;
  }
  .ic img {
    width: 38px;
    height: 38px;
    object-fit: contain;
  }
  .name b,
  .nm {
    font-weight: 500;
    font-size: 14px;
  }
  .nm:hover {
    color: var(--accent);
    text-decoration: underline;
  }
  .kept {
    color: var(--accent);
  }
  .tobaro {
    color: var(--ducat);
  }
  .qty {
    width: 54px;
    text-align: right;
    font-variant-numeric: tabular-nums;
    color: var(--text-dim);
  }
  .qty small {
    color: var(--text-faint);
  }
  .pr {
    width: 170px;
    display: flex;
    flex-direction: column;
    gap: 3px;
    font-size: 13px;
  }
  .tot {
    width: 78px;
    display: flex;
    flex-direction: column;
    align-items: flex-end;
    gap: 2px;
    font-weight: 600;
  }
  .tot small {
    font-weight: 400;
  }
  .tot em,
  .tot .cap {
    font-style: normal;
    font-weight: 400;
    font-size: 11px;
    color: var(--text-faint);
    white-space: nowrap;
  }
  .act {
    flex: none;
    min-width: 92px;
    padding-left: 8px;
    padding-right: 8px;
    white-space: nowrap;
    text-align: center;
    padding: 5px 0;
    border-radius: 8px;
    border: 1px solid var(--line);
    font-size: 12px;
    color: var(--text-dim);
  }
  .act:hover {
    color: var(--text);
    border-color: var(--accent);
  }
  .act.on {
    color: var(--good);
    border-color: rgba(111, 207, 151, 0.35);
  }
  .empty {
    padding: 18px;
    color: var(--text-dim);
    margin: 0;
  }
  .more {
    margin: 10px auto 0;
    display: block;
    color: var(--accent);
    font-size: 13px;
  }
</style>
