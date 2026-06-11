<script lang="ts">
  import { onMount } from 'svelte';
  import StoryViewer from '$lib/components/StoryViewer.svelte';
  import { parseStoryYaml } from '$lib/storyYaml';
  import {
    clearActiveStory,
    deleteStory,
    loadStoryLibrary,
    saveStoryYaml,
    setActiveStory,
    updateStoryReferenceImages,
    updateStoryYaml,
    type SavedStory,
    type StoryReferenceImage,
  } from '$lib/storyLibrary';

  let stories = $state<SavedStory[]>([]);
  let selectedId = $state('');
  let importYaml = $state('');
  let importFileName = $state('');
  let importError = $state('');
  let importSuccess = $state('');
  let referenceBusy = $state(false);
  let referenceError = $state('');
  let selectedStory = $derived(
    stories.find((story) => story.id === selectedId) ?? stories[0] ?? null,
  );
  let importPreview = $derived(parseStoryYaml(importYaml));

  onMount(() => {
    stories = loadStoryLibrary();
    selectedId = stories[0]?.id ?? '';
    if (stories[0]) {
      setActiveStory(stories[0]);
      void loadReferenceImages(stories[0].id);
    }
  });

  function selectStory(story: SavedStory): void {
    selectedId = story.id;
    setActiveStory(story);
    void loadReferenceImages(story.id);
  }

  async function loadReferenceImages(storyId: string): Promise<void> {
    try {
      const response = await fetch(`/api/stories/${encodeURIComponent(storyId)}/reference-images`);
      const data = await response.json();
      if (!response.ok) throw new Error(data?.message ?? '参照画像の読み込みに失敗しました。');
      applyReferenceImages(storyId, data?.referenceImages ?? []);
    } catch (error) {
      referenceError = error instanceof Error ? error.message : String(error);
    }
  }

  function applyReferenceImages(storyId: string, images: StoryReferenceImage[]): void {
    updateStoryReferenceImages(storyId, images);
    stories = loadStoryLibrary().map((story) => (
      story.id === storyId ? { ...story, referenceImages: images } : story
    ));
    const active = stories.find((story) => story.id === storyId);
    if (active) {
      setActiveStory({
        ...active,
        referenceImages: active.referenceImages.map(({ dataUrl: _dataUrl, ...image }) => image),
      });
    }
    console.log('[STORY_REF_IMAGE]', {
      storyId,
      imageCount: images.length,
      activeImage: images.find((image) => image.active)?.name ?? null,
    });
  }

  async function uploadReferenceImage(event: Event): Promise<void> {
    const input = event.currentTarget as HTMLInputElement;
    const file = input.files?.[0];
    input.value = '';
    if (!file || !selectedStory) return;
    if (!/\.(png|jpe?g|webp)$/i.test(file.name)) {
      referenceError = 'png / jpg / jpeg / webp を選択してください。';
      return;
    }
    referenceBusy = true;
    referenceError = '';
    try {
      const form = new FormData();
      form.set('image', file);
      const response = await fetch(
        `/api/stories/${encodeURIComponent(selectedStory.id)}/reference-images`,
        { method: 'POST', body: form },
      );
      const data = await response.json();
      if (!response.ok) throw new Error(data?.message ?? '参照画像の追加に失敗しました。');
      applyReferenceImages(selectedStory.id, data.referenceImages ?? []);
    } catch (error) {
      referenceError = error instanceof Error ? error.message : String(error);
    } finally {
      referenceBusy = false;
    }
  }

  async function setActiveReferenceImage(imageId: string): Promise<void> {
    if (!selectedStory) return;
    referenceBusy = true;
    try {
      const response = await fetch(
        `/api/stories/${encodeURIComponent(selectedStory.id)}/reference-images`,
        {
          method: 'PATCH',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ imageId }),
        },
      );
      const data = await response.json();
      if (!response.ok) throw new Error(data?.message ?? 'ACTIVE画像の変更に失敗しました。');
      applyReferenceImages(selectedStory.id, data.referenceImages ?? []);
    } catch (error) {
      referenceError = error instanceof Error ? error.message : String(error);
    } finally {
      referenceBusy = false;
    }
  }

  async function removeReferenceImage(imageId: string): Promise<void> {
    if (!selectedStory) return;
    referenceBusy = true;
    try {
      const response = await fetch(
        `/api/stories/${encodeURIComponent(selectedStory.id)}/reference-images?imageId=${encodeURIComponent(imageId)}`,
        { method: 'DELETE' },
      );
      const data = await response.json();
      if (!response.ok) throw new Error(data?.message ?? '参照画像の削除に失敗しました。');
      applyReferenceImages(selectedStory.id, data.referenceImages ?? []);
    } catch (error) {
      referenceError = error instanceof Error ? error.message : String(error);
    } finally {
      referenceBusy = false;
    }
  }

  function openMangaProject(rawYaml: string): void {
    if (selectedStory) setActiveStory(selectedStory);
    localStorage.setItem('studio-yaml', rawYaml);
    window.location.href = '/project';
  }

  async function removeStory(id: string): Promise<void> {
    const story = stories.find((entry) => entry.id === id);
    if (story) {
      await Promise.all(story.referenceImages.map((image) => fetch(
        `/api/stories/${encodeURIComponent(id)}/reference-images?imageId=${encodeURIComponent(image.id)}`,
        { method: 'DELETE' },
      ).catch(() => null)));
    }
    stories = deleteStory(id);
    selectedId = stories[0]?.id ?? '';
    if (stories[0]) {
      setActiveStory(stories[0]);
      void loadReferenceImages(stories[0].id);
    } else {
      clearActiveStory();
    }
  }

  function saveEditedStory(rawYaml: string): void {
    if (!selectedStory) return;
    const updated = updateStoryYaml(selectedStory.id, rawYaml);
    if (!updated) return;
    stories = loadStoryLibrary();
    selectedId = updated.id;
    setActiveStory(updated);
  }

  function formatDate(value: string): string {
    return new Date(value).toLocaleString('ja-JP');
  }

  async function loadYamlFile(event: Event): Promise<void> {
    const input = event.currentTarget as HTMLInputElement;
    const file = input.files?.[0];
    input.value = '';
    if (!file) return;

    if (!/\.ya?ml$/i.test(file.name)) {
      importError = '.yaml または .yml ファイルを選択してください。';
      return;
    }

    importYaml = await file.text();
    importFileName = file.name;
    importError = '';
    importSuccess = '';
  }

  function importStory(): void {
    importError = '';
    importSuccess = '';
    const parsed = parseStoryYaml(importYaml);
    if (!parsed) {
      importError = 'Story YAMLとして解析できません。title または story_type を確認してください。';
      return;
    }

    const duplicate = stories.find(
      (story) => story.title.trim().toLocaleLowerCase() === parsed.title.trim().toLocaleLowerCase(),
    );
    if (
      duplicate
      && !confirm(`同じタイトル「${parsed.title}」がStory Libraryにあります。保存を続行しますか？`)
    ) {
      return;
    }

    const saved = saveStoryYaml(parsed.rawYaml);
    if (!saved) {
      importError = 'Story Libraryへの保存に失敗しました。';
      return;
    }

    stories = loadStoryLibrary();
    selectedId = saved.id;
    setActiveStory(saved);
    importYaml = '';
    importFileName = '';
    importSuccess = `「${saved.title}」をStory Libraryへ保存しました。`;
  }
