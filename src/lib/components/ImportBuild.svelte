<script lang="ts">
  // Paste an Overframe "Copy" link -> build saved locally. Unknown Overframe ids are resolved by hand once.
  import { t } from "$lib/i18n/index.svelte";
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
      title: title.trim() || t("imp.defaultTitle"),
      author: t("imp.author"),
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
    <b>{t("frame.import")}</b>
    <button class="x" onclick={onclose} aria-label={t("common.close")}>✕</button>
  </div>
  <p class="hint">{t("imp.hint")} (<code>?bs=</code>).</p>

  <input bind:value={link} placeholder="https://overframe.gg/build/new/53/saryn-prime/?bs=..." spellcheck="false" />

  {#if link.trim() && !decoded}
    <p class="bad">{t("imp.bad")} <code>?bs=</code>.</p>
  {:else if result}
    {#if otherFrame}
      <p class="warn">{t("imp.otherFrame", { name: otherFrame.name })}</p>
    {/if}
    <p class="ok">{t("imp.recognized", { a: result.total - result.unknown.length, b: result.total })}</p>

    {#each result.unknown as ofId (ofId)}
      <div class="unknown">
        <span>{t("imp.unknown", { id: ofId })}</span>
        <input
          value={pick[ofId] ?? ""}
          oninput={(e) => (pick = { ...pick, [ofId]: e.currentTarget.value })}
          placeholder={t("imp.typeName")}
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

    <input bind:value={title} placeholder={t("imp.nameOptional")} spellcheck="false" />
    <button class="save" disabled={!result.build || result.unknown.length > 0} onclick={save}>
      {result.unknown.length ? t("imp.pickFirst", { n: result.unknown.length }) : t("imp.save")}
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
