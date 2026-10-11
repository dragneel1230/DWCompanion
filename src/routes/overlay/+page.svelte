<script lang="ts">
  // Overlay window content (transparent, click-through, over the game). Rust shows the window when
  // the card names are read (event "reward-scan"); we hide it after the reward countdown.
  // Look: in the spirit of the game's own UI — dark glass, thin gold lines, corner brackets.
  import { labels, t } from "$lib/i18n/index.svelte";
  import { onDestroy } from "svelte";
  import { invoke } from "@tauri-apps/api/core";
  import { listen, type UnlistenFn } from "@tauri-apps/api/event";
  import { getPrice, cachedPrice, loadBulk, bulkSell, type Price } from "$lib/api";
  import { getDb, itemName, type Item, type Rarity } from "$lib/db";
  import { matchCard, relicKey, squadRewards, type Candidate, type Match } from "$lib/rewards";
  import { client } from "$lib/clientLang.svelte";
  import { readOverlaySettings, type Priority } from "$lib/overlaySettings.svelte";
  import { collNeed, loadCollCtx, partInfo, type CollMode, type CollNeed, type PartInfo } from "$lib/collection/need";
  import KioskLayer from "$lib/components/KioskLayer.svelte";
  import { needs, neededBy } from "$lib/goals/watch.svelte";

  type Card = { x: number; y: number; w: number; h: number; texts: string[] };
  type Scan = { cards: Card[]; screen_w: number; screen_h: number; scale: number; ms: number; relics: string[]; lang?: string };
  // need: goals (guide tab) that still wait for this reward; coll: a set it's missing from ("collection" priority).
  type Shown = {
    card: Card;
    match: Match | null;
    price: Price | null;
    vaulted: boolean;
    rarity: Rarity | null;
    need: string[];
    coll: CollNeed | null;
    info: PartInfo | null; // its set, how much of it is held, the item's state
    forma: boolean; // the Forma blueprint
  };

  const FORMA = "/Lotus/Types/Recipes/Components/FormaBlueprint";
  // "Junk": nothing on offer sells for more than this (platinum, the day's price) and nothing is wanted by a goal or
  // a set: then a Forma blueprint is the better pick (one Forma costs more than that in the market's bundles).
  const JUNK = 5;

  document.documentElement.style.background = "transparent";
  document.body.style.background = "transparent";

  let relics = $state<string[]>([]);
  let scan = $state<Scan | null>(null);
  let shown = $state<Shown[]>([]);
  let priority = $state<Priority>("platinum");
  let collMode = $state<CollMode>("sell");
  let hideTimer: ReturnType<typeof setTimeout> | undefined;
  const dpr = window.devicePixelRatio || 1;

  // Prices of the squad's possible rewards are fetched ahead, so the reward screen needs no network.
  function prefetch(pool: Candidate[]) {
    for (const c of pool) if (c.item.slug && !cachedPrice(c.item.slug)) getPrice(c.item.slug).catch(() => {});
  }

  // Live price if already fetched, else the day's average from the bulk file (no waiting), else nothing.
  function quickPrice(slug: string): Price | null {
    const live = cachedPrice(slug);
    if (live) return live;
    const b = bulkSell(slug);
    return b != null ? { sell: b, buy: null, sellers: 0, at: Date.now() } : null;
  }

  const vaultedItem = (id: string) => {
    const db = getDb();
    const it = db.items[id];
    return !!it?.relics.length && it.relics.every((r) => db.relics[r.relic]?.vaulted);
  };

  // Drop rarity: from the squad's relics when known, else from any relic that has the item.
  function rarityOf(id: string, squad: string[]): Rarity | null {
    const db = getDb();
    for (const p of squad) {
      const rw = db.relics[relicKey(p) ?? ""]?.rewards.find((r) => r.id === id);
      if (rw) return rw.rarity;
    }
    return db.items[id]?.relics[0]?.rarity ?? null;
  }

  async function show(s: Scan) {
    await loadBulk();
    readSettings(); // may have changed in the main window
    needs.refresh();
    // Inventory / profile as of now (the main window refreshes them after missions).
    const ctx = await loadCollCtx().catch(() => null);
    const coll = priority === "collection" ? ctx : null;
    const squad = s.relics.length ? s.relics : relics;
    const lang = s.lang ?? client.lang; // the client's language the cards were read in
    const pool = squadRewards(squad, lang);
    scan = s;
    shown = s.cards.map((card) => {
      const match = matchCard(card.texts, pool, lang);
      const id = match?.cand.id;
      const slug = match?.cand.item.slug;
      return {
        card,
        match,
        price: slug ? quickPrice(slug) : null,
        vaulted: id ? vaultedItem(id) : false,
        rarity: id ? rarityOf(id, squad) : null,
        need: neededBy(id),
        coll: id && coll ? collNeed(id, collMode, coll) : null,
        info: id ? partInfo(id, ctx) : null,
        forma: id === FORMA,
      };
    });
    // The relic journal keeps what was on offer (the log only has the player's own relic reward).
    const offer = shown.map((sh) => sh.match?.cand.id).filter((x): x is string => !!x);
    if (offer.length) invoke("journal_offer", { items: offer }).catch(() => {});
    await Promise.all(
      shown.map(async (sh, i) => {
        const slug = sh.match?.cand.item.slug;
        if (slug && !cachedPrice(slug)) {
          const p = await getPrice(slug).catch(() => null);
          if (p) shown[i] = { ...shown[i], price: p };
        }
      }),
    );
    clearTimeout(hideTimer);
    // The reward screen stays up for its 15 s countdown; the log line about closing can lag seconds.
    hideTimer = setTimeout(close, 16_000);
  }

  function close() {
    scan = null;
    shown = [];
    invoke("overlay_hide");
  }

  // Best pick by the chosen priority, the other value breaks ties. A part one of the player's goals waits for
  // beats any price: that is what they came for.
  // "collection": a part missing from a set goes next (collection/need.ts score), platinum breaks ties; with
  // nothing known (no inventory / profile) it is plain platinum.
  const best = $derived.by(() => {
    let bi = -1;
    let bv = -1;
    shown.forEach((s, i) => {
      const plat = s.price?.sell ?? 0;
      const ducats = s.match?.cand.item.ducats ?? 0;
      const coll = s.coll ? 1e9 + s.coll.score * 1000 : 0;
      const v = (s.need.length ? 1e12 : 0) + coll + (priority === "ducats" ? ducats * 10_000 + plat : plat * 10_000 + ducats);
      if (s.match && v > bv) (bv = v), (bi = i);
    });
    return bi;
  });
  // All junk and a Forma on offer: the Forma.
  const junk = $derived(
    priority !== "ducats" &&
      shown.some((s) => s.forma) &&
      shown.every((s) => !s.match || s.forma || (!s.need.length && !s.coll && (s.price?.sell ?? 0) <= JUNK)),
  );
  const pick = $derived(junk ? shown.findIndex((s) => s.forma) : best);

  // Item name in the interface language, split into the part and what it belongs to:
  // "Протея Прайм: Система" (blueprint) -> "Система" under "Чертёж · Протея Прайм".
  // (Recognition matches the client's screen text, cand.name; this is only what is shown.)
  function nameParts(it: Item) {
    const parts = it.name.split(": ");
    const title = parts.pop()!;
    return { title, over: [it.bp ? t("overlay.bp") : "", ...parts].filter(Boolean).join(" · ") };
  }

  const RARITY_RU = labels<Rarity>({ COMMON: "overlay.rar.common", UNCOMMON: "overlay.rar.uncommon", RARE: "overlay.rar.rare" });

  function readSettings() {
    const o = readOverlaySettings();
    priority = o.priority;
    collMode = o.collMode;
    if (priority === "collection") loadCollCtx().catch(() => {}); // warm up mastery.json before a reward screen
  }
  readSettings();
  const onStorage = (e: StorageEvent) => {
    if (e.key === "dwc.overlay") readSettings();
  };
  window.addEventListener("storage", onStorage);
  onDestroy(() => window.removeEventListener("storage", onStorage));

  const un: Promise<UnlistenFn>[] = [
    listen<string[]>("squad-relics", (e) => {
      relics = e.payload;
      prefetch(squadRewards(relics, client.lang));
    }),
    listen<string[]>("reward-open", (e) => prefetch(squadRewards(e.payload, client.lang))),
    listen<Scan>("reward-scan", (e) => show(e.payload)),
    listen("reward-close", close),
  ];
  onDestroy(() => un.forEach((u) => u.then((f) => f())));
