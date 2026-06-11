<script lang="ts">
  import { parseStoryYaml } from '$lib/storyYaml';

  type ViewerAction = (rawYaml: string) => void | Promise<void>;

  let {
    rawYaml,
    onManga,
    onSequel,
    onContinuityCheck,
    onContinueManga,
    onContinuityExtracted,
    onCharacterSheet,
    onWorldSetting,
  }: {
    rawYaml: string;
    onManga?: ViewerAction;
    onSequel?: ViewerAction;
    onContinuityCheck?: ViewerAction;
    onContinueManga?: ViewerAction;
    onContinuityExtracted?: ViewerAction;
    onCharacterSheet?: ViewerAction;
    onWorldSetting?: ViewerAction;
  } = $props();
  let story = $derived(parseStoryYaml(rawYaml));
  let extractedYaml = '';

  $effect(() => {
    const yaml = story?.rawYaml ?? '';
    if (!yaml || yaml === extractedYaml) return;
    extractedYaml = yaml;
    void onContinuityExtracted?.(yaml);
  });

  const storyTypeLabels: Record<string, string> = {
    short_story: 'SHORT STORY',
    comic_story: 'COMIC STORY',
    long_story: 'LONG STORY',
    novel_story: 'NOVEL STORY',
    character_sheet: 'CHARACTER SHEET',
    world_setting: 'WORLD SETTING',
  };

  function downloadStoryYaml(): void {
    if (!story) return;
    const date = new Date();
    const dateStamp = [
      date.getFullYear(),
      String(date.getMonth() + 1).padStart(2, '0'),
      String(date.getDate()).padStart(2, '0'),
    ].join('');
    const titleSlug = story.title
      .normalize('NFKC')
      .toLowerCase()
      .replace(/[^a-z0-9ぁ-んァ-ヶ一-龯]+/g, '_')
      .replace(/^_+|_+$/g, '')
      .slice(0, 60);
    const fallbackTimestamp = date.getTime();
    const fileName = titleSlug
      ? `story_${titleSlug}_${dateStamp}.yaml`
      : `story_${fallbackTimestamp}.yaml`;
    const blob = new Blob([story.rawYaml], { type: 'application/yaml;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = fileName;
    anchor.click();
    URL.revokeObjectURL(url);
  }
</script>

{#if story}
  <div class="story-yaml-viewer">
    <section class="story-card story-title-card">
      <div class="story-icon">📖</div>
      <div class="story-card-content">
        <div class="story-label">{storyTypeLabels[story.storyType] ?? story.storyType}</div>
        <div class="story-title">{story.title}</div>
        {#if story.theme}<div class="story-theme">{story.theme}</div>{/if}
      </div>
    </section>

    {#if story.characters.length > 0}
      <section class="story-card">
        <div class="story-section-title"><span>🎭</span> キャラクター</div>
        <div class="character-grid">
          {#each story.characters as character}
            <article class="character-card">
              <div class="character-name">{character.name}</div>
              {#if character.role}<div class="character-role">{character.role}</div>{/if}
              {#if character.personality}<div class="character-detail">{character.personality}</div>{/if}
              {#if character.visual}<div class="character-detail visual">{character.visual}</div>{/if}
            </article>
          {/each}
        </div>
      </section>
    {/if}

    <section class="story-card">
      <div class="story-section-title"><span>📄</span> ストーリー概要</div>
      {#if story.overview}
        <div class="story-overview">{story.overview}</div>
      {/if}
      {#if story.storyBeats.length > 0}
        <div class="beat-list">
          {#each story.storyBeats as beat, index}
            <div class="beat-row">
              <span class="beat-number">{index + 1}</span>
              <div>
                <div class="beat-name">{beat.beat}</div>
                <div class="beat-summary">{beat.summary}</div>
              </div>
            </div>
          {/each}
        </div>
      {/if}
    </section>

    {#if story.pages.length > 0}
      <section class="story-card">
        <div class="story-section-title"><span>📚</span> ページ構成</div>
        <div class="page-list">
          {#each story.pages as page}
            <details class="page-card" open={story.pages.length <= 2}>
              <summary>
                <span>PAGE {page.page}</span>
                <span class="page-layout">{page.layout}</span>
                <span class="page-count">{page.panels.length} PANELS</span>
              </summary>
              {#if page.summary}<div class="page-summary">{page.summary}</div>{/if}
              <div class="panel-list">
                {#each page.panels as panel}
                  <article class="panel-card">
                    <div class="panel-number">PANEL {panel.panel}</div>
                    {#if panel.scene}<div class="panel-scene">{panel.scene}</div>{/if}
                    {#if panel.dialogue.length > 0}
                      <div class="panel-dialogue">{panel.dialogue.join('\n')}</div>
                    {/if}
                  </article>
                {/each}
              </div>
            </details>
          {/each}
        </div>
      </section>
    {/if}

    <details class="story-card continuity-card">
      <summary>継続メモリ確認</summary>
      <div class="continuity-content">
        <div><strong>シリーズ:</strong> {story.continuity.seriesTitle}</div>
        <div><strong>ページ:</strong> {story.continuity.pageIndex}</div>
        <div><strong>キャラクター:</strong> {story.continuity.characters.map((character) => character.name).join(' / ')}</div>
        <div><strong>直前の出来事:</strong> {story.continuity.lastPageSummary || '未設定'}</div>
        <div><strong>現在地:</strong> {story.continuity.currentLocation || '未設定'}</div>
      </div>
    </details>

    <div class="viewer-actions">
      <button class="download-action" onclick={downloadStoryYaml}>📥 YAML保存</button>
      <button onclick={() => onManga?.(story.rawYaml)}>漫画化</button>
      <button onclick={() => onContinuityCheck?.(story.rawYaml)}>継続メモリ確認</button>
      <button onclick={() => onSequel?.(story.rawYaml)}>次ページYAML作成</button>
      <button onclick={() => onContinueManga?.(story.rawYaml)}>この続きで漫画化</button>
      <button onclick={() => onCharacterSheet?.(story.rawYaml)}>キャラ資料化</button>
      <button onclick={() => onWorldSetting?.(story.rawYaml)}>設定資料化</button>
    </div>

    <details class="raw-yaml">
      <summary>YAMLを表示</summary>
      <pre>{story.rawYaml}</pre>
    </details>
  </div>
{/if}

<style>
  .story-yaml-viewer {
    display: flex;
    flex-direction: column;
    gap: 9px;
    margin-top: 8px;
  }

  .story-card,
  .raw-yaml {
    border: 1px solid rgba(0, 229, 255, 0.16);
    border-radius: 8px;
    background: rgba(2, 8, 23, 0.55);
    overflow: hidden;
  }

  .story-title-card {
    display: flex;
    gap: 10px;
    align-items: center;
    padding: 11px 12px;
    border-color: rgba(251, 191, 36, 0.28);
    background: linear-gradient(135deg, rgba(251, 191, 36, 0.08), rgba(0, 229, 255, 0.04));
  }

  .story-icon {
    font-size: 22px;
  }

  .story-card-content {
    min-width: 0;
  }

  .story-label,
  .story-section-title,
  .panel-number {
    color: rgba(0, 229, 255, 0.78);
    font-size: 9px;
    font-weight: 800;
    letter-spacing: 1.4px;
  }

  .story-title {
    margin-top: 2px;
    color: #fbbf24;
    font-size: 15px;
    font-weight: 800;
  }

  .story-theme {
    margin-top: 4px;
    color: rgba(226, 232, 240, 0.72);
    font-size: 11px;
  }

  .story-card:not(.story-title-card) {
    padding: 10px;
  }

  .story-section-title {
    display: flex;
    gap: 6px;
    align-items: center;
    margin-bottom: 8px;
  }

  .character-grid {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(150px, 1fr));
    gap: 7px;
  }

  .character-card,
  .panel-card {
    padding: 8px 9px;
    border: 1px solid rgba(167, 139, 250, 0.22);
    border-left: 2px solid rgba(167, 139, 250, 0.55);
    border-radius: 5px;
    background: rgba(167, 139, 250, 0.045);
  }

  .character-name {
    color: #e9d5ff;
    font-size: 12px;
    font-weight: 800;
  }

  .character-role {
    margin-top: 2px;
    color: #fbbf24;
    font-size: 9px;
  }

  .character-detail,
  .story-overview,
  .beat-summary,
  .page-summary,
  .panel-scene {
    margin-top: 5px;
    color: rgba(226, 232, 240, 0.84);
    font-size: 11px;
    line-height: 1.55;
    white-space: pre-wrap;
  }

  .story-overview {
    margin: 0 0 8px;
  }

  .character-detail.visual {
    color: rgba(148, 163, 184, 0.82);
  }

  .beat-list,
  .page-list,
  .panel-list {
    display: flex;
    flex-direction: column;
    gap: 6px;
  }

  .beat-row {
    display: grid;
    grid-template-columns: 22px minmax(0, 1fr);
    gap: 8px;
    padding: 7px 8px;
    border-left: 2px solid rgba(34, 211, 238, 0.5);
    background: rgba(34, 211, 238, 0.035);
  }

  .beat-number {
    color: #22d3ee;
    font-size: 11px;
    font-weight: 800;
  }

  .beat-name {
    color: #67e8f9;
    font-size: 10px;
    font-weight: 800;
    text-transform: uppercase;
  }

  .page-card {
    border: 1px solid rgba(0, 229, 255, 0.14);
    border-radius: 6px;
    background: rgba(0, 229, 255, 0.025);
    overflow: hidden;
  }

  .page-card summary,
  .raw-yaml summary {
    display: flex;
    gap: 8px;
    align-items: center;
    padding: 7px 9px;
    color: rgba(0, 229, 255, 0.82);
    font-size: 10px;
    font-weight: 800;
    letter-spacing: 0.8px;
    cursor: pointer;
  }

  .page-layout,
  .page-count {
    padding: 2px 6px;
    border: 1px solid rgba(251, 191, 36, 0.22);
    border-radius: 999px;
    color: #fbbf24;
    font-size: 8px;
  }

  .page-count {
    margin-left: auto;
    border-color: rgba(167, 139, 250, 0.22);
    color: #c4b5fd;
  }

  .page-summary,
  .panel-list {
    margin: 0 9px 8px;
  }

  .panel-card {
    border-color: rgba(0, 229, 255, 0.12);
    border-left-color: rgba(0, 229, 255, 0.45);
  }

  .panel-dialogue {
    margin-top: 5px;
    padding: 5px 7px;
    border-radius: 4px;
    background: rgba(251, 191, 36, 0.06);
    color: #fde68a;
    font-size: 10.5px;
    line-height: 1.5;
    white-space: pre-wrap;
  }

  .viewer-actions {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 6px;
  }

  .viewer-actions button {
    padding: 7px 8px;
    border: 1px solid rgba(0, 229, 255, 0.24);
    border-radius: 5px;
    background: rgba(0, 229, 255, 0.055);
    color: #a5f3fc;
    font: inherit;
    font-size: 10px;
    font-weight: 800;
    cursor: pointer;
  }

  .viewer-actions button:hover {
    border-color: rgba(251, 191, 36, 0.42);
    background: rgba(251, 191, 36, 0.08);
    color: #fde68a;
  }

  .viewer-actions .download-action {
    grid-column: 1 / -1;
    border-color: rgba(52, 211, 153, 0.3);
    background: rgba(52, 211, 153, 0.07);
    color: #6ee7b7;
  }

  .continuity-card summary {
    padding: 8px 10px;
    color: #6ee7b7;
    font-size: 10px;
    font-weight: 800;
    cursor: pointer;
  }

  .continuity-content {
    display: grid;
    gap: 5px;
    padding: 0 10px 10px;
    color: rgba(226, 232, 240, 0.84);
    font-size: 10.5px;
    line-height: 1.5;
  }

  .raw-yaml summary {
    color: rgba(148, 163, 184, 0.9);
    background: rgba(100, 116, 139, 0.07);
  }

  .raw-yaml pre {
    max-height: 360px;
    margin: 0;
    padding: 10px;
    overflow: auto;
    color: #94a3b8;
    font-size: 10px;
    line-height: 1.55;
    white-space: pre;
  }
</style>
