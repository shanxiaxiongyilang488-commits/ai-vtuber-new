<script lang="ts">
  import { onMount } from 'svelte';

  type RefLibraryCard = {
    id: string;
    name: string;
    createdAt: string;
    imageDataUrl: string;
  };

  let refs = $state<RefLibraryCard[]>([]);
  let loading = $state(true);
  let errorMessage = $state('');
  let busyId = $state('');
  let uploading = $state(false);
  let editingId = $state('');
  let editName = $state('');

  onMount(() => {
    void loadRefs();
  });

  async function loadRefs(): Promise<void> {
    loading = true;
    errorMessage = '';
    try {
      const response = await fetch('/api/ref-library');
      const data = await response.json();
      if (!response.ok) throw new Error(data?.message ?? 'REF LIBRARYの読み込みに失敗しました。');
      const items = Array.isArray(data?.items) ? data.items : [];
      refs = await Promise.all(items.map(async (item: { id: string; name: string; createdAt: string }) => {
        let imageDataUrl = '';
        const imageResponse = await fetch(`/api/ref-library/${encodeURIComponent(item.id)}/image`);
        if (imageResponse.ok) {
          const imageData = await imageResponse.json();
          imageDataUrl = typeof imageData?.imageDataUrl === 'string' ? imageData.imageDataUrl : '';
        }
        return { id: item.id, name: item.name, createdAt: item.createdAt, imageDataUrl };
      }));
    } catch (error) {
      errorMessage = error instanceof Error ? error.message : String(error);
    } finally {
      loading = false;
    }
  }

  async function uploadFiles(event: Event): Promise<void> {
    const input = event.currentTarget as HTMLInputElement;
    const files = Array.from(input.files ?? []);
    input.value = '';
    if (files.length === 0) return;
    uploading = true;
    errorMessage = '';
    try {
      for (const file of files) {
        const form = new FormData();
        form.set('reference', file);
        form.set('name', file.name.replace(/\.[^.]+$/, ''));
        const response = await fetch('/api/ref-library', { method: 'POST', body: form });
        if (!response.ok) {
          const data = await response.json().catch(() => ({}));
          throw new Error(data?.message ?? 'REF画像の保存に失敗しました。');
        }
      }
      await loadRefs();
    } catch (error) {
      errorMessage = error instanceof Error ? error.message : String(error);
    } finally {
      uploading = false;
    }
  }

  function startEdit(ref: RefLibraryCard): void {
    editingId = ref.id;
    editName = ref.name;
  }

  async function saveName(id: string): Promise<void> {
    busyId = id;
    errorMessage = '';
    try {
      const response = await fetch(`/api/ref-library/${encodeURIComponent(id)}`, {
        method: 'PUT',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ name: editName }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data?.message ?? '名前変更に失敗しました。');
      editingId = '';
      await loadRefs();
    } catch (error) {
      errorMessage = error instanceof Error ? error.message : String(error);
    } finally {
      busyId = '';
    }
  }

  async function deleteRef(id: string, name: string): Promise<void> {
    if (!window.confirm(`「${name}」をREF LIBRARYから削除しますか？`)) return;
    busyId = id;
    errorMessage = '';
    try {
      const response = await fetch(`/api/ref-library/${encodeURIComponent(id)}`, { method: 'DELETE' });
      const data = await response.json();
      if (!response.ok) throw new Error(data?.message ?? '削除に失敗しました。');
      if (editingId === id) editingId = '';
      await loadRefs();
    } catch (error) {
      errorMessage = error instanceof Error ? error.message : String(error);
    } finally {
      busyId = '';
    }
  }
</script>

<svelte:head>
  <title>REF LIBRARY | AI VTuber</title>
</svelte:head>

