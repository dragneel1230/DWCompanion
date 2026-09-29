<script lang="ts">
  import SearchBox from "$lib/components/SearchBox.svelte";
  import { getDb } from "$lib/db";

  const db = getDb();
  const built = new Date(db.builtAt).toLocaleDateString("ru-RU");
</script>

<div class="page home">
  <h1>Что ищем?</h1>
  <p class="muted">Наборы, части, реликвии — по-русски или по-английски. Из любого экрана: <kbd>Ctrl</kbd> + <kbd>K</kbd></p>
  <SearchBox autofocus />
  <p class="foot">
    База: {Object.keys(db.sets).length} наборов · {Object.keys(db.items).length} наград · {Object.keys(db.relics).length} реликвий · обновлена {built}
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
