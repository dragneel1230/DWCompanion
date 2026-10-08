<script lang="ts">
  // "Наборы": prime sets the player holds parts of. Whole sets: sell as a set or by parts (what pays
  // more); one or two parts missing: what buying them costs against the set's price; where they drop.
  import { iconUrl } from "$lib/db";
  import { num, t, type Key } from "$lib/i18n/index.svelte";
  import Cur from "$lib/components/Cur.svelte";
  import Price from "./Price.svelte";
  import { cachedPrice, getPrice, type Price as Live } from "$lib/api";
  import type { SetPart, SetRow } from "./worth";

  let { rows }: { rows: SetRow[] } = $props();

  type View = "ready" | "near" | "all";
  let view = $state<View>("ready");
  const VIEWS: { id: View; label: Key }[] = [
    { id: "ready", label: "inv.sets.ready" },
    { id: "near", label: "inv.sets.near" },
    { id: "all", label: "inv.sets.all" },
  ];

  // What the numbers rest on: yesterday's deals (relics.run, no requests) or the live orders — buy from the
  // cheapest online seller, sell to the best online buyer. Live orders only per set, on "Check" (one
  // throttled, cached request per item: never the whole list at once).
  type Basis = "avg" | "now";
  const BASIS_KEY = "dwc.sets.basis";
  let basis = $state<Basis>(readBasis());
  function readBasis(): Basis {
    try {
      return localStorage.getItem(BASIS_KEY) === "now" ? "now" : "avg";
    } catch {
      return "avg";
    }
  }
  function setBasis(b: Basis) {
    basis = b;
    try {
      localStorage.setItem(BASIS_KEY, b);
    } catch {
      // storage unavailable
    }
  }
  let live = $state<Record<string, Live | null>>({});
  let checking = $state<Record<string, boolean>>({});
  const slugsOf = (r: SetRow) => [r.set.slug, ...r.parts.map((x) => x.slug)].filter((s): s is string => !!s);
  // Already fetched in the last minutes (elsewhere too): shown without a request.
  $effect(() => {
    if (basis !== "now") return;
    for (const r of rows)
      for (const s of slugsOf(r)) {
        const c = cachedPrice(s);
        if (c && !(s in live)) live[s] = c;
      }
  });
  async function check(r: SetRow) {
    checking[r.id] = true;
    await Promise.all(slugsOf(r).map((s) => getPrice(s).then((p) => (live[s] = p)).catch(() => (live[s] = null))));
    checking[r.id] = false;
  }
  const checked = (r: SetRow) => slugsOf(r).every((s) => s in live);
  // Live numbers of a checked set: null where nobody is online.
  function now(r: SetRow) {
    const bid = (s?: string) => (s ? (live[s]?.buy ?? null) : null);
    const ask = (s?: string) => (s ? (live[s]?.sell ?? null) : null);
    const setBid = bid(r.set.slug);
    const cost = r.missing.every((x) => ask(x.slug) != null) ? r.missing.reduce((n, x) => n + ask(x.slug)! * x.need, 0) : null;
    const own = r.parts.reduce((s, x) => s + Math.min(Math.max(0, x.have - r.full * x.need), x.need) * (bid(x.slug) ?? 0), 0);
    const partsBid = r.parts.every((x) => bid(x.slug) != null) ? r.parts.reduce((n, x) => n + bid(x.slug)! * x.need, 0) : null;
    return {
      setBid,
      cost: r.missing.length ? cost : 0,
      gain: setBid != null && cost != null ? setBid - cost - own : null,
      byParts: setBid != null && partsBid != null ? setBid - partsBid : null,
    };
  }

  // Value of the parts toward the next set, sold one by one.
  const ownValue = (r: SetRow) =>
    r.parts.reduce((s, x) => s + Math.min(Math.max(0, x.have - r.full * x.need), x.need) * (x.price?.price ?? 0), 0);
  // Buying the missing parts and selling the whole set, against selling what you have by parts.
  const avgGain = (r: SetRow) => (r.price && r.missingCost != null ? r.price.price - r.missingCost - ownValue(r) : null);
  const gain = (r: SetRow) => (basis === "now" ? (checked(r) ? now(r).gain : null) : avgGain(r));
  const byParts = (r: SetRow) =>
    basis === "now" ? (checked(r) ? now(r).byParts : null) : r.price && r.partsSum != null ? r.price.price - r.partsSum : null;
  const cost = (r: SetRow) => (basis === "now" ? now(r).cost : r.missingCost);

  const counts = $derived({
    ready: rows.filter((r) => r.full > 0).length,
    near: rows.filter((r) => !r.full && r.missing.length <= 2).length,
    all: rows.length,
  });
  const list = $derived.by(() => {
    const out = rows.filter((r) => (view === "ready" ? r.full > 0 : view === "near" ? !r.full && r.missing.length <= 2 : true));
    return out.sort(
      (a, b) =>
        b.full - a.full ||
        a.missing.length - b.missing.length ||
        (gain(b) ?? -1e9) - (gain(a) ?? -1e9) ||
        (b.price?.price ?? 0) - (a.price?.price ?? 0),
    );
  });
  $effect(() => {
    if (view === "ready" && !counts.ready && counts.near) view = "near";
  });

  const liveRelics = (x: SetPart) => x.relics.filter((r) => !r.vaulted);
