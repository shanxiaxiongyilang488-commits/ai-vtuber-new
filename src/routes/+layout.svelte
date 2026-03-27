<script lang="ts">
  import type { Snippet } from 'svelte';

  interface Props {
    children: Snippet;
  }

  let { children }: Props = $props();
</script>

{@render children()}

<style>
  :global(*, *::before, *::after) {
    box-sizing: border-box;
  }

  :global(:root) {
    --bg: #0f1117;
    --surface: #1a1d27;
    --border: #2a2d3e;
    --text: #e2e8f0;
    --text-muted: #64748b;
    --accent-primary: #6366f1;
    color-scheme: dark;
  }

  :global(body) {
    margin: 0;
    font-family: 'Segoe UI', 'Hiragino Sans', 'Noto Sans JP', system-ui, sans-serif;
    background: var(--bg);
    color: var(--text);
    line-height: 1.5;
  }

  :global(h1, h2, h3, h4) { margin: 0; }
  :global(p) { margin: 0; }
  :global(button, input, textarea, select) { font-family: inherit; }

  :global(::-webkit-scrollbar) { width: 6px; }
  :global(::-webkit-scrollbar-track) { background: var(--bg); }
  :global(::-webkit-scrollbar-thumb) { background: var(--border); border-radius: 3px; }
  :global(::-webkit-scrollbar-thumb:hover) { background: var(--text-muted); }
</style>
