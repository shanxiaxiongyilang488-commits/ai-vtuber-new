<script lang="ts">
  import { COLAB_TTS_VOICE_OPTIONS } from '$lib/types/character';
  import type { Character, AIEngine, VoiceEngine } from '$lib/types/character';

  interface Props {
    open: boolean;
    character: Character | null;
    onclose: () => void;
    onsave: (char: Character) => void;
  }

  let { open, character, onclose, onsave }: Props = $props();

 



  // ===== ローカル state =====
  let name = $state('');
  let aiEngine = $state<AIEngine>('openai');
  let voiceEngine = $state<VoiceEngine>('none');
  let voice = $state('irodori-tts-500m-v3');
  let voiceId = $state('');
  let speakerId = $state(1);
  let systemPrompt = $state('');
  let avatarPreview = $state<string | null>(null);
  let ollamaModel = $state('');

  // キャラごとのアクセントカラー
  const accentColor = $derived(character?.color ?? '#22d3ee');

  // ===== モーダルが開いたとき character からローカル state へ同期 =====
  $effect(() => {
    if (open && character) {
      name = character.name;
      aiEngine = character.aiEngine;
      voiceEngine = character.voiceEngine;
      voice = character.voice ?? character.voiceId ?? 'irodori-tts-500m-v3';
      voiceId = character.voiceId != null? String(character.voiceId): '4';
      speakerId = character.speakerId ?? 1;
      systemPrompt = character.systemPrompt;
      avatarPreview = character.avatar ?? null;
      ollamaModel = character.ollamaModel ?? '';
    }
  });

  // ===== アバター画像変更 =====
  function handleAvatarFile(e: Event) {
    const file = (e.target as HTMLInputElement).files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => { avatarPreview = reader.result as string; };
    reader.readAsDataURL(file);
  }

  // ===== 保存 =====
  function handleSave() {
    if (!character) return;
    onsave({
      ...character,
      name,
      aiEngine,
      voiceEngine,
      voice,
      voiceId,
      speakerId,
      systemPrompt,
      ollamaModel,
      avatar: avatarPreview ?? character.avatar
    });
    onclose();
  }

  // ===== テスト音声 =====
  async function testVoice() {
    const text = 'テスト音声です';
    try {
      if (voiceEngine === 'elevenlabs') {
        if (!voiceId) { alert('voiceIdが空です'); return; }
        const res = await fetch('/api/speak', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ text, voiceId })
        });
        if (!res.ok) { alert('ElevenLabs APIエラー: ' + res.status); return; }
        await new Audio(URL.createObjectURL(await res.blob())).play();
      } else if (voiceEngine === 'colab-tts') {
        const res = await fetch('/api/speak', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ text, provider: 'colab-tts', voice })
        });
        if (!res.ok) { alert('Colab TTS APIエラー: ' + res.status); return; }
        await new Audio(URL.createObjectURL(await res.blob())).play();
      } else if (voiceEngine === 'voicevox') {
        const spId = speakerId || 1;
        const queryRes = await fetch(
          `http://localhost:50021/audio_query?text=${encodeURIComponent(text)}&speaker=${spId}`,
          { method: 'POST' }
        );
        if (!queryRes.ok) { alert('VOICEVOXに接続できません'); return; }
        const query = await queryRes.json();
        const synthRes = await fetch(`http://localhost:50021/synthesis?speaker=${spId}`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(query)
        });
        await new Audio(URL.createObjectURL(await synthRes.blob())).play();
      }
    } catch (e) {
      console.error('テスト音声失敗:', e);
      alert('音声再生に失敗しました');
    }
  }
</script>