</script>

{#if scan}
  <!-- Sizes are the game's 1080p pixels times --k, so the look follows the resolution. -->
  <div class="layer" style:--k={scan.scale / dpr}>
    {#each shown as s, i (i)}
      {@const n = s.match ? nameParts(s.match.cand.item) : null}
      <div
        class="panel r-{s.rarity ?? 'none'}"
        class:best={i === pick}
        style:left="{s.card.x / dpr}px"
        style:top="calc(548px * var(--k))"
        style:width="{s.card.w / dpr}px"
        style:animation-delay="{i * 70}ms"
      >
        {#if i === pick}
          <div class="ribbon" class:goal={s.need.length > 0} class:coll={!s.need.length && !!s.coll} class:forma={junk}>
            {junk ? t("overlay.takeForma") : s.need.length ? t("overlay.forGoal") : s.coll ? t(collMode === "mr" ? "overlay.forMr" : "overlay.forSet") : t("overlay.best")}
          </div>
        {/if}
        <i class="corner tl"></i><i class="corner tr"></i><i class="corner bl"></i><i class="corner br"></i>

        {#if s.match && n}
          {@const ducats = s.match.cand.item.ducats ?? 0}
          <!-- The chosen priority is the big number; the other value goes small, in the meta row. -->
          {#if priority === "ducats"}
            <div class="price gold">
              {#if ducats}
                <img src="/icons/ducats.png" alt="" />
                <b>{ducats}</b>
              {:else}
                <span class="none">{t("overlay.noDucats")}</span>
              {/if}
            </div>
            <div class="buy hidden">.</div>
          {:else}
            <div class="price">
              {#if s.price?.sell != null}
                <img src="/icons/platinum.png" alt="" />
                <b>{s.price.sell}</b>
              {:else if s.match.cand.item.slug}
                <span class="wait">…</span>
              {:else}
                <span class="none">{t("overlay.notTradable")}</span>
              {/if}
            </div>
            <div class="buy" class:hidden={s.price?.buy == null}>{t("overlay.buyers", { v: s.price?.buy ?? 0 })}</div>
          {/if}

          <div class="line"></div>

          <div class="name">
            {#if n.over}<small>{n.over}</small>{/if}
            <span>{n.title}</span>
          </div>

          {#if s.need.length}<div class="goal-line">⚑ {s.need.join(", ")}</div>{/if}
          {#if s.info}
            {@const f = s.info}
            <!-- The set, part by part: held (blueprints / parts + already built) of what one set takes. -->
            <div class="set">
              <div class="set-head">
                <span class="set-name">{f.name}</span>
                {#if f.full > 0}<span class="copies" title={t("overlay.copies")}>×{f.full}</span>{/if}
                {#if f.mastered}<span class="st ok" title={t("overlay.mastered")}>✓</span>
                {:else if f.owned}<span class="st own">{t("overlay.ownedShort")}</span>
                {:else if f.mastered === false}<span class="st no">{t("overlay.notMasteredShort")}</span>{/if}
              </div>
              {#if f.next >= 0}
                <ul class="plist">
                  {#each f.parts as p (p.id)}
                    {@const have = p.bp + p.built}
                    <li class:me={p.id === s.match.cand.id} class:ok={have >= p.per} class:part={have > 0 && have < p.per}>
                      <span class="pn">{p.name || t("overlay.bp")}</span>
                      <span class="pc">
                        {#if p.built}<i title={t("overlay.built")}>⚒{p.built}</i>{/if}{have}<small>/{p.per}</small>
                      </span>
                    </li>
                  {/each}
                </ul>
              {/if}
            </div>
          {/if}

          <div class="meta">
            {#if priority === "ducats"}
              {#if s.price?.sell != null}<span class="plat"><img src="/icons/platinum.png" alt="" />{s.price.sell}</span>{/if}
            {:else if s.match.cand.item.ducats}
              <span class="ducats"><img src="/icons/ducats.png" alt="" />{s.match.cand.item.ducats}</span>
            {/if}
            {#if s.rarity}<span class="rar">{RARITY_RU[s.rarity]}</span>{/if}
            {#if s.vaulted}<span class="vault">{t("tag.vault")}</span>{/if}
            {#if junk && !s.forma}<span class="junk">{t("overlay.junk")}</span>{/if}
            {#if s.match.alt}<span class="doubt">{t("overlay.unsureOr", { name: itemName(s.match.alt.item) })}</span>
            {:else if s.match.score < 0.7}<span class="doubt">{t("overlay.unsure")}</span>{/if}
          </div>
        {:else}
          <div class="none big">{t("overlay.unread")}</div>
        {/if}
      </div>
    {/each}
  </div>
{/if}

<KioskLayer />

<style>
  :global(html),
  :global(body) {
    background: transparent !important;
    overflow: hidden;
  }
  .layer {
    --gold: #d8b77a;
    --gold-dim: rgba(216, 183, 122, 0.35);
    --glass: rgba(10, 12, 18, 0.84);
    --txt: #e9e4d8;
    --dim: #9a9484;
    --r: var(--dim);
    font-family: Bahnschrift, "Segoe UI", system-ui, sans-serif;
    color: var(--txt);
  }
  .r-COMMON {
    --r: #c8956a;
  }
  .r-UNCOMMON {
    --r: #cfd6e2;
  }
  .r-RARE {
    --r: #f0cf73;
  }

  .panel {
    position: fixed;
    box-sizing: border-box;
    display: flex;
    flex-direction: column;
    align-items: center;
    padding: calc(18px * var(--k)) calc(10px * var(--k)) calc(9px * var(--k));
    background:
      linear-gradient(180deg, color-mix(in srgb, var(--r) 16%, transparent), transparent 42%),
      var(--glass);
    border: 1px solid rgba(216, 183, 122, 0.18);
    border-top: calc(2px * var(--k)) solid var(--r);
    box-shadow: 0 calc(6px * var(--k)) calc(22px * var(--k)) rgba(0, 0, 0, 0.55);
    text-align: center;
    animation: rise 0.28s cubic-bezier(0.2, 0.8, 0.2, 1) both;
  }
  .panel:not(.best) {
    opacity: 0.9;
  }
  @keyframes rise {
    from {
      opacity: 0;
      transform: translateY(calc(10px * var(--k)));
    }
  }

  /* Corner brackets, like the frames of the game's reward cards. */
  .corner {
    position: absolute;
    width: calc(9px * var(--k));
    height: calc(9px * var(--k));
    border: 0 solid var(--gold-dim);
  }
  .tl {
    left: -1px;
    top: -1px;
    border-left-width: 1px;
    border-top-width: 1px;
  }
  .tr {
    right: -1px;
    top: -1px;
    border-right-width: 1px;
    border-top-width: 1px;
  }
  .bl {
    left: -1px;
    bottom: -1px;
    border-left-width: 1px;
    border-bottom-width: 1px;
  }
  .br {
    right: -1px;
    bottom: -1px;
    border-right-width: 1px;
    border-bottom-width: 1px;
  }

  .best {
    border-color: rgba(216, 183, 122, 0.75);
    box-shadow:
      0 0 0 1px rgba(216, 183, 122, 0.35),
      0 0 calc(26px * var(--k)) rgba(216, 183, 122, 0.35),
      0 calc(6px * var(--k)) calc(22px * var(--k)) rgba(0, 0, 0, 0.55);
    overflow: hidden;
  }
  .best .corner {
    border-color: var(--gold);
    width: calc(13px * var(--k));
    height: calc(13px * var(--k));
  }
  /* One light sweep across the best card when it appears. */
  .best::after {
    content: "";
    position: absolute;
    inset: 0;
    background: linear-gradient(105deg, transparent 35%, rgba(255, 236, 190, 0.22) 50%, transparent 65%);
    transform: translateX(-120%);
    animation: sweep 1.1s 0.35s ease-out both;
    pointer-events: none;
  }
  @keyframes sweep {
    to {
      transform: translateX(120%);
    }
  }
  /* Tab hanging from the top edge, like the game's "Можно передать" label. */
  .ribbon {
    position: absolute;
    top: 0;
    left: 50%;
    transform: translateX(-50%);
    padding: calc(2px * var(--k)) calc(14px * var(--k)) calc(3px * var(--k));
    background: linear-gradient(180deg, #e9cd92, #b8904f);
    color: #16120a;
    font-size: calc(10px * var(--k));
    font-weight: 700;
    letter-spacing: 0.14em;
    text-transform: uppercase;
    white-space: nowrap;
    clip-path: polygon(0 0, 100% 0, 92% 100%, 8% 100%);
  }
  /* A goal's part: green, the guide's "done" color. */
  .ribbon.goal {
    background: linear-gradient(180deg, #9fe6bd, #4fae7c);
  }
  /* A part missing from a set ("collection" priority): blue, apart from goals' green. */
  .ribbon.coll {
    background: linear-gradient(180deg, #b9d4ff, #6d93d6);
  }
  /* All junk on offer: take the Forma. */
  .ribbon.forma {
    background: linear-gradient(180deg, #f2d9a0, #c89a4c);
  }
  .set {
    width: 100%;
    margin-top: calc(5px * var(--k));
    padding-top: calc(5px * var(--k));
    border-top: 1px solid rgba(216, 183, 122, 0.14);
  }
  .set-head {
    display: flex;
    align-items: baseline;
    justify-content: center;
    gap: calc(5px * var(--k));
    max-width: 100%;
  }
  .set-name {
    font-size: calc(11px * var(--k));
    color: var(--txt);
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }
  .st {
    flex: none;
    font-size: calc(10px * var(--k));
  }
  .st.ok {
    color: #8fe0b2;
  }
  .st.own {
    color: #b9d1ff;
  }
  .st.no {
    color: #f0a45e;
  }
  .plist {
    list-style: none;
    margin: calc(3px * var(--k)) 0 0;
    padding: 0;
    font-size: calc(10.5px * var(--k));
    line-height: 1.35;
    text-align: left;
  }
  .plist li {
    display: flex;
    align-items: baseline;
    gap: calc(6px * var(--k));
    padding: 0 calc(4px * var(--k));
    color: var(--dim);
  }
  .plist li.part {
    color: #e6c060;
  }
  .plist li.ok {
    color: #8fe0b2;
  }
  /* The part on this card. */
  .plist li.me {
    background: rgba(216, 183, 122, 0.14);
    box-shadow: inset 2px 0 0 var(--gold);
  }
  .plist li.me .pn {
    color: var(--txt);
  }
  .pn {
    flex: 1;
    min-width: 0;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }
  .pc {
    flex: none;
    font-variant-numeric: tabular-nums;
    font-weight: 600;
  }
  .pc small {
    font-weight: 400;
    opacity: 0.7;
  }
  .pc i {
    margin-right: calc(4px * var(--k));
    font-style: normal;
    font-weight: 400;
    opacity: 0.8;
  }
  .copies {
    flex: none;
    padding: 0 calc(5px * var(--k));
    border-radius: calc(3px * var(--k));
    background: rgba(143, 224, 178, 0.16);
    color: #8fe0b2;
    font-size: calc(11px * var(--k));
    font-weight: 600;
  }
  .junk {
    color: var(--dim);
    text-transform: uppercase;
    letter-spacing: 0.08em;
    font-size: calc(10px * var(--k));
  }
  .goal-line {
    max-width: 100%;
    margin-top: calc(4px * var(--k));
    font-size: calc(11px * var(--k));
    color: #8fe0b2;
    text-align: center;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  .price {
    display: flex;
    align-items: center;
    gap: calc(6px * var(--k));
    margin-top: calc(4px * var(--k));
    min-height: calc(34px * var(--k));
  }
  .price img {
    width: calc(24px * var(--k));
    height: calc(24px * var(--k));
    filter: drop-shadow(0 0 calc(6px * var(--k)) rgba(143, 184, 255, 0.45));
  }
  .price b {
    font-size: calc(32px * var(--k));
    line-height: 1;
    font-weight: 600;
    color: #fff;
    text-shadow: 0 0 calc(12px * var(--k)) rgba(143, 184, 255, 0.35);
    font-variant-numeric: tabular-nums;
  }
  .best .price b {
    color: #fff4dc;
    text-shadow: 0 0 calc(14px * var(--k)) rgba(216, 183, 122, 0.6);
  }
  .buy {
    font-size: calc(11px * var(--k));
    color: var(--dim);
    letter-spacing: 0.02em;
  }
  .buy.hidden {
    visibility: hidden;
  }
  .wait {
    font-size: calc(22px * var(--k));
    color: var(--dim);
  }

  .line {
    width: 70%;
    height: 1px;
    margin: calc(7px * var(--k)) 0 calc(6px * var(--k));
    background: linear-gradient(90deg, transparent, var(--gold-dim), transparent);
  }

  .name {
    display: flex;
    flex-direction: column;
    align-items: center;
    max-width: 100%;
    line-height: 1.15;
  }
  .name small {
    font-size: calc(10px * var(--k));
    color: var(--dim);
    letter-spacing: 0.08em;
    text-transform: uppercase;
  }
  .name span {
    font-size: calc(15px * var(--k));
    color: var(--r);
    letter-spacing: 0.02em;
    max-width: 100%;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  .meta {
    display: flex;
    flex-wrap: wrap;
    justify-content: center;
    align-items: center;
    gap: calc(4px * var(--k)) calc(8px * var(--k));
    margin-top: calc(7px * var(--k));
    font-size: calc(11px * var(--k));
  }
  .ducats {
    display: flex;
    align-items: center;
    gap: calc(3px * var(--k));
    color: #e6c060;
    font-size: calc(13px * var(--k));
    font-weight: 600;
  }
  .plat {
    display: flex;
    align-items: center;
    gap: calc(3px * var(--k));
    color: #b9d1ff;
    font-size: calc(13px * var(--k));
    font-weight: 600;
  }
  .plat img {
    width: calc(15px * var(--k));
    height: calc(15px * var(--k));
  }
  .price.gold img {
    filter: drop-shadow(0 0 calc(6px * var(--k)) rgba(230, 192, 96, 0.5));
  }
  .price.gold b {
    color: #ffe9b0;
    text-shadow: 0 0 calc(12px * var(--k)) rgba(230, 192, 96, 0.45);
  }
  .ducats img {
    width: calc(15px * var(--k));
    height: calc(15px * var(--k));
  }
  .rar {
    color: var(--r);
    opacity: 0.85;
    text-transform: uppercase;
    letter-spacing: 0.08em;
    font-size: calc(10px * var(--k));
  }
  .vault {
    padding: 0 calc(6px * var(--k));
    border: 1px solid rgba(232, 150, 80, 0.55);
    color: #f0a45e;
    text-transform: uppercase;
    letter-spacing: 0.08em;
    font-size: calc(10px * var(--k));
  }
  .doubt {
    color: var(--dim);
    font-style: italic;
  }
  .none {
    color: var(--dim);
    font-size: calc(13px * var(--k));
  }
  .none.big {
    padding: calc(14px * var(--k)) 0;
  }
</style>
