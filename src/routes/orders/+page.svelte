<script lang="ts">
  // The player's own warframe.market orders: sign in on the site (our window), then list, reprice,
  // hide, mark as sold, delete, and post new ones. Every request is a click (WFM's rules).
  import { t, num } from "$lib/i18n/index.svelte";
  import { onMount } from "svelte";
  import { wfm, loadWfmItems, type MyOrder, type WfmItem } from "$lib/wfm.svelte";
  import { getPrice, loadBulk, bulkSell, type Price } from "$lib/api";
  import Cur from "$lib/components/Cur.svelte";

  let items = $state<Map<string, WfmItem> | null>(null);
  onMount(() => {
    loadWfmItems().then((m) => (items = m));
    void loadBulk();
    if (!wfm.checked) void wfm.check();
  });

  let side = $state<"sell" | "buy">("sell");
  const list = $derived(wfm.orders.filter((o) => o.type === side).sort((a, b) => (items?.get(a.itemId)?.name ?? "").localeCompare(items?.get(b.itemId)?.name ?? "")));
  const count = $derived({ sell: wfm.orders.filter((o) => o.type === "sell").length, buy: wfm.orders.filter((o) => o.type === "buy").length });
  const total = $derived(list.filter((o) => o.visible).reduce((s, o) => s + o.platinum * Math.floor(o.quantity / Math.max(1, o.perTrade ?? 1)), 0));

  // Price being edited, per order.
  let draft = $state<Record<string, string>>({});
  const priceOf = (o: MyOrder) => draft[o.id] ?? String(o.platinum);
  function savePrice(o: MyOrder) {
    const v = Math.round(Number(draft[o.id]));
    delete draft[o.id];
    if (Number.isFinite(v) && v > 0 && v !== o.platinum) void wfm.update(o, { platinum: v });
  }

  // Live market prices: one request per item, only when asked.
  let live = $state<Record<string, Price | null>>({});
  let checking = $state(false);
  async function checkPrices() {
    checking = true;
    const slugs = [...new Set(list.map((o) => items?.get(o.itemId)?.slug).filter(Boolean))] as string[];
    await Promise.all(slugs.map(async (s) => (live = { ...live, [s]: await getPrice(s).catch(() => null) })));
    checking = false;
  }

  let confirmDel = $state<string | null>(null);

  // ---- new order
  let q = $state("");
  let pick = $state<WfmItem | null>(null);
  let nType = $state<"sell" | "buy">("sell");
  let nPrice = $state("");
  let nQty = $state("1");
  let nRank = $state("0");
  let nSub = $state("");
  const found = $derived.by(() => {
    const s = q.trim().toLowerCase();
    if (!items || s.length < 2 || pick) return [];
    const out: WfmItem[] = [];
    for (const it of items.values()) {
      if (it.name.toLowerCase().includes(s) || it.slug.includes(s.replace(/\s+/g, "_"))) out.push(it);
      if (out.length >= 8) break;
    }
    return out;
  });
  function choose(it: WfmItem) {
    pick = it;
    q = it.name;
    nRank = "0";
    nSub = it.subtypes[0] ?? "";
  }
  function reset() {
    pick = null;
    q = "";
    nPrice = "";
    nQty = "1";
  }
  async function post() {
    if (!pick) return;
    const platinum = Math.round(Number(nPrice));
    const quantity = Math.max(1, Math.round(Number(nQty)));
    if (!(platinum > 0)) return;
    await wfm.create({
      itemId: pick.id,
      type: nType,
      platinum,
      quantity,
      visible: true,
      ...(pick.maxRank ? { rank: Math.min(pick.maxRank, Math.max(0, Math.round(Number(nRank)))) } : {}),
      ...(nSub ? { subtype: nSub } : {}),
    });
    if (!wfm.error) {
      side = nType;
      reset();
    }
  }
  const subLabel = (s: string) => t(`mp.sub.${s}` as Parameters<typeof t>[0]) || s;
</script>

