<script lang="ts">
  // Lazily loaded warframe.market price for one item slug.
  import { untrack } from "svelte";
  import { getPrice, cachedPrice, type Price } from "$lib/api";
  import Cur from "./Cur.svelte";

  let { slug, onprice, size = 15 }: { slug?: string; onprice?: (p: Price | null) => void; size?: number } = $props();

  let price = $state<Price | null>(null);
  let loading = $state(false);

  // Depends on `slug` only; the body writes state it also reads, so keep it untracked.
  $effect(() => {
    const s = slug;
    untrack(() => load(s));
  });

  function load(s: string | undefined) {
    if (!s) return;
    const cached = cachedPrice(s);
    if (cached) {
      price = cached;
      loading = false;
      onprice?.(cached);
      return;
    }
    price = null;
    loading = true;
    getPrice(s)
      .then((p) => {
        if (s !== slug) return;
        price = p;
        onprice?.(p);
      })
      .catch(() => onprice?.(null))
      .finally(() => {
        if (s === slug) loading = false;
      });
  }
</script>

{#if !slug}
  <span class="dash">—</span>
{:else if loading}
  <span class="dash pulse">···</span>
{:else if price?.sell != null}
  <span title="Дешевле всего у продавцов онлайн · покупатели дают {price.buy ?? '—'}"><Cur kind="plat" value={price.sell} {size} /></span>
{:else}
  <span class="dash" title="Нет продавцов онлайн">—</span>
{/if}

<style>
  .dash {
    color: var(--text-faint);
  }
  .pulse {
    animation: pulse 1s infinite;
  }
  @keyframes pulse {
    50% {
      opacity: 0.3;
    }
  }
</style>
