<script lang="ts">
  // A prime part: it comes only from relics. Relics that hold it, active ones first, with rarity;
  // a link to the item page (market prices, full relic list). What it goes into: FarmView, above the title.
  import { t } from "$lib/i18n/index.svelte";
  import { getDb, RARITY_RU } from "$lib/db";
  import type { CraftDb } from "$lib/craft";

  let { craft, id, onopen }: { craft: CraftDb; id: string; onopen: (kind: "resource" | "craft" | "prime", id: string) => void } = $props();

  const d = getDb();
  const it = $derived(d.items[id]);
  const relics = $derived(
    it.relics.map((x) => ({ ...x, r: d.relics[x.relic] })).filter((x) => x.r).sort((a, b) => +a.r.vaulted - +b.r.vaulted),
  );
  const live = $derived(relics.filter((x) => !x.r.vaulted));
</script>

<div class="howto">
  <div class="howto-title">{t("farm.howTo")}</div>
  <div class="step">
    <span class="n">◈</span>
    <div>
      <div class="lead">{t("farm.primeLead")}</div>
      <div class="main"><b>{live.length ? t("farm.relicsLive", { n: live.length }) : t("farm.vaulted")}</b></div>
      <p class="why">{live.length ? t("farm.primeHow") : t("farm.primeVaulted")}</p>
      <div class="relics">
        {#each relics as x (x.relic)}
          <a href="/relic?id={encodeURIComponent(x.relic)}" class:vaulted={x.r.vaulted}>{x.r.s} <small>{RARITY_RU[x.rarity]}{x.r.vaulted ? ` · ${t("farm.vaultedShort")}` : ""}</small></a>
        {/each}
      </div>
    </div>
  </div>
  <div class="step">
    <span class="n">→</span>
    <div><a class="link" href="/item?id={encodeURIComponent(id)}">{t("farm.primePage")}</a></div>
  </div>
</div>

<style>
  .relics {
    display: flex;
    flex-wrap: wrap;
    gap: 6px;
    margin-top: 8px;
  }
  .relics a {
    padding: 3px 9px;
    border-radius: 7px;
    background: var(--surface-2);
    font-size: 12.5px;
  }
  .relics a:hover {
    color: var(--accent);
  }
  .relics a.vaulted {
    opacity: 0.55;
  }
  .relics small {
    color: var(--text-faint);
  }
  .link {
    color: var(--accent);
    font-size: 14px;
  }
</style>
