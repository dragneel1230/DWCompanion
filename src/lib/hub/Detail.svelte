<script lang="ts">
  // Hub detail panel for a search pick: what it is, where it drops, prices, and the market with
  // "Купить / Продать" whispers. Links inside open the next view in the hub (stack, "Назад").
  import Facts from "$lib/components/Facts.svelte";
  import { t } from "$lib/i18n/index.svelte";
  import { getDb, iconUrl, itemName, RARITY_RU, setParts as uniqueParts } from "$lib/db";
  import type { Price } from "$lib/api";
  import { buildsFor, loadFrames, loadOtherMods, RARITY_RU as MOD_RARITY_RU, type FramesDb, type Mod } from "$lib/frames";
  import Plat from "$lib/components/Plat.svelte";
  import Cur from "$lib/components/Cur.svelte";
  import MarketPanel from "$lib/components/MarketPanel.svelte";
  import ModCard from "$lib/components/ModCard.svelte";
  import ArcaneCard from "$lib/components/ArcaneCard.svelte";
  import DropSources from "$lib/components/DropSources.svelte";
  import WikiFarm from "$lib/components/WikiFarm.svelte";
  import ModWhere from "$lib/goals/ModWhere.svelte";
  import CraftTree from "$lib/components/CraftTree.svelte";
  import { loadCraft, CRAFT_KIND_RU, type CraftDb } from "$lib/craft";
  import { loadDrops, PLANET_RARITY_RU, type DropsDb } from "$lib/drops";
  import type { View } from "./hub";

  let { view, onopen, onback, onapp }: { view: View; onopen: (v: View) => void; onback: () => void; onapp: () => void } =
    $props();

  const db = getDb();
  let frames = $state<FramesDb | null>(null);
  loadFrames().then((f) => (frames = f));
  // Weapon / companion / archwing mods and stances (Baro's stock): own file, only when asked for.
  let otherMods = $state<Record<string, Mod> | null>(null);
  $effect(() => {
    if (view.kind === "mod" && frames && !frames.mods[view.id] && !otherMods) loadOtherMods().then((m) => (otherMods = m)).catch(() => {});
  });
  let drops = $state<DropsDb | null>(null);
  loadDrops().then((d) => (drops = d));
  let craft = $state<CraftDb | null>(null);
  loadCraft().then((c) => (craft = c));

  const ERA_ORDER: Record<string, number> = { Lith: 0, Meso: 1, Neo: 2, Axi: 3, Requiem: 4, Vanguard: 5 };
  const RARITY_ORDER = { RARE: 0, UNCOMMON: 1, COMMON: 2 };

  const item = $derived(view.kind === "item" ? db.items[view.id] : undefined);
  const set = $derived(view.kind === "set" ? db.sets[view.id] : item?.set ? db.sets[item.set] : undefined);
  const relic = $derived(view.kind === "relic" ? db.relics[view.id] : undefined);
  const mod = $derived(view.kind === "mod" ? (frames?.mods[view.id] ?? otherMods?.[view.id]) : undefined);
  const arcane = $derived(view.kind === "arcane" ? frames?.arcanes[view.id] : undefined);
  const frame = $derived(view.kind === "frame" ? frames?.frames[view.id] : undefined);
  const resource = $derived(view.kind === "resource" ? drops?.resources[view.id] : undefined);
  // Crafting: a weapon / companion from the search, or the frame / prime set itself.
  const craftItem = $derived(craft?.items[view.id]);

  const itemRelics = $derived(
    (item?.relics ?? [])
      .map((r) => ({ key: r.relic, rarity: r.rarity, relic: db.relics[r.relic] }))
      .sort(
        (a, b) =>
          Number(a.relic.vaulted) - Number(b.relic.vaulted) ||
          ERA_ORDER[a.relic.era] - ERA_ORDER[b.relic.era] ||
          RARITY_ORDER[a.rarity] - RARITY_ORDER[b.rarity],
      ),
  );
  const activeRelics = $derived(itemRelics.filter((r) => !r.relic.vaulted));
  const vaultedRelics = $derived(itemRelics.filter((r) => r.relic.vaulted));

  const setParts = $derived(
    view.kind === "set" && set
      ? uniqueParts(set).map(({ id: pid, count }) => {
          const it = db.items[pid];
          return { id: pid, count, it, active: it.relics.filter((r) => !db.relics[r.relic].vaulted).length };
        })
      : [],
  );
  const setVaulted = $derived(setParts.length > 0 && setParts.every((p) => p.active === 0));

  // Relic rewards: highlight the most expensive once prices arrive.
  let prices = $state<Record<string, number>>({});
  $effect(() => {
    view.id;
    prices = {};
  });
  const bestReward = $derived.by(() => {
    let top: string | null = null;
    for (const [rid, p] of Object.entries(prices)) if (!top || p > prices[top]) top = rid;
    return top;
  });
  const onprice = (rid: string, p: Price | null) => {
    if (p?.sell != null) prices[rid] = p.sell;
  };

  // Header and market of whatever is shown.
  const head = $derived.by(() => {
    if (view.kind === "set" && set)
      return { name: set.name, en: set.en, icon: set.icon, slug: set.slug, trade: { en: set.mname ?? `${set.en} Set`, ru: `${set.ru}: набор` }, note: t("detail.wholeSet") };
    if (item) return { name: itemName(item), en: item.en, icon: item.icon, slug: item.slug, trade: { en: item.mname ?? item.en, ru: item.main ? `${item.ru}: чертёж` : item.ru }, note: "" };
    if (relic) return { name: relic.name, en: relic.en, icon: relic.icon, slug: relic.slug, trade: { en: relic.mname ?? relic.en, ru: relic.ru }, note: t("detail.relicIntact") };
    const x = mod ?? arcane;
    if (x) return { name: x.name, en: x.en, icon: null, slug: x.slug, trade: { en: x.mname ?? x.en, ru: x.ru }, note: "" };
    if (frame) return { name: frame.name, en: frame.en, icon: frame.icon, slug: undefined, trade: null, note: "" };
    if (resource) return { name: resource.name, en: resource.en, icon: resource.icon, slug: undefined, trade: null, note: "" };
    if (view.kind === "craft" && craftItem)
      return { name: craftItem.name, en: `${craftItem.en} · ${CRAFT_KIND_RU[craftItem.kind]}`, icon: craftItem.icon, slug: undefined, trade: null, note: "" };
    return null;
  });
  const maxRank = $derived(mod?.max ?? arcane?.max ?? 0);
