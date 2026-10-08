<script lang="ts">
  // New order: find the item (Russian or English name), pick side / rank / refinement / quantity,
  // and see its market right away to choose the price (quick prices fill the field). Posting is a click.
  import { t } from "$lib/i18n/index.svelte";
  import { tick } from "svelte";
  import { normalize } from "$lib/db";
  import { wfm, type WfmItem, type ItemNames } from "$lib/wfm.svelte";
  import Cur from "$lib/components/Cur.svelte";
  import MarketThumb from "$lib/components/MarketThumb.svelte";
  import { pageOfSlug } from "$lib/itemPage";
  import ItemMarket from "./ItemMarket.svelte";
  import type { NewOrderAsk } from "$lib/views/sub.svelte";

  let {
    items,
    names,
    initial = null,
    onposted,
    onclose,
  }: {
    items: Map<string, WfmItem>;
    names: Map<string, ItemNames> | null;
    initial?: NewOrderAsk | null;
    onposted: (type: "sell" | "buy") => void;
    onclose: () => void;
  } = $props();

  let q = $state("");
  let pick = $state<WfmItem | null>(null);
  let type = $state<"sell" | "buy">("sell");
  let price = $state(0);
  let qty = $state(1);
  let rank = $state(0);
  let sub = $state("");
  let visible = $state(true);
  let cursor = $state(0);
  let input = $state<HTMLInputElement>();

  // Search keys: both languages and the slug, every word a prefix.
  const keyed = $derived(
    [...items.values()].map((it) => {
      const n = names?.get(it.id);
      return { it, keys: `${normalize(it.name)} ${n ? normalize(n.ru) + " " + normalize(n.en) : ""} ${it.slug.replace(/_/g, " ")}`.split(" ") };
    }),
  );
  const found = $derived.by(() => {
    const words = normalize(q).split(" ").filter(Boolean);
    if (!words.length || pick) return [];
    const out: { it: WfmItem; score: number }[] = [];
    for (const k of keyed) {
      if (!words.every((w) => k.keys.some((x) => x.startsWith(w)))) continue;
      // Shorter names first: "Ash Prime Set" before "Ash Prime Systems Blueprint" for "ash prime".
      out.push({ it: k.it, score: k.it.name.length + (k.it.slug.endsWith("_set") ? -5 : 0) });
    }
    return out.sort((a, b) => a.score - b.score).slice(0, 8).map((x) => x.it);
  });

  function choose(it: WfmItem, side?: "sell" | "buy") {
    pick = it;
    q = it.name;
    rank = 0;
    sub = it.subtypes[0] ?? "";
    price = 0;
    if (side) type = side;
  }
  $effect(() => {
    if (initial) {
      const it = [...items.values()].find((x) => x.slug === initial.slug);
      if (it) {
        choose(it, initial.type);
        // From the sell list: the spare copies ("keep N" taken off) at the copy's rank.
        if (initial.qty) qty = initial.qty;
        if (initial.rank && it.maxRank) rank = Math.min(it.maxRank, initial.rank);
      }
    } else void tick().then(() => input?.focus());
  });

  function key(e: KeyboardEvent) {
    if (!found.length) return;
    if (e.key === "ArrowDown") (cursor = (cursor + 1) % found.length), e.preventDefault();
    else if (e.key === "ArrowUp") (cursor = (cursor - 1 + found.length) % found.length), e.preventDefault();
    else if (e.key === "Enter") choose(found[cursor]);
  }

  const nm = $derived(pick ? (names?.get(pick.id) ?? { ru: pick.name, en: pick.name }) : { ru: "", en: "" });
  const ok = $derived(!!pick && price > 0 && qty > 0);
  const page = $derived(pageOfSlug(pick?.slug));

  async function post() {
    if (!pick || !ok) return;
    await wfm.create({
      itemId: pick.id,
      type,
      platinum: Math.round(price),
      quantity: Math.round(qty),
      visible,
      ...(pick.maxRank ? { rank: Math.min(pick.maxRank, Math.max(0, rank)) } : {}),
      ...(sub ? { subtype: sub } : {}),
    });
    if (!wfm.error) onposted(type);
  }
  const subLabel = (s: string) => t(`mp.sub.${s}` as Parameters<typeof t>[0]) || s;
