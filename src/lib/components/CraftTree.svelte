<script lang="ts">
  // What an item takes to build: credits and foundry time, every resource of the whole tree with the
  // best place to get it, then the parts one by one. Shared by the hub and the Resources tab.
  import { locale, t } from "$lib/i18n/index.svelte";
  import { getDb, iconUrl } from "$lib/db";
  import { totals, whereShort, buildTime, CRAFT_KIND_RU, type CraftDb } from "$lib/craft";
  import { pct, type DropsDb } from "$lib/drops";

  let { craft, drops, id, onresource, onpart, onitem }: {
    craft: CraftDb;
    drops: DropsDb;
    id: string;
    onresource?: (id: string) => void;
    onpart?: (id: string) => void;
    onitem?: (id: string) => void; // a prime part (relic reward)
  } = $props();

  // Prime parts come from relics: weapon parts are relic rewards themselves, a frame's component is
  // built from the blueprint that drops ("…HelmetComponent" <- "…HelmetBlueprint").
  const primes = getDb().items;
  const relicPart = (pid: string) => (primes[pid] ? pid : primes[pid.replace(/Component$/, "Blueprint")] ? pid.replace(/Component$/, "Blueprint") : null);

  const item = $derived(craft.items[id]);
  const tot = $derived(totals(craft, drops, id));
  const nameOf = (rid: string) => drops.resources[rid] ?? craft.items[rid] ?? craft.names[rid];
  const fmt = (n: number) => n.toLocaleString(locale());
</script>

{#if item}
  <div class="facts">
    <span><b>{fmt(tot.credits)}</b> {t("ct.credits")}</span>
    <span><b>{buildTime(tot.time)}</b> {t("ct.inFoundry")}{tot.parts.length ? ` ${t("ct.partsBuild")}` : ""}</span>
    {#if item.num > 1}<span>{t("ct.perBuild")} <b>{t("ct.pcs", { v: item.num })}</b></span>{/if}
  </div>

  <div class="section-title">{t("ct.total")}</div>
  <div class="rows">
    {#each tot.resources as [rid, n] (rid)}
      {@const r = drops.resources[rid]}
      <button class="row res" onclick={() => onresource?.(rid)} disabled={!onresource}>
        <img src={iconUrl(r.icon)} alt="" loading="lazy" />
        <span class="name">{r.name}<small>{whereShort(drops, rid) || t("ct.unknownSource")}</small></span>
        <span class="count">{fmt(n)}</span>
      </button>
    {/each}
    {#each tot.other as [oid, n] (oid)}
      {@const o = nameOf(oid)}
      {@const prime = relicPart(oid)}
      <button class="row res" onclick={() => prime && onitem?.(prime)} disabled={!prime || !onitem}>
        {#if o?.icon}<img src={iconUrl(o.icon)} alt="" loading="lazy" />{/if}
        <span class="name">{o?.name ?? oid.split("/").pop()}<small>{prime ? t("ct.fromRelics") : t("ct.notInTables")}</small></span>
        <span class="count">{fmt(n)}</span>
      </button>
    {/each}
  </div>

  {#if tot.parts.length}
    <div class="section-title parts-title">{t("ct.parts")}</div>
    <div class="parts">
      {#each tot.parts as p, pi (pi)}
        {@const c = craft.items[p.id]}
        <div class="part">
          <button class="part-head" onclick={() => onpart?.(p.id)} disabled={!onpart}>
            {#if c.icon}<img src={iconUrl(c.icon)} alt="" loading="lazy" />{/if}
            <span>{c.name.split(": ").pop()}{#if p.count > 1}<i> ×{p.count}</i>{/if}</span>
            <small>{relicPart(p.id) ? t("ct.bpFromRelics") : CRAFT_KIND_RU[c.kind]} · {t("ct.cr", { v: fmt(c.credits) })} · {buildTime(c.time)}</small>
          </button>
          {#if c.drops?.length && !relicPart(p.id)}
            <div class="bp">
              <span>{t("ct.bpDrops")}</span>
              {#each c.drops.slice(0, 3) as [si, rots] (si)}
                {@const s = drops.sources[si]}
                <em title={s.sub}>{s.name} <b>{pct(Math.max(...rots.map((x) => x[1])))}</b></em>
              {/each}
              {#if c.drops.length > 3}<i>+{c.drops.length - 3}</i>{/if}
            </div>
          {/if}
          <div class="chips">
            {#each c.parts as [ing, n], ii (ii)}
              {@const x = nameOf(ing)}
              <button class="chip" onclick={() => drops.resources[ing] && onresource?.(ing)} title={x?.name}>
                {#if x?.icon}<img src={iconUrl(x.icon)} alt="" loading="lazy" />{/if}
                <span>{x?.name ?? ing.split("/").pop()}</span>
                <b>{fmt(n * p.count)}</b>
              </button>
            {/each}
          </div>
        </div>
      {/each}
    </div>
  {/if}
{/if}

<style>
  .bp {
    display: flex;
    flex-wrap: wrap;
    align-items: baseline;
    gap: 4px 12px;
    margin: 2px 0 8px;
    font-size: 12px;
    color: var(--text-faint);
  }
  .bp em {
    font-style: normal;
    color: var(--text-dim);
  }
  .bp b {
    font-weight: 500;
    color: var(--accent);
  }
  .facts {
    display: flex;
    flex-wrap: wrap;
    gap: 8px 18px;
    margin: 0 0 16px;
    font-size: 13px;
    color: var(--text-dim);
  }
  .facts b {
    color: var(--text);
    font-weight: 600;
    font-variant-numeric: tabular-nums;
  }
  .section-title {
    margin-bottom: 8px;
  }
  .parts-title {
    margin-top: 18px;
  }
  button.row {
    width: 100%;
    text-align: left;
    color: inherit;
  }
  button.row:disabled {
    cursor: default;
  }
  .res > img {
    width: 30px;
    height: 30px;
  }
  .count {
    flex: none;
    font-size: 15px;
    font-weight: 600;
    font-variant-numeric: tabular-nums;
  }
  .parts {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(260px, 1fr));
    gap: 8px;
  }
  .part {
    padding: 10px 12px;
    border-radius: 10px;
    background: var(--surface);
  }
  .part-head {
    display: grid;
    grid-template-columns: auto 1fr;
    column-gap: 10px;
    width: 100%;
    padding: 0;
    text-align: left;
    color: inherit;
    background: none;
  }
  .part-head img {
    grid-row: span 2;
    width: 34px;
    height: 34px;
    object-fit: contain;
  }
  .part-head span {
    font-size: 14px;
  }
  .part-head i {
    font-style: normal;
    color: var(--text-dim);
  }
  .part-head small {
    font-size: 11.5px;
    color: var(--text-faint);
  }
  .chips {
    display: flex;
    flex-wrap: wrap;
    gap: 4px;
    margin-top: 8px;
  }
  .chip {
    display: inline-flex;
    align-items: center;
    gap: 5px;
    max-width: 100%;
    padding: 2px 8px 2px 4px;
    border-radius: 999px;
    background: var(--surface-2);
    font-size: 12px;
    color: var(--text-dim);
  }
  .chip img {
    width: 18px;
    height: 18px;
    object-fit: contain;
  }
  .chip span {
    overflow: hidden;
    white-space: nowrap;
    text-overflow: ellipsis;
  }
  .chip b {
    color: var(--text);
    font-weight: 600;
    font-variant-numeric: tabular-nums;
  }
</style>
