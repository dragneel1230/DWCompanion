<script lang="ts">
  import { locale, t } from "$lib/i18n/index.svelte";
  import SearchBox from "$lib/components/SearchBox.svelte";
  import { getDb } from "$lib/db";

  const db = getDb();
  const built = $derived(new Date(db.builtAt).toLocaleDateString(locale()));
</script>

<div class="page home">
  <h1>{t("home.title")}</h1>
  <p class="muted">{t("home.intro")} <kbd>Ctrl</kbd> + <kbd>K</kbd></p>
  <SearchBox autofocus />
  <p class="foot">
    {t("home.db", { s: Object.keys(db.sets).length, i: Object.keys(db.items).length, r: Object.keys(db.relics).length, d: built })}
  </p>
</div>

<style>
  .home {
    max-width: 680px;
    padding-top: 10vh;
  }
  h1 {
    font-size: 28px;
    font-weight: 600;
    margin: 0 0 6px;
  }
  p.muted {
    margin: 0 0 18px;
  }
  kbd {
    font: inherit;
    font-size: 12px;
    border: 1px solid var(--line);
    border-radius: 5px;
    padding: 0 5px;
  }
  .foot {
    margin-top: 28px;
    font-size: 12px;
    color: var(--text-faint);
  }
</style>
