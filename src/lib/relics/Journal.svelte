<script lang="ts">
  // Relic journal (section «Реликвии», app and hub): what each opened relic gave (EE.log, exact), totals for a period at current
  // market prices, a per-day chart, and the list grouped by day. When the overlay read the squad's
  // cards, the player can mark which one they took; otherwise the own relic's reward counts.
  import { locale, num, t, type Key } from "$lib/i18n/index.svelte";
  import { getDb, iconUrl, RARITY_RU, type Rarity } from "$lib/db";
  import { journal, startOfDay, DAY, type Entry } from "$lib/journal.svelte";
  import { inventory } from "$lib/inventory.svelte";
  import { needs } from "$lib/goals/watch.svelte";
  import { prices } from "$lib/prices.svelte";
  import { REFINE_RU } from "$lib/relicValue";
  import Cur from "$lib/components/Cur.svelte";

  journal.start();
  const db = getDb();

  type Period = "today" | "week" | "month" | "all";
  const PERIODS: { id: Period; label: Key }[] = [
    { id: "today", label: "jr.today" },
    { id: "week", label: "jr.week" },
    { id: "month", label: "jr.month" },
    { id: "all", label: "jr.all" },
  ];
  let period = $state<Period>("week");

  const now = Date.now();
  const from = $derived(
    period === "today" ? startOfDay(now) : period === "week" ? startOfDay(now) - 6 * DAY : period === "month" ? startOfDay(now) - 29 * DAY : 0,
  );
  const shown = $derived(journal.list.filter((e) => e.t >= from));

  $effect(() => prices.want(shown.map((e) => e.item?.slug)));
  const plat = (e: Entry) => (e.item?.slug ? prices.sell[e.item.slug] : null);
  const ducats = (e: Entry) => e.item?.ducats ?? 0;
  const rarity = (e: Entry): Rarity | null => (e.relicKey ? (db.relics[e.relicKey]?.rewards.find((r) => r.id === e.got)?.rarity ?? null) : null);

  const totals = $derived.by(() => {
    let p = 0;
    let d = 0;
    let rare = 0;
    let best: Entry | null = null;
    for (const e of shown) {
      p += plat(e) ?? 0;
      d += ducats(e);
      if (rarity(e) === "RARE") rare++;
      if (!best || (plat(e) ?? 0) > (plat(best) ?? 0)) best = e;
    }
    return { p, d, rare, best, loading: shown.some((e) => e.item?.slug && plat(e) === undefined) };
  });

  const eras = $derived.by(() => {
    const c = new Map<string, number>();
    for (const e of shown) {
      const era = e.relicKey ? db.relics[e.relicKey].era : null;
      if (era) c.set(era, (c.get(era) ?? 0) + 1);
    }
    const ORDER = ["Lith", "Meso", "Neo", "Axi", "Requiem"];
    return [...c].sort((a, b) => ORDER.indexOf(a[0]) - ORDER.indexOf(b[0]));
  });
  const ERA_RU: Record<string, string> = Object.fromEntries(
    Object.values(db.relics).map((r) => [r.era, r.s.split(" ")[0]]),
  );

  // Days of the chart: the period's days (last 14 for "all").
  const days = $derived.by(() => {
    const n = period === "today" ? 1 : period === "week" ? 7 : 14;
    const start = period === "month" ? startOfDay(now) - 13 * DAY : startOfDay(now) - (n - 1) * DAY;
    return Array.from({ length: period === "month" ? 14 : n }, (_, i) => {
      const t = start + i * DAY;
      const list = journal.list.filter((e) => e.t >= t && e.t < t + DAY);
      return { t, n: list.length, p: list.reduce((s, e) => s + (plat(e) ?? 0), 0) };
    });
  });
  const maxP = $derived(Math.max(1, ...days.map((d) => d.p)));
  let hover = $state<number | null>(null);

  // List grouped by day.
  const groups = $derived.by(() => {
    const g = new Map<number, Entry[]>();
    for (const e of shown) {
      const d = startOfDay(e.t);
      g.set(d, [...(g.get(d) ?? []), e]);
    }
    return [...g];
  });

  function dayTitle(ts: number) {
    const today = startOfDay(now);
    if (ts === today) return t("jr.today");
    if (ts === today - DAY) return t("jr.yesterday");
    return new Date(ts).toLocaleDateString(locale(), { day: "numeric", month: "long", weekday: "short" });
  }
  const time = (ts: number) => new Date(ts).toLocaleTimeString(locale(), { hour: "2-digit", minute: "2-digit" });
  const short = (ts: number) => new Date(ts).toLocaleDateString(locale(), { day: "numeric", month: "short" });
  const fmt = (n: number) => num(Math.round(n));
