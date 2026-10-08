<script lang="ts">
  // "Сейчас": where the player is (EE.log) and, in a fissure, the squad's relics with every possible
  // reward sorted by the overlay's priority (platinum / ducats / collection), the best one on top.
  import { needs } from "$lib/goals/watch.svelte";
  import { t } from "$lib/i18n/index.svelte";
  import { getDb, iconUrl, itemName, nodeOfMission, RARITY_RU, type Rarity } from "$lib/db";
  import { relicKey } from "$lib/rewards";
  import { prices } from "$lib/prices.svelte";
  import { journal, startOfDay } from "$lib/journal.svelte";
  import { parseRelicText, refineOfProjection } from "$lib/relicValue";
  import Lobby from "./Lobby.svelte";
  import LastRun from "./LastRun.svelte";
  import { readOverlaySettings, type Priority } from "$lib/overlaySettings.svelte";
  import { collNeed, loadCollCtx, type CollCtx, type CollMode } from "$lib/collection/need";
  import Cur from "$lib/components/Cur.svelte";
  import { refinement, type Mission, type View } from "./hub";

  let { mission, game, priority, onopen }: { mission: Mission | null; game: boolean; priority: Priority; onopen: (v: View) => void } =
    $props();

  const db = getDb();
  journal.start();

  const relics = $derived.by(() => {
    const seen = new Set<string>();
    const out: { key: string; name: string; s: string; icon: string; refine: string; mine: boolean }[] = [];
    const my = mission?.my_relic ? parseRelicText(mission.my_relic) : null;
    for (const p of mission?.relics ?? []) {
      const key = relicKey(p);
      const r = key ? db.relics[key] : undefined;
      const refine = refinement(p);
      if (!key || !r || seen.has(key + refine)) continue;
      seen.add(key + refine);
      out.push({ key, name: r.name, s: r.s, icon: r.icon, refine, mine: my?.key === key && my.refine === refineOfProjection(p) });
    }
    return out;
  });

  // "Martialis (Марс) - Разрыв: Лит" -> place and mission type.
  const where = $derived.by(() => {
    // Known node: its name and mission type from the data (interface language), not the client's text.
    const node = mission?.node ?? nodeOfMission(mission?.name);
    const reg = node ? db.world.regions[node.replace(/_.*$/, "")] : undefined;
    if (reg) return { place: reg.n, type: reg.m ?? "" };
    if (mission?.name) {
      const i = mission.name.lastIndexOf(" - ");
      return i > 0 ? { place: mission.name.slice(0, i), type: mission.name.slice(i + 3) } : { place: mission.name, type: "" };
    }
    return { place: t("journal.mission"), type: "" };
  });
  const fissure = $derived(relics.length > 0 || /Разрыв|Fissure/i.test(mission?.name ?? ""));

  const rewards = $derived.by(() => {
    const byId = new Map<string, { id: string; rarity: Rarity; from: string[] }>();
    for (const r of relics) {
      for (const rw of db.relics[r.key].rewards) {
        const cur = byId.get(rw.id);
        if (cur) cur.from.includes(r.s) || cur.from.push(r.s);
        else byId.set(rw.id, { id: rw.id, rarity: rw.rarity, from: [r.s] });
      }
    }
    return [...byId.values()].map((x) => {
      const it = db.items[x.id];
      const vaulted = !!it.relics.length && it.relics.every((r) => db.relics[r.relic]?.vaulted);
      return { ...x, it, vaulted };
    });
  });

  $effect(() => prices.want(rewards.map((r) => r.it.slug)));

  const plat = (r: (typeof rewards)[number]) => (r.it.slug ? prices.sell[r.it.slug] : null);

  // "Collection" priority: parts missing from a set first (collection/need.ts). Inventory / profile are re-read
  // when the squad's relics change (the main window refreshes them after missions).
  let coll = $state<{ ctx: CollCtx; mode: CollMode } | null>(null);
  $effect(() => {
    void relics;
    if (priority !== "collection") return void (coll = null);
    const mode = readOverlaySettings().collMode;
    loadCollCtx()
      .then((ctx) => (coll = { ctx, mode }))
      .catch(() => {});
  });
  const collOf = $derived(
    new Map(coll ? rewards.map((r) => [r.id, collNeed(r.id, coll!.mode, coll!.ctx)] as const).filter(([, n]) => n) : []),
  );

  // Today's relics from the journal, for the footer.
  const today = $derived(journal.list.filter((e) => e.t >= startOfDay(Date.now())));
  $effect(() => prices.want(today.map((e) => e.item?.slug)));
  const todayPlat = $derived(today.reduce((s, e) => s + ((e.item?.slug && prices.sell[e.item.slug]) || 0), 0));

  // Parts a goal waits for go first (the guide tab): that is what the player came for.
  const sorted = $derived(
    [...rewards].sort((a, b) => {
      const na = needs.need[a.id] ? 1 : 0;
      const nb = needs.need[b.id] ? 1 : 0;
      if (na !== nb) return nb - na;
      const ca = collOf.get(a.id)?.score ?? -1;
      const cb = collOf.get(b.id)?.score ?? -1;
      if (ca !== cb) return cb - ca;
      const pa = plat(a) ?? -1;
      const pb = plat(b) ?? -1;
      const da = a.it.ducats ?? 0;
      const db_ = b.it.ducats ?? 0;
      return priority === "ducats" ? db_ - da || pb - pa : pb - pa || db_ - da;
    }),
  );
  const bestValue = (r: (typeof rewards)[number] | undefined) =>
    !r ? 0 : collOf.has(r.id) ? 1 : priority === "ducats" ? (r.it.ducats ?? 0) : (plat(r) ?? 0);
