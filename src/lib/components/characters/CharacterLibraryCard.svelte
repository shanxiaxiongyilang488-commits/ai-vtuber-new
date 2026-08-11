<script lang="ts">
  import { untrack } from 'svelte';

  export type CharacterLibraryItem = {
    id: string;
    name: string;
    role: string;
    description: string;
    image: string;
    imageDataUrl?: string;
    characterYaml?: string;
    hasReference?: boolean;
    criticalFeatures?: string[];
    voice?: {
      engine: string;
      mode: string;
      model: string;
      caption?: string;
    };
    avatarType?: 'purupuru';
    avatarSrc?: string;
  };

  let {
    character,
    editing = false,
    busy = false,
    onEdit,
    onCancel,
    onSave,
    onImageChange,
    onGenerateSheet,
    onChat,
    onMemory,
    onLibrary,
    onLive2D,
    onVoiceDesign,
    onPuruPuru,
    onAnalyze,
    analysisCandidate = '',
  }: {
    character: CharacterLibraryItem;
    editing?: boolean;
    busy?: boolean;
    onEdit: () => void;
    onCancel: () => void;
    onSave: (input: Pick<CharacterLibraryItem, 'name' | 'role' | 'description'>) => void | Promise<void>;
    onImageChange: (file: File) => void | Promise<void>;
    onGenerateSheet: () => void | Promise<void>;
    onChat: () => void;
    onMemory: () => void;
    onLibrary: () => void;
    onLive2D: () => void;
    onVoiceDesign: () => void;
    onPuruPuru?: () => void;
    onAnalyze: (category: string) => void | Promise<void>;
    analysisCandidate?: string;
  } = $props();

  let name = $state(untrack(() => character.name));
  let role = $state(untrack(() => character.role));
  let description = $state(untrack(() => character.description));
  let syncedId = $state(untrack(() => character.id));

  $effect(() => {
    if (character.id === syncedId && editing) return;
    syncedId = character.id;
    name = character.name;
    role = character.role;
    description = character.description;
  });

  function chooseImage(event: Event): void {
    const input = event.currentTarget as HTMLInputElement;
    const file = input.files?.[0];
    input.value = '';
    if (file) void onImageChange(file);
  }
</script>

