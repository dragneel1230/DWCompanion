<script lang="ts">
  // Baro Ki'Teer's stock while he is at a relay (worldState manifest). Left: the list, grouped by kind
  // (or sorted by platinum / ducats / resale value); mods drawn in their game frames. Right: the picked
  // item — big card or icon, what it is, Baro's price against the market, mastery it still gives
  // (public profile), stats of a mod, live warframe.market orders with whispers.
  import { labels, num, t, type Key } from "$lib/i18n/index.svelte";
  import { getDb, iconUrl } from "$lib/db";
  import { left } from "$lib/cycles";
  import { baroItems, type BaroItem, type BaroKind } from "$lib/baro";
  import { prices } from "$lib/prices.svelte";
  import { profile } from "$lib/profile.svelte";
  import { owned } from "$lib/owned.svelte";
  import { CAT_RU, loadMastery, perRank, rankOf, type MasteryDb } from "$lib/mastery";
  import { loadFrames, loadOtherMods, RARITY_RU as MOD_RARITY_RU, type FramesDb, type Mod } from "$lib/frames";
  import { loadCraft, type CraftDb } from "$lib/craft";
  import ModCard from "$lib/components/ModCard.svelte";
  import Cur from "$lib/components/Cur.svelte";
  import Plat from "$lib/components/Plat.svelte";
  import MarketPanel from "$lib/components/MarketPanel.svelte";
  import type { TradeItem } from "$lib/whisper";
  import type { View } from "./hub";
  import { world } from "./worldData.svelte";

  let { now, onopen, onback }: { now: number; onopen: (v: View) => void; onback: () => void } = $props();

  const db = getDb();
  const baro = $derived(world.timers?.baro ?? null);
  const here = $derived(!!baro && now >= baro.from && now < baro.to);

  let items = $state<BaroItem[] | null>(null);
  let error = $state("");
  $effect(() => {
    const offers = baro?.items;
    if (!offers?.length) return;
    baroItems(offers)
      .then((list) => {
        items = list;
        prices.want(list.map((i) => i.slug));
      })
      .catch((e) => (error = String(e)));
  });

  profile.start();
  let mdb = $state<MasteryDb | null>(null);
  loadMastery().then((m) => (mdb = m)).catch(() => {});
  let frames = $state<FramesDb | null>(null);
  loadFrames().then((f) => (frames = f)).catch(() => {});
  let other = $state<Record<string, Mod> | null>(null);
  loadOtherMods().then((m) => (other = m)).catch(() => {});
  let craft = $state<CraftDb | null>(null);
  loadCraft().then((c) => (craft = c)).catch(() => {});

  const modOf = (i: BaroItem): Mod | undefined => (i.kind === "m" ? (frames?.mods[i.id] ?? other?.[i.id]) : undefined);

  type Group = "m" | "w" | "c" | "o";
  type Sort = "kind" | "plat" | "ducats" | "value";
  let filter = $state<Group | "all">("all");
  let sort = $state<Sort>("kind");
  let picked = $state<string | null>(null);
  // Orders are fetched only on request: browsing the list must not fire a warframe.market request per click.
  let orders = $state<string | null>(null);

  const GROUPS: Group[] = ["m", "w", "c", "o"];
  const GROUP_LABEL = labels<Group>({ m: "baro.kind.m", w: "baro.kind.w", c: "baro.kind.c", o: "baro.kind.o" });
  const SORTS: { id: Sort; label: Key; hint: Key }[] = [
    { id: "kind", label: "baro.sort.kind", hint: "baro.sort.kindHint" },
    { id: "plat", label: "baro.sort.plat", hint: "baro.sort.platHint" },
    { id: "ducats", label: "baro.sort.ducats", hint: "baro.sort.ducatsHint" },
    { id: "value", label: "baro.sort.value", hint: "baro.sort.valueHint" },
  ];
  const group = (k: BaroKind): Group => (k === "m" || k === "w" || k === "c" ? k : "o");
  const KIND_LABEL = labels<BaroKind>({ m: "baro.tag.m", w: "baro.tag.w", c: "baro.tag.c", d: "baro.tag.d", o: "baro.tag.o", r: "baro.tag.r" });
  const MOD_CAT = labels({
    PRIMARY: "baro.modCat.primary",
    SECONDARY: "baro.modCat.secondary",
    MELEE: "baro.modCat.melee",
    STANCE: "baro.modCat.stance",
    "ARCH-GUN": "baro.modCat.archgun",
    "ARCH-MELEE": "baro.modCat.archmelee",
    ARCHWING: "baro.modCat.archwing",
    SENTINEL: "baro.modCat.sentinel",
    KUBROW: "baro.modCat.kubrow",
    KAVAT: "baro.modCat.kavat",
    PARAZON: "baro.modCat.parazon",
  });

  const plat = (i: BaroItem) => (i.slug ? prices.sell[i.slug] : null);
  // Resale: platinum per 100 ducats spent at Baro.
  const value = (i: BaroItem) => {
    const p = plat(i);
    return p && i.ducats ? (p / i.ducats) * 100 : 0;
  };

  // Mastery a weapon still gives; null when it isn't a mastery item or the profile is unknown.
  function mastery(i: BaroItem): { left: number; gives: number; rank: number; max: number; mr?: number } | null {
    const it = mdb?.items[i.id];
    if (!it) return null;
    const gives = it.max * perRank(it.fl);
    if (!profile.data) return { left: gives, gives, rank: -1, max: it.max, mr: it.mr };
    const rank = rankOf(profile.data.xp[i.id] ?? 0, it.fl, it.max);
    return { left: gives - rank * perRank(it.fl), gives, rank, max: it.max, mr: it.mr };
  }
  const needsMastery = (i: BaroItem) => {
    const m = i.kind === "w" ? mastery(i) : null;
    return !!m && !!profile.data && m.left > 0;
  };

  const counts = $derived.by(() => {
    const c: Record<Group, number> = { m: 0, w: 0, c: 0, o: 0 };
    for (const i of items ?? []) c[group(i.kind)]++;
    return c;
  });

  const shown = $derived.by(() => {
    const list = (items ?? []).filter((i) => filter === "all" || group(i.kind) === filter);
    const key =
      sort === "plat" ? (i: BaroItem) => plat(i) ?? -1 : sort === "ducats" ? (i: BaroItem) => i.ducats : sort === "value" ? value : (i: BaroItem) => plat(i) ?? -1;
    return list.sort((a, b) => key(b) - key(a) || b.ducats - a.ducats);
  });
  // Sections when grouped by kind; one unnamed section otherwise.
  const sections = $derived(
    sort === "kind"
      ? GROUPS.map((g) => ({ g: g as Group | null, list: shown.filter((i) => group(i.kind) === g) })).filter((s) => s.list.length)
      : [{ g: null, list: shown }],
  );

  const sel = $derived(items?.find((i) => i.type === picked) ?? sections[0]?.list[0] ?? null);

  // Totals and hints for the header.
  const total = $derived((items ?? []).reduce((s, i) => ((s.ducats += i.ducats), (s.credits += i.credits), s), { ducats: 0, credits: 0 }));
  const toMaster = $derived((items ?? []).filter(needsMastery));
  const bestValue = $derived(
    (items ?? [])
      .filter((i) => value(i) > 0)
      .sort((a, b) => value(b) - value(a))
      .slice(0, 2),
  );

  // What the detail panel can show for it.
  function target(i: BaroItem): View | null {
    if (i.relic) return { kind: "relic", id: i.relic };
    if (i.kind === "m" && modOf(i)) return { kind: "mod", id: i.id };
    if (craft?.items[i.id]) return { kind: "craft", id: i.id };
    return null;
  }

  // Names for the market whisper: warframe.market's English name and the Russian one.
  function trade(i: BaroItem): TradeItem {
    const mod = modOf(i);
    if (mod) return { en: mod.mname ?? mod.en, ru: mod.ru };
    if (i.relic) {
      const r = db.relics[i.relic];
      return { en: r.mname ?? r.en, ru: r.ru };
    }
    const m = mdb?.items[i.id];
    if (m) return { en: m.en, ru: m.ru };
    return { en: i.name, ru: i.name };
  }

  const title = (i: BaroItem) => (i.bp ? t("baro.blueprint", { name: i.name }) : i.name);
  function subtitle(i: BaroItem): string {
    const mod = modOf(i);
    if (mod) return [t("tag.mod"), mod.cat ? MOD_CAT[mod.cat as keyof typeof MOD_CAT] : "", MOD_RARITY_RU[mod.rarity]].filter(Boolean).join(" · ");
    const m = mdb?.items[i.id];
    if (m) return `${KIND_LABEL[i.kind]} · ${CAT_RU[m.cat]}`;
    return KIND_LABEL[i.kind];
  }
  const fmtValue = (n: number) => (n ? num(n, 1) : "—");