</script>

<svelte:head>
  <title>STORY | AI VTuber</title>
</svelte:head>

<div class="story-page">
  <header>
    <div>
      <p>STORY ARCHIVE</p>
      <h1>STORY</h1>
      <span>生成したStory YAMLを会話から分離して管理します。</span>
    </div>
    <nav>
      <a href="/lab">CHAT</a>
      <a href="/project">PROJECT</a>
      <a href="/settings/api">SETTINGS</a>
    </nav>
  </header>

  <section class="import-panel">
    <div class="import-heading">
      <div>
        <p>YAML IMPORT</p>
        <h2>Storyを登録</h2>
      </div>
      <label class="file-button">
        .yaml / .yml を選択
        <input type="file" accept=".yaml,.yml,application/yaml,text/yaml" onchange={loadYamlFile} />
      </label>
    </div>

    {#if importFileName}
      <div class="file-name">FILE: {importFileName}</div>
    {/if}

    <textarea
      bind:value={importYaml}
      oninput={() => {
        importError = '';
        importSuccess = '';
      }}
      placeholder="title: My Story&#10;story_type: comic_story&#10;characters: ..."
      aria-label="Story YAMLテキスト"
    ></textarea>

    <div class="import-footer">
      <div class="import-meta">
        <span>TITLE <strong>{importPreview?.title || '未取得'}</strong></span>
        <span>STORY TYPE <strong>{importPreview?.storyType || '未取得'}</strong></span>
      </div>
      <button class="import-button" onclick={importStory} disabled={!importYaml.trim() || !importPreview}>
        STORY LIBRARYへ保存
      </button>
    </div>

    {#if importError}<div class="import-message error">{importError}</div>{/if}
    {#if importSuccess}<div class="import-message success">{importSuccess}</div>{/if}
  </section>

  {#if stories.length === 0}
    <main class="empty-state">
      <h2>Storyはまだありません</h2>
      <p>CHATでYAMLを生成すると、ここへ自動保存されます。</p>
      <a href="/lab">CHATへ戻る</a>
    </main>
  {:else}
    <main class="story-layout">
      <aside class="story-list" aria-label="保存済みStory">
        {#each stories as story (story.id)}
          <article class:active={selectedStory?.id === story.id}>
            <button class="story-select" onclick={() => selectStory(story)}>
              <span class="story-type">{story.storyType}</span>
              <strong>{story.title}</strong>
              <small>{formatDate(story.updatedAt)}</small>
            </button>
            <button class="delete-button" onclick={() => removeStory(story.id)}>削除</button>
          </article>
        {/each}
      </aside>

      <section class="story-detail">
        {#if selectedStory}
          <section class="reference-images-panel">
            <div class="reference-images-heading">
              <div>
                <span>STORY CONTINUITY IMAGE</span>
                <h2>参照漫画ページ画像</h2>
              </div>
              <label class="reference-upload">
                {referenceBusy ? '処理中...' : '画像を追加'}
                <input
                  type="file"
                  accept=".png,.jpg,.jpeg,.webp,image/png,image/jpeg,image/webp"
                  onchange={uploadReferenceImage}
                  disabled={referenceBusy}
                />
              </label>
            </div>
            {#if selectedStory.referenceImages.length > 0}
              <div class="reference-image-grid">
                {#each selectedStory.referenceImages as image (image.id)}
                  <article class:active={image.active}>
                    {#if image.dataUrl}
                      <img src={image.dataUrl} alt={image.name} />
                    {/if}
                    <div class="reference-image-meta">
                      <strong>{image.name}</strong>
                      <span>{image.active ? 'ACTIVE' : 'MANGA PAGE'}</span>
                    </div>
                    <div class="reference-image-actions">
                      <button
                        onclick={() => setActiveReferenceImage(image.id)}
                        disabled={referenceBusy || image.active}
                      >ACTIVE指定</button>
                      <button
                        class="remove-reference"
                        onclick={() => removeReferenceImage(image.id)}
                        disabled={referenceBusy}
                      >削除</button>
                    </div>
                  </article>
                {/each}
              </div>
            {:else}
              <p class="reference-empty">前ページの完成済み漫画画像を登録できます。</p>
            {/if}
            {#if referenceError}<div class="import-message error">{referenceError}</div>{/if}
          </section>
          <StoryViewer
            rawYaml={selectedStory.rawYaml}
            editable
            onSave={saveEditedStory}
            onManga={openMangaProject}
          />
        {/if}
      </section>
    </main>
  {/if}
</div>

<style>
  :global(body) {
    margin: 0;
    background: #030712;
    color: #e2e8f0;
    font-family: 'Segoe UI', sans-serif;
  }

  .story-page {
    min-height: 100vh;
    padding: 28px;
    background:
      radial-gradient(circle at 15% 0%, rgba(168, 85, 247, 0.14), transparent 34%),
      radial-gradient(circle at 90% 20%, rgba(0, 229, 255, 0.1), transparent 30%),
      #030712;
  }

  header {
    max-width: 1280px;
    margin: 0 auto 24px;
    display: flex;
    align-items: end;
    justify-content: space-between;
    gap: 24px;
  }

  header p, header h1, header span { margin: 0; }
  header p { color: #22d3ee; font-size: 11px; letter-spacing: 0.2em; }
  header h1 { color: #fbbf24; font-size: clamp(38px, 7vw, 72px); letter-spacing: 0.08em; }
  header span { color: #94a3b8; font-size: 13px; }
  nav { display: flex; gap: 8px; }

  nav a, .empty-state a {
    padding: 9px 13px;
    border: 1px solid rgba(34, 211, 238, 0.28);
    border-radius: 6px;
    color: #a5f3fc;
    text-decoration: none;
    font-size: 11px;
    font-weight: 800;
  }

  .import-panel {
    max-width: 1280px;
    margin: 0 auto 18px;
    padding: 16px;
    border: 1px solid rgba(34, 211, 238, 0.2);
    border-radius: 12px;
    background: rgba(8, 15, 32, 0.82);
  }

  .import-heading, .import-footer {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 16px;
  }

  .import-heading p, .import-heading h2 { margin: 0; }
  .import-heading p { color: #22d3ee; font-size: 9px; letter-spacing: 0.18em; }
  .import-heading h2 { margin-top: 3px; font-size: 18px; }

  .file-button, .import-button {
    padding: 9px 13px;
    border: 1px solid rgba(34, 211, 238, 0.34);
    border-radius: 6px;
    background: rgba(34, 211, 238, 0.07);
    color: #a5f3fc;
    font: inherit;
    font-size: 11px;
    font-weight: 800;
    cursor: pointer;
  }

  .file-button input { display: none; }
  .file-name { margin-top: 10px; color: #fbbf24; font-size: 10px; }

  .import-panel textarea {
    width: 100%;
    min-height: 180px;
    margin: 12px 0;
    padding: 12px;
    resize: vertical;
    border: 1px solid rgba(148, 163, 184, 0.2);
    border-radius: 8px;
    outline: none;
    background: #020617;
    color: #cbd5e1;
    font: 12px/1.55 Consolas, monospace;
    box-sizing: border-box;
  }

  .import-panel textarea:focus { border-color: rgba(34, 211, 238, 0.55); }
  .import-meta { display: flex; flex-wrap: wrap; gap: 8px; }
  .import-meta span {
    padding: 5px 8px;
    border: 1px solid rgba(148, 163, 184, 0.16);
    border-radius: 999px;
    color: #64748b;
    font-size: 9px;
  }
  .import-meta strong { margin-left: 5px; color: #e2e8f0; }
  .import-button:disabled { cursor: not-allowed; opacity: 0.35; }
  .import-message { margin-top: 10px; font-size: 11px; }
  .import-message.error { color: #fb7185; }
  .import-message.success { color: #6ee7b7; }

  .story-layout {
    max-width: 1280px;
    margin: 0 auto;
    display: grid;
    grid-template-columns: minmax(240px, 320px) minmax(0, 1fr);
    gap: 18px;
  }

  .story-list, .story-detail, .empty-state {
    border: 1px solid rgba(148, 163, 184, 0.16);
    border-radius: 12px;
    background: rgba(8, 15, 32, 0.82);
  }

  .story-list { padding: 10px; align-self: start; }
  .story-list article {
    display: grid;
    grid-template-columns: minmax(0, 1fr) auto;
    gap: 6px;
    margin-bottom: 8px;
    padding: 7px;
    border: 1px solid transparent;
    border-radius: 8px;
  }
  .story-list article.active {
    border-color: rgba(251, 191, 36, 0.4);
    background: rgba(251, 191, 36, 0.06);
  }

  .story-select, .delete-button {
    border: 0;
    background: transparent;
    color: inherit;
    cursor: pointer;
  }
  .story-select { min-width: 0; display: grid; gap: 4px; text-align: left; }
  .story-type { color: #22d3ee; font-size: 9px; text-transform: uppercase; }
  .story-select strong { overflow: hidden; color: #f8fafc; text-overflow: ellipsis; white-space: nowrap; }
  .story-select small { color: #64748b; }
  .delete-button { color: #fb7185; font-size: 10px; }
  .story-detail { min-width: 0; padding: 16px; }
  .reference-images-panel {
    margin-bottom: 14px;
    padding: 13px;
    border: 1px solid rgba(251, 191, 36, 0.24);
    border-radius: 9px;
    background: rgba(251, 191, 36, 0.035);
  }
  .reference-images-heading {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 12px;
  }
  .reference-images-heading span {
    color: #fbbf24;
    font-size: 8px;
    letter-spacing: 0.15em;
  }
  .reference-images-heading h2 { margin: 3px 0 0; font-size: 15px; }
  .reference-upload {
    padding: 8px 11px;
    border: 1px solid rgba(251, 191, 36, 0.34);
    border-radius: 6px;
    color: #fde68a;
    font-size: 10px;
    font-weight: 800;
    cursor: pointer;
  }
  .reference-upload input { display: none; }
  .reference-image-grid {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(160px, 1fr));
    gap: 9px;
    margin-top: 12px;
  }
  .reference-image-grid article {
    overflow: hidden;
    border: 1px solid rgba(148, 163, 184, 0.18);
    border-radius: 7px;
    background: #020617;
  }
  .reference-image-grid article.active {
    border-color: rgba(251, 191, 36, 0.7);
    box-shadow: 0 0 0 1px rgba(251, 191, 36, 0.18);
  }
  .reference-image-grid img {
    width: 100%;
    aspect-ratio: 4 / 3;
    display: block;
    object-fit: cover;
  }
  .reference-image-meta { display: grid; gap: 3px; padding: 8px; }
  .reference-image-meta strong {
    overflow: hidden;
    color: #e2e8f0;
    font-size: 10px;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .reference-image-meta span { color: #fbbf24; font-size: 8px; }
  .reference-image-actions { display: grid; grid-template-columns: 1fr auto; gap: 5px; padding: 0 8px 8px; }
  .reference-image-actions button {
    padding: 6px;
    border: 1px solid rgba(34, 211, 238, 0.24);
    border-radius: 5px;
    background: rgba(34, 211, 238, 0.05);
    color: #a5f3fc;
    font-size: 9px;
    cursor: pointer;
  }
  .reference-image-actions .remove-reference { color: #fb7185; }
  .reference-image-actions button:disabled { cursor: default; opacity: 0.4; }
  .reference-empty { margin: 12px 0 0; color: #64748b; font-size: 10px; }
  .empty-state { max-width: 760px; margin: 80px auto; padding: 48px; text-align: center; }
  .empty-state p { margin-bottom: 28px; color: #94a3b8; }

  @media (max-width: 760px) {
    .story-page { padding: 18px; }
    header { align-items: start; flex-direction: column; }
    .import-heading, .import-footer { align-items: stretch; flex-direction: column; }
    .story-layout { grid-template-columns: 1fr; }
  }
</style>