<article class="character-card">
  <div class="thumbnail">
    {#if character.imageDataUrl}
      <img src={character.imageDataUrl} alt={character.name} />
    {:else}
      <div class="image-placeholder">NO IMAGE</div>
    {/if}
    <label class="image-button">
      画像変更
      <input type="file" accept="image/*" onchange={chooseImage} />
    </label>
  </div>

  <div class="card-body">
    <div class="id-label">{character.id}</div>
    {#if editing}
      <label>
        <span>名前</span>
        <input bind:value={name} />
      </label>
      <label>
        <span>役割</span>
        <input bind:value={role} />
      </label>
      <label>
        <span>説明</span>
        <textarea bind:value={description} rows="4"></textarea>
      </label>
      <div class="actions">
        <button class="secondary" onclick={onCancel} disabled={busy}>キャンセル</button>
        <button onclick={() => onSave({ name, role, description })} disabled={busy || !name.trim()}>
          {busy ? '保存中...' : '保存'}
        </button>
      </div>
    {:else}
      <h2>{character.name}</h2>
      <div class="role">{character.role || '役割未設定'}</div>
      <p>{character.description || '説明はまだありません。'}</p>
      <div class="image-path">IMAGE: {character.image || '未登録'}</div>
      <section class="critical-features">
        <strong>VISUAL MEMORY · CRITICAL FEATURES</strong>
        {#if character.criticalFeatures?.length}
          <div>{#each character.criticalFeatures as feature}<span>{feature}</span>{/each}</div>
        {:else}
          <small>未登録</small>
        {/if}
      </section>
      <section class="character-sheet">
        <div class="sheet-heading">
          <span>CHARACTER YAML</span>
          <button
            class="generate-button"
            onclick={onGenerateSheet}
            disabled={busy || !character.hasReference}
          >
            {busy ? 'VISION解析中...' : 'YAML生成'}
          </button>
        </div>
        {#if character.characterYaml}
          <pre>{character.characterYaml}</pre>
        {:else}
          <div class="yaml-empty">
            {character.hasReference
              ? 'Character RefをVision解析してYAMLを生成してください。'
              : 'Character Ref画像が必要です。'}
          </div>
        {/if}
      </section>
      <div class="card-actions">
        <button class="chat-button" onclick={onChat}>💬 CHAT</button>
        <button onclick={onMemory}>🧠 記憶</button>
        <button onclick={onLibrary}>📚 ライブラリ</button>
        <button class="edit-button" onclick={onEdit} disabled={busy}>⚙️ 編集</button>
      </div>
      {#if onPuruPuru}
        <button class="purupuru-button" onclick={onPuruPuru}>
          🎭 PuruPuru設定{character.avatarType === 'purupuru' ? ' ✓' : ''}
        </button>
      {/if}
      <button class="live2d-button" onclick={onLive2D}>Live2D Maker</button>
      <button
        class="voice-design-button"
        onclick={onVoiceDesign}
        disabled={busy || !character.hasReference}
        data-testid={`character-voice-design-${character.id}`}
      >
        🎙 画像から声を作る
      </button>
      <div class:configured={Boolean(character.voice)} class="voice-state">
        <span>LOCAL VOICE</span>
        {character.voice ? '基本声 設定済み' : '未設定・画像から提案できます'}
      </div>
      <details class="resident-library">
        <summary>📚 住人ライブラリ</summary>
        {#each ['🖼️ キャラ資料', '🎬 動画', '📖 漫画', '🎭 モーション', '📄 character.yaml'] as category}
          <div class="library-row"><span>{category}</span><button onclick={() => onAnalyze(category)} disabled={busy}>🤖 AI分析</button></div>
        {/each}
        {#if analysisCandidate}<p class="analysis-candidate">更新候補（自動適用なし）: {analysisCandidate}</p>{/if}
      </details>
    {/if}
  </div>
</article>

<style>
  .character-card {
    overflow: hidden;
    border: 1px solid rgba(34, 211, 238, 0.2);
    border-radius: 12px;
    background: rgba(8, 15, 32, 0.88);
  }

  .thumbnail {
    position: relative;
    aspect-ratio: 4 / 3;
    background: #020617;
  }

  .thumbnail img {
    width: 100%;
    height: 100%;
    display: block;
    object-fit: cover;
  }

  .image-placeholder {
    height: 100%;
    display: grid;
    place-items: center;
    color: #475569;
    font-size: 11px;
    letter-spacing: 0.18em;
  }

  .image-button {
    position: absolute;
    right: 8px;
    bottom: 8px;
    padding: 7px 10px;
    border: 1px solid rgba(34, 211, 238, 0.4);
    border-radius: 6px;
    background: rgba(2, 6, 23, 0.88);
    color: #a5f3fc;
    font-size: 10px;
    font-weight: 800;
    cursor: pointer;
  }

  .image-button input { display: none; }
  .card-body { padding: 14px; }
  .id-label { color: #22d3ee; font-size: 9px; letter-spacing: 0.15em; }
  h2 { margin: 5px 0 3px; color: #f8fafc; font-size: 20px; }
  .role { color: #fbbf24; font-size: 11px; font-weight: 700; }
  p { min-height: 48px; margin: 10px 0; color: #94a3b8; font-size: 12px; line-height: 1.55; }
  .image-path { overflow-wrap: anywhere; color: #64748b; font: 9px/1.4 Consolas, monospace; }
  .critical-features { display: grid; gap: 7px; margin-top: 10px; padding: 9px; border: 1px solid rgba(251,191,36,.3); border-radius: 7px; background: rgba(120,53,15,.1); }
  .critical-features strong { color: #fde68a; font: 800 9px/1.3 Consolas, monospace; letter-spacing: .08em; }
  .critical-features div { display: flex; flex-wrap: wrap; gap: 5px; }
  .critical-features span { padding: 3px 7px; border-radius: 999px; color: #fef3c7; background: rgba(251,191,36,.1); font-size: 9px; font-weight: 800; }
  .critical-features small { color: #64748b; font-size: 10px; }
  .character-sheet {
    margin-top: 12px;
    padding-top: 10px;
    border-top: 1px solid rgba(34, 211, 238, 0.16);
  }
  .sheet-heading {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 8px;
    color: #67e8f9;
    font: 800 9px/1.2 Consolas, monospace;
    letter-spacing: 0.12em;
  }
  .generate-button { padding: 6px 8px; }
  pre {
    max-height: 260px;
    margin: 9px 0 0;
    padding: 10px;
    overflow: auto;
    border: 1px solid rgba(148, 163, 184, 0.16);
    border-radius: 6px;
    background: #020617;
    color: #cbd5e1;
    white-space: pre-wrap;
    overflow-wrap: anywhere;
    font: 10px/1.55 Consolas, monospace;
  }
  .yaml-empty {
    margin-top: 9px;
    padding: 12px;
    border: 1px dashed rgba(148, 163, 184, 0.2);
    border-radius: 6px;
    color: #64748b;
    font-size: 10px;
    line-height: 1.5;
  }

  label { display: grid; gap: 4px; margin-top: 9px; }
  label span { color: #94a3b8; font-size: 9px; font-weight: 800; }
  input, textarea {
    width: 100%;
    padding: 8px;
    border: 1px solid rgba(148, 163, 184, 0.22);
    border-radius: 6px;
    outline: none;
    background: #020617;
    color: #e2e8f0;
    font: inherit;
    box-sizing: border-box;
  }
  input:focus, textarea:focus { border-color: rgba(34, 211, 238, 0.6); }
  textarea { resize: vertical; }

  button {
    padding: 8px 12px;
    border: 1px solid rgba(34, 211, 238, 0.35);
    border-radius: 6px;
    background: rgba(34, 211, 238, 0.08);
    color: #a5f3fc;
    font: inherit;
    font-size: 10px;
    font-weight: 800;
    cursor: pointer;
  }
  button:disabled { cursor: not-allowed; opacity: 0.45; }
  .card-actions { display: grid; grid-template-columns: repeat(4, 1fr); gap: 7px; margin-top: 12px; }
  .chat-button { border-color: rgba(251, 191, 36, 0.38); color: #fde68a; }
  .edit-button { width: 100%; }
  .purupuru-button {
    width: 100%;
    margin-top: 7px;
    border-color: rgba(168, 85, 247, 0.5);
    background: rgba(168, 85, 247, 0.1);
    color: #ddd6fe;
  }
  .live2d-button {
    width: 100%;
    margin-top: 7px;
    border-color: rgba(244, 114, 182, 0.5);
    background: rgba(244, 114, 182, 0.1);
    color: #fbcfe8;
  }
  .voice-design-button {
    width: 100%;
    margin-top: 7px;
    border-color: rgba(34, 211, 238, 0.55);
    background: linear-gradient(90deg, rgba(8, 145, 178, 0.18), rgba(124, 58, 237, 0.16));
    color: #cffafe;
  }
  .voice-state {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 8px;
    margin-top: 7px;
    padding: 7px 8px;
    border: 1px solid rgba(100, 116, 139, 0.24);
    border-radius: 6px;
    color: #64748b;
    font-size: 9px;
  }
  .voice-state span { color: #67e8f9; font: 800 8px/1 Consolas, monospace; letter-spacing: .1em; }
  .voice-state.configured { border-color: rgba(16, 185, 129, .3); color: #a7f3d0; background: rgba(6, 78, 59, .12); }
  .resident-library { margin-top: 10px; border-top: 1px solid rgba(148,163,184,.16); padding-top: 8px; }
  .resident-library summary { cursor: pointer; color: #c4b5fd; font-size: 11px; font-weight: 800; }
  .library-row { display: flex; align-items: center; justify-content: space-between; gap: 8px; padding: 7px 0; color: #cbd5e1; font-size: 11px; }
  .library-row button { padding: 5px 7px; font-size: 9px; }
  .analysis-candidate { min-height: 0; margin: 6px 0 0; padding: 7px; border-radius: 5px; background: rgba(34,211,238,.08); color: #a5f3fc; font-size: 10px; }
  .actions { display: flex; justify-content: flex-end; gap: 7px; margin-top: 12px; }
  .secondary { border-color: rgba(148, 163, 184, 0.25); color: #94a3b8; }
</style>
