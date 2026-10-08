<script lang="ts">
  // One goal, hand in hand: the next step on top (big, with where to go right now), then every step
  // in order — blueprints and parts, resources, foundry, ranking — each with its own "how" and a check.
  // Live hints: open fissures for the relic's tier, Varzia's Prime Resurgence, market prices.
  import { t } from "$lib/i18n/index.svelte";
  import { num } from "$lib/i18n/index.svelte";
  import { getDb, iconUrl, RARITY_RU } from "$lib/db";
  import { rate, wikiUrl, type DropsDb } from "$lib/drops";
  import { buildTime, CRAFT_KIND_RU } from "$lib/craft";
  import { rankOf } from "$lib/mastery";
  import { prices } from "$lib/prices.svelte";
  import { TIER_COLOR } from "$lib/hub/hub";
  import { world } from "$lib/hub/worldData.svelte";
  import Cur from "$lib/components/Cur.svelte";
  import { ERA_NUM, masteryOf, type HowIcon, type Plan, type RelicRef, type SectionId, type Step } from "./plan";
  import { goals, progress, stepState, type Facts, type Goal, type Why } from "./goals.svelte";
  import { bestXp, inventory } from "$lib/inventory.svelte";

  let {
    plan,
    goal,
    drops,
    facts,
    now,
    onadd,
    onnav,
  }: { plan: Plan; goal: Goal; drops: DropsDb; facts: Facts; now: number; onadd: (id: string) => void; onnav?: (href: string) => void } =
    $props();

  // In-app links: the hub hands them to the app window instead of navigating its own.
  function nav(e: MouseEvent) {
    if (!onnav) return;
    e.preventDefault();
    onnav((e.currentTarget as HTMLAnchorElement).getAttribute("href") ?? "/");
  }

  const d = getDb();
  const prog = $derived(progress(goal, plan, facts));
  const share = $derived(prog.total ? prog.done / prog.total : 0);
  const xp = $derived(bestXp(facts.profile?.xp[plan.id], plan.id));
  const rank = $derived(xp != null ? rankOf(xp, plan.frameLike, 30) : null);
  const set = $derived(d.sets[plan.id]);
  const resCount = $derived(plan.sections.find((s) => s.id === "res")?.steps.length ?? 0);

  // Prices: the whole set and each prime part ("or just buy it").
  $effect(() => {
    prices.want([set?.slug, ...plan.sections.flatMap((s) => s.steps.map((x) => x.slug))]);
  });
  const price = (slug: string | undefined) => (slug ? prices.sell[slug] : undefined);

  const surge = $derived.by(() => {
    const r = world.timers?.resurgence;
    if (!r || now > r.to) return false;
    return (r.items ?? r.frames ?? []).includes(plan.id);
  });

  // The open step: the next one by default; a click on another opens it instead.
  let picked = $state<string | null>(null);
  $effect(() => {
    plan.id;
    picked = null;
  });
  const openKey = $derived(picked ?? prog.next?.key ?? null);

  const SECTION_TITLE: Record<SectionId, () => string> = {
    bp: () => (plan.prime ? t("goal.sec.bpPrime") : t("goal.sec.bp")),
    res: () => t("goal.sec.res"),
    build: () => t("goal.sec.build"),
    rank: () => t("goal.sec.rank"),
  };
  const SECTION_HINT: Record<SectionId, () => string> = {
    bp: () => (plan.prime ? t("goal.sec.bpPrimeHint") : t("goal.sec.bpHint")),
    res: () => t("goal.sec.resHint"),
    build: () => t("goal.sec.buildHint"),
    rank: () => t("goal.sec.rankHint"),
  };

  // "Сарина Прайм: Каркас" inside Saryn Prime's guide reads as "Каркас".
  const short = (name: string) => (name.startsWith(plan.item.name + ": ") ? name.slice(plan.item.name.length + 2) : name);

  function title(s: Step): string {
    const name = short(s.name);
    switch (s.kind) {
      case "bp":
        if (s.direct) return t("goal.step.getMain", { name });
        return s.main ? t("goal.step.bpMain", { name }) : t("goal.step.bpPart", { name });
      case "relic":
        return s.main ? t("goal.step.relicMain", { name }) : t("goal.step.relicPart", { name });
      case "item":
        return t("goal.step.item", { name });
      case "res":
        return t("goal.step.res", { name });
      case "other":
        return t("goal.step.other", { name });
      case "build":
        return s.main ? t("goal.step.buildMain", { name }) : t("goal.step.buildPart", { name });
      case "rank":
        return t("goal.step.rank", { name });
    }
  }

  const GLYPH: Record<HowIcon, string> = {
    mission: "◎",
    bounty: "◇",
    enemy: "⚔",
    other: "·",
    market: "⇄",
    vendor: "⇄",
    syndicate: "✦",
    lab: "⌂",
    quest: "❖",
  };
  const WHY: Record<Why, () => string> = {
    hand: () => "",
    journal: () => t("goal.why.journal"),
    profile: () => t("goal.why.profile"),
    after: () => t("goal.why.after"),
    inventory: () => t("goal.why.inventory"),
  };

  // Relics: where the best active one drops, and fissures of its tier open right now (Omnia takes any).
  const live = (rs: RelicRef[] | undefined) => (rs ?? []).filter((r) => !r.vaulted);
  function relicFarm(key: string) {
    const list = drops.relics[key] ?? [];
    const best = list.find(([i]) => drops.sources[i].kind !== "other") ?? list[0];
    if (!best) return null;
    const s = drops.sources[best[0]];
    return { name: s.name, sub: s.sub ?? "", rate: best[2] ? rate(best[2]) : "" };
  }
  function fissuresFor(era: string) {
    const n = ERA_NUM[era];
    return world.fissures.filter((f) => f.expiry > now && !f.isStorm && (f.tierNum === n || (f.tierNum === 6 && n !== 5)));
  }
  function left(expiry: number): string {
    const s = Math.max(0, Math.floor((expiry - now) / 1000));
    const h = Math.floor(s / 3600);
    const m = Math.floor((s % 3600) / 60);
    return h ? t("unit.hm", { h, m }) : `${m}:${String(s % 60).padStart(2, "0")}`;
  }

  const link = (s: Step): { href: string; label: string } | null => {
    if (s.kind === "res") return { href: `/resources?id=${encodeURIComponent(s.id)}`, label: t("goal.more.res") };
    if (s.kind === "relic" && s.reward) return { href: `/item?id=${encodeURIComponent(s.reward)}`, label: t("goal.more.part") };
    if (s.kind === "bp" || s.kind === "item") return { href: `/resources?craft=${encodeURIComponent(s.id)}`, label: t("goal.more.craft") };
    return null;
  };

  const toggle = (s: Step) => goals.mark(goal.id, s.key, !stepState(goal, plan, s, facts).done);
  const ring = (v: number) => `${Math.round(v * 100)}`;
