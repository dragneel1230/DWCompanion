<script lang="ts">
  // A warframe / weapon / companion / component: how to get it, as steps. The blueprint (market, clan lab,
  // quest, vendor, drop tables or relics), each part with its own source, the resources, the foundry.
  // The full tree (CraftTree) follows.
  import { t, num } from "$lib/i18n/index.svelte";
  import { getDb, iconUrl, RARITY_RU } from "$lib/db";
  import { pct, type DropsDb } from "$lib/drops";
  import { totals, whereShort, buildTime, type CraftDb, type CraftItem } from "$lib/craft";
  import { srcText, relicPart, parentsOf } from "$lib/farm";
  import CraftTree from "$lib/components/CraftTree.svelte";

  let {
    db,
    craft,
    id,
    onopen,
  }: { db: DropsDb; craft: CraftDb; id: string; onopen: (kind: "resource" | "craft" | "prime", id: string) => void } = $props();

  const c = $derived(craft.items[id]);
  const tot = $derived(totals(craft, db, id));
  const isPart = $derived(c.kind === "part");
  const parents = $derived(isPart ? parentsOf(craft, id) : []);
  const wiki = (en: string) => `https://wiki.warframe.com/w/${encodeURIComponent(en.replace(/ /g, "_"))}`;

  // Relics that hold a prime blueprint, active first.
  function relicsOf(itemId: string | undefined) {
    if (!itemId) return [];
    const d = getDb();
    return (d.items[itemId]?.relics ?? [])
      .map((x) => ({ ...x, r: d.relics[x.relic] }))
      .filter((x) => x.r)
      .sort((a, b) => +a.r.vaulted - +b.r.vaulted);
  }
  const mainRelics = $derived(relicsOf(c.bp ?? relicPart(id) ?? undefined));

  // Parts: craftable components and prime weapon parts (relic rewards that are not built).
  const parts = $derived(
    c.parts
      .filter(([pid]) => (craft.items[pid] && craft.items[pid].kind === "part") || getDb().items[pid])
      .map(([pid, n]) => ({ pid, n, cp: craft.items[pid] as CraftItem | undefined, prime: relicPart(pid) })),
  );
  function partHint(p: (typeof parts)[number]): string {
    if (p.prime) {
      const rel = relicsOf(p.prime);
      const live = rel.filter((x) => !x.r.vaulted);
      return live.length ? t("farm.inRelics", { list: live.slice(0, 3).map((x) => x.r.s).join(", "), n: live.length }) : t("farm.vaultedPart");
    }
    const cp = p.cp;
    if (!cp) return "";
    const bits = [...(cp.src ?? []).map(srcText), ...(cp.drops ?? []).slice(0, 2).map(([si, rots]) => `${db.sources[si].name} ${pct(Math.max(...rots.map((x) => x[1])))}`)];
    return bits.length ? bits.join(" · ") : t("farm.unknownSrc");
  }
  const hasBp = $derived(!!(c.src?.length || c.drops?.length || mainRelics.length));
</script>

