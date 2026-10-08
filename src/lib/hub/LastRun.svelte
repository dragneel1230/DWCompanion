<script lang="ts">
  // «Миссия» between missions: what the last one brought, from the inventory snapshots (Изменения) —
  // relic picks settled by what arrived, the most valuable arrivals, platinum and ducats. Without the
  // inventory: what connecting it gives.
  import { locale, t } from "$lib/i18n/index.svelte";
  import { dayPrice } from "$lib/marketDay";
  import { inventory } from "$lib/inventory.svelte";
  import { invView } from "$lib/inv/invView.svelte";
  import { describe } from "$lib/inv/ctx";
  import Cur from "$lib/components/Cur.svelte";
  import ModCard from "$lib/components/ModCard.svelte";
  import ArcaneCard from "$lib/components/ArcaneCard.svelte";

  invView.start();
  const last = $derived(inventory.log[0] ?? null);
  const rows = $derived.by(() => {
    const c = last;
    const ctx = invView.ctx;
    if (!c || !ctx) return [];
    void invView.priced;
    return [...Object.entries(c.items), ...Object.entries(c.mods)]
      .filter(([, d]) => d > 0)
      .map(([id, n]) => {
        const it = describe(ctx, id);
        return { id, n, ...it, value: (dayPrice(it.slug)?.price ?? 0) * n };
      })
      .sort((a, b) => b.value - a.value || b.n - a.n);
  });
  const gain = $derived(rows.reduce((s, r) => s + r.value, 0));
  const ago = (ms: number) => {
    const m = Math.max(0, Math.round((Date.now() - ms) / 60_000));
    return m < 60 ? t("coll.minAgo", { v: m }) : m < 48 * 60 ? t("coll.hAgo", { v: Math.round(m / 60) }) : new Date(ms).toLocaleDateString(locale());
  };
  const name = (id: string) => (invView.ctx ? describe(invView.ctx, id).name : id);
</script>

<div class="last">
  {#if !inventory.data}
    <div class="intro">
      <b>{t("last.noInv")}</b>
      <span>{t("last.noInvHint")}</span>
      <a href="/trade">{t("inv.connect")} →</a>
    </div>
  {:else if !last}
    <div class="intro">
      <b>{t("last.none")}</b>
      <span>{inventory.auto ? t("last.noneAuto") : t("last.noneManual")}</span>
    </div>
  {:else}
    <div class="head">
      <small>{t("last.title")}</small>
      <span>{ago(last.at)}{#if last.auto} · {t("last.auto")}{/if}</span>
    </div>
    <div class="sums">
      {#if gain}<span><Cur kind="plat" value={Math.round(gain)} /> <i>{t("last.worth")}</i></span>{/if}
      {#if last.plat}<span><Cur kind="plat" value={last.plat} /> <i>{t("last.wallet")}</i></span>{/if}
      {#if last.ducats}<span><Cur kind="ducats" value={last.ducats} /></span>{/if}
    </div>
    {#if last.picks.length}
      <div class="section-title">{t("last.picks", { n: last.picks.length })}</div>
      <div class="picks">
        {#each last.picks as p (p.entry)}
          <a class="pick" href="/item?id={encodeURIComponent(p.item)}"><i>✓</i>{name(p.item)}</a>
        {/each}
      </div>
    {/if}
    {#if rows.length}
      <div class="section-title">{t("last.came")}</div>
      <div class="rows">
        {#each rows.slice(0, 6) as r (r.id)}
          <div class="row got">
            {#if r.mod}<span class="card"><ModCard mod={r.mod} scale={0.19} bare /></span>{:else if r.arcane}<span class="card"><ArcaneCard arcane={r.arcane} scale={0.095} bare /></span>{:else if r.icon}<img src={r.icon} alt="" loading="lazy" />{:else}<span class="noimg"></span>{/if}
            <span class="name">{r.name}{#if r.n > 1}<em> ×{r.n}</em>{/if}</span>
            {#if r.value}<span class="v"><Cur kind="plat" value={Math.round(r.value)} /></span>{/if}
          </div>
        {/each}
      </div>
    {/if}
    <a class="all" href="/trade?tab=log">{t("last.all")} →</a>
  {/if}
</div>

<style>
  .last {
    display: flex;
    flex-direction: column;
    gap: 6px;
    margin-top: 14px;
    padding-top: 14px;
    border-top: 1px solid var(--glass-line);
  }
  .intro {
    display: flex;
    flex-direction: column;
    gap: 4px;
    font-size: 13px;
    color: var(--text-dim);
    line-height: 1.45;
  }
  .intro b {
    color: var(--text);
    font-weight: 500;
  }
  .intro a,
  .all {
    color: var(--accent);
    font-size: 12.5px;
  }
  .all {
    margin-top: 6px;
    align-self: flex-start;
  }
  .head {
    display: flex;
    align-items: baseline;
    justify-content: space-between;
  }
  .head small {
    font-size: 11px;
    letter-spacing: 0.1em;
    text-transform: uppercase;
    color: var(--text-faint);
  }
  .head span {
    font-size: 12px;
    color: var(--text-faint);
  }
  .sums {
    display: flex;
    flex-wrap: wrap;
    gap: 6px 16px;
    font-size: 16px;
  }
  .sums i {
    font-style: normal;
    font-size: 11.5px;
    color: var(--text-faint);
  }
  .section-title {
    margin: 10px 0 2px;
  }
  .picks {
    display: flex;
    flex-wrap: wrap;
    gap: 6px;
  }
  .pick {
    display: inline-flex;
    gap: 6px;
    padding: 3px 10px;
    border-radius: 999px;
    border: 1px solid rgba(111, 207, 151, 0.35);
    font-size: 12.5px;
    color: var(--text);
  }
  .pick i {
    font-style: normal;
    color: var(--good);
  }
  .got {
    padding: 4px 8px;
  }
  .got img,
  .noimg {
    width: 28px;
    height: 28px;
    object-fit: contain;
    flex: none;
  }
  .got .card {
    flex: none;
    display: inline-flex;
  }
  .got .name {
    flex: 1;
    min-width: 0;
    font-size: 13px;
  }
  .got em {
    font-style: normal;
    color: var(--text-faint);
  }
  .v {
    font-size: 12.5px;
  }
</style>
