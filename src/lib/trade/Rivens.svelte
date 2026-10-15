<script lang="ts">
  // «Торговля» → «Ривены»: the player's rivens from the inventory snapshot — weapon, name, stats with how good
  // each roll is (90–110 % range), rank, cycles, MR, disposition; what dissolving gives and the next cycle costs;
  // veiled ones with their challenge. Prices: a link to warframe.market riven auctions (no request from the app).
  import { num, t } from "$lib/i18n/index.svelte";
  import { inventory } from "$lib/inventory.svelte";
  import { AP_POLARITY } from "$lib/frames";
  import { loadRivens, parseRiven, challengeText, auctionsUrl, MAX_RANK, type RivensDb, type Riven } from "$lib/rivens";
  import OwnBadges from "$lib/components/OwnBadges.svelte";

  let db = $state<RivensDb | null>(null);
  loadRivens().then((d) => (db = d)).catch(() => {});

  type Sort = "weapon" | "disp" | "endo";
  const KEY = "dwc.rivens";
  let sort = $state<Sort>(read());
  function read(): Sort {
    try {
      const v = localStorage.getItem(KEY);
      return v === "disp" || v === "endo" ? v : "weapon";
    } catch {
      return "weapon";
    }
  }
  function setSort(v: Sort) {
    sort = v;
    try {
      localStorage.setItem(KEY, v);
    } catch {
      // storage unavailable
    }
  }

  const inv = $derived(inventory.data);
  const list = $derived(inv?.rivens ?? []);
  const open = $derived(
    db
      ? list
          .map((r) => parseRiven(db!, r))
          .filter((x): x is Riven => !!x)
          .sort((a, b) => (sort === "disp" ? b.disposition - a.disposition : sort === "endo" ? b.endo - a.endo : 0) || a.weapon.localeCompare(b.weapon))
      : [],
  );
  const veiled = $derived(db ? list.filter((r) => r.ch) : []);
  // Veiled rivens not picked up yet: RawRifleRandomMod… stacks.
  const unseen = $derived(
    db && inv?.rawMods
      ? Object.entries(inv.rawMods)
          .map(([id, n]) => ({ key: id.split("/").pop()!, n }))
          .filter((x) => db!.raw[x.key])
      : [],
  );
  const endoAll = $derived(open.reduce((s, r) => s + r.endo, 0));
  const pct = (x: number) => `${Math.round(x * 100)} %`;
</script>

