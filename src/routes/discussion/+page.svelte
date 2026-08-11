<script lang="ts">
  import { onMount, onDestroy } from 'svelte';
  import { createVoiceEngine } from '$lib/api/voiceEngine';
  import PNGTuberStage from '$lib/components/pngtuber/PNGTuberStage.svelte';
  import { muryi } from '$lib/data/pngtuber/characters';
  import { characterStore } from '$lib/stores/characterStore.svelte';
  import type { PNGTuberCharacter } from '$lib/types/pngtuber';

  type CharacterConfig = {
    name: string;
    avatar: string;
    aiEngine?: string;
    modelName?: string;
    voiceEngine: 'elevenlabs' | 'voicevox' | 'irodori-tts' | 'colab-tts' | 'piper' | 'none';
    voice?: string;
    voiceId?: string;
    speakerId?: number;
    systemPrompt?: string;
  };

  type ChatMessage = {
    speaker: string;
    text: string;
    avatar?: string;
  };

  // ===== モード =====
  let mode: 'discussion' | 'radio' = 'discussion';

  // ===== 状態 =====
  let topic = '';
  let messages: ChatMessage[] = [];

  // ===== ラジオ設定 =====
  let radioTheme = '';
  let radioDuration: 3 | 5 | 10 = 5;
  let radioAtmosphere: 'bright' | 'midnight' | 'news' = 'bright';
  let radioTtsProvider: 'none' | 'google' = 'none';

  // キャラ順に対応する Google TTS ボイス名
  const GOOGLE_VOICES: readonly [string, string] = ['ja-JP-Neural2-B', 'ja-JP-Neural2-D'];

  // ===== キャラ設定 =====
  let characters: CharacterConfig[] = [
    {
      name: 'ミュリィ',
      avatar: '/avatars/muryi.png',
      aiEngine: 'openai',
      modelName: '',
      voiceEngine: 'irodori-tts',
      voice: 'none',
      voiceId: '',
      speakerId: 20,
      systemPrompt: ''
    },
    {
      name: 'シエル',
      avatar: '/avatars/ciel.png',
      aiEngine: 'lmstudio',
      modelName: '',
      voiceEngine: 'irodori-tts',
      voice: 'none',
      voiceId: '',
      speakerId: 1,
      systemPrompt: ''
    }
  ];

  // ===== モーダル制御 =====
  let showSettings = false;
  let selectedIndex = -1;
  let selectedCharacter: CharacterConfig | null = null;

  function openSettings(index: number) {
    selectedIndex = index;
    selectedCharacter = { ...characters[index] };
    showSettings = true;
    console.log('🔥 モーダル開く', selectedCharacter);
  }

  function closeSettings() {
    showSettings = false;
    selectedIndex = -1;
    selectedCharacter = null;
  }

  function handleCharacterSave(updated: CharacterConfig) {
    if (selectedIndex === -1) return;

    characters[selectedIndex] = { ...updated };
    characters = [...characters];

    closeSettings();
  }

  // ===== PNGTuber =====
  // imported character 優先、なければ muryi
  const viewerCharacter = $derived<PNGTuberCharacter>(
    characterStore.current
      ? {
          id: 'imported',
          name: characterStore.current.name || 'Muryi',
          assets: {
            base:  characterStore.current.imageDataUrl,
            mouth: {
              close: characterStore.current.imageDataUrl,
              mid:   characterStore.current.imageDataUrl,
              open:  characterStore.current.imageDataUrl,
            },
            eyes: {
              open:   characterStore.current.imageDataUrl,
              closed: characterStore.current.imageDataUrl,
            },
          },
          layout: { mouthX: 0, mouthY: 0, eyeX: 0, eyeY: 0 },
          motion: { swayScale: 1.0, blinkHoldMs: 120, breathingScale: 1.008 },
        }
      : muryi
  );

  let pngSpeaking   = $state<boolean>(false);
  let pngMouthLevel = $state<number>(0);
  let pngBlink      = $state<0 | 1>(0);
  let mouthTicker:  ReturnType<typeof setInterval> | null = null;
  let speakTimer:   ReturnType<typeof setTimeout>  | null = null;
  let blinkTimer:   ReturnType<typeof setInterval> | null = null;

  // 口パク開始（AI返答 / 音声再生前に呼ぶ）
  function startSpeaking(): void {
    if (mouthTicker) clearInterval(mouthTicker);
    if (speakTimer)  clearTimeout(speakTimer);
    pngSpeaking = true;
    let t = 0;
    mouthTicker = setInterval(() => {
      t += 0.12;
      pngMouthLevel = +((Math.sin(t * 9) + 1) / 2).toFixed(2);
    }, 50);
  }

  // 口パク停止（音声再生後に呼ぶ）
  function stopSpeaking(): void {
    if (mouthTicker) { clearInterval(mouthTicker); mouthTicker = null; }
    if (speakTimer)  { clearTimeout(speakTimer);   speakTimer  = null; }
    pngSpeaking   = false;
    pngMouthLevel = 0;
  }

  // テスト用：3秒だけ喋る
  function startSpeakTest(): void {
    startSpeaking();
    speakTimer = setTimeout(stopSpeaking, 3000);
  }

  // まばたきループ（待機中も継続）
  onMount(() => {
    blinkTimer = setInterval(() => {
      pngBlink = 1;
      setTimeout(() => { pngBlink = 0; }, 150);
    }, 3500);
  });

  onDestroy(() => {
    if (mouthTicker) clearInterval(mouthTicker);
    if (speakTimer)  clearTimeout(speakTimer);
    if (blinkTimer)  clearInterval(blinkTimer);
  });

  // ===== 並走キャンセル用 runId =====
  // 新しい会話を開始するたびにインクリメント。
  // 各非同期ループはループ前後で runId が一致するか確認し、
  // 一致しなければ即座に中断する（= 前の会話を自動キャンセル）。
  let runId = 0;

  // ===== ダミー会話 =====
  async function startDummyDiscussion() {
    const myRunId = ++runId;
    console.log(`[dummy] start runId=${myRunId}`);

    const dummyMessages: ChatMessage[] = [
      { speaker: characters[0].name, text: 'こんにちは！今日の話題は何ですか？' },
      { speaker: characters[1].name, text: 'そうですね、最近のAI技術について話しましょうか。' },
      { speaker: characters[0].name, text: 'それは面白いですね！特に画像生成が進化していますよね。' },
      { speaker: characters[1].name, text: '確かに。でも私は音声モデルの方が気になっています。' },
      { speaker: characters[0].name, text: '両方とも革命的だと思います！' },
      { speaker: characters[1].name, text: 'まったく同感です。これからが楽しみですね。' }
    ];

    messages = [];

    for (const msg of dummyMessages) {
      if (myRunId !== runId) { console.log(`[dummy] runId=${myRunId} cancelled`); break; }

      const char = characters.find((c) => c.name === msg.speaker);

      messages = [
        ...messages,
        {
          speaker: msg.speaker,
          text: msg.text,
          avatar: char?.avatar ?? '/avatars/default.png'
        }
      ];

      if (char && char.voiceEngine !== 'none') {
        try {
          const engine = createVoiceEngine({
            name: char.name,
            voiceEngine: char.voiceEngine,
            voice: char.voice,
            voiceId: char.voiceId,
            speakerId: char.speakerId
          });
          startSpeaking();
          await engine.speak(msg.text);
          stopSpeaking();
        } catch (e) {
          stopSpeaking();
          console.error('❌ ダミー会話音声失敗', e);
        }
      }
    }
  }

  // ===== ラジオ =====
  async function startRadio() {
    if (!radioTheme.trim()) return;
    const myRunId = ++runId;
    console.log(`[radio] start runId=${myRunId}, theme="${radioTheme}", tts="${radioTtsProvider}"`);

    try {
      const res = await fetch('/api/radio', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          theme: radioTheme,
          duration: radioDuration,
          atmosphere: radioAtmosphere,
          characters
        })
      });

      if (myRunId !== runId) { console.log(`[radio] runId=${myRunId} cancelled after fetch`); return; }

      if (!res.ok) {
        console.error(`[radio] API error HTTP ${res.status}`, await res.json().catch(() => null));
        return;
      }

      const data = await res.json();
      console.log('[radio] API data:', data);

      const list: ChatMessage[] = data.messages ?? [];
      console.log(`[radio] list.length=${list.length}`, list);

      if (list.length === 0) {
        console.warn('[radio] ⚠ メッセージが空です。API レスポンスを確認してください。');
      }

      messages = list.map((msg) => {
        const char = characters.find((c) => c.name === msg.speaker);
        return { ...msg, avatar: char?.avatar ?? '/avatars/default.png' };
      });
      console.log(`[radio] messages 代入完了 count=${messages.length}`, messages);

      // ===== Google TTS 順番再生 =====
      if (radioTtsProvider === 'google') {
        console.log('[radio] Google TTS ループ開始');
        for (const msg of messages) {
          if (myRunId !== runId) { console.log('[radio TTS] cancelled'); break; }

          const charIdx = characters.findIndex((c) => c.name === msg.speaker);
          const voiceName = GOOGLE_VOICES[charIdx] ?? GOOGLE_VOICES[0];
          console.log(`[radio TTS] speaker="${msg.speaker}" voice=${voiceName} text="${msg.text.slice(0,30)}..."`);
          try {
            const ttsRes = await fetch('/api/speak', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ text: msg.text, provider: 'google', voiceName })
            });
            if (!ttsRes.ok) {
              const errBody = await ttsRes.json().catch(() => null);
              console.warn(`[radio TTS] skip HTTP ${ttsRes.status}`, errBody);
              continue;
            }
            const url = URL.createObjectURL(await ttsRes.blob());
            await new Promise<void>((resolve) => {
              const audio = new Audio(url);
              startSpeaking();
              audio.onended = () => { URL.revokeObjectURL(url); stopSpeaking(); resolve(); };
              audio.onerror = () => { URL.revokeObjectURL(url); stopSpeaking(); resolve(); };
              audio.play().catch(() => { URL.revokeObjectURL(url); stopSpeaking(); resolve(); });
            });
          } catch (e) {
            console.error('[radio TTS] Google TTS error:', e);
          }
        }
        console.log('[radio] Google TTS ループ終了');
      } else {
        console.log(`[radio] TTS provider="${radioTtsProvider}" → 音声再生なし`);
      }
    } catch (e) {
      console.error('❌ radio API エラー', e);
    }
  }

  // ===== API会話 =====
  async function startDiscussion() {
    if (!topic.trim()) return;

    try {
      const res = await fetch('/api/discussion', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          message: topic,
          turns: 6,
          characters
        })
      });

      const data = await res.json();
      const list: ChatMessage[] = data.messages ?? [];

      messages = [];

      for (const msg of list) {
        const char = characters.find((c) => c.name === msg.speaker);

        messages = [
          ...messages,
          {
            speaker: msg.speaker,
            text: msg.text,
            avatar: char?.avatar ?? '/avatars/default.png'
          }
        ];

        if (char && char.voiceEngine !== 'none') {
          try {
            const engine = createVoiceEngine({
              name: char.name,
              voiceEngine: char.voiceEngine,
              voice: char.voice,
              voiceId: char.voiceId,
              speakerId: char.speakerId
            });
            startSpeaking();
            await engine.speak(msg.text);
            stopSpeaking();
          } catch (e) {
            stopSpeaking();
            console.error('❌ API会話音声失敗', e);
          }
        }
      }
    } catch (e) {
      console.error('❌ discussion API エラー', e);
    }
  }
