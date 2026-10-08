<script lang="ts">
  // A warframe.market item's picture: mods and arcanes in their game frames (by slug), anything else
  // the site's thumbnail. `size` is the box height in px; cards keep their own aspect.
  import { cardBySlug } from "$lib/modBySlug.svelte";
  import ModCard from "./ModCard.svelte";
  import ArcaneCard from "./ArcaneCard.svelte";

  let { slug, thumb, rank = undefined, size = 36 }: { slug?: string; thumb?: string; rank?: number; size?: number } = $props();
  const c = $derived(cardBySlug(slug));
</script>

{#if c.mod}
  <span class="card"><ModCard mod={c.mod} {rank} scale={(size * 1.15) / 150} bare /></span>
{:else if c.arcane}
  <span class="card"><ArcaneCard arcane={c.arcane} scale={(size * 1.15) / 300} bare /></span>
{:else if thumb}
  <img src={thumb} alt="" style:width="{size}px" style:height="{size}px" />
{:else}
  <span class="ph" style:width="{size}px" style:height="{size}px"></span>
{/if}

<style>
  .card {
    flex: none;
    display: inline-flex;
    align-items: center;
    justify-content: center;
  }
  img {
    flex: none;
    object-fit: contain;
  }
  .ph {
    flex: none;
  }
</style>
