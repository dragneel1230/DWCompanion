<script lang="ts">
  // Collection: mastery progress from the player's public profile. Header ring (MR and XP to the next
  // rank), gear / star chart / intrinsics tiles, the fastest ways to rank up, and every masterable item
  // with filters; an item opens a card with its level and, for primes, parts and relics.
  // Used by the Collection tab and the hub (Alt+X); `onopen` shows a set / warframe page.
  import { labels, locale, num, t, type Key } from "$lib/i18n/index.svelte";
  import { getDb, iconUrl, itemName, setParts } from "$lib/db";
  import { profile, ID_RE } from "$lib/profile.svelte";
  import { loadMastery, summarize, mrPlan, duration, CAT_RU, CAT_ORDER, MR_NAME, perRank, type MasteryDb, type MasteryCat, type Row, type Status } from "$lib/mastery";
  import { loadBulk, bulkSell } from "$lib/api";
  import Plat from "$lib/components/Plat.svelte";
  import CollSyndicates from "./CollSyndicates.svelte";
  import CollStats from "./CollStats.svelte";
  import { record, readHistory, type History } from "./history";
  import { skip, skipped, skipCount, toggleCat, toggleId, toggleSp } from "./skip.svelte";
  import { goto } from "$app/navigation";
  import { loadDrops, type DropsDb } from "$lib/drops";
  import { loadCraft, type CraftDb } from "$lib/craft";
  import { journal } from "$lib/journal.svelte";
  import { goals } from "$lib/goals/goals.svelte";
  import HowToGet from "$lib/goals/HowToGet.svelte";
  import { inventory } from "$lib/inventory.svelte";
  import type { Profile } from "$lib/profile.svelte";

  // `ongoal`: add / open the item in the guide. The app goes to /goals; the hub switches to its Goals tab.
  let {
    onopen,
    compact = false,
    ongoal,
  }: {
    onopen: (kind: "set" | "frame" | "item" | "relic", id: string) => void;
    compact?: boolean;
    ongoal?: (id: string) => void;
  } = $props();
  const toGoal = (id: string) => {
    if (goals.get(id)) goals.open(id);
    else goals.add(id);
    if (ongoal) ongoal(id);
    else goto("/goals");
  };

  const db = getDb();
  let mdb = $state<MasteryDb | null>(null);
  loadMastery().then((m) => (mdb = m));
  profile.start();

  // The inventory snapshot knows affinity too, often newer than the public profile: the larger wins.
  function withInventory(p: Profile | null): Profile | null {
    const inv = inventory.data;
    if (!p || !inv) return p;
    const xp = { ...p.xp };
    for (const [id, v] of Object.entries(inv.xp)) if (v > (xp[id] ?? -1)) xp[id] = v;
    return { ...p, xp, at: Math.max(p.at, inv.at) };
  }
  const pdata = $derived(withInventory(profile.data));
  const sum = $derived(mdb && pdata ? summarize(mdb, pdata) : null);

  // Arsenal facts of a ranked item: forma and reactor / catalyst, or that it left the arsenal (sold, fed to Helminth).
  const FRAMEISH = new Set(["warframe", "archwing", "necramech", "companion"]);
  function gearOf(id: string, cat: string): { text: string; gone: boolean } | null {
    if (!inventory.inArsenal(id)) return { text: t("fact.gone"), gone: true };
    const g = inventory.gearOf(id);
    const parts = [g?.forma ? t("fact.forma", { n: g.forma }) : null, g?.potato ? (FRAMEISH.has(cat) ? t("fact.reactor") : t("fact.catalyst")) : null].filter(Boolean);
    return parts.length ? { text: parts.join(" · "), gone: false } : null;
  }

  // ---------- sub-tabs (remembered; shared by the app and the hub)
  type Sub = "overview" | "items" | "syndicates" | "stats";
  const SUBS: { id: Sub; label: Key }[] = [
    { id: "overview", label: "hub.tab.overview" },
    { id: "items", label: "coll.sub.items" },
    { id: "syndicates", label: "coll.sub.syndicates" },
    { id: "stats", label: "coll.sub.stats" },
  ];
  const SUB_KEY = "dwc.coll.sub";
  let sub = $state<Sub>(readSub());
  function readSub(): Sub {
    try {
      const v = localStorage.getItem(SUB_KEY);
      return v === "items" || v === "syndicates" || v === "stats" ? v : "overview";
    } catch {
      return "overview";
    }
  }
  function setSub(v: Sub) {
    sub = v;
    try {
      localStorage.setItem(SUB_KEY, v);
    } catch {
      // storage unavailable
    }
  }

  // ---------- snapshots: "what's new" and the mastery chart
  let hist = $state<History>(readHistory());
  $effect(() => {
    if (sum && pdata && mdb) {
      const m = mdb;
      hist = record(pdata.at, sum.counted, sum.mr, sum.rows, (id) => m.items[id]?.max ?? 30);
    }
  });
  const change = $derived(hist.change);
  const fresh = $derived(!!change && Date.now() - change.at < 24 * 3600_000);
  const nameOfId = (id: string) => mdb?.items[id]?.name ?? id.split("/").pop();
  const day = (t: number) => new Date(t).toLocaleDateString(locale(), { day: "numeric", month: "long" });
  // Sparkline of the mastery total (last points).
  const spark = $derived.by(() => {
    const pts = hist.points.slice(-60);
    if (pts.length < 2) return null;
    const lo = Math.min(...pts.map((x) => x.total));
    const hi = Math.max(...pts.map((x) => x.total));
    const t0 = pts[0].at;
    const t1 = pts.at(-1)!.at;
    const xy = pts.map((x) => [((x.at - t0) / Math.max(1, t1 - t0)) * 160, 30 - ((x.total - lo) / Math.max(1, hi - lo)) * 26]);
    return { d: "M" + xy.map(([x, y]) => `${x.toFixed(1)},${y.toFixed(1)}`).join("L"), gain: hi - lo, since: t0 };
  });

  // ---------- plan to the next rank
  const plan = $derived(sum && mdb && pdata ? mrPlan(mdb, pdata, sum, skipped, skip.sp) : null);
  // "Put aside" panel: categories / Steel Path / single items the plan leaves out.
  let skipOpen = $state(false);
  const SKIP_CATS = [...CAT_ORDER, "other"] as MasteryCat[];
  const nodeName = (tag: string) => db.world.regions[tag]?.n ?? tag;

  let waysEl = $state<HTMLElement>();
  function showPlat() {
    way = "plat";
    if (!waysEl) return;
    // Scroll only the nearest scrolling container: scrollIntoView also scrolls overflow:hidden
    // ancestors, which shifts the whole hub layer up.
    let box: HTMLElement | null = waysEl.parentElement;
    while (box && !/(auto|scroll)/.test(getComputedStyle(box).overflowY)) box = box.parentElement;
    const scroller = box ?? document.scrollingElement;
    if (!scroller) return;
    const top = waysEl.getBoundingClientRect().top - (box ? box.getBoundingClientRect().top : 0) + scroller.scrollTop - 12;
    scroller.scrollTo({ top, behavior: "smooth" });
  }

  // ---------- mastery for platinum: unmastered prime sets by price per 1000 mastery
  let bulkReady = $state(false);
  loadBulk().then(() => (bulkReady = true));
  const pct = (a: number, b: number) => (b ? Math.round((a / b) * 100) : 0);
  const fmt = (n: number) => num(Math.round(n));

  // ---------- help / account
  let help = $state(false);
  let idInput = $state("");
  const needHelp = $derived(profile.status === "noaccount" || profile.status === "empty" || profile.status === "error");

  // ---------- fastest ways to rank up
  type Way = "finish" | "relics" | "fresh" | "plat";
  const WAY_KEY = "dwc.coll.way";
  let way = $state<Way>(readWay());
  function readWay(): Way {
    try {
      const v = localStorage.getItem(WAY_KEY);
      return v === "relics" || v === "fresh" || v === "plat" ? v : "finish";
    } catch {
      return "finish";
    }
  }
  $effect(() => {
    try {
      localStorage.setItem(WAY_KEY, way);
    } catch {
      // storage unavailable
    }
  });
  const setActive = (id: string) => {
    const s = db.sets[id];
    return !!s && s.parts.some((p) => db.items[p]?.relics.some((r) => !db.relics[r.relic]?.vaulted));
  };
  const ways = $derived.by(() => {
    if (!sum) return [];
    const mr = sum.mr;
    if (way === "plat") {
      if (!bulkReady) return [];
      return sum.rows
        .filter((r) => r.status === "none" && db.sets[r.id] && (r.it.mr ?? 0) <= mr && !skipped(r))
        .map((r) => ({ ...r, price: bulkSell(db.sets[r.id].slug) }))
        .filter((r) => r.price)
        .sort((a, b) => a.price! / a.gives - b.price! / b.gives)
        .slice(0, compact ? 8 : 12);
    }
    const list =
      way === "finish"
        ? sum.rows.filter((r) => r.status === "progress")
        : way === "relics"
          ? sum.rows.filter((r) => r.status === "none" && r.it.prime && setActive(r.id))
          : sum.rows.filter((r) => r.status === "none" && (r.it.mr ?? 0) <= mr);
    return list.filter((r) => !skipped(r)).sort((a, b) => b.left - a.left).slice(0, compact ? 8 : 12) as (Row & { price?: number })[];
  });
  const chartLeft = $derived.by(() => {
    if (!sum || !mdb || !profile.data) return null;
    const done = new Set(profile.data.missions.filter((m) => m.sp).map((m) => m.tag));
    let xp = 0;
    let n = 0;
    for (const [tag, node] of Object.entries(mdb.nodes)) if (!done.has(tag) && node.xp) (xp += node.xp), n++;
    return { xp, n };
  });

  // ---------- grid
  type Sort = "name" | "price" | "mr" | "left" | "level";
  // Sort and filters are remembered (shared by the app and the hub).
  const VIEW_KEY = "dwc.coll.view";
  const savedView = readView();
  function readView() {
    try {
      return JSON.parse(localStorage.getItem(VIEW_KEY) ?? "{}") ?? {};
    } catch {
      return {};
    }
  }
  let query = $state("");
  let cat = $state<MasteryCat | "all">(CAT_ORDER.includes(savedView.cat) ? savedView.cat : "all");
  let status = $state<Status | "all">(savedView.status ?? "all");
  let kind = $state<"all" | "prime" | "normal">(savedView.kind ?? "all");
  let sort = $state<Sort>(savedView.sort ?? "name");
  let sortOpen = $state(false);
  let group = $state<boolean>(savedView.group ?? true);
  $effect(() => {
    const v = { cat, status, kind, sort, group };
    try {
      localStorage.setItem(VIEW_KEY, JSON.stringify(v));
    } catch {
      // storage unavailable
    }
  });
  const SORTS: { id: Sort; label: Key; hint: Key }[] = [
    { id: "name", label: "coll.sort.name", hint: "coll.sort.nameHint" },
    { id: "price", label: "coll.sort.price", hint: "coll.sort.priceHint" },
    { id: "left", label: "coll.sort.left", hint: "coll.sort.leftHint" },
    { id: "level", label: "coll.sort.level", hint: "coll.sort.levelHint" },
    { id: "mr", label: "coll.sort.mr", hint: "coll.sort.mrHint" },
  ];
  // Set price for the "Дешевле" sort (the day's average from the bulk file; no set = no price).
  const setPrice = (id: string): number | undefined => (bulkReady && db.sets[id] ? bulkSell(db.sets[id].slug) : undefined);
  let shown = $state(120);
  const STATUS: { id: Status | "all"; label: Key }[] = [
    { id: "all", label: "mp.all" },
    { id: "none", label: "coll.f.none" },
    { id: "progress", label: "coll.f.progress" },
    { id: "mastered", label: "coll.f.mastered" },
  ];
  const grid = $derived.by(() => {
    if (!sum) return [];
    const q = query.trim().toLowerCase().replace(/ё/g, "е");
    return sum.rows
      .filter(
        (r) =>
          (cat === "all" || r.it.cat === cat) &&
          (status === "all" || r.status === status) &&
          (kind === "all" || !!r.it.prime === (kind === "prime")) &&
          (!q || r.it.ru.toLowerCase().replace(/ё/g, "е").includes(q) || r.it.en.toLowerCase().includes(q)),
      )
      .sort((a, b) => {
        const byName = a.it.name.localeCompare(b.it.name, locale());
        if (sort === "left") return b.left - a.left || byName;
        if (sort === "level") return b.rank / b.it.max - a.rank / a.it.max || byName;
        if (sort === "mr") return (a.it.mr ?? 0) - (b.it.mr ?? 0) || byName;
        if (sort === "price") return (setPrice(a.id) ?? Infinity) - (setPrice(b.id) ?? Infinity) || byName;
        return byName;
      });
  });
  // Grouped by category when every category is shown.
  const groups = $derived(
    group && cat === "all"
      ? CAT_ORDER.map((c) => ({ c, rows: grid.filter((r) => r.it.cat === c) })).filter((g) => g.rows.length)
      : [{ c: null as MasteryCat | null, rows: grid.slice(0, shown) }],
  );
  $effect(() => {
    query;
    cat;
    status;
    kind;
    shown = 120;
  });

  // ---------- item card
  let open = $state<Row | null>(null);
  // The guide's data (where blueprints and parts come from): loaded with the first card opened.
  let gd = $state<{ drops: DropsDb; craft: CraftDb } | null>(null);
  $effect(() => {
    // With an inventory the cards need it too ("blueprint ready", parts collected).
    if ((!open && !inventory.data) || gd) return;
    journal.start();
    Promise.all([loadDrops(), loadCraft()]).then(([drops, craft]) => (gd = { drops, craft }));
  });
  // What the inventory already holds toward an item not built yet.
  type InvTag = { k: "arsenal" } | { k: "bp" } | { k: "parts"; a: number; b: number };
  function invTag(id: string): InvTag | null {
    if (!inventory.data) return null;
    if (inventory.inArsenal(id)) return { k: "arsenal" };
    const c = gd?.craft.items[id];
    if (!c) return null;
    const has = (x: string | undefined) => !!x && !!inventory.count(x);
    if (has(c.bp ?? c.r)) return { k: "bp" };
    const parts = c.parts.filter(([p]) => gd!.craft.items[p]?.kind === "part" || db.items[p]);
    const a = parts.filter(([p]) => has(p) || has(gd!.craft.items[p]?.bp ?? gd!.craft.items[p]?.r)).length;
    return a ? { k: "parts", a, b: parts.length } : null;
  }
  const openSet = $derived(open && db.sets[open.id] ? db.sets[open.id] : null);
  const partInfo = (pid: string) => {
    const it = db.items[pid];
    const active = it.relics.filter((r) => !db.relics[r.relic]?.vaulted);
    return { it, active };
  };

  const STATUS_RU = labels<Status>({ mastered: "coll.st.mastered", progress: "coll.st.progress", none: "coll.st.none" });
  const ago = (ts: number) => {
    const m = Math.round((Date.now() - ts) / 60000);
    return m < 1 ? t("coll.justNow") : m < 60 ? t("coll.minAgo", { v: m }) : t("coll.hAgo", { v: Math.round(m / 60) });
  };

  // Esc: closes the item card first (the hub asks through this before stepping back).
  export function dismiss(): boolean {
    if (sortOpen) {
      sortOpen = false;
      return true;
    }
    if (!open) return false;
    open = null;
    return true;
  }
  const onkeydown = (e: KeyboardEvent) => {
    if (e.key === "Escape" && !compact && sortOpen) sortOpen = false;
    else if (e.key === "Escape" && !compact && open) open = null;
  };
  // The sort menu closes on any click outside it.
  const onclick = (e: MouseEvent) => {
    if (sortOpen && !(e.target as Element).closest?.(".sort")) sortOpen = false;
  };

  // Ring geometry.
  const R = 52;
  const C = 2 * Math.PI * R;
