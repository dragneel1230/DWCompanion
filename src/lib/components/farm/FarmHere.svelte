<script lang="ts">
  // «Добыча» → «Здесь»: what drops on the current mission's node (rewards, relics) and on its planet
  // (enemies, containers); on the ship — a planet picked by hand. Mission / lobby from EE.log.
  import { locale, t } from "$lib/i18n/index.svelte";
  import { getDb, iconUrl, nodeOfMission } from "$lib/db";
  import { rate, PLANET_RARITY_RU, type DropsDb } from "$lib/drops";
  import type { Mission } from "$lib/hub/hub";
  import { farmState, type FarmSel } from "$lib/views/farmState.svelte";

  let { mission, drops, sel, onpick }: { mission: Mission | null; drops: DropsDb; sel: FarmSel | null; onpick: (s: FarmSel) => void } = $props();

  // Where the player is: the mission in progress, else the lobby. The client writes the place in its own
  // language: through the node it is named from the data.
  const place = $derived.by(() => {
    const w = getDb().world;
    const fromNode = (node: string | null) => {
      const ru = node ? w.regions[node.replace(/_.*$/, "")]?.n : undefined;
      return ru ? { ru, planet: ru.match(/\(([^)]+)\)$/)?.[1] ?? null } : null;
    };
    const fromName = (name: string | null) => {
      const node = nodeOfMission(name);
      if (node) return fromNode(node);
      const ru = name?.split(" - ")[0]?.trim();
      return ru ? { ru, planet: ru.match(/\(([^)]+)\)$/)?.[1] ?? null } : null;
    };
    const m = mission;
    if (m?.active) {
      const p = fromName(m.name) ?? fromNode(m.node);
      if (p) return { ...p, node: m.node?.replace(/_.*$/, "") ?? null, how: "mission" };
    }
    if (m?.lobby) {
      const p = fromName(m.lobby.name) ?? fromNode(m.lobby.node);
      if (p) return { ...p, node: m.lobby.node?.replace(/_.*$/, "") ?? null, how: "lobby" };
    }
    return null;
  });
  const planets = $derived([...new Set(Object.values(drops.resources).flatMap((r) => (r.planets ?? []).map((p) => p[0])))].sort((a, b) => a.localeCompare(b, locale())));
  const planet = $derived(farmState.herePlanet ?? place?.planet ?? null);

  const RAR_ORDER: Record<string, number> = { common: 0, uncommon: 1, rare: 2 };
  // Resources enemies and containers drop on the planet.
  const planetRes = $derived(
    planet
      ? Object.entries(drops.resources)
          .map(([id, r]) => ({ id, r, rar: r.planets?.find((p) => p[0] === planet)?.[1] }))
          .filter((x) => x.rar)
          .sort((a, b) => RAR_ORDER[a.rar!] - RAR_ORDER[b.rar!] || a.r.name.localeCompare(b.r.name, locale()))
      : [],
  );
  // Mission rewards of this very node: resources and relics, best per hour first.
  const nodeDrops = $derived.by(() => {
    if (!place || farmState.herePlanet) return null;
    const here = new Set<number>();
    drops.sources.forEach((s, i) => {
      if (s.kind === "mission" && ((place.node && s.node === place.node) || s.name === place.ru)) here.add(i);
    });
    if (!here.size) return { res: [], relics: [] };
    // One row per resource / relic: the best of this node's sources (normal and Steel Path tables).
    const res = Object.entries(drops.resources)
      .map(([id, r]) => ({ id, r, score: Math.max(0, ...(r.drops ?? []).filter((d) => here.has(d[0])).map((d) => d[2])) }))
      .filter((x) => x.score > 0)
      .sort((a, b) => b.score - a.score);
    const db = getDb();
    const relics = Object.entries(drops.relics)
      .map(([key, list]) => ({ key, relic: db.relics[key], score: Math.max(0, ...list.filter((d) => here.has(d[0])).map((d) => d[2])) }))
      .filter((x) => x.relic && x.score > 0)
      .sort((a, b) => b.score - a.score);
    return { res, relics };
  });
  const on = (id: string) => sel?.kind === "resource" && sel.id === id;
