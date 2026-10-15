<script lang="ts">
  // An item's picture by its DE id: mods and arcanes in their game frames, rivens in the riven frame,
  // anything else its icon. `w` is the box width in px (cards are wider than tall; icons are square to `size`).
  import { iconUrl } from "$lib/db";
  import { cardOf } from "$lib/itemRef.svelte";
  import type { Mod } from "$lib/frames";
  import ModCard from "./ModCard.svelte";
  import ArcaneCard from "./ArcaneCard.svelte";

  let { id, icon, name = "", w = 48, size = 26 }: { id?: string; icon?: string | null; name?: string; w?: number; size?: number } = $props();
  const c = $derived(cardOf(id));
  // A veiled riven as the game shows it: its art and the reward's name in the riven frame.
  const riven = $derived(c.riven ? ({ name, icon: icon ?? null, rarity: "Legendary", fr: "Riven", max: 0 } as unknown as Mod) : null);
</script>

<span class="thumb" style:width="{w}px">
  {#if c.mod || riven}
    <ModCard mod={c.mod ?? riven} scale={w / 292} bare />
  {:else if c.arcane}
    <ArcaneCard arcane={c.arcane} scale={w / 512} bare />
  {:else if icon}
    <img src={iconUrl(icon)} alt="" loading="lazy" style:width="{size}px" style:height="{size}px" />
  {:else}
    <i style:width="{size}px" style:height="{size}px"></i>
  {/if}
</span>

<style>
  .thumb {
    flex: none;
    display: inline-flex;
    align-items: center;
    justify-content: center;
  }
  img {
    object-fit: contain;
  }
</style>
