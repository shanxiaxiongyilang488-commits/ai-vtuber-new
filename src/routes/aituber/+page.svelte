<script lang="ts">
  import { goto } from '$app/navigation';
  import { onMount } from 'svelte';
  import {
    DEFAULT_PROACTIVE_SETTINGS,
    loadProactiveSettings,
    saveProactiveSettings,
    type ProactiveSettings,
  } from '$lib/aituber';

  type CharacterListItem = {
    id: string;
    name: string;
    role: string;
    description: string;
    hasReference: boolean;
    hasMemoryEntry: boolean;
    updatedAt: string;
  };

  type VoiceStatus = {
    configured: boolean;
    label: string;
  };

  let characters = $state<CharacterListItem[]>([]);
  let selectedId = $state('');
  let loading = $state(true);
  let launching = $state(false);
  let errorMessage = $state('');
  let previewImage = $state('');
  let voiceStatus = $state<VoiceStatus>({ configured: false, label: '未確認' });
  let settings = $state<ProactiveSettings>({ ...DEFAULT_PROACTIVE_SETTINGS });

  const selectedCharacter = $derived(characters.find((item) => item.id === selectedId) ?? null);
  const readyCount = $derived([
    Boolean(selectedCharacter),
    Boolean(selectedCharacter?.hasReference),
    voiceStatus.configured,
  ].filter(Boolean).length);

  onMount(() => {
    void loadCharacters();
  });

  async function loadCharacters(): Promise<void> {
    loading = true;
    errorMessage = '';
    try {
      const response = await fetch('/api/character-memory');
      const data = await response.json().catch(() => ({})) as { characters?: CharacterListItem[]; message?: string };
      if (!response.ok) throw new Error(data.message ?? `キャラクター一覧を取得できませんでした (${response.status})`);
      characters = Array.isArray(data.characters) ? data.characters : [];
      if (characters.length > 0) await selectCharacter(characters[0].id);
    } catch (error) {
      errorMessage = error instanceof Error ? error.message : String(error);
    } finally {
      loading = false;
    }
  }

  async function selectCharacter(id: string): Promise<void> {
    selectedId = id;
    previewImage = '';
    voiceStatus = { configured: false, label: '確認中…' };
    settings = loadProactiveSettings(id);

    const [referenceResult, voiceResult] = await Promise.allSettled([
      fetch(`/api/characters/${encodeURIComponent(id)}/reference`).then(async (response) => {
        if (!response.ok) return '';
        const data = await response.json().catch(() => ({})) as { referenceImageDataUrl?: string };
        return data.referenceImageDataUrl ?? '';
      }),
      fetch(`/api/characters/${encodeURIComponent(id)}/voice`).then(async (response) => {
        if (!response.ok) return null;
        return response.json();
      }),
    ]);

    if (selectedId !== id) return;
    previewImage = referenceResult.status === 'fulfilled' ? referenceResult.value : '';
    if (voiceResult.status === 'fulfilled' && voiceResult.value?.voice) {
      const voice = voiceResult.value.voice as { engine?: string; mode?: string; model?: string };
      const configured = Boolean(voice.engine && voice.mode && voice.model);
      voiceStatus = {
        configured,
        label: configured ? [voice.engine, voice.mode, voice.model].filter(Boolean).join(' / ') : '未設定',
      };
    } else {
      voiceStatus = { configured: false, label: '未設定' };
    }
  }

  function updateBoolean(key: 'enabled' | 'autoPlayVoice', checked: boolean): void {
    settings = { ...settings, [key]: checked };
  }

  function updateIdleMinutes(value: string): void {
    const minutes = Math.max(1, Math.min(120, Number(value) || 5));
    settings = { ...settings, idleDelayMs: minutes * 60_000 };
  }

  async function launchAITuber(): Promise<void> {
    if (!selectedCharacter || launching) return;
    launching = true;
    saveProactiveSettings(selectedCharacter.id, settings);
    localStorage.setItem('ai-vtuber:broadcast-mode', 'true');
    await goto(`/character-memory?id=${encodeURIComponent(selectedCharacter.id)}&broadcast=1`);
  }
