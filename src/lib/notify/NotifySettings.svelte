<script lang="ts">
  // Settings → «Уведомления»: built-in switches (foundry, goal fissures, quiet during missions) and the
  // player's filters. Each rule shows what it matches right now, so a filter can be checked before waiting.
  import { sendNotification } from "@tauri-apps/plugin-notification";
  import { num, t, type Key } from "$lib/i18n/index.svelte";
  import { getDb, search, type Entry } from "$lib/db";
  import { loadFrames, loadOtherMods } from "$lib/frames";
  import { loadInvCtx, describe, type InvCtx } from "$lib/inv/ctx";
  import { refreshWorld, world } from "$lib/hub/worldData.svelte";
  import { needs } from "$lib/goals/watch.svelte";
  import { notify, CYCLE_TARGETS, type Rule, type RuleKind, type FissureMode, type CycleTarget } from "./rules.svelte";
  import { ensurePermission, ruleEvents, worldFor, type WorldData } from "./watch.svelte";

  const KINDS: { id: RuleKind; label: Key; hint: Key }[] = [
    { id: "fissure", label: "notify.kind.fissure", hint: "notify.kind.fissureHint" },
    { id: "invasion", label: "notify.kind.invasion", hint: "notify.kind.invasionHint" },
    { id: "alert", label: "notify.kind.alert", hint: "notify.kind.alertHint" },
    { id: "baro", label: "notify.kind.baro", hint: "notify.kind.baroHint" },
    { id: "cycle", label: "notify.kind.cycle", hint: "notify.kind.cycleHint" },
    { id: "price", label: "notify.kind.price", hint: "notify.kind.priceHint" },
  ];
  const KIND = Object.fromEntries(KINDS.map((k) => [k.id, k]));
  const TIERS = [1, 2, 3, 4, 5, 6];
  // Mission types fissures come in.
  const MISSIONS = ["MT_SURVIVAL", "MT_DEFENSE", "MT_EXCAVATE", "MT_MOBILE_DEFENSE", "MT_EXTERMINATION", "MT_CAPTURE", "MT_RESCUE", "MT_SABOTAGE", "MT_INTEL", "MT_TERRITORY", "MT_HIVE", "MT_ASSAULT", "MT_EVACUATION", "MT_ARTIFACT", "MT_CORRUPTION", "MT_ALCHEMY", "MT_SALVAGE", "MT_ASSASSINATION"];
  const MODES: { id: FissureMode; label: Key }[] = [
    { id: "any", label: "notify.mode.any" },
    { id: "normal", label: "notify.mode.normal" },
    { id: "hard", label: "notify.mode.hard" },
    { id: "storm", label: "notify.mode.storm" },
  ];
  const BEFORE = [0, 5, 10, 15, 30];
  // Rewards worth a filter: game ids, named in the interface language when shown.
  const SUGGEST: Partial<Record<RuleKind, string[]>> = {
    invasion: [
      "/Lotus/Types/Recipes/Components/OrokinReactorBlueprint",
      "/Lotus/Types/Recipes/Components/OrokinCatalystBlueprint",
      "/Lotus/Types/Recipes/Components/FormaBlueprint",
      "/Lotus/Types/Recipes/Components/UtilityUnlockerBlueprint",
      "/Lotus/Types/Items/Research/EnergyComponent",
      "/Lotus/Types/Items/Research/ChemComponent",
      "/Lotus/Types/Items/Research/BioComponent",
    ],
    alert: ["/Lotus/Types/Recipes/Components/OrokinReactorBlueprint", "/Lotus/Types/Recipes/Components/OrokinCatalystBlueprint", "/Lotus/Types/Recipes/Components/FormaBlueprint"],
  };

  const db = getDb();
  const tierName = (n: number) => db.world.tier[`VoidT${n}`] ?? String(n);
  const cycleName = (c: CycleTarget) => {
    const [place, state] = c.split("-");
    return `${t(`cycle.${place}` as Key)} — ${t(`cycle.${state}` as Key).toLowerCase()}`;
  };

  let ctx = $state<InvCtx | null>(null);
  let data = $state<WorldData | null>(null);
  let adding = $state(false);
  let open = $state<string | null>(null); // rule being edited
  loadInvCtx().then((c) => (ctx = c));

  // World data for the previews: on open and when rules change kind / item (not on every keystroke).
  const sig = $derived(notify.value.rules.map((r) => `${r.kind}:${r.slug ?? ""}`).join("|"));
  $effect(() => {
    void sig;
    const rules = notify.value.rules;
    refreshWorld().then(() => worldFor(rules).then((d) => (data = d)));
  });
  const suggestName = (id: string) => (ctx ? describe(ctx, id).name : "");

  function add(kind: RuleKind) {
    const r = notify.add(kind);
    adding = false;
    open = r.id;
    ensurePermission();
  }
  function toggle<T>(list: T[] | undefined, v: T): T[] {
    const l = list ?? [];
    return l.includes(v) ? l.filter((x) => x !== v) : [...l, v];
  }
  function addWord(r: Rule, w: string) {
    const words = (r.text ?? "").split(",").map((x) => x.trim()).filter(Boolean);
    if (!words.some((x) => x.toLowerCase() === w.toLowerCase())) notify.update(r.id, { text: [...words, w].join(", ") });
  }
  // Text fields keep what was typed until Enter or leaving the field.
  const commit = (r: Rule, k: "text") => (e: Event & { currentTarget: HTMLInputElement }) => notify.update(r.id, { [k]: e.currentTarget.value });

  function summary(r: Rule): string {
    if (r.kind === "fissure") {
      const tiers = r.tiers?.length ? r.tiers.map(tierName).join(", ") : t("notify.anyTier");
      const ms = r.missions?.length ? r.missions.map((m) => db.world.missionType[m] ?? m).join(", ") : t("notify.anyMission");
      const mode = r.mode && r.mode !== "any" ? ` · ${t(MODES.find((m) => m.id === r.mode)!.label)}` : "";
      return `${tiers} · ${ms}${mode}`;
    }
    if (r.kind === "invasion" || r.kind === "alert") return r.text?.trim() || t("notify.noWords");
    if (r.kind === "baro") return r.text?.trim() ? t("notify.baroWith", { v: r.text.trim() }) : t("notify.baroArrive");
    if (r.kind === "cycle" && r.cycle) return r.before ? t("notify.cycleBefore", { c: cycleName(r.cycle), m: r.before }) : cycleName(r.cycle);
    if (r.kind === "price") return r.slug ? t("notify.priceSum", { n: r.name ?? r.slug, p: r.below ?? 0 }) : t("notify.pickItem");
    return "";
  }

  // ---------- price rule: item search
  let query = $state("");
  const MARKET: Entry["kind"][] = ["set", "item", "relic", "mod", "arcane"];
  const hitsFor = $derived(query.trim().length > 1 ? search(query, 40).filter((e) => MARKET.includes(e.kind)).slice(0, 8) : []);
  async function slugOf(e: Entry): Promise<string | undefined> {
    if (e.kind === "set") return db.sets[e.id]?.slug;
    if (e.kind === "item") return db.items[e.id]?.slug;
    if (e.kind === "relic") return db.relics[e.id]?.slug;
    const [f, other] = await Promise.all([loadFrames(), loadOtherMods().catch(() => ({}) as Record<string, { slug?: string }>)]);
    return e.kind === "arcane" ? f.arcanes[e.id]?.slug : (f.mods[e.id] ?? other[e.id])?.slug;
  }
  async function pick(r: Rule, e: Entry) {
    const slug = await slugOf(e);
    if (!slug) return;
    notify.update(r.id, { slug, name: e.name });
    query = "";
  }

  async function test() {
    if (await ensurePermission()) sendNotification({ title: t("notify.test.title"), body: t("notify.test.body") });
  }
