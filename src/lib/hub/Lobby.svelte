<script lang="ts">
  // Fissure lobby hint (before the mission starts): the relic the player took with its chances and
  // average value at its refinement, and the relics of this tier that drop now, by average value —
  // to see whether another relic from the inventory would be worth more. "Отряд ×4": everyone opens
  // the same relic and refinement, the player takes the best of four (relicValue → squad).
  import { locale, num, t } from "$lib/i18n/index.svelte";
  import { getDb, iconUrl, itemName, nodeOfMission } from "$lib/db";
  import { prices } from "$lib/prices.svelte";
  import { CHANCE, REFINE_RU, parseRelicText, relicValue, refineGain } from "$lib/relicValue";
  import Cur from "$lib/components/Cur.svelte";
  import type { Lobby, View } from "./hub";

  let { lobby, myRelic, onopen }: { lobby: Lobby; myRelic: string | null; onopen: (v: View) => void } = $props();

  const db = getDb();
  const TIER_ERA: Record<string, string> = { VoidT1: "Lith", VoidT2: "Meso", VoidT3: "Neo", VoidT4: "Axi", VoidT5: "Requiem" };

  const SQUAD_KEY = "dwc.hub.squad";
  let squad = $state(readSquad());
  function readSquad(): number {
    try {
      return localStorage.getItem(SQUAD_KEY) === "4" ? 4 : 1;
    } catch {
      return 1;
    }
  }
  function setSquad(n: number) {
    squad = n;
    try {
      localStorage.setItem(SQUAD_KEY, String(n));
    } catch {
      // storage unavailable
    }
  }

  const mine = $derived(myRelic ? parseRelicText(myRelic) : null);
  const era = $derived(lobby.tier ? TIER_ERA[lobby.tier] : null); // Omnia (VoidT6) takes any era
  const tierName = $derived(lobby.tier ? (db.world.tier[lobby.tier] ?? lobby.tier) : "");

  // Relics of this tier that drop now (plus the player's own).
  const candidates = $derived(
    Object.entries(db.relics)
      .filter(([k, r]) => (era ? r.era === era : r.era !== "Requiem") && (!r.vaulted || k === mine?.key))
      .map(([k]) => k),
  );

  $effect(() => {
    const keys = mine?.key ? [mine.key, ...candidates] : candidates;
    prices.want(keys.flatMap((k) => db.relics[k].rewards.map((rw) => db.items[rw.id].slug)));
  });
  const sell = (slug: string) => prices.sell[slug];

  const own = $derived(mine?.key ? { key: mine.key, relic: db.relics[mine.key], v: relicValue(mine.key, mine.refine, sell, squad) } : null);
  // What 100 Void Traces spent on intact -> radiant bring on the player's relic.
  const gain = $derived(own ? refineGain(own.key, "radiant", sell, squad) : 0);
  const ownRewards = $derived(
    own
      ? own.relic.rewards
          .map((rw) => ({ ...rw, it: db.items[rw.id], chance: CHANCE[mine!.refine][rw.rarity] }))
          .sort((a, b) => (sell(b.it.slug ?? "") ?? -1) - (sell(a.it.slug ?? "") ?? -1))
      : [],
  );

  const top = $derived(
    candidates
      .map((k) => ({ k, r: db.relics[k], intact: relicValue(k, "intact", sell, squad), radiant: relicValue(k, "radiant", sell, squad) }))
      .sort((a, b) => b.radiant.plat - a.radiant.plat)
      .slice(0, 6),
  );
  const loading = $derived(top.some((t) => t.radiant.loading));
  // Node name from the data (interface language); the client's text from EE.log only as a fallback.
  const lobbyPlace = $derived.by(() => {
    const node = lobby.node?.replace(/_.*$/, "") ?? nodeOfMission(lobby.name);
    return (node && db.world.regions[node]?.n) || lobby.name?.replace(/ - .*$/, "") || null;
  });
  const fmt = (n: number) => (n >= 10 ? Math.round(n) : Math.round(n * 10) / 10).toLocaleString(locale());
</script>

<div class="where">
  <b>{lobbyPlace ?? t("lobby.title")}</b>
  <span>{t("lobby.title")} · {t("journal.fissure", { tier: tierName })}</span>
</div>

