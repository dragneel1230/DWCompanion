<script lang="ts">
  // Five Archon shard sockets with their bonuses; editable ones open the picker.
  import { t } from "$lib/i18n/index.svelte";
  import { iconUrl } from "$lib/db";
  import type { FramesDb } from "$lib/frames";
  import { colorKey, shardInfo, shardText, SHARD_HUE, SHARD_SLOTS } from "$lib/shards";
  import ShardPicker from "./ShardPicker.svelte";

  let {
    db,
    shards = $bindable(),
    editable = false,
    compact = false,
  }: { db: FramesDb; shards: (string | null)[] | undefined; editable?: boolean; compact?: boolean } = $props();

  let picking = $state<number | null>(null);
  const list = $derived(Array.from({ length: SHARD_SLOTS }, (_, i) => shards?.[i] ?? null));

  function set(i: number, id: string | null) {
    const next = [...list];
    next[i] = id;
    shards = next.some(Boolean) ? next : undefined;
    picking = null;
  }
</script>

<div class="shards" class:compact>
  {#each list as id, i}
    {@const s = id ? shardInfo(id) : null}
    {@const icon = s?.color ? db.shards[colorKey(s.color, s.tau)]?.icon : null}
    <svelte:element
      this={editable ? "button" : "div"}
      role={editable ? "button" : undefined}
      class="sock"
      class:empty={!id}
      class:tau={s?.tau}
      style:--hue={s?.color ? SHARD_HUE[s.color] : "var(--line)"}
      title={id ? `${s?.color ? db.shards[colorKey(s.color, s.tau)]?.name : ""}\n${shardText(id, list)}` : t("shard.empty")}
      onclick={() => editable && (picking = i)}
    >
      <span class="gem">{#if icon}<img src={iconUrl(icon)} alt="" />{:else}<i></i>{/if}</span>
      {#if !compact}<span class="txt">{id ? shardText(id, list) : editable ? `+ ${t("shard.add")}` : t("shard.empty")}</span>{/if}
    </svelte:element>
  {/each}
</div>

{#if picking != null}
  {@const i = picking}
  <ShardPicker {db} n={i + 1} current={list[i]} all={list} onpick={(id) => set(i, id)} onclose={() => (picking = null)} />
{/if}

<style>
  .shards {
    display: grid;
    grid-template-columns: repeat(5, minmax(0, 1fr));
    gap: 6px;
    width: 100%;
  }
  .shards.compact {
    display: flex;
    gap: 4px;
    width: auto;
  }
  .sock {
    display: flex;
    align-items: center;
    gap: 8px;
    min-width: 0;
    padding: 6px 8px;
    border-radius: 10px;
    border: 1px solid color-mix(in srgb, var(--hue) 45%, transparent);
    background: color-mix(in srgb, var(--hue) 9%, transparent);
    text-align: left;
  }
  .compact .sock {
    padding: 0;
    border: 0;
    background: none;
  }
  .sock.empty {
    border-style: dashed;
    border-color: var(--line);
    background: none;
  }
  button.sock:hover {
    border-color: var(--hue);
  }
  button.sock.empty:hover {
    border-color: var(--accent);
  }
  .gem {
    flex: none;
    width: 30px;
    height: 30px;
    display: grid;
    place-items: center;
  }
  .compact .gem {
    width: 20px;
    height: 20px;
  }
  .gem img {
    width: 100%;
    height: 100%;
    object-fit: contain;
    filter: drop-shadow(0 0 4px color-mix(in srgb, var(--hue) 60%, transparent));
  }
  .gem i {
    width: 60%;
    height: 60%;
    transform: rotate(45deg);
    border: 1px dashed var(--text-faint);
    border-radius: 3px;
    opacity: 0.6;
  }
  .txt {
    font-size: 11.5px;
    line-height: 1.3;
    color: var(--text);
    display: -webkit-box;
    -webkit-line-clamp: 3;
    line-clamp: 3;
    -webkit-box-orient: vertical;
    overflow: hidden;
  }
  .empty .txt {
    color: var(--text-faint);
  }
</style>