</script>

{#snippet resRow(id: string, name: string, icon: string | null, note: string, right?: string)}
  <button class="row item" class:on={on(id)} onclick={() => onpick({ kind: "resource", id })}>
    <img src={iconUrl(icon)} alt="" loading="lazy" />
    <span class="name">{name}{#if note}<small>{note}</small>{/if}</span>
    {#if right}<span class="right">{right}</span>{/if}
  </button>
{/snippet}

{#if place && !farmState.herePlanet}
  <div class="where">
    <small>{place.how === "mission" ? t("res.onMission") : t("res.inLobby")}</small>
    <b>{place.ru}</b>
  </div>
{/if}
<div class="chips">
  {#if place?.planet}
    <button class:on={!farmState.herePlanet} onclick={() => (farmState.herePlanet = null)}>{t("res.here")}</button>
  {/if}
  {#each planets as p (p)}
    <button class:on={planet === p && (farmState.herePlanet === p || !place)} onclick={() => (farmState.herePlanet = p)}>{p}</button>
  {/each}
</div>
{#if !planet}
  <div class="empty"><b>{t("res.onShip")}</b><span>{t("res.onShipHint")}</span></div>
{/if}
{#if nodeDrops?.res.length}
  <div class="section-title">{t("res.nodeRewards")}</div>
  <div class="rows">
    {#each nodeDrops.res as x (x.id)}
      {@render resRow(x.id, x.r.name, x.r.icon, t("res.missionReward"), rate(x.score))}
    {/each}
  </div>
{/if}
{#if nodeDrops?.relics.length}
  <div class="section-title">{t("res.nodeRelics")}</div>
  <div class="rows">
    {#each nodeDrops.relics as x (x.key)}
      <a class="row item" href="/relic?id={encodeURIComponent(x.key)}">
        <img src={iconUrl(x.relic.icon)} alt="" loading="lazy" />
        <span class="name">{x.relic.name}</span>
        <span class="right">{rate(x.score)}</span>
      </a>
    {/each}
  </div>
{/if}
{#if planetRes.length}
  <div class="section-title">{t("res.planetEnemies", { planet })}</div>
  <div class="rows">
    {#each planetRes as x (x.id)}
      {@render resRow(x.id, x.r.name, x.r.icon, "", PLANET_RARITY_RU[x.rar!] ?? x.rar)}
    {/each}
  </div>
{/if}

<style>
  .where {
    display: flex;
    flex-direction: column;
    padding: 4px 4px 10px;
  }
  .where small {
    font-size: 11px;
    letter-spacing: 0.1em;
    text-transform: uppercase;
    color: var(--text-faint);
  }
  .where b {
    font-size: 16px;
    font-weight: 500;
    color: var(--accent);
  }
  .chips {
    display: flex;
    flex-wrap: wrap;
    gap: 4px;
    padding: 0 0 12px;
  }
  .chips button {
    padding: 4px 10px;
    border-radius: 999px;
    border: 1px solid var(--line);
    font-size: 12px;
    color: var(--text-dim);
  }
  .chips button.on {
    border-color: var(--accent);
    background: var(--accent-soft);
    color: var(--accent);
  }
  .section-title {
    margin: 12px 4px 6px;
  }
  .item {
    padding: 6px 10px;
    color: inherit;
  }
  .item > img {
    width: 30px;
    height: 30px;
    object-fit: contain;
  }
  .item .name {
    flex: 1;
    min-width: 0;
    font-size: 13.5px;
  }
  .item .name small {
    display: block;
    font-size: 11.5px;
    color: var(--text-faint);
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }
  .item.on {
    background: var(--accent-soft);
    box-shadow: inset 2px 0 0 var(--accent);
  }
  .right {
    flex: none;
    font-size: 12px;
    color: var(--text-dim);
    font-variant-numeric: tabular-nums;
  }
</style>
