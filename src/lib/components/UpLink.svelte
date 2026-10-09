<script lang="ts">
  // "Back up" from a part to the thing it goes into (a prime set, a craft item): one look everywhere.
  import { t } from "$lib/i18n/index.svelte";
  import { iconUrl } from "$lib/db";

  let { name, icon = null, href, onclick }: { name: string; icon?: string | null; href?: string; onclick?: () => void } = $props();
</script>

{#snippet body()}
  <svg viewBox="0 0 24 24"><path d="M15 5l-7 7 7 7" /></svg>
  {#if icon}<img src={iconUrl(icon)} alt="" />{/if}
  <span>{name}</span>
{/snippet}

{#if href}
  <a class="up" {href} title={t("farm.partOf")}>{@render body()}</a>
{:else}
  <button class="up" {onclick} title={t("farm.partOf")}>{@render body()}</button>
{/if}

<style>
  .up {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    padding: 4px 12px 4px 6px;
    border-radius: 999px;
    border: 1px solid color-mix(in srgb, var(--accent) 45%, transparent);
    background: var(--accent-soft);
    color: var(--accent);
    font-size: 13px;
    font-weight: 600;
    text-decoration: none;
  }
  .up:hover {
    border-color: var(--accent);
  }
  img {
    width: 22px;
    height: 22px;
    object-fit: contain;
  }
  svg {
    width: 16px;
    height: 16px;
    fill: none;
    stroke: currentColor;
    stroke-width: 2;
  }
</style>
