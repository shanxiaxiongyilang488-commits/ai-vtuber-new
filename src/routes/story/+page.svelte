<script lang="ts">
  import { onMount } from 'svelte';
  import StoryViewer from '$lib/components/StoryViewer.svelte';
  import { deleteStory, loadStoryLibrary, type SavedStory } from '$lib/storyLibrary';

  let stories = $state<SavedStory[]>([]);
  let selectedId = $state('');
  let selectedStory = $derived(
    stories.find((story) => story.id === selectedId) ?? stories[0] ?? null,
  );

  onMount(() => {
    stories = loadStoryLibrary();
    selectedId = stories[0]?.id ?? '';
  });

  function openMangaProject(rawYaml: string): void {
    localStorage.setItem('studio-yaml', rawYaml);
    window.location.href = '/project';
  }

  function removeStory(id: string): void {
    stories = deleteStory(id);
    selectedId = stories[0]?.id ?? '';
  }

  function formatDate(value: string): string {
    return new Date(value).toLocaleString('ja-JP');
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
            <button class="story-select" onclick={() => (selectedId = story.id)}>
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
          <StoryViewer rawYaml={selectedStory.rawYaml} onManga={openMangaProject} />
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
  .empty-state { max-width: 760px; margin: 80px auto; padding: 48px; text-align: center; }
  .empty-state p { margin-bottom: 28px; color: #94a3b8; }

  @media (max-width: 760px) {
    .story-page { padding: 18px; }
    header { align-items: start; flex-direction: column; }
    .story-layout { grid-template-columns: 1fr; }
  }
</style>
