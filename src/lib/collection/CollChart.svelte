<script lang="ts">
  // Star chart by planet: nodes and junctions done, normal and on the Steel Path, and what is left on each
  // planet with its mastery. Nodes are the ones that give mastery (mastery.json, DE's ExportRegions); progress
  // from the public profile merged with the inventory snapshot (Collection.svelte withInventory).
  import { num, t } from "$lib/i18n/index.svelte";
  import type { Profile } from "$lib/profile.svelte";
  import type { MasteryDb } from "$lib/mastery";

  let { p, mdb }: { p: Profile; mdb: MasteryDb } = $props();

  type Mode = "normal" | "sp";
  const KEY = "dwc.coll.chart";
  let mode = $state<Mode>(readMode());
  function readMode(): Mode {
    try {
      return localStorage.getItem(KEY) === "sp" ? "sp" : "normal";
    } catch {
      return "normal";
    }
  }
  function setMode(m: Mode) {
    mode = m;
    try {
      localStorage.setItem(KEY, m);
    } catch {
      // storage unavailable
    }
  }

  // tag -> done on the Steel Path too
  const done = $derived(new Map(p.missions.map((m) => [m.tag, m.sp])));
  const isDone = (tag: string) => (mode === "sp" ? done.get(tag) === true : done.has(tag));

  type Node = { tag: string; xp: number; j: boolean; n: string; m: string; unknownXp: boolean };
  const planets = $derived.by(() => {
    const by = new Map<number, { all: Node[]; left: Node[] }>();
    for (const [tag, x] of Object.entries(mdb.chartNodes ?? mdb.nodes)) {
      if (mode === "sp" && "sp" in x && x.sp === false) continue;
      const g = by.get(x.p ?? -1) ?? { all: [], left: [] };
      by.set(x.p ?? -1, g);
      const node = { tag, xp: x.xp, j: !!x.j, n: x.n ?? tag, m: x.m ?? "", unknownXp: "unknownXp" in x && !!x.unknownXp };
      g.all.push(node);
      if (!isDone(tag)) g.left.push(node);
    }
    return [...by]
      .sort((a, b) => a[0] - b[0])
      .map(([idx, g]) => ({
        idx,
        name: mdb.systems?.[idx] ?? "—",
        all: g.all.length,
        done: g.all.length - g.left.length,
        left: g.left.sort((a, b) => Number(b.j) - Number(a.j) || a.n.localeCompare(b.n)),
        xp: g.left.reduce((s, n) => s + n.xp, 0),
      }));
  });
  const total = $derived({
    all: planets.reduce((s, x) => s + x.all, 0),
    done: planets.reduce((s, x) => s + x.done, 0),
    xp: planets.reduce((s, x) => s + x.xp, 0),
  });
  const spOpen = $derived([...done.values()].some(Boolean));
  let onlyLeft = $state(true);
  const shown = $derived(onlyLeft ? planets.filter((x) => x.left.length) : planets);
</script>

<section class="chart">
  <header class="head">
    <div class="seg">
      <button class:on={mode === "normal"} onclick={() => setMode("normal")}>{t("chart.normal")}</button>
      <button class:on={mode === "sp"} onclick={() => setMode("sp")}>{t("fissures.hard")}</button>
    </div>
    <span class="sum">
      <b>{total.done}/{total.all}</b>
      {#if total.xp}· {t("chart.leftXp", { v: num(total.xp) })}{/if}
    </span>
    <label class="only"><input type="checkbox" bind:checked={onlyLeft} /> {t("chart.onlyLeft")}</label>
  </header>
  {#if mode === "sp" && !spOpen}
    <p class="note">{t("chart.spLocked")}</p>
  {/if}
  {#if !shown.length}
    <p class="muted">{t("chart.allDone")}</p>
  {/if}
  <div class="planets">
    {#each shown as pl (pl.idx)}
      <div class="pl" class:full={!pl.left.length}>
        <div class="top">
          <b>{pl.name}</b>
          <span class="v">{pl.done}/{pl.all}</span>
        </div>
        <div class="bar"><i style:width="{(pl.done / pl.all) * 100}%"></i></div>
        {#if pl.left.length}
          <ul>
            {#each pl.left as n (n.tag)}
              <li class:j={n.j}>
                <span class="n">{n.n}</span>
                <span class="m">{n.m}</span>
                {#if n.unknownXp}<span class="xp" title={t("chart.unknownHint")}>{t("chart.unknownXp")}</span>{:else if n.xp}<span class="xp" title={t("chart.xpHint")}>+{num(n.xp)}</span>{/if}
              </li>
            {/each}
          </ul>
        {:else}
          <p class="ok">✓ {t("chart.planetDone")}</p>
        {/if}
      </div>
    {/each}
  </div>
  <p class="foot">{t("chart.foot")}</p>
</section>

<style>
  .head {
    display: flex;
    align-items: center;
    gap: 14px;
    flex-wrap: wrap;
    margin-bottom: 12px;
  }
  .sum {
    font-size: 13px;
    color: var(--text-dim);
  }
  .sum b {
    font-size: 15px;
    color: var(--text);
    font-variant-numeric: tabular-nums;
  }
  .only {
    margin-left: auto;
    display: flex;
    align-items: center;
    gap: 6px;
    font-size: 12.5px;
    color: var(--text-dim);
  }
  .note {
    margin: 0 0 10px;
    font-size: 12.5px;
    color: var(--warn);
  }
  .muted {
    color: var(--text-faint);
  }
  .planets {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(260px, 1fr));
    gap: 10px;
    align-items: start;
  }
  .pl {
    padding: 12px 14px;
    border-radius: 12px;
    background: var(--surface);
  }
  .top {
    display: flex;
    justify-content: space-between;
    align-items: baseline;
  }
  .top b {
    font-size: 14px;
    font-weight: 600;
  }
  .v {
    font-size: 12.5px;
    color: var(--text-dim);
    font-variant-numeric: tabular-nums;
  }
  .bar {
    height: 4px;
    margin: 8px 0 6px;
    border-radius: 2px;
    background: var(--line);
    overflow: hidden;
  }
  .bar i {
    display: block;
    height: 100%;
    background: var(--accent);
  }
  .full .bar i {
    background: var(--good);
  }
  ul {
    margin: 0;
    padding: 0;
    list-style: none;
  }
  li {
    display: grid;
    grid-template-columns: minmax(0, 1fr) auto auto;
    gap: 8px;
    padding: 3px 0;
    font-size: 12.5px;
  }
  li.j .n {
    color: var(--accent);
  }
  .n {
    min-width: 0;
  }
  .m {
    color: var(--text-faint);
  }
  .xp {
    min-width: 40px;
    text-align: right;
    color: var(--text-dim);
    font-variant-numeric: tabular-nums;
  }
  .ok {
    margin: 0;
    font-size: 12.5px;
    color: var(--good);
  }
  .foot {
    margin: 12px 0 0;
    font-size: 12px;
    line-height: 1.4;
    color: var(--text-faint);
  }
</style>