{#if !inv}
  <p class="note">{t("quest.noInv")}</p>
{:else if !inv.rivens}
  <p class="note">{t("riven.oldInv")}</p>
{:else if !db}
  <p class="muted">{t("common.loading")}</p>
{:else}
  <section class="rivens">
    <header class="head">
      <h2>{t("riven.title")}</h2>
      <span class="sum">{t("riven.sum", { n: open.length, v: veiled.length + unseen.reduce((s, x) => s + x.n, 0), e: num(endoAll) })}</span>
      <div class="seg">
        <button class:on={sort === "weapon"} onclick={() => setSort("weapon")}>{t("riven.sort.weapon")}</button>
        <button class:on={sort === "disp"} onclick={() => setSort("disp")}>{t("riven.sort.disp")}</button>
        <button class:on={sort === "endo"} onclick={() => setSort("endo")}>{t("riven.sort.endo")}</button>
      </div>
    </header>

    {#if !open.length && !veiled.length && !unseen.length}
      <p class="muted">{t("riven.none")}</p>
    {/if}

    <div class="grid">
      {#each open as r (r.r.id)}
        {@const pol = r.r.pol ? AP_POLARITY[r.r.pol] : null}
        <article class="card">
          <div class="top">
            {#if r.icon}<img src={r.icon} alt="" loading="lazy" />{/if}
            <div class="who">
              <b>{r.name}</b>
              <span class="meta">
                {t("riven.mr", { v: r.r.mr ?? "—" })} · {t("riven.rank", { a: r.r.lvl, b: MAX_RANK })} · {t("riven.cycles", { n: r.r.rr })}
                {#if pol}<img class="pol" src="/icons/{pol}.png" alt={pol} title={pol} />{/if}
              </span>
            </div>
            <OwnBadges id={r.r.compat} size={18} />
          </div>
          <ul>
            {#each r.stats as s (s.tag + s.curse)}
              <li class:curse={s.curse}>
                <span class="txt">{s.text}{#if r.r.lvl < MAX_RANK}<small>{t("riven.atMax", { v: s.max })}</small>{/if}</span>
                <span class="roll" title={t("riven.rollHint", { v: pct(s.roll) })}><i style:width="{Math.round(s.roll * 100)}%"></i></span>
              </li>
            {/each}
          </ul>
          <div class="foot">
            <span title={t("riven.dispHint")}>{t("riven.disp", { v: num(r.disposition, 2) })}</span>
            <span title={t("riven.endoHint")}>{t("riven.endo", { v: num(r.endo) })}</span>
            <span title={t("riven.cycleHint")}>{t("riven.next", { v: num(r.nextCycle) })}</span>
            {#if r.slug}<a href={auctionsUrl(r.slug)} target="_blank" rel="noreferrer">{t("riven.market")} ↗</a>{/if}
          </div>
        </article>
      {/each}
    </div>

    {#if veiled.length || unseen.length}
      <h3>{t("riven.veiled")}</h3>
      <div class="veiled">
        {#each veiled as r (r.id)}
          <div class="v">
            <b>{db.types[r.type]?.name ?? r.type}</b>
            <span>{challengeText(db, r.ch!)}</span>
            <span class="prog">{num(r.ch!.done)} / {num(r.ch!.need)}</span>
          </div>
        {/each}
        {#each unseen as x (x.key)}
          <div class="v">
            <b>{db.raw[x.key].name}{x.n > 1 ? ` × ${x.n}` : ""}</b>
            <span>{t("riven.unseen")}</span>
          </div>
        {/each}
      </div>
    {/if}
    <p class="note2">{t("riven.foot")}</p>
  </section>
{/if}

<style>
  .note {
    font-size: 13px;
    color: var(--warn);
  }
  .muted {
    color: var(--text-faint);
  }
  .head {
    display: flex;
    align-items: baseline;
    gap: 14px;
    flex-wrap: wrap;
    margin-bottom: 12px;
  }
  h2 {
    margin: 0;
    font-size: 16px;
    font-weight: 600;
  }
  .sum {
    font-size: 13px;
    color: var(--text-dim);
  }
  .head .seg {
    margin-left: auto;
  }
  .grid {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(300px, 1fr));
    gap: 10px;
  }
  .card {
    display: flex;
    flex-direction: column;
    gap: 10px;
    padding: 14px 16px;
    border-radius: 14px;
    background: linear-gradient(160deg, rgba(150, 110, 220, 0.1), transparent 60%), var(--surface);
  }
  .top {
    display: flex;
    align-items: center;
    gap: 12px;
  }
  .top > img {
    width: 64px;
    height: 40px;
    object-fit: contain;
  }
  .who {
    flex: 1;
    min-width: 0;
    display: flex;
    flex-direction: column;
    gap: 2px;
  }
  .who b {
    font-size: 14px;
    font-weight: 600;
  }
  .meta {
    display: flex;
    align-items: center;
    gap: 6px;
    font-size: 12px;
    color: var(--text-dim);
  }
  .pol {
    width: 14px;
    height: 14px;
    opacity: 0.8;
  }
  ul {
    margin: 0;
    padding: 0;
    list-style: none;
    display: flex;
    flex-direction: column;
    gap: 6px;
  }
  li {
    display: grid;
    grid-template-columns: minmax(0, 1fr) 54px;
    align-items: center;
    gap: 10px;
    font-size: 13px;
    color: var(--good);
  }
  li.curse {
    color: var(--bad, #e57373);
  }
  .txt small {
    margin-left: 8px;
    font-size: 11px;
    color: var(--text-faint);
  }
  .roll {
    height: 4px;
    border-radius: 2px;
    background: var(--line);
    overflow: hidden;
  }
  .roll i {
    display: block;
    height: 100%;
    background: currentColor;
  }
  .foot {
    display: flex;
    flex-wrap: wrap;
    gap: 4px 14px;
    font-size: 12px;
    color: var(--text-dim);
  }
  .foot a {
    margin-left: auto;
    color: var(--accent);
  }
  h3 {
    margin: 18px 0 8px;
    font-size: 12px;
    font-weight: 600;
    letter-spacing: 0.08em;
    text-transform: uppercase;
    color: var(--text-faint);
  }
  .veiled {
    display: flex;
    flex-direction: column;
    gap: 6px;
  }
  .v {
    display: grid;
    grid-template-columns: 260px minmax(0, 1fr) auto;
    gap: 12px;
    padding: 8px 12px;
    border-radius: 10px;
    background: var(--surface);
    font-size: 13px;
  }
  .v span {
    color: var(--text-dim);
  }
  .prog {
    font-variant-numeric: tabular-nums;
  }
  .note2 {
    margin: 14px 0 0;
    font-size: 12px;
    line-height: 1.4;
    color: var(--text-faint);
  }
</style>
