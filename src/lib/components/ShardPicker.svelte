<script lang="ts">
  // Socket editor: colour, regular / tauforged, bonus. Shows how many loose shards of the colour the inventory has.
  import { t } from "$lib/i18n/index.svelte";
  import { iconUrl } from "$lib/db";
  import type { FramesDb } from "$lib/frames";
  import { inventory } from "$lib/inventory.svelte";
  import { bonusesOf, colorKey, shardId, shardInfo, shardText, SHARD_COLORS, SHARD_HUE, type ShardColor } from "$lib/shards";

  let {
    db,
    n,
    current,
    all,
    onpick,
    onclose,
  }: {
    db: FramesDb;
    n: number; // socket number, 1..5
    current: string | null;
    all: (string | null)[];
    onpick: (id: string | null) => void;
    onclose: () => void;
  } = $props();

  const cur = $derived(current ? shardInfo(current) : null);
  // svelte-ignore state_referenced_locally
  let color = $state<ShardColor>(cur?.color ?? "ACC_RED");
  // svelte-ignore state_referenced_locally
  let tau = $state(cur?.tau ?? false);

  const loose = (c: ShardColor, m: boolean) => inventory.count(db.shards[colorKey(c, m)]?.item ?? "");
  const shortName = (c: ShardColor) => db.shards[c]?.name.split(" ")[0] ?? c;
</script>

<svelte:window onkeydown={(e) => e.key === "Escape" && (e.stopPropagation(), onclose())} />

<!-- svelte-ignore a11y_click_events_have_key_events, a11y_no_static_element_interactions -->
<div class="backdrop" onclick={onclose}>
  <!-- svelte-ignore a11y_click_events_have_key_events, a11y_no_static_element_interactions -->
  <div class="dialog" onclick={(e) => e.stopPropagation()}>
    <div class="head">
      <b>{t("shard.socket", { n })}</b>
      <button class="x" onclick={onclose} aria-label={t("common.close")}>✕</button>
    </div>

    <div class="colors">
      {#each SHARD_COLORS as c}
        {@const have = loose(c, false)}
        <button class="color" class:on={c === color} style:--hue={SHARD_HUE[c]} onclick={() => (color = c)}>
          <img src={iconUrl(db.shards[colorKey(c, tau)]?.icon ?? null)} alt="" />
          <span>{shortName(c)}</span>
          {#if have}<small title={t("shard.looseHint")}>×{have}</small>{/if}
        </button>
      {/each}
    </div>

    <label class="tau">
      <input type="checkbox" bind:checked={tau} />
      <span>{t("shard.tau")}</span>
      <small>{t("shard.tauHint")}</small>
      {#if loose(color, true)}<small class="have">{t("shard.looseN", { v: loose(color, true) })}</small>{/if}
    </label>

    <div class="list">
      {#each bonusesOf(color) as key (key)}
        {@const id = shardId(key, tau)}
        <button class="bonus" class:on={id === current} style:--hue={SHARD_HUE[color]} onclick={() => onpick(id)}>
          {shardText(id, all)}
        </button>
      {/each}
    </div>

    {#if current}<button class="clear" onclick={() => onpick(null)}>{t("shard.remove")}</button>{/if}
    <p class="src">{t("shard.source")}</p>
  </div>
</div>

<style>
  .backdrop {
    position: fixed;
    inset: 0;
    z-index: 40;
    background: rgba(5, 6, 9, 0.6);
    display: grid;
    place-items: center;
  }
  .dialog {
    width: min(560px, calc(100vw - 40px));
    display: flex;
    flex-direction: column;
    gap: 12px;
    padding: 16px 18px;
    border-radius: 14px;
    background: var(--pop-bg, var(--surface));
    border: 1px solid var(--line);
    box-shadow: 0 18px 50px rgba(0, 0, 0, 0.55);
  }
  .head {
    display: flex;
    justify-content: space-between;
    align-items: center;
  }
  .x {
    color: var(--text-dim);
    font-size: 16px;
  }
  .colors {
    display: grid;
    grid-template-columns: repeat(6, 1fr);
    gap: 6px;
  }
  .color {
    position: relative;
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 2px;
    padding: 8px 4px 6px;
    border-radius: 10px;
    border: 1px solid var(--line);
    font-size: 11.5px;
    color: var(--text-dim);
  }
  .color img {
    width: 34px;
    height: 34px;
    object-fit: contain;
  }
  .color.on {
    color: var(--text);
    border-color: var(--hue);
    background: color-mix(in srgb, var(--hue) 14%, transparent);
  }
  .color small {
    position: absolute;
    top: 4px;
    right: 6px;
    font-size: 10.5px;
    color: var(--good);
  }
  .tau {
    display: flex;
    align-items: baseline;
    gap: 8px;
    font-size: 13px;
  }
  .tau input {
    accent-color: var(--accent);
  }
  .tau small {
    color: var(--text-faint);
    font-size: 11.5px;
  }
  .tau small.have {
    color: var(--good);
  }
  .list {
    display: flex;
    flex-direction: column;
    gap: 4px;
  }
  .bonus {
    text-align: left;
    padding: 9px 12px;
    border-radius: 9px;
    border: 1px solid transparent;
    border-left: 3px solid var(--hue);
    background: var(--surface-2);
    font-size: 13px;
  }
  .bonus:hover {
    border-color: var(--line);
    border-left-color: var(--hue);
  }
  .bonus.on {
    border-color: var(--hue);
    background: color-mix(in srgb, var(--hue) 14%, var(--surface-2));
  }
  .clear {
    align-self: flex-start;
    font-size: 12px;
    padding: 5px 10px;
    border-radius: 8px;
    border: 1px solid var(--line);
    color: var(--text-dim);
  }
  .clear:hover {
    color: var(--warn);
  }
  .src {
    margin: 0;
    font-size: 11px;
    color: var(--text-faint);
  }
</style>