</script>

<section class="panel mission">
  <header>
    <h2>{t("mission.now")}</h2>
    {#if game && mission?.active}<span class="live"><i></i>{t("mission.live")}</span>{/if}
  </header>
  <div class="body">
    {#if !game}
      <div class="empty short">
        <b>{t("mission.noGame")}</b>
        <span>{t("mission.noGameHint")}</span>
      </div>
      <LastRun />
    {:else if !mission?.active && mission?.lobby?.tier}
      <Lobby lobby={mission.lobby} myRelic={mission.my_relic} {onopen} />
    {:else if !mission?.active}
      <div class="empty short">
        <b>{t("mission.onShip")}</b>
        <span>{t("mission.onShipHint")}</span>
      </div>
      <LastRun />
    {:else}
      <div class="where">
        <b>{where.place}</b>
        {#if where.type}<span>{where.type}</span>{/if}
      </div>

      {#if relics.length}
        <div class="relics">
          {#each relics as r (r.key + r.refine)}
            <button class="relic" class:mine={r.mine} onclick={() => onopen({ kind: "relic", id: r.key })}>
              <img src={iconUrl(r.icon)} alt="" />
              <span>{r.name}<small>{r.refine}{r.mine ? ` · ${t("mission.yours")}` : ""}</small></span>
            </button>
          {/each}
        </div>

        <div class="section-title">{t("mission.possible")} · {rewards.length}</div>
        <div class="rows">
          {#each sorted as r, i (r.id)}
            <button class="row" class:best={i === 0 && (bestValue(r) > 0 || !!needs.need[r.id])} onclick={() => onopen({ kind: "item", id: r.id })}>
              <img src={iconUrl(r.it.icon)} alt="" loading="lazy" />
              <span class="name">
                {itemName(r.it)}
                {#if needs.need[r.id]}<em class="pick goal">⚑ {t("overlay.forGoal")}</em>
                {:else if collOf.has(r.id)}<em class="pick coll" title={collOf.get(r.id)?.name}>◈ {t(coll?.mode === "mr" ? "overlay.forMr" : "overlay.forSet")}</em>
                {:else if i === 0 && bestValue(r) > 0}<em class="pick">{t("mission.bestPick")}</em>{/if}
                <small>
                  <span class="rarity-{r.rarity}">{RARITY_RU[r.rarity]}</span>
                  {#if relics.length > 1} · {r.from.join(", ")}{/if}
                  {#if r.vaulted} · <span class="vault">{t("tag.inVault")}</span>{/if}
                </small>
              </span>
              <span class="num">{#if r.it.ducats}<Cur kind="ducats" value={r.it.ducats} />{/if}</span>
              <span class="num">
                {#if !r.it.slug}<span class="dash">—</span>
                {:else if plat(r) === undefined}<span class="dash pulse">···</span>
                {:else if plat(r) == null}<span class="dash">—</span>
                {:else}<Cur kind="plat" value={plat(r) ?? 0} />{/if}
              </span>
            </button>
          {/each}
        </div>
      {:else if fissure}
        <div class="empty">
          <span>{t("mission.relicsSoon")}</span>
        </div>
      {:else}
        <div class="empty"><span>{t("mission.notFissure")}</span></div>
      {/if}
    {/if}
    {#if today.length}
      <a class="today" href="/relics?tab=journal" title={t("mission.journalHint")}>
        <span>{t("mission.todayOpened")}</span>
        <b>{today.length}</b>
        <span>· {t("mission.worth")}</span>
        <b><Cur kind="plat" value={Math.round(todayPlat)} /></b>
        <span class="go">{t("mission.journal")} ↗</span>
      </a>
    {/if}
  </div>
</section>

<style>

  .today {
    display: flex;
    align-items: baseline;
    gap: 6px;
    margin: 14px 6px 0;
    padding: 10px 12px;
    border-radius: 12px;
    background: rgba(255, 255, 255, 0.035);
    font-size: 12.5px;
    color: var(--text-faint);
  }
  .today {
    width: calc(100% - 12px);
    text-align: left;
  }
  .today:hover {
    background: rgba(255, 255, 255, 0.06);
  }
  .go {
    margin-left: auto;
    color: var(--text-dim);
  }
  .today b {
    color: var(--text);
    font-weight: 600;
  }
  .live {
    margin-left: auto;
    display: flex;
    align-items: center;
    gap: 6px;
    font-size: 12px;
    color: var(--good);
  }
  .live i {
    width: 7px;
    height: 7px;
    border-radius: 50%;
    background: var(--good);
    box-shadow: 0 0 0 0 rgba(111, 207, 151, 0.6);
    animation: ping 1.8s infinite;
  }
  @keyframes ping {
    70% {
      box-shadow: 0 0 0 7px rgba(111, 207, 151, 0);
    }
    100% {
      box-shadow: 0 0 0 0 rgba(111, 207, 151, 0);
    }
  }
  .where {
    display: flex;
    flex-direction: column;
    gap: 2px;
    padding: 2px 8px 12px;
  }
  .where b {
    font-size: 20px;
    font-weight: 600;
  }
  .where span {
    color: var(--accent);
    font-size: 13px;
  }
  .relics {
    display: flex;
    flex-wrap: wrap;
    gap: 6px;
    padding: 0 6px;
  }
  .relic {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 5px 12px 5px 6px;
    border-radius: 12px;
    background: rgba(255, 255, 255, 0.045);
    border: 1px solid transparent;
    text-align: left;
  }
  .relic.mine {
    border-color: rgba(201, 166, 107, 0.55);
  }
  .relic:hover {
    border-color: rgba(201, 166, 107, 0.4);
  }
  .relic img {
    width: 30px;
    height: 30px;
    object-fit: contain;
  }
  .relic span {
    display: flex;
    flex-direction: column;
    font-size: 13px;
    line-height: 1.2;
  }
  .relic small {
    font-size: 11px;
    color: var(--text-faint);
  }
  .section-title {
    margin: 18px 8px 6px;
  }
  .row .num {
    width: 64px;
  }
  .row small {
    font-size: 11.5px;
  }
  .vault {
    color: var(--warn);
  }
  .pick {
    margin-left: 8px;
    padding: 1px 7px;
    border-radius: 999px;
    font-style: normal;
    font-size: 10.5px;
    letter-spacing: 0.06em;
    text-transform: uppercase;
    color: #16120a;
    background: var(--accent);
    vertical-align: 2px;
  }
  /* A goal's part: the guide's green instead of gold. */
  .pick.goal {
    background: var(--good);
  }
  .pick.coll {
    background: #8fb3f0;
  }
  .dash {
    color: var(--text-faint);
  }
  .pulse {
    animation: pulse 1s infinite;
  }
  @keyframes pulse {
    50% {
      opacity: 0.3;
    }
  }
  .empty.short {
    flex: none;
    padding-bottom: 0;
  }
</style>
