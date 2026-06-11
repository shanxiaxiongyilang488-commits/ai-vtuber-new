<script lang="ts">
  import { untrack } from 'svelte';

  export type CharacterLibraryItem = {
    id: string;
    name: string;
    role: string;
    description: string;
    image: string;
    imageDataUrl?: string;
  };

  let {
    character,
    editing = false,
    busy = false,
    onEdit,
    onCancel,
    onSave,
    onImageChange,
    onChat,
  }: {
    character: CharacterLibraryItem;
    editing?: boolean;
    busy?: boolean;
    onEdit: () => void;
    onCancel: () => void;
    onSave: (input: Pick<CharacterLibraryItem, 'name' | 'role' | 'description'>) => void | Promise<void>;
    onImageChange: (file: File) => void | Promise<void>;
    onChat: () => void;
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
      <div class="card-actions">
        <button class="chat-button" onclick={onChat}>Character Chat</button>
        <button class="edit-button" onclick={onEdit}>編集</button>
      </div>
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
  .card-actions { display: grid; grid-template-columns: 1fr 1fr; gap: 7px; margin-top: 12px; }
  .chat-button { border-color: rgba(251, 191, 36, 0.38); color: #fde68a; }
  .edit-button { width: 100%; }
  .actions { display: flex; justify-content: flex-end; gap: 7px; margin-top: 12px; }
  .secondary { border-color: rgba(148, 163, 184, 0.25); color: #94a3b8; }
</style>