</script>

<div class="bar">
  <div class="seg">
    {#each VIEWS as v (v.id)}<button class:on={view === v.id} onclick={() => (view = v.id)}>{t(v.label)} <i>{counts[v.id]}</i></button>{/each}
  </div>
  <div class="seg basis">
    <button class:on={basis === "avg"} onclick={() => setBasis("avg")} title={t("inv.sets.basisAvgHint")}>{t("inv.sets.basisAvg")}</button>
    <button class:on={basis === "now"} onclick={() => setBasis("now")} title={t("inv.sets.basisNowHint")}>{t("inv.sets.basisNow")}</button>
  </div>
  <span class="hint">{basis === "now" ? t("inv.sets.basisNowHint") : t("inv.sets.basisAvgHint")}</span>
</div>
<p class="hint parts-hint">{t("inv.sets.hint")}</p>

<div class="grid">
  {#each list as r (r.id)}
    {@const g = gain(r)}
    {@const bp = byParts(r)}
    <article class="set" class:ready={r.full > 0}>
      <header>
        <img src={iconUrl(r.set.icon)} alt="" loading="lazy" />
        <div class="ttl">
          <a href="/set?id={encodeURIComponent(r.id)}"><b>{r.set.name}</b></a>
          <div class="tags">
            {#if r.full > 0}<span class="tag active">{t("inv.sets.full", { n: r.full })}</span>{/if}
            {#if r.goal}<span class="tag gold">{t("inv.sets.goal")}</span>{/if}
            {#if r.built}<span class="tag">{t("inv.sets.built")}</span>{/if}
          </div>
        </div>
        <div class="setp">
          {#if basis === "now"}
            {#if checked(r)}
              {@const n = now(r)}
              {#if n.setBid != null}<span class="lv" title={t("inv.sets.setBidHint")}><Cur kind="plat" value={n.setBid} /></span><small>{t("inv.sets.setBid")}</small>{:else}<small>{t("inv.sets.noBuyers")}</small>{/if}
            {/if}
          {:else}
            <Price p={r.price} />
          {/if}
        </div>
      </header>

      <div class="bar-prog" title="{r.have}/{r.total}"><i style:width="{(r.have / r.total) * 100}%"></i></div>

      <ul class="parts">
        {#each r.parts as x (x.id)}
          {@const miss = r.missing.find((m) => m.id === x.id)}
          <li class:miss={!!miss}>
            <span class="mark">{miss ? "○" : "✓"}</span>
            <span class="pn">{x.name}{#if x.need > 1}<i> ×{x.need}</i>{/if}</span>
            {#if !miss && x.have > (r.full + 1) * x.need}<span class="extra" title={t("inv.sets.extra")}>+{x.have - (r.full + 1) * x.need}</span>{:else}<span></span>{/if}
            <span class="pp">
              {#if basis === "now"}
                {@const lp = x.slug ? live[x.slug] : undefined}
                {@const v = miss ? lp?.sell : lp?.buy}
                {#if v != null}<span title={miss ? t("inv.sets.askHint") : t("inv.sets.bidHint")}><Cur kind="plat" value={v} size={12} /></span>{:else if lp !== undefined}<span class="none" title={t("inv.sets.noOrdersHint")}>—</span>{/if}
              {:else if x.price}<Cur kind="plat" value={x.price.price} size={12} />{/if}
            </span>
            {#if miss && liveRelics(x).length}
              <span class="rel">
                {#each liveRelics(x).slice(0, 3) as rl (rl.key)}<a href="/relic?id={encodeURIComponent(rl.key)}">{rl.s}</a>{/each}
              </span>
            {:else if miss}
              <span class="rel vault">{t("tag.inVault")}</span>
            {/if}
          </li>
        {/each}
      </ul>

      <footer>
        {#if basis === "now" && !checked(r)}
          <p class="verdict">{t("inv.sets.checkHint")}</p>
          <button class="btn ghost" disabled={checking[r.id]} onclick={() => check(r)}>{checking[r.id] ? t("inv.sets.checking") : t("inv.sets.check")}</button>
        {:else if r.full > 0}
          {#if bp != null}
            <p class="verdict" class:good={bp >= 0}>
              {bp >= 0 ? t("inv.sets.asSet", { v: num(Math.round(bp)) }) : t("inv.sets.asParts", { v: num(Math.round(-bp)) })}
            </p>
          {/if}
          <a class="btn" href="/trade?new={r.set.slug}&type=sell">{t("inv.sets.post")}</a>
        {:else if g != null}
          <p class="verdict" class:good={g > 0}>
            {g > 0
              ? t("inv.sets.buyGain", { c: num(Math.round(cost(r) ?? 0)), v: num(Math.round(g)) })
              : t("inv.sets.buyNo", { c: num(Math.round(cost(r) ?? 0)) })}
          </p>
        {:else if basis === "now"}
          <p class="verdict">{t("inv.sets.noOrders")}</p>
        {/if}
        {#if basis === "now" && checked(r)}
          <button class="recheck" disabled={checking[r.id]} onclick={() => check(r)} title={t("inv.sets.recheck")}>↻</button>
        {/if}
      </footer>
    </article>
  {:else}
    <p class="empty">{t("inv.sets.empty")}</p>
  {/each}
</div>

<style>
  .bar {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 12px;
    margin-bottom: 12px;
  }
  .seg i {
    font-style: normal;
    color: var(--text-faint);
    margin-left: 3px;
  }
  .hint {
    font-size: 12px;
    color: var(--text-faint);
  }
  .grid {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(300px, 1fr));
    gap: 12px;
  }
  .set {
    display: flex;
    flex-direction: column;
    gap: 10px;
    padding: 14px 14px 12px;
    border-radius: 14px;
    background: var(--glass);
    border: 1px solid var(--glass-line);
  }
  .set.ready {
    border-color: rgba(111, 207, 151, 0.3);
    background: linear-gradient(160deg, rgba(111, 207, 151, 0.07), var(--glass) 55%);
  }
  header {
    display: flex;
    align-items: center;
    gap: 10px;
  }
  header img {
    width: 52px;
    height: 52px;
    object-fit: contain;
    flex: none;
  }
  .ttl {
    flex: 1;
    min-width: 0;
    display: flex;
    flex-direction: column;
    gap: 4px;
  }
  .ttl a {
    color: var(--text);
  }
  .ttl b {
    font-weight: 600;
    font-size: 15px;
  }
  .tags {
    display: flex;
    flex-wrap: wrap;
    gap: 4px;
  }
  .tag.gold {
    color: var(--accent);
    border-color: rgba(201, 166, 107, 0.4);
  }
  .setp {
    display: flex;
    flex-direction: column;
    align-items: flex-end;
    gap: 3px;
    font-size: 13px;
  }
  .bar-prog {
    height: 4px;
    border-radius: 2px;
    background: rgba(255, 255, 255, 0.06);
    overflow: hidden;
  }
  .bar-prog i {
    display: block;
    height: 100%;
    background: var(--good);
  }
  .parts {
    list-style: none;
    margin: 0;
    padding: 0;
    display: flex;
    flex-direction: column;
    gap: 4px;
    font-size: 12.5px;
  }
  .parts li {
    display: grid;
    grid-template-columns: 14px 1fr auto auto;
    align-items: center;
    gap: 6px;
  }
  .mark {
    color: var(--good);
  }
  .miss .mark,
  .miss .pn {
    color: var(--text-faint);
  }
  .pn i {
    font-style: normal;
    color: var(--text-faint);
  }
  .extra {
    font-size: 11px;
    color: var(--accent);
  }
  .pp {
    min-width: 40px;
    text-align: right;
  }
  .rel {
    grid-column: 2 / -1;
    display: flex;
    flex-wrap: wrap;
    gap: 4px;
    font-size: 11px;
  }
  .rel a {
    padding: 0 6px;
    border-radius: 999px;
    background: rgba(255, 255, 255, 0.05);
    color: var(--text-dim);
  }
  .rel.vault {
    color: var(--warn);
  }
  footer {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 10px;
    margin-top: auto;
  }
  .parts-hint {
    margin: -4px 0 12px;
  }
  .lv {
    font-weight: 600;
  }
  .setp small {
    font-size: 11px;
    color: var(--text-faint);
  }
  .none {
    color: var(--text-faint);
  }
  .btn.ghost {
    background: var(--surface-2);
    color: var(--text);
    font-weight: 500;
  }
  .btn.ghost:hover {
    background: var(--accent-soft);
    color: var(--accent);
  }
  .recheck {
    flex: none;
    width: 26px;
    height: 26px;
    border-radius: 7px;
    color: var(--text-faint);
  }
  .recheck:hover {
    color: var(--accent);
    background: var(--surface-2);
  }
  .verdict {
    margin: 0;
    font-size: 12.5px;
    color: var(--text-dim);
  }
  .verdict.good {
    color: var(--good);
  }
  .btn {
    flex: none;
    padding: 6px 12px;
    border-radius: 8px;
    background: var(--accent);
    color: #111;
    font-weight: 600;
    font-size: 12px;
  }
  .empty {
    color: var(--text-dim);
  }
</style>