</script>

<div class="journal">
  <div class="head">
    <p class="muted">{t("jr.intro")}</p>
    <div class="seg">
      {#each PERIODS as p}
        <button class:on={period === p.id} onclick={() => (period = p.id)}>{t(p.label)}</button>
      {/each}
    </div>
  </div>

  {#if journal.loaded && !journal.list.length}
    <div class="empty">
      <b>{t("jr.empty")}</b>
      <span>{t("jr.emptyHint")}</span>
    </div>
  {:else}
    <div class="tiles">
      <div class="tile">
        <span>{t("jr.opened")}</span>
        <b>{shown.length}</b>
        <small>{#each eras as [era, n], i}{i ? " · " : ""}{ERA_RU[era] ?? era} {n}{/each}</small>
      </div>
      <div class="tile">
        <span>{t("market.col.plat")}</span>
        <b class="plat"><Cur kind="plat" value={fmt(totals.p)} size={20} /></b>
        <small>{totals.loading ? t("jr.pricesLoading") : t("jr.byPrices")}</small>
      </div>
      <div class="tile">
        <span>{t("market.col.ducats")}</span>
        <b class="ducat"><Cur kind="ducats" value={fmt(totals.d)} size={20} /></b>
        <small>{t("jr.allToBaro")}</small>
      </div>
      <div class="tile">
        <span>{t("jr.rare")}</span>
        <b>{totals.rare}</b>
        <small>{shown.length ? t("jr.rareShare", { v: Math.round((totals.rare / shown.length) * 100) }) : "—"}</small>
      </div>
      {#if totals.best?.item}
        <div class="tile best">
          <span>{t("jr.best")}</span>
          <div class="find">
            <img src={iconUrl(totals.best.item.icon)} alt="" />
            <div>
              <b>{totals.best.item.name}</b>
              <small>{#if plat(totals.best) != null}<Cur kind="plat" value={plat(totals.best) ?? 0} />{/if} · {short(totals.best.t)}</small>
            </div>
          </div>
        </div>
      {/if}
    </div>

    {#if period !== "today"}
      <div class="chart" role="img" aria-label={t("jr.chart")}>
        <div class="bars" style:--n={days.length}>
          {#each days as d, i (d.t)}
            <div
              class="col"
              role="presentation"
              onmouseenter={() => (hover = i)}
              onmouseleave={() => (hover = null)}
            >
              <div class="bar" class:zero={!d.p} style:height="{(d.p / maxP) * 100}%"></div>
              {#if hover === i}
                <div class="tip">
                  <b>{short(d.t)}</b>
                  <span><Cur kind="plat" value={fmt(d.p)} /></span>
                  <span>{t("jr.relics", { n: d.n })}</span>
                </div>
              {/if}
              <span class="day">{new Date(d.t).getDate()}</span>
            </div>
          {/each}
        </div>
        <div class="axis"><span>{t("jr.perDay")}</span><span>{t("jr.upTo", { v: fmt(maxP) })}</span></div>
      </div>
    {/if}

    {#each groups as [day, list] (day)}
      {@const dp = list.reduce((s, e) => s + (plat(e) ?? 0), 0)}
      <div class="day-head">
        <span>{dayTitle(day)}</span>
        <span class="muted">{list.length} · <Cur kind="plat" value={fmt(dp)} /></span>
      </div>
      <div class="rows">
        {#each list as e (e.id)}
          {@const r = e.relicKey ? db.relics[e.relicKey] : null}
          {@const rar = rarity(e)}
          <div class="row entry">
            <span class="t">{time(e.t)}</span>
            <a class="relic" href={r ? `/relic?id=${encodeURIComponent(e.relicKey ?? "")}` : undefined}>
              {#if r}<img src={iconUrl(r.icon)} alt="" />{/if}
              <span>
                {r ? r.s : (e.relic ?? t("jr.relic"))}
                <small class="ref-{e.refine}">{REFINE_RU[e.refine]}</small>
              </span>
            </a>
            <svg class="arrow" viewBox="0 0 24 24"><path d="M5 12h13M13 6l6 6-6 6" /></svg>
            <a class="got" href={e.item ? `/item?id=${encodeURIComponent(e.got)}` : undefined}>
              {#if e.item}<img src={iconUrl(e.item.icon)} alt="" />{/if}
              <span>
                {e.item?.name ?? e.got.split("/").pop()}
                <small>
                  {#if rar}<span class="rarity-{rar}">{RARITY_RU[rar]}</span> · {/if}{e.place}{e.kind ? ` · ${e.kind}` : ""}
                  {#if e.picked}· <span class="picked" class:inv={e.pick_by === "inv"} title={e.pick_by === "inv" ? t("jr.pickedInvHint") : undefined}>{e.pick_by === "inv" ? t("jr.pickedInv") : t("jr.picked")}</span>{/if}
                  {#if needs.uses[e.got]}· <span class="for-goal" title={t("jr.forGoalHint")}>⚑ {needs.uses[e.got].join(", ")}</span>{/if}
                </small>
              </span>
            </a>
            <span class="num">{#if ducats(e)}<Cur kind="ducats" value={ducats(e)} />{/if}</span>
            <span class="num">
              {#if !e.item?.slug}<span class="dash">—</span>
              {:else if plat(e) === undefined}<span class="dash">···</span>
              {:else if plat(e) == null}<span class="dash">—</span>
              {:else}<Cur kind="plat" value={plat(e) ?? 0} />{/if}
            </span>
            <button class="del" title={t("jr.remove")} onclick={() => journal.remove(e.id)}>×</button>
          </div>
          {#if e.offer?.length}
            <div class="offer">
              <span>{t("jr.offer")}</span>
              {#each e.offer as id}
                {@const it = db.items[id]}
                {#if it}
                  <button class:on={e.got === id} class:need={!!needs.need[id]} onclick={() => journal.pick(e.id, e.picked === id ? null : id)} title={needs.need[id] ? t("jr.neededHint", { goals: needs.need[id].join(", ") }) : t("jr.markPicked")}>
                    {#if needs.need[id]}⚑&nbsp;{/if}{it.name}
                  </button>
                {/if}
              {/each}
              {#if !e.picked}
                <em class="pending">{inventory.auto && inventory.ready ? t("jr.pendingInv") : t("jr.pickHand")}</em>
              {/if}
            </div>
          {/if}
        {/each}
      </div>
    {/each}
  {/if}
</div>

<style>
  .for-goal {
    color: var(--good);
  }
  .offer button.need {
    color: var(--good);
    border-color: rgba(111, 207, 151, 0.4);
  }
  .journal {
    min-width: 0;
  }
  .head {
    display: flex;
    align-items: flex-end;
    justify-content: space-between;
    gap: 16px;
    flex-wrap: wrap;
    margin-bottom: 20px;
  }
  .head p {
    margin: 0;
    font-size: 13px;
  }
  .seg {
    display: flex;
    gap: 2px;
    padding: 3px;
    border-radius: 10px;
    background: var(--surface);
  }
  .seg button {
    padding: 6px 12px;
    border-radius: 8px;
    font-size: 13px;
    color: var(--text-dim);
  }
  .seg button.on {
    background: var(--surface-2);
    color: var(--text);
  }
  .empty {
    display: flex;
    flex-direction: column;
    gap: 6px;
    padding: 28px;
    border-radius: 14px;
    background: var(--surface);
  }
  .empty span {
    color: var(--text-dim);
    font-size: 13px;
    line-height: 1.5;
  }

  .tiles {
    display: grid;
    grid-template-columns: repeat(4, minmax(0, 1fr)) minmax(0, 1.5fr);
    gap: 10px;
  }
  .tile {
    display: flex;
    flex-direction: column;
    gap: 4px;
    padding: 14px 16px;
    border-radius: 14px;
    background: var(--surface);
    min-width: 0;
  }
  .tile > span {
    font-size: 12px;
    color: var(--text-faint);
  }
  .tile > b {
    font-size: 26px;
    font-weight: 600;
    font-variant-numeric: tabular-nums;
  }
  .tile small {
    font-size: 12px;
    color: var(--text-dim);
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }
  .tile.best {
    background: linear-gradient(120deg, var(--accent-soft), var(--surface) 70%);
  }
  .find {
    display: flex;
    align-items: center;
    gap: 10px;
    margin-top: 2px;
  }
  .find img {
    width: 42px;
    height: 42px;
    object-fit: contain;
  }
  .find b {
    display: block;
    font-weight: 500;
    font-size: 14px;
  }

  .chart {
    margin: 22px 0 8px;
    padding: 16px 16px 10px;
    border-radius: 14px;
    background: var(--surface);
  }
  .bars {
    display: grid;
    grid-template-columns: repeat(var(--n), minmax(0, 1fr));
    gap: 2px;
    height: 120px;
  }
  .col {
    position: relative;
    display: flex;
    flex-direction: column;
    justify-content: flex-end;
    align-items: center;
    padding-bottom: 18px;
  }
  .col:hover {
    background: rgba(255, 255, 255, 0.025);
    border-radius: 6px;
  }
  .bar {
    width: min(70%, 34px);
    min-height: 2px;
    background: var(--accent);
    border-radius: 4px 4px 0 0;
  }
  .bar.zero {
    background: var(--line);
  }
  .day {
    position: absolute;
    bottom: 0;
    font-size: 11px;
    color: var(--text-faint);
  }
  .tip {
    position: absolute;
    bottom: calc(100% - 10px);
    z-index: 2;
    display: flex;
    flex-direction: column;
    gap: 2px;
    padding: 8px 10px;
    border-radius: 8px;
    background: var(--bg);
    border: 1px solid var(--line);
    box-shadow: 0 10px 30px rgba(0, 0, 0, 0.4);
    font-size: 12px;
    white-space: nowrap;
    pointer-events: none;
  }
  .axis {
    display: flex;
    justify-content: space-between;
    margin-top: 6px;
    font-size: 11px;
    color: var(--text-faint);
  }

  .day-head {
    display: flex;
    justify-content: space-between;
    align-items: baseline;
    margin: 24px 4px 8px;
    font-size: 12px;
    text-transform: uppercase;
    letter-spacing: 0.08em;
    color: var(--text-dim);
  }
  .day-head .muted {
    text-transform: none;
    letter-spacing: 0;
  }
  .entry {
    gap: 14px;
  }
  .t {
    width: 42px;
    flex: none;
    font-size: 12px;
    color: var(--text-faint);
    font-variant-numeric: tabular-nums;
  }
  .relic,
  .got {
    display: flex;
    align-items: center;
    gap: 10px;
    min-width: 0;
  }
  .relic {
    width: 190px;
    flex: none;
  }
  .got {
    flex: 1;
  }
  .relic img,
  .got img {
    width: 34px;
    height: 34px;
    object-fit: contain;
    flex: none;
  }
  .relic > span,
  .got > span {
    min-width: 0;
    font-size: 13.5px;
  }
  .relic small,
  .got small {
    display: block;
    font-size: 11.5px;
    color: var(--text-faint);
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }
  .ref-radiant {
    color: var(--rare) !important;
  }
  .ref-flawless {
    color: var(--uncommon) !important;
  }
  .ref-exceptional {
    color: var(--common) !important;
  }
  .arrow {
    width: 16px;
    height: 16px;
    flex: none;
    fill: none;
    stroke: var(--text-faint);
    stroke-width: 1.8;
    stroke-linecap: round;
    stroke-linejoin: round;
  }
  .picked {
    color: var(--accent);
  }
  .picked.inv {
    color: var(--good);
  }
  .pending {
    font-style: normal;
    color: var(--text-faint);
  }
  .dash {
    color: var(--text-faint);
  }
  .del {
    width: 22px;
    flex: none;
    color: var(--text-faint);
    opacity: 0;
    font-size: 16px;
  }
  .entry:hover .del {
    opacity: 1;
  }
  .del:hover {
    color: var(--warn);
  }
  .offer {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 6px;
    padding: 2px 12px 8px 68px;
    font-size: 12px;
    color: var(--text-faint);
  }
  .offer button {
    padding: 2px 9px;
    border-radius: 999px;
    border: 1px solid var(--line);
    font-size: 12px;
    color: var(--text-dim);
  }
  .offer button.on {
    border-color: var(--accent);
    color: var(--accent);
  }
</style>