</script>

<div class="section-title">{t("notify.title")}</div>

<label class="row switch">
  <span><b>{t("ship.notify")}</b><small>{t("ship.notifyHint")}</small></span>
  <input type="checkbox" checked={notify.value.foundry} onchange={(e) => (notify.set({ foundry: e.currentTarget.checked }), e.currentTarget.checked && ensurePermission())} />
</label>
<label class="row switch">
  <span><b>{t("goal.notify.toggle")}</b><small>{t("goal.notify.hint")}</small></span>
  <input type="checkbox" checked={needs.notify} onchange={(e) => needs.setNotify(e.currentTarget.checked)} />
</label>
<label class="row switch">
  <span><b>{t("notify.quiet")}</b><small>{t("notify.quietHint")}</small></span>
  <input type="checkbox" checked={notify.value.quiet} onchange={(e) => notify.set({ quiet: e.currentTarget.checked })} />
</label>

<div class="rules">
  {#each notify.value.rules as r (r.id)}
    {@const ev = ruleEvents(r, ctx, data)}
    {@const edit = open === r.id}
    <div class="rule" class:off={!r.on} class:edit>
      <div class="head">
        <input type="checkbox" checked={r.on} title={t("notify.onOff")} onchange={(e) => notify.update(r.id, { on: e.currentTarget.checked })} />
        <button class="what" onclick={() => (open = edit ? null : r.id)}>
          <b>{t(KIND[r.kind].label)}</b>
          <small>{summary(r)}</small>
        </button>
        <span class="now" class:hit={ev.length > 0} title={ev.map((e) => `${e.title}: ${e.body}`).join("\n")}>
          {ev.length ? t("notify.matchNow", { n: ev.length }) : t("notify.matchNone")}
        </span>
        <button class="x" title={t("notify.remove")} onclick={() => notify.remove(r.id)}>×</button>
      </div>

      {#if edit}
        <div class="editor">
          <p class="hint">{t(KIND[r.kind].hint)}</p>
          {#if r.kind === "fissure"}
            <div class="line">
              <span class="lbl">{t("notify.tier")}</span>
              <div class="chips">
                {#each TIERS as n (n)}
                  <button class:on={r.tiers?.includes(n)} onclick={() => notify.update(r.id, { tiers: toggle(r.tiers, n) })}>{tierName(n)}</button>
                {/each}
              </div>
            </div>
            <div class="line">
              <span class="lbl">{t("notify.mission")}</span>
              <div class="chips">
                {#each MISSIONS as m (m)}
                  <button class:on={r.missions?.includes(m)} onclick={() => notify.update(r.id, { missions: toggle(r.missions, m) })}>{db.world.missionType[m] ?? m}</button>
                {/each}
              </div>
            </div>
            <div class="line">
              <span class="lbl">{t("notify.mode")}</span>
              <div class="seg">
                {#each MODES as m (m.id)}<button class:on={(r.mode ?? "any") === m.id} onclick={() => notify.update(r.id, { mode: m.id })}>{t(m.label)}</button>{/each}
              </div>
            </div>
          {:else if r.kind === "invasion" || r.kind === "alert" || r.kind === "baro"}
            <div class="line">
              <span class="lbl">{t(r.kind === "baro" ? "notify.baroLbl" : "notify.reward")}</span>
              <input class="text" value={r.text ?? ""} placeholder={t(r.kind === "baro" ? "notify.baroPh" : "notify.rewardPh")}
                onchange={commit(r, "text")} onkeydown={(e) => e.key === "Enter" && e.currentTarget.blur()} />
            </div>
            {#if SUGGEST[r.kind] && ctx}
              <div class="line">
                <span class="lbl"></span>
                <div class="chips">
                  {#each SUGGEST[r.kind]! as id (id)}<button onclick={() => addWord(r, suggestName(id))}>+ {suggestName(id)}</button>{/each}
                </div>
              </div>
            {/if}
          {:else if r.kind === "cycle"}
            <div class="line">
              <span class="lbl">{t("notify.when")}</span>
              <select value={r.cycle} onchange={(e) => notify.update(r.id, { cycle: e.currentTarget.value as CycleTarget })}>
                {#each CYCLE_TARGETS as c (c)}<option value={c}>{cycleName(c)}</option>{/each}
              </select>
            </div>
            <div class="line">
              <span class="lbl">{t("notify.before")}</span>
              <div class="seg">
                {#each BEFORE as m (m)}<button class:on={(r.before ?? 0) === m} onclick={() => notify.update(r.id, { before: m })}>{m ? t("unit.minutes", { v: m }) : t("notify.atStart")}</button>{/each}
              </div>
            </div>
          {:else if r.kind === "price"}
            <div class="line">
              <span class="lbl">{t("notify.item")}</span>
              <div class="pick">
                {#if r.slug}<b class="picked">{r.name}</b>{/if}
                <input class="text" bind:value={query} placeholder={t("notify.itemPh")} />
                {#if hitsFor.length}
                  <div class="hits">
                    {#each hitsFor as e (e.kind + e.id)}<button onclick={() => pick(r, e)}>{e.name}</button>{/each}
                  </div>
                {/if}
              </div>
            </div>
            <div class="line">
              <span class="lbl">{t("notify.below")}</span>
              <input class="text num" type="number" min="1" value={r.below ?? 10}
                onchange={(e) => notify.update(r.id, { below: Math.max(1, Math.round(Number(e.currentTarget.value) || 1)) })} />
              {#if r.slug && data?.prices[r.slug] != null}<span class="cur">{t("notify.priceNow", { p: num(data.prices[r.slug]!) })}</span>{/if}
            </div>
          {/if}
          {#if ev.length}
            <ul class="preview">
              {#each ev.slice(0, 4) as e (e.key)}<li><b>{e.title}</b> {e.body}</li>{/each}
            </ul>
          {/if}
        </div>
      {/if}
    </div>
  {/each}
</div>

{#if adding}
  <div class="kinds">
    {#each KINDS as k (k.id)}
      <button class="kind" onclick={() => add(k.id)}><b>{t(k.label)}</b><small>{t(k.hint)}</small></button>
    {/each}
  </div>
{/if}
<div class="links">
  <button onclick={() => (adding = !adding)}>{adding ? t("notify.cancel") : t("notify.add")}</button>
  <button onclick={test}>{t("notify.test")}</button>
  {#if !world.timers}<span class="faint">{t("coll.loading")}</span>{/if}
</div>

<style>
  .row + .row {
    margin-top: 8px;
  }
  .switch {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 16px;
    padding: 14px 16px;
    border-radius: 12px;
    background: var(--surface);
    cursor: pointer;
  }
  .switch span {
    display: flex;
    flex-direction: column;
    gap: 3px;
  }
  .switch small,
  .kind small {
    color: var(--text-dim);
    font-size: 12px;
  }
  .switch input,
  .head input {
    width: 18px;
    height: 18px;
    accent-color: var(--accent);
    flex: none;
  }
  .rules {
    display: flex;
    flex-direction: column;
    gap: 8px;
    margin-top: 8px;
  }
  .rule {
    border-radius: 12px;
    background: var(--surface);
    border: 1px solid transparent;
  }
  .rule.edit {
    border-color: var(--line);
  }
  .rule.off .what,
  .rule.off .now {
    opacity: 0.45;
  }
  .head {
    display: flex;
    align-items: center;
    gap: 12px;
    padding: 10px 14px;
  }
  .what {
    flex: 1;
    min-width: 0;
    display: flex;
    flex-direction: column;
    gap: 2px;
    text-align: left;
  }
  .what small {
    color: var(--text-dim);
    font-size: 12px;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .now {
    flex: none;
    font-size: 12px;
    color: var(--text-faint);
  }
  .now.hit {
    color: var(--good);
  }
  .x {
    flex: none;
    width: 26px;
    height: 26px;
    border-radius: 8px;
    font-size: 18px;
    color: var(--text-faint);
  }
  .x:hover {
    color: var(--warn);
    background: var(--surface-2);
  }
  .editor {
    display: flex;
    flex-direction: column;
    gap: 10px;
    padding: 0 14px 14px 44px;
  }
  .hint {
    margin: 0;
    font-size: 12px;
    color: var(--text-faint);
  }
  .line {
    display: flex;
    align-items: flex-start;
    gap: 12px;
  }
  .lbl {
    flex: none;
    width: 110px;
    padding-top: 5px;
    font-size: 12px;
    color: var(--text-dim);
  }
  .chips {
    display: flex;
    flex-wrap: wrap;
    gap: 6px;
  }
  .chips button {
    padding: 4px 10px;
    border-radius: 20px;
    border: 1px solid var(--line);
    font-size: 12px;
    color: var(--text-dim);
  }
  .chips button.on {
    border-color: var(--accent);
    background: var(--accent-soft);
    color: var(--text);
  }
  .text,
  select {
    flex: 1;
    max-width: 420px;
    padding: 6px 10px;
    border-radius: 8px;
    border: 1px solid var(--line);
    background: rgba(255, 255, 255, 0.03);
    font-size: 13px;
    outline: none;
  }
  .text:focus {
    border-color: var(--text-faint);
  }
  .text.num {
    max-width: 90px;
  }
  .cur {
    padding-top: 6px;
    font-size: 12px;
    color: var(--text-dim);
  }
  .pick {
    position: relative;
    flex: 1;
    max-width: 420px;
    display: flex;
    flex-direction: column;
    gap: 6px;
  }
  .pick .text {
    max-width: none;
  }
  .picked {
    font-weight: 500;
  }
  .hits {
    display: flex;
    flex-direction: column;
    border-radius: 10px;
    border: 1px solid var(--line);
    background: var(--pop-bg, #161920);
    overflow: hidden;
  }
  .hits button {
    padding: 7px 10px;
    text-align: left;
    font-size: 13px;
  }
  .hits button:hover {
    background: var(--surface-2);
  }
  .preview {
    margin: 0;
    padding: 10px 12px;
    list-style: none;
    border-radius: 10px;
    background: rgba(111, 207, 151, 0.06);
    font-size: 12px;
    color: var(--text-dim);
    display: flex;
    flex-direction: column;
    gap: 4px;
  }
  .preview b {
    color: var(--text);
    font-weight: 500;
  }
  .kinds {
    display: grid;
    grid-template-columns: repeat(3, 1fr);
    gap: 8px;
    margin-top: 8px;
  }
  .kind {
    display: flex;
    flex-direction: column;
    gap: 4px;
    padding: 12px 14px;
    border-radius: 12px;
    background: var(--surface);
    border: 1px solid transparent;
    text-align: left;
  }
  .kind:hover {
    border-color: var(--accent);
  }
  .links {
    display: flex;
    align-items: center;
    gap: 16px;
    margin: 8px 2px 0;
  }
  .links button {
    padding: 0;
    font-size: 12px;
    color: var(--text-dim);
  }
  .links button:hover {
    color: var(--text);
  }
  .faint {
    font-size: 12px;
    color: var(--text-faint);
  }
</style>
