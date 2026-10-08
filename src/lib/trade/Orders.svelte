<script lang="ts">
  // "Orders": the player's warframe.market desk. Status (with a timer / by the game), all orders with
  // their place in the market after one "Check market" click, suggested prices filled into drafts, one
  // "Save" for all changes, the item's order book and price chart on expand, new orders with the market
  // beside the price field, and a log of trades closed here. Every request is a click (WFM's rules):
  // no background refresh, no automatic repricing.
  import { t, num, locale } from "$lib/i18n/index.svelte";
  import { onMount, untrack } from "svelte";
  import { wfm, wfmStatus, trades, loadWfmItems, loadWfmNames, type MyOrder, type WfmItem, type ItemNames } from "$lib/wfm.svelte";
  import { loadBulk, bulkSell } from "$lib/api";
  import Cur from "$lib/components/Cur.svelte";
  import StatusPicker from "./StatusPicker.svelte";
  import OrderRow from "./OrderRow.svelte";
  import Composer from "./Composer.svelte";
  import { books, loadBook, cachedStats, position, type Pos } from "./market.svelte";
  import { tradeSettings } from "./settings.svelte";
  import type { NewOrderAsk } from "$lib/views/sub.svelte";

  let { compact = false, initial = null }: { compact?: boolean; initial?: NewOrderAsk | null } = $props();

  let items = $state<Map<string, WfmItem> | null>(null);
  let names = $state<Map<string, ItemNames> | null>(null);
  let bulkReady = $state(false);
  onMount(() => {
    loadWfmItems().then((m) => (items = m));
    loadWfmNames().then((m) => (names = m));
    loadBulk().then(() => (bulkReady = true));
    if (!wfm.checked) void wfm.check();
  });

  let side = $state<"sell" | "buy">("sell");
  let filter = $state("");
  type Sort = "attention" | "name" | "value" | "updated";
  let sort = $state<Sort>("attention");
  let composer = $state<NewOrderAsk | null | false>(untrack(() => initial ?? false));
  let openId = $state<string | null>(null);
  let gear = $state(false);

  const me = $derived(wfm.user?.ingameName ?? "");
  const itemOf = (o: MyOrder) => items?.get(o.itemId);
  const namesOf = (o: MyOrder): ItemNames => names?.get(o.itemId) ?? { ru: itemOf(o)?.name ?? "", en: itemOf(o)?.name ?? "" };
  const per = (o: MyOrder) => Math.max(1, o.perTrade ?? 1);
  const value = (o: MyOrder) => o.platinum * Math.floor(o.quantity / per(o));

  // ---- drafts: price / quantity changes waiting for "Save"
  let drafts = $state<Record<string, { platinum?: number; quantity?: number }>>({});
  const draftCount = $derived(Object.keys(drafts).length);
  function setDraft(id: string, d: { platinum?: number; quantity?: number } | null) {
    if (d) drafts[id] = d;
    else delete drafts[id];
  }
  async function saveOne(o: MyOrder) {
    const d = drafts[o.id];
    if (!d) return;
    delete drafts[o.id];
    await wfm.update(o, { ...(d.platinum ? { platinum: d.platinum } : {}), ...(d.quantity ? { quantity: d.quantity } : {}) });
  }
  let saving = $state(false);
  async function saveAll() {
    saving = true;
    for (const o of wfm.orders.filter((x) => drafts[x.id])) await saveOne(o);
    saving = false;
  }

  // ---- market check: one order-list request per distinct item, on the click
  let checking = $state<{ done: number; all: number } | null>(null);
  let checkedAt = $state(0);
  async function checkMarket() {
    const slugs = [...new Set(wfm.orders.map((o) => itemOf(o)?.slug).filter(Boolean))] as string[];
    checking = { done: 0, all: slugs.length };
    await Promise.all(
      slugs.map((s) =>
        loadBook(s).finally(() => {
          if (checking) checking = { ...checking, done: checking.done + 1 };
        }),
      ),
    );
    checking = null;
    checkedAt = Date.now();
  }

  const posOf = (o: MyOrder, draft = true): Pos | null => {
    const it = itemOf(o);
    const b = it ? books[it.slug] : undefined;
    if (!it || !b) return null;
    const d = draft ? drafts[o.id] : undefined;
    const median = cachedStats(it.slug, o)?.median48 ?? (bulkReady ? (bulkSell(it.slug) ?? null) : null);
    return position({ ...o, platinum: d?.platinum ?? o.platinum }, b.list, me, tradeSettings.v, median);
  };
  // Positions against the saved prices (what the market sees now), for the counters and the sort.
  const positions = $derived.by(() => {
    void tradeSettings.v;
    const m = new Map<string, Pos | null>();
    for (const o of wfm.orders) m.set(o.id, items && books[itemOf(o)?.slug ?? ""] ? posOf(o, false) : null);
    return m;
  });

  const ofSide = $derived(wfm.orders.filter((o) => o.type === side));
  const count = $derived({ sell: wfm.orders.filter((o) => o.type === "sell").length, buy: wfm.orders.filter((o) => o.type === "buy").length });
  const urgency = (o: MyOrder) => {
    const p = positions.get(o.id);
    if (!p) return 3;
    if (p.deal) return 0;
    if (p.rank > 1) return 1;
    if (p.suggest != null) return 2;
    return 3;
  };
  const list = $derived.by(() => {
    const words = filter.trim().toLowerCase().split(/\s+/).filter(Boolean);
    const rows = ofSide.filter((o) => {
      if (!words.length) return true;
      const n = namesOf(o);
      const hay = `${itemOf(o)?.name ?? ""} ${n.ru} ${n.en}`.toLowerCase();
      return words.every((w) => hay.includes(w));
    });
    const byName = (a: MyOrder, b: MyOrder) => (itemOf(a)?.name ?? "").localeCompare(itemOf(b)?.name ?? "");
    const cmp: Record<Sort, (a: MyOrder, b: MyOrder) => number> = {
      attention: (a, b) => urgency(a) - urgency(b) || Number(b.visible) - Number(a.visible) || byName(a, b),
      name: byName,
      value: (a, b) => value(b) - value(a),
      updated: (a, b) => b.updatedAt.localeCompare(a.updatedAt),
    };
    return rows.sort(cmp[sort]);
  });

  const kpi = $derived.by(() => {
    const vis = (type: "sell" | "buy") => wfm.orders.filter((o) => o.type === type && o.visible);
    const checked = wfm.orders.filter((o) => positions.get(o.id));
    const dayAgo = Date.now() - 24 * 3600_000;
    const recent = trades.list.filter((x) => x.at >= dayAgo);
    return {
      sell: vis("sell").reduce((s, o) => s + value(o), 0),
      buy: vis("buy").reduce((s, o) => s + value(o), 0),
      behind: checked.filter((o) => (positions.get(o.id)?.rank ?? 1) > 1).length,
      deals: checked.filter((o) => positions.get(o.id)?.deal).length,
      suggest: wfm.orders.filter((o) => positions.get(o.id)?.suggest != null),
      earned: recent.filter((x) => x.type === "sell").reduce((s, x) => s + x.platinum, 0),
      spent: recent.filter((x) => x.type === "buy").reduce((s, x) => s + x.platinum, 0),
      checked: checked.length,
    };
  });

  // Fill every suggestion into the drafts (the player still presses "Save").
  function fillSuggestions() {
    for (const o of kpi.suggest) {
      const p = positions.get(o.id);
      if (p?.suggest != null) drafts[o.id] = { ...drafts[o.id], platinum: p.suggest };
    }
  }

  async function setAllVisible(v: boolean) {
    for (const o of ofSide.filter((x) => x.visible !== v)) await wfm.update(o, { visible: v });
  }

  // Minutes since the check, refreshed every 30 s.
  let now = $state(Date.now());
  $effect(() => {
    const id = setInterval(() => (now = Date.now()), 30_000);
    return () => clearInterval(id);
  });
  const ago = $derived(checkedAt ? Math.floor((now - checkedAt) / 60_000) : null);

  let showTrades = $state(false);
  const fmtTime = (ms: number) => new Date(ms).toLocaleString(locale(), { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });

  function onwin(e: MouseEvent) {
    if (gear && !(e.target as Element).closest(".gearbox")) gear = false;
  }
  function onkey(e: KeyboardEvent) {
    if ((e.ctrlKey || e.metaKey) && e.key === "s" && draftCount) {
      e.preventDefault();
      void saveAll();
    }
  }

  export function dismiss(): boolean {
    if (gear) return !(gear = false);
    if (composer) return !(composer = false);
    if (openId) return !(openId = null);
    return false;
  }
