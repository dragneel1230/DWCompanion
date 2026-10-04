<script lang="ts">
  // Account stats from the public profile: totals, the gear equipped right now, most used warframes
  // and weapons by time, top abilities and enemies.
  import { labels, locale, num, t } from "$lib/i18n/index.svelte";
  import { iconUrl } from "$lib/db";
  import type { Profile, Gear } from "$lib/profile.svelte";
  import { rankOf as itemRank, guess, type MasteryDb } from "$lib/mastery";
  import { loadAccount, hours, big, FOCUS_RU, type AccountDb } from "./account";

  let { p, mdb }: { p: Profile; mdb: MasteryDb } = $props();

  let acc = $state<AccountDb | null>(null);
  loadAccount().then((a) => (acc = a));

  const s = $derived(p.stats);
  const fmt = (n: number) => num(Math.round(n));
  const pct = (a: number, b: number) => (b ? t("unit.pct", { v: Math.round((a / b) * 100) }) : "—");

  const nameOf = (type: string) => {
    const m = mdb.items[type];
    if (m) return { name: m.name, icon: m.icon, cat: m.cat, it: m };
    const n = acc?.names[type];
    const g = guess(type);
    return { name: n?.name ?? g.name, icon: n?.icon ?? null, cat: g.cat, it: g };
  };

  const SLOT_RU = labels<Gear["slot"]>({ suit: "kind.frame", primary: "mastery.cat.primary", secondary: "mastery.cat.secondary", melee: "mastery.cat.melee" });
  const loadout = $derived(
    (p.loadout ?? []).map((g) => {
      const n = nameOf(g.type);
      return { ...g, n, rank: itemRank(g.xp, n.it.fl, n.it.max), max: n.it.max };
    }),
  );

  // Most used by time: warframes and weapons apart (companions go with weapons' neighbours: skipped).
  const used = $derived.by(() => {
    const frames: { n: ReturnType<typeof nameOf>; time: number; kills: number }[] = [];
    const weapons: typeof frames = [];
    for (const g of s?.gear ?? []) {
      const n = nameOf(g.type);
      const row = { n, time: g.time, kills: g.kills };
      if (n.cat === "warframe" || /\/Powersuits\//.test(g.type)) frames.push(row);
      else if (n.cat !== "companion" && n.cat !== "companionweapon" && !/Pets?\//.test(g.type)) weapons.push(row);
    }
    return { frames: frames.slice(0, 8), weapons: weapons.slice(0, 8) };
  });
  const topTime = (list: { time: number }[]) => Math.max(1, ...list.map((x) => x.time));

  // The player's own weapon name. Lich / Sister weapons carry "<loc key>|PAKK AISS": the generated
  // name is the part after the bar; a bare loc key is not a name.
  function ownName(n: string | undefined): string | null {
    if (!n) return null;
    const v = n.includes("|") ? n.split("|").pop()!.trim() : n;
    if (!v || v.startsWith("/Lotus/")) return null;
    return v === v.toUpperCase() ? v.toLowerCase().replace(/(^|\s)\S/g, (c) => c.toUpperCase()) : v;
  }

  const since = $derived(p.created ? new Date(p.created) : null);
  const years = $derived(since ? (Date.now() - since.getTime()) / (365.25 * 86_400_000) : 0);
</script>

{#if !s}
  <p class="muted">{t("stats.none")}</p>
{:else}
  <section class="totals">
    <div><b>{hours(s.played)}</b><span>{t("stats.played")}</span></div>
    <div><b>{fmt(s.missions.done)}</b><span>{t("stats.missions")}</span></div>
    <div><b>{big(s.kills)}</b><span>{t("stats.kills")}</span></div>
    <div><b>{big(s.income)}</b><span>{t("stats.income")}</span></div>
    {#if since}
      <div>
        <b>{years >= 1 ? t("stats.years", { n: Math.floor(years) }) : t("stats.months", { n: Math.round(years * 12) })}</b>
        <span>{t("stats.since", { d: since.toLocaleDateString(locale(), { month: "long", year: "numeric" }) })}{p.clan ? ` · ${t("stats.clan", { c: p.clan.replace(/#\d+$/, "") })}` : ""}</span>
      </div>
    {/if}
  </section>

  <section class="small-stats">
    <div><span>{t("stats.headshots")}</span><b>{pct(s.headshots, s.kills)}</b></div>
    <div><span>{t("stats.melee")}</span><b>{pct(s.meleeKills, s.kills)}</b></div>
    <div><span>{t("stats.failed")}</span><b>{fmt(s.missions.failed)} / {fmt(s.missions.quit)}</b></div>
    <div><span>{t("stats.deaths")}</span><b>{fmt(s.deaths)}</b></div>
    <div><span>{t("stats.revives")}</span><b>{fmt(s.revives)}</b></div>
    <div><span>{t("stats.pickups")}</span><b>{big(s.pickups)}</b></div>
    <div><span>{t("stats.scans")}</span><b>{fmt(s.scans)}</b></div>
    <div><span>{t("stats.ciphers")}</span><b>{fmt(s.ciphers)}</b></div>
    <div><span>{t("stats.fish")}</span><b>{fmt(s.fish)}</b></div>
    <div><span>{t("stats.destroyed")}</span><b>{big(s.destroyed)}</b></div>
  </section>

  {#if loadout.length}
    <section>
      <div class="head">
        <h2>{t("stats.loadout")}</h2>
        {#if p.focus && FOCUS_RU[p.focus]}<span class="hint">{t("stats.focus", { f: FOCUS_RU[p.focus] })}</span>{/if}
      </div>
      <div class="loadout">
        {#each loadout as g (g.slot)}
          <div class="gear" class:frame={g.slot === "suit"}>
            {#if g.n.icon}<img src={iconUrl(g.n.icon)} alt="" />{/if}
            <div>
              <small>{SLOT_RU[g.slot]}</small>
              <b>{g.n.name}</b>
              {#if ownName(g.name)}<i>«{ownName(g.name)}»</i>{/if}
              <span>{t("coll.lvl", { a: g.rank, b: g.max })}{g.forma ? ` · ${t("stats.forma", { n: g.forma })}` : ""}</span>
            </div>
          </div>
        {/each}
      </div>
    </section>
  {/if}

  <section class="two">
    {#each [{ t: t("stats.favFrames"), list: used.frames }, { t: t("stats.favWeapons"), list: used.weapons }] as col}
      <div class="col">
        <h2>{col.t}</h2>
        {#each col.list as x, i (i)}
          <div class="use">
            {#if x.n.icon}<img src={iconUrl(x.n.icon)} alt="" loading="lazy" />{:else}<span class="ph"></span>{/if}
            <div class="u">
              <div class="line"><b>{x.n.name}</b><span>{hours(x.time)}</span></div>
              <div class="bar"><i style:width="{(x.time / topTime(col.list)) * 100}%"></i></div>
              <small>{t("stats.killsN", { v: big(x.kills) })}</small>
            </div>
          </div>
        {/each}
      </div>
    {/each}
  </section>

  <section class="two">
    <div class="col">
      <h2>{t("stats.abilities")}</h2>
      {#each s.abilities as a (a.type)}
        {@const ab = acc?.abilities[a.type]}
        <div class="mini">
          {#if ab?.icon}<img src={iconUrl(ab.icon)} alt="" loading="lazy" />{:else}<span class="ph sm"></span>{/if}
          <span class="n">{ab?.name ?? (a.type.includes("OperatorTransference") ? t("stats.transference") : a.type.split("/").pop())}</span>
          <b>{fmt(a.used)}</b>
        </div>
      {/each}
    </div>
    <div class="col">
      <h2>{t("stats.enemies")}</h2>
      {#each s.enemies as e (e.type)}
        <div class="mini">
          <span class="n">{acc?.enemies[e.type] ?? e.type.split("/").pop()}</span>
          <b>{fmt(e.kills)}</b>
        </div>
      {/each}
    </div>
  </section>
{/if}

<style>
  section + section {
    margin-top: 18px;
  }
  .muted {
    color: var(--text-dim);
  }
  .totals {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(170px, 1fr));
    gap: 8px;
  }
  .totals div {
    display: flex;
    flex-direction: column;
    padding: 16px 18px;
    border-radius: 14px;
    background: linear-gradient(135deg, var(--accent-soft), var(--surface) 70%);
  }
  .totals b {
    font-size: 28px;
    font-weight: 600;
    font-variant-numeric: tabular-nums;
  }
  .totals span {
    font-size: 12px;
    color: var(--text-dim);
  }
  .small-stats {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(150px, 1fr));
    gap: 6px;
  }
  .small-stats div {
    display: flex;
    flex-direction: column;
    padding: 9px 12px;
    border-radius: 10px;
    background: var(--surface);
  }
  .small-stats span {
    font-size: 11.5px;
    color: var(--text-faint);
  }
  .small-stats b {
    font-size: 16px;
    font-weight: 600;
    font-variant-numeric: tabular-nums;
  }
  .head {
    display: flex;
    align-items: baseline;
    gap: 12px;
    margin-bottom: 10px;
  }
  h2 {
    margin: 0 0 10px;
    font-size: 16px;
    font-weight: 600;
  }
  .head h2 {
    margin: 0;
  }
  .hint {
    font-size: 12px;
    color: var(--text-faint);
  }
  .loadout {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(230px, 1fr));
    gap: 8px;
  }
  .gear {
    display: flex;
    align-items: center;
    gap: 12px;
    padding: 12px 14px;
    border-radius: 12px;
    background: var(--surface);
  }
  .gear.frame {
    background: linear-gradient(135deg, var(--accent-soft), var(--surface) 70%);
  }
  .gear img {
    width: 56px;
    height: 56px;
    object-fit: contain;
    flex: none;
  }
  .gear div {
    display: flex;
    flex-direction: column;
    min-width: 0;
  }
  .gear small {
    font-size: 11px;
    letter-spacing: 0.08em;
    text-transform: uppercase;
    color: var(--text-faint);
  }
  .gear b {
    font-size: 14.5px;
    font-weight: 600;
  }
  .gear i {
    font-size: 12px;
    color: var(--accent);
  }
  .gear span {
    font-size: 12px;
    color: var(--text-dim);
  }
  .two {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(320px, 1fr));
    gap: 18px;
  }
  .use {
    display: flex;
    align-items: center;
    gap: 12px;
    padding: 6px 0;
  }
  .use img,
  .ph {
    width: 40px;
    height: 40px;
    object-fit: contain;
    flex: none;
  }
  .ph {
    border-radius: 8px;
    background: var(--surface);
  }
  .ph.sm {
    width: 24px;
    height: 24px;
  }
  .u {
    flex: 1;
    min-width: 0;
  }
  .line {
    display: flex;
    justify-content: space-between;
    gap: 8px;
    font-size: 13.5px;
  }
  .line b {
    font-weight: 500;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }
  .line span {
    flex: none;
    color: var(--text-dim);
    font-variant-numeric: tabular-nums;
  }
  .u small {
    font-size: 11.5px;
    color: var(--text-faint);
  }
  .bar {
    height: 4px;
    margin: 4px 0 2px;
    border-radius: 4px;
    background: var(--surface-2);
    overflow: hidden;
  }
  .bar i {
    display: block;
    height: 100%;
    border-radius: 4px;
    background: var(--accent);
  }
  .mini {
    display: flex;
    align-items: center;
    gap: 10px;
    padding: 5px 8px;
    border-radius: 8px;
    font-size: 13px;
  }
  .mini:nth-child(odd) {
    background: var(--surface);
  }
  .mini img {
    width: 24px;
    height: 24px;
    object-fit: contain;
  }
  .mini .n {
    flex: 1;
    min-width: 0;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }
  .mini b {
    font-weight: 600;
    font-variant-numeric: tabular-nums;
  }
</style>