</script>

<div class="composer">
  <div class="head">
    <b>{t("trade.new.title")}</b>
    <span class="grow"></span>
    <button class="x" onclick={onclose} aria-label={t("trade.cancel")}>✕</button>
  </div>

  <div class="find">
    {#if pick && page}
      <a class="pic" href={page} title={t("trade.openPage")}><MarketThumb slug={pick.slug} thumb={pick.thumb} size={30} /></a>
    {:else if pick}
      <MarketThumb slug={pick.slug} thumb={pick.thumb} size={30} />
    {/if}
    <input
      bind:this={input}
      placeholder={t("orders.findItem")}
      bind:value={q}
      oninput={() => ((pick = null), (cursor = 0))}
      onkeydown={key}
    />
    {#if pick && page}<a class="open" href={page}>{t("trade.openPage")} →</a>{/if}
    {#if found.length}
      <div class="drop">
        {#each found as it, i (it.id)}
          <button class:cur={i === cursor} onclick={() => choose(it)} onmouseenter={() => (cursor = i)}>
            <MarketThumb slug={it.slug} thumb={it.thumb} size={26} />
            <span>{it.name}</span>
            {#if names?.get(it.id) && names.get(it.id)!.en !== it.name}<small>{names.get(it.id)!.en}</small>{/if}
          </button>
        {/each}
      </div>
    {/if}
  </div>

  {#if pick}
    <div class="form">
      <div class="seg">
        <button class:on={type === "sell"} onclick={() => (type = "sell")}>{t("orders.iSell")}</button>
        <button class:on={type === "buy"} onclick={() => (type = "buy")}>{t("orders.iBuy")}</button>
      </div>
      {#if pick.maxRank}
        <div class="field">
          <span>{t("orders.rank")}</span>
          <div class="seg small">
            <button class:on={rank === 0} onclick={() => (rank = 0)}>0</button>
            <button class:on={rank === pick.maxRank} onclick={() => (rank = pick!.maxRank)}>{pick.maxRank}</button>
          </div>
          <input class="n" type="number" min="0" max={pick.maxRank} bind:value={rank} />
        </div>
      {/if}
      {#if pick.subtypes.length}
        <select bind:value={sub}>
          {#each pick.subtypes as s}<option value={s}>{subLabel(s)}</option>{/each}
        </select>
      {/if}
      <div class="field">
        <span>{t("orders.qty")}</span>
        <input class="n" type="number" min="1" bind:value={qty} />
      </div>
      <div class="field">
        <span>{t("orders.price")}</span>
        <div class="stepper">
          <button onclick={() => (price = Math.max(1, price - 1))}>−</button>
          <input type="number" min="1" bind:value={price} onkeydown={(e) => e.key === "Enter" && post()} />
          <button onclick={() => (price = price + 1)}>+</button>
        </div>
      </div>
      <label class="vis"><input type="checkbox" bind:checked={visible} /> {t("trade.new.visible")}</label>
      <span class="grow"></span>
      <button class="primary" disabled={!ok || wfm.busy === "new"} onclick={post}>
        {#if price > 0}{t("trade.new.postFor")} <Cur kind="plat" value={price} size={13} />{:else}{t("orders.post")}{/if}
      </button>
    </div>

    {#key pick.id + rank + sub + type}
      <div class="market">
        <ItemMarket
          slug={pick.slug}
          item={nm}
          spec={{ type, platinum: price || 0, rank: pick.maxRank ? rank : undefined, subtype: sub || undefined }}
          myName={wfm.user?.ingameName ?? ""}
          onprice={(v) => (price = v)}
        />
      </div>
    {/key}
  {:else}
    <p class="hint">{t("trade.new.hint")}</p>
  {/if}
</div>

<style>
  .composer {
    padding: 14px 16px 16px;
    border-radius: 12px;
    background: var(--surface);
    border: 1px solid var(--line);
  }
  .head {
    display: flex;
    align-items: center;
    margin-bottom: 10px;
  }
  .head b {
    font-weight: 600;
  }
  .grow {
    flex: 1;
  }
  .x {
    color: var(--text-faint);
    padding: 2px 6px;
  }
  .x:hover {
    color: var(--text);
  }
  .find {
    position: relative;
    display: flex;
    align-items: center;
    gap: 10px;
  }
  .pic {
    display: inline-flex;
    flex: none;
  }
  .pic:hover {
    filter: brightness(1.15);
  }
  .open {
    flex: none;
    font-size: 12.5px;
    color: var(--accent);
    white-space: nowrap;
  }
  .open:hover {
    text-decoration: underline;
  }
  .find input {
    flex: 1;
    padding: 9px 12px;
    font-size: 14px;
  }
  input,
  select {
    padding: 6px 9px;
    border-radius: 7px;
    border: 1px solid var(--line);
    background: var(--bg);
    color: var(--text);
    font: inherit;
    font-size: 13px;
  }
  .drop {
    position: absolute;
    z-index: 10;
    top: calc(100% + 4px);
    left: 0;
    right: 0;
    padding: 4px;
    border-radius: 10px;
    background: var(--pop-bg);
    border: 1px solid var(--line);
    box-shadow: 0 12px 30px rgba(0, 0, 0, 0.45);
  }
  .drop button {
    display: flex;
    gap: 9px;
    align-items: center;
    width: 100%;
    padding: 6px 8px;
    border-radius: 7px;
    text-align: left;
    font-size: 13px;
  }
  .drop button.cur {
    background: var(--surface);
  }
  .drop small {
    color: var(--text-faint);
    font-size: 11.5px;
    margin-left: auto;
  }
  .form {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 12px;
    margin: 14px 0 4px;
  }
  .field {
    display: inline-flex;
    align-items: center;
    gap: 7px;
    font-size: 12.5px;
    color: var(--text-dim);
  }
  .n {
    width: 64px;
  }
  .seg {
    display: inline-flex;
    padding: 3px;
    border-radius: 9px;
    background: var(--bg);
  }
  .seg button {
    padding: 5px 12px;
    border-radius: 7px;
    font-size: 13px;
    color: var(--text-dim);
  }
  .seg.small button {
    padding: 3px 9px;
    font-size: 12px;
  }
  .seg button.on {
    background: var(--surface-2);
    color: var(--text);
  }
  .stepper {
    display: flex;
    align-items: center;
    border: 1px solid var(--line);
    border-radius: 8px;
    background: var(--bg);
    overflow: hidden;
  }
  .stepper button {
    width: 28px;
    height: 32px;
    color: var(--text-faint);
    font-size: 15px;
  }
  .stepper button:hover {
    color: var(--text);
    background: var(--surface-2);
  }
  .stepper input {
    width: 64px;
    border: none;
    text-align: center;
    color: var(--plat);
    font-weight: 600;
    font-size: 14px;
    background: transparent;
    appearance: textfield;
    -moz-appearance: textfield;
    outline: none;
  }
  .stepper input::-webkit-inner-spin-button {
    -webkit-appearance: none;
  }
  .vis {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    font-size: 12.5px;
    color: var(--text-dim);
  }
  .primary {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    padding: 8px 16px;
    border-radius: 8px;
    background: var(--accent);
    color: #1a1408;
    font-weight: 600;
  }
  .primary :global(.cur) {
    color: #1a1408;
  }
  .primary:disabled {
    opacity: 0.45;
    cursor: default;
  }
  .market {
    margin-top: 14px;
    padding-top: 14px;
    border-top: 1px solid var(--line);
  }
  .hint {
    margin: 10px 0 0;
    font-size: 12.5px;
    color: var(--text-faint);
  }
</style>