<div class="page">
  <header class="hero">
    <div>
      <h1>{t("orders.title")}</h1>
      {#if wfm.user}
        <div class="sub">
          <span class="who">{wfm.user.ingameName}</span>
          {#if wfm.user.reputation != null}<span class="tag">{t("orders.rep", { v: wfm.user.reputation })}</span>{/if}
          <button class="link" onclick={() => wfm.logout()}>{t("orders.logout")}</button>
        </div>
      {/if}
    </div>
  </header>

  {#if wfm.error}<p class="err">{wfm.error}</p>{/if}

  {#if !wfm.checked}
    <p class="muted">{t("orders.checking")}</p>
  {:else if !wfm.user}
    <div class="intro">
      <p>{t("orders.introWhy")}</p>
      <ul>
        <li>{t("orders.introPass")}</li>
        <li>{t("orders.introToken")}</li>
        <li>{t("orders.introRules")}</li>
      </ul>
      <button class="primary" onclick={() => wfm.login()}>{t("orders.login")}</button>
      <p class="muted small">{t("orders.loginHint")}</p>
    </div>
  {:else}
    <div class="section-title">{t("orders.new")}</div>
    <div class="new">
      <div class="find">
        <input placeholder={t("orders.findItem")} bind:value={q} oninput={() => (pick = null)} />
        {#if found.length}
          <div class="drop">
            {#each found as it (it.id)}
              <button onclick={() => choose(it)}>{#if it.thumb}<img src={it.thumb} alt="" />{/if}{it.name}</button>
            {/each}
          </div>
        {/if}
      </div>
      <div class="seg">
        <button class:on={nType === "sell"} onclick={() => (nType = "sell")}>{t("orders.iSell")}</button>
        <button class:on={nType === "buy"} onclick={() => (nType = "buy")}>{t("orders.iBuy")}</button>
      </div>
      <label>{t("orders.price")}<input class="n" type="number" min="1" bind:value={nPrice} /></label>
      <label>{t("orders.qty")}<input class="n" type="number" min="1" bind:value={nQty} /></label>
      {#if pick?.maxRank}
        <label>{t("orders.rank")}<input class="n" type="number" min="0" max={pick.maxRank} bind:value={nRank} /></label>
      {/if}
      {#if pick?.subtypes.length}
        <select bind:value={nSub}>
          {#each pick.subtypes as s}<option value={s}>{subLabel(s)}</option>{/each}
        </select>
      {/if}
      <button class="primary" disabled={!pick || !(Number(nPrice) > 0) || wfm.busy === "new"} onclick={post}>{t("orders.post")}</button>
      {#if pick && bulkSell(pick.slug) != null}
        <span class="hint">{t("orders.dayAvg")} <Cur kind="plat" value={bulkSell(pick.slug)!} size={13} /></span>
      {/if}
    </div>

    <div class="bar">
      <div class="seg">
        <button class:on={side === "sell"} onclick={() => (side = "sell")}>{t("orders.selling", { n: count.sell })}</button>
        <button class:on={side === "buy"} onclick={() => (side = "buy")}>{t("orders.buying", { n: count.buy })}</button>
      </div>
      <span class="sum">{t("orders.total")} <Cur kind="plat" value={total} size={13} /></span>
      <span class="grow"></span>
      <button class="ghost" disabled={checking || !list.length} onclick={checkPrices} title={t("orders.checkHint")}>{t("orders.check")}</button>
      <button class="ghost" disabled={wfm.loading} onclick={() => wfm.loadOrders()}>{t("orders.refresh")}</button>
    </div>

    {#if wfm.loading && !wfm.orders.length}
      <p class="muted">{t("orders.loading")}</p>
    {:else if !list.length}
      <p class="muted">{side === "sell" ? t("orders.noneSell") : t("orders.noneBuy")}</p>
    {:else}
      <div class="rows">
        {#each list as o (o.id)}
          {@const it = items?.get(o.itemId)}
          {@const p = it ? live[it.slug] : undefined}
          {@const avg = it ? bulkSell(it.slug) : undefined}
          <div class="row order" class:hidden={!o.visible} class:busy={wfm.busy === o.id}>
            {#if it?.thumb}<img src={it.thumb} alt="" />{/if}
            <span class="name">
              {#if it}<a href="https://warframe.market/items/{it.slug}" target="_blank" rel="noreferrer">{it.name}</a>{:else}{o.itemId}{/if}
              <small>
                {#if o.rank != null}{t("mp.rankLower", { r: o.rank })} · {/if}
                {#if o.subtype}{subLabel(o.subtype)} · {/if}
                {#if o.perTrade && o.perTrade > 1}{t("mp.pack", { n: o.perTrade })} · {/if}
                {#if p}{side === "sell" ? t("orders.cheapest") : t("orders.bestBuy")} {side === "sell" ? (p.sell ?? "—") : (p.buy ?? "—")}{:else if avg != null}{t("orders.dayAvg")} {avg}{/if}
              </small>
            </span>
            <input
              class="n price"
              type="number"
              min="1"
              value={priceOf(o)}
              oninput={(e) => (draft[o.id] = e.currentTarget.value)}
              onkeydown={(e) => e.key === "Enter" && savePrice(o)}
              onblur={() => savePrice(o)}
              title={t("orders.priceHint")}
            />
            <span class="qty">× {num(o.quantity)}</span>
            <button class="ghost" onclick={() => wfm.update(o, { visible: !o.visible })} title={o.visible ? t("orders.hideHint") : t("orders.showHint")}>
              {o.visible ? t("orders.hide") : t("orders.show")}
            </button>
            <button class="ghost good" onclick={() => wfm.close(o, Math.max(1, o.perTrade ?? 1))} title={t("orders.closeHint")}>
              {side === "sell" ? t("orders.sold") : t("orders.bought")}
            </button>
            {#if confirmDel === o.id}
              <button class="ghost bad" onclick={() => { confirmDel = null; void wfm.remove(o); }}>{t("orders.sure")}</button>
            {:else}
              <button class="ghost" onclick={() => (confirmDel = o.id)} title={t("orders.delete")}>✕</button>
            {/if}
          </div>
        {/each}
      </div>
    {/if}
  {/if}
</div>

<style>
  .who {
    color: var(--text);
    font-weight: 500;
  }
  .link {
    color: var(--accent);
    font-size: 13px;
  }
  .err {
    color: var(--warn);
  }
  .intro {
    max-width: 640px;
    line-height: 1.55;
    color: var(--text-dim);
  }
  .intro ul {
    padding-left: 18px;
  }
  .small {
    font-size: 12px;
  }
  .primary {
    padding: 8px 16px;
    border-radius: 8px;
    background: var(--accent);
    color: #1a1408;
    font-weight: 600;
  }
  .primary:disabled {
    opacity: 0.45;
    cursor: default;
  }
  .ghost {
    padding: 5px 10px;
    border-radius: 7px;
    background: var(--surface-2);
    font-size: 12.5px;
    color: var(--text-dim);
  }
  .ghost:hover:not(:disabled) {
    color: var(--text);
  }
  .ghost:disabled {
    opacity: 0.5;
    cursor: default;
  }
  .ghost.good {
    color: var(--good);
  }
  .ghost.bad {
    color: var(--warn);
  }
  .seg {
    display: inline-flex;
    padding: 3px;
    border-radius: 9px;
    background: var(--surface);
  }
  .seg button {
    padding: 5px 12px;
    border-radius: 7px;
    font-size: 13px;
    color: var(--text-dim);
  }
  .seg button.on {
    background: var(--surface-2);
    color: var(--text);
  }
  input,
  select {
    padding: 6px 9px;
    border-radius: 7px;
    border: 1px solid var(--line);
    background: var(--surface);
    color: var(--text);
    font: inherit;
    font-size: 13px;
  }
  .n {
    width: 76px;
  }
  .new {
    display: flex;
    flex-wrap: wrap;
    gap: 10px;
    align-items: center;
  }
  .new label {
    display: inline-flex;
    gap: 6px;
    align-items: center;
    font-size: 12.5px;
    color: var(--text-dim);
  }
  .find {
    position: relative;
    flex: 1 1 240px;
  }
  .find input {
    width: 100%;
  }
  .drop {
    position: absolute;
    z-index: 5;
    top: calc(100% + 4px);
    left: 0;
    right: 0;
    padding: 4px;
    border-radius: 9px;
    background: var(--surface-2);
    box-shadow: 0 8px 24px rgba(0, 0, 0, 0.4);
  }
  .drop button {
    display: flex;
    gap: 8px;
    align-items: center;
    width: 100%;
    padding: 6px 8px;
    border-radius: 6px;
    text-align: left;
    font-size: 13px;
  }
  .drop button:hover {
    background: var(--surface);
  }
  .drop img {
    width: 24px;
    height: 24px;
    object-fit: contain;
  }
  .hint {
    font-size: 12px;
    color: var(--text-faint);
  }
  .bar {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 10px;
    margin: 28px 0 10px;
  }
  .sum {
    font-size: 12.5px;
    color: var(--text-dim);
  }
  .grow {
    flex: 1;
  }
  .order {
    gap: 10px;
  }
  .order.hidden {
    opacity: 0.55;
  }
  .order.busy {
    opacity: 0.6;
    pointer-events: none;
  }
  .order .name a:hover {
    color: var(--accent);
  }
  .qty {
    width: 56px;
    font-size: 13px;
    color: var(--text-dim);
    font-variant-numeric: tabular-nums;
  }
  .price {
    color: var(--plat);
  }
</style>
