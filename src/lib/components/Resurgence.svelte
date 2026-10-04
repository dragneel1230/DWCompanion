<script lang="ts">
  // Prime Resurgence: frames and weapons Varzia offers now, each marked by the public profile
  // (mastered / level / never leveled). Vaulted items not mastered yet come first: their relics are
  // sold only while they are in the rotation, so that is when to farm them.
  import { num, t } from "$lib/i18n/index.svelte";
  import { getDb, iconUrl } from "$lib/db";
  import { left } from "$lib/cycles";
  import { profile } from "$lib/profile.svelte";
  import { CAT_RU, loadMastery, perRank, rankOf, type MasteryDb } from "$lib/mastery";
  import type { Timers } from "$lib/api";

  let {
    r,
    now,
    onpick,
    compact = false,
  }: { r: NonNullable<Timers["resurgence"]>; now: number; onpick: (setId: string) => void; compact?: boolean } = $props();

  const db = getDb();
  profile.start();
  let mdb = $state<MasteryDb | null>(null);
  loadMastery().then((m) => (mdb = m)).catch(() => {});

  // Drops only from vaulted relics: Resurgence is the window to get it.
  const vaulted = (id: string) => {
    const parts = db.sets[id]?.parts ?? [];
    return parts.length > 0 && parts.every((p) => (db.items[p]?.relics ?? []).every((x) => db.relics[x.relic]?.vaulted));
  };

  type Status = "mastered" | "progress" | "none" | "unknown";
  const rows = $derived.by(() => {
    const p = profile.data;
    return (r.items ?? r.frames ?? [])
      .filter((id) => db.sets[id])
      .map((id) => {
        const it = mdb?.items[id];
        const xp = p?.xp[id] ?? 0;
        const rank = it ? rankOf(xp, it.fl, it.max) : 0;
        const status: Status = !p || !it ? "unknown" : rank >= it.max ? "mastered" : xp > 0 ? "progress" : "none";
        const leftXp = it ? (it.max - rank) * perRank(it.fl) : 0;
        const farm = (status === "none" || status === "progress") && vaulted(id);
        return { id, name: db.sets[id].name, icon: db.sets[id].icon, it, rank, status, leftXp, farm };
      })
      .sort((a, b) => Number(b.farm) - Number(a.farm) || order(a.status) - order(b.status) || Number(b.it?.cat === "warframe") - Number(a.it?.cat === "warframe"));
  });
  const order = (s: Status) => ({ none: 0, progress: 1, unknown: 2, mastered: 3 })[s];

  const farm = $derived(rows.filter((x) => x.farm));
  const farmXp = $derived(farm.reduce((s, x) => s + x.leftXp, 0));
  const allDone = $derived(!!profile.data && rows.length > 0 && rows.every((x) => x.status === "mastered"));
</script>

<div class="surge" class:compact>
  <div class="head">
    <b>{t("world.resurgence")}</b>
    <span>{t("world.stillLeft", { left: left(r.to - now) })}</span>
  </div>

  {#if farm.length}
    <p class="hint farm">{t("surge.farmNow", { n: farm.length })} · {t("baro.mastery", { xp: num(farmXp) })}</p>
  {:else if allDone}
    <p class="hint">{t("surge.allDone")}</p>
  {/if}

  <div class="list">
    {#each rows as x (x.id)}
      <button class="row" class:farm={x.farm} onclick={() => onpick(x.id)} title={x.farm ? t("surge.farmHint") : x.name}>
        {#if x.icon}<img src={iconUrl(x.icon)} alt="" loading="lazy" />{:else}<span class="img"></span>{/if}
        <span class="name">
          <b>{x.name}</b>
          {#if x.it && !compact}<small>{CAT_RU[x.it.cat]}{x.it.mr ? ` · MR ${x.it.mr}` : ""}</small>{/if}
        </span>
        {#if x.status === "mastered"}
          <span class="st good">✓ {t("surge.mastered")}</span>
        {:else if x.status === "progress" && x.it}
          <span class="st prog">{t("coll.lvl", { a: x.rank, b: x.it.max })}</span>
        {:else if x.status === "none"}
          <span class="st none">{t("surge.none")}</span>
        {/if}
      </button>
    {/each}
  </div>

  {#if r.relics}
    <p class="foot">{t("surge.relics", { n: r.relics })}</p>
  {/if}
  {#if !profile.data}
    <p class="foot">{t("surge.noProfile")}</p>
  {/if}
</div>

<style>
  .surge {
    display: flex;
    flex-direction: column;
    gap: 6px;
    font-size: 12.5px;
    color: var(--text-dim);
  }
  .head {
    display: flex;
    align-items: baseline;
    justify-content: space-between;
    gap: 8px;
  }
  .head b {
    font-size: 13px;
    font-weight: 600;
    color: var(--text);
  }
  .hint {
    margin: 0;
    font-size: 12px;
  }
  .hint.farm {
    color: var(--accent);
  }
  .list {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(210px, 1fr));
    gap: 4px;
  }
  .compact .list {
    grid-template-columns: minmax(0, 1fr);
  }
  .row {
    min-width: 0;
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 4px 8px 4px 4px;
    border-radius: 8px;
    text-align: left;
  }
  .row:hover {
    background: var(--surface-2);
  }
  .row.farm {
    background: var(--accent-soft);
  }
  img,
  .img {
    flex: none;
    width: 30px;
    height: 30px;
    object-fit: contain;
  }
  .name {
    flex: 1;
    min-width: 0;
    display: flex;
    flex-direction: column;
  }
  .name b {
    font-size: 12.5px;
    font-weight: 500;
    color: var(--text);
    overflow-wrap: anywhere;
    line-height: 1.25;
  }
  .name small {
    font-size: 11px;
    color: var(--text-faint);
  }
  .st {
    flex: none;
    font-size: 11px;
    white-space: nowrap;
  }
  .st.good {
    color: var(--good);
  }
  .st.prog {
    color: var(--accent);
  }
  .st.none {
    color: var(--text-faint);
  }
  .foot {
    margin: 0;
    font-size: 11.5px;
    color: var(--text-faint);
  }
</style>
