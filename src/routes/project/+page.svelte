<script lang="ts">
  import ProjectWorkspace from '../studio/+page.svelte';
  import CharacterLibrary from '../characters/+page.svelte';

  let section = $state<'manga' | 'characters'>('manga');
</script>

<nav class="project-mode-nav" aria-label="Project sections">
  <strong>PROJECT</strong>
  <button class:active={section === 'manga'} onclick={() => (section = 'manga')}>
    MANGA
  </button>
  <button class:active={section === 'characters'} onclick={() => (section = 'characters')}>
    CHARACTER LIBRARY
  </button>
</nav>

{#if section === 'manga'}
  <ProjectWorkspace />
{:else}
  <CharacterLibrary />
{/if}

<style>
  .project-mode-nav {
    position: sticky;
    top: 0;
    z-index: 1000;
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 10px 18px;
    border-bottom: 1px solid rgba(34, 211, 238, 0.22);
    background: rgba(2, 6, 23, 0.96);
    backdrop-filter: blur(12px);
  }
  strong {
    margin-right: 8px;
    color: #67e8f9;
    font: 800 11px/1 Consolas, monospace;
    letter-spacing: 0.16em;
  }
  button {
    padding: 7px 11px;
    border: 1px solid rgba(148, 163, 184, 0.2);
    border-radius: 6px;
    background: transparent;
    color: #94a3b8;
    font: 800 10px/1 "Segoe UI", sans-serif;
    cursor: pointer;
  }
  button.active {
    border-color: rgba(34, 211, 238, 0.55);
    background: rgba(34, 211, 238, 0.1);
    color: #a5f3fc;
  }
</style>