<div class="library-page">
  <header>
    <div>
      <p>REFERENCE / IMAGE LIBRARY</p>
      <h1>REF LIBRARY</h1>
      <span>参照画像を保存し、STORY挿入・マンガ生成の参照に使います。</span>
    </div>
    <nav>
      <a href="/lab">CHAT</a>
      <a href="/story">STORY</a>
      <a href="/characters">CHARACTERS</a>
      <a href="/project">PROJECT</a>
      <label class="upload-btn">
        {uploading ? 'SAVING...' : '+ REF画像を保存'}
        <input type="file" accept="image/*" multiple disabled={uploading} onchange={uploadFiles} />
      </label>
    </nav>
  </header>

  {#if errorMessage}<div class="error-message">{errorMessage}</div>{/if}

  {#if loading}
    <div class="empty-state">REF LIBRARYを読み込み中...</div>
  {:else if refs.length === 0}
    <div class="empty-state">保存されたREF画像はまだありません。</div>
  {:else}
    <main class="card-grid">
      {#each refs as ref (ref.id)}
        <div class="ref-card">
          <div class="thumb">
            {#if ref.imageDataUrl}
              <img src={ref.imageDataUrl} alt={ref.name} />
            {:else}
              <span class="no-image">NO IMAGE</span>
            {/if}
          </div>
          {#if editingId === ref.id}
            <div class="name-edit">
              <input bind:value={editName} onkeydown={(e) => e.key === 'Enter' && saveName(ref.id)} />
              <div class="row-actions">
                <button class="secondary" onclick={() => (editingId = '')}>キャンセル</button>
                <button onclick={() => saveName(ref.id)} disabled={busyId === ref.id}>保存</button>
              </div>
            </div>
          {:else}
            <div class="name-row">
              <span class="name" title={ref.name}>{ref.name}</span>
            </div>
            <div class="row-actions">
              <button class="secondary" onclick={() => startEdit(ref)}>名前変更</button>
              <button class="danger" onclick={() => deleteRef(ref.id, ref.name)} disabled={busyId === ref.id}>削除</button>
            </div>
          {/if}
        </div>
      {/each}
    </main>
  {/if}
</div>

<style>
  :global(body) { margin: 0; background: #030712; color: #e2e8f0; font-family: 'Segoe UI', sans-serif; }
  .library-page {
    min-height: 100vh;
    padding: 28px;
    background:
      radial-gradient(circle at 15% 0%, rgba(34, 211, 238, 0.12), transparent 34%),
      radial-gradient(circle at 90% 15%, rgba(168, 85, 247, 0.12), transparent 30%),
      #030712;
  }
  header {
    max-width: 1280px;
    margin: 0 auto 22px;
    display: flex;
    align-items: end;
    justify-content: space-between;
    gap: 20px;
  }
  header p, header h1, header span { margin: 0; }
  header p { color: #22d3ee; font-size: 10px; letter-spacing: 0.18em; }
  header h1 { margin-top: 4px; color: #f8fafc; font-size: clamp(32px, 6vw, 64px); }
  header span { color: #94a3b8; font-size: 12px; }
  nav { display: flex; flex-wrap: wrap; gap: 7px; justify-content: flex-end; align-items: center; }
  nav a, .upload-btn {
    padding: 9px 12px;
    border: 1px solid rgba(34, 211, 238, 0.3);
    border-radius: 6px;
    background: rgba(34, 211, 238, 0.07);
    color: #a5f3fc;
    font: inherit;
    font-size: 10px;
    font-weight: 800;
    text-decoration: none;
    cursor: pointer;
  }
  .upload-btn input { display: none; }
  .card-grid {
    max-width: 1280px;
    margin: 0 auto;
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(220px, 1fr));
    gap: 14px;
  }
  .ref-card {
    display: flex;
    flex-direction: column;
    gap: 10px;
    padding: 12px;
    border: 1px solid rgba(34, 211, 238, 0.22);
    border-radius: 12px;
    background: rgba(8, 15, 32, 0.88);
  }
  .thumb {
    aspect-ratio: 1 / 1;
    border-radius: 8px;
    overflow: hidden;
    background: #020617;
    display: flex;
    align-items: center;
    justify-content: center;
  }
  .thumb img { width: 100%; height: 100%; object-fit: cover; }
  .no-image { color: #475569; font-size: 11px; font-weight: 800; }
  .name-row { min-height: 18px; }
  .name { color: #f8fafc; font-size: 13px; font-weight: 700; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; display: block; }
  .name-edit { display: grid; gap: 8px; }
  .name-edit input {
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
  .row-actions { display: flex; gap: 7px; justify-content: flex-end; }
  button {
    padding: 7px 10px;
    border: 1px solid rgba(34, 211, 238, 0.3);
    border-radius: 6px;
    background: rgba(34, 211, 238, 0.07);
    color: #a5f3fc;
    font: inherit;
    font-size: 10px;
    font-weight: 800;
    cursor: pointer;
  }
  button:disabled { cursor: not-allowed; opacity: 0.45; }
  .secondary { border-color: rgba(148, 163, 184, 0.25); color: #94a3b8; background: rgba(148, 163, 184, 0.07); }
  .danger { border-color: rgba(251, 113, 133, 0.4); color: #fb7185; background: rgba(251, 113, 133, 0.07); }
  .empty-state, .error-message {
    max-width: 1280px;
    margin: 18px auto;
    padding: 30px;
    border: 1px solid rgba(148, 163, 184, 0.16);
    border-radius: 12px;
    background: rgba(8, 15, 32, 0.75);
    color: #94a3b8;
    text-align: center;
  }
  .error-message { padding: 12px; border-color: rgba(251, 113, 133, 0.28); color: #fb7185; }
  @media (max-width: 760px) {
    .library-page { padding: 18px; }
    header { align-items: start; flex-direction: column; }
  }
</style>
