<script lang="ts">
  type Action = (() => void) | undefined;
  let {
    cardId,
    animation,
    story,
    video,
    generateVideo,
    disabled = false,
    generateVideoDisabled = false,
  }: {
    cardId: string;
    image?: Action;
    yaml?: Action;
    animation?: Action;
    story?: Action;
    video?: Action;
    generateVideo?: Action;
    voice?: Action;
    bgm?: Action;
    disabled?: boolean;
    generateVideoDisabled?: boolean;
  } = $props();

  let open = $state(false);
  let loadedCardId = '';
  $effect(() => {
    if (typeof localStorage === 'undefined' || loadedCardId === cardId) return;
    loadedCardId = cardId;
    open = localStorage.getItem(`story-card-open:${cardId}`) === 'true';
  });
  function toggle(): void {
    open = !open;
    localStorage?.setItem(`story-card-open:${cardId}`, String(open));
  }
</script>

<section class="story-card" class:open>
  <button class="story-head" type="button" onclick={toggle} aria-expanded={open}>
    <span>🎞️ Video Production</span><span class="story-toggle">{open ? '− Close' : '+ Open'}</span>
  </button>
  {#if open}
    <div class="story-pipeline">
      <button onclick={animation} disabled={!animation || disabled}>📜 Idle Animation</button>
      <button onclick={story} disabled={!story || disabled}>🎬 Story Blueprint</button>
      <button onclick={video} disabled={!video || disabled}>📦 Video Package</button>
      {#if generateVideo}
        <button onclick={generateVideo} disabled={generateVideoDisabled}>🎥 動画生成</button>
      {/if}
    </div>
  {/if}
</section>

<style>
  .story-card { margin-top: 10px; max-width: 360px; border: 1px solid rgba(122, 107, 220, .35); border-radius: 9px; background: rgba(20, 18, 39, .7); overflow: hidden; }
  .story-head { width: 100%; display: flex; justify-content: space-between; gap: 12px; border: 0; padding: 9px 11px; color: #f2efff; background: transparent; font: inherit; cursor: pointer; }
  .story-toggle { color: #b6aedc; font-size: 12px; }
  .story-pipeline { display: grid; grid-template-columns: 1fr; gap: 6px; padding: 0 10px 10px; }
  .story-pipeline button { border: 1px solid rgba(154, 140, 238, .35); border-radius: 6px; padding: 8px 9px; color: #e9e5ff; background: rgba(81, 66, 147, .22); text-align: left; cursor: pointer; }
  .story-pipeline button:disabled { opacity: .45; cursor: not-allowed; }
  @media (max-width: 640px) { .story-card { max-width: none; } .story-head { min-height: 42px; } }
</style>
