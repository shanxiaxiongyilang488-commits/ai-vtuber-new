<script lang="ts">
  import { onMount } from 'svelte';
  import CharacterLibraryCard, {
    type CharacterLibraryItem,
  } from '$lib/components/characters/CharacterLibraryCard.svelte';
  import { sessionStore } from '$lib/stores/sessionStore';

  let characters = $state<CharacterLibraryItem[]>([]);
  let loading = $state(true);
  let errorMessage = $state('');
  let editingId = $state('');
  let busyId = $state('');
  let createOpen = $state(false);
  let newId = $state('');
  let newName = $state('');
  let newRole = $state('');
  let newDescription = $state('');
  let newImage = $state<File | null>(null);

  onMount(() => {
    void loadCharacters();
  });

  async function loadCharacters(): Promise<void> {
    loading = true;
    errorMessage = '';
    try {
      const response = await fetch('/api/characters');
      const data = await response.json();
      if (!response.ok) throw new Error(data?.message ?? 'Character Libraryの読み込みに失敗しました。');
      const entries = Array.isArray(data?.characters) ? data.characters : [];
      characters = await Promise.all(entries.map(async (entry: CharacterLibraryItem & { hasReference?: boolean }) => {
        let imageDataUrl = '';
        if (entry.hasReference) {
          const imageResponse = await fetch(`/api/characters/${encodeURIComponent(entry.id)}/reference`);
          if (imageResponse.ok) {
            const imageData = await imageResponse.json();
            imageDataUrl = typeof imageData?.referenceImageDataUrl === 'string'
              ? imageData.referenceImageDataUrl
              : '';
          }
        }
        return { ...entry, image: entry.image ?? '', imageDataUrl };
      }));
    } catch (error) {
      errorMessage = error instanceof Error ? error.message : String(error);
    } finally {
      loading = false;
    }
  }

  async function createCharacter(): Promise<void> {
    if (!newId.trim() || !newName.trim()) return;
    busyId = '__new__';
    errorMessage = '';
    try {
      const form = new FormData();
      form.set('id', newId.trim());
      form.set('name', newName.trim());
      form.set('role', newRole.trim());
      form.set('description', newDescription.trim());
      if (newImage) form.set('reference', newImage);
      const response = await fetch('/api/characters', { method: 'POST', body: form });
      const data = await response.json();
      if (!response.ok) throw new Error(data?.message ?? 'キャラクター登録に失敗しました。');
      newId = '';
      newName = '';
      newRole = '';
      newDescription = '';
      newImage = null;
      createOpen = false;
      await loadCharacters();
    } catch (error) {
      errorMessage = error instanceof Error ? error.message : String(error);
    } finally {
      busyId = '';
    }
  }

  async function updateCharacter(
    id: string,
    input: Pick<CharacterLibraryItem, 'name' | 'role' | 'description'>,
  ): Promise<void> {
    busyId = id;
    errorMessage = '';
    try {
      const response = await fetch(`/api/characters/${encodeURIComponent(id)}`, {
        method: 'PUT',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(input),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data?.message ?? 'キャラクター更新に失敗しました。');
      editingId = '';
      await loadCharacters();
    } catch (error) {
      errorMessage = error instanceof Error ? error.message : String(error);
    } finally {
      busyId = '';
    }
  }

  async function changeImage(id: string, file: File): Promise<void> {
    busyId = id;
    errorMessage = '';
    try {
      const form = new FormData();
      form.set('reference', file);
      const response = await fetch(`/api/characters/${encodeURIComponent(id)}/reference`, {
        method: 'PUT',
        body: form,
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data?.message ?? '画像変更に失敗しました。');
      await loadCharacters();
    } catch (error) {
      errorMessage = error instanceof Error ? error.message : String(error);
    } finally {
      busyId = '';
    }
  }

  function parseVisionCharacterYaml(text: string, characterId: string) {
    const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/i)?.[1];
    const jsonText = fenced ?? text.match(/\{[\s\S]*\}/)?.[0] ?? text;
    const parsed = JSON.parse(jsonText);
    if (!Array.isArray(parsed?.characters) || parsed.characters.length === 0) {
      throw new Error('Vision解析結果にcharactersがありません。');
    }
    return {
      unitId: String(parsed.unitId || characterId.toUpperCase()),
      characters: parsed.characters.map((entry: Record<string, unknown>, index: number) => ({
        id: String(entry.id || (index === 0 ? characterId.toUpperCase() : `${characterId.toUpperCase()}-${index + 1}`)),
        hairColor: String(entry.hair_color ?? entry.hairColor ?? 'unknown'),
        eyeColor: String(entry.eye_color ?? entry.eyeColor ?? 'unknown'),
        ears: String(entry.ears ?? 'unknown'),
        tail: String(entry.tail ?? 'unknown'),
        androidParts: String(entry.android_parts ?? entry.androidParts ?? 'unknown'),
        outfit: String(entry.outfit ?? 'unknown'),
        accessories: String(entry.accessories ?? 'unknown'),
        appearance: String(entry.appearance ?? 'unknown'),
      })),
    };
  }

  async function generateCharacterYaml(character: CharacterLibraryItem): Promise<void> {
    if (!character.imageDataUrl) {
      errorMessage = 'Character Ref画像が必要です。';
      return;
    }
    busyId = character.id;
    errorMessage = '';
    try {
      const provider = $sessionStore.provider === 'openai'
        || $sessionStore.provider === 'gemini'
        || $sessionStore.provider === 'claude'
        ? $sessionStore.provider
        : 'gemini';
      const response = await fetch('/api/lab-chat', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          route: 'image_analysis',
          provider,
          model: provider === $sessionStore.provider ? ($sessionStore.model || undefined) : undefined,
          visionMode: 'strict',
          memory: { enabled: false },
          systemPrompt: [
            'Analyze only directly visible facts in the attached Character Ref image.',
            'The image is the sole source for appearance. Do not infer from the character name.',
            'Do not invent personality, favorite foods, hobbies, preferences, biography, or relationships.',
            'Return JSON only using this schema:',
            '{"unitId":"...","characters":[{"id":"...","hair_color":"...","eye_color":"...","ears":"...","tail":"...","android_parts":"...","outfit":"...","accessories":"...","appearance":"..."}]}',
            'Use "unknown" when a detail cannot be seen and "none visible" when visibly absent.',
          ].join('\n'),
          userMessage: `Analyze this Character Ref. The label ${character.id} identifies the record only and is not appearance evidence.`,
          images: [character.imageDataUrl],
        }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data?.message ?? `Vision HTTP ${response.status}`);
      const characterBible = parseVisionCharacterYaml(String(data?.text ?? ''), character.id);
      const saveResponse = await fetch(`/api/characters/${encodeURIComponent(character.id)}`, {
        method: 'PUT',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ characterBible }),
      });
      const saved = await saveResponse.json();
      if (!saveResponse.ok) throw new Error(saved?.message ?? 'Character YAMLの保存に失敗しました。');
      await loadCharacters();
    } catch (error) {
      errorMessage = error instanceof Error ? error.message : String(error);
    } finally {
      busyId = '';
    }
  }
