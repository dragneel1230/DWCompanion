<script lang="ts">
  // "В цели": adds the item to the guide and opens it; once added, opens its path. Used on item pages
  // (warframe, set, farming). `id` is a craft.json item id (warframes and sets share the uniqueName).
  import { t } from "$lib/i18n/index.svelte";
  import { goto } from "$app/navigation";
  import { goals } from "./goals.svelte";

  let { id }: { id: string } = $props();

  const has = $derived(!!goals.get(id));
  function go() {
    if (has) {
      goals.open(id);
      goto("/goals");
    } else goto(`/goals?add=${encodeURIComponent(id)}`);
  }
</script>

<button class="goal-btn" class:has onclick={go} title={t("goal.addHint")}>
  <svg viewBox="0 0 24 24"><path d="M6 21V4M6 4h11l-2.5 4L17 12H6" /></svg>
  {has ? t("goal.inGoals") : t("goal.add")}
</button>

<style>
  .goal-btn {
    display: inline-flex;
    align-items: center;
    gap: 7px;
    padding: 7px 13px;
    border-radius: 10px;
    background: var(--accent-soft);
    color: var(--accent);
    font-size: 13px;
    font-weight: 500;
    white-space: nowrap;
    transition: background 0.12s;
  }
  .goal-btn:hover {
    background: rgba(201, 166, 107, 0.24);
  }
  .goal-btn.has {
    background: var(--surface-2);
    color: var(--text-dim);
  }
  svg {
    width: 15px;
    height: 15px;
    fill: none;
    stroke: currentColor;
    stroke-width: 1.9;
    stroke-linecap: round;
    stroke-linejoin: round;
  }
</style>