</script>

<section class="panel baro">
  <header>
    <button class="back" onclick={onback}>
      <svg viewBox="0 0 24 24"><path d="M15 5l-7 7 7 7" /></svg>
      {t("common.back")}
    </button>
    <div class="title">
      <h1>{t("world.baro")}</h1>
      {#if baro}
        <span>{here ? t("world.baroHere", { relay: baro.relay, left: left(baro.to - now) }) : t("world.baroComing", { relay: baro.relay, left: left(baro.from - now) })}</span>
      {/if}
    </div>
    {#if items}
      <div class="totals">
        <span>{t("baro.total", { n: items.length })}</span>
        <Cur kind="ducats" value={num(total.ducats)} />
        <span class="cr">{t("baro.credits", { n: num(total.credits) })}</span>
      </div>
    {/if}
  </header>

  {#if here && baro && baro.to > baro.from}
    <div class="time"><div style:width="{Math.min(1, (now - baro.from) / (baro.to - baro.from)) * 100}%"></div></div>
  {/if}

  {#if !here || !baro?.items?.length}
    <div class="body"><div class="empty"><span>{t("baro.notHere")}</span></div></div>
  {:else if error}
    <div class="body"><div class="empty"><span>{error}</span></div></div>
  {:else if !items}
    <div class="body"><div class="empty"><span>{t("baro.loading")}</span></div></div>
  {:else}
    {#if toMaster.length || bestValue.length}
      <div class="hints">
        {#each toMaster as i (i.type)}
          <button class="hint mr" onclick={() => (picked = i.type)}>
            <b>{t("baro.hint.mastery")}</b>{i.name}<span>{t("baro.mastery", { xp: num(mastery(i)?.left ?? 0) })}</span>
          </button>
        {/each}
        {#each bestValue as i (i.type)}
          <button class="hint val" onclick={() => (picked = i.type)}>
            <b>{t("baro.hint.value")}</b>{i.name}<span>{t("baro.perHundred", { v: fmtValue(value(i)) })}</span>
          </button>
        {/each}
      </div>
    {/if}

    <div class="tools">
      <div class="seg">
        <button class:on={filter === "all"} onclick={() => (filter = "all")}>{t("baro.kind.all")} <i>{items.length}</i></button>
        {#each GROUPS as g}
          {#if counts[g]}
            <button class:on={filter === g} onclick={() => (filter = g)}>{GROUP_LABEL[g]} <i>{counts[g]}</i></button>
          {/if}
        {/each}
      </div>
      <div class="seg">
        {#each SORTS as s}
          <button class:on={sort === s.id} title={t(s.hint)} onclick={() => (sort = s.id)}>{t(s.label)}</button>
        {/each}
      </div>
    </div>

    <div class="split">
      <div class="list">
        <div class="cols">
          <span></span><span>{t("baro.col.item")}</span><span class="r">{t("baro.col.ducats")}</span><span class="r">{t("baro.col.plat")}</span><span class="r" title={t("baro.col.valueHint")}>{t("baro.col.value")}</span>
        </div>
        {#each sections as s (s.g ?? "all")}
          {#if s.g}<h3>{GROUP_LABEL[s.g]} <i>{s.list.length}</i></h3>{/if}
          {#each s.list as i (i.type)}
            {@const mod = modOf(i)}
            {@const m = i.kind === "w" ? mastery(i) : null}
            {@const p = plat(i)}
            <button class="line" class:on={sel?.type === i.type} onclick={() => (picked = i.type)}>
              <span class="thumb" class:modthumb={!!mod}>
                {#if mod}
                  <ModCard {mod} scale={0.3} bare />
                {:else if i.icon}
                  <img src={iconUrl(i.icon)} alt="" loading="lazy" />
                {/if}
              </span>
              <span class="name">
                <b>{title(i)}</b>
                <span class="tags">
                  <i>{subtitle(i)}</i>
                  {#if m && profile.data}
                    {#if m.left > 0}<i class="good">{t("baro.mastery", { xp: num(m.left) })}</i>{:else}<i>{t("baro.mastered")}</i>{/if}
                  {/if}
                  {#if mod && owned.has(i.id)}<i class="own">{t("baro.owned")}</i>{/if}
                </span>
              </span>
              <span class="r"><Cur kind="ducats" value={i.ducats} /></span>
              <span class="r">
                {#if p}<Cur kind="plat" value={p} />{:else if i.slug && p === undefined}<span class="dim">…</span>{:else}<span class="dim" title={t("baro.notTradable")}>—</span>{/if}
              </span>
              <span class="r val" class:good={value(i) >= 8}>{fmtValue(value(i))}</span>
            </button>
          {/each}
        {/each}
      </div>

      {#if sel}
        {@const mod = modOf(sel)}
        {@const m = sel.kind === "w" ? mastery(sel) : null}
        {@const to = target(sel)}
        <aside class="side">
          {#key sel.type}
            <div class="hero">
              {#if mod}
                <ModCard {mod} scale={0.8} bare />
              {:else if sel.icon}
                <img src={iconUrl(sel.icon)} alt="" />
              {/if}
            </div>
            <h2>{title(sel)}</h2>
            <div class="sub">{subtitle(sel)}</div>

            <div class="prices">
              <div>
                <small>{t("baro.atBaro")}</small>
                <b><Cur kind="ducats" value={sel.ducats} size={18} /></b>
                <span class="cr">{t("baro.credits", { n: num(sel.credits) })}</span>
              </div>
              <div>
                <small>{t("baro.onMarket")}</small>
                {#if sel.slug}
                  <b><Plat slug={sel.slug} size={18} live /></b>
                  {#if value(sel)}<span class="cr">{t("baro.perHundred", { v: fmtValue(value(sel)) })}</span>{/if}
                {:else}
                  <span class="dim">{t("baro.notTradable")}</span>
                {/if}
              </div>
            </div>

            {#if m}
              <div class="note" class:good={!!profile.data && m.left > 0}>
                {#if !profile.data}
                  {t("baro.gives", { xp: num(m.gives) })}
                {:else if m.left === m.gives}
                  {t("baro.notMastered", { xp: num(m.gives) })}
                {:else if m.left > 0}
                  {t("baro.partly", { rank: m.rank, max: m.max, xp: num(m.left) })}
                {:else}
                  {t("baro.masteredFull")}
                {/if}
                {#if m.mr}<span>{t("baro.mr", { mr: m.mr })}</span>{/if}
              </div>
            {/if}
            {#if mod}
              {#if owned.has(sel.id)}<div class="note">{t("baro.ownedFull")}</div>{/if}
              <p class="stats">{mod.stats}</p>
              <div class="sub">{t("baro.modRanks", { n: mod.max })}</div>
            {/if}

            {#if to}
              <button class="more" onclick={() => onopen(to)}>{t("baro.details")}</button>
            {/if}

            {#if sel.slug}
              {#if orders === sel.type}
                <div class="market"><MarketPanel slug={sel.slug} item={trade(sel)} maxRank={mod?.max ?? 0} unranked /></div>
              {:else}
                <button class="more ghost" onclick={() => (orders = sel.type)}>{t("baro.orders")}</button>
              {/if}
            {/if}
          {/key}
        </aside>
      {/if}
    </div>
    <p class="foot">{t("baro.foot")}</p>
  {/if}
</section>

<style>
  .baro {
    height: 100%;
  }
  .back {
    display: flex;
    align-items: center;
    gap: 6px;
    padding: 6px 12px;
    border-radius: 10px;
    font-size: 13px;
    color: var(--text-dim);
  }
  .back:hover {
    background: var(--surface-2);
    color: var(--text);
  }
  .back svg {
    width: 16px;
    height: 16px;
    fill: none;
    stroke: currentColor;
    stroke-width: 2;
    stroke-linecap: round;
    stroke-linejoin: round;
  }
  .title {
    flex: 1;
    min-width: 200px;
    display: flex;
    flex-direction: column;
  }
  .title h1 {
    margin: 0;
    font-size: 18px;
    font-weight: 600;
    color: var(--accent);
  }
  .title span {
    font-size: 12.5px;
    color: var(--text-dim);
  }
  .totals {
    display: flex;
    align-items: center;
    gap: 14px;
    font-size: 13px;
    color: var(--text-dim);
  }
  .time {
    height: 2px;
    margin: 0 18px 8px;
    background: var(--surface-2);
    border-radius: 2px;
    overflow: hidden;
  }
  .time div {
    height: 100%;
    background: var(--accent);
    opacity: 0.6;
  }

  .hints {
    display: flex;
    flex-wrap: wrap;
    gap: 8px;
    padding: 0 18px 10px;
  }
  .hint {
    display: flex;
    align-items: baseline;
    gap: 8px;
    padding: 6px 12px;
    border-radius: 10px;
    background: var(--surface);
    border: 1px solid var(--glass-line);
    font-size: 13px;
    color: var(--text);
  }
  .hint:hover {
    background: var(--surface-2);
  }
  .hint b {
    font-size: 10.5px;
    font-weight: 600;
    letter-spacing: 0.08em;
    text-transform: uppercase;
  }
  .hint span {
    font-size: 12px;
    color: var(--text-dim);
  }
  .hint.mr b {
    color: #8fc8ff;
  }
  .hint.val b {
    color: var(--accent);
  }

  .tools {
    display: flex;
    flex-wrap: wrap;
    justify-content: space-between;
    gap: 10px;
    padding: 0 18px 10px;
  }
  .seg i {
    font-style: normal;
    font-size: 11px;
    color: var(--text-faint);
  }

  .split {
    flex: 1;
    min-height: 0;
    display: grid;
    grid-template-columns: minmax(0, 1fr) 400px;
    gap: 14px;
    padding: 0 12px 0 12px;
  }
  .list {
    min-height: 0;
    overflow-y: auto;
    padding-bottom: 12px;
  }
  .cols,
  .line {
    display: grid;
    grid-template-columns: 88px minmax(0, 1fr) 76px 76px 64px;
    align-items: center;
    gap: 12px;
  }
  .cols {
    position: sticky;
    top: 0;
    z-index: 1;
    padding: 4px 12px 6px;
    font-size: 11px;
    letter-spacing: 0.08em;
    text-transform: uppercase;
    color: var(--text-faint);
    background: var(--glass);
  }
  h3 {
    margin: 14px 12px 4px;
    font-size: 12px;
    font-weight: 600;
    letter-spacing: 0.12em;
    text-transform: uppercase;
    color: var(--text-dim);
  }
  h3 i {
    font-style: normal;
    color: var(--text-faint);
  }
  .line {
    width: 100%;
    min-height: 52px;
    padding: 4px 12px;
    border-radius: 10px;
    text-align: left;
    color: inherit;
    background: transparent;
    border: 1px solid transparent;
  }
  .line:hover {
    background: var(--surface-2);
  }
  .line.on {
    background: var(--surface-2);
    border-color: rgba(201, 166, 107, 0.35);
  }
  .thumb {
    display: flex;
    justify-content: center;
    align-items: center;
  }
  .thumb img {
    width: 44px;
    height: 44px;
    object-fit: contain;
  }
  .modthumb :global(.slot) {
    pointer-events: none;
  }
  .name {
    min-width: 0;
    display: flex;
    flex-direction: column;
    gap: 2px;
  }
  .name b {
    font-size: 14px;
    font-weight: 500;
    overflow: hidden;
    white-space: nowrap;
    text-overflow: ellipsis;
  }
  .tags {
    display: flex;
    flex-wrap: wrap;
    gap: 2px 10px;
  }
  .tags i {
    font-style: normal;
    font-size: 11.5px;
    color: var(--text-faint);
  }
  .tags i.good {
    color: #8fc8ff;
  }
  .tags i.own {
    color: #5fe07a;
  }
  .r {
    text-align: right;
    font-variant-numeric: tabular-nums;
  }
  .val {
    font-size: 13px;
    color: var(--text-dim);
  }
  .val.good {
    color: var(--accent);
    font-weight: 600;
  }
  .cr {
    font-size: 12px;
    color: var(--text-dim);
  }
  .dim {
    color: var(--text-faint);
  }

  .side {
    min-height: 0;
    overflow-y: auto;
    padding: 14px 16px 16px;
    border-radius: 14px;
    background: var(--surface);
    border: 1px solid var(--glass-line);
    display: flex;
    flex-direction: column;
    gap: 8px;
  }
  .hero {
    display: flex;
    justify-content: center;
    min-height: 120px;
    align-items: center;
  }
  .hero img {
    width: 150px;
    height: 150px;
    object-fit: contain;
  }
  .side h2 {
    margin: 4px 0 0;
    font-size: 18px;
    font-weight: 600;
    line-height: 1.25;
  }
  .sub {
    font-size: 12.5px;
    color: var(--text-faint);
  }
  .prices {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 10px;
    margin-top: 6px;
  }
  .prices > div {
    display: flex;
    flex-direction: column;
    gap: 3px;
    padding: 10px 12px;
    border-radius: 10px;
    background: rgba(255, 255, 255, 0.03);
  }
  .prices small {
    font-size: 10.5px;
    letter-spacing: 0.08em;
    text-transform: uppercase;
    color: var(--text-faint);
  }
  .prices b {
    font-size: 18px;
  }
  .note {
    display: flex;
    flex-wrap: wrap;
    justify-content: space-between;
    gap: 6px;
    padding: 9px 12px;
    border-radius: 10px;
    background: rgba(255, 255, 255, 0.03);
    font-size: 13px;
    color: var(--text-dim);
  }
  .note.good {
    background: rgba(143, 200, 255, 0.08);
    color: #b9dcff;
  }
  .note span {
    color: var(--text-faint);
  }
  .stats {
    margin: 2px 0 0;
    white-space: pre-line;
    font-size: 13.5px;
    line-height: 1.45;
  }
  .more {
    align-self: flex-start;
    padding: 7px 14px;
    border-radius: 10px;
    background: var(--accent-soft);
    color: var(--accent);
    font-size: 13px;
  }
  .more.ghost {
    background: rgba(255, 255, 255, 0.05);
    color: var(--text-dim);
  }
  .more:hover {
    filter: brightness(1.2);
  }
  .market {
    margin-top: 6px;
  }
  .foot {
    margin: 0;
    padding: 8px 20px 12px;
    font-size: 11.5px;
    color: var(--text-faint);
  }
</style>