<div class="howto">
  <div class="howto-title">{t("farm.howTo")}</div>

  <div class="step">
    <span class="n">1</span>
    <div>
      <div class="lead">{isPart ? t("farm.partBp") : t("farm.mainBp")}</div>
      {#if mainRelics.length}
        <div class="main"><b>{t("farm.fromRelics")}</b></div>
        <div class="relics">
          {#each mainRelics.slice(0, 8) as x (x.relic)}
            <a href="/relic?id={encodeURIComponent(x.relic)}" class:vaulted={x.r.vaulted}>{x.r.s} <small>{RARITY_RU[x.rarity]}{x.r.vaulted ? ` · ${t("farm.vaultedShort")}` : ""}</small></a>
          {/each}
        </div>
      {/if}
      {#each c.src ?? [] as s, i (i)}
        <div class="main"><b>{srcText(s)}</b></div>
      {/each}
      {#if c.drops?.length}
        <div class="main"><b>{t("farm.dropsFrom")}</b></div>
        <div class="alts">
          {#each c.drops.slice(0, 4) as [si, rots] (si)}
            <span class="alt">{db.sources[si].name}{#if db.sources[si].sub} · {db.sources[si].sub}{/if} · {pct(Math.max(...rots.map((x) => x[1])))}</span>
          {/each}
        </div>
      {/if}
      {#if !hasBp}
        <p class="why">{t("farm.bpNotInData")} <a href={wiki(c.en)} target="_blank" rel="noreferrer">{t("res.wikiOpen")} ↗</a></p>
      {/if}
    </div>
  </div>

  {#if parts.length}
    <div class="step">
      <span class="n">2</span>
      <div class="grow">
        <div class="lead">{t("farm.partsN", { n: parts.length })}</div>
        <div class="parts">
          {#each parts as p (p.pid)}
            {@const nm = p.cp?.name ?? getDb().items[p.pid]?.name ?? p.pid.split("/").pop()}
            {@const ic = p.cp?.icon ?? getDb().items[p.pid]?.icon ?? null}
            <button onclick={() => (p.prime && !p.cp ? onopen("prime", p.prime) : onopen("craft", p.pid))}>
              {#if ic}<img src={iconUrl(ic)} alt="" loading="lazy" />{/if}
              <span class="pn">{nm.split(": ").pop()}{#if p.n > 1}<i> ×{p.n}</i>{/if}</span>
              <small>{partHint(p)}</small>
            </button>
          {/each}
        </div>
      </div>
    </div>
  {/if}

  {#if tot.resources.length}
    <div class="step">
      <span class="n">{parts.length ? 3 : 2}</span>
      <div class="grow">
        <div class="lead">{t("farm.resN", { n: tot.resources.length })}</div>
        <div class="res">
          {#each tot.resources.slice(0, 6) as [rid, n] (rid)}
            {@const r = db.resources[rid]}
            <button onclick={() => onopen("resource", rid)}>
              <img src={iconUrl(r.icon)} alt="" loading="lazy" />
              <span>{r.name} <i>×{num(n)}</i></span>
              <small>{whereShort(db, rid) || t("ct.unknownSource")}</small>
            </button>
          {/each}
        </div>
        {#if tot.resources.length > 6}<p class="why">{t("farm.resMore", { n: tot.resources.length - 6 })}</p>{/if}
      </div>
    </div>
  {/if}

  <div class="step">
    <span class="n">⚒</span>
    <div>
      <div class="lead">{t("farm.build")}</div>
      <div class="main">
        <b>{t("ct.cr", { v: num(tot.credits) })}</b>
        <span>{buildTime(tot.time)} {t("ct.inFoundry")}{tot.parts.length ? ` ${t("ct.partsBuild")}` : ""}</span>
      </div>
    </div>
  </div>

  {#if parents.length}
    <div class="step">
      <span class="n">↑</span>
      <div>
        <div class="lead">{t("farm.partOf")}</div>
        <div class="main">
          {#each parents as pid (pid)}
            <button class="link" onclick={() => onopen("craft", pid)}>{craft.items[pid].name}</button>
          {/each}
        </div>
      </div>
    </div>
  {/if}
</div>

<div class="section-title">{t("farm.fullTree")}</div>
<CraftTree {craft} drops={db} {id} onresource={(x) => onopen("resource", x)} onpart={(x) => onopen("craft", x)} onitem={(x) => onopen("prime", x)} />

<style>
  .grow {
    flex: 1;
    min-width: 0;
  }
  .relics {
    display: flex;
    flex-wrap: wrap;
    gap: 6px;
    margin-top: 6px;
  }
  .relics a {
    padding: 3px 9px;
    border-radius: 7px;
    background: var(--surface-2);
    font-size: 12.5px;
  }
  .relics a:hover {
    color: var(--accent);
  }
  .relics a.vaulted {
    opacity: 0.55;
  }
  .relics small {
    color: var(--text-faint);
  }
  .parts,
  .res {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(240px, 1fr));
    gap: 6px;
    margin-top: 4px;
  }
  .parts button,
  .res button {
    display: grid;
    grid-template-columns: 30px 1fr;
    grid-template-rows: auto auto;
    column-gap: 9px;
    align-items: center;
    padding: 7px 10px;
    border-radius: 9px;
    background: var(--surface);
    text-align: left;
  }
  .parts button:hover,
  .res button:hover {
    background: var(--surface-2);
  }
  .parts img,
  .res img {
    grid-row: span 2;
    width: 30px;
    height: 30px;
    object-fit: contain;
  }
  .parts span,
  .res span {
    font-size: 13px;
  }
  .parts i,
  .res i {
    font-style: normal;
    color: var(--text-faint);
  }
  .parts small,
  .res small {
    font-size: 11.5px;
    color: var(--text-faint);
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .link {
    color: var(--accent);
    font-size: 14px;
  }
</style>
