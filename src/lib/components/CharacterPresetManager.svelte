<script lang="ts">
  import {
    deleteCharacterPreset,
    getCharacterPresets,
    saveCharacterPreset,
    type CharacterPreset,
  } from '$lib/characterPresetStorage';

  type MediaImage = { id: string; label: string; value: string };

  let {
    mediaImages = [],
    onLoad,
    maxImages = 9,
  }: {
    mediaImages?: MediaImage[];
    onLoad: (mediaIds: string[]) => void;
    maxImages?: number;
  } = $props();

  let presets = $state<CharacterPreset[]>([]);
  let selectedMediaIds = $state<string[]>([]);
  let presetName = $state('');
  let open = $state(false);

  function refreshPresets(): void {
    presets = getCharacterPresets();
  }

  function toggleImage(mediaId: string): void {
    if (selectedMediaIds.includes(mediaId)) {
      selectedMediaIds = selectedMediaIds.filter((id) => id !== mediaId);
      return;
    }
    if (selectedMediaIds.length < maxImages) selectedMediaIds = [...selectedMediaIds, mediaId];
  }

  function savePreset(name = presetName): void {
    const trimmedName = name.trim();
    if (!trimmedName || selectedMediaIds.length === 0) return;
    saveCharacterPreset(trimmedName, selectedMediaIds);
    presetName = '';
    selectedMediaIds = [];
    refreshPresets();
  }

  function loadPreset(preset: CharacterPreset): void {
    const mediaIds = preset.mediaIds.map((reference) => (
      mediaImages.some((image) => image.id === reference)
        ? reference
        : (mediaImages.find((image) => image.value === reference)?.id ?? reference)
    ));
    onLoad(mediaIds.slice(0, maxImages));
  }

  refreshPresets();
</script>

<section class="character-preset-manager" aria-label="Character Preset">
  <div class="preset-heading">
    <strong>Character Preset</strong>
    <button type="button" onclick={() => { refreshPresets(); open = !open; }} aria-expanded={open}>
      {open ? '閉じる' : '管理'}
    </button>
  </div>

  {#if open}
    <div class="preset-content">
      <p>mediaStore の画像を最大 {maxImages} 枚までまとめて保存できます。</p>
      {#if mediaImages.length > 0}
        <div class="image-picker" aria-label="プリセットに保存する画像">
          {#each mediaImages as image (image.id)}
            <button
              type="button"
              class:selected={selectedMediaIds.includes(image.id)}
              aria-pressed={selectedMediaIds.includes(image.id)}
              onclick={() => toggleImage(image.id)}
            >
              <img src={image.value} alt={image.label} />
              <span>{selectedMediaIds.includes(image.id) ? '✓' : '+'}</span>
            </button>
          {/each}
        </div>
      {:else}
        <p class="empty">mediaStore に保存済みの画像がありません。</p>
      {/if}

      <div class="save-row">
        <input bind:value={presetName} placeholder="例: シロ＆ミケ 資料集" aria-label="プリセット名" />
        <button type="button" onclick={() => savePreset()} disabled={!presetName.trim() || selectedMediaIds.length === 0}>保存 ({selectedMediaIds.length}/{maxImages})</button>
      </div>
      <div class="quick-save">
        <button type="button" onclick={() => savePreset('シロ 資料集')} disabled={selectedMediaIds.length === 0}>シロとして保存</button>
        <button type="button" onclick={() => savePreset('ミケ 資料集')} disabled={selectedMediaIds.length === 0}>ミケとして保存</button>
      </div>

      {#if presets.length > 0}
        <div class="preset-list" aria-label="保存済み Character Preset">
          {#each presets as preset (preset.id)}
            <article>
              <div>
                <strong>{preset.name}</strong>
                <span>{preset.mediaIds.length}枚</span>
              </div>
              <div class="preset-actions">
                <button type="button" onclick={() => loadPreset(preset)}>読み込む</button>
                <button type="button" class="delete" onclick={() => { deleteCharacterPreset(preset.id); refreshPresets(); }}>×</button>
              </div>
            </article>
          {/each}
        </div>
      {/if}
    </div>
  {/if}
</section>

<style>
  .character-preset-manager { display: grid; gap: 7px; padding: 8px; border: 1px solid rgba(96, 165, 250, .32); border-radius: 6px; color: #dbeafe; font-size: 12px; }
  .preset-heading, .save-row, .quick-save, article, .preset-actions { display: flex; align-items: center; gap: 6px; }
  .preset-heading { justify-content: space-between; }
  .preset-content { display: grid; gap: 7px; }
  p { margin: 0; color: #bfdbfe; font-size: 11px; }
  button, input { border: 1px solid rgba(96, 165, 250, .45); border-radius: 5px; padding: 5px 7px; color: #dbeafe; background: rgba(30, 58, 138, .24); font: inherit; font-size: 11px; }
  button { cursor: pointer; }
  button:disabled { cursor: not-allowed; opacity: .45; }
  .image-picker { display: flex; flex-wrap: wrap; gap: 6px; }
  .image-picker button { position: relative; padding: 0; border-color: transparent; background: transparent; }
  .image-picker button.selected { border-color: #60a5fa; }
  .image-picker img { display: block; width: 52px; height: 52px; object-fit: cover; border-radius: 4px; }
  .image-picker span { position: absolute; right: -4px; bottom: -4px; display: grid; width: 18px; height: 18px; place-items: center; border-radius: 50%; color: #fff; background: #2563eb; font-weight: 800; }
  .save-row input { flex: 1; min-width: 0; }
  .quick-save { flex-wrap: wrap; }
  .preset-list { display: grid; gap: 5px; padding-top: 6px; border-top: 1px solid rgba(96, 165, 250, .2); }
  article { justify-content: space-between; }
  article > div:first-child { display: grid; gap: 1px; }
  article span { color: #93c5fd; font-size: 10px; }
  .delete { min-width: 24px; color: #fecaca; border-color: rgba(248, 113, 113, .5); }
</style>