</script>

{#snippet relicRow(r: (typeof itemRelics)[number])}
  <button class="row" onclick={() => onopen({ kind: "relic", id: r.key })}>
    <img src={iconUrl(r.relic.icon)} alt="" loading="lazy" />
    <span class="name">{r.relic.name}</span>
    <span class="rar rarity-{r.rarity}">{RARITY_RU[r.rarity]}</span>
    <span class="num"><Plat slug={r.relic.slug} /></span>
  </button>
{/snippet}

<section class="panel detail">
  <header>
    <button class="back" onclick={onback}>
      <svg viewBox="0 0 24 24"><path d="M15 5l-7 7 7 7" /></svg>
      {t("common.back")}
    </button>
    <button class="app" onclick={onapp} title={t("detail.openInAppHint")}>
      {t("detail.openInApp")}
      <svg viewBox="0 0 24 24"><path d="M9 5h10v10M19 5 6 18" /></svg>
    </button>
  </header>

  {#if head}
    <div class="body">
      <div class="hero">
        {#if mod}
          <ModCard {mod} scale={0.42} bare />
        {:else if arcane}
          <ArcaneCard {arcane} scale={0.26} bare />
        {:else if head.icon}
          <img class="icon" src={iconUrl(head.icon)} alt="" />
        {/if}
        <div class="title">
          <h1>{head.name}</h1>
          <div class="sub">
            <span>{head.en}</span>
            {#if item && set}
              <button class="tag" onclick={() => onopen({ kind: "set", id: item.set ?? "" })}>{t("detail.setOf", { name: set.name })}</button>
            {/if}
            {#if relic}
              <span class="tag {relic.vaulted ? 'vaulted' : 'active'}">{relic.vaulted ? t("tag.inVault") : t("tag.dropsNow")}</span>
            {/if}
            {#if view.kind === "set"}
              <span class="tag {setVaulted ? 'vaulted' : 'active'}">{setVaulted ? t("tag.inVault") : t("tag.dropsNow")}</span>
            {/if}
            {#if mod || arcane}
              <span class="tag">{mod ? t("tag.mod") : t("tag.arcane")} · {MOD_RARITY_RU[(mod ?? arcane)!.rarity]}</span>
            {/if}
            {#if view.kind !== "baro" && view.kind !== "time"}<Facts kind={view.kind} id={view.id} price={false} />{/if}
          </div>
        </div>
        <div class="price">
          {#if head.slug}
            <div class="big"><Plat slug={head.slug} size={24} /></div>
            {#if item?.ducats}<div><Cur kind="ducats" value={item.ducats} size={16} /></div>{/if}
            {#if head.note}<div class="note">{head.note}</div>{/if}
          {/if}
        </div>
      </div>

      <div class="cols" class:single={!head.slug}>
        <div class="info">
          {#if item}
            <div class="section-title">{t("detail.dropsNow")} · {activeRelics.length}</div>
            {#if activeRelics.length}
              <div class="rows">{#each activeRelics as r (r.key)}{@render relicRow(r)}{/each}</div>
            {:else}
              <p class="muted">{t("detail.noActive")}</p>
            {/if}
            {#if vaultedRelics.length}
              <div class="section-title">{t("detail.vaulted")} · {vaultedRelics.length}</div>
              <div class="rows dim">{#each vaultedRelics as r (r.key)}{@render relicRow(r)}{/each}</div>
            {/if}
          {:else if view.kind === "set" && set}
            <div class="section-title">{t("detail.parts")}</div>
            <div class="rows">
              {#each setParts as p (p.id)}
                <button class="row" onclick={() => onopen({ kind: "item", id: p.id })}>
                  <img src={iconUrl(p.it.icon)} alt="" loading="lazy" />
                  <span class="name">
                    {p.count > 1 ? `${p.count} × ` : ""}{itemName(p.it)}
                    <small>{p.active ? t("detail.inActive", { n: p.active }) : t("detail.onlyVault")}</small>
                  </span>
                  <span class="num">{#if p.it.ducats}<Cur kind="ducats" value={p.it.ducats} />{/if}</span>
                  <span class="num"><Plat slug={p.it.slug} /></span>
                </button>
              {/each}
            </div>
          {:else if relic}
            <div class="section-title">{t("detail.rewards")}</div>
            <div class="rows">
              {#each relic.rewards as rw (rw.id)}
                {@const it = db.items[rw.id]}
                <button class="row" class:best={bestReward === rw.id} onclick={() => onopen({ kind: "item", id: rw.id })}>
                  <img src={iconUrl(it.icon)} alt="" loading="lazy" />
                  <span class="name">
                    {rw.count > 1 ? `${rw.count} × ` : ""}{itemName(it)}
                    <small class="rarity-{rw.rarity}">{RARITY_RU[rw.rarity]}</small>
                  </span>
                  <span class="num">{#if it.ducats}<Cur kind="ducats" value={it.ducats} />{/if}</span>
                  <span class="num"><Plat slug={it.slug} onprice={(p) => onprice(rw.id, p)} /></span>
                </button>
              {/each}
            </div>
            <div class="section-title">{t("detail.where")}</div>
            {#if relic.vaulted}
              <p class="muted">{t("detail.vaultedHint")}</p>
            {:else if drops}
              <DropSources db={drops} drops={drops.relics[view.id]} limit={4} />
            {/if}
          {:else if mod || arcane}
            <div class="section-title">{t("detail.maxRank")}</div>
            <p class="stats">{(mod ?? arcane)!.stats}</p>
            <div class="section-title">{t("goal.mod.where")}</div>
            <ModWhere id={view.id} en={(mod ?? arcane)!.en} {drops} limit={6} />
          {:else if resource && drops}
            {#if resource.desc}<p class="stats">{resource.desc}</p>{/if}
            {#if resource.planets}
              <div class="section-title">{t("detail.planets")}</div>
              <p class="stats">{resource.planets.map(([p, r]) => `${p} (${PLANET_RARITY_RU[r] ?? r})`).join(" · ")}</p>
            {/if}
            <WikiFarm db={drops} res={resource} />
            {#if resource.where}
              <div class="section-title">{t("detail.whereFind")}</div>
              <p class="stats">{resource.where}</p>
            {/if}
            <DropSources db={drops} drops={resource.drops} limit={5} best={!resource.planets && !resource.farm} empty={resource.where || resource.planets ? null : undefined} />
          {:else if frame}
            <p class="stats">{frame.desc}</p>
            <div class="facts">
              <span><small>{t("stat.health")}</small>{frame.r30.health}</span>
              <span><small>{t("stat.shield")}</small>{frame.r30.shield}</span>
              <span><small>{t("stat.armor")}</small>{frame.r30.armor}</span>
              <span><small>{t("stat.energy")}</small>{frame.r30.energy}</span>
            </div>
            {#if frame.passive}<p class="stats"><b>{t("frame.passive")}</b> {frame.passive}</p>{/if}
            <div class="section-title">{t("detail.abilities")}</div>
            <div class="abilities">
              {#each frame.abilities as a, i (i)}
                <div class="ability">
                  {#if a.icon}<img src={iconUrl(a.icon)} alt="" />{/if}
                  <div><b>{a.name}</b><span>{a.desc}</span></div>
                </div>
              {/each}
            </div>
            {@const builds = frames ? buildsFor(frames, view.id).slice(0, 6) : []}
            {#if builds.length}
              <div class="section-title">{t("frame.builds")}</div>
              <div class="rows">
                {#each builds as [bid, b] (bid)}
                  <a class="row build" href="/frames?id={encodeURIComponent(view.id)}&build={encodeURIComponent(bid)}">
                    <span class="name">{b.title}<small>{b.author}</small></span>
                    {#if b.votes}<span class="num">♥ {b.votes}</span>{/if}
                    <span class="go">→</span>
                  </a>
                {/each}
              </div>
            {/if}
          {/if}
          {#if craftItem && craft && drops && (view.kind === "craft" || view.kind === "frame" || view.kind === "set")}
            {#if view.kind !== "craft"}<div class="section-title craft-title">{t("kind.craft")}</div>{/if}
            <CraftTree
              {craft}
              {drops}
              id={view.id}
              onresource={(id) => onopen({ kind: "resource", id })}
              onpart={(id) => onopen({ kind: "craft", id })}
              onitem={(id) => onopen({ kind: "item", id })}
            />
          {/if}
        </div>

        {#if head.slug && head.trade}
          <div class="market">
            {#key head.slug}
              <MarketPanel slug={head.slug} item={head.trade} {maxRank} />
            {/key}
          </div>
        {/if}
      </div>
    </div>
  {:else}
    <div class="body"><div class="empty"><span>{t("common.loading")}</span></div></div>
  {/if}
</section>

<style>
  .craft-title {
    margin-top: 22px;
  }
  .detail {
    height: 100%;
  }
  header {
    justify-content: space-between;
  }
  header button {
    display: flex;
    align-items: center;
    gap: 6px;
    padding: 6px 12px;
    border-radius: 10px;
    font-size: 13px;
    color: var(--text-dim);
  }
  header button:hover {
    background: var(--surface-2);
    color: var(--text);
  }
  header svg {
    width: 16px;
    height: 16px;
    fill: none;
    stroke: currentColor;
    stroke-width: 2;
    stroke-linecap: round;
    stroke-linejoin: round;
  }
  .body {
    padding: 4px 26px 22px;
  }
  .hero {
    display: flex;
    align-items: center;
    gap: 20px;
    padding-bottom: 6px;
  }
  .icon {
    width: 88px;
    height: 88px;
    object-fit: contain;
    flex: none;
  }
  .title {
    min-width: 0;
  }
  h1 {
    margin: 0 0 6px;
    font-size: 26px;
    font-weight: 600;
  }
  .sub {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 8px;
    color: var(--text-dim);
  }
  button.tag:hover {
    color: var(--text);
    border-color: var(--accent);
  }
  .price {
    margin-left: auto;
    text-align: right;
    display: flex;
    flex-direction: column;
    align-items: flex-end;
    gap: 4px;
  }
  .big {
    font-size: 24px;
    font-weight: 600;
  }
  .note {
    font-size: 12px;
    color: var(--text-faint);
  }
  .cols {
    display: grid;
    grid-template-columns: minmax(0, 1fr) minmax(0, 1.15fr);
    gap: 28px;
  }
  .cols.single {
    grid-template-columns: minmax(0, 720px);
  }
  .rows .rar {
    width: 86px;
    font-size: 12px;
  }
  .dim {
    opacity: 0.65;
  }
  .stats {
    margin: 0 0 12px;
    font-size: 14px;
    line-height: 1.55;
    color: var(--text-dim);
    white-space: pre-line;
  }
  .facts {
    display: flex;
    gap: 22px;
    margin: 6px 0 16px;
  }
  .facts span {
    display: flex;
    flex-direction: column;
    font-size: 18px;
    font-weight: 600;
  }
  .facts small {
    font-size: 11px;
    font-weight: 400;
    color: var(--text-faint);
    text-transform: uppercase;
    letter-spacing: 0.08em;
  }
  .abilities {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(320px, 1fr));
    gap: 8px 18px;
  }
  .ability {
    display: flex;
    gap: 10px;
    align-items: flex-start;
  }
  .ability img {
    width: 34px;
    height: 34px;
    flex: none;
    object-fit: contain;
    filter: brightness(1.2);
  }
  .ability b {
    display: block;
    font-size: 13.5px;
    font-weight: 500;
  }
  .ability span {
    font-size: 12px;
    line-height: 1.45;
    color: var(--text-dim);
  }
  .build {
    color: inherit;
  }
  .build .name {
    flex: 1;
    min-width: 0;
  }
  .build small {
    display: block;
    font-size: 11.5px;
    color: var(--text-faint);
  }
  .build .go {
    color: var(--text-faint);
  }
</style>