</script>

<svelte:window {onkeydown} {onclick} />

<div class="col" class:compact>
  {#if needHelp || help}
    <section class="help" class:warn={needHelp}>
      <div class="help-head">
        <b>
          {#if profile.status === "noaccount"}{t("coll.noAccount")}{:else if profile.status === "empty"}{t("coll.emptyProfile")}{:else if profile.status === "error"}{t("coll.profileError")}{:else}{t("coll.whereFrom")}{/if}
        </b>
        {#if !needHelp}<button class="x" onclick={() => (help = false)}>×</button>{/if}
      </div>
      <p>
        {t("coll.helpIntro")}
        {#if profile.status === "error"}<span class="err">{t("coll.errorPrefix", { error: profile.error })}</span>{/if}
      </p>
      <ol>
        <li>{t("coll.help1a")} <b>warframe.com</b> {t("coll.help1b")} <code>warframe.com/user#gdprSettings</code></li>
        <li>{t("coll.help2a")} <b>«Share Loadout Information with the Warframe Arsenal»</b> — {t("coll.help2b")}</li>
        <li>{t("coll.help3")}</li>
      </ol>
      <p class="small">
        {t("coll.idHint")}
      </p>
      <div class="id-row">
        <input bind:value={idInput} placeholder={profile.account ?? t("coll.accountId")} spellcheck="false" />
        <button disabled={!ID_RE.test(idInput.trim())} onclick={() => profile.setAccount(idInput.trim())}>{t("common.save")}</button>
        {#if profile.manual}<button class="ghost" onclick={() => profile.setAccount(null)}>{t("coll.fromLog")}</button>{/if}
        <button class="ghost" onclick={() => profile.refresh(true)} disabled={profile.status === "loading"}>{t("common.refresh")}</button>
      </div>
    </section>
  {/if}

  {#if sum && profile.data}
    {@const p = profile.data}
    {@const into = Math.max(0, Math.min(1, (sum.total - sum.from) / (sum.to - sum.from)))}
    <section class="top">
      <div class="ring" title={t("coll.ringHint")}>
        <svg viewBox="0 0 120 120">
          <circle cx="60" cy="60" r={R} class="track" />
          <circle cx="60" cy="60" r={R} class="arc" stroke-dasharray="{C * into} {C}" transform="rotate(-90 60 60)" />
        </svg>
        <div class="mr"><small>MR</small><b>{MR_NAME(sum.mr)}</b></div>
      </div>
      <div class="who">
        <h1>{p.name || t("nav.collection")}</h1>
        <div class="xp">
          {#if sum.total >= sum.to}
            <b class="ready">{t("coll.mrReady", { mr: MR_NAME(sum.mr + 1) })}</b>
          {:else}
            <b>{t("unit.pct", { v: Math.round(into * 100) })}</b> {t("coll.toMr", { mr: MR_NAME(sum.mr + 1), xp: fmt(sum.to - sum.total) })}
          {/if}
        </div>
        <div class="bar"><i style:width="{into * 100}%"></i></div>
        {#if spark}
          <div class="spark" title={t("coll.sparkHint")}>
            <svg viewBox="0 0 160 32" preserveAspectRatio="none"><path d={spark.d} /></svg>
            <span>{t("coll.sparkGain", { v: fmt(spark.gain), since: day(spark.since) })}</span>
          </div>
        {/if}
        <div class="meta">
          <span>{t("coll.updated", { ago: ago(p.at) })}</span>
          <button onclick={() => profile.refresh(true)} disabled={profile.status === "loading"}>
            {profile.status === "loading" ? t("coll.refreshing") : t("common.refresh")}
          </button>
          {#if !needHelp}<button onclick={() => (help = !help)}>{t("coll.whereFromQ")}</button>{/if}
        </div>
      </div>
      <div class="counts">
        <div><b class="good">{sum.counts.mastered}</b><span>{t("coll.st.mastered")}</span></div>
        <div><b class="prog">{sum.counts.progress}</b><span>{t("coll.st.progress")}</span></div>
        <div><b>{sum.counts.none}</b><span>{t("coll.st.none")}</span></div>
        <div><b>{t("unit.pct", { v: pct(sum.counts.mastered, sum.counts.all) })}</b><span>{t("coll.ofAll", { n: sum.counts.all })}</span></div>
      </div>
    </section>

    <div class="subs">
      {#each SUBS as sb}
        <button class:on={sub === sb.id} onclick={() => setSub(sb.id)}>{t(sb.label)}</button>
      {/each}
    </div>

    {#if sub === "overview"}
    {#if change && (change.xp > 0 || change.mastered.length || change.leveled.length || change.started.length)}
      <section class="news" class:fresh>
        <div class="news-head">
          <b>{fresh ? t("coll.new") : t("coll.lastChanges")}</b>
          <span>{t("coll.fromTo", { a: day(change.since), b: day(change.at) })}</span>
          {#if change.xp > 0}<em>{t("coll.plusMastery", { v: fmt(change.xp) })}</em>{/if}
          {#if change.mr[1] > change.mr[0]}<em class="mr-up">MR {MR_NAME(change.mr[0])} → {MR_NAME(change.mr[1])}</em>{/if}
        </div>
        <div class="news-list">
          {#each change.mastered as id (id)}<span class="chip done">✓ {nameOfId(id)}</span>{/each}
          {#each change.leveled as [id, a, b] (id)}<span class="chip">{nameOfId(id)} <i>{a}→{b}</i></span>{/each}
          {#each change.started as id (id)}<span class="chip new">{t("coll.newItem", { name: nameOfId(id) })}</span>{/each}
        </div>
      </section>
    {/if}

    {#if plan}
      <section class="plan">
        <div class="plan-head">
          <h2>{t("coll.planTo", { mr: MR_NAME(sum.mr + 1) })}</h2>
          <span class="hint">
            {#if plan.need === 0}
              {t("coll.planEnough")}
            {:else}
              {t("coll.planNeed", { v: fmt(plan.need) })} · {duration(plan.min)}{plan.short ? ` · ${t("coll.planShort", { v: fmt(plan.short) })}` : ""}
            {/if}
          </span>
          {#if plan.short}
            <button class="to-plat" onclick={showPlat}>{t("coll.cheapestMr")} →</button>
          {/if}
          <button class="skip-btn" class:on={skipOpen} class:solo={!plan.short} onclick={() => (skipOpen = !skipOpen)}>
            {skipCount() ? t("coll.skip.btnN", { n: skipCount() }) : t("coll.skip.btn")}
          </button>
        </div>
        {#if skipOpen}
          <div class="skip-panel">
            <p class="muted">{t("coll.skip.about")}</p>
            <div class="sk-row">
              {#each SKIP_CATS as c (c)}
                <button class="sk" class:off={skip.cats.includes(c)} onclick={() => toggleCat(c)}>{CAT_RU[c]}</button>
              {/each}
              <button class="sk" class:off={skip.sp} onclick={toggleSp}>{t("fissures.hard")}</button>
            </div>
            {#if skip.ids.length}
              <div class="sk-row">
                <small>{t("coll.skip.items")}</small>
                {#each skip.ids as id (id)}
                  <button class="sk off" title={t("coll.skip.return")} onclick={() => toggleId(id)}>{nameOfId(id)} ×</button>
                {/each}
              </div>
            {:else}
              <p class="muted">{t("coll.skip.itemsHint")}</p>
            {/if}
          </div>
        {/if}
        {#if plan.need > 0}
          <div class="steps">
            {#each plan.steps as st, i (i)}
              {#if st.kind === "item"}
                <div class="defer-wrap">
                <button class="step" onclick={() => (open = st.row)}>
                  <span class="n">{i + 1}</span>
                  <img src={iconUrl(st.row.it.icon)} alt="" loading="lazy" />
                  <div><b>{t("coll.finishItem", { name: st.row.it.name })}</b><small>{t("coll.lvlFromTo", { a: st.row.rank, b: st.row.it.max })} · {duration(st.min)}</small></div>
                  <span class="plus">+{fmt(st.xp)}</span>
                </button>
                <button class="defer" title={t("coll.skip.one")} aria-label={t("coll.skip.one")} onclick={() => toggleId(st.row.id)}><svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="8.5" /><path d="M6 18L18 6" /></svg></button>
                </div>
              {:else}
                <div class="step" title={st.tags.map(nodeName).join(", ")}>
                  <span class="n">{i + 1}</span>
                  <span class="nodes-ico">{st.sp ? t("coll.spShort") : "★"}</span>
                  <div>
                    <b>{st.sp ? t("fissures.hard") : t("coll.starChart")}: {t("coll.nodes", { n: st.tags.length })}</b>
                    <small>{st.tags.slice(0, 4).map(nodeName).join(", ")}{st.tags.length > 4 ? "…" : ""} · {duration(st.min)}</small>
                  </div>
                  <span class="plus">+{fmt(st.xp)}</span>
                </div>
              {/if}
            {/each}
          </div>
        {/if}
      </section>
    {/if}

    <section class="tiles">
      <div class="tile gear">
        <h3>{t("coll.gear")} <em>{t("unit.pct", { v: pct(sum.counts.mastered, sum.counts.all) })}</em></h3>
        {#each sum.byCat as c (c.cat)}
          <button class="cat" class:on={cat === c.cat} onclick={() => (cat = cat === c.cat ? "all" : c.cat)}>
            <span class="n">{CAT_RU[c.cat]}</span>
            <span class="track2">
              <i class="m" style:width="{(c.mastered / c.all) * 100}%"></i><i class="p" style:width="{(c.progress / c.all) * 100}%"></i>
            </span>
            <span class="v">{c.mastered}/{c.all}</span>
          </button>
        {/each}
        <div class="legend"><span><i class="m"></i>{t("coll.st.mastered")}</span><span><i class="p"></i>{t("coll.st.progress")}</span></div>
      </div>
      <div class="tile">
        <h3>{t("coll.starChart")} <em>{t("unit.pct", { v: pct(sum.chart.normal + sum.chart.junctions, sum.chart.normalAll + sum.chart.junctionsAll) })}</em></h3>
        <dl>
          <dt>{t("coll.nodesTitle")}</dt><dd>{sum.chart.normal}/{sum.chart.normalAll}</dd>
          <dt>{t("coll.junctions")}</dt><dd>{sum.chart.junctions}/{sum.chart.junctionsAll}</dd>
          <dt>{t("fissures.hard")}</dt><dd>{sum.chart.sp}/{sum.chart.normalAll}</dd>
          <dt>{t("coll.spJunctions")}</dt><dd>{sum.chart.spJ}/{sum.chart.junctionsAll}</dd>
        </dl>
        <h3 class="second">{t("coll.intrinsics")} <em>{t("unit.pct", { v: pct(sum.intr.railjack + sum.intr.duviri, sum.intr.railjackAll + sum.intr.duviriAll) })}</em></h3>
        <dl>
          <dt>Railjack</dt><dd>{sum.intr.railjack}/{sum.intr.railjackAll}</dd>
          <dt>{t("coll.duviri")}</dt><dd>{sum.intr.duviri}/{sum.intr.duviriAll}</dd>
        </dl>
      </div>
    </section>

    <section class="ways" bind:this={waysEl}>
      <div class="head">
        <h2>{t("coll.fastest")}</h2>
        <div class="seg">
          <button class:on={way === "finish"} onclick={() => (way = "finish")}>{t("coll.way.finish")}</button>
          <button class:on={way === "relics"} onclick={() => (way = "relics")}>{t("coll.way.relics")}</button>
          <button class:on={way === "fresh"} onclick={() => (way = "fresh")}>{t("coll.way.fresh")}</button>
          <button class:on={way === "plat"} onclick={() => (way = "plat")} title={t("coll.way.platHint")}>{t("coll.way.plat")}</button>
        </div>
      </div>
      <div class="way-grid">
        {#if way === "fresh" && chartLeft?.n && !skip.sp}
          <div class="way special">
            <span class="plus">+{fmt(chartLeft.xp)}</span>
            <div><b>{t("fissures.hard")}</b><small>{t("coll.nodesLeft", { n: chartLeft.n })}</small></div>
          </div>
        {/if}
        {#if way === "fresh" && sum.intr.railjack < 50}
          <div class="way special">
            <span class="plus">+{fmt((50 - sum.intr.railjack) * 1500)}</span>
            <div><b>{t("coll.railjack")}</b><small>{t("coll.ranksOf", { v: sum.intr.railjack })}</small></div>
          </div>
        {/if}
        {#each ways as r (r.id)}
          <div class="defer-wrap">
          <button class="way" onclick={() => (open = r)}>
            <span class="plus">+{fmt(r.left)}</span>
            <img src={iconUrl(r.it.icon)} alt="" loading="lazy" />
            <div>
              <b>{r.it.name}</b>
              <small>
                {#if way === "plat" && r.price}
                  {t("coll.setPrice", { v: r.price, per: Math.round((r.price / r.gives) * 1000) })}
                {:else}
                  {r.status === "progress" ? t("coll.lvl", { a: r.rank, b: r.it.max }) : `${CAT_RU[r.it.cat]}${r.it.mr ? ` · MR ${r.it.mr}` : ""}`}
                {/if}
              </small>
            </div>
          </button>
          <button class="defer" title={t("coll.skip.one")} aria-label={t("coll.skip.one")} onclick={() => toggleId(r.id)}><svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="8.5" /><path d="M6 18L18 6" /></svg></button>
          </div>
        {:else}
          <p class="muted">{way === "plat" && !bulkReady ? t("market.loading") : t("coll.emptyGood")}</p>
        {/each}
      </div>
    </section>

    {:else if sub === "items"}
    <section class="list">
      <div class="filters">
        <input bind:value={query} placeholder={t("coll.search")} spellcheck="false" />
        <div class="seg">
          {#each STATUS as s}<button class:on={status === s.id} onclick={() => (status = s.id)}>{t(s.label)}</button>{/each}
        </div>
        <div class="sort">
          <button class="sort-btn" class:on={sortOpen} onclick={() => (sortOpen = !sortOpen)}>
            <span>{t("coll.sorting")}</span>
            <b>{t(SORTS.find((o) => o.id === sort)?.label ?? "coll.sort.name")}</b>
            <svg viewBox="0 0 24 24"><path d="M6 9l6 6 6-6" /></svg>
          </button>
          {#if sortOpen}
            <div class="sort-menu">
              {#each SORTS as o}
                <button class:on={sort === o.id} onclick={() => ((sort = o.id), (sortOpen = false))}>
                  <b>{t(o.label)}</b>
                  <small>{t(o.hint)}</small>
                </button>
              {/each}
            </div>
          {/if}
        </div>
        <label class="grp"><input type="checkbox" bind:checked={group} /> {t("coll.byCat")}</label>
        <div class="seg">
          <button class:on={kind === "all"} onclick={() => (kind = "all")}>{t("mp.all")}</button>
          <button class:on={kind === "prime"} onclick={() => (kind = "prime")}>{t("coll.prime")}</button>
          <button class:on={kind === "normal"} onclick={() => (kind = "normal")}>{t("fissures.normal")}</button>
        </div>
      </div>
      <div class="cats">
        <button class:on={cat === "all"} onclick={() => (cat = "all")}>{t("res.kind.all")}</button>
        {#each sum.byCat as c (c.cat)}<button class:on={cat === c.cat} onclick={() => (cat = c.cat)}>{CAT_RU[c.cat]}</button>{/each}
        <span class="found">{grid.length}</span>
      </div>
      {#each groups as g (g.c ?? "all")}
        {#if g.c}<div class="group-title">{CAT_RU[g.c]} <span>{g.rows.filter((r) => r.status === "mastered").length}/{g.rows.length}</span></div>{/if}
        <div class="grid">
          {#each g.rows as r (r.id)}
            <button class="card {r.status}" class:prime={r.it.prime} onclick={() => (open = r)} title={r.it.name}>
              {#if r.status === "mastered"}<span class="check">✓</span>{/if}
              {#if goals.get(r.id)}<span class="in-goal" title={t("goal.pick.inGoals")}>⚑</span>{/if}
              {#if r.status === "progress"}
                <span class="ring-lvl" style:--p="{(r.rank / r.it.max) * 100}%"><b>{r.rank}</b></span>
              {/if}
              <div class="art"><img src={iconUrl(r.it.icon)} alt="" loading="lazy" /></div>
              <b>{r.it.name}</b>
              <!-- Grouped by category the category says nothing new: the arsenal says more (forma, reactor, sold). -->
              <small class="meta-line">{[group ? null : CAT_RU[r.it.cat], r.it.mr ? `MR ${r.it.mr}` : null].filter(Boolean).join(" · ")}</small>
              {#if inventory.data && r.status !== "none"}
                {@const g = gearOf(r.id, r.it.cat)}
                {#if g}<small class="gear-line" class:gone={g.gone}>{g.text}</small>{/if}
              {/if}
              {#if r.status === "none"}
                {@const it = invTag(r.id)}
                {#if it}<small class="inv-tag">{it.k === "parts" ? t("coll.inv.parts", { a: it.a, b: it.b }) : t(`coll.inv.${it.k}`)}</small>{/if}
              {/if}
              <small class="st"><span class="dot"></span>{r.status === "none" ? t("coll.st.none") : r.status === "mastered" ? t("coll.st.mastered") : `${t("coll.lvl", { a: r.rank, b: r.it.max })} · +${fmt(r.left)}`}</small>
              {#if sort === "price" && setPrice(r.id) != null}
                <span class="price-tag"><img src="/icons/platinum.png" alt="" />{setPrice(r.id)}</span>
              {/if}
            </button>
          {/each}
        </div>
      {/each}
      {#if !(group && cat === "all") && grid.length > shown}
        <button class="more" onclick={() => (shown += 120)}>{t("coll.showMore", { a: Math.min(120, grid.length - shown), b: grid.length - shown })}</button>
      {/if}
    </section>
    {:else if sub === "syndicates"}
      <CollSyndicates p={profile.data} />
    {:else if mdb}
      <CollStats p={profile.data} {mdb} />
    {/if}
  {:else if profile.status === "loading" || (!needHelp && !sum)}
    <p class="muted loading">{t("coll.loading")}</p>
  {/if}
</div>

{#if open}
  {@const r = open}
  <div class="shade" role="presentation" onclick={(e) => e.target === e.currentTarget && (open = null)}>
    <div class="modal">
      <button class="x" onclick={() => (open = null)}>×</button>
      <div class="m-top">
        <img src={iconUrl(r.it.icon)} alt="" />
        <div>
          <h2>{r.it.name}</h2>
          <div class="sub">
            <span>{r.it.en}</span>
            <span class="tag st-{r.status}">{STATUS_RU[r.status]}</span>
            {#if openSet}<span class="tag {setActive(r.id) ? 'active' : 'vaulted'}">{setActive(r.id) ? t("tag.dropsNow") : t("tag.inVault")}</span>{/if}
          </div>
        </div>
      </div>
      <div class="m-stats">
        <div><small>{t("coll.sort.level")}</small><b>{r.rank}/{r.it.max}</b></div>
        <div><small>{t("coll.gives")}</small><b>{fmt(r.gives)}</b></div>
        <div><small>{t("coll.left")}</small><b>{fmt(r.left)}</b></div>
        <div><small>{t("coll.category")}</small><b>{CAT_RU[r.it.cat]}</b></div>
        {#if r.it.mr}<div><small>{t("coll.needMr")}</small><b>{r.it.mr}</b></div>{/if}
      </div>
      <div class="m-bar" class:done={r.status === "mastered"}><i style:width="{(r.rank / r.it.max) * 100}%"></i></div>
      <p class="small">{r.it.max > 30 ? t("coll.perRank40", { v: perRank(r.it.fl) }) : t("coll.perRank", { v: perRank(r.it.fl) })}</p>

      {#if openSet}
        <div class="section-title">{t("coll.setParts")}</div>
        <div class="rows">
          {#each setParts(openSet) as { id: pid, count } (pid)}
            {@const pi = partInfo(pid)}
            <button class="row" onclick={() => onopen("item", pid)}>
              <img src={iconUrl(pi.it.icon)} alt="" loading="lazy" />
              <span class="name">
                {count > 1 ? `${count} × ` : ""}{itemName(pi.it)}
                <small>
                  {#if pi.active.length}
                    {pi.active.slice(0, 4).map((x) => db.relics[x.relic].s).join(", ")}{pi.active.length > 4 ? ` ${t("coll.andMore", { v: pi.active.length - 4 })}` : ""}
                  {:else}{t("detail.onlyVault")}{/if}
                </small>
              </span>
              {#if inventory.count(pid)}<span class="have">{t("coll.inv.have", { v: inventory.count(pid) ?? 0 })}</span>{/if}
              <span class="num"><Plat slug={pi.it.slug} /></span>
            </button>
          {/each}
        </div>
        <div class="m-actions">
          <button onclick={() => onopen("set", r.id)}>{t("coll.setPage")}</button>
          <span class="muted">{t("coll.wholeSet")} <Plat slug={openSet.slug} /></span>
        </div>
      {:else if r.it.cat === "warframe"}
        <div class="m-actions"><button onclick={() => onopen("frame", r.id)}>{t("coll.framePage")}</button></div>
      {/if}
      {#if gd && gd.craft.items[r.id]}
        <HowToGet id={r.id} drops={gd.drops} craft={gd.craft} facts={{ journal: journal.list, profile: profile.data }} ongoal={toGoal} steps={!openSet} />
      {/if}
    </div>
  </div>
{/if}

<style>
  .inv-tag {
    color: var(--accent);
    font-size: 11px;
  }
  .gear-line {
    font-size: 11px;
    color: var(--text-dim);
  }
  .gear-line.gone {
    color: var(--text-faint);
  }
  .have {
    flex: none;
    color: var(--good);
    font-size: 12px;
  }
  .col {
    display: flex;
    flex-direction: column;
    gap: 16px;
  }
  .muted.loading {
    padding: 30px 0;
  }
  .help {
    padding: 16px 18px;
    border-radius: 14px;
    background: var(--surface);
    border: 1px solid var(--line);
    font-size: 13px;
    line-height: 1.5;
    color: var(--text-dim);
  }
  .help.warn {
    border-color: rgba(224, 161, 90, 0.45);
    background: linear-gradient(135deg, rgba(224, 161, 90, 0.1), var(--surface) 60%);
  }
  .help-head {
    display: flex;
    justify-content: space-between;
  }
  .help-head b {
    color: var(--text);
    font-size: 14px;
  }
  .help p {
    margin: 6px 0;
  }
  .help ol {
    margin: 6px 0;
    padding-left: 20px;
  }
  .help li {
    margin: 3px 0;
  }
  .help b {
    color: var(--text);
    font-weight: 500;
  }
  .help code {
    padding: 1px 6px;
    border-radius: 5px;
    background: var(--surface-2);
    color: var(--accent);
    font-size: 12px;
  }
  .err {
    display: block;
    color: var(--warn);
  }
  .small {
    font-size: 12px;
    color: var(--text-faint);
  }
  .id-row {
    display: flex;
    gap: 8px;
    margin-top: 8px;
    flex-wrap: wrap;
  }
  .id-row input {
    flex: 1;
    min-width: 220px;
    padding: 8px 10px;
    border-radius: 8px;
    border: 1px solid var(--line);
    background: var(--bg);
    font-family: Consolas, monospace;
    font-size: 12.5px;
    outline: none;
  }
  .id-row button,
  .m-actions button {
    padding: 7px 14px;
    border-radius: 8px;
    background: var(--accent);
    color: #16120a;
    font-size: 13px;
    font-weight: 600;
  }
  .id-row button:disabled {
    opacity: 0.4;
    cursor: default;
  }
  .id-row .ghost {
    background: none;
    border: 1px solid var(--line);
    color: var(--text-dim);
    font-weight: 400;
  }
  .x {
    font-size: 18px;
    color: var(--text-faint);
    line-height: 1;
  }

  .top {
    display: grid;
    grid-template-columns: auto minmax(0, 1fr) auto;
    align-items: center;
    gap: 22px;
    padding: 18px 22px;
    border-radius: 16px;
    background: var(--surface);
  }
  .ring {
    position: relative;
    width: 116px;
    height: 116px;
  }
  .ring svg {
    width: 100%;
    height: 100%;
  }
  .track {
    fill: none;
    stroke: var(--surface-2);
    stroke-width: 7;
  }
  .arc {
    fill: none;
    stroke: var(--accent);
    stroke-width: 7;
    stroke-linecap: round;
    filter: drop-shadow(0 0 6px rgba(201, 166, 107, 0.45));
  }
  .mr {
    position: absolute;
    inset: 0;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
  }
  .mr small {
    font-size: 11px;
    letter-spacing: 0.14em;
    color: var(--text-faint);
  }
  .mr b {
    font-size: 34px;
    font-weight: 600;
    line-height: 1;
  }
  .who h1 {
    margin: 0 0 6px;
    font-size: 22px;
    font-weight: 600;
  }
  .xp {
    font-size: 13px;
    color: var(--text-dim);
  }
  .xp b {
    color: var(--accent);
  }
  .xp b.ready {
    color: var(--good);
  }
  .bar,
  .m-bar {
    height: 4px;
    border-radius: 4px;
    background: var(--surface-2);
    overflow: hidden;
  }
  .bar {
    margin: 10px 0;
    max-width: 480px;
  }
  .bar i,
  .m-bar i {
    display: block;
    height: 100%;
    border-radius: 4px;
    background: var(--accent);
  }
  .meta {
    display: flex;
    gap: 14px;
    align-items: center;
    font-size: 12px;
    color: var(--text-faint);
  }
  .meta button {
    padding: 0;
    font-size: 12px;
    color: var(--text-dim);
  }
  .meta button:hover {
    color: var(--text);
  }
  .counts {
    display: grid;
    grid-template-columns: repeat(4, auto);
    gap: 4px 24px;
  }
  .counts div {
    display: flex;
    flex-direction: column;
  }
  .counts b {
    font-size: 26px;
    font-weight: 600;
    font-variant-numeric: tabular-nums;
  }
  .counts span {
    font-size: 12px;
    color: var(--text-faint);
  }
  .good {
    color: var(--good);
  }
  .prog {
    color: var(--accent);
  }

  .tiles {
    display: grid;
    grid-template-columns: minmax(0, 1.6fr) minmax(0, 1fr);
    gap: 16px;
  }
  .tile {
    padding: 16px 18px;
    border-radius: 16px;
    background: var(--surface);
  }
  h3 {
    margin: 0 0 10px;
    font-size: 12px;
    font-weight: 600;
    letter-spacing: 0.12em;
    text-transform: uppercase;
    color: var(--text-dim);
  }
  h3 em {
    font-style: normal;
    color: var(--accent);
    margin-left: 6px;
  }
  h3.second {
    margin-top: 16px;
  }
  .cat {
    width: 100%;
    display: grid;
    grid-template-columns: 150px minmax(0, 1fr) 70px;
    align-items: center;
    gap: 12px;
    padding: 4px 6px;
    border-radius: 8px;
    font-size: 12.5px;
  }
  .cat:hover,
  .cat.on {
    background: var(--surface-2);
  }
  .cat .n {
    text-align: left;
    color: var(--text-dim);
  }
  .cat .v {
    text-align: right;
    color: var(--text-dim);
    font-variant-numeric: tabular-nums;
  }
  .track2 {
    display: flex;
    gap: 2px;
    height: 6px;
    border-radius: 4px;
    background: var(--surface-2);
    overflow: hidden;
  }
  .track2 i {
    height: 100%;
  }
  .track2 .m,
  .legend .m {
    background: var(--good);
  }
  .track2 .p,
  .legend .p {
    background: var(--accent);
  }
  .legend {
    display: flex;
    gap: 14px;
    margin-top: 8px;
    padding-left: 6px;
    font-size: 11.5px;
    color: var(--text-faint);
  }
  .legend span {
    display: flex;
    align-items: center;
    gap: 6px;
  }
  .legend i {
    width: 10px;
    height: 4px;
    border-radius: 2px;
  }
  dl {
    display: grid;
    grid-template-columns: 1fr auto;
    gap: 6px 12px;
    margin: 0;
    font-size: 13px;
  }
  dt {
    color: var(--text-dim);
  }
  dd {
    margin: 0;
    font-variant-numeric: tabular-nums;
  }

  .ways .head,
  .filters {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 12px;
    flex-wrap: wrap;
    margin-bottom: 10px;
  }
  h2 {
    margin: 0;
    font-size: 16px;
    font-weight: 600;
  }
  .seg {
    display: flex;
    gap: 2px;
    padding: 3px;
    border-radius: 10px;
    background: var(--surface);
  }
  .seg button {
    padding: 5px 11px;
    border-radius: 7px;
    font-size: 12.5px;
    color: var(--text-dim);
  }
  .seg button.on {
    background: var(--surface-2);
    color: var(--text);
  }
  .way-grid {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(250px, 1fr));
    gap: 8px;
  }
  .way {
    position: relative;
    min-width: 0;
    display: flex;
    align-items: center;
    gap: 12px;
    padding: 10px 12px;
    border-radius: 12px;
    background: var(--surface);
    text-align: left;
  }
  button.way:hover {
    background: var(--surface-2);
  }
  .way img {
    width: 44px;
    height: 44px;
    object-fit: contain;
    flex: none;
  }
  .way div {
    min-width: 0;
    display: flex;
    flex-direction: column;
  }
  .way b {
    font-size: 13.5px;
    font-weight: 500;
    white-space: normal;
    overflow: hidden;
    overflow-wrap: anywhere;
    display: -webkit-box;
    -webkit-line-clamp: 2;
    line-clamp: 2;
    -webkit-box-orient: vertical;
    line-height: 1.25;
  }
  .way small {
    font-size: 12px;
    color: var(--text-faint);
  }
  .plus {
    flex: none;
    min-width: 62px;
    padding: 3px 8px;
    border-radius: 999px;
    background: var(--accent-soft);
    color: var(--accent);
    font-size: 12px;
    font-weight: 600;
    text-align: center;
    font-variant-numeric: tabular-nums;
  }
  .way.special {
    background: linear-gradient(120deg, var(--accent-soft), var(--surface) 70%);
  }

  .filters > input {
    flex: 1;
    min-width: 200px;
    max-width: 360px;
    padding: 9px 12px;
    border-radius: 10px;
    border: 1px solid var(--line);
    background: var(--surface);
    outline: none;
  }
  .filters > input:focus {
    border-color: var(--accent);
  }
  .cats {
    display: flex;
    flex-wrap: wrap;
    gap: 4px;
    align-items: center;
    margin-bottom: 12px;
  }
  .cats button {
    padding: 4px 11px;
    border-radius: 999px;
    border: 1px solid var(--line);
    font-size: 12px;
    color: var(--text-dim);
  }
  .cats button.on {
    border-color: var(--accent);
    color: var(--accent);
    background: var(--accent-soft);
  }
  .found {
    margin-left: auto;
    font-size: 12px;
    color: var(--text-faint);
  }
  .grid {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(150px, 1fr));
    gap: 8px;
  }
  .in-goal {
    position: absolute;
    top: 8px;
    left: 9px;
    font-size: 12px;
    color: var(--accent);
  }
  .card {
    position: relative;
    display: flex;
    flex-direction: column;
    gap: 3px;
    padding: 10px 10px 9px;
    border-radius: 12px;
    background: var(--surface);
    text-align: left;
    min-width: 0;
    border: 1px solid transparent;
  }
  .card:hover {
    border-color: var(--line);
    background: var(--surface-2);
  }
  .art {
    height: 76px;
    display: flex;
    align-items: center;
    justify-content: center;
    margin-bottom: 4px;
  }
  .art img {
    max-width: 100%;
    max-height: 76px;
    object-fit: contain;
  }
  .card.none .art img {
    opacity: 0.55;
    filter: saturate(0.5);
  }
  .card.mastered {
    background: linear-gradient(180deg, rgba(111, 207, 151, 0.06), var(--surface) 60%);
  }
  .card.mastered .art img {
    opacity: 0.85;
  }
  .card.prime {
    border-color: rgba(201, 166, 107, 0.22);
  }
  .card.prime:hover {
    border-color: rgba(201, 166, 107, 0.5);
  }
  .check {
    position: absolute;
    top: 8px;
    right: 8px;
    width: 20px;
    height: 20px;
    display: flex;
    align-items: center;
    justify-content: center;
    border-radius: 50%;
    background: rgba(111, 207, 151, 0.16);
    color: var(--good);
    font-size: 11px;
    font-weight: 700;
  }
  /* Level ring of an item in progress: conic fill around the rank number. */
  .ring-lvl {
    position: absolute;
    top: 7px;
    right: 7px;
    width: 26px;
    height: 26px;
    border-radius: 50%;
    background: conic-gradient(var(--accent) var(--p), var(--surface-2) 0);
    display: flex;
    align-items: center;
    justify-content: center;
  }
  .ring-lvl b {
    width: 20px;
    height: 20px;
    border-radius: 50%;
    background: var(--bg);
    display: flex;
    align-items: center;
    justify-content: center;
    font-size: 10px;
    font-weight: 700;
    color: var(--accent);
  }
  .group-title {
    margin: 16px 2px 8px;
    font-size: 12px;
    font-weight: 600;
    letter-spacing: 0.12em;
    text-transform: uppercase;
    color: var(--text-dim);
  }
  .group-title span {
    margin-left: 6px;
    color: var(--text-faint);
    letter-spacing: 0;
  }
  .sort {
    position: relative;
  }
  .sort-btn {
    display: flex;
    align-items: center;
    gap: 6px;
    padding: 7px 10px 7px 12px;
    border-radius: 10px;
    border: 1px solid var(--line);
    background: var(--surface);
    font-size: 12.5px;
    color: var(--text-dim);
  }
  .sort-btn b {
    color: var(--text);
    font-weight: 500;
  }
  .sort-btn svg {
    width: 14px;
    height: 14px;
    fill: none;
    stroke: currentColor;
    stroke-width: 2;
    transition: transform 0.15s;
  }
  .sort-btn.on {
    border-color: var(--accent);
  }
  .sort-btn.on svg {
    transform: rotate(180deg);
  }
  .sort-menu {
    position: absolute;
    top: calc(100% + 6px);
    left: 0;
    z-index: 10;
    min-width: 260px;
    display: flex;
    flex-direction: column;
    padding: 5px;
    border-radius: 12px;
    border: 1px solid var(--line);
    background: var(--bg);
    box-shadow: 0 16px 40px rgba(0, 0, 0, 0.5);
    animation: menu 0.12s ease-out both;
  }
  @keyframes menu {
    from {
      opacity: 0;
      transform: translateY(-4px);
    }
  }
  .sort-menu button {
    display: flex;
    flex-direction: column;
    align-items: flex-start;
    padding: 7px 10px;
    border-radius: 8px;
    text-align: left;
  }
  .sort-menu button:hover {
    background: var(--surface-2);
  }
  .sort-menu button.on {
    background: var(--accent-soft);
  }
  .sort-menu button.on b {
    color: var(--accent);
  }
  .sort-menu b {
    font-size: 13px;
    font-weight: 500;
    color: var(--text);
  }
  .sort-menu small {
    font-size: 11.5px;
    color: var(--text-faint);
  }
  .price-tag {
    position: absolute;
    top: 8px;
    left: 8px;
    display: flex;
    align-items: center;
    gap: 3px;
    padding: 2px 7px 2px 4px;
    border-radius: 999px;
    background: rgba(10, 12, 18, 0.75);
    color: #cfe0ff;
    font-size: 12px;
    font-weight: 600;
    font-variant-numeric: tabular-nums;
  }
  .price-tag img {
    width: 14px;
    height: 14px;
  }
  .grp {
    display: flex;
    align-items: center;
    gap: 6px;
    font-size: 12.5px;
    color: var(--text-dim);
  }

  /* Sub-tabs under the header. */
  .subs {
    display: flex;
    gap: 4px;
    padding: 4px;
    border-radius: 12px;
    background: var(--surface);
    align-self: flex-start;
  }
  .subs button {
    padding: 7px 16px;
    border-radius: 9px;
    font-size: 13.5px;
    color: var(--text-dim);
  }
  .subs button.on {
    background: var(--surface-2);
    color: var(--text);
    box-shadow: inset 0 -2px 0 var(--accent);
  }
  .spark {
    display: flex;
    align-items: center;
    gap: 10px;
    margin: -2px 0 8px;
  }
  .spark svg {
    width: 160px;
    height: 32px;
  }
  .spark path {
    fill: none;
    stroke: var(--accent);
    stroke-width: 1.6;
    vector-effect: non-scaling-stroke;
  }
  .spark span {
    font-size: 12px;
    color: var(--text-faint);
  }

  .news {
    padding: 14px 18px;
    border-radius: 14px;
    background: var(--surface);
    border: 1px solid var(--line);
  }
  .news.fresh {
    border-color: rgba(111, 207, 151, 0.35);
    background: linear-gradient(120deg, rgba(111, 207, 151, 0.1), var(--surface) 60%);
  }
  .news-head {
    display: flex;
    align-items: baseline;
    gap: 12px;
    flex-wrap: wrap;
  }
  .news-head b {
    font-size: 14px;
  }
  .news-head span {
    font-size: 12px;
    color: var(--text-faint);
  }
  .news-head em {
    font-style: normal;
    font-size: 13px;
    color: var(--good);
    font-weight: 600;
  }
  .news-head em.mr-up {
    color: var(--accent);
  }
  .news-list {
    display: flex;
    flex-wrap: wrap;
    gap: 6px;
    margin-top: 10px;
  }
  .chip {
    padding: 3px 10px;
    border-radius: 999px;
    background: var(--surface-2);
    font-size: 12.5px;
  }
  .chip i {
    font-style: normal;
    color: var(--accent);
  }
  .chip.done {
    color: var(--good);
    background: rgba(111, 207, 151, 0.12);
  }
  .chip.new {
    color: var(--text-dim);
  }

  .plan {
    padding: 16px 18px;
    border-radius: 16px;
    background: linear-gradient(135deg, var(--accent-soft), var(--surface) 55%);
    border: 1px solid rgba(201, 166, 107, 0.22);
  }
  .plan-head {
    display: flex;
    align-items: baseline;
    gap: 14px;
    flex-wrap: wrap;
    margin-bottom: 12px;
  }
  .to-plat {
    margin-left: auto;
    padding: 5px 12px;
    border-radius: 8px;
    background: var(--accent);
    color: #16120a;
    font-size: 12.5px;
    font-weight: 600;
  }
  .skip-btn {
    padding: 5px 12px;
    border-radius: 8px;
    border: 1px solid var(--line);
    color: var(--text-dim);
    font-size: 12.5px;
  }
  .skip-btn.solo {
    margin-left: auto;
  }
  .skip-btn:hover,
  .skip-btn.on {
    color: var(--text);
    background: var(--surface-2);
  }
  .skip-panel {
    display: flex;
    flex-direction: column;
    gap: 8px;
    margin: -2px 0 12px;
    padding: 10px 12px;
    border-radius: 12px;
    background: rgba(0, 0, 0, 0.18);
  }
  .skip-panel .muted {
    margin: 0;
    font-size: 12px;
  }
  .sk-row {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 6px;
  }
  .sk-row small {
    font-size: 12px;
    color: var(--text-faint);
    margin-right: 2px;
  }
  .sk {
    padding: 4px 10px;
    border-radius: 999px;
    background: var(--accent-soft);
    color: var(--accent);
    font-size: 12px;
  }
  .sk.off {
    background: transparent;
    border: 1px dashed var(--line);
    color: var(--text-faint);
    text-decoration: line-through;
  }
  .sk:hover {
    filter: brightness(1.2);
  }
  .defer-wrap {
    position: relative;
    display: grid;
    grid-template-columns: minmax(0, 1fr);
    min-width: 0;
  }
  .defer {
    position: absolute;
    top: 4px;
    right: 4px;
    width: 20px;
    height: 20px;
    padding: 2px;
    border-radius: 6px;
    background: var(--surface-2);
    color: var(--text-faint);
    opacity: 0;
    transition: opacity 0.12s;
  }
  .defer svg {
    width: 100%;
    height: 100%;
    fill: none;
    stroke: currentColor;
    stroke-width: 2;
  }
  .defer-wrap:hover .defer,
  .defer:focus-visible {
    opacity: 1;
  }
  .defer:hover {
    color: var(--warn);
  }
  .plan .hint {
    font-size: 12.5px;
    color: var(--text-dim);
  }
  .steps {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(300px, 1fr));
    gap: 8px;
  }
  .step {
    min-width: 0;
    display: flex;
    align-items: center;
    gap: 12px;
    padding: 10px 12px;
    border-radius: 12px;
    background: rgba(255, 255, 255, 0.035);
    text-align: left;
  }
  button.step:hover {
    background: var(--surface-2);
  }
  .step .n {
    flex: none;
    width: 22px;
    height: 22px;
    border-radius: 50%;
    border: 1px solid rgba(201, 166, 107, 0.45);
    color: var(--accent);
    font-size: 11.5px;
    font-weight: 600;
    display: flex;
    align-items: center;
    justify-content: center;
  }
  .step img,
  .nodes-ico {
    width: 40px;
    height: 40px;
    flex: none;
    object-fit: contain;
  }
  .nodes-ico {
    display: flex;
    align-items: center;
    justify-content: center;
    border-radius: 10px;
    background: var(--surface-2);
    color: var(--accent);
    font-size: 13px;
    font-weight: 700;
  }
  .step div {
    flex: 1;
    min-width: 0;
    display: flex;
    flex-direction: column;
  }
  .step b {
    font-size: 13.5px;
    font-weight: 500;
    white-space: normal;
    overflow: hidden;
    overflow-wrap: anywhere;
    display: -webkit-box;
    -webkit-line-clamp: 2;
    line-clamp: 2;
    -webkit-box-orient: vertical;
    line-height: 1.25;
  }
  .step small {
    font-size: 12px;
    color: var(--text-faint);
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  /* The hub: smaller cards, more per row. */
  .compact .grid {
    grid-template-columns: repeat(auto-fill, minmax(118px, 1fr));
    gap: 6px;
  }
  .compact .card {
    padding: 8px 8px 7px;
  }
  .compact .art {
    height: 58px;
  }
  .compact .art img {
    max-height: 58px;
  }
  .compact .meta-line {
    display: none;
  }
  .compact .card b {
    font-size: 12.5px;
  }
  .card b {
    font-size: 13px;
    font-weight: 500;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }
  .card small {
    font-size: 11.5px;
    color: var(--text-faint);
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }
  .st {
    display: flex;
    align-items: center;
    gap: 6px;
  }
  .dot {
    width: 6px;
    height: 6px;
    border-radius: 50%;
    background: var(--text-faint);
  }
  .mastered .dot {
    background: var(--good);
  }
  .progress .dot {
    background: var(--accent);
  }
  .more {
    margin: 12px auto 0;
    display: block;
    padding: 8px 16px;
    border-radius: 10px;
    border: 1px solid var(--line);
    font-size: 13px;
    color: var(--text-dim);
  }

  .shade {
    position: fixed;
    inset: 0;
    z-index: 20;
    display: flex;
    align-items: center;
    justify-content: center;
    background: rgba(4, 6, 10, 0.6);
    backdrop-filter: blur(3px);
  }
  .modal {
    position: relative;
    width: min(760px, 92vw);
    max-height: 86vh;
    overflow-y: auto;
    padding: 22px 24px;
    border-radius: 18px;
    background: var(--bg);
    border: 1px solid var(--line);
    box-shadow: 0 30px 80px rgba(0, 0, 0, 0.5);
  }
  .modal > .x {
    position: absolute;
    top: 14px;
    right: 16px;
  }
  .m-top {
    display: flex;
    align-items: center;
    gap: 18px;
  }
  .m-top img {
    width: 96px;
    height: 96px;
    object-fit: contain;
  }
  .m-top h2 {
    font-size: 22px;
    margin-bottom: 6px;
  }
  .sub {
    display: flex;
    gap: 8px;
    align-items: center;
    flex-wrap: wrap;
    color: var(--text-dim);
  }
  .st-mastered {
    color: var(--good);
    border-color: rgba(111, 207, 151, 0.35);
  }
  .st-progress {
    color: var(--accent);
    border-color: rgba(201, 166, 107, 0.4);
  }
  .m-stats {
    display: flex;
    flex-wrap: wrap;
    gap: 10px 26px;
    margin: 18px 0 10px;
  }
  .m-stats div {
    display: flex;
    flex-direction: column;
  }
  .m-stats small {
    font-size: 11px;
    color: var(--text-faint);
  }
  .m-stats b {
    font-size: 18px;
    font-weight: 600;
  }
  .m-bar {
    height: 5px;
  }
  .m-bar.done i {
    background: var(--good);
  }
  .m-actions {
    display: flex;
    align-items: center;
    gap: 16px;
    margin-top: 14px;
  }
  .rows button.row {
    width: 100%;
    text-align: left;
  }
</style>
