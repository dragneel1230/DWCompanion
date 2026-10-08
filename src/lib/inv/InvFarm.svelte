<script lang="ts">
  // "Что фармить": relics that drop now (DE's drop tables) by the average platinum of one opening
  // (yesterday's deals), with the most valuable reward and where the relic drops. Goal relics are marked.
  import { getDb, iconUrl, itemName } from "$lib/db";
  import { t, type Key } from "$lib/i18n/index.svelte";
  import { rate, type DropsDb } from "$lib/drops";
  import { dayPrice } from "$lib/marketDay";
  import Cur from "$lib/components/Cur.svelte";
  import type { FarmRelic } from "./worth";

  let { relics, drops }: { relics: FarmRelic[]; drops: DropsDb } = $props();

  type Mode = "ev" | "radiant" | "squad";
  let mode = $state<Mode>("ev");
  let goalOnly = $state(false);
  const MODES: { id: Mode; label: Key }[] = [
    { id: "ev", label: "inv.farm.intact" },
    { id: "radiant", label: "inv.farm.radiant" },
    { id: "squad", label: "inv.farm.squad" },
  ];
  const ERA_COLOR: Record<string, string> = { Lith: "#b98b62", Meso: "#c0c7d4", Neo: "#e3c46b", Axi: "#8fb8ff" };

  const db = getDb();
  const list = $derived(
    relics
      .filter((r) => !goalOnly || r.goal)
      .sort((a, b) => b[mode] - a[mode])
      .slice(0, 40),
  );
  // The reward that makes the relic worth it.
  function top(r: FarmRelic) {
    let best: { name: string; p: number } | null = null;
    for (const x of r.relic.rewards) {
      const it = db.items[x.id];
      const p = dayPrice(it?.slug)?.price ?? 0;
      if (it && (!best || p > best.p)) best = { name: itemName(it), p };
    }
    return best;
  }
  function where(key: string) {
    const list = drops.relics[key] ?? [];
    const best = list.find(([i]) => drops.sources[i].kind !== "other") ?? list[0];
    if (!best) return null;
    const s = drops.sources[best[0]];
    return { name: s.name, sub: [s.sub, best[2] ? rate(best[2]) : ""].filter(Boolean).join(" · ") };
  }
</script>

<div class="bar">
  <div class="seg">{#each MODES as m (m.id)}<button class:on={mode === m.id} onclick={() => (mode = m.id)}>{t(m.label)}</button>{/each}</div>
  <label class="chk"><input type="checkbox" bind:checked={goalOnly} /> {t("inv.farm.goalOnly")}</label>
  <span class="hint">{t("inv.farm.hint")}</span>
</div>

<div class="rows">
  {#each list as r, i (r.key)}
    {@const tp = top(r)}
    {@const w = where(r.key)}
    <a class="row line" href="/relic?id={encodeURIComponent(r.key)}">
      <span class="n">{i + 1}</span>
      <img class="ic" src={iconUrl(r.relic.icon)} alt="" loading="lazy" />
      <span class="name">
        <b style:color={ERA_COLOR[r.relic.era]}>{r.relic.s}</b>
        <small>
          {#if tp}{t("inv.farm.top", { n: tp.name })} <Cur kind="plat" value={tp.p} size={11} />{/if}
          {#if r.goal} · <span class="goal">{t("inv.relics.goal")}</span>{/if}
          {#if r.have} · {t("inv.farm.have", { n: r.have })}{/if}
        </small>
      </span>
      <span class="where">
        {#if w}<b>{w.name}</b><small>{w.sub}</small>{:else}<small>{t("inv.farm.noSource")}</small>{/if}
      </span>
      <span class="ev"><Cur kind="plat" value={Math.round(r[mode] * 10) / 10} size={14} /></span>
    </a>
  {/each}
</div>

<style>
  .bar {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 12px;
    margin-bottom: 12px;
  }
  .chk {
    display: flex;
    align-items: center;
    gap: 6px;
    font-size: 12px;
    color: var(--text-dim);
    cursor: pointer;
  }
  .chk input {
    accent-color: var(--accent);
  }
  .hint {
    font-size: 12px;
    color: var(--text-faint);
  }
  .row.line {
    gap: 14px;
    color: var(--text);
  }
  .n {
    width: 20px;
    text-align: right;
    color: var(--text-faint);
    font-size: 12px;
    font-variant-numeric: tabular-nums;
  }
  .ic {
    width: 34px;
    height: 34px;
    object-fit: contain;
    flex: none;
  }
  .name b {
    font-weight: 600;
  }
  .name small {
    display: flex;
    align-items: center;
    gap: 4px;
    flex-wrap: wrap;
  }
  .goal {
    color: var(--accent);
  }
  .where {
    width: 260px;
    display: flex;
    flex-direction: column;
    font-size: 12.5px;
  }
  .where b {
    font-weight: 500;
  }
  .where small {
    color: var(--text-faint);
    font-size: 11.5px;
  }
  .ev {
    width: 70px;
    text-align: right;
    font-weight: 600;
  }
</style>
