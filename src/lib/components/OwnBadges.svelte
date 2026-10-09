<script lang="ts">
  // Fixed-size marks for "mine": in the arsenal (gold) and mastered (green ✓); a tooltip says which.
  // Pass the id to look it up (ownership.svelte.ts), or the values when the caller already knows them.
  import { t } from "$lib/i18n/index.svelte";
  import { isMastered, isOwned } from "$lib/ownership.svelte";

  let {
    id = "",
    owned,
    mastered,
    size = 20,
  }: { id?: string; owned?: boolean | null; mastered?: boolean | null; size?: number } = $props();

  const own = $derived(owned !== undefined ? owned : id ? isOwned(id) : null);
  const done = $derived(mastered !== undefined ? mastered : id ? isMastered(id) : null);
</script>

{#if own || done}
  <span class="badges" style:--s="{size}px">
    {#if own}
      <span class="b own" title={t("own.owned")}>
        <svg viewBox="0 0 16 16"><path d="M8 2.5 13 5.25v5.5L8 13.5 3 10.75v-5.5z" /></svg>
      </span>
    {/if}
    {#if done}
      <span class="b done" title={t("own.mastered")}>
        <svg viewBox="0 0 16 16"><path d="M4 8.4 6.8 11 12 5.5" /></svg>
      </span>
    {/if}
  </span>
{/if}

<style>
  .badges {
    display: inline-flex;
    gap: 4px;
    flex: none;
  }
  .b {
    width: var(--s);
    height: var(--s);
    display: flex;
    align-items: center;
    justify-content: center;
    border-radius: 50%;
  }
  .b svg {
    width: 62%;
    height: 62%;
    fill: none;
    stroke: currentColor;
    stroke-width: 2;
    stroke-linecap: round;
    stroke-linejoin: round;
  }
  .own {
    background: color-mix(in srgb, var(--accent) 18%, transparent);
    color: var(--accent);
  }
  .own svg {
    fill: currentColor;
    stroke-width: 1.2;
  }
  .done {
    background: rgba(111, 207, 151, 0.16);
    color: var(--good);
  }
</style>
