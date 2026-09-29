<script lang="ts">
  // Paste an Overframe "Copy" link -> build saved locally. Unknown Overframe ids are resolved by hand once.
  import { goto } from "$app/navigation";
  import ModCard from "./ModCard.svelte";
  import ArcaneCard from "./ArcaneCard.svelte";
  import { assembleImport, searchModsAndArcanes, type FramesDb } from "$lib/frames";
  import { decodeOverframe, overframeIds } from "$lib/overframe.svelte";
  import { userBuilds } from "$lib/userBuilds.svelte";

  let { db, frameId, onclose }: { db: FramesDb; frameId: string; onclose: () => void } = $props();

  let link = $state("");
  let title = $state("");
  let pick = $state<Record<number, string>>({});

  const decoded = $derived(link.trim() ? decodeOverframe(link) : null);
  const result = $derived(decoded ? assembleImport(db, decoded, frameId) : null);
  const otherFrame = $derived(result?.frameId && result.frameId !== frameId ? db.frames[result.frameId] : null);

  function resolve(ofId: number, enName: string) {
    overframeIds.remember(ofId, enName);
    pick = { ...pick, [ofId]: "" };
  }

  function save() {
    if (!result?.build || !decoded) return;
    const id = `of-${decoded.buildId ?? Date.now()}`;
    userBuilds.save(id, {
      ...result.build,
      title: title.trim() || "Билд с Overframe",
      author: "импорт с Overframe",
      votes: 0,
      note: "",
      tags: [],
    });
    onclose();
    goto(`/build?id=${encodeURIComponent(id)}`);
  }
</script>

<div class="import">
  <div class="head">
    <b>Импорт с Overframe</b>
    <button class="x" onclick={onclose} aria-label="Закрыть">✕</button>
  </div>
  <p class="hint">На странице билда Overframe нажми «Copy» и вставь сюда адрес открывшейся страницы (он содержит <code>?bs=</code>).</p>

  <input bind:value={link} placeholder="https://overframe.gg/build/new/53/saryn-prime/?bs=..." spellcheck="false" />

  {#if link.trim() && !decoded}
    <p class="bad">Не похоже на ссылку «Copy» с Overframe: в ней нет кода <code>?bs=</code>.</p>
  {:else if result}
    {#if otherFrame}
      <p class="warn">Этот билд для «{otherFrame.ru}», он сохранится туда.</p>
    {/if}
    <p class="ok">Распознано {result.total - result.unknown.length} из {result.total}</p>

    {#each result.unknown as ofId (ofId)}
      <div class="unknown">
        <span>Неизвестный мод Overframe #{ofId}. Какой это?</span>
        <input
          value={pick[ofId] ?? ""}
          oninput={(e) => (pick = { ...pick, [ofId]: e.currentTarget.value })}
          placeholder="Начни вводить название..."
          spellcheck="false"
        />
        <div class="options">
          {#each searchModsAndArcanes(db, pick[ofId] ?? "") as m (m.id)}
            <button onclick={() => resolve(ofId, m.en)}>
              <span class="thumb">
                {#if db.mods[m.id]}<ModCard mod={db.mods[m.id]} scale={0.18} bare />{:else if db.arcanes[m.id]}<ArcaneCard arcane={db.arcanes[m.id]} scale={0.1} bare />{/if}
              </span>
              {m.ru} <small>{m.en}</small>
            </button>
          {/each}
        </div>
      </div>
    {/each}

    <input bind:value={title} placeholder="Название билда (необязательно)" spellcheck="false" />
    <button class="save" disabled={!result.build || result.unknown.length > 0} onclick={save}>
      {result.unknown.length ? `Сначала укажи ${result.unknown.length} мод(а)` : "Сохранить билд"}
    </button>
  {/if}
</div>

<style>
  .import {
    display: flex;
    flex-direction: column;
    gap: 10px;
    padding: 16px;
    margin-bottom: 10px;
    border-radius: 12px;
    background: var(--surface);
    border: 1px solid var(--line);
  }
  .head {
    display: flex;
    justify-content: space-between;
  }
  .x {
    color: var(--text-faint);
  }
  .hint {
    margin: 0;
    font-size: 12px;
    color: var(--text-dim);
  }
  code {
    color: var(--accent);
  }
  input {
    width: 100%;
    padding: 10px 12px;
    background: var(--bg);
    border: 1px solid var(--line);
    border-radius: 8px;
    outline: none;
  }
  input:focus {
    border-color: var(--accent);
  }
  .ok {
    margin: 0;
    color: var(--good);
    font-size: 13px;
  }
  .bad,
  .warn {
    margin: 0;
    color: var(--warn);
    font-size: 13px;
  }
  .unknown {
    display: flex;
    flex-direction: column;
    gap: 6px;
    padding: 10px;
    border-radius: 8px;
    background: var(--bg);
    font-size: 13px;
  }
  .options {
    display: flex;
    flex-direction: column;
  }
  .options button {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 5px 6px;
    border-radius: 6px;
    text-align: left;
  }
  .options button:hover {
    background: var(--surface-2);
  }
  .thumb {
    width: 54px;
    flex: none;
    display: flex;
    justify-content: center;
  }
  .options small {
    color: var(--text-faint);
  }
  .save {
    align-self: flex-start;
    padding: 9px 16px;
    border-radius: 8px;
    background: var(--accent);
    color: #14110b;
    font-weight: 600;
  }
  .save:disabled {
    background: var(--surface-2);
    color: var(--text-faint);
    cursor: default;
  }
</style>
