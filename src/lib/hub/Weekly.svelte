<script lang="ts">
  // «Неделя» on «Сейчас»: Netracells, Descendia, the Archon hunt, the 1999 calendar, the Circuit (warframes and
  // Incarnons) and Nightwave — this week's offer from worldState, done / not done from the inventory snapshot.
  import { locale, num, t } from "$lib/i18n/index.svelte";
  import { iconUrl } from "$lib/db";
  import { left } from "$lib/cycles";
  import { inventory } from "$lib/inventory.svelte";
  import { loadFrames, type FramesDb } from "$lib/frames";
  import { SHARD_HUE } from "$lib/shards";
  import OwnBadges from "$lib/components/OwnBadges.svelte";
  import { world } from "./worldData.svelte";
  import {
    loadWeekly, netraLeft, descentFloor, archonDone, calendarDay, nightwaveDone, circuitFrame, circuitIncarnon, rewardName,
    NETRA_MAX, type WeeklyDb,
  } from "$lib/weekly";

  let { now }: { now: number } = $props();

  let wdb = $state<WeeklyDb | null>(null);
  let fdb = $state<FramesDb | null>(null);
  loadWeekly().then((d) => (wdb = d)).catch(() => {});
  loadFrames().then((d) => (fdb = d));

  const w = $derived(world.week);
  const inv = $derived(inventory.data);
  // A snapshot from before the weekly fields were read knows nothing about them.
  const known = $derived(!!inv?.week);

  let openCal = $state(false);
  let openNw = $state(false);

  const netra = $derived(known ? netraLeft(inv, now) : null);
  const dNormal = $derived(known ? descentFloor(inv, "DM_COH_NORMAL", now) : null);
  const dHard = $derived(known ? descentFloor(inv, "DM_COH_HARD", now) : null);
  const archon = $derived(w ? archonDone(inv, w) : null);
  const shard = $derived(w?.archon && wdb ? wdb.archons[w.archon.boss] : null);

  const calDay = $derived(w ? calendarDay(inv, w) : null);
  // Days without events advance by themselves: only days with something to do are listed.
  const calRows = $derived(
    (w?.calendar?.days ?? []).map((d, i) => ({ ...d, i })).filter((d) => d.ids.length),
  );
  const calDone = $derived(calDay == null ? null : calRows.filter((d) => d.i <= calDay).length);

  const nw = $derived(w?.nightwave ?? []);
  const nwDone = $derived(known ? nw.filter((c) => nightwaveDone(inv, c.id)).length : null);
  const nwLeft = $derived(known ? nw.filter((c) => !nightwaveDone(inv, c.id)).reduce((s, c) => s + (wdb?.nw[c.key]?.[2] ?? 0), 0) : 0);

  const frames = $derived((w?.circuit?.normal ?? []).map((c) => ({ c, f: circuitFrame(fdb, inv, c) })));
  const incs = $derived((w?.circuit?.hard ?? []).map((c) => ({ c, x: circuitIncarnon(wdb, inv, c) })));

  const calText = (type: string, ids: string[]) => {
    if (type === "CET_CHALLENGE") return wdb?.cal[ids[0]] ?? ids[0].split("/").pop();
    if (type === "CET_REWARD") return ids.map((id) => rewardName(wdb, id)).join(` ${t("week.or")} `);
    if (type === "CET_UPGRADE") return t("week.cal.upgrade", { n: ids.length });
    return "";
  };
  const upgradePicked = (ids: string[]) => !!inv?.week?.cal?.up.some((u) => ids.includes(u));
</script>

