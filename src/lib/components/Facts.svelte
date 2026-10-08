<script lang="ts">
  // Facts chips of a mini card: what the player holds (green) and the price (platinum). See facts.svelte.ts.
  import type { EntryKind } from "$lib/db";
  import { factsOf } from "$lib/facts.svelte";
  import Cur from "./Cur.svelte";

  let { kind, id, slug, price = true }: { kind: EntryKind; id: string; slug?: string; price?: boolean } = $props();
  const f = $derived(factsOf(kind, id, slug));
</script>

{#if f.own || (price && f.plat)}
  <span class="facts">
    {#if f.own}<span class="own" class:full={f.full}>{f.own}</span>{/if}
    {#if price && f.plat}<span class="plat"><Cur kind="plat" value={Math.round(f.plat * 10) / 10} size={11} /></span>{/if}
  </span>
{/if}

<style>
  .facts {
    display: inline-flex;
    align-items: center;
    gap: 8px;
    flex: none;
    font-size: 11.5px;
    white-space: nowrap;
  }
  .own {
    padding: 1px 7px;
    border-radius: 999px;
    color: var(--text-dim);
    background: var(--surface-2);
  }
  .own.full {
    color: var(--good);
    background: rgba(111, 207, 151, 0.12);
  }
  .plat {
    color: #cfe0ff;
    font-variant-numeric: tabular-nums;
  }
</style>
