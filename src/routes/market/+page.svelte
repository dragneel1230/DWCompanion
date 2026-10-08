<script lang="ts">
  // Market page for a mod or arcane (prime parts, sets and relics have it on their own pages).
  import Facts from "$lib/components/Facts.svelte";
  import { t } from "$lib/i18n/index.svelte";
  import { page } from "$app/state";
  import { loadFrames, loadOtherMods, RARITY_RU, type FramesDb, type Mod } from "$lib/frames";
  import ModCard from "$lib/components/ModCard.svelte";
  import ArcaneCard from "$lib/components/ArcaneCard.svelte";
  import MarketPanel from "$lib/components/MarketPanel.svelte";
  import ModWhere from "$lib/goals/ModWhere.svelte";
  import GoalButton from "$lib/goals/GoalButton.svelte";

  let db = $state<FramesDb | null>(null);
  loadFrames().then((d) => (db = d));
  // Weapon / companion / archwing mods and stances.
  let other = $state<Record<string, Mod> | null>(null);
  loadOtherMods().then((m) => (other = m)).catch(() => {});

  const id = $derived(page.url.searchParams.get("id") ?? "");
  const mod = $derived(db?.mods[id] ?? other?.[id]);
  const arcane = $derived(db?.arcanes[id]);
  const item = $derived(mod ?? arcane);
</script>

{#if item}
  <div class="page">
    <header class="hero">
      <div class="card">
        {#if mod}<ModCard {mod} scale={0.5} bare />{:else if arcane}<ArcaneCard {arcane} scale={0.3} bare />{/if}
      </div>
      <div>
        <h1>{item.name}</h1>
        <div class="sub">
          <span>{item.en}</span>
          <span class="tag">{mod ? t("tag.mod") : t("tag.arcane")} · {RARITY_RU[item.rarity]}</span>
          <Facts kind={mod ? "mod" : "arcane"} {id} price={false} />
        </div>
        <p class="stats">{item.stats}</p>
      </div>
    </header>

    <section class="where">
      <div class="where-head">
        <h2>{t("goal.mod.where")}</h2>
        {#if mod}<GoalButton {id} />{/if}
      </div>
      <ModWhere {id} en={item.en} />
    </section>

    {#if item.slug}
      <MarketPanel slug={item.slug} item={{ en: item.mname ?? item.en, ru: item.ru }} maxRank={item.max} />
    {:else}
      <p class="muted">{t("marketpage.notSold")}</p>
    {/if}
  </div>
{:else if db}
  <div class="page"><p>{t("item.notFound")}</p></div>
{/if}

<style>
  .card {
    flex: none;
  }
  .where {
    margin: 4px 0 20px;
    padding: 14px 18px 16px;
    border-radius: 14px;
    background: var(--surface);
    border: 1px solid var(--glass-line);
  }
  .where-head {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 12px;
    margin-bottom: 12px;
  }
  .where h2 {
    margin: 0;
    font-size: 12px;
    font-weight: 600;
    letter-spacing: 0.12em;
    text-transform: uppercase;
    color: var(--accent);
  }
  .stats {
    margin: 8px 0 0;
    font-size: 13px;
    color: var(--text-dim);
    white-space: pre-line;
  }
</style>
