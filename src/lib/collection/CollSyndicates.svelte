<script lang="ts">
  // Syndicates: what is still allowed today (standing per limit bin, focus) and every joined
  // syndicate with its rank and progress to the next one. From the public profile; daily values are
  // as of the profile read, and a read from before 00:00 UTC means the limits are full again.
  import { labels, num, t } from "$lib/i18n/index.svelte";
  import { iconUrl } from "$lib/db";
  import type { Profile } from "$lib/profile.svelte";
  import { loadAccount, standingCap, focusCap, leftToday, rankOf, FOCUS_RU, type AccountDb } from "./account";

  let { p }: { p: Profile } = $props();

  let acc = $state<AccountDb | null>(null);
  loadAccount().then((a) => (acc = a));

  const fmt = (n: number) => num(Math.round(n));
  const cap = $derived(standingCap(p.mr));

  // Joined syndicates with a daily limit, best rank first.
  const joined = $derived(
    acc
      ? (p.syndicates ?? [])
          .filter((s) => acc!.syndicates[s.tag])
          .map((s) => ({ ...s, info: acc!.syndicates[s.tag] }))
          .sort((a, b) => b.title - a.title || b.standing - a.standing)
      : [],
  );

  // One "today" meter per limit bin the player uses (Kahl's garrison goes by weekly missions: skipped).
  const BIN_RU: Record<string, string> = labels({ NORMAL: "synd.bin.normal", PVP: "synd.bin.pvp", LIBRARY: "synd.bin.library" });
  const bins = $derived.by(() => {
    const by = new Map<string, string[]>();
    for (const s of joined) {
      if (s.info.bin === "KAHL") continue;
      by.set(s.info.bin, [...(by.get(s.info.bin) ?? []), s.info.name]);
    }
    return [...by].map(([bin, names]) => {
      const left = leftToday(p.daily?.[bin], cap, p.at);
      return { bin, title: BIN_RU[bin] ?? names[0], names, left, used: cap - left };
    }).sort((a, b) => b.left - a.left);
  });
  const focusLeft = $derived(leftToday(p.dailyFocus, focusCap(p.mr), p.at));
  const stale = $derived(p.at < Math.floor(Date.now() / 86_400_000) * 86_400_000);
</script>

<section class="today">
  <div class="head">
    <h2>{t("synd.today")}</h2>
    <span class="hint">
      {stale ? t("synd.stale") : t("synd.atRefresh")} · {t("synd.reset")}
    </span>
  </div>
  <div class="meters">
    <div class="meter focus">
      <span class="t">{t("synd.focus")}{p.focus && FOCUS_RU[p.focus] ? ` · ${FOCUS_RU[p.focus]}` : ""}</span>
      <b>{fmt(focusLeft)}</b>
      <span class="of">{t("coll.ofAll", { n: fmt(focusCap(p.mr)) })}</span>
      <div class="bar"><i style:width="{(focusLeft / focusCap(p.mr)) * 100}%"></i></div>
    </div>
    {#each bins as b (b.bin)}
      <div class="meter" class:done={b.left === 0} title={b.names.join(", ")}>
        <span class="t">{b.title}</span>
        <b>{b.left === 0 ? t("synd.capped") : fmt(b.left)}</b>
        <span class="of">{b.names.length > 1 ? b.names.join(", ") : t("coll.ofAll", { n: fmt(cap) })}</span>
        <div class="bar"><i style:width="{(b.left / cap) * 100}%"></i></div>
      </div>
    {/each}
  </div>
</section>

<section class="list">
  {#if !acc}
    <p class="muted">{t("common.loading")}</p>
  {:else if !joined.length}
    <p class="muted">{t("synd.none")}</p>
  {/if}
  {#each joined as s (s.tag)}
    {@const rk = rankOf(s.info, s.title, s.standing)}
    <div class="syn" class:neg={s.title < 0} style:--c={s.info.color ?? "var(--accent)"}>
      <img src={iconUrl(s.info.icon)} alt="" loading="lazy" />
      <div class="body">
        <div class="name"><b>{s.info.name}</b><span class="rank">{rk.cur?.name ?? (s.title === 0 ? t("synd.neutral") : t("mp.rankLower", { r: s.title }))}</span></div>
        <div class="bar"><i style:width="{rk.into * 100}%"></i></div>
        <div class="sub">
          <span>{fmt(s.standing)} / {fmt(rk.hi)}</span>
          {#if rk.next}
            <span>{rk.capped ? t("synd.readyFor", { r: rk.next.name }) : t("synd.toNext", { r: rk.next.name, v: fmt(rk.hi - s.standing) })}</span>
          {:else}
            <span>{t("synd.top")}</span>
          {/if}
        </div>
      </div>
    </div>
  {/each}
</section>

<style>
  .head {
    display: flex;
    align-items: baseline;
    gap: 12px;
    flex-wrap: wrap;
    margin-bottom: 10px;
  }
  h2 {
    margin: 0;
    font-size: 16px;
    font-weight: 600;
  }
  .hint {
    font-size: 12px;
    color: var(--text-faint);
  }
  .meters {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(210px, 1fr));
    gap: 8px;
  }
  .meter {
    display: flex;
    flex-direction: column;
    gap: 2px;
    padding: 12px 14px;
    border-radius: 12px;
    background: var(--surface);
  }
  .meter .t {
    font-size: 12px;
    color: var(--text-dim);
  }
  .meter b {
    font-size: 20px;
    font-weight: 600;
    font-variant-numeric: tabular-nums;
  }
  .meter .of {
    font-size: 11.5px;
    color: var(--text-faint);
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }
  .meter.focus {
    background: linear-gradient(135deg, rgba(143, 184, 255, 0.12), var(--surface) 65%);
  }
  .meter.focus .bar i {
    background: #8fb8ff;
  }
  .meter.done b {
    color: var(--text-faint);
    font-size: 15px;
  }
  .bar {
    height: 4px;
    margin-top: 6px;
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
  .list {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(300px, 1fr));
    gap: 8px;
    margin-top: 18px;
  }
  .syn {
    display: flex;
    align-items: center;
    gap: 14px;
    padding: 12px 14px;
    border-radius: 12px;
    background: linear-gradient(120deg, color-mix(in srgb, var(--c) 10%, transparent), var(--surface) 55%);
    border: 1px solid color-mix(in srgb, var(--c) 18%, transparent);
  }
  .syn img {
    width: 46px;
    height: 46px;
    object-fit: contain;
    flex: none;
  }
  .syn .body {
    flex: 1;
    min-width: 0;
  }
  .name {
    display: flex;
    align-items: baseline;
    justify-content: space-between;
    gap: 8px;
  }
  .name b {
    font-size: 14px;
    font-weight: 600;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }
  .rank {
    flex: none;
    font-size: 12px;
    color: color-mix(in srgb, var(--c) 70%, var(--text));
  }
  .syn .bar i {
    background: color-mix(in srgb, var(--c) 75%, var(--accent));
  }
  .sub {
    display: flex;
    justify-content: space-between;
    gap: 8px;
    margin-top: 5px;
    font-size: 11.5px;
    color: var(--text-faint);
    font-variant-numeric: tabular-nums;
  }
  .neg .rank {
    color: var(--warn);
  }
  .muted {
    color: var(--text-dim);
  }
</style>
