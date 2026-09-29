<script lang="ts">
  // Fixed-position popup next to an anchor element: right of it if there is room, else left.
  import type { Snippet } from "svelte";

  let { anchor, children }: { anchor: HTMLElement | null; children: Snippet } = $props();

  let box = $state<HTMLDivElement>();
  let pos = $state({ x: -9999, y: 0 });

  $effect(() => {
    if (!anchor || !box) return;
    const a = anchor.getBoundingClientRect();
    const w = box.offsetWidth;
    const h = box.offsetHeight;
    const gap = 10;
    const x = a.right + gap + w < window.innerWidth ? a.right + gap : Math.max(4, a.left - gap - w);
    const y = Math.min(Math.max(4, a.top + a.height / 2 - h / 2), window.innerHeight - h - 4);
    pos = { x, y };
  });
</script>

{#if anchor}
  <div class="float" bind:this={box} style:left="{pos.x}px" style:top="{pos.y}px">
    {@render children()}
  </div>
{/if}

<style>
  .float {
    position: fixed;
    z-index: 50;
    pointer-events: none;
    filter: drop-shadow(0 8px 24px rgba(0, 0, 0, 0.6));
  }
</style>
