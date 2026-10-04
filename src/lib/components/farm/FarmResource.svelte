<script lang="ts">
  // A resource: the short answer first (where to farm it, buy it or build it), tips, then every source
  // with its origin labelled: DE's planet data, our endless-mission pick, the wiki, the game's text, drop tables.
  import { t, num } from "$lib/i18n/index.svelte";
  import { iconUrl } from "$lib/db";
  import { PLANET_RARITY_RU, type DropsDb } from "$lib/drops";
  import type { CraftDb } from "$lib/craft";
  import { srcText, levels, usedIn } from "$lib/farm";
  import DropSources from "$lib/components/DropSources.svelte";
  import WikiFarm from "$lib/components/WikiFarm.svelte";
  import CraftTree from "$lib/components/CraftTree.svelte";

  let {
    db,
    craft,
    id,
    onopen,
  }: { db: DropsDb; craft: CraftDb; id: string; onopen: (kind: "resource" | "craft" | "prime", id: string) => void } = $props();

  const r = $derived(db.resources[id]);
  const recipe = $derived(r.craft ? craft.items[id] : undefined);
  // Vendors selling the resource itself vs. where its blueprint comes from.
  const buy = $derived([...(r.src ?? []), ...(recipe?.src ?? []).filter((s) => s.k === "vendor" && s.direct)]);
  const bpSrc = $derived((recipe?.src ?? []).filter((s) => !(s.k === "vendor" && s.direct)));
  const best = $derived(r.endless?.[0]);
  const bestMission = $derived(r.planets ? undefined : r.drops?.find(([i]) => db.sources[i].kind === "mission"));
  const bestBounty = $derived(r.drops?.find(([i]) => db.sources[i].kind === "bounty"));
  const bestEnemy = $derived(r.planets ? undefined : r.drops?.find(([i]) => db.sources[i].kind === "enemy"));
  const planets = $derived(
    [...(r.planets ?? [])].sort((a, b) => ["common", "uncommon", "rare"].indexOf(a[1]) - ["common", "uncommon", "rare"].indexOf(b[1])),
  );
  const uses = $derived(usedIn(craft, id).filter(([cid]) => craft.items[cid].kind !== "resource"));
  const nothing = $derived(!best && !bestMission && !bestBounty && !bestEnemy && !buy.length && !recipe && !r.where && !r.farm?.length);
  const T = $derived(db.terms);
  const pct = (b: number) => t("farm.dsBonus", { dark: T.dark, v: b });
</script>