{#snippet mark(done: boolean | null)}
  {#if done === true}<span class="st ok" title={t("week.done")}>✓</span>{:else if done === false}<span class="st no" title={t("week.notDone")}></span>{/if}
{/snippet}

<section class="panel weekly">
  <header>
    <h2>{t("week.title")}</h2>
    {#if w?.archon}<span class="reset">{t("week.reset", { left: left(w.archon.until - now) })}</span>{/if}
  </header>
  <div class="body">
    {#if !w}
      <div class="empty"><span>{world.error ? t("world.error", { error: world.error }) : t("common.loading")}</span></div>
    {:else}
      {#if !known}
        <p class="hint">{inv ? t("week.oldSnapshot") : t("week.noInv")}</p>
      {/if}

      <div class="line">
        <span class="k">{t("week.netra")}</span>
        {#if netra != null}
          <span class="pips" title={t("week.netraLeft", { n: netra, max: NETRA_MAX })}>
            {#each Array(NETRA_MAX) as _, i}<i class:on={i < netra}></i>{/each}
          </span>
          <b class:dim={netra === 0}>{netra}/{NETRA_MAX}</b>
        {:else}
          <span class="v">{NETRA_MAX}</span>
        {/if}
      </div>

      {#if w.descent}
        <div class="line">
          <span class="k">{t("week.descent")}</span>
          <span class="v">
            {t("week.descentNormal")} <b>{dNormal ?? "—"}/{w.descent.floors}</b> · {t("week.sp")} <b>{dHard ?? "—"}/{w.descent.floors}</b>
          </span>
          {@render mark(dNormal == null ? null : dNormal >= w.descent.floors && (dHard ?? 0) >= w.descent.floors)}
        </div>
      {/if}

      {#if w.archon}
        <div class="line">
          <span class="k">{t("week.archon")}</span>
          <span class="v shard">
            {#if shard}
              <i class="dot" style:background={SHARD_HUE[shard[2]]}></i>{shard[0]}
            {/if}
          </span>
          {@render mark(archon)}
        </div>
      {/if}

      {#if w.calendar && calRows.length}
        <button class="line click" onclick={() => (openCal = !openCal)}>
          <span class="k">{t("week.calendar")}</span>
          <span class="v">{calDone != null ? t("week.progress", { a: calDone, b: calRows.length }) : t("week.events", { n: calRows.length })}</span>
          <span class="chev" class:open={openCal}>›</span>
        </button>
        {#if openCal}
          <div class="list">
            {#each calRows as d (d.i)}
              {@const done = calDay == null ? null : d.i <= calDay}
              <div class="item" class:done>
                <span class="tag">{t(d.type === "CET_CHALLENGE" ? "week.cal.challenge" : d.type === "CET_REWARD" ? "week.cal.reward" : "week.cal.upgradeTag")}</span>
                <span class="txt">{calText(d.type, d.ids)}{#if d.type === "CET_UPGRADE" && upgradePicked(d.ids)} · {t("week.cal.picked")}{/if}</span>
                {@render mark(done)}
              </div>
            {/each}
          </div>
        {/if}
      {/if}

      {#if frames.length}
        <div class="block">
          <span class="k">{t("week.circuit")}</span>
          <div class="chips">
            {#each frames as { c, f } (c)}
              <span class="chip" class:miss={f?.owned === false}>
                {#if f?.icon}<img src={iconUrl(f.icon)} alt="" />{/if}
                <span>{f?.name ?? c}</span>
                {#if f?.owned}<OwnBadges owned mastered={null} size={16} />{/if}
              </span>
            {/each}
          </div>
        </div>
      {/if}

      {#if incs.length}
        <div class="block">
          <span class="k">{t("week.circuitSp")}</span>
          <div class="chips">
            {#each incs as { c, x } (c)}
              <span
                class="chip"
                class:miss={x?.installed === false && !x?.held}
                title={x?.installed ? t("week.incInstalled") : x?.held ? t("week.incHeld") : x?.installed === false ? t("week.incNone") : ""}
              >
                {#if x?.icon}<img src={iconUrl(x.icon)} alt="" />{/if}
                <span>{x ? x.name.replace(/^[^:]+:\s*/, "") : c}</span>
                {#if x?.installed}<OwnBadges owned mastered={null} size={16} />{:else if x?.held}<small class="held">{t("week.incHeldShort")}</small>{/if}
              </span>
            {/each}
          </div>
        </div>
      {/if}

      {#if nw.length}
        <button class="line click" onclick={() => (openNw = !openNw)}>
          <span class="k">{t("week.nightwave")}</span>
          <span class="v">
            {nwDone != null ? t("week.progress", { a: nwDone, b: nw.length }) : t("week.events", { n: nw.length })}
            {#if nwLeft} · {t("week.standingLeft", { v: num(nwLeft) })}{/if}
          </span>
          <span class="chev" class:open={openNw}>›</span>
        </button>
        {#if openNw}
          <div class="list">
            {#each nw as c (c.id)}
              {@const n = wdb?.nw[c.key]}
              <div class="item" class:done={nightwaveDone(inv, c.id) === true}>
                <span class="tag">{c.daily ? t("week.daily") : t("week.weekly")}</span>
                <span class="txt">
                  <b>{n?.[0] ?? c.key}</b>
                  {#if n?.[1]}<small>{n[1]}</small>{/if}
                </span>
                {#if n?.[2]}<span class="rep">{num(n[2])}</span>{/if}
                {@render mark(nightwaveDone(inv, c.id))}
              </div>
            {/each}
          </div>
        {/if}
      {/if}

      {#if known && inv}
        <p class="asof">{t("week.asOf", { time: new Date(inv.at).toLocaleString(locale(), { hour: "2-digit", minute: "2-digit", day: "numeric", month: "short" }) })}</p>
      {/if}
    {/if}
  </div>
</section>

<style>
  header {
    justify-content: space-between;
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
    width: 100%;
    padding: 8px;
    border-radius: 10px;
    text-align: left;
    font: inherit;
    font-size: 13px;
  }
  .line.click:hover {
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
    text-align: right;
    font-size: 12.5px;
    color: var(--text-dim);
  }
  .v b {
    color: var(--text);
    font-weight: 600;
  }
  .line > b {
    font-variant-numeric: tabular-nums;
  }
  .line > b.dim {
    color: var(--text-faint);
  }
  .pips {
    flex: 1;
    display: flex;
    justify-content: flex-end;
    gap: 4px;
  }
  .pips i {
    width: 8px;
    height: 8px;
    border-radius: 50%;
    background: var(--surface-2);
  }
  .pips i.on {
    background: var(--accent);
  }
  .shard {
    display: flex;
    align-items: center;
    justify-content: flex-end;
    gap: 6px;
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
  .chev {
    flex: none;
    color: var(--text-faint);
    transition: transform 0.15s;
  }
  .chev.open {
    transform: rotate(90deg);
  }
  .list {
    display: flex;
    flex-direction: column;
    gap: 2px;
    margin: 0 0 6px 8px;
    padding-left: 8px;
    border-left: 1px solid var(--line);
  }
  .item {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 5px 6px;
    font-size: 12.5px;
  }
  .item.done .txt {
    opacity: 0.55;
  }
  .tag {
    flex: none;
    width: 64px;
    font-size: 10.5px;
    letter-spacing: 0.04em;
    text-transform: uppercase;
    color: var(--text-faint);
  }
  .txt {
    flex: 1;
    min-width: 0;
    display: flex;
    flex-direction: column;
    color: var(--text-dim);
  }
  .txt b {
    font-weight: 500;
    color: var(--text);
  }
  .txt small {
    font-size: 11.5px;
    color: var(--text-faint);
  }
  .rep {
    flex: none;
    font-size: 11.5px;
    color: var(--accent);
    font-variant-numeric: tabular-nums;
  }
  .block {
    display: flex;
    flex-direction: column;
    gap: 6px;
    padding: 8px;
    font-size: 13px;
  }
  .chips {
    display: flex;
    flex-wrap: wrap;
    gap: 6px;
  }
  .chip {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    padding: 3px 8px 3px 4px;
    border-radius: 999px;
    background: var(--surface);
    font-size: 12.5px;
    color: var(--text);
  }
  .chip img {
    width: 22px;
    height: 22px;
    object-fit: contain;
  }
  .chip.miss {
    color: var(--text-dim);
  }
  .held {
    font-size: 11px;
    color: var(--accent);
  }
  .asof {
    margin: 10px 6px 0;
    font-size: 11.5px;
    color: var(--text-faint);
  }
</style>