</script>
<div class="page">
  <!-- 左：キャラ -->
  <div class="sidebar">
    {#each characters as char, i}
      <div class="char-card" onclick={() => openSettings(i)}>
        <img src={char.avatar} alt={char.name} />
        <p>{char.name}</p>

        <div class="char-meta">
          <div><span>AI</span><b>{char.aiEngine ?? '-'}</b></div>
          <div><span>VOICE</span><b>{char.voiceEngine ?? '-'}</b></div>
        </div>
      </div>
    {/each}

    <div class="status-box">
      <div class="status-title">● システム状態</div>
      <div class="status-row"><span>ステータス</span><b>待機中</b></div>
      <div class="status-row"><span>発言数</span><b>{messages.length}</b></div>
      <div class="status-row"><span>モード</span><b>{mode === 'radio' ? 'ラジオ' : '対話型'}</b></div>
      <div class="hint">カードをクリックして設定を開く</div>
    </div>
  </div>

  <!-- 右：会話 -->
  <div class="main">
    <div class="mode-tabs">
      <button class={`tab ${mode === 'discussion' ? 'tab-active' : ''}`} onclick={() => (mode = 'discussion')}>討論</button>
      <button class={`tab ${mode === 'radio' ? 'tab-active' : ''}`} onclick={() => (mode = 'radio')}>ラジオ</button>
    </div>

    <p class="count">件数: {messages.length}</p>

    <div class="messages">
      {#if messages.length === 0}
        <div class="empty-state">
          <div class="empty-icon">◈</div>
          <div class="empty-title">トピックを入力して会話を開始してください</div>
          <div class="empty-sub">AWAITING INPUT — NEURAL LINK STANDBY</div>
        </div>
      {/if}

      {#each messages as msg}
        {@const isLeft = characters[0] && msg.speaker === characters[0].name}
        {@const char = characters.find((c) => c.name === msg.speaker)}

        <div class={`message-row ${isLeft ? 'left' : 'right'}`}>
          {#if isLeft}
            <div class="avatar">
              {#if char?.avatar}
                <img src={char.avatar} alt={msg.speaker} />
              {:else}
                🤖
              {/if}
            </div>

            <div class="bubble-wrap">
              <span class="speaker-name">{msg.speaker}</span>
              <div class="bubble">{msg.text}</div>
            </div>
          {:else}
            <div class="bubble-wrap right-wrap">
              <span class="speaker-name">{msg.speaker}</span>
              <div class="bubble">{msg.text}</div>
            </div>

            <div class="avatar">
              {#if char?.avatar}
                <img src={char.avatar} alt={msg.speaker} />
              {:else}
                🤖
              {/if}
            </div>
          {/if}
        </div>
      {/each}
    </div>

    <div class="input-area">
      {#if mode === 'radio'}
        <input
          class="topic-input"
          placeholder="ラジオのテーマを入力..."
          bind:value={radioTheme}
        />
        <div class="radio-options">
          <div class="radio-option-group">
            <span class="option-label">時間</span>
            <div class="option-chips">
              <button class={`chip ${radioDuration === 3 ? 'chip-active' : ''}`} onclick={() => (radioDuration = 3)}>3分</button>
              <button class={`chip ${radioDuration === 5 ? 'chip-active' : ''}`} onclick={() => (radioDuration = 5)}>5分</button>
              <button class={`chip ${radioDuration === 10 ? 'chip-active' : ''}`} onclick={() => (radioDuration = 10)}>10分</button>
            </div>
          </div>
          <div class="radio-option-group">
            <span class="option-label">雰囲気</span>
            <div class="option-chips">
              <button class={`chip ${radioAtmosphere === 'bright' ? 'chip-active' : ''}`} onclick={() => (radioAtmosphere = 'bright')}>明るい</button>
              <button class={`chip ${radioAtmosphere === 'midnight' ? 'chip-active' : ''}`} onclick={() => (radioAtmosphere = 'midnight')}>深夜</button>
              <button class={`chip ${radioAtmosphere === 'news' ? 'chip-active' : ''}`} onclick={() => (radioAtmosphere = 'news')}>情報番組</button>
            </div>
          </div>
          <div class="radio-option-group">
            <span class="option-label">TTS</span>
            <div class="option-chips">
              <button class={`chip ${radioTtsProvider === 'none' ? 'chip-active' : ''}`} onclick={() => (radioTtsProvider = 'none')}>なし</button>
              <button class={`chip ${radioTtsProvider === 'google' ? 'chip-active' : ''}`} onclick={() => (radioTtsProvider = 'google')}>Google</button>
            </div>
          </div>
        </div>
        <div class="button-row">
          <button onclick={startRadio}>ラジオ開始</button>
        </div>
      {:else}
        <input
          class="topic-input"
          placeholder="議論するトピックを入力してください..."
          bind:value={topic}
        />
        <div class="button-row">
          <button onclick={startDiscussion}>会話開始</button>
          <button class="btn-secondary" onclick={startDummyDiscussion}>ダミー会話</button>
        </div>
      {/if}
    </div>
  </div>

  <!-- ── PNGTuber Stage ── -->
  <div class="stage-panel">
    <p class="stage-label">◈ PNGTUBER</p>
    <div class="stage-scaler">
      <PNGTuberStage
        character={viewerCharacter}
        speaking={pngSpeaking}
        mouthLevel={pngMouthLevel}
        blink={pngBlink}
      />
    </div>
    <button
      class="speak-btn"
      class:speak-btn-active={pngSpeaking}
      disabled={pngSpeaking}
      onclick={startSpeakTest}
    >
      {pngSpeaking ? '● 発話中...' : '▶ Speaking テスト'}
    </button>
  </div>
</div>

<!-- モーダル -->
{#if showSettings && selectedCharacter}
  <div class="modal" onclick={closeSettings}>
    <div class="modal-content" onclick={(e) => e.stopPropagation()}>

      <h2>CHARACTER CONFIG</h2>
      <div class="modal-subtitle">{selectedCharacter.name} 設定</div>

      <label>キャラ名</label>
      <input bind:value={selectedCharacter.name} />

      <label>Voice ID</label>
      <input bind:value={selectedCharacter.voiceId} />

      <label>システムプロンプト</label>
      <textarea bind:value={selectedCharacter.systemPrompt}></textarea>

      <div class="modal-actions">
        <button class="btn-cancel" onclick={closeSettings}>キャンセル</button>
        <button onclick={() => selectedCharacter && handleCharacterSave(selectedCharacter)}>保存</button>
      </div>

    </div>
  </div>
{/if}


<style>
  /* ===================== Layout ===================== */
  .page {
    display: flex;
    height: 100vh;
    background: #0a0f1a;
    color: #fff;
    font-family: sans-serif;
  }

  .sidebar {
    width: 120px;
    flex-shrink: 0;
    display: flex;
    flex-direction: column;
    gap: 16px;
    padding: 24px 12px;
    background: rgba(0, 0, 0, 0.4);
    border-right: 1px solid rgba(34, 211, 238, 0.15);
  }

  .char-card {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 6px;
    cursor: pointer;
    padding: 8px;
    border-radius: 12px;
    transition: background 0.2s;
  }

  .char-card:hover {
    background: rgba(34, 211, 238, 0.1);
  }

  .char-card img {
    width: 60px;
    height: 60px;
    border-radius: 50%;
    object-fit: cover;
    border: 2px solid rgba(34, 211, 238, 0.4);
  }

  .char-card p {
    margin: 0;
    font-size: 11px;
    color: #aaa;
    text-align: center;
  }

  .main {
    flex: 1;
    display: flex;
    flex-direction: column;
    overflow: hidden;
  }

  .count {
    margin: 8px 16px;
    font-size: 12px;
    color: #555;
  }

  /* ===================== Messages ===================== */
  .messages {
    flex: 1;
    display: flex;
    flex-direction: column;
    gap: 12px;
    padding: 12px 16px;
    overflow-y: auto;
  }

  /* ===================== Message row ===================== */
  .message-row {
    display: flex;
    align-items: flex-end;
    gap: 10px;
    animation: fadeInUp 0.3s ease both;
  }

  .message-row.left {
    flex-direction: row;
    justify-content: flex-start;
    padding-left: 20px;
  }

  .message-row.right {
    flex-direction: row-reverse;
    justify-content: flex-end;
    padding-right: 20px;
  }

  /* ===================== Avatar ===================== */
  .avatar {
    width: 36px;
    height: 36px;
    border-radius: 50%;
    flex-shrink: 0;
    overflow: hidden;
    display: flex;
    align-items: center;
    justify-content: center;
    border: 1.5px solid rgba(34, 211, 238, 0.5);
    box-shadow: 0 0 8px rgba(34, 211, 238, 0.35);
  }

  .avatar img {
    width: 100%;
    height: 100%;
    object-fit: cover;
  }

  .message-row.right .avatar {
    border-color: rgba(168, 85, 247, 0.5);
    box-shadow: 0 0 8px rgba(168, 85, 247, 0.35);
  }

  /* ===================== Bubble wrapper ===================== */
  .bubble-wrap {
    display: flex;
    flex-direction: column;
    max-width: 40%;
  }

  .bubble-wrap.right-wrap {
    align-items: flex-end;
  }

  /* ===================== Speaker ===================== */
  .speaker-name {
    font-size: 10px;
    color: #22d3ee;
    margin-bottom: 3px;
    letter-spacing: 0.08em;
  }

  .message-row.right .speaker-name {
    color: #a855f7;
  }

  /* ===================== Bubble ===================== */
  .bubble {
    padding: 10px 14px;
    border-radius: 12px;
    font-size: 14px;
    line-height: 1.6;
    word-break: break-word;
    backdrop-filter: blur(6px);
    background: linear-gradient(135deg, rgba(10, 20, 30, 0.85), rgba(20, 40, 60, 0.6));
    border: 1px solid rgba(34, 211, 238, 0.4);
    box-shadow:
      0 0 10px rgba(34, 211, 238, 0.4),
      0 0 20px rgba(34, 211, 238, 0.2),
      inset 0 0 10px rgba(34, 211, 238, 0.15);
  }

  .message-row.right .bubble {
    border-color: rgba(168, 85, 247, 0.5);
    box-shadow:
      0 0 10px rgba(168, 85, 247, 0.5),
      0 0 20px rgba(168, 85, 247, 0.3),
      inset 0 0 10px rgba(168, 85, 247, 0.2);
  }

  /* ===================== Input area ===================== */
  .input-area {
    padding: 16px;
    border-top: 1px solid rgba(34, 211, 238, 0.1);
    display: flex;
    flex-direction: column;
    gap: 10px;
  }

  .topic-input {
    width: 100%;
    padding: 10px 14px;
    border-radius: 10px;
    border: 1px solid rgba(34, 211, 238, 0.3);
    background: rgba(0, 0, 0, 0.4);
    color: #fff;
    font-size: 14px;
    outline: none;
    box-sizing: border-box;
  }

  .topic-input:focus {
    border-color: #22d3ee;
    box-shadow: 0 0 8px rgba(34, 211, 238, 0.4);
  }

  .button-row {
    display: flex;
    gap: 10px;
  }

  button {
    padding: 9px 20px;
    border-radius: 8px;
    border: none;
    background: linear-gradient(135deg, #00ffff, #00aaff);
    color: #000;
    font-weight: bold;
    font-size: 13px;
    cursor: pointer;
    transition: 0.2s;
  }

  button:hover {
    transform: scale(1.04);
    box-shadow: 0 0 10px rgba(0, 255, 255, 0.7);
  }

  .btn-secondary {
    background: linear-gradient(135deg, rgba(168, 85, 247, 0.8), rgba(120, 40, 200, 0.8));
    color: #fff;
  }

  .btn-secondary:hover {
    box-shadow: 0 0 10px rgba(168, 85, 247, 0.7);
  }

  /* ===================== Animation ===================== */
  @keyframes fadeInUp {
    from { opacity: 0; transform: translateY(8px); }
    to   { opacity: 1; transform: translateY(0); }
  }

  /* ===================== Modal ===================== */
  .modal {
    position: fixed;
    inset: 0;
    background: rgba(0, 0, 0, 0.6);
    backdrop-filter: blur(6px);
    display: flex;
    align-items: center;
    justify-content: center;
    z-index: 9999;
  }

  .modal-content {
    width: 420px;
    padding: 24px;
    border-radius: 16px;
    background: rgba(20, 20, 30, 0.95);
    border: 1px solid rgba(0, 255, 255, 0.3);
    box-shadow:
      0 0 20px rgba(0, 255, 255, 0.2),
      0 0 40px rgba(0, 255, 255, 0.1);
    color: #fff;
  }

  .modal-content h2 {
    margin: 0 0 8px;
    font-size: 20px;
    color: #00ffff;
    text-shadow: 0 0 8px rgba(0, 255, 255, 0.8);
  }

  .modal-subtitle {
    margin-bottom: 16px;
    font-size: 13px;
    color: #aaa;
  }

  .modal-content label {
    display: block;
    margin-top: 12px;
    font-size: 12px;
    color: #aaa;
  }

  .modal-content input,
  .modal-content textarea {
    width: 100%;
    margin-top: 6px;
    padding: 8px;
    border-radius: 8px;
    border: 1px solid rgba(0, 255, 255, 0.2);
    background: rgba(0, 0, 0, 0.4);
    color: #fff;
    outline: none;
    box-sizing: border-box;
    font-size: 13px;
  }

  .modal-content textarea {
    min-height: 80px;
    resize: vertical;
  }

  .modal-content input:focus,
  .modal-content textarea:focus {
    border-color: #00ffff;
    box-shadow: 0 0 8px rgba(0, 255, 255, 0.6);
  }

  .modal-actions {
    display: flex;
    justify-content: flex-end;
    gap: 10px;
    margin-top: 20px;
  }

  .btn-cancel {
    background: rgba(255, 255, 255, 0.1);
    color: #fff;
    border: 1px solid rgba(255, 255, 255, 0.2);
  }

  .btn-cancel:hover {
    background: rgba(255, 255, 255, 0.15);
    box-shadow: none;
    transform: none;
  }

  /* ===================== Mode tabs ===================== */
  .mode-tabs {
    display: flex;
    gap: 8px;
    padding: 12px 16px 0;
  }

  .tab {
    padding: 5px 18px;
    border-radius: 20px;
    border: 1px solid rgba(34, 211, 238, 0.3);
    background: transparent;
    color: #888;
    font-size: 12px;
    font-weight: normal;
    cursor: pointer;
    transition: 0.2s;
  }

  .tab:hover {
    background: rgba(34, 211, 238, 0.08);
    transform: none;
    box-shadow: none;
  }

  .tab-active {
    background: rgba(34, 211, 238, 0.12);
    border-color: #22d3ee;
    color: #22d3ee;
  }

  /* ===================== Radio options ===================== */
  .radio-options {
    display: flex;
    flex-direction: column;
    gap: 8px;
  }

  .radio-option-group {
    display: flex;
    align-items: center;
    gap: 10px;
  }

  .option-label {
    font-size: 11px;
    color: #888;
    width: 36px;
    flex-shrink: 0;
  }

  .option-chips {
    display: flex;
    gap: 6px;
    flex-wrap: wrap;
  }

  .chip {
    padding: 4px 12px;
    border-radius: 16px;
    border: 1px solid rgba(34, 211, 238, 0.2);
    background: transparent;
    color: #888;
    font-size: 12px;
    font-weight: normal;
    cursor: pointer;
    transition: 0.2s;
  }

  .chip:hover {
    background: rgba(34, 211, 238, 0.08);
    transform: none;
    box-shadow: none;
  }

  .chip-active {
    background: rgba(34, 211, 238, 0.15);
    border-color: #22d3ee;
    color: #22d3ee;
  }

  /* ===================== PNGTuber Stage ===================== */
  .stage-panel {
    width: 420px;
    flex-shrink: 0;
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 12px;
    padding: 20px 0 16px;
    border-left: 1px solid rgba(99, 102, 241, 0.2);
    background: rgba(0, 0, 0, 0.25);
  }

  .stage-label {
    margin: 0;
    font-size: 10px;
    font-weight: 700;
    letter-spacing: 0.14em;
    color: #4b5571;
  }

  .stage-scaler {
    width: 400px;
    overflow: hidden;
    display: flex;
    justify-content: center;
  }

  .speak-btn {
    padding: 9px 22px;
    border-radius: 8px;
    border: 1px solid rgba(99, 102, 241, 0.4);
    background: rgba(14, 18, 30, 0.8);
    color: #818cf8;
    font-size: 12px;
    font-weight: 700;
    letter-spacing: 0.06em;
    cursor: pointer;
    transition: all 0.15s;
    /* global button スタイルの上書き */
    background-image: none;
  }

  .speak-btn:hover:not(:disabled) {
    background: rgba(99, 102, 241, 0.15);
    box-shadow: 0 0 12px rgba(99, 102, 241, 0.3);
    transform: none;
  }

  .speak-btn-active,
  .speak-btn:disabled {
    opacity: 0.6;
    cursor: not-allowed;
    transform: none;
    box-shadow: none;
    color: #a5b4fc;
    border-color: rgba(99, 102, 241, 0.6);
  }
</style>