<div class="howto">
  <div class="howto-title">{t("farm.howTo")}</div>

  {#if best}
    {@const s = db.sources[best[0]]}
    <div class="step">
      <span class="n">∞</span>
      <div>
        <div class="lead">{t("farm.goEndless")}</div>
        <div class="main">
          <b>{s.name}</b>
          <span>{s.sub}</span>
          <span class="chip">{levels(best[1], best[2])}</span>
          {#if best[3]}<span class="chip good">{pct(best[3])}</span>{/if}
        </div>
        <p class="why">{t("farm.whyEndless", { rar: PLANET_RARITY_RU[best[4]] })}</p>
        {#if r.endless && r.endless.length > 1}
          <div class="alts">
            <span>{t("farm.orElse")}</span>
            {#each r.endless.slice(1) as [si, a, b, ds] (si)}
              <span class="alt">{[db.sources[si].name, db.sources[si].sub?.split(" · ")[0], levels(a, b), ds ? `+${ds}%` : ""].filter(Boolean).join(" · ")}</span>
            {/each}
          </div>
        {/if}
      </div>
    </div>
  {/if}

  {#if bestMission}
    {@const s = db.sources[bestMission[0]]}
    <div class="step">
      <span class="n">◎</span>
      <div>
        <div class="lead">{t("farm.goMission")}</div>
        <div class="main"><b>{s.name}</b><span>{s.sub}</span><span class="chip good">{t("unit.perHour", { v: num(+bestMission[2].toFixed(bestMission[2] >= 10 ? 0 : 1)) })}</span></div>
      </div>
    </div>
  {/if}

  {#if bestBounty && !best}
    {@const s = db.sources[bestBounty[0]]}
    <div class="step">
      <span class="n">◇</span>
      <div>
        <div class="lead">{t("farm.goBounty")}</div>
        <div class="main"><b>{s.name}</b><span>{s.sub}</span></div>
      </div>
    </div>
  {/if}

  {#if bestEnemy && !bestMission}
    {@const s = db.sources[bestEnemy[0]]}
    <div class="step">
      <span class="n">⚔</span>
      <div>
        <div class="lead">{t("farm.goEnemy")}</div>
        <div class="main"><b>{s.name}</b>{#if s.sub}<span>{s.sub}</span>{/if}</div>
      </div>
    </div>
  {/if}

  {#if !best && !bestMission && r.farm?.length}
    <div class="step">
      <span class="n">★</span>
      <div>
        <div class="lead">{t("farm.goWiki")}</div>
        <div class="main"><b>{r.farm.slice(0, 3).map((i) => db.sources[i].name).join(", ")}</b></div>
      </div>
    </div>
  {/if}

  {#each buy as s, i (i)}
    <div class="step">
      <span class="n">⇄</span>
      <div>
        <div class="lead">{t("farm.goBuy")}</div>
        <div class="main"><b>{srcText(s)}</b></div>
      </div>
    </div>
  {/each}

  {#if recipe}
    <div class="step">
      <span class="n">⚒</span>
      <div>
        <div class="lead">{best || bestMission || buy.length ? t("farm.alsoFoundry") : t("farm.onlyFoundry")}</div>
        <div class="main">
          <b>{bpSrc.length ? bpSrc.map(srcText).join(" · ") : t("farm.bpUnknown")}</b>
        </div>
        <p class="why">{t("farm.recipeOf", { list: recipe.parts.map(([pid, n]) => `${db.resources[pid]?.name ?? craft.items[pid]?.name ?? craft.names[pid]?.name ?? "?"} ×${num(n)}`).join(", ") })}</p>
      </div>
    </div>
  {/if}

  {#if r.where && !best}
    <div class="step">
      <span class="n">i</span>
      <div>
        <div class="lead">{t("farm.goGame")}</div>
        <div class="main"><b>{r.where}</b></div>
      </div>
    </div>
  {/if}

  {#if nothing}
    <p class="why">{t("farm.nothing")} <a href="https://wiki.warframe.com/w/{encodeURIComponent(r.en.replace(/ /g, '_'))}" target="_blank" rel="noreferrer">{t("res.wikiOpen")} ↗</a></p>
  {/if}
</div>

{#if r.planets}
  <div class="section-title">{t("farm.tips")}</div>
  <ul class="tips">
    <li>{@html t("farm.tip.boosters", { a: T.booster, b: T.chanceBooster })}</li>
    <li>{@html t("farm.tip.loot", { nekros: T.nekros, desecrate: T.desecrate, hydroid: T.hydroid, swarm: T.pilferingSwarm, khora: T.khora, dome: T.strangledome, ivara: T.ivara, prowl: T.prowl })}</li>
    <li>{@html t("farm.tip.smeeta", { smeeta: T.smeeta, charm: T.charm })}</li>
    <li>{@html t("farm.tip.containers", { wit: T.thiefsWit, instinct: T.animalInstinct })}</li>
    <li>{@html t("farm.tip.dark", { dark: T.dark })}</li>
    <li>{@html t("farm.tip.steel", { sp: T.steelPath })}</li>
  </ul>
{/if}

{#if r.endless}
  <div class="section-title">{t("farm.endlessAll")}</div>
  <div class="rows">
    {#each r.endless as [si, a, b, ds, rar] (si)}
      {@const s = db.sources[si]}
      <div class="row">
        <span class="name">{s.name}<small>{s.sub}</small></span>
        <span class="chip">{levels(a, b)}</span>
        {#if ds}<span class="chip good">{pct(ds)}</span>{/if}
        <span class="chip r-{rar}">{PLANET_RARITY_RU[rar]}</span>
      </div>
    {/each}
  </div>
  <p class="note">{t("farm.endlessNote")}</p>
{/if}

{#if planets.length}
  <div class="section-title">{t("res.planetsFrom")}</div>
  <div class="planets">
    {#each planets as [p, rar]}
      <span class="planet r-{rar}"><b>{p}</b>{PLANET_RARITY_RU[rar] ?? rar}</span>
    {/each}
  </div>
{/if}

<WikiFarm {db} res={r} />

{#if r.where}
  <div class="section-title">{t("res.whereGame2")}</div>
  <div class="where">{r.where}</div>
{/if}

<DropSources {db} drops={r.drops} best={!r.planets && !r.farm} empty={null} />

{#if recipe}
  <div class="section-title">{t("farm.recipe")}</div>
  <CraftTree {craft} drops={db} {id} onresource={(x) => onopen("resource", x)} onpart={(x) => onopen("craft", x)} onitem={(x) => onopen("prime", x)} />
{/if}

{#if uses.length}
  <div class="section-title">{t("res.usedIn")} · {uses.length}</div>
  <div class="uses">
    {#each uses.slice(0, 48) as [cid, n] (cid)}
      {@const c = craft.items[cid]}
      <button onclick={() => onopen("craft", cid)}>
        {#if c.icon}<img src={iconUrl(c.icon)} alt="" loading="lazy" />{/if}
        <span>{c.name}</span><i>×{num(n)}</i>
      </button>
    {/each}
  </div>
{/if}

<style>
  .tips {
    margin: 0;
    padding-left: 18px;
    color: var(--text-dim);
    line-height: 1.6;
    font-size: 13px;
  }
  .tips :global(b) {
    color: var(--text);
    font-weight: 500;
  }
  .chip {
    flex: none;
    padding: 2px 8px;
    border-radius: 6px;
    background: var(--surface-2);
    font-size: 11.5px;
    color: var(--text-dim);
    white-space: nowrap;
  }
  .chip.good {
    color: var(--good);
  }
  .chip.r-common {
    color: var(--good);
  }
  .chip.r-uncommon {
    color: var(--uncommon);
  }
  .chip.r-rare {
    color: var(--rare);
  }
  .note {
    margin: 8px 0 0;
    font-size: 11.5px;
    color: var(--text-faint);
  }
  .planets {
    display: flex;
    flex-wrap: wrap;
    gap: 6px;
  }
  .planet {
    display: inline-flex;
    align-items: baseline;
    gap: 7px;
    padding: 6px 12px;
    border-radius: 10px;
    background: var(--surface);
    font-size: 12px;
    color: var(--text-dim);
  }
  .planet b {
    font-size: 13.5px;
    font-weight: 500;
    color: var(--text);
  }
  .planet.r-common {
    box-shadow: inset 2px 0 0 var(--good);
  }
  .planet.r-uncommon {
    box-shadow: inset 2px 0 0 var(--uncommon);
  }
  .planet.r-rare {
    box-shadow: inset 2px 0 0 var(--rare);
  }
  .where {
    padding: 12px 14px;
    border-radius: 10px;
    background: var(--surface);
    box-shadow: inset 2px 0 0 var(--accent);
    line-height: 1.5;
  }
  .uses {
    display: flex;
    flex-wrap: wrap;
    gap: 6px;
  }
  .uses button {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    padding: 4px 10px 4px 4px;
    border-radius: 8px;
    background: var(--surface);
    font-size: 12.5px;
  }
  .uses button:hover {
    background: var(--surface-2);
  }
  .uses img {
    width: 24px;
    height: 24px;
    object-fit: contain;
  }
  .uses i {
    font-style: normal;
    color: var(--text-faint);
  }
</style>
