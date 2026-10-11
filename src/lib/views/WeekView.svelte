<script lang="ts">
  // «Неделя» (app page and hub tab): every weekly activity in one place — this week's offer from worldState
  // (missions, modifiers, choices), what the player already did from the inventory snapshot, and what each one
  // pays (DE's reward tables). Head like «Орбитер»: a ring of the week's progress, the reset, the snapshot.
  // Below, an orbit of the activities (state rings; a click scrolls to its card), then the cards.
  import { fromRust, locale, num, t, type Key } from "$lib/i18n/index.svelte";
  import { iconUrl, loadDb, type Db } from "$lib/db";
  import { left } from "$lib/cycles";
  import { inventory } from "$lib/inventory.svelte";
  import { loadFrames, type FramesDb } from "$lib/frames";
  import { SHARD_HUE } from "$lib/shards";
  import OwnBadges from "$lib/components/OwnBadges.svelte";
  import InvBar from "$lib/inv/InvBar.svelte";
  import { refreshWorld, world } from "$lib/hub/worldData.svelte";
  import Rewards from "$lib/week/Rewards.svelte";
  import {
    loadWeekly, netraLeft, descentFloor, archonDone, archonStage, calendarDay, nightwaveDone, nightwaveProgress, periodicDone, teshinOffer,
    circuitFrame, circuitIncarnon, rewardName, rewardIcon, untag, weekEnd, NETRA_MAX, type WeeklyDb,
  } from "$lib/weekly";
  import type { Conquest } from "$lib/api";

  let { compact = false }: { compact?: boolean } = $props();

  let wdb = $state<WeeklyDb | null>(null);
  let fdb = $state<FramesDb | null>(null);
  let db = $state<Db | null>(null);
  loadWeekly().then((d) => (wdb = d)).catch(() => {});
  loadFrames().then((d) => (fdb = d)).catch(() => {});
  loadDb().then((d) => (db = d)).catch(() => {});
  // The app window has no hub polling the world: fetch this week once on open.
  if (!world.week) refreshWorld();

  let now = $state(Date.now());
  $effect(() => {
    const id = setInterval(() => (now = Date.now()), 30_000);
    return () => clearInterval(id);
  });

  const w = $derived(world.week);
  const inv = $derived(inventory.data);
  // A snapshot from before the weekly fields were read knows nothing about them.
  const known = $derived(!!inv?.week);
  const T = (k: string, fb: Key) => wdb?.cq.title[k] ?? t(fb);

  // ---- statuses
  const netra = $derived(known ? netraLeft(inv, now) : null);
  const floors = $derived(w?.descent?.floors ?? 0);
  const dNormal = $derived(known ? descentFloor(inv, "DM_COH_NORMAL", now) : null);
  const dHard = $derived(known ? descentFloor(inv, "DM_COH_HARD", now) : null);
  const archon = $derived(w ? archonDone(inv, w) : null);
  const shard = $derived(w?.archon && wdb ? wdb.archons[w.archon.boss] : null);
  const stages = $derived((w?.archon?.missions ?? []).map((m) => ({ ...m, done: w ? archonStage(inv, w, m.node) : null })));
  const stagesDone = $derived(archon ? stages.length : stages.filter((s) => s.done).length);

  const calDay = $derived(w ? calendarDay(inv, w) : null);
  // Days without events advance by themselves: only days with something to do are listed.
  const calRows = $derived((w?.calendar?.days ?? []).map((d, i) => ({ ...d, i })).filter((d) => d.ids.length));
  const calDone = $derived(calDay == null ? null : calRows.filter((d) => d.i <= calDay).length);

  const nw = $derived(w?.nightwave ?? []);
  const nwDone = $derived(known ? nw.filter((c) => nightwaveDone(inv, c, wdb)).length : null);
  const nwLeft = $derived(known ? nw.filter((c) => !nightwaveDone(inv, c, wdb)).reduce((s, c) => s + (wdb?.nw[c.key]?.[2] ?? 0), 0) : 0);
  const nwTotal = $derived(nw.reduce((s, c) => s + (wdb?.nw[c.key]?.[2] ?? 0), 0));
  const nwRank = $derived(w?.nwSeason && inv?.week?.nwRank ? inv.week.nwRank[w.nwSeason.tag] : null);

  const clem = $derived(periodicDone(inv, "GetClem", now));
  const maroo = $derived(periodicDone(inv, "TreasureHunt", now));
  const teshin = $derived(wdb ? [0, 1, 2].map((i) => teshinOffer(wdb!, now, i)) : []);

  const frames = $derived((w?.circuit?.normal ?? []).map((c) => ({ c, f: circuitFrame(fdb, inv, c) })));
  const incs = $derived((w?.circuit?.hard ?? []).map((c) => ({ c, x: circuitIncarnon(wdb, inv, c) })));

  // ---- the orbit: one circle per activity; `p` is progress 0..1 (null: the snapshot doesn't say).
  type Orb = { id: string; label: string; p: number | null; v: string };
  const ratio = (a: number | null, b: number) => (a == null || !b ? null : Math.min(1, a / b));
  const orbs = $derived.by((): Orb[] => {
    if (!w) return [];
    const o: Orb[] = [];
    if (w.archon) o.push({ id: "archon", label: T("archon", "week.archon"), p: archon ? 1 : ratio(known ? stagesDone : null, stages.length || 3), v: known ? `${stagesDone}/${stages.length || 3}` : "" });
    o.push({ id: "netra", label: t("week.netra"), p: netra == null ? null : (NETRA_MAX - netra) / NETRA_MAX, v: netra == null ? "" : `${NETRA_MAX - netra}/${NETRA_MAX}` });
    if (w.descent) {
      o.push({ id: "descent", label: T("descent", "week.descent"), p: ratio(dNormal, floors), v: dNormal == null ? "" : `${dNormal}/${floors}` });
      o.push({ id: "descent", label: `${T("descent", "week.descent")} · ${t("week.sp")}`, p: ratio(dHard, floors), v: dHard == null ? "" : `${dHard}/${floors}` });
    }
    if (w.lab) o.push({ id: "lab", label: T("lab", "week.lab"), p: null, v: "" });
    if (w.hex) o.push({ id: "hex", label: T("hex", "week.hex"), p: null, v: "" });
    if (w.circuit) o.push({ id: "circuit", label: T("circuit", "week.circuitTitle"), p: null, v: "" });
    if (w.calendar && calRows.length) o.push({ id: "calendar", label: t("week.calendar"), p: ratio(calDone, calRows.length), v: calDone == null ? "" : `${calDone}/${calRows.length}` });
    if (nw.length) o.push({ id: "nightwave", label: t("week.nightwave"), p: ratio(nwDone, nw.length), v: nwDone == null ? "" : `${nwDone}/${nw.length}` });
    o.push({ id: "npc", label: t("week.clem"), p: clem == null ? null : clem ? 1 : 0, v: "" });
    o.push({ id: "npc", label: t("week.maroo"), p: maroo == null ? null : maroo ? 1 : 0, v: "" });
    return o;
  });
  const tracked = $derived(orbs.filter((o) => o.p != null));
  const weekP = $derived(tracked.length ? tracked.reduce((s, o) => s + (o.p ?? 0), 0) / tracked.length : 0);
  const fullDone = $derived(tracked.filter((o) => o.p === 1).length);

  const R = 52;
  const C = 2 * Math.PI * R;
  const r = 19;
  const c = 2 * Math.PI * r;

  let root = $state<HTMLElement>();
  const go = (id: string) => root?.querySelector(`[data-card="${id}"]`)?.scrollIntoView({ behavior: "smooth", block: "start" });

  // ---- names
  const nodeName = (node: string) => db?.world.regions[node]?.n ?? node;
  const missionName = (type: string, lab = false) => (lab && wdb?.cq.mt[`LAB:${type}`]) || wdb?.cq.mt[type] || db?.world.missionType[type] || type;
  const named = (box: Record<string, [string | null, string | null]> | undefined, tag: string) => {
    const x = box?.[tag];
    return { n: x?.[0] ?? untag(tag), d: x?.[1] ?? "" };
  };
  // Descendia rooms: protoframe rooms and the boss are named after their warframe; the rest by mission type.
  const DT_MT: Record<string, string> = {
    DT_EXTERMINATE: "MT_EXTERMINATION", DT_DEFENSE: "MT_DEFENSE", DT_CAPTURE: "MT_CAPTURE", DT_INTERCEPTION: "MT_TERRITORY",
    DT_EXCAVATION: "MT_EXCAVATE", DT_ALCHEMY: "MT_ALCHEMY", DT_NETRACELLS: "MT_VAULTS", DT_SABOTAGE_HIVE: "MT_HIVE",
  };
  const frameByEn = (en: string) => (fdb ? Object.values(fdb.frames).find((f) => f.en === en) : undefined);
  const room = (x: { type: string; ch: string }) => {
    if (x.type === "DT_PROTOFRAME" && x.ch === "Devil") return { name: wdb?.cq.title.roatheName ?? "Roathe", icon: null, boss: true };
    if (x.type === "DT_PROTOFRAME" || x.type === "DT_BOSS") {
      const f = frameByEn(x.ch);
      return { name: f?.name ?? x.ch, icon: f?.icon ?? null, boss: true };
    }
    return { name: DT_MT[x.type] ? missionName(DT_MT[x.type]) : "", icon: null, boss: false };
  };
  const rooms = $derived((w?.descent?.rooms ?? []).map((x, i) => ({ n: i + 1, ...room(x) })));

  const calText = (type: string, ids: string[]) => {
    if (type === "CET_CHALLENGE") return wdb?.cal[ids[0]] ?? ids[0].split("/").pop();
    if (type === "CET_REWARD") return ids.map((id) => rewardName(wdb, id)).join(` ${t("week.or")} `);
    if (type === "CET_UPGRADE") return t("week.cal.upgrade", { n: ids.length });
    return "";
  };
  const upgradePicked = (ids: string[]) => !!inv?.week?.cal?.up.some((u) => ids.includes(u));

  // Archimedea reward tier shown: silver / gold / legendary.
  let labTier = $state(1);
  let hexTier = $state(1);
  const TIERS: Key[] = ["week.tier.silver", "week.tier.gold", "week.tier.legend"];

  const ago = (ms: number) => {
    const m = Math.max(0, Math.round((now - ms) / 60_000));
    return m < 60
      ? t("coll.minAgo", { v: m })
      : m < 48 * 60
        ? t("coll.hAgo", { v: Math.round(m / 60) })
        : new Date(ms).toLocaleString(locale(), { day: "numeric", month: "long", hour: "2-digit", minute: "2-digit" });
  };
  const reset = $derived(weekEnd(now));