{#if own && mine}
  <div class="mine">
    <div class="top">
      <img src={iconUrl(own.relic.icon)} alt="" />
      <div class="t">
        <button class="name" onclick={() => onopen({ kind: "relic", id: own.key })}>{own.relic.name}</button>
        <small class="ref-{mine.refine}">{REFINE_RU[mine.refine]} · {t("lobby.yourRelic")}</small>
      </div>
      <div class="ev" title={squad > 1 ? t("lobby.evSquadHint") : t("lobby.evSoloHint")}>
        <span>{squad > 1 ? t("lobby.evSquad") : t("lobby.evSolo")}</span>
        <b>{#if own.v.loading}···{:else}<Cur kind="plat" value={fmt(own.v.plat)} size={16} />{/if}</b>
        <small><Cur kind="ducats" value={fmt(own.v.ducats)} size={12} /> · {t("lobby.rareChance", { v: Math.round(own.v.rare * 100) })}</small>
      </div>
    </div>
    {#if !own.v.loading && gain > 0}
      <p class="gain">
        {t("lobby.refine")} <b>+{fmt(gain)}</b> {t("lobby.refinePer")}{gain < 3 ? ` — ${t("lobby.refineNo")}` : gain >= 10 ? ` — ${t("lobby.refineYes")}` : ""}
      </p>
    {/if}
    <div class="odds">
      {#each ownRewards as rw (rw.id)}
        <button class="odd" onclick={() => onopen({ kind: "item", id: rw.id })}>
          <img src={iconUrl(rw.it.icon)} alt="" loading="lazy" />
          <span class="n">{rw.count > 1 ? `${rw.count} × ` : ""}{itemName(rw.it)}</span>
          <span class="c rarity-{rw.rarity}">{t("unit.pct", { v: num(rw.chance) })}</span>
          <span class="p">
            {#if rw.it.slug && sell(rw.it.slug) != null}<Cur kind="plat" value={sell(rw.it.slug) ?? 0} />{:else}<span class="dash">—</span>{/if}
          </span>
        </button>
      {/each}
    </div>
  </div>
{:else}
  <div class="empty">
    <span>{t("lobby.pickRelic")}</span>
  </div>
{/if}

<div class="head">
  <div class="section-title">{t("lobby.bestToOpen")} · {tierName}</div>
  <div class="seg">
    <button class:on={squad === 1} onclick={() => setSquad(1)} title={t("lobby.soloHint")}>{t("lobby.solo")}</button>
    <button class:on={squad === 4} onclick={() => setSquad(4)} title={t("lobby.squadHint")}>{t("lobby.squad")}</button>
  </div>
</div>
<p class="note">
  {t("lobby.listNote")}, {squad > 1 ? t("lobby.byBestOfFour") : t("lobby.byOneOpen")}{loading ? ` (${t("lobby.pricesLoading")})` : ""}
</p>
<div class="rows">
  {#each top as row, i (row.k)}
    <button class="row" class:best={i === 0 && !loading} class:is-mine={row.k === mine?.key} onclick={() => onopen({ kind: "relic", id: row.k })}>
      <img src={iconUrl(row.r.icon)} alt="" loading="lazy" />
      <span class="name">
        {row.r.s}
        {#if row.k === mine?.key}<small class="me">{t("mission.yours")}</small>{/if}
      </span>
      <span class="val" title={t("refine.intact")}><small>{t("lobby.intactShort")}</small><Cur kind="plat" value={fmt(row.intact.plat)} /></span>
      <span class="val" title={t("refine.radiant")}><small>{t("lobby.radiantShort")}</small><Cur kind="plat" value={fmt(row.radiant.plat)} /></span>
    </button>
  {/each}
</div>

<style>
  .head {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 10px;
    margin: 18px 8px 4px;
  }
  .head .section-title {
    margin: 0;
  }
  .gain {
    margin: 10px 0 0;
    font-size: 12.5px;
    color: var(--text-dim);
  }
  .gain b {
    color: var(--accent);
  }
  .where {
    display: flex;
    flex-direction: column;
    gap: 2px;
    padding: 2px 8px 12px;
  }
  .where b {
    font-size: 20px;
    font-weight: 600;
  }
  .where span {
    color: var(--accent);
    font-size: 13px;
  }
  .mine {
    margin: 0 4px;
    padding: 12px;
    border-radius: 14px;
    background: linear-gradient(135deg, var(--accent-soft), rgba(255, 255, 255, 0.03) 60%);
    border: 1px solid rgba(201, 166, 107, 0.25);
  }
  .top {
    display: flex;
    align-items: center;
    gap: 12px;
  }
  .top img {
    width: 44px;
    height: 44px;
    object-fit: contain;
  }
  .t {
    flex: 1;
    min-width: 0;
  }
  .name {
    padding: 0;
    font-size: 15px;
    font-weight: 500;
    text-align: left;
  }
  .name:hover {
    color: var(--accent);
  }
  .t small {
    display: block;
    font-size: 12px;
    color: var(--text-faint);
  }
  .ref-radiant {
    color: var(--rare) !important;
  }
  .ref-flawless {
    color: var(--uncommon) !important;
  }
  .ev {
    display: flex;
    flex-direction: column;
    align-items: flex-end;
    gap: 1px;
  }
  .ev span {
    font-size: 11px;
    color: var(--text-faint);
  }
  .ev b {
    font-size: 20px;
    font-weight: 600;
  }
  .ev small {
    font-size: 11.5px;
    color: var(--text-dim);
  }
  .odds {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 2px 10px;
    margin-top: 10px;
  }
  .odd {
    display: flex;
    align-items: center;
    gap: 7px;
    padding: 4px 6px;
    border-radius: 8px;
    text-align: left;
    min-width: 0;
  }
  .odd:hover {
    background: rgba(255, 255, 255, 0.05);
  }
  .odd img {
    width: 22px;
    height: 22px;
    object-fit: contain;
    flex: none;
  }
  .odd .n {
    flex: 1;
    min-width: 0;
    font-size: 12px;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }
  .odd .c {
    font-size: 11px;
    font-variant-numeric: tabular-nums;
  }
  .odd .p {
    width: 40px;
    text-align: right;
    font-size: 12px;
  }
  .dash {
    color: var(--text-faint);
  }
  .section-title {
    margin: 18px 8px 2px;
  }
  .note {
    margin: 0 8px 8px;
    font-size: 11.5px;
    color: var(--text-faint);
  }
  .row .name {
    font-size: 13.5px;
  }
  .me {
    display: inline !important;
    margin-left: 6px;
    color: var(--accent) !important;
  }
  .row.is-mine {
    background: rgba(255, 255, 255, 0.04);
  }
  .val {
    display: flex;
    align-items: baseline;
    gap: 4px;
    width: 76px;
    justify-content: flex-end;
    font-size: 13px;
  }
  .val small {
    font-size: 10.5px;
    color: var(--text-faint);
  }
</style>
