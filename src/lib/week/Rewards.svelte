<script lang="ts">
  // A reward table of a weekly activity: icon, name, amount, chance as a thin bar. Shows the likeliest few,
  // the rest behind «ещё N». Rows are DE's (ExportRewards / official drop tables), already sorted.
  // A row with an app page links to it.
  import { num, t } from "$lib/i18n/index.svelte";
  import { pageOf } from "$lib/itemRef.svelte";
  import type { Reward } from "$lib/weekly";
  import ItemThumb from "$lib/components/ItemThumb.svelte";

  let { list, show = 6, hint = "" }: { list: Reward[]; show?: number; hint?: string } = $props();

  let all = $state(false);
  const rows = $derived(all ? list : list.slice(0, show));
  const top = $derived(Math.max(0.0001, ...list.map((r) => r[3])));
  const pct = (p: number) => (p >= 0.1 ? num(p * 100, 0) : p >= 0.01 ? num(p * 100, 1) : num(p * 100, 2));
  // Tauforged shards are the prize of every table that has them.
  const prize = (name: string) => /таукован|tauforged/i.test(name);
</script>

{#if list.length}
  <div class="rw">
    {#if hint}<p class="hint">{hint}</p>{/if}
    {#each rows as r, i (i)}
      {@const href = pageOf(r[4])}
      <svelte:element this={href ? "a" : "div"} {href} class="r" class:link={!!href} class:prize={prize(r[0])}>
        <ItemThumb id={r[4]} icon={r[1]} name={r[0]} />
        <span class="n">{r[0]}{#if r[2] > 1}<small> ×{num(r[2])}</small>{/if}</span>
        <span class="bar"><i style:width="{(r[3] / top) * 100}%"></i></span>
        <span class="p">{pct(r[3])}%</span>
      </svelte:element>
    {/each}
    {#if list.length > show}
      <button class="more" onclick={() => (all = !all)}>{all ? t("week.less") : t("week.more", { n: list.length - show })}</button>
    {/if}
  </div>
{/if}

<style>
  .rw {
    display: flex;
    flex-direction: column;
    gap: 1px;
  }
  .hint {
    margin: 0 0 6px;
    font-size: 12px;
    color: var(--text-faint);
    line-height: 1.4;
  }
  .r {
    display: grid;
    grid-template-columns: 48px minmax(0, 1fr) 40px 42px;
    align-items: center;
    gap: 10px;
    padding: 4px 6px;
    border-radius: 8px;
    font-size: 12.5px;
  }
  .r:hover {
    background: var(--surface);
  }
  .r.link {
    color: inherit;
    text-decoration: none;
    cursor: pointer;
  }
  .r.link:hover .n {
    color: var(--accent);
  }
  .n {
    min-width: 0;
    line-height: 1.3;
    color: var(--text);
  }
  .n small {
    color: var(--text-faint);
    font-size: 11.5px;
  }
  .prize .n {
    color: var(--accent);
  }
  .bar {
    height: 4px;
    border-radius: 2px;
    background: var(--surface-2);
    overflow: hidden;
  }
  .bar i {
    display: block;
    height: 100%;
    border-radius: 2px;
    background: var(--text-faint);
  }
  .prize .bar i {
    background: var(--accent);
  }
  .p {
    text-align: right;
    font-variant-numeric: tabular-nums;
    color: var(--text-dim);
    font-size: 12px;
  }
  .more {
    align-self: flex-start;
    margin-top: 4px;
    padding: 4px 8px;
    border-radius: 7px;
    font-size: 12px;
    color: var(--text-dim);
  }
  .more:hover {
    background: var(--surface);
    color: var(--text);
  }
</style>