</script>

<svelte:head>
  <title>AITuber Studio | AI VTuber</title>
  <meta name="description" content="キャラクターをAITuber配信用チャットとしてセットアップします" />
</svelte:head>

<main class="studio-shell">
  <header class="topbar">
    <a class="back-link" href="/">← メニュー</a>
    <div class="status"><span></span>AITUBER SYSTEM READY</div>
  </header>

  <section class="hero">
    <div>
      <p class="eyebrow">LIVE CHARACTER BUILDER</p>
      <h1>AITuber Studio</h1>
      <p class="lead">育てたキャラクターを、その記憶と口調を保ったまま配信チャットへ接続します。</p>
    </div>
    <div class="flow" aria-label="AITuberの処理フロー">
      <span>CHAT</span><b>→</b><span>VOICE</span><b>→</b><span>LIP SYNC</span><b>→</b><span>LIVE</span>
    </div>
  </section>

  {#if errorMessage}
    <div class="notice error" role="alert">{errorMessage}</div>
  {/if}

  {#if loading}
    <section class="empty-panel">キャラクターを読み込んでいます…</section>
  {:else if characters.length === 0}
    <section class="empty-panel">
      <strong>最初にキャラクターを作成してください</strong>
      <p>名前、性格、参考画像を登録するとAITuberとして起動できます。</p>
      <a class="primary-button" href="/characters">キャラクターを作る</a>
    </section>
  {:else}
    <div class="workspace">
      <section class="character-section">
        <div class="section-heading">
          <div><span>STEP 01</span><h2>キャラクターを選ぶ</h2></div>
          <a href="/characters">＋ 新規作成</a>
        </div>

        <div class="character-grid">
          {#each characters as item (item.id)}
            <button
              type="button"
              class="character-card"
              class:selected={item.id === selectedId}
              onclick={() => void selectCharacter(item.id)}
              aria-pressed={item.id === selectedId}
            >
              <span class="avatar-placeholder">{item.name.slice(0, 1)}</span>
              <span class="character-copy">
                <strong>{item.name}</strong>
                <small>{item.role || 'CHARACTER'}</small>
              </span>
              <span class:ready={item.hasReference} class="asset-dot" title={item.hasReference ? '参考画像あり' : '参考画像なし'}></span>
            </button>
          {/each}
        </div>
      </section>

      {#if selectedCharacter}
        <section class="builder-panel">
          <div class="preview-column">
            <div class="preview-stage">
              {#if previewImage}
                <img src={previewImage} alt={`${selectedCharacter.name}の配信アバタープレビュー`} />
              {:else}
                <div class="preview-fallback">
                  <span>{selectedCharacter.name.slice(0, 1)}</span>
                  <p>参考画像を登録すると<br />ここに表示されます</p>
                </div>
              {/if}
              <div class="live-badge"><i></i> PREVIEW</div>
            </div>
            <div class="avatar-type">
              <span>VISUAL ENGINE</span>
              <strong>PuruPuru / PNG Avatar</strong>
              <a href={`/mouth-picker?character=${encodeURIComponent(selectedCharacter.id)}`}>アバター素材を作る →</a>
            </div>
          </div>

          <div class="setup-column">
            <div class="section-heading compact">
              <div><span>STEP 02</span><h2>配信設定</h2></div>
              <b>{readyCount}/3 READY</b>
            </div>

            <div class="check-list">
              <article class:complete={selectedCharacter.hasMemoryEntry}>
                <i>{selectedCharacter.hasMemoryEntry ? '✓' : '1'}</i>
                <div><strong>キャラクター記憶</strong><span>{selectedCharacter.hasMemoryEntry ? '会話履歴と人格を使用します' : '初回会話時に作成されます'}</span></div>
              </article>
              <article class:complete={selectedCharacter.hasReference}>
                <i>{selectedCharacter.hasReference ? '✓' : '2'}</i>
                <div><strong>配信アバター</strong><span>{selectedCharacter.hasReference ? '参考画像を使用できます' : '参考画像を追加してください'}</span></div>
                {#if !selectedCharacter.hasReference}<a href={`/character-memory?id=${encodeURIComponent(selectedCharacter.id)}#project-assets`}>登録</a>{/if}
              </article>
              <article class:complete={voiceStatus.configured}>
                <i>{voiceStatus.configured ? '✓' : '3'}</i>
                <div><strong>キャラクター音声</strong><span>{voiceStatus.label}</span></div>
                {#if !voiceStatus.configured}<a href="/voice">設定</a>{/if}
              </article>
            </div>

            <div class="controls">
              <label class="switch-row">
                <span><strong>返信を自動で読み上げる</strong><small>TTS音声に合わせて口パクします</small></span>
                <input type="checkbox" checked={settings.autoPlayVoice} onchange={(event) => updateBoolean('autoPlayVoice', event.currentTarget.checked)} />
              </label>
              <label class="switch-row">
                <span><strong>自発会話</strong><small>静かな時間が続くとキャラクターから話します</small></span>
                <input type="checkbox" checked={settings.enabled} onchange={(event) => updateBoolean('enabled', event.currentTarget.checked)} />
              </label>
              <label class="number-row">
                <span><strong>自発会話までの待機時間</strong><small>1〜120分</small></span>
                <span class="number-input"><input type="number" min="1" max="120" value={Math.round(settings.idleDelayMs / 60_000)} onchange={(event) => updateIdleMinutes(event.currentTarget.value)} /><b>分</b></span>
              </label>
            </div>

            <button class="launch-button" type="button" onclick={launchAITuber} disabled={launching}>
              <span>{launching ? '起動しています…' : `${selectedCharacter.name}をAITuberとして起動`}</span>
              <b>START LIVE →</b>
            </button>
            {#if !selectedCharacter.hasReference || !voiceStatus.configured}
              <p class="launch-note">不足項目があってもチャットは起動できます。アバターまたは音声は後から設定できます。</p>
            {/if}
          </div>
        </section>
      {/if}
    </div>
  {/if}
</main>

<style>
  :global(body) { background: #020617; }
  .studio-shell { min-height: 100vh; padding: 28px clamp(18px, 4vw, 64px) 60px; color: #e2e8f0; background: radial-gradient(circle at 75% 0%, rgba(6,182,212,.15), transparent 34%), radial-gradient(circle at 0% 50%, rgba(139,92,246,.11), transparent 32%), #020617; }
  .topbar, .hero, .workspace, .notice, .empty-panel { width: min(1180px, 100%); margin-inline: auto; }
  .topbar { display: flex; justify-content: space-between; align-items: center; }
  .back-link, .section-heading a, .avatar-type a, .check-list a { color: #67e8f9; text-decoration: none; }
  .back-link { padding: 8px 0; font-weight: 700; }
  .status { display: flex; align-items: center; gap: 9px; color: #67e8f9; font: 700 11px/1.2 'Segoe UI', sans-serif; letter-spacing: .13em; }
  .status span, .live-badge i { width: 7px; height: 7px; border-radius: 50%; background: #22d3ee; box-shadow: 0 0 12px #22d3ee; }
  .hero { display: flex; justify-content: space-between; align-items: end; gap: 30px; padding: 60px 0 36px; border-bottom: 1px solid rgba(103,232,249,.18); }
  .eyebrow, .section-heading span, .avatar-type > span { color: #22d3ee; font-size: 11px; font-weight: 800; letter-spacing: .18em; }
  h1 { margin: 7px 0 10px; font-size: clamp(42px, 7vw, 76px); line-height: .95; letter-spacing: -.04em; background: linear-gradient(90deg, #f8fafc, #67e8f9); -webkit-background-clip: text; background-clip: text; color: transparent; }
  .lead { max-width: 610px; color: #94a3b8; font-size: 17px; }
  .flow { display: flex; align-items: center; gap: 10px; padding-bottom: 5px; color: #64748b; font-size: 10px; font-weight: 800; letter-spacing: .12em; white-space: nowrap; }
  .flow span { padding: 7px 9px; border: 1px solid rgba(103,232,249,.2); color: #a5f3fc; background: rgba(8,47,73,.35); }
  .workspace { display: grid; gap: 24px; padding-top: 30px; }
  .character-section, .builder-panel, .empty-panel { border: 1px solid rgba(71,85,105,.55); background: rgba(15,23,42,.72); box-shadow: 0 24px 70px rgba(0,0,0,.25); }
  .character-section { padding: 22px; }
  .section-heading { display: flex; justify-content: space-between; align-items: center; gap: 20px; margin-bottom: 18px; }
  .section-heading h2 { margin-top: 3px; font-size: 20px; }
  .section-heading a { font-size: 13px; font-weight: 800; }
  .section-heading.compact b { color: #94a3b8; font-size: 11px; letter-spacing: .12em; }
  .character-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(210px, 1fr)); gap: 10px; }
  .character-card { position: relative; display: flex; align-items: center; gap: 12px; padding: 13px; border: 1px solid #334155; border-radius: 7px; background: #0b1220; color: #e2e8f0; text-align: left; cursor: pointer; transition: border-color .18s ease, transform .18s ease, background .18s ease; }
  .character-card:hover { transform: translateY(-2px); border-color: #475569; }
  .character-card.selected { border-color: #22d3ee; background: rgba(8,47,73,.55); box-shadow: 0 0 0 1px rgba(34,211,238,.12), 0 0 24px rgba(34,211,238,.08); }
  .avatar-placeholder { width: 42px; height: 42px; flex: 0 0 auto; display: grid; place-items: center; border-radius: 50%; color: #cffafe; background: linear-gradient(135deg, #164e63, #312e81); font-size: 19px; font-weight: 900; }
  .character-copy { min-width: 0; display: grid; }
  .character-copy strong { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .character-copy small { color: #64748b; font-size: 10px; letter-spacing: .1em; }
  .asset-dot { position: absolute; right: 10px; top: 10px; width: 6px; height: 6px; border-radius: 50%; background: #475569; }
  .asset-dot.ready { background: #4ade80; box-shadow: 0 0 8px rgba(74,222,128,.7); }
  .builder-panel { display: grid; grid-template-columns: minmax(280px, .82fr) minmax(420px, 1.18fr); overflow: hidden; }
  .preview-column { padding: 22px; border-right: 1px solid rgba(71,85,105,.55); background: rgba(2,6,23,.48); }
  .preview-stage { position: relative; height: 480px; display: grid; place-items: center; overflow: hidden; border: 1px solid rgba(34,211,238,.24); border-radius: 9px; background: radial-gradient(circle at 50% 45%, rgba(14,116,144,.18), transparent 42%), linear-gradient(180deg,#030712,#020617); }
  .preview-stage::after { content: ''; position: absolute; inset: 0; pointer-events: none; background-image: linear-gradient(rgba(34,211,238,.035) 1px, transparent 1px), linear-gradient(90deg,rgba(34,211,238,.035) 1px,transparent 1px); background-size: 32px 32px; }
  .preview-stage img { width: 100%; height: 100%; object-fit: contain; position: relative; z-index: 1; }
  .preview-fallback { position: relative; z-index: 1; display: grid; place-items: center; gap: 16px; text-align: center; color: #64748b; }
  .preview-fallback span { width: 118px; height: 118px; display: grid; place-items: center; border-radius: 50%; color: #a5f3fc; background: linear-gradient(135deg,#164e63,#312e81); font-size: 52px; font-weight: 900; box-shadow: 0 0 50px rgba(34,211,238,.18); }
  .live-badge { position: absolute; z-index: 2; top: 14px; left: 14px; display: flex; align-items: center; gap: 7px; padding: 6px 9px; border-radius: 4px; background: rgba(2,6,23,.78); color: #a5f3fc; font-size: 10px; font-weight: 900; letter-spacing: .12em; }
  .avatar-type { display: grid; gap: 5px; margin-top: 15px; }
  .avatar-type strong { font-size: 14px; }
  .avatar-type a { margin-top: 5px; font-size: 12px; }
  .setup-column { padding: 26px; }
  .check-list { display: grid; gap: 8px; }
  .check-list article { display: grid; grid-template-columns: 34px 1fr auto; align-items: center; gap: 12px; padding: 13px; border: 1px solid #334155; border-radius: 7px; background: rgba(15,23,42,.72); }
  .check-list article > i { width: 28px; height: 28px; display: grid; place-items: center; border-radius: 50%; background: #1e293b; color: #94a3b8; font-style: normal; font-weight: 900; }
  .check-list article.complete > i { color: #052e16; background: #4ade80; }
  .check-list article > div { display: grid; }
  .check-list article span { color: #64748b; font-size: 12px; }
  .check-list a { font-size: 12px; font-weight: 800; }
  .controls { display: grid; margin-top: 22px; border-top: 1px solid #1e293b; }
  .switch-row, .number-row { min-height: 72px; display: flex; justify-content: space-between; align-items: center; gap: 18px; border-bottom: 1px solid #1e293b; }
  .switch-row > span, .number-row > span:first-child { display: grid; }
  .switch-row small, .number-row small { color: #64748b; font-size: 12px; }
  .switch-row input { width: 44px; height: 23px; accent-color: #22d3ee; }
  .number-input { display: flex; align-items: center; gap: 7px; color: #94a3b8; }
  .number-input input { width: 72px; padding: 8px; border: 1px solid #334155; border-radius: 5px; background: #020617; color: #e2e8f0; text-align: right; }
  .launch-button, .primary-button { border: 0; border-radius: 7px; color: #042f2e; background: linear-gradient(90deg,#22d3ee,#67e8f9); font-weight: 900; text-decoration: none; cursor: pointer; box-shadow: 0 12px 34px rgba(34,211,238,.18); }
  .launch-button { width: 100%; min-height: 62px; margin-top: 24px; padding: 0 20px; display: flex; justify-content: space-between; align-items: center; }
  .launch-button:disabled { opacity: .65; cursor: wait; }
  .launch-note { margin-top: 10px; color: #64748b; font-size: 11px; text-align: center; }
  .empty-panel { margin-top: 30px; padding: 70px 24px; display: grid; place-items: center; gap: 12px; text-align: center; }
  .empty-panel p { color: #94a3b8; }
  .primary-button { margin-top: 8px; padding: 12px 18px; }
  .notice { margin-top: 24px; padding: 12px 15px; border: 1px solid rgba(248,113,113,.4); background: rgba(127,29,29,.2); color: #fecaca; }
  @media (max-width: 850px) { .hero { align-items: start; flex-direction: column; padding-top: 42px; } .builder-panel { grid-template-columns: 1fr; } .preview-column { border-right: 0; border-bottom: 1px solid rgba(71,85,105,.55); } .preview-stage { height: min(55vh, 460px); } }
  @media (max-width: 560px) { .studio-shell { padding-inline: 14px; } .flow { width: 100%; overflow-x: auto; } .character-grid { grid-template-columns: 1fr; } .setup-column, .preview-column, .character-section { padding: 16px; } .check-list article { grid-template-columns: 30px 1fr; } .check-list article a { grid-column: 2; } .launch-button { align-items: flex-start; flex-direction: column; justify-content: center; gap: 2px; } }
</style>
