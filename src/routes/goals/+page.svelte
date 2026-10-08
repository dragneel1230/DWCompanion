<script lang="ts">
  // "Цели": a hand-held guide to any item (src/lib/goals/GoalsView). `?add=<craft id>` adds a goal from
  // another page (Builds, Farming, a set) and the address is cleaned.
  import { t } from "$lib/i18n/index.svelte";
  import { goto } from "$app/navigation";
  import { page } from "$app/state";
  import GoalsView from "$lib/goals/GoalsView.svelte";

  let add = $state<string | null>(page.url.searchParams.get("add"));
  $effect(() => {
    const a = page.url.searchParams.get("add");
    if (!a) return;
    add = a;
    goto("/goals", { replaceState: true, noScroll: true });
  });
</script>

<div class="page wide">
  <div class="top">
    <h1>{t("goal.title")}</h1>
    <p>{t("goal.intro")}</p>
  </div>
  <GoalsView {add} />
</div>

<style>
  .wide {
    max-width: 1400px;
  }
  .top {
    margin-bottom: 18px;
  }
  h1 {
    margin: 0;
    font-size: 26px;
    font-weight: 600;
  }
  .top p {
    margin: 6px 0 0;
    font-size: 13.5px;
    color: var(--text-dim);
    max-width: 760px;
    line-height: 1.5;
  }
</style>
