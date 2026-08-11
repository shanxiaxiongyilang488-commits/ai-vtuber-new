<script lang="ts">
  import type { MediaInfo } from '$lib/types';
  import { saveMediaToProject } from '$lib/mediaEngine';

  interface Props {
    media: MediaInfo;
  }

  let { media }: Props = $props();
  let saving = $state(false);
  let saveStatus = $state('');

  function downloadMedia() {
    if (!media.url) return;
    const link = document.createElement('a');
    link.href = media.url;
    link.download = `${media.title || 'media'}-${Date.now()}`;
    link.click();
  }

  async function saveToProject() {
    if (saving) return;
    saving = true;
    saveStatus = '';
    try {
      await saveMediaToProject(media);
      saveStatus = 'Saved to PROJECT';
    } catch (error) {
      saveStatus = error instanceof Error ? error.message : 'PROJECT save failed';
    } finally {
      saving = false;
    }
  }

  function getMediaTypeEmoji(type: string): string {
    const labels: Record<string, string> = {
      image: 'IMAGE',
      video: 'VIDEO',
      audio: 'AUDIO',
      storyboard: 'BOARD',
      yaml: 'YAML',
    };
    return labels[type] ?? 'MEDIA';
  }
</script>

<div class="media-card" data-type={media.type}>
  <div class="media-header">
    <span class="media-icon">{getMediaTypeEmoji(media.type)}</span>
    {#if media.title}
      <h4 class="media-title">{media.title}</h4>
    {/if}
  </div>

  {#if media.type === 'image' && media.url}
    <div class="media-content image">
      <img src={media.url} alt={media.title || 'Generated image'} />
    </div>
  {:else if media.type === 'video' && media.url}
    <div class="media-content video">
      <!-- TODO: Replace with actual video player component for VIDEO LAB -->
      <video src={media.url} controls autoplay={false} playsinline style="width:100%;border-radius:12px">
        <track kind="captions" srclang="ja" label="Japanese" src="/mock/captions.vtt" />
      </video>
    </div>
  {:else if media.type === 'audio' && media.url}
    <div class="media-content audio">
      <audio src={media.url} controls></audio>
    </div>
  {:else if media.type === 'yaml' && media.metadata?.content}
    <div class="media-content yaml">
      <pre><code>{media.metadata.content}</code></pre>
    </div>
  {:else if media.type === 'storyboard' && media.thumbnailUrl}
    <div class="media-content storyboard">
      <img src={media.thumbnailUrl} alt={media.title || 'Storyboard'} />
    </div>
  {:else}
    <div class="media-placeholder">No preview available</div>
  {/if}

  {#if media.prompt}
    <div class="media-prompt">
      <span class="label">Prompt:</span>
      <p>{media.prompt}</p>
    </div>
  {/if}

  {#if media.summary}
    <div class="media-summary">
      <span class="label">Summary:</span>
      <p>{media.summary}</p>
    </div>
  {/if}

  <div class="media-actions">
    {#if media.url}
      <button class="action-btn download" onclick={downloadMedia} title="Download">
        Download
      </button>
    {/if}
    {#if media.metadata?.storyId}
      <a
        class="action-btn view"
        href="/story?id={media.metadata.storyId}"
        title="View in Story"
      >
        Story
      </a>
    {/if}
    <button class="action-btn save" onclick={saveToProject} disabled={saving} title="Save to PROJECT">
      {#if saving}
        Saving...
      {:else}
        &#x1F4E6; &#x4FDD;&#x5B58;
      {/if}
    </button>
  </div>
  {#if saveStatus}<div class="media-save-status">{saveStatus}</div>{/if}
</div>

<style>
  .media-card {
    border: 1px solid rgba(148, 163, 184, 0.2);
    border-radius: 8px;
    background: rgba(2, 6, 14, 0.45);
    padding: 12px;
    margin: 8px 0;
    display: grid;
    gap: 10px;
  }

  .media-header {
    display: flex;
    align-items: center;
    gap: 8px;
    padding-bottom: 8px;
    border-bottom: 1px solid rgba(148, 163, 184, 0.12);
  }

  .media-icon {
    font-size: 18px;
  }

  .media-title {
    margin: 0;
    font-size: 13px;
    font-weight: 600;
    color: #e8eef8;
  }

  .media-content {
    width: 100%;
    max-height: 400px;
    border-radius: 6px;
    overflow: hidden;
    background: #020617;
  }

  .media-content.image img,
  .media-content.storyboard img {
    width: 100%;
    height: 100%;
    object-fit: contain;
    display: block;
  }

  .media-content.video video {
    width: 100%;
    height: 100%;
    display: block;
  }

  .media-content.audio {
    padding: 12px;
  }

  .media-content.audio audio {
    width: 100%;
  }

  .media-content.yaml {
    max-height: 300px;
    overflow-y: auto;
    padding: 10px;
  }

  .media-content.yaml pre {
    margin: 0;
    font-size: 11px;
    color: #cbd5e1;
    font-family: 'Courier New', monospace;
    line-height: 1.4;
    white-space: pre-wrap;
    word-break: break-word;
  }

  .media-placeholder {
    padding: 24px;
    text-align: center;
    color: #8ba3bd;
    font-size: 12px;
  }

  .media-prompt,
  .media-summary {
    font-size: 12px;
    color: #cbd5e1;
    padding: 8px;
    border-left: 3px solid rgba(246, 196, 83, 0.3);
    background: rgba(246, 196, 83, 0.05);
    border-radius: 4px;
  }

  .media-prompt .label,
  .media-summary .label {
    color: #f6c453;
    font-weight: 600;
  }

  .media-prompt p,
  .media-summary p {
    margin: 4px 0 0 0;
  }

  .media-actions {
    display: flex;
    gap: 8px;
    flex-wrap: wrap;
    margin-top: 4px;
  }

  .action-btn {
    padding: 6px 12px;
    font-size: 11px;
    font-weight: 600;
    border: 1px solid rgba(148, 163, 184, 0.22);
    border-radius: 5px;
    background: rgba(9, 14, 24, 0.8);
    color: #8be9ff;
    cursor: pointer;
    text-decoration: none;
    display: inline-flex;
    align-items: center;
    gap: 4px;
    transition: all 0.2s;
  }

  .action-btn:hover {
    border-color: rgba(148, 163, 184, 0.4);
    background: rgba(9, 14, 24, 0.95);
    color: #fde68a;
  }

  .action-btn.download {
    color: #86efac;
  }

  .action-btn.save {
    color: #fde68a;
  }

  .action-btn.download:hover {
    color: #dcfce7;
  }

  .action-btn.view {
    color: #fb923c;
  }

  .action-btn.view:hover {
    color: #fed7aa;
  }

  .media-save-status {
    color: #94a3b8;
    font-size: 11px;
  }
</style>
