<script lang="ts">
  // Where a mod or arcane comes from (DE's drop tables, vendors, syndicates: drops.json `mods`), plus
  // Baro Ki'Teer's stock while he is here. Used by the mod goal, the mod page and the hub card.
  import { t, num } from "$lib/i18n/index.svelte";
  import { loadDrops, wikiUrl, type DropsDb } from "$lib/drops";
  import { world } from "$lib/hub/worldData.svelte";
  import { modSourcesOf, type HowIcon } from "./plan";

  let { id, en, drops: given = null, limit = 0 }: { id: string; en: string; drops?: DropsDb | null; limit?: number } = $props();

  let loaded = $state<DropsDb | null>(null);
  $effect(() => {
    if (!given) loadDrops().then((d) => (loaded = d)).catch(() => {});
  });
  const drops = $derived(given ?? loaded);
  const how = $derived(drops ? modSourcesOf(drops, id) : []);
  const shown = $derived(limit ? how.slice(0, limit) : how);

  // Baro sells it right now (worldState: store paths with "/StoreItems").
  const baro = $derived.by(() => {
    const b = world.timers?.baro;
    if (!b?.items || Date.now() > b.to) return null;
    const o = b.items.find((x) => x.type.replace("/StoreItems/", "/") === id);
    return o ? { relay: b.relay, ducats: o.ducats, credits: o.credits } : null;
  });

  const GLYPH: Record<HowIcon, string> = {
    mission: "◎", bounty: "◇", enemy: "⚔", other: "·", market: "⇄", vendor: "⇄", syndicate: "✦", lab: "⌂", quest: "❖",
  };
</script>

{#if drops}
  <div class="lines">
    {#if baro}
      <div class="line baro">
        <span class="g">◈</span>
        <span>
          <b>{t("goal.mod.baroNow", { relay: baro.relay })}</b>
          <small>{t("goal.mod.baroCost", { d: num(baro.ducats), c: num(baro.credits) })}</small>
        </span>
      </div>
    {/if}
    {#each shown as h, i (i)}
      <div class="line">
        <span class="g">{GLYPH[h.icon]}</span>
        <span><b>{h.text}</b>{#if h.sub}<small>{h.sub}</small>{/if}</span>
      </div>
    {/each}
    {#if limit && how.length > limit}<span class="more">{t("goal.mod.more", { n: how.length - limit })}</span>{/if}
    {#if !how.length && !baro}
      <p class="none">{t("goal.mod.noSource")} <a href={wikiUrl(en)} target="_blank" rel="noreferrer">{t("goal.wiki")} ↗</a></p>
    {/if}
  </div>
{/if}

<style>
  .lines {
    display: flex;
    flex-direction: column;
    gap: 8px;
  }
  .line {
    display: flex;
    gap: 10px;
    align-items: flex-start;
  }
  .g {
    flex: none;
    width: 24px;
    height: 24px;
    display: grid;
    place-items: center;
    border-radius: 50%;
    background: var(--surface-2);
    color: var(--accent);
    font-size: 12px;
  }
  .baro .g {
    color: #7fd6ff;
  }
  b {
    display: block;
    font-weight: 500;
    font-size: 14px;
    color: var(--text);
  }
  small {
    display: block;
    margin-top: 1px;
    font-size: 12px;
    color: var(--text-faint);
  }
  .more {
    font-size: 12px;
    color: var(--text-faint);
    padding-left: 34px;
  }
  .none {
    margin: 0;
    font-size: 13px;
    line-height: 1.5;
    color: var(--text-dim);
  }
  .none a {
    color: var(--accent);
  }
</style>