</script>

{#snippet mark(done: boolean | null)}
  {#if done === true}<span class="st ok" title={t("week.done")}>✓</span>{:else if done === false}<span class="st no" title={t("week.notDone")}></span>{/if}
{/snippet}

{#snippet conquest(id: "lab" | "hex", q: Conquest, tier: number, setTier: (n: number) => void)}
  <section class="card" data-card={id}>
    <header>
      <h2>{T(id, id === "lab" ? "week.lab" : "week.hex")}</h2>
      <span class="sub">{t("week.reset", { left: left(q.until - now) })}</span>
    </header>
    <div class="missions">
      {#each q.missions as m, i (i)}
        {@const dev = named(id === "lab" ? wdb?.cq.lab : wdb?.cq.hex, m.deviation)}
        <div class="mission">
          <span class="idx">{i + 1}</span>
          <div class="mbody">
            <b>{missionName(m.type, id === "lab")}</b>
            <small>{wdb?.cq.fac[m.faction] ?? m.faction}</small>
            <div class="mod dev" title={dev.d}>
              <span class="mk">{t("week.deviation")}</span>
              <span>{dev.n}</span>
              {#if dev.d}<em>{dev.d}</em>{/if}
            </div>
            {#each m.hardRisks as rk (rk)}
              {@const x = named(wdb?.cq.risk, rk)}
              <div class="mod" class:elite={!m.risks.includes(rk)} title={x.d}>
                <span class="mk">{m.risks.includes(rk) ? t("week.risk") : t("week.riskElite")}</span>
                <span>{x.n}</span>
                {#if x.d}<em>{x.d}</em>{/if}
              </div>
            {/each}
          </div>
        </div>
      {/each}
    </div>
    {#if q.vars.length}
      <div class="vars">
        <span class="lbl">{t("week.personal")}</span>
        <div class="chips">
          {#each q.vars as v (v)}
            {@const x = named(wdb?.cq.mod, v)}
            <span class="chip" title={x.d}>{x.n}</span>
          {/each}
        </div>
      </div>
    {/if}
    {#if wdb}
      <div class="rhead">
        <span class="lbl">{t("week.rewards")}</span>
        <div class="seg mini">
          {#each TIERS as k, i (k)}<button class:on={tier === i} onclick={() => setTier(i)}>{t(k)}</button>{/each}
        </div>
      </div>
      <Rewards list={(id === "lab" ? wdb.rw.lab : wdb.rw.hex)[tier] ?? []} hint={t("week.conquestHint")} />
    {/if}
  </section>
{/snippet}

<div class="section" class:compact bind:this={root}>
  <section class="hero">
    <div class="ring" class:done={weekP >= 1} title={t("week.ringHint")}>
      <svg viewBox="0 0 120 120">
        <circle cx="60" cy="60" r={R} class="track" />
        <circle cx="60" cy="60" r={R} class="arc" stroke-dasharray="{C * weekP} {C}" transform="rotate(-90 60 60)" />
      </svg>
      <div class="in">
        <b>{tracked.length ? Math.round(weekP * 100) : "—"}<i>{tracked.length ? "%" : ""}</i></b>
        <small>{t("week.ofWeek")}</small>
      </div>
    </div>
    <div class="who">
      {#if !compact}<h1>{t("week.title")}</h1>{/if}
      <div class="state">
        {t("week.resetIn")} <b>{left(reset - now)}</b>
        <span class="dim">· {new Date(reset).toLocaleString(locale(), { weekday: "long", hour: "2-digit", minute: "2-digit" })}</span>
      </div>
      <div class="meta">
        {#if inv && known}
          <span>{t("inv.at", { v: ago(inv.at) })}</span>
          {#if inventory.auto}<span class="auto">● {t("inv.autoOn")}</span>{/if}
          <button onclick={() => inventory.refresh()} disabled={inventory.busy}>{inventory.busy ? t("inv.refreshing") : t("inv.refresh")}</button>
        {:else}
          <span>{inv ? t("week.oldSnapshot") : t("week.noInv")}</span>
          {#if inv}<button onclick={() => inventory.refresh()} disabled={inventory.busy}>{inventory.busy ? t("inv.refreshing") : t("inv.refresh")}</button>{/if}
        {/if}
      </div>
      {#if inventory.error}<p class="err">{inventory.error.startsWith("rust.") ? fromRust(inventory.error) : t(inventory.error as Key)}</p>{/if}
    </div>
    <div class="counts">
      {#if tracked.length}<div><b class:prog={fullDone > 0}>{fullDone}<i>/{tracked.length}</i></b><span>{t("week.c.done")}</span></div>{/if}
      {#if netra != null}<div><b>{netra}<i>/{NETRA_MAX}</i></b><span>{t("week.c.netra")}</span></div>{/if}
      {#if nwTotal}<div><b>{num(known ? nwLeft : nwTotal)}</b><span>{t("week.c.standing")}</span></div>{/if}
      {#if nwRank}<div><b>{nwRank[0]}</b><span>{t("week.c.nwRank")}</span></div>{/if}
    </div>
  </section>

  {#if !inv}<InvBar title="week.title" lead="week.lead" {compact} />{/if}

  {#if !w}
    <div class="panel"><div class="empty"><span>{world.error ? t("world.error", { error: world.error }) : t("common.loading")}</span></div></div>
  {:else}
    <!-- The orbit: every activity as a ring; full and green = done, empty outline = the snapshot doesn't know. -->
    <div class="orbit">
      {#each orbs as o, i (i)}
        <button class="orb" class:full={o.p === 1} class:unknown={o.p == null} onclick={() => go(o.id)} title={o.label}>
          <span class="o">
            <svg viewBox="0 0 48 48">
              <circle cx="24" cy="24" r={r} class="track" />
              {#if o.p != null}<circle cx="24" cy="24" r={r} class="arc" stroke-dasharray="{c * o.p} {c}" transform="rotate(-90 24 24)" />{/if}
            </svg>
            <span class="ov">{o.p === 1 ? "✓" : o.v}</span>
          </span>
          <span class="ol">{o.label}</span>
        </button>
      {/each}
    </div>

    <div class="grid">
      {#if w.archon}
        <section class="card archon" data-card="archon" style:--hue={shard ? SHARD_HUE[shard[2]] : "var(--accent)"}>
          <header>
            <h2>{T("archon", "week.archon")}</h2>
            {@render mark(archon)}
          </header>
          <div class="boss">
            {#if shard?.[1]}<span class="glow"><img src={iconUrl(shard[1])} alt="" /></span>{/if}
            <div>
              <b>{shard?.[3] ?? w.archon.boss}</b>
              <small>{t("week.archonPays")} <span class="hue">{shard?.[0] ?? ""}</span></small>
            </div>
          </div>
          <ol class="stages">
            {#each stages as s, i (s.node)}
              <li class:done={s.done === true}>
                <span class="sn">{s.done ? "✓" : i + 1}</span>
                <div>
                  <b>{missionName(s.type)}</b>
                  <small>{nodeName(s.node)}</small>
                </div>
              </li>
            {/each}
          </ol>
          {#if wdb}<Rewards list={wdb.rw.archon} hint={t("week.archonHint")} />{/if}
        </section>
      {/if}

      <section class="card" data-card="netra">
        <header>
          <h2>{t("week.netra")}</h2>
          {@render mark(netra == null ? null : netra === 0)}
        </header>
        <div class="pips big" title={netra != null ? t("week.netraLeft", { n: netra, max: NETRA_MAX }) : ""}>
          {#each Array(NETRA_MAX) as _, i}<i class:used={netra != null && i < NETRA_MAX - netra}>{i + 1}</i>{/each}
          <span class="pl">{netra != null ? t("week.netraLeft", { n: netra, max: NETRA_MAX }) : t("week.netraMax", { max: NETRA_MAX })}</span>
        </div>
        {#if wdb}<Rewards list={wdb.rw.netra} hint={t("week.netraHint")} />{/if}
      </section>

      {#if w.lab}{@render conquest("lab", w.lab, labTier, (n) => (labTier = n))}{/if}
      {#if w.hex}{@render conquest("hex", w.hex, hexTier, (n) => (hexTier = n))}{/if}

      {#if w.descent}
        <section class="card wide" data-card="descent">
          <header>
            <h2>{T("descent", "week.descent")}</h2>
            <span class="sub">
              {t("week.descentNormal")} <b>{dNormal ?? "—"}/{floors}</b> · {t("week.sp")} <b>{dHard ?? "—"}/{floors}</b>
            </span>
          </header>
          <div class="floors">
            {#each rooms as f (f.n)}
              <div
                class="fl"
                class:boss={f.boss}
                class:n={dNormal != null && f.n <= dNormal}
                class:h={dHard != null && f.n <= dHard}
                class:prize={f.n === 6 || f.n === 13 || f.n === 20}
                title="{t('week.floor', { n: f.n })}{f.name ? ` · ${f.name}` : ''}"
              >
                {#if f.icon}<img src={iconUrl(f.icon)} alt="" />{:else}<span>{f.n}</span>{/if}
                {#if f.boss}<small>{f.name}</small>{/if}
              </div>
            {/each}
          </div>
          <p class="legend">
            <span><i class="lg n"></i>{t("week.descentNormal")}</span>
            <span><i class="lg h"></i>{t("week.sp")}</span>
            <span><i class="lg prize"></i>{t("week.descentPrize")}</span>
          </p>
          {#if wdb}
            <div class="cols">
              <div>
                <span class="lbl">{t("week.dArc")}</span>
                <Rewards list={wdb.rw.descent.arc} show={9} />
              </div>
              <div>
                <span class="lbl">{t("week.dTri")}</span>
                <Rewards list={wdb.rw.descent.triSp} show={5} hint={t("week.dTriHint")} />
              </div>
              <div>
                <span class="lbl">{t("week.dBoss", { name: wdb.cq.title.roatheName ?? "" })}</span>
                <Rewards list={wdb.rw.descent.boss} show={8} />
              </div>
              <div>
                <span class="lbl">{t("week.dFloors")}</span>
                <Rewards list={[...wdb.rw.descent.rare, ...wdb.rw.descent.unc]} show={7} />
              </div>
            </div>
          {/if}
        </section>
      {/if}

      {#if frames.length || incs.length}
        <section class="card" data-card="circuit">
          <header>
            <h2>{T("circuit", "week.circuitTitle")}</h2>
            {#if w.circuit}<span class="sub">{t("week.reset", { left: left(w.circuit.until - now) })}</span>{/if}
          </header>
          {#if frames.length}
            <span class="lbl">{t("week.circuitFrames")}</span>
            <div class="tiles">
              {#each frames as { c: ch, f } (ch)}
                <div class="tile" class:miss={f?.owned === false}>
                  {#if f?.icon}<img src={iconUrl(f.icon)} alt="" />{/if}
                  <span>{f?.name ?? ch}</span>
                  {#if f?.owned}<OwnBadges owned mastered={null} size={16} />{:else if f?.owned === false}<small class="need">{t("week.needIt")}</small>{/if}
                </div>
              {/each}
            </div>
          {/if}
          {#if incs.length}
            <span class="lbl">{t("week.circuitInc")}</span>
            <div class="tiles">
              {#each incs as { c: ch, x } (ch)}
                <div
                  class="tile"
                  class:miss={x?.installed === false && !x?.held}
                  title={x?.installed ? t("week.incInstalled") : x?.held ? t("week.incHeld") : x?.installed === false ? t("week.incNone") : ""}
                >
                  {#if x?.icon}<img src={iconUrl(x.icon)} alt="" />{/if}
                  <span>{x ? x.name.replace(/^[^:]+:\s*/, "") : ch}</span>
                  {#if x?.installed}<OwnBadges owned mastered={null} size={16} />{:else if x?.held}<small class="held">{t("week.incHeldShort")}</small>{:else if x?.installed === false}<small class="need">{t("week.needIt")}</small>{/if}
                </div>
              {/each}
            </div>
          {/if}
          <p class="hint">{t("week.circuitHint")}</p>
        </section>
      {/if}

      {#if w.calendar && calRows.length}
        <section class="card" data-card="calendar">
          <header>
            <h2>{t("week.calendar")}</h2>
            <span class="sub">{calDone != null ? t("week.progress", { a: calDone, b: calRows.length }) : t("week.events", { n: calRows.length })}</span>
          </header>
          <div class="list">
            {#each calRows as d (d.i)}
              {@const done = calDay == null ? null : d.i <= calDay}
              <div class="item" class:done>
                <span class="tag">{t(d.type === "CET_CHALLENGE" ? "week.cal.challenge" : d.type === "CET_REWARD" ? "week.cal.reward" : "week.cal.upgradeTag")}</span>
                {#if d.type === "CET_REWARD"}
                  <span class="txt icons">
                    {#each d.ids as id, k (id)}
                      {#if k}<i class="or">{t("week.or")}</i>{/if}
                      <span class="ri">{#if rewardIcon(wdb, id)}<img src={iconUrl(rewardIcon(wdb, id))} alt="" />{/if}{rewardName(wdb, id)}</span>
                    {/each}
                  </span>
                {:else}
                  <span class="txt">{calText(d.type, d.ids)}{#if d.type === "CET_UPGRADE" && upgradePicked(d.ids)} · {t("week.cal.picked")}{/if}</span>
                {/if}
                {@render mark(done)}
              </div>
            {/each}
          </div>
        </section>
      {/if}

      {#if nw.length}
        <section class="card" data-card="nightwave">
          <header>
            <h2>{t("week.nightwave")}</h2>
            <span class="sub">
              {nwDone != null ? t("week.progress", { a: nwDone, b: nw.length }) : t("week.events", { n: nw.length })}
              {#if nwRank} · {t("week.nwRank", { n: nwRank[0] })}{/if}
            </span>
          </header>
          <div class="list">
            {#each [...nw].sort((a, b) => Number(a.daily) - Number(b.daily)) as ch (ch.id)}
              {@const n = wdb?.nw[ch.key]}
              {@const pr = nightwaveProgress(inv, ch, wdb)}
              <div class="item" class:done={!!pr && pr[0] >= pr[1]}>
                <span class="tag">{ch.daily ? t("week.daily") : t("week.weekly")}</span>
                <span class="txt">
                  <b>{n?.[0] ?? ch.key}</b>
                  {#if n?.[1]}<small>{n[1]}</small>{/if}
                </span>
                {#if pr && pr[1] > 1 && pr[0] < pr[1]}<span class="prog">{num(pr[0])}/{num(pr[1])}</span>{/if}
                {#if n?.[2]}<span class="rep">{num(n[2])}</span>{/if}
                {@render mark(pr ? pr[0] >= pr[1] : null)}
              </div>
            {/each}
          </div>
          {#if nwTotal}<p class="hint">{known ? t("week.nwLeft", { v: num(nwLeft), all: num(nwTotal) }) : t("week.nwAll", { all: num(nwTotal) })}</p>{/if}
        </section>
      {/if}

      <section class="card" data-card="npc">
        <header><h2>{t("week.npc")}</h2></header>
        {#if teshin.length}
          <div class="teshin">
            <span class="lbl">{t("week.teshin", { name: wdb?.cq.title.teshin ?? "" })}</span>
            <div class="offer">
              {#if teshin[0][1]}<img src={iconUrl(teshin[0][1])} alt="" />{/if}
              <div>
                <b>{teshin[0][0]}{#if teshin[0][2] > 1} ×{num(teshin[0][2])}{/if}</b>
                <small>{t("week.teshinNext")}: {teshin.slice(1).map((x) => `${x[0]}${x[2] > 1 ? ` ×${num(x[2])}` : ""}`).join(" → ")}</small>
              </div>
            </div>
          </div>
        {/if}
        <div class="list">
          <div class="item" class:done={clem === true}>
            <span class="txt"><b>{t("week.clem")}</b><small>{wdb?.cq.title.clem ?? ""}</small></span>
            {@render mark(clem)}
          </div>
          <div class="item" class:done={maroo === true}>
            <span class="txt"><b>{t("week.maroo")}</b><small>{wdb?.cq.title.maroo ?? ""}</small></span>
            {@render mark(maroo)}
          </div>
        </div>
      </section>
    </div>

    {#if known && inv}
      <p class="asof">{t("week.asOf", { time: new Date(inv.at).toLocaleString(locale(), { hour: "2-digit", minute: "2-digit", day: "numeric", month: "short" }) })}</p>
    {/if}
  {/if}
</div>

<style>
  .section {
    display: flex;
    flex-direction: column;
    gap: 16px;
    min-width: 0;
  }
  /* ---- head (as in «Орбитер») */
  .hero {
    display: grid;
    grid-template-columns: auto minmax(0, 1fr) auto;
    align-items: center;
    gap: 22px;
    padding: 18px 22px;
    border-radius: 16px;
    background: radial-gradient(ellipse at 0% 0%, rgba(201, 166, 107, 0.09), transparent 55%), var(--surface);
  }
  .compact .hero {
    gap: 16px;
    padding: 12px 16px;
  }
  @media (max-width: 980px) {
    .hero {
      grid-template-columns: auto minmax(0, 1fr);
    }
    .counts {
      grid-column: 1 / -1;
    }
  }
  .ring {
    position: relative;
    width: 116px;
    height: 116px;
  }
  .compact .ring {
    width: 84px;
    height: 84px;
  }
  .ring svg,
  .o svg {
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
    transition: stroke-dasharray 0.6s ease;
  }
  .ring.done .arc,
  .orb.full .arc {
    stroke: var(--good);
    filter: drop-shadow(0 0 6px rgba(111, 207, 151, 0.5));
  }
  .in {
    position: absolute;
    inset: 0;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
  }
  .in b {
    font-size: 32px;
    font-weight: 600;
    line-height: 1;
  }
  .in b i {
    font-style: normal;
    font-size: 16px;
    color: var(--text-faint);
  }
  .compact .in b {
    font-size: 24px;
  }
  .in small {
    margin-top: 3px;
    font-size: 10.5px;
    letter-spacing: 0.08em;
    text-transform: uppercase;
    color: var(--text-faint);
  }
  .who {
    min-width: 0;
  }
  .who h1 {
    margin: 0 0 6px;
    font-size: 22px;
    font-weight: 600;
  }
  .state {
    font-size: 14px;
    color: var(--text-dim);
  }
  .state b {
    color: var(--text);
    font-variant-numeric: tabular-nums;
  }
  .dim {
    color: var(--text-faint);
  }
  .meta {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 6px 14px;
    margin-top: 10px;
    font-size: 12.5px;
    color: var(--text-faint);
  }
  .meta .auto {
    color: var(--good);
  }
  .meta button {
    padding: 5px 12px;
    border-radius: 8px;
    background: var(--accent);
    color: #16120a;
    font-weight: 600;
    font-size: 12.5px;
  }
  .meta button:disabled {
    opacity: 0.5;
    cursor: default;
  }
  .err {
    margin: 8px 0 0;
    font-size: 12.5px;
    color: var(--warn);
  }
  .counts {
    display: grid;
    grid-template-columns: repeat(4, auto);
    gap: 4px 26px;
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
  .counts b i {
    font-style: normal;
    font-size: 15px;
    color: var(--text-faint);
  }
  .counts span {
    font-size: 12px;
    color: var(--text-faint);
  }
  .prog {
    color: var(--accent);
  }

  /* ---- orbit of activities */
  .orbit {
    display: flex;
    flex-wrap: wrap;
    gap: 6px 4px;
    padding: 10px 8px;
    border-radius: 16px;
    background: var(--glass, var(--surface));
    border: 1px solid var(--glass-line, transparent);
  }
  .orb {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 6px;
    width: 96px;
    padding: 6px 4px;
    border-radius: 12px;
  }
  .orb:hover {
    background: var(--surface);
  }
  .o {
    position: relative;
    width: 48px;
    height: 48px;
  }
  .o .track,
  .o .arc {
    stroke-width: 4;
  }
  .orb.unknown .track {
    stroke-dasharray: 2 4;
  }
  .ov {
    position: absolute;
    inset: 0;
    display: flex;
    align-items: center;
    justify-content: center;
    font-size: 12px;
    font-weight: 600;
    font-variant-numeric: tabular-nums;
  }
  .orb.full .ov {
    color: var(--good);
    font-size: 15px;
  }
  .ol {
    font-size: 11.5px;
    line-height: 1.25;
    text-align: center;
    color: var(--text-dim);
  }
  .orb.full .ol {
    color: var(--text-faint);
  }

  /* ---- cards */
  /* masonry: cards of different heights pack into columns without row gaps */
  .grid {
    columns: 380px;
    column-gap: 16px;
  }
  .compact .grid {
    columns: 340px;
  }
  .grid > .card {
    break-inside: avoid;
    margin-bottom: 16px;
  }
  .card {
    display: flex;
    flex-direction: column;
    gap: 12px;
    padding: 16px 18px;
    border-radius: 16px;
    background: var(--glass, var(--surface));
    border: 1px solid var(--glass-line, transparent);
    scroll-margin-top: 12px;
    min-width: 0;
  }
  .card.wide {
    column-span: all;
  }
  .card header {
    display: flex;
    align-items: center;
    gap: 10px;
  }
  .card h2 {
    flex: 1;
    margin: 0;
    font-size: 15px;
    font-weight: 600;
  }
  .sub {
    font-size: 12.5px;
    color: var(--text-faint);
    font-variant-numeric: tabular-nums;
  }
  .sub b {
    color: var(--text);
  }
  .lbl {
    display: block;
    margin-bottom: 4px;
    font-size: 10.5px;
    letter-spacing: 0.06em;
    text-transform: uppercase;
    color: var(--text-faint);
  }
  .hint {
    margin: 0;
    font-size: 12px;
    color: var(--text-faint);
    line-height: 1.4;
  }
  .st {
    flex: none;
    width: 20px;
    height: 20px;
    border-radius: 50%;
    display: flex;
    align-items: center;
    justify-content: center;
    font-size: 11px;
    font-weight: 700;
  }
  .st.ok {
    background: rgba(111, 207, 151, 0.16);
    color: var(--good);
  }
  .st.no {
    border: 1.5px solid var(--line);
  }

  /* Archon hunt: the shard glows in its color, the three missions as a track. */
  .boss {
    display: flex;
    align-items: center;
    gap: 14px;
  }
  .glow {
    flex: none;
    width: 56px;
    height: 56px;
    border-radius: 50%;
    display: flex;
    align-items: center;
    justify-content: center;
    background: radial-gradient(circle, color-mix(in srgb, var(--hue) 28%, transparent), transparent 70%);
  }
  .glow img {
    width: 44px;
    height: 44px;
    object-fit: contain;
    filter: drop-shadow(0 0 8px color-mix(in srgb, var(--hue) 60%, transparent));
  }
  .boss b {
    display: block;
    font-size: 16px;
    font-weight: 600;
  }
  .boss small {
    font-size: 12.5px;
    color: var(--text-dim);
  }
  .hue {
    color: var(--hue);
  }
  .stages {
    display: flex;
    flex-direction: column;
    gap: 0;
    margin: 0;
    padding: 0;
    list-style: none;
  }
  .stages li {
    position: relative;
    display: flex;
    align-items: center;
    gap: 12px;
    padding: 5px 0;
  }
  .stages li:not(:last-child)::after {
    content: "";
    position: absolute;
    left: 13px;
    top: 33px;
    height: calc(100% - 28px);
    width: 2px;
    background: var(--line);
  }
  .sn {
    flex: none;
    width: 28px;
    height: 28px;
    border-radius: 50%;
    display: flex;
    align-items: center;
    justify-content: center;
    font-size: 12px;
    font-weight: 600;
    border: 2px solid var(--line);
    color: var(--text-dim);
  }
  .stages li.done .sn {
    border-color: var(--good);
    color: var(--good);
    background: rgba(111, 207, 151, 0.1);
  }
  .stages b {
    display: block;
    font-size: 13px;
    font-weight: 500;
  }
  .stages small {
    font-size: 12px;
    color: var(--text-faint);
  }

  /* Netracells: five numbered pips. */
  .pips.big {
    display: flex;
    align-items: center;
    gap: 8px;
  }
  .pips.big i {
    width: 30px;
    height: 30px;
    border-radius: 50%;
    display: flex;
    align-items: center;
    justify-content: center;
    font-style: normal;
    font-size: 12px;
    font-weight: 600;
    border: 2px solid var(--accent);
    color: var(--accent);
    box-shadow: 0 0 10px rgba(201, 166, 107, 0.2);
  }
  .pips.big i.used {
    border-color: var(--line);
    color: var(--text-faint);
    box-shadow: none;
  }
  .pl {
    margin-left: 6px;
    font-size: 12.5px;
    color: var(--text-dim);
  }

  /* Archimedea */
  .missions {
    display: flex;
    flex-direction: column;
    gap: 10px;
  }
  .mission {
    display: flex;
    gap: 12px;
  }
  .idx {
    flex: none;
    width: 24px;
    height: 24px;
    border-radius: 50%;
    display: flex;
    align-items: center;
    justify-content: center;
    font-size: 11.5px;
    font-weight: 600;
    background: var(--surface-2);
    color: var(--text-dim);
  }
  .mbody {
    flex: 1;
    min-width: 0;
    display: flex;
    flex-direction: column;
    gap: 3px;
  }
  .mbody > b {
    font-size: 13.5px;
    font-weight: 600;
  }
  .mbody > small {
    margin-bottom: 3px;
    font-size: 12px;
    color: var(--text-faint);
  }
  .mod {
    display: grid;
    grid-template-columns: 92px minmax(0, 1fr);
    gap: 0 8px;
    font-size: 12.5px;
    color: var(--text);
  }
  .mod em {
    grid-column: 2;
    font-style: normal;
    font-size: 11.5px;
    color: var(--text-faint);
    line-height: 1.35;
  }
  .mk {
    font-size: 10.5px;
    letter-spacing: 0.04em;
    text-transform: uppercase;
    color: var(--text-faint);
    padding-top: 2px;
  }
  .mod.dev .mk {
    color: var(--accent);
  }
  .mod.elite .mk {
    color: var(--warn);
  }
  .vars .chips,
  .tiles {
    display: flex;
    flex-wrap: wrap;
    gap: 6px;
  }
  .chip {
    padding: 4px 10px;
    border-radius: 999px;
    background: var(--surface);
    font-size: 12.5px;
    cursor: default;
  }
  .rhead {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 10px;
  }
  .rhead .lbl {
    margin: 0;
  }
  .seg.mini button {
    padding: 4px 10px;
    font-size: 12px;
  }

  /* Descendia: 21 floors; the inner fill = normal, the outer ring = Steel Path. */
  .floors {
    display: grid;
    grid-template-columns: repeat(21, minmax(0, 1fr));
    gap: 10px 6px;
  }
  .fl {
    position: relative;
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 3px;
  }
  @media (max-width: 1100px) {
    .floors {
      grid-template-columns: repeat(auto-fill, minmax(40px, 1fr));
    }
  }
  .fl > span,
  .fl > img {
    width: 34px;
    height: 34px;
    border-radius: 50%;
    display: flex;
    align-items: center;
    justify-content: center;
    font-size: 12px;
    font-weight: 600;
    color: var(--text-dim);
    background: var(--surface);
    box-shadow: 0 0 0 2px var(--line);
    object-fit: cover;
  }
  .fl.prize > span {
    color: var(--accent);
    box-shadow: 0 0 0 2px rgba(201, 166, 107, 0.45);
  }
  .fl.n > span,
  .fl.n > img {
    background: rgba(201, 166, 107, 0.2);
    color: var(--text);
  }
  .fl.h > span,
  .fl.h > img {
    box-shadow: 0 0 0 2px var(--good), 0 0 8px rgba(111, 207, 151, 0.35);
  }
  .fl small {
    max-width: 64px;
    font-size: 10.5px;
    line-height: 1.2;
    text-align: center;
    color: var(--text-faint);
  }
  .legend {
    display: flex;
    flex-wrap: wrap;
    gap: 14px;
    margin: 0;
    font-size: 12px;
    color: var(--text-faint);
  }
  .legend span {
    display: inline-flex;
    align-items: center;
    gap: 6px;
  }
  .lg {
    width: 12px;
    height: 12px;
    border-radius: 50%;
  }
  .lg.n {
    background: rgba(201, 166, 107, 0.45);
  }
  .lg.h {
    box-shadow: 0 0 0 2px var(--good);
  }
  .lg.prize {
    box-shadow: 0 0 0 2px rgba(201, 166, 107, 0.6);
  }
  .cols {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(300px, 1fr));
    gap: 14px 22px;
  }

  /* Circuit */
  .tile {
    display: inline-flex;
    align-items: center;
    gap: 8px;
    padding: 4px 10px 4px 4px;
    border-radius: 999px;
    background: var(--surface);
    font-size: 13px;
  }
  .tile img {
    width: 30px;
    height: 30px;
    object-fit: contain;
  }
  .tile.miss {
    color: var(--text-dim);
  }
  .held,
  .need {
    font-size: 11px;
    color: var(--accent);
  }

  /* Lists: calendar, Nightwave, NPCs */
  .list {
    display: flex;
    flex-direction: column;
    gap: 2px;
  }
  .item {
    display: flex;
    align-items: center;
    gap: 10px;
    padding: 6px 6px;
    border-radius: 9px;
    font-size: 12.5px;
  }
  .item:hover {
    background: var(--surface);
  }
  .item.done .txt {
    opacity: 0.5;
  }
  .tag {
    flex: none;
    width: 70px;
    font-size: 10.5px;
    letter-spacing: 0.04em;
    text-transform: uppercase;
    color: var(--text-faint);
  }
  .txt {
    flex: 1;
    min-width: 0;
    display: flex;
    flex-direction: column;
    color: var(--text-dim);
  }
  .txt.icons {
    flex-direction: row;
    flex-wrap: wrap;
    align-items: center;
    gap: 4px 8px;
    color: var(--text);
  }
  .ri {
    display: inline-flex;
    align-items: center;
    gap: 5px;
  }
  .ri img {
    width: 22px;
    height: 22px;
    object-fit: contain;
  }
  .or {
    font-style: normal;
    font-size: 11px;
    color: var(--text-faint);
  }
  .txt b {
    font-weight: 500;
    color: var(--text);
  }
  .txt small {
    font-size: 11.5px;
    color: var(--text-faint);
  }
  .prog {
    flex: none;
    font-size: 12px;
    color: var(--text-dim);
    font-variant-numeric: tabular-nums;
  }
  .rep {
    flex: none;
    font-size: 12px;
    color: var(--accent);
    font-variant-numeric: tabular-nums;
  }
  .offer {
    display: flex;
    align-items: center;
    gap: 12px;
  }
  .offer img {
    width: 44px;
    height: 44px;
    object-fit: contain;
  }
  .offer b {
    display: block;
    font-size: 14px;
    font-weight: 600;
  }
  .offer small {
    font-size: 12px;
    color: var(--text-faint);
  }
  .asof {
    margin: 0 4px;
    font-size: 11.5px;
    color: var(--text-faint);
  }
</style>