</script>

{#snippet how(s: Step)}
  {#if s.kind === "relic"}
    {@const act = live(s.relics)}
    {#if act.length}
      {@const best = act[0]}
      {@const farm = relicFarm(best.key)}
      {@const fis = fissuresFor(best.era)}
      <p class="say">{t("goal.relic.say", { relic: best.s, rarity: RARITY_RU[best.rarity].toLowerCase(), era: d.world.tier[`VoidT${ERA_NUM[best.era]}`] ?? best.era })}</p>
      <div class="lines">
        {#if farm}
          <div class="line"><span class="g">◎</span><span><b>{t("goal.relic.farm", { where: farm.name })}</b><small>{[farm.sub, farm.rate].filter(Boolean).join(" · ")}</small></span></div>
        {/if}
        <div class="line">
          <span class="g" style:color={TIER_COLOR[ERA_NUM[best.era]]}>◆</span>
          <span>
            {#if fis.length}
              <b>{t("goal.relic.fissuresNow", { n: fis.length })}</b>
              <small>{fis.slice(0, 3).map((f) => `${f.mission} · ${f.node} · ${left(f.expiry)}`).join("  ·  ")}</small>
            {:else}
              <b>{t("goal.relic.noFissures")}</b><small>{t("goal.relic.noFissuresHint")}</small>
            {/if}
          </span>
        </div>
      </div>
      <div class="chips">
        {#each act.slice(0, 10) as r (r.key)}
          <a href="/relic?id={encodeURIComponent(r.key)}" onclick={nav} class="chip" style:--c={TIER_COLOR[ERA_NUM[r.era]] ?? "var(--text-dim)"}>
            <i></i>{r.s} <small>{RARITY_RU[r.rarity]}</small>
          </a>
        {/each}
        {#if act.length > 10}<span class="more">{t("goal.relic.more", { n: act.length - 10 })}</span>{/if}
      </div>
    {:else if s.relics?.length}
      <p class="say">{surge ? t("goal.relic.vaultedSurge") : t("goal.relic.vaulted")}</p>
      {#if price(s.slug)}<p class="say">{t("goal.relic.buy")} <b class="pl"><Cur kind="plat" value={price(s.slug)!} /></b></p>{/if}
    {:else}
      <p class="say">{t("goal.noData")} <a href={wikiUrl(plan.item.en)} target="_blank" rel="noreferrer">{t("goal.wiki")} ↗</a></p>
    {/if}
    {#if act.length && price(s.slug)}<p class="alt">{t("goal.relic.orBuy")} <b class="pl"><Cur kind="plat" value={price(s.slug)!} /></b></p>{/if}
  {:else if s.kind === "build"}
    <p class="say">
      {s.main ? t("goal.build.main", { time: buildTime(s.time ?? 0) }) : t("goal.build.part", { time: buildTime(s.time ?? 0) })}
    </p>
    <div class="lines">
      <div class="line"><span class="g">⚒</span><span><b>{t("goal.build.cost", { v: num(s.credits ?? 0) })}</b><small>{t("goal.build.where")}</small></span></div>
    </div>
  {:else if s.kind === "rank"}
    <p class="say">{t("goal.rank.say", { v: num(masteryOf(plan)) })}</p>
    {#if rank != null}<p class="alt">{t("goal.rank.now", { n: rank })}</p>{/if}
  {:else if s.kind === "other"}
    <p class="say">{t("goal.other.say")} <a href={wikiUrl(s.name)} target="_blank" rel="noreferrer">{t("goal.wiki")} ↗</a></p>
  {:else}
    {#if s.kind === "item"}
      <p class="say">{t("goal.item.say", { n: s.count })}</p>
    {/if}
    {#if s.how.length}
      <div class="lines">
        {#each s.how as h, i (i)}
          <div class="line" class:first={i === 0}>
            <span class="g">{GLYPH[h.icon]}</span>
            <span><b>{h.text}</b>{#if h.sub}<small>{h.sub}</small>{/if}</span>
          </div>
        {/each}
      </div>
      {#if s.kind === "res"}<p class="alt">{t("goal.res.tip")}</p>{/if}
    {:else if s.kind === "item" && s.relics?.length}
      <p class="say">{t("goal.item.prime")}</p>
    {:else}
      <p class="say">{t("goal.noData")} <a href={wikiUrl(s.kind === "res" ? s.name : plan.item.en)} target="_blank" rel="noreferrer">{t("goal.wiki")} ↗</a></p>
    {/if}
    {#if s.kind === "item"}
      <div class="acts">
        {#if goals.get(s.id)}
          <button class="btn" onclick={() => goals.open(s.id)}>{t("goal.item.open")}</button>
        {:else}
          <button class="btn gold" onclick={() => onadd(s.id)}>{t("goal.item.add")}</button>
        {/if}
      </div>
    {/if}
  {/if}
  {@const l = link(s)}
  {#if l}<a class="more-link" href={l.href} onclick={nav}>{l.label} →</a>{/if}
{/snippet}

<div class="guide">
  <!-- Head: the item, how far along, what it costs in total. -->
  <section class="panel head">
    <div class="pic">{#if plan.item.icon}<img src={iconUrl(plan.item.icon)} alt="" />{/if}</div>
    <div class="info">
      <h1>{plan.item.name}</h1>
      <div class="tags">
        <span class="tag">{CRAFT_KIND_RU[plan.item.kind]}</span>
        {#if plan.prime}<span class="tag gold">{t("goal.tag.prime")}</span>{/if}
        {#if surge}<span class="tag surge">{t("goal.tag.surge")}</span>{/if}
        {#if rank != null}<span class="tag good">{t("goal.tag.rank", { n: rank })}</span>{/if}
      </div>
      <div class="stats">
        {#if plan.credits}<span><b>{num(plan.credits)}</b> {t("goal.stat.credits")}</span>{/if}
        {#if plan.time}<span><b>{buildTime(plan.time)}</b> {t("goal.stat.foundry")}</span>{/if}
        {#if resCount}<span><b>{resCount}</b> {t("goal.stat.res", { n: resCount })}</span>{/if}
        <span><b>+{num(masteryOf(plan))}</b> {t("goal.stat.mastery")}</span>
        {#if set && price(set.slug)}<span class="buy">{t("goal.stat.set")} <b class="pl"><Cur kind="plat" value={price(set.slug)!} /></b></span>{/if}
      </div>
    </div>
    <div class="ring" title={t("goal.progress", { done: prog.done, total: prog.total })}>
      <svg viewBox="0 0 44 44">
        <circle cx="22" cy="22" r="19" class="track" />
        <circle cx="22" cy="22" r="19" class="fill" style:stroke-dasharray="{share * 119.4} 119.4" />
      </svg>
      <span><b>{ring(share)}%</b><small>{prog.done}/{prog.total}</small></span>
    </div>
  </section>

  {#if surge}
    <div class="banner surge">{t("goal.banner.surge")}</div>
  {/if}
  {#if !plan.known}
    <div class="banner">{t("goal.banner.unknown")} <a href={wikiUrl(plan.item.en)} target="_blank" rel="noreferrer">{t("goal.wiki")} ↗</a></div>
  {/if}

  <!-- Next step: the one thing to do now. -->
  {#if prog.next}
    {@const s = prog.next}
    <section class="panel next">
      <div class="next-head">
        <span class="label">{t("goal.next")}</span>
        <span class="where">{SECTION_TITLE[plan.sections.find((x) => x.steps.includes(s))?.id ?? "bp"]()}</span>
      </div>
      <div class="next-body">
        <div class="pic small">{#if s.icon}<img src={iconUrl(s.icon)} alt="" />{/if}</div>
        <div class="grow">
          <h2>{title(s)}{#if s.count > 1}<i class="cnt">×{num(s.count)}</i>{/if}</h2>
          {@render how(s)}
        </div>
        <button class="btn gold done-btn" onclick={() => toggle(s)}>✓ {t("goal.markDone")}</button>
      </div>
    </section>
  {:else}
    <section class="panel next finished">
      <h2>{t("goal.finished")}</h2>
      <p>{t("goal.finishedHint")}</p>
    </section>
  {/if}

  <!-- The whole path. -->
  <div class="path">
    {#each plan.sections as sec, si (sec.id)}
      {@const done = sec.steps.filter((x) => stepState(goal, plan, x, facts).done).length}
      <section class="stage" class:complete={done === sec.steps.length}>
        <div class="stage-head">
          <span class="num">{done === sec.steps.length ? "✓" : si + 1}</span>
          <div>
            <h3>{SECTION_TITLE[sec.id]()} <small>{done}/{sec.steps.length}</small></h3>
            <p>{SECTION_HINT[sec.id]()}</p>
          </div>
        </div>
        <div class="steps">
          {#each sec.steps as s (s.key)}
            {@const st = stepState(goal, plan, s, facts)}
            {@const isOpen = openKey === s.key}
            <div class="step" class:done={st.done} class:open={isOpen} class:now={prog.next?.key === s.key}>
              <button class="check" onclick={() => toggle(s)} title={st.done ? t("goal.unmark") : t("goal.markDone")} aria-pressed={st.done}>
                {#if st.done}✓{/if}
              </button>
              <button class="row" onclick={() => (picked = isOpen ? "" : s.key)}>
                <span class="ic">{#if s.icon}<img src={iconUrl(s.icon)} alt="" loading="lazy" />{/if}</span>
                <span class="name">
                  {title(s)}{#if s.count > 1}<i class="cnt">×{num(s.count)}</i>{/if}
                  {#if !st.done && (s.kind === "res" || s.kind === "other") && inventory.count(s.id)}<i class="have">{t("goal.have", { v: num(inventory.count(s.id) ?? 0) })}</i>{/if}
                  {#if st.why && st.why !== "hand"}<em>{WHY[st.why]()}</em>{/if}
                </span>
                {#if s.kind === "relic"}
                  {@const n = live(s.relics).length}
                  <span class="hint">{n ? t("goal.hint.relics", { n }) : t("goal.hint.vaulted")}</span>
                {:else if s.kind === "build"}
                  <span class="hint">{buildTime(s.time ?? 0)}</span>
                {:else if s.kind === "rank"}
                  <span class="hint">{rank != null ? t("goal.hint.rank", { n: rank }) : ""}</span>
                {:else}
                  <span class="hint" class:unknown={!s.how[0]}>{s.how[0]?.text ?? (s.kind === "res" || s.kind === "other" ? t("goal.hint.noSource") : "")}</span>
                {/if}
                <span class="chev">{isOpen ? "−" : "+"}</span>
              </button>
              {#if isOpen && prog.next?.key !== s.key}
                <div class="detail">{@render how(s)}</div>
              {/if}
            </div>
          {/each}
        </div>
      </section>
    {/each}
  </div>
</div>

<style>
  .guide {
    display: flex;
    flex-direction: column;
    gap: 16px;
  }
  .panel.head {
    flex-direction: row;
    align-items: center;
    gap: 20px;
    padding: 18px 22px;
  }
  .pic {
    flex: none;
    width: 96px;
    height: 96px;
    display: grid;
    place-items: center;
  }
  .pic img {
    max-width: 100%;
    max-height: 100%;
    object-fit: contain;
    filter: drop-shadow(0 6px 16px rgba(0, 0, 0, 0.5));
  }
  .pic.small {
    width: 64px;
    height: 64px;
    border-radius: 14px;
    background: rgba(0, 0, 0, 0.25);
  }
  .pic.small img {
    max-width: 56px;
    max-height: 56px;
  }
  .info {
    flex: 1;
    min-width: 0;
  }
  h1 {
    margin: 0;
    font-size: 26px;
    font-weight: 600;
  }
  .tags {
    display: flex;
    flex-wrap: wrap;
    gap: 6px;
    margin-top: 6px;
  }
  .tag.gold {
    color: var(--accent);
    border-color: rgba(201, 166, 107, 0.4);
  }
  .tag.good {
    color: var(--good);
    border-color: rgba(111, 207, 151, 0.4);
  }
  .tag.surge {
    color: #b7a8ff;
    border-color: rgba(143, 120, 255, 0.45);
  }
  .stats {
    display: flex;
    flex-wrap: wrap;
    gap: 6px 18px;
    margin-top: 12px;
    font-size: 13px;
    color: var(--text-dim);
  }
  .stats b {
    color: var(--text);
    font-weight: 600;
  }
  b.pl {
    color: var(--plat);
    display: inline-flex;
    align-items: center;
    gap: 3px;
  }
  .ring {
    position: relative;
    flex: none;
    width: 92px;
    height: 92px;
  }
  .ring svg {
    width: 100%;
    height: 100%;
    transform: rotate(-90deg);
  }
  .ring circle {
    fill: none;
    stroke-width: 3.5;
  }
  .track {
    stroke: var(--surface-2);
  }
  .fill {
    stroke: var(--accent);
    stroke-linecap: round;
    transition: stroke-dasharray 0.3s;
    filter: drop-shadow(0 0 4px rgba(201, 166, 107, 0.45));
  }
  .ring span {
    position: absolute;
    inset: 0;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
  }
  .ring b {
    font-size: 19px;
  }
  .ring small {
    font-size: 11px;
    color: var(--text-faint);
  }

  .banner {
    padding: 11px 16px;
    border-radius: 12px;
    background: var(--surface);
    border: 1px solid var(--glass-line);
    font-size: 13px;
    color: var(--text-dim);
  }
  .banner.surge {
    color: #cfc4ff;
    background: rgba(110, 90, 220, 0.12);
    border-color: rgba(143, 120, 255, 0.35);
  }
  .banner a,
  .say a {
    color: var(--accent);
  }

  .panel.next {
    padding: 16px 20px 18px;
    background:
      radial-gradient(120% 140% at 0% 0%, rgba(201, 166, 107, 0.13), transparent 55%),
      var(--glass);
    border-color: rgba(201, 166, 107, 0.3);
  }
  .next-head {
    display: flex;
    align-items: baseline;
    gap: 10px;
    margin-bottom: 12px;
  }
  .label {
    font-size: 12px;
    font-weight: 600;
    letter-spacing: 0.14em;
    text-transform: uppercase;
    color: var(--accent);
  }
  .where {
    font-size: 12px;
    color: var(--text-faint);
  }
  .next-body {
    display: flex;
    gap: 16px;
    align-items: flex-start;
  }
  .grow {
    flex: 1;
    min-width: 0;
  }
  .next h2 {
    margin: 2px 0 8px;
    font-size: 19px;
    font-weight: 600;
  }
  .have {
    margin-left: 6px;
    font-style: normal;
    font-size: 12px;
    color: var(--accent);
  }
  .cnt {
    margin-left: 6px;
    font-style: normal;
    font-weight: 400;
    color: var(--text-dim);
  }
  .done-btn {
    flex: none;
    align-self: center;
  }
  .finished {
    text-align: center;
    padding: 26px;
  }
  .finished h2 {
    margin: 0 0 6px;
    color: var(--good);
  }
  .finished p {
    margin: 0;
    color: var(--text-dim);
  }

  .say {
    margin: 0 0 8px;
    font-size: 13.5px;
    line-height: 1.5;
    color: var(--text-dim);
  }
  .alt {
    margin: 8px 0 0;
    font-size: 12.5px;
    color: var(--text-faint);
  }
  .lines {
    display: flex;
    flex-direction: column;
    gap: 8px;
  }
  .line {
    display: flex;
    gap: 10px;
    align-items: flex-start;
  }
  .line .g {
    flex: none;
    width: 24px;
    height: 24px;
    display: grid;
    place-items: center;
    border-radius: 50%;
    background: var(--surface-2);
    color: var(--accent);
    font-size: 12px;
  }
  .line b {
    display: block;
    font-weight: 500;
    font-size: 14px;
    color: var(--text);
  }
  .line small {
    display: block;
    margin-top: 1px;
    font-size: 12px;
    color: var(--text-faint);
  }
  .chips {
    display: flex;
    flex-wrap: wrap;
    gap: 6px;
    margin-top: 10px;
  }
  .chip {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    padding: 3px 9px;
    border-radius: 8px;
    background: var(--surface-2);
    font-size: 12.5px;
  }
  .chip i {
    width: 6px;
    height: 6px;
    border-radius: 50%;
    background: var(--c);
    box-shadow: 0 0 6px var(--c);
  }
  .chip small {
    color: var(--text-faint);
  }
  .chip:hover {
    color: var(--accent);
  }
  .more {
    font-size: 12px;
    color: var(--text-faint);
    align-self: center;
  }
  .acts {
    margin-top: 10px;
  }
  .btn {
    padding: 8px 14px;
    border-radius: 10px;
    background: var(--surface-2);
    font-size: 13px;
  }
  .btn:hover {
    background: rgba(255, 255, 255, 0.11);
  }
  .btn.gold {
    background: var(--accent);
    color: #16120a;
    font-weight: 600;
  }
  .btn.gold:hover {
    filter: brightness(1.08);
  }
  .more-link {
    display: inline-block;
    margin-top: 10px;
    font-size: 12.5px;
    color: var(--accent);
  }

  .path {
    display: flex;
    flex-direction: column;
    gap: 10px;
  }
  .stage-head {
    display: flex;
    gap: 12px;
    align-items: flex-start;
    margin: 10px 0 8px 4px;
  }
  .num {
    flex: none;
    width: 28px;
    height: 28px;
    display: grid;
    place-items: center;
    border-radius: 50%;
    background: var(--surface-2);
    color: var(--accent);
    font-size: 13px;
    font-weight: 600;
  }
  .complete .num {
    background: rgba(111, 207, 151, 0.16);
    color: var(--good);
  }
  .stage-head h3 {
    margin: 3px 0 0;
    font-size: 15px;
    font-weight: 600;
  }
  .stage-head h3 small {
    margin-left: 6px;
    font-weight: 400;
    font-size: 12px;
    color: var(--text-faint);
  }
  .stage-head p {
    margin: 3px 0 0;
    font-size: 12.5px;
    color: var(--text-faint);
  }
  .steps {
    display: flex;
    flex-direction: column;
    padding: 4px;
    margin-left: 13px;
    border-left: 1px dashed rgba(255, 255, 255, 0.09);
    padding-left: 18px;
  }
  .step {
    position: relative;
    display: grid;
    grid-template-columns: 26px minmax(0, 1fr);
    column-gap: 10px;
    align-items: center;
    padding: 3px 0;
  }
  .check {
    width: 24px;
    height: 24px;
    border-radius: 50%;
    border: 1.5px solid rgba(255, 255, 255, 0.22);
    color: #16120a;
    font-size: 13px;
    font-weight: 700;
    display: grid;
    place-items: center;
    transition: background 0.12s, border-color 0.12s;
  }
  .check:hover {
    border-color: var(--accent);
  }
  .done .check {
    background: var(--good);
    border-color: var(--good);
  }
  .now .check {
    border-color: var(--accent);
    box-shadow: 0 0 0 3px rgba(201, 166, 107, 0.15);
  }
  .row {
    display: flex;
    align-items: center;
    gap: 10px;
    padding: 6px 10px 6px 6px;
    border-radius: 11px;
    text-align: left;
    min-width: 0;
  }
  .row:hover,
  .open .row {
    background: var(--surface);
  }
  .now .row {
    background: var(--accent-soft);
  }
  .ic {
    flex: none;
    width: 34px;
    height: 34px;
    display: grid;
    place-items: center;
  }
  .ic img {
    max-width: 34px;
    max-height: 34px;
    object-fit: contain;
  }
  .name {
    flex: 0 1 auto;
    min-width: 0;
    max-width: 60%;
    font-size: 14px;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }
  .name em {
    margin-left: 8px;
    font-style: normal;
    font-size: 11px;
    color: var(--good);
  }
  .done .name {
    color: var(--text-faint);
  }
  .hint {
    flex: 1;
    min-width: 0;
    text-align: right;
    font-size: 12px;
    color: var(--text-faint);
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }
  .hint.unknown {
    color: var(--warn);
    opacity: 0.75;
  }
  .chev {
    flex: none;
    width: 14px;
    color: var(--text-faint);
  }
  .detail {
    grid-column: 2;
    margin: 4px 0 10px;
    padding: 12px 14px;
    border-radius: 12px;
    background: var(--glass);
    border: 1px solid var(--glass-line);
  }
</style>