</script>

<svelte:window onclick={onwin} onkeydown={onkey} />

<div class="desk" class:compact>
  <header class="top">
    <div class="who">
      {#if !compact}<h1>{t("orders.title")}</h1>{/if}
      {#if wfm.user}
        <div class="acct">
          {#if wfm.user.avatar}<img class="ava" src="https://warframe.market/static/assets/{wfm.user.avatar}" alt="" />{/if}
          <span class="nick">{wfm.user.ingameName}</span>
          {#if wfm.user.reputation != null}<span class="tag">{t("orders.rep", { v: wfm.user.reputation })}</span>{/if}
          <button class="link" onclick={() => wfm.logout()}>{t("orders.logout")}</button>
        </div>
      {/if}
    </div>
    {#if wfm.user}<StatusPicker />{/if}
  </header>

  {#if wfm.error}<p class="err">{wfm.error}</p>{/if}

  {#if !wfm.checked}
    <p class="muted">{t("orders.checking")}</p>
  {:else if !wfm.user}
    <div class="intro">
      <p>{t("orders.introWhy")}</p>
      <div class="feats">
        <div><b>{t("trade.intro.f1")}</b><span>{t("trade.intro.f1d")}</span></div>
        <div><b>{t("trade.intro.f2")}</b><span>{t("trade.intro.f2d")}</span></div>
        <div><b>{t("trade.intro.f3")}</b><span>{t("trade.intro.f3d")}</span></div>
        <div><b>{t("trade.intro.f4")}</b><span>{t("trade.intro.f4d")}</span></div>
      </div>
      <ul>
        <li>{t("orders.introPass")}</li>
        <li>{t("orders.introToken")}</li>
        <li>{t("orders.introRules")}</li>
      </ul>
      <button class="primary" onclick={() => wfm.login()}>{t("orders.login")}</button>
      <p class="muted small">{t("orders.loginHint")}</p>
    </div>
  {:else}
    <div class="kpis">
      <div class="k">
        <span class="kl">{t("trade.k.selling")}</span>
        <span class="kv"><Cur kind="plat" value={num(kpi.sell)} size={15} /></span>
        <span class="ks">{t("trade.k.orders", { n: count.sell })}</span>
      </div>
      <div class="k">
        <span class="kl">{t("trade.k.buying")}</span>
        <span class="kv"><Cur kind="plat" value={num(kpi.buy)} size={15} /></span>
        <span class="ks">{t("trade.k.orders", { n: count.buy })}</span>
      </div>
      <div class="k" class:warn={kpi.behind > 0}>
        <span class="kl">{t("trade.k.behind")}</span>
        <span class="kv">{kpi.checked ? kpi.behind : "—"}</span>
        <span class="ks">{kpi.checked ? t("trade.k.behindSub") : t("trade.k.notChecked")}</span>
      </div>
      <div class="k" class:good={kpi.deals > 0}>
        <span class="kl">{t("trade.k.deals")}</span>
        <span class="kv">{kpi.checked ? kpi.deals : "—"}</span>
        <span class="ks">{t("trade.k.dealsSub")}</span>
      </div>
      <button class="k" onclick={() => (showTrades = !showTrades)} title={t("trade.k.dayHint")}>
        <span class="kl">{t("trade.k.day")}</span>
        <span class="kv"><Cur kind="plat" value={num(kpi.earned)} size={15} /></span>
        <span class="ks">{kpi.spent ? t("trade.k.spent", { v: num(kpi.spent) }) : t("trade.k.daySub")}</span>
      </button>
    </div>

    {#if showTrades}
      <div class="trades">
        {#if !trades.list.length}
          <p class="muted small">{t("trade.log.none")}</p>
        {:else}
          {#each trades.list.slice(0, 30) as x (x.at)}
            <div class="tr">
              <span class="tt">{fmtTime(x.at)}</span>
              <span class="tn">{items?.get(x.itemId)?.name ?? x.itemId}{x.pieces > 1 ? ` ×${x.pieces}` : ""}</span>
              <span class={x.type === "sell" ? "plus" : "minus"}>{x.type === "sell" ? "+" : "−"}<Cur kind="plat" value={x.platinum} size={12} /></span>
            </div>
          {/each}
        {/if}
        <p class="muted small">{t("trade.log.note")}</p>
      </div>
    {/if}

    {#if composer !== false && items}
      <Composer
        {items}
        {names}
        initial={composer}
        onposted={(type) => ((side = type), (composer = false))}
        onclose={() => (composer = false)}
      />
    {/if}

    <div class="bar">
      <div class="seg">
        <button class:on={side === "sell"} onclick={() => (side = "sell")}>{t("orders.selling", { n: count.sell })}</button>
        <button class:on={side === "buy"} onclick={() => (side = "buy")}>{t("orders.buying", { n: count.buy })}</button>
      </div>
      <input class="filter" placeholder={t("trade.filter")} bind:value={filter} />
      <select bind:value={sort} title={t("trade.sort")}>
        <option value="attention">{t("trade.sort.attention")}</option>
        <option value="name">{t("trade.sort.name")}</option>
        <option value="value">{t("trade.sort.value")}</option>
        <option value="updated">{t("trade.sort.updated")}</option>
      </select>
      <span class="grow"></span>
      <button class="ghost" disabled={!!checking || !wfm.orders.length} onclick={checkMarket} title={t("orders.checkHint")}>
        {#if checking}{t("trade.checking", { d: checking.done, n: checking.all })}{:else}{t("orders.check")}{/if}
      </button>
      {#if ago != null && !checking}<span class="faint">{ago < 1 ? t("trade.justNow") : t("trade.ago", { n: ago })}</span>{/if}
      <div class="gearbox">
        <button class="ghost icon" onclick={() => (gear = !gear)} title={t("trade.set.title")} aria-label={t("trade.set.title")}>
          <svg viewBox="0 0 24 24"><path d="M4 7h10M18 7h2M4 17h4M12 17h8" /><circle cx="16" cy="7" r="2" /><circle cx="10" cy="17" r="2" /></svg>
        </button>
        {#if gear}
          <div class="pop">
            <div class="lbl">{t("trade.set.title")}</div>
            <label class="line">
              <span>{t("trade.set.step")}</span>
              <input class="n" type="number" min="1" value={tradeSettings.v.step} oninput={(e) => Number(e.currentTarget.value) > 0 && tradeSettings.set({ step: Math.round(Number(e.currentTarget.value)) })} />
            </label>
            <label class="line">
              <span>{t("trade.set.floor")}</span>
              <select value={String(tradeSettings.v.floor)} onchange={(e) => tradeSettings.set({ floor: Number(e.currentTarget.value) })}>
                <option value="0.9">−10%</option>
                <option value="0.8">−20%</option>
                <option value="0.7">−30%</option>
                <option value="0.5">−50%</option>
                <option value="0.01">{t("trade.set.noFloor")}</option>
              </select>
            </label>
            <label class="line">
              <span>{t("trade.set.online")}</span>
              <input type="checkbox" checked={tradeSettings.v.online} onchange={(e) => tradeSettings.set({ online: e.currentTarget.checked })} />
            </label>
            <p class="note">{t("trade.set.note")}</p>
            <div class="sep"></div>
            <button class="menu" onclick={() => ((gear = false), setAllVisible(false))}>{t("trade.hideAll")}</button>
            <button class="menu" onclick={() => ((gear = false), setAllVisible(true))}>{t("trade.showAll")}</button>
            <button class="menu" onclick={() => ((gear = false), wfm.loadOrders())}>{t("orders.refresh")}</button>
          </div>
        {/if}
      </div>
      {#if composer === false}
        <button class="primary" onclick={() => (composer = null)}>＋ {t("trade.new")}</button>
      {/if}
    </div>

    {#if kpi.suggest.length && !draftCount}
      <div class="tip">
        <span>{t("trade.suggestN", { n: kpi.suggest.length })}</span>
        <button class="link" onclick={fillSuggestions}>{t("trade.fill")}</button>
      </div>
    {/if}

    {#if wfm.loading && !wfm.orders.length}
      <p class="muted">{t("orders.loading")}</p>
    {:else if !list.length}
      <div class="empty">
        <p class="muted">{filter ? t("trade.noMatch") : side === "sell" ? t("orders.noneSell") : t("orders.noneBuy")}</p>
      </div>
    {:else}
      <div class="rows">
        {#each list as o (o.id)}
          {@const it = itemOf(o)}
          <OrderRow
            {o}
            {it}
            names={namesOf(o)}
            pos={it && books[it.slug] ? posOf(o) : null}
            avg={it && bulkReady ? bulkSell(it.slug) : undefined}
            draft={drafts[o.id]}
            open={openId === o.id}
            onDraft={(d) => setDraft(o.id, d)}
            onSave={() => saveOne(o)}
            onToggle={() => (openId = openId === o.id ? null : o.id)}
          />
        {/each}
      </div>
    {/if}

    {#if draftCount}
      <div class="savebar">
        <span>{t("trade.changed", { n: draftCount })}</span>
        <span class="faint">{t("trade.saveKeys")}</span>
        <span class="grow"></span>
        <button class="ghost" onclick={() => (drafts = {})}>{t("trade.cancel")}</button>
        <button class="primary" disabled={saving} onclick={saveAll}>{saving ? t("trade.saving") : t("trade.saveAll")}</button>
      </div>
    {/if}
  {/if}
</div>

<style>
  .desk {
    max-width: 1120px;
    margin: 0 auto;
    padding: 26px 32px 90px;
    display: flex;
    flex-direction: column;
    gap: 14px;
  }
  .desk.compact {
    padding: 0 0 70px;
    max-width: none;
  }
  .top {
    display: flex;
    align-items: flex-end;
    justify-content: space-between;
    gap: 16px;
  }
  .compact .top {
    align-items: center;
  }
  h1 {
    margin: 0 0 6px;
    font-size: 24px;
    font-weight: 600;
  }
  .acct {
    display: flex;
    align-items: center;
    gap: 8px;
    color: var(--text-dim);
  }
  .ava {
    width: 22px;
    height: 22px;
    border-radius: 50%;
    object-fit: cover;
  }
  .nick {
    color: var(--text);
    font-weight: 500;
  }
  .link {
    color: var(--accent);
    font-size: 13px;
  }
  .err {
    color: var(--warn);
    margin: 0;
  }
  .muted {
    color: var(--text-dim);
  }
  .small {
    font-size: 12px;
  }
  .faint {
    font-size: 12px;
    color: var(--text-faint);
    white-space: nowrap;
  }
  .grow {
    flex: 1;
  }
  .intro {
    max-width: 680px;
    line-height: 1.55;
    color: var(--text-dim);
  }
  .intro ul {
    padding-left: 18px;
    font-size: 13px;
  }
  .feats {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 10px;
    margin: 16px 0;
  }
  .feats div {
    display: flex;
    flex-direction: column;
    gap: 3px;
    padding: 12px 14px;
    border-radius: 10px;
    background: var(--surface);
  }
  .feats b {
    color: var(--text);
    font-weight: 500;
  }
  .feats span {
    font-size: 12.5px;
  }
  .kpis {
    display: grid;
    grid-template-columns: repeat(5, minmax(0, 1fr));
    gap: 8px;
  }
  .compact .kpis {
    grid-template-columns: repeat(5, minmax(0, 1fr));
  }
  @media (max-width: 900px) {
    .kpis {
      grid-template-columns: repeat(2, minmax(0, 1fr));
    }
  }
  .k {
    display: flex;
    flex-direction: column;
    gap: 2px;
    padding: 10px 14px;
    border-radius: 10px;
    background: var(--surface);
    text-align: left;
    border: 1px solid transparent;
  }
  button.k:hover {
    border-color: var(--line);
  }
  .kl {
    font-size: 11px;
    text-transform: uppercase;
    letter-spacing: 0.07em;
    color: var(--text-faint);
  }
  .kv {
    font-size: 20px;
    font-weight: 600;
    font-variant-numeric: tabular-nums;
  }
  .ks {
    font-size: 11.5px;
    color: var(--text-faint);
  }
  .k.warn .kv {
    color: var(--warn);
  }
  .k.good .kv {
    color: var(--good);
  }
  .trades {
    padding: 10px 14px;
    border-radius: 10px;
    background: var(--surface);
  }
  .tr {
    display: flex;
    align-items: center;
    gap: 12px;
    padding: 3px 0;
    font-size: 13px;
  }
  .tt {
    width: 120px;
    color: var(--text-faint);
    font-size: 12px;
  }
  .tn {
    flex: 1;
  }
  .plus {
    color: var(--good);
    display: inline-flex;
    gap: 2px;
  }
  .minus {
    color: var(--text-dim);
    display: inline-flex;
    gap: 2px;
  }
  .bar {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 10px;
    margin-top: 6px;
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
  .filter {
    width: 180px;
  }
  .n {
    width: 60px;
  }
  .primary {
    padding: 7px 14px;
    border-radius: 8px;
    background: var(--accent);
    color: #1a1408;
    font-weight: 600;
    font-size: 13px;
  }
  .primary:disabled {
    opacity: 0.45;
    cursor: default;
  }
  .ghost {
    padding: 6px 11px;
    border-radius: 8px;
    background: var(--surface-2);
    font-size: 12.5px;
    color: var(--text-dim);
  }
  .ghost:hover:not(:disabled) {
    color: var(--text);
  }
  .ghost:disabled {
    opacity: 0.6;
    cursor: default;
  }
  .ghost.icon {
    display: inline-flex;
    padding: 6px 8px;
  }
  .ghost svg {
    width: 16px;
    height: 16px;
    fill: none;
    stroke: currentColor;
    stroke-width: 1.8;
    stroke-linecap: round;
  }
  .gearbox {
    position: relative;
  }
  .pop {
    position: absolute;
    z-index: 20;
    right: 0;
    top: calc(100% + 6px);
    width: 290px;
    padding: 10px 12px;
    border-radius: 12px;
    background: var(--pop-bg);
    border: 1px solid var(--line);
    box-shadow: 0 14px 40px rgba(0, 0, 0, 0.5);
  }
  .pop .lbl {
    font-size: 11px;
    text-transform: uppercase;
    letter-spacing: 0.08em;
    color: var(--text-faint);
    margin-bottom: 8px;
  }
  .line {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 10px;
    padding: 4px 0;
    font-size: 13px;
    color: var(--text-dim);
  }
  .pop input,
  .pop select {
    background: var(--bg);
  }
  .note {
    font-size: 11.5px;
    color: var(--text-faint);
    line-height: 1.4;
    margin: 6px 0 0;
  }
  .sep {
    height: 1px;
    background: var(--line);
    margin: 10px 0 6px;
  }
  .menu {
    display: block;
    width: 100%;
    text-align: left;
    padding: 6px 6px;
    border-radius: 7px;
    font-size: 13px;
    color: var(--text-dim);
  }
  .menu:hover {
    background: var(--surface);
    color: var(--text);
  }
  .tip {
    display: flex;
    gap: 10px;
    align-items: center;
    padding: 8px 12px;
    border-radius: 9px;
    background: rgba(143, 184, 255, 0.08);
    border: 1px solid rgba(143, 184, 255, 0.25);
    font-size: 13px;
  }
  .rows {
    display: flex;
    flex-direction: column;
    gap: 4px;
  }
  .empty {
    padding: 30px 0;
    text-align: center;
  }
  .savebar {
    position: sticky;
    bottom: 14px;
    display: flex;
    align-items: center;
    gap: 12px;
    padding: 10px 12px 10px 16px;
    border-radius: 12px;
    background: var(--surface-2);
    border: 1px solid rgba(143, 184, 255, 0.35);
    box-shadow: 0 12px 34px rgba(0, 0, 0, 0.5);
    font-size: 13px;
  }
</style>
