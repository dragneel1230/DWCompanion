<script lang="ts">
  // «Неделя» on «Сейчас»: a short check of the week (done / left per activity, the Archon shard), everything
  // else — missions, modifiers, rewards — on the «Неделя» tab (views/WeekView.svelte), which every row opens.
  import { t } from "$lib/i18n/index.svelte";
  import { left } from "$lib/cycles";
  import { inventory } from "$lib/inventory.svelte";
  import { SHARD_HUE } from "$lib/shards";
  import { world } from "./worldData.svelte";
  import {
    loadWeekly, netraLeft, descentFloor, archonDone, calendarDay, nightwaveDone, periodicDone, weekEnd, NETRA_MAX, type WeeklyDb,
  } from "$lib/weekly";

  let { now }: { now: number } = $props();

  let wdb = $state<WeeklyDb | null>(null);
  loadWeekly().then((d) => (wdb = d)).catch(() => {});

  const w = $derived(world.week);
  const inv = $derived(inventory.data);
  const known = $derived(!!inv?.week);

  const shard = $derived(w?.archon && wdb ? wdb.archons[w.archon.boss] : null);
  const calRows = $derived((w?.calendar?.days ?? []).map((d, i) => ({ ...d, i })).filter((d) => d.ids.length));
  const rows = $derived.by(() => {
    if (!w) return [];
    const netra = known ? netraLeft(inv, now) : null;
    const floors = w.descent?.floors ?? 0;
    const dn = known ? descentFloor(inv, "DM_COH_NORMAL", now) : null;
    const dh = known ? descentFloor(inv, "DM_COH_HARD", now) : null;
    const cal = calendarDay(inv, w);
    const calDone = cal == null ? null : calRows.filter((d) => d.i <= cal).length;
    const nwDone = known ? w.nightwave.filter((c) => nightwaveDone(inv, c, wdb)).length : null;
    const out: { k: string; v: string; done: boolean | null; hue?: string }[] = [];
    if (w.archon) out.push({ k: wdb?.cq.title.archon ?? t("week.archon"), v: shard?.[3] ?? "", done: archonDone(inv, w), hue: shard ? SHARD_HUE[shard[2]] : undefined });
    out.push({ k: t("week.netra"), v: netra == null ? `${NETRA_MAX}` : `${NETRA_MAX - netra}/${NETRA_MAX}`, done: netra == null ? null : netra === 0 });
    if (w.descent) out.push({ k: wdb?.cq.title.descent ?? t("week.descent"), v: dn == null ? t("week.floors", { n: floors }) : `${dn} · ${t("week.sp")} ${dh ?? 0} / ${floors}`, done: dn == null ? null : dn >= floors && (dh ?? 0) >= floors });
    if (w.calendar && calRows.length) out.push({ k: t("week.calendar"), v: calDone == null ? t("week.events", { n: calRows.length }) : `${calDone}/${calRows.length}`, done: calDone == null ? null : calDone >= calRows.length });
    if (w.nightwave.length) out.push({ k: t("week.nightwave"), v: nwDone == null ? t("week.events", { n: w.nightwave.length }) : `${nwDone}/${w.nightwave.length}`, done: nwDone == null ? null : nwDone >= w.nightwave.length });
    const clem = periodicDone(inv, "GetClem", now);
    const maroo = periodicDone(inv, "TreasureHunt", now);
    if (clem != null || maroo != null) out.push({ k: `${t("week.clem")} · ${t("week.maroo")}`, v: "", done: clem == null || maroo == null ? null : clem && maroo });
    return out;
  });
</script>

{#snippet mark(done: boolean | null)}
  {#if done === true}<span class="st ok" title={t("week.done")}>✓</span>{:else if done === false}<span class="st no" title={t("week.notDone")}></span>{/if}
{/snippet}

<section class="panel weekly">
  <header>
    <h2><a href="/week">{t("week.title")}</a></h2>
    <span class="reset">{t("week.reset", { left: left(weekEnd(now) - now) })}</span>
  </header>
  <div class="body">
    {#if !w}
      <div class="empty"><span>{world.error ? t("world.error", { error: world.error }) : t("common.loading")}</span></div>
    {:else}
      {#if !known}<p class="hint">{inv ? t("week.oldSnapshot") : t("week.noInv")}</p>{/if}
      {#each rows as r (r.k)}
        <a class="line" href="/week">
          <span class="k">{r.k}</span>
          <span class="v">{#if r.hue}<i class="dot" style:background={r.hue}></i>{/if}{r.v}</span>
          {@render mark(r.done)}
        </a>
      {/each}
      <a class="all" href="/week">{t("week.openTab")} →</a>
    {/if}
  </div>
</section>

<style>
  header {
    justify-content: space-between;
  }
  h2 a:hover {
    color: var(--accent);
  }
  .reset {
    font-size: 12px;
    color: var(--text-faint);
    font-variant-numeric: tabular-nums;
  }
  .hint {
    margin: 0 6px 8px;
    font-size: 12px;
    color: var(--text-faint);
    line-height: 1.4;
  }
  .line {
    display: flex;
    align-items: center;
    gap: 10px;
    padding: 8px;
    border-radius: 10px;
    font-size: 13px;
  }
  .line:hover {
    background: var(--surface-2);
  }
  .k {
    flex: none;
    color: var(--text);
    font-weight: 500;
  }
  .v {
    flex: 1;
    min-width: 0;
    display: flex;
    align-items: center;
    justify-content: flex-end;
    gap: 6px;
    font-size: 12.5px;
    color: var(--text-dim);
    font-variant-numeric: tabular-nums;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }
  .dot {
    width: 9px;
    height: 9px;
    border-radius: 50%;
    flex: none;
  }
  .st {
    flex: none;
    width: 18px;
    height: 18px;
    border-radius: 50%;
    display: flex;
    align-items: center;
    justify-content: center;
    font-size: 10px;
    font-weight: 700;
  }
  .st.ok {
    background: rgba(111, 207, 151, 0.16);
    color: var(--good);
  }
  .st.no {
    border: 1.5px solid var(--line);
  }
  .all {
    display: block;
    margin: 6px 8px 0;
    font-size: 12.5px;
    color: var(--accent);
  }
  .all:hover {
    text-decoration: underline;
  }
</style>
