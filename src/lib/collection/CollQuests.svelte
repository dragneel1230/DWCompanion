<script lang="ts">
  // Quests: done, in progress (stage of all), given but not started, or not given yet with the quest that opens
  // it. Names, stages and rewards are DE's (mastery.json `quests`, ExportKeys); the order and what opens what
  // are the wiki's; the player's progress is the inventory snapshot (QuestKeys).
  import { locale, t } from "$lib/i18n/index.svelte";
  import { iconUrl } from "$lib/db";
  import { inventory } from "$lib/inventory.svelte";
  import type { MasteryDb, Quest } from "$lib/mastery";

  let { mdb }: { mdb: MasteryDb } = $props();

  const quests = $derived(mdb.quests ?? []);
  const byId = $derived(new Map(quests.map((q) => [q.id, q])));
  const mine = $derived(inventory.data?.quests);

  type State = "done" | "active" | "given" | "open" | "locked";
  function stateOf(q: Quest): State {
    const x = mine?.[q.id];
    if (x?.[1]) return "done";
    if (x) return x[0] > 0 ? "active" : "given";
    return q.after && !mine?.[q.after]?.[1] ? "locked" : "open";
  }

  // The main story with its branches right after the quest that opens them; side quests apart.
  type Line = { q: Quest; s: State; depth: number };
  const lines = $derived.by(() => {
    const kids = new Map<string, Quest[]>();
    for (const q of quests) if (q.after) kids.set(q.after, [...(kids.get(q.after) ?? []), q]);
    const out: Line[] = [];
    const walk = (q: Quest, depth: number) => {
      out.push({ q, s: stateOf(q), depth });
      for (const k of kids.get(q.id) ?? []) walk(k, depth + 1);
    };
    for (const q of quests) if (q.g === "main") walk(q, 0);
    return out;
  });
  const side = $derived(quests.filter((q) => q.g === "side").map((q) => ({ q, s: stateOf(q), depth: 0 })));
  const all = $derived([...lines, ...side]);
  const doneN = $derived(all.filter((l) => l.s === "done").length);
  const next = $derived(lines.find((l) => l.depth === 0 && l.s !== "done")?.q ?? null);

  let hideDone = $state(false);
  let open = $state<string | null>(null);
  const date = (ms: number) => (ms > 1 ? new Date(ms).toLocaleDateString(locale(), { day: "numeric", month: "short", year: "numeric" }) : "");

  function status(l: Line): string {
    const x = mine?.[l.q.id];
    switch (l.s) {
      case "done":
        return x && x[1] > 1 ? t("quest.doneAt", { d: date(x[1]) }) : t("quest.done");
      case "active":
        return t("quest.stage", { a: x![0], b: l.q.st });
      case "given":
        return t("quest.given");
      case "locked":
        return t("quest.after", { q: byId.get(l.q.after!)?.name ?? "—" });
      default:
        return t("quest.notGiven");
    }
  }
  const reward = (r: NonNullable<Quest["rw"]>[number]) =>
    "q" in r ? t("quest.opens", { q: byId.get(r.q)?.name ?? "—" }) : r.bp ? t("quest.rewardBp", { v: r.name }) : t("quest.reward", { v: r.name });
</script>

{#if !inventory.data}
  <p class="note">{t("quest.noInv")}</p>
{:else if !mine}
  <p class="note">{t("quest.oldInv")}</p>
{:else}
  <section class="quests">
    <header class="head">
      <span class="sum"><b>{doneN}/{all.length}</b> {t("quest.doneOf")}</span>
      {#if next}<span class="next">{t("quest.next")} <b>{next.name}</b></span>{/if}
      <label class="only"><input type="checkbox" bind:checked={hideDone} /> {t("quest.hideDone")}</label>
    </header>

    {#snippet list(rows: Line[])}
      {#each rows.filter((l) => !hideDone || l.s !== "done") as l (l.q.id)}
        <button class="q {l.s}" class:isnext={l.q === next} style:--d={l.depth} onclick={() => (open = open === l.q.id ? null : l.q.id)}>
          <img src={iconUrl(l.q.icon)} alt="" loading="lazy" />
          <span class="name">
            <b>{l.q.name}</b>
            {#each l.q.rw ?? [] as r, i (i)}<small>{reward(r)}</small>{/each}
          </span>
          <span class="st">{status(l)}</span>
        </button>
        {#if open === l.q.id && l.q.d}
          <p class="desc" style:--d={l.depth}>{l.q.d}</p>
        {/if}
      {/each}
    {/snippet}

    <h3>{t("quest.main")}</h3>
    {@render list(lines)}
    <h3>{t("quest.side")}</h3>
    {@render list(side)}
    <p class="foot">{t("quest.foot")}</p>
  </section>
{/if}

<style>
  .note {
    font-size: 13px;
    color: var(--warn);
  }
  .head {
    display: flex;
    align-items: baseline;
    gap: 16px;
    flex-wrap: wrap;
    margin-bottom: 6px;
  }
  .sum {
    font-size: 13px;
    color: var(--text-dim);
  }
  .sum b {
    font-size: 15px;
    color: var(--text);
  }
  .next {
    font-size: 13px;
    color: var(--text-dim);
  }
  .next b {
    color: var(--accent);
  }
  .only {
    margin-left: auto;
    display: flex;
    align-items: center;
    gap: 6px;
    font-size: 12.5px;
    color: var(--text-dim);
  }
  h3 {
    margin: 16px 0 6px;
    font-size: 12px;
    font-weight: 600;
    letter-spacing: 0.08em;
    text-transform: uppercase;
    color: var(--text-faint);
  }
  .q {
    display: grid;
    grid-template-columns: 36px minmax(0, 1fr) auto;
    align-items: center;
    gap: 12px;
    width: 100%;
    padding: 6px 12px 6px calc(12px + var(--d) * 28px);
    border-radius: 10px;
    text-align: left;
  }
  .q:hover {
    background: var(--surface);
  }
  .q img {
    width: 36px;
    height: 36px;
    object-fit: contain;
  }
  .name {
    min-width: 0;
    display: flex;
    flex-wrap: wrap;
    align-items: baseline;
    gap: 4px 10px;
  }
  .name b {
    font-size: 13.5px;
    font-weight: 500;
  }
  .name small {
    font-size: 11.5px;
    color: var(--text-faint);
  }
  .st {
    font-size: 12.5px;
    color: var(--text-dim);
    text-align: right;
  }
  .done .name b {
    color: var(--text-dim);
  }
  .done .st {
    color: var(--good);
  }
  .active .st,
  .given .st {
    color: var(--accent);
  }
  .locked {
    opacity: 0.6;
  }
  .isnext {
    background: var(--accent-soft);
  }
  .desc {
    margin: 2px 12px 8px calc(60px + var(--d) * 28px);
    font-size: 12.5px;
    line-height: 1.5;
    white-space: pre-line;
    color: var(--text-dim);
  }
  .foot {
    margin: 14px 0 0;
    font-size: 12px;
    line-height: 1.4;
    color: var(--text-faint);
  }
</style>