{#if open}
<div
  class="overlay"
  onclick={(e) => { if (e.target === e.currentTarget) onclose(); }}
  style="--accent: {accentColor}; --glow: {accentColor}44"
>
  <div class="modal">

    <!-- ヘッダー -->
    <div class="modal-header">
      <div>
        <div class="header-tag">// CHARACTER CONFIG</div>
        <h2 class="modal-title" style="color: var(--accent)">{name || '---'} 設定</h2>
      </div>
      <button class="close-btn" onclick={onclose}>×</button>
    </div>
    <div class="header-line"></div>

    <!-- ボディ -->
    <div class="modal-body">

      <!-- 01 基本情報 -->
      <section class="section">
        <div class="section-title">01 基本情報</div>
        <div class="avatar-row">
          <img
            src={avatarPreview || '/avatars/default.png'}
            class="avatar-img"
            alt="avatar"
          />
          <input class="cyber-input" bind:value={name} placeholder="キャラクター名" />
        </div>
        <label class="file-label">
          アバター画像を変更
          <input type="file" accept="image/*" onchange={handleAvatarFile} class="file-input" />
        </label>
      </section>

      <!-- 02 AI設定 -->
      <section class="section">
        <div class="section-title">02 AI設定</div>
        <select class="cyber-select" bind:value={aiEngine}>
          <option value="openai">OpenAI</option>
          <option value="gemini">Gemini</option>
          <option value="ollama">Ollama</option>
          <option value="lmstudio">LM Studio</option>
          <option value="dummy">ダミー</option>
        </select>
        {#if aiEngine === 'ollama' || aiEngine === 'lmstudio'}
          <input class="cyber-input" bind:value={ollamaModel} placeholder="モデル名 (例: llama3)" />
        {/if}
      </section>

      <!-- 03 性格プロンプト -->
      <section class="section">
        <div class="section-title">03 性格プロンプト</div>
        <textarea class="cyber-textarea" bind:value={systemPrompt} placeholder="このキャラクターの性格や話し方を記述..."></textarea>
      </section>

      <!-- 04 音声設定 -->
      <section class="section">
        <div class="section-title">04 ボイス設定</div>
        <select class="cyber-select" bind:value={voiceEngine}>
          <option value="none">なし</option>
          <option value="voicevox">VOICEVOX</option>
          <option value="colab-tts">Colab TTS</option>
          <option value="elevenlabs">ElevenLabs</option>
          <option value="piper">Piper</option>
        </select>

        {#if voiceEngine === 'elevenlabs'}
          <input class="cyber-input" bind:value={voiceId} placeholder="Voice ID" />
        {:else if voiceEngine === 'colab-tts'}
          <select class="cyber-select" bind:value={voice}>
            {#each COLAB_TTS_VOICE_OPTIONS as option}
              <option value={option}>{option}</option>
            {/each}
          </select>
        {:else if voiceEngine === 'voicevox'}
          <input class="cyber-input" type="number" bind:value={speakerId} placeholder="Speaker ID (例: 1)" />
        {/if}

        {#if voiceEngine !== 'none'}
          <button class="btn-test" onclick={testVoice}>▶ テスト音声</button>
        {/if}
      </section>

    </div>

    <!-- フッター -->
    <div class="modal-footer">
      <button class="btn-cancel" onclick={onclose}>キャンセル</button>
      <button class="btn-save" onclick={handleSave}>保存</button>
    </div>

  </div>
</div>
{/if}

<style>
  .overlay {
    position: fixed;
    inset: 0;
    background: rgba(0, 0, 0, 0.75);
    backdrop-filter: blur(8px);
    display: flex;
    align-items: center;
    justify-content: center;
    z-index: 1000;
    animation: overlay-in 0.2s ease forwards;
  }

  @keyframes overlay-in {
    from { opacity: 0; }
    to   { opacity: 1; }
  }

  .modal {
    width: min(440px, calc(100vw - 32px));
    max-height: calc(100vh - 48px);
    overflow-y: auto;
    background: linear-gradient(145deg, rgba(8, 12, 26, 0.98), rgba(16, 8, 34, 0.98));
    border: 1px solid var(--accent);
    border-radius: 16px;
    box-shadow: 0 0 40px var(--glow), 0 24px 64px rgba(0, 0, 0, 0.8);
    animation: modal-in 0.25s cubic-bezier(0.34, 1.56, 0.64, 1) forwards;
    color: #e2e8f0;
  }

  @keyframes modal-in {
    from { opacity: 0; transform: scale(0.9) translateY(12px); }
    to   { opacity: 1; transform: scale(1) translateY(0); }
  }

  /* ヘッダー */
  .modal-header {
    display: flex;
    align-items: flex-start;
    justify-content: space-between;
    padding: 20px 22px 14px;
  }

  .header-tag {
    font-size: 10px;
    font-weight: 700;
    letter-spacing: 0.2em;
    color: var(--accent);
    opacity: 0.7;
    font-family: 'Courier New', monospace;
    margin-bottom: 4px;
  }

  .modal-title {
    font-size: 18px;
    font-weight: 700;
    margin: 0;
  }

  .close-btn {
    background: none;
    border: none;
    width: 32px;
    height: 32px;
    border-radius: 6px;
    color: rgba(255, 255, 255, 0.4);
    font-size: 16px;
    cursor: pointer;
    display: flex;
    align-items: center;
    justify-content: center;
    transition: background 0.2s, color 0.2s;
    flex-shrink: 0;
    padding: 0;
  }

  .close-btn:hover {
    background: rgba(248, 113, 113, 0.2);
    color: #f87171;
  }

  .header-line {
    height: 1px;
    background: linear-gradient(90deg, var(--accent), rgba(168, 85, 247, 0.3), transparent);
    margin: 0 22px;
    opacity: 0.5;
  }

  /* ボディ */
  .modal-body {
    padding: 20px 22px;
    display: flex;
    flex-direction: column;
    gap: 20px;
  }

  .section {
    display: flex;
    flex-direction: column;
    gap: 8px;
  }

  .section-title {
    font-size: 11px;
    font-weight: 700;
    letter-spacing: 0.15em;
    color: var(--accent);
    text-transform: uppercase;
    margin-bottom: 2px;
  }

  /* アバター */
  .avatar-row {
    display: flex;
    align-items: center;
    gap: 12px;
  }

  .avatar-img {
    width: 56px;
    height: 56px;
    border-radius: 50%;
    object-fit: cover;
    border: 2px solid var(--accent);
    flex-shrink: 0;
  }

  .file-label {
    font-size: 11px;
    color: rgba(255, 255, 255, 0.4);
    cursor: pointer;
    display: inline-flex;
    align-items: center;
    gap: 6px;
    padding: 5px 10px;
    border: 1px dashed rgba(255, 255, 255, 0.2);
    border-radius: 6px;
    transition: border-color 0.2s, color 0.2s;
  }

  .file-label:hover {
    border-color: var(--accent);
    color: var(--accent);
  }

  .file-input {
    display: none;
  }

  /* インプット類 */
  .cyber-input {
    width: 100%;
    padding: 9px 12px;
    border-radius: 8px;
    border: 1px solid rgba(255, 255, 255, 0.12);
    background: rgba(255, 255, 255, 0.04);
    color: #e2e8f0;
    font-size: 13px;
    outline: none;
    box-sizing: border-box;
    transition: border-color 0.2s, box-shadow 0.2s;
  }

  .cyber-input::placeholder {
    color: rgba(255, 255, 255, 0.2);
  }

  .cyber-input:focus {
    border-color: var(--accent);
    box-shadow: 0 0 0 2px var(--glow);
  }

  .cyber-select {
    width: 100%;
    padding: 9px 12px;
    border-radius: 8px;
    border: 1px solid rgba(255, 255, 255, 0.12);
    background: rgba(255, 255, 255, 0.04);
    color: #e2e8f0;
    font-size: 13px;
    outline: none;
    cursor: pointer;
    box-sizing: border-box;
    transition: border-color 0.2s, box-shadow 0.2s;
    appearance: none;
  }

  .cyber-select option {
    background: #0d1117;
    color: #e2e8f0;
  }

  .cyber-select:focus {
    border-color: var(--accent);
    box-shadow: 0 0 0 2px var(--glow);
  }

  .cyber-textarea {
    width: 100%;
    padding: 10px 12px;
    border-radius: 8px;
    border: 1px solid rgba(255, 255, 255, 0.12);
    background: rgba(255, 255, 255, 0.04);
    color: #e2e8f0;
    font-size: 13px;
    line-height: 1.6;
    height: 100px;
    resize: vertical;
    outline: none;
    box-sizing: border-box;
    transition: border-color 0.2s, box-shadow 0.2s;
  }

  .cyber-textarea::placeholder {
    color: rgba(255, 255, 255, 0.2);
  }

  .cyber-textarea:focus {
    border-color: var(--accent);
    box-shadow: 0 0 0 2px var(--glow);
  }

  /* テストボタン */
  .btn-test {
    padding: 8px 14px;
    border-radius: 8px;
    border: 1px solid var(--accent);
    background: rgba(255, 255, 255, 0.04);
    color: var(--accent);
    font-size: 12px;
    cursor: pointer;
    transition: background 0.2s, box-shadow 0.2s;
    align-self: flex-start;
  }

  .btn-test:hover {
    background: var(--glow);
    box-shadow: 0 0 12px var(--glow);
  }

  /* フッター */
  .modal-footer {
    display: flex;
    gap: 10px;
    padding: 16px 22px 20px;
    border-top: 1px solid rgba(255, 255, 255, 0.06);
    justify-content: flex-end;
  }

  .btn-cancel {
    padding: 10px 20px;
    border: 1px solid rgba(255, 255, 255, 0.12);
    border-radius: 9px;
    background: rgba(255, 255, 255, 0.04);
    color: rgba(255, 255, 255, 0.5);
    font-size: 13px;
    cursor: pointer;
    transition: background 0.2s, color 0.2s;
  }

  .btn-cancel:hover {
    background: rgba(255, 255, 255, 0.08);
    color: rgba(255, 255, 255, 0.8);
  }

  .btn-save {
    padding: 10px 28px;
    border: none;
    border-radius: 9px;
    background: linear-gradient(135deg, var(--accent), color-mix(in srgb, var(--accent) 60%, #a855f7));
    color: #fff;
    font-size: 13px;
    font-weight: 700;
    cursor: pointer;
    box-shadow: 0 0 16px var(--glow);
    transition: box-shadow 0.2s, transform 0.15s;
  }

  .btn-save:hover {
    box-shadow: 0 0 28px var(--accent);
    transform: translateY(-1px);
  }

  .btn-save:active {
    transform: translateY(0);
  }
</style>
