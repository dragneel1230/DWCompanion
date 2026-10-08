<script lang="ts">
  import Facts from "$lib/components/Facts.svelte";
  import { t } from "$lib/i18n/index.svelte";
  import { page } from "$app/state";
  import { getDb, iconUrl, itemName, setParts } from "$lib/db";
  import Plat from "$lib/components/Plat.svelte";
  import Cur from "$lib/components/Cur.svelte";
  import MarketPanel from "$lib/components/MarketPanel.svelte";
  import GoalButton from "$lib/goals/GoalButton.svelte";

  const db = getDb();
  const id = $derived(page.url.searchParams.get("id") ?? "");
  const set = $derived(db.sets[id]);

  const parts = $derived(
    (set ? setParts(set) : []).map(({ id: pid, count }) => {
      const it = db.items[pid];
      const active = it.relics.filter((r) => !db.relics[r.relic].vaulted);
      return { id: pid, count, it, active: active.length, total: it.relics.length };
    }),
  );
  const ducats = $derived(parts.reduce((s, p) => s + (p.it.ducats ?? 0) * p.count, 0));
  const vaulted = $derived(parts.length > 0 && parts.every((p) => p.active === 0));
</script>

{#if set}
  <div class="page">
    <header class="hero">
      <img src={iconUrl(set.icon)} alt="" />
      <div>
        <h1>{set.name}</h1>
        <div class="sub">
          <span>{set.en}</span>
          <span class="tag {vaulted ? 'vaulted' : 'active'}">{vaulted ? t("tag.inVault") : t("tag.dropsNow")}</span>
          <Facts kind="set" {id} price={false} />
        </div>
      </div>
      <div class="price">
        <div class="big"><Plat slug={set.slug} size={22} /></div>
        <div class="muted">{t("detail.wholeSet")}</div>
        {#if !id.includes("/Skins/")}<div class="goal"><GoalButton {id} /></div>{/if}
      </div>
    </header>

    <div class="section-title">{t("detail.parts")}</div>
    <div class="rows">
      {#each parts as p (p.id)}
        <a class="row" href="/item?id={encodeURIComponent(p.id)}">
          <img src={iconUrl(p.it.icon)} alt="" loading="lazy" />
          <span class="name">
            {p.count > 1 ? `${p.count} × ` : ""}{itemName(p.it)}
            <small>{p.active ? t("detail.inActive", { n: p.active }) : t("detail.onlyVault")} · {t("set.total", { v: p.total })}</small>
          </span>
          <span class="num">{#if p.it.ducats}<Cur kind="ducats" value={p.it.ducats} />{/if}</span>
          <span class="num"><Plat slug={p.it.slug} /></span>
        </a>
      {/each}
    </div>
    <p class="muted total">{t("set.ducats")} <Cur kind="ducats" value={ducats} /></p>

    <MarketPanel slug={set.slug} item={{ en: set.mname ?? `${set.en} Set`, ru: `${set.ru}: набор` }} />
  </div>
{:else}
  <div class="page"><p>{t("set.notFound")}</p></div>
{/if}

<style>
  .price {
    margin-left: auto;
    text-align: right;
  }
  .goal {
    margin-top: 10px;
  }
  .big {
    font-size: 22px;
    font-weight: 600;
  }
  .total {
    margin-top: 12px;
    font-size: 13px;
  }
</style>