</script>

<svelte:head>
  <title>CHARACTER LIBRARY | AI VTuber</title>
</svelte:head>

<div class="library-page">
  <header>
    <div>
      <p>CHARACTER SHEET / PHASE 1</p>
      <h1>CHARACTER LIBRARY</h1>
      <span>Character Registry互換のプロフィールと画像を管理します。</span>
    </div>
    <nav>
      <a href="/lab">CHAT</a>
      <a href="/story">STORY</a>
      <a href="/project">PROJECT</a>
      <button onclick={() => (createOpen = !createOpen)}>+ NEW CHARACTER</button>
    </nav>
  </header>

  {#if createOpen}
    <section class="create-panel">
      <div class="field-grid">
        <label><span>ID</span><input bind:value={newId} placeholder="character-id" /></label>
        <label><span>名前</span><input bind:value={newName} /></label>
        <label><span>役割</span><input bind:value={newRole} /></label>
        <label class="wide"><span>説明</span><textarea bind:value={newDescription} rows="3"></textarea></label>
        <label class="wide file-field">
          <span>画像</span>
          <input type="file" accept="image/*" onchange={(event) => (newImage = event.currentTarget.files?.[0] ?? null)} />
        </label>
      </div>
      <div class="create-actions">
        <button class="secondary" onclick={() => (createOpen = false)}>キャンセル</button>
        <button onclick={createCharacter} disabled={busyId === '__new__' || !newId.trim() || !newName.trim()}>
          {busyId === '__new__' ? '登録中...' : '登録'}
        </button>
      </div>
    </section>
  {/if}

  {#if errorMessage}<div class="error-message">{errorMessage}</div>{/if}

  {#if loading}
    <div class="empty-state">Character Libraryを読み込み中...</div>
  {:else if characters.length === 0}
    <div class="empty-state">キャラクターはまだ登録されていません。</div>
  {:else}
    <main class="card-grid">
      {#each characters as character (character.id)}
        <CharacterLibraryCard
          {character}
          editing={editingId === character.id}
          busy={busyId === character.id}
          onEdit={() => (editingId = character.id)}
          onCancel={() => (editingId = '')}
          onSave={(input) => updateCharacter(character.id, input)}
          onImageChange={(file) => changeImage(character.id, file)}
          onGenerateSheet={() => generateCharacterYaml(character)}
          onChat={() => (window.location.href = `/characters/${encodeURIComponent(character.id)}/chat`)}
        />
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
  nav { display: flex; flex-wrap: wrap; gap: 7px; justify-content: flex-end; }
  nav a, button {
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
  button:disabled { cursor: not-allowed; opacity: 0.45; }
  .create-panel {
    max-width: 1280px;
    margin: 0 auto 18px;
    padding: 16px;
    border: 1px solid rgba(34, 211, 238, 0.22);
    border-radius: 12px;
    background: rgba(8, 15, 32, 0.88);
  }
  .field-grid { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 10px; }
  label { display: grid; gap: 4px; }
  label span { color: #94a3b8; font-size: 9px; font-weight: 800; }
  label.wide { grid-column: 1 / -1; }
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
  textarea { resize: vertical; }
  .create-actions { display: flex; justify-content: flex-end; gap: 7px; margin-top: 12px; }
  .secondary { border-color: rgba(148, 163, 184, 0.25); color: #94a3b8; }
  .card-grid {
    max-width: 1280px;
    margin: 0 auto;
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(260px, 1fr));
    gap: 14px;
  }
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
    .field-grid { grid-template-columns: 1fr; }
    label.wide { grid-column: auto; }
  }
</style>
