<script lang="ts">
  import { onMount } from 'svelte';
  import type {
    CharacterVoiceCandidate,
    VoiceAnalyzeResponse,
    VoiceCandidatesResponse,
    VoiceDesignSession,
    VoiceProfile,
    VoiceRefineResponse,
    VoiceUsageSummary,
  } from '$lib/voiceDesign';

  let { characterId = '', characterName = '' }: { characterId?: string; characterName?: string } = $props();

  const DEFAULT_TEST_PHRASE = 'こんにちは、私の声を聞いてください。今日はとてもいい天気ですね。';

  let imageDataUrl = $state('');
  let imageName = $state('');
  let characterSetting = $state('');
  let testPhrase = $state(DEFAULT_TEST_PHRASE);

  let analyzing = $state(false);
  let generating = $state(false);
  let refining = $state(false);
  let saving = $state(false);

  let profile = $state<VoiceProfile | null>(null);
  let voiceThought = $state<string[]>([]);
  let candidates = $state<CharacterVoiceCandidate[]>([]);
  let selectedCandidateId = $state('');
  let refineInstruction = $state('');

  let usage = $state<VoiceUsageSummary | null>(null);
  let lastCostUsd = $state(0);

  // --- コストガード (見積もり・予算・有効化状態) ---
  type EstimateInfo = {
    provider: string;
    model: string;
    pricing: { perVoiceCreationUsd: number; perPreviewCharUsd: number; pricingConfirmed: boolean; note?: string };
    estimate: { voiceCount: number; previewChars: number; creationFeeUsd: number; previewFeeUsd: number; totalUsd: number };
    budget: { limitUsd: number; usedUsd: number; remainingUsd: number };
    enabled: boolean;
    allowed: boolean;
  };
  let guardInfo = $state<EstimateInfo | null>(null);

  let errorMessage = $state('');
  let statusMessage = $state('');

  // --- Voice Design 履歴 (キャラクターごと・data/voice-design-history) ---
  let historySessions = $state<VoiceDesignSession[]>([]);
  let currentSessionId = $state('');
  let deletingSessionId = $state('');

  const selectedCandidate = $derived(candidates.find((item) => item.id === selectedCandidateId) ?? null);
  const busy = $derived(analyzing || generating || refining || saving);

  const analysisRows = $derived(profile
    ? [
        { label: '年齢感', text: profile.identity.apparent_age },
        { label: '声域', text: profile.identity.pitch },
        { label: '明るさ', value: profile.identity.brightness },
        { label: '柔らかさ', value: profile.identity.softness },
        { label: '息成分', value: profile.identity.breathiness },
        { label: '感情幅', value: profile.personality.emotional_range },
        { label: '話速', value: profile.personality.speaking_rate },
        { label: '人工感', value: profile.identity.mechanical_precision },
      ]
    : []);

  function pct(value: number): string {
    return `${Math.round(value * 100)}%`;
  }

  function usd(value: number): string {
    return `$${value.toFixed(4)}`;
  }

  async function loadUsage() {
    try {
      const res = await fetch('/api/voice/usage');
      if (!res.ok) return;
      const data = (await res.json()) as { usage?: VoiceUsageSummary };
      if (data.usage) usage = data.usage;
    } catch {
      // 表示専用のため失敗しても無視
    }
  }

  onMount(() => {
    void loadUsage();
    void refreshGuardInfo(0, 0);
  });

  function previewCharCount(value: string): number {
    return Array.from(value.replace(/\s+/g, '')).length;
  }

  /** 実APIを呼ばないコスト見積もり取得。 */
  async function refreshGuardInfo(chars: number, count: number): Promise<EstimateInfo | null> {
    try {
      const res = await fetch(`/api/voice/estimate?chars=${chars}&count=${count}`);
      if (!res.ok) return null;
      guardInfo = (await res.json()) as EstimateInfo;
      return guardInfo;
    } catch {
      return null;
    }
  }

  /** 生成前の確認ダイアログ。falseなら中止。voice作成固定費を必ず表示する。 */
  async function confirmGenerationCost(voiceCount: number): Promise<boolean> {
    const info = await refreshGuardInfo(previewCharCount(testPhrase), voiceCount);
    if (!info) {
      errorMessage = 'コスト見積もりを取得できないため生成を中止しました。';
      return false;
    }
    if (!info.enabled) {
      errorMessage = 'Voice Design生成は現在無効化されています（env VOICE_DESIGN_ENABLED=1 で有効化）。';
      return false;
    }
    if (!info.allowed) {
      errorMessage = `予算上限を超えるため生成をブロックしました（推定 $${info.estimate.totalUsd.toFixed(4)} / 残り $${info.budget.remainingUsd.toFixed(4)}）。`;
      return false;
    }
    const lines = [
      `Voice ${voiceCount}件を生成します。`,
      '',
      `推定総額: $${info.estimate.totalUsd.toFixed(4)}`,
      `  ├ voice作成固定費: $${info.estimate.creationFeeUsd.toFixed(4)} (${voiceCount}件 × $${info.pricing.perVoiceCreationUsd})`,
      `  └ preview音声料金: $${info.estimate.previewFeeUsd.toFixed(6)}`,
      `Provider: ${info.provider}${info.pricing.pricingConfirmed ? '' : '（単価未確認・実測で要確認）'}`,
      `残り予算: $${info.budget.remainingUsd.toFixed(4)} / 上限 $${info.budget.limitUsd}`,
      '',
      '生成を実行しますか？',
    ];
    return confirm(lines.join('\n'));
  }

  async function loadHistory(id: string) {
    if (!id) {
      historySessions = [];
      return;
    }
    try {
      const res = await fetch(`/api/voice/design-history?characterId=${encodeURIComponent(id)}`);
      if (!res.ok) return;
      const data = (await res.json()) as { sessions?: VoiceDesignSession[] };
      historySessions = data.sessions ?? [];
    } catch {
      // 履歴は表示専用のため失敗しても本体機能を止めない
    }
  }

  $effect(() => {
    void loadHistory(characterId);
  });

  /** 履歴用サムネイル (最大160px JPEG)。元画像のdata URLは保存しない。 */
  function makeThumbnail(dataUrl: string): Promise<string> {
    return new Promise((resolve) => {
      const image = new Image();
      image.onload = () => {
        const scale = Math.min(1, 160 / Math.max(image.width, image.height));
        const canvas = document.createElement('canvas');
        canvas.width = Math.max(1, Math.round(image.width * scale));
        canvas.height = Math.max(1, Math.round(image.height * scale));
        canvas.getContext('2d')?.drawImage(image, 0, 0, canvas.width, canvas.height);
        resolve(canvas.toDataURL('image/jpeg', 0.75));
      };
      image.onerror = () => resolve('');
      image.src = dataUrl;
    });
  }

  async function upsertHistorySession(session: VoiceDesignSession) {
    try {
      const res = await fetch('/api/voice/design-history', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ session }),
      });
      if (res.ok) await loadHistory(characterId);
    } catch {
      // 履歴保存失敗は本体機能へ影響させない
    }
  }

  /** 現在の作業状態から履歴セッションを構築して保存 (generate / refine / save 成功後に呼ぶ)。 */
  async function syncCurrentSessionToHistory(adoptedCandidateId?: string) {
    if (!characterId || !profile || candidates.length === 0) return;
    if (!currentSessionId) currentSessionId = crypto.randomUUID();
    const existing = historySessions.find((item) => item.id === currentSessionId);
    const imageThumb = existing?.imageThumb || (imageDataUrl ? await makeThumbnail(imageDataUrl) : '');
    await upsertHistorySession({
      id: currentSessionId,
      characterId,
      ...(characterName ? { characterName } : {}),
      ...(imageThumb ? { imageThumb } : {}),
      profile,
      testPhrase: testPhrase.trim(),
      candidates,
      ...(adoptedCandidateId ?? existing?.adoptedCandidateId
        ? { adoptedCandidateId: adoptedCandidateId ?? existing?.adoptedCandidateId }
        : {}),
      createdAt: existing?.createdAt ?? new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    });
  }

  async function deleteHistorySession(session: VoiceDesignSession) {
    if (deletingSessionId) return;
    if (!confirm(`${formatSessionDate(session.createdAt)} の生成履歴を削除しますか?（音声ファイルも削除されます）`)) return;
    deletingSessionId = session.id;
    try {
      const res = await fetch(
        `/api/voice/design-history?characterId=${encodeURIComponent(session.characterId)}&id=${encodeURIComponent(session.id)}`,
        { method: 'DELETE' },
      );
      const data = (await res.json().catch(() => ({}))) as { ok?: boolean; message?: string };
      if (!res.ok || !data.ok) throw new Error(data.message ?? `delete failed (${res.status})`);
      historySessions = historySessions.filter((item) => item.id !== session.id);
      if (session.id === currentSessionId) currentSessionId = '';
    } catch (e) {
      errorMessage = e instanceof Error ? e.message : 'history delete failed';
    } finally {
      deletingSessionId = '';
    }
  }

  function formatSessionDate(value: string): string {
    return new Date(value).toLocaleString('ja-JP');
  }

  function onUploadImage(event: Event) {
    const input = event.currentTarget as HTMLInputElement;
    const file = input.files?.[0];
    if (!file) return;
    if (file.size > 8 * 1024 * 1024) {
      errorMessage = '画像は8MB以下にしてください。';
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      imageDataUrl = String(reader.result ?? '');
      imageName = file.name;
      errorMessage = '';
    };
    reader.readAsDataURL(file);
    input.value = '';
  }

  async function analyzeCharacter() {
    if (!imageDataUrl || busy) return;
    analyzing = true;
    errorMessage = '';
    statusMessage = '';
    candidates = [];
    selectedCandidateId = '';
    try {
      const res = await fetch('/api/voice/analyze-character', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          image: imageDataUrl,
          characterName,
          characterSetting: characterSetting.trim(),
        }),
      });
      const data = (await res.json().catch(() => ({}))) as VoiceAnalyzeResponse & { message?: string };
      if (!res.ok) throw new Error(data.message ?? `analyze failed (${res.status})`);
      profile = data.profile;
      voiceThought = data.voiceThought ?? [];
      lastCostUsd = data.estimatedCostUsd ?? 0;
      usage = data.usage ?? usage;
      statusMessage = 'VOICE PROFILE READY — 候補を生成できます';
    } catch (e) {
      errorMessage = e instanceof Error ? e.message : 'analyze failed';
    } finally {
      analyzing = false;
    }
  }

  async function generateCandidates() {
    if (!profile || busy) return;
    errorMessage = '';
    statusMessage = '';
    // 💰 生成前にコスト確認 (voice 3作成 = 固定費×3 を含む推定総額)。
    if (!(await confirmGenerationCost(3))) return;
    generating = true;
    try {
      const res = await fetch('/api/voice/generate-candidates', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ profile, testPhrase: testPhrase.trim(), count: 3 }),
      });
      const data = (await res.json().catch(() => ({}))) as VoiceCandidatesResponse & { message?: string };
      if (!res.ok) throw new Error(data.message ?? `generate failed (${res.status})`);
      candidates = data.candidates ?? [];
      selectedCandidateId = candidates[0]?.id ?? '';
      lastCostUsd = data.estimatedCostUsd ?? 0;
      usage = data.usage ?? usage;
      void refreshGuardInfo(0, 0);
      statusMessage = `${candidates.length} CANDIDATES GENERATED`;
      // 新しい生成 = 新しい履歴セッションとして保存。
      currentSessionId = '';
      void syncCurrentSessionToHistory();
    } catch (e) {
      errorMessage = e instanceof Error ? e.message : 'generate failed';
    } finally {
      generating = false;
    }
  }

  async function refineSelected() {
    if (!profile || !selectedCandidate || !refineInstruction.trim() || busy) return;
    errorMessage = '';
    statusMessage = '';
    // 💰 再設計も新しいvoice 1作成 = 固定費を含めて事前確認する。
    if (!(await confirmGenerationCost(1))) return;
    refining = true;
    try {
      const res = await fetch('/api/voice/refine', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          profile,
          selectedCandidate,
          instruction: refineInstruction.trim(),
          testPhrase: testPhrase.trim(),
        }),
      });
      const data = (await res.json().catch(() => ({}))) as VoiceRefineResponse & { message?: string };
      if (!res.ok) throw new Error(data.message ?? `refine failed (${res.status})`);
      profile = data.profile;
      if (data.voiceThought?.length) voiceThought = [...voiceThought, ...data.voiceThought].slice(-8);
      candidates = candidates.map((item) => (item.id === selectedCandidate.id ? data.candidate : item));
      selectedCandidateId = data.candidate.id;
      lastCostUsd = data.estimatedCostUsd ?? 0;
      usage = data.usage ?? usage;
      void refreshGuardInfo(0, 0);
      refineInstruction = '';
      statusMessage = `VOICE ${data.candidate.slot} REFINED`;
      void syncCurrentSessionToHistory();
    } catch (e) {
      errorMessage = e instanceof Error ? e.message : 'refine failed';
    } finally {
      refining = false;
    }
  }

  async function saveProfile() {
    if (!profile || !selectedCandidate || !characterId || busy) return;
    saving = true;
    errorMessage = '';
    statusMessage = '';
    try {
      const res = await fetch('/api/voice/save-profile', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          characterId,
          profile,
          selectedCandidate,
          provider: selectedCandidate.provider,
          model: selectedCandidate.model,
        }),
      });
      const data = (await res.json().catch(() => ({}))) as { ok?: boolean; message?: string };
      if (!res.ok || !data.ok) throw new Error(data.message ?? `save failed (${res.status})`);
      statusMessage = `VOICE ${selectedCandidate.slot} SAVED → ${characterName || characterId}`;
      void syncCurrentSessionToHistory(selectedCandidate.id);
    } catch (e) {
      errorMessage = e instanceof Error ? e.message : 'save failed';
    } finally {
      saving = false;
    }
  }
</script>

<div class="cvd">
  <div class="cvd-header">
    <span>CHARACTER VOICE DESIGN</span>
    <b>{analyzing ? 'ANALYZING' : generating ? 'GENERATING' : refining ? 'REFINING' : 'CLOUD TTS'}</b>
  </div>

  {#if guardInfo && !guardInfo.enabled}
    <div class="guard-banner">
      ⛔ 音声生成は現在無効化されています（コスト保護）。env <code>VOICE_DESIGN_ENABLED=1</code> で有効化してください。分析・履歴表示は利用できます。
    </div>
  {/if}
  {#if guardInfo}
    <div class="provider-line">
      Provider: <b>{guardInfo.provider}</b>
      · voice作成費 ${guardInfo.pricing.perVoiceCreationUsd}/件
      · preview ${(guardInfo.pricing.perPreviewCharUsd * 1000).toFixed(3)}/1000字
      {#if !guardInfo.pricing.pricingConfirmed}<i>（単価未確認）</i>{/if}
    </div>
  {/if}

  <!-- 1. 画像アップロード -->
  <div class="upload-row">
    <label class="upload-drop">
      {#if imageDataUrl}
        <img src={imageDataUrl} alt={imageName || 'character'} />
      {:else}
        <span class="upload-hint">キャラクター画像をアップロード<br /><small>PNG / JPG (8MBまで)</small></span>
      {/if}
      <input type="file" accept="image/*" onchange={onUploadImage} hidden />
    </label>
    <div class="upload-side">
      <label>
        <span>Character Setting (optional)</span>
        <textarea bind:value={characterSetting} rows="3" placeholder="キャラ設定・世界観など (任意)"></textarea>
      </label>
      <label>
        <span>Test Phrase</span>
        <textarea bind:value={testPhrase} rows="2"></textarea>
      </label>
      <button class="imagine-btn" onclick={analyzeCharacter} disabled={!imageDataUrl || busy}>
        {analyzing ? 'IMAGINING VOICE...' : '🎙 AIで声を想像する'}
      </button>
    </div>
  </div>

  {#if errorMessage}<div class="error-box">{errorMessage}</div>{/if}
  {#if statusMessage}<div class="ok-box">{statusMessage}</div>{/if}

  {#if profile}
    <!-- VOICE ANALYSIS -->
    <div class="section-head"><span>VOICE ANALYSIS</span></div>
    <div class="analysis-grid">
      {#each analysisRows as row}
        <span class="metric-label">{row.label}</span>
        {#if typeof row.value === 'number'}
          <div class="meter" role="img" aria-label={`${row.label} ${pct(row.value)}`}>
            <i style={`width:${pct(row.value)}`}></i>
            <em>{pct(row.value)}</em>
          </div>
        {:else}
          <p class="metric-text">{row.text || '-'}</p>
        {/if}
      {/each}
    </div>

    <!-- AI VOICE THOUGHT -->
    <details class="voice-thought">
      <summary>AI VOICE THOUGHT</summary>
      {#if profile.analysis_reason}<p>{profile.analysis_reason}</p>{/if}
      {#each voiceThought as line}
        <p>{line}</p>
      {/each}
    </details>

    <button class="generate-btn" onclick={generateCandidates} disabled={busy}>
      {generating ? 'GENERATING 3 VOICES...' : '3候補の音声を生成'}
    </button>
  {/if}

  {#if candidates.length > 0}
    <div class="section-head"><span>VOICE CANDIDATES</span><b>クリックで選択</b></div>
    <div class="candidate-grid">
      {#each candidates as candidate (candidate.id)}
        <button
          type="button"
          class="candidate-card"
          class:selected={candidate.id === selectedCandidateId}
          onclick={() => (selectedCandidateId = candidate.id)}
        >
          <div class="candidate-head">
            <b>VOICE {candidate.slot}</b>
            {#if candidate.id === selectedCandidateId}<i>SELECTED</i>{/if}
          </div>
          <p class="candidate-direction">{candidate.direction}</p>
          {#if candidate.reason}<p class="candidate-reason">{candidate.reason}</p>{/if}
          <audio controls src={candidate.audioUrl} preload="none"></audio>
        </button>
      {/each}
    </div>

    <!-- 再設計 -->
    <div class="refine-row">
      <input
        bind:value={refineInstruction}
        placeholder="修正指示 (例: もう少し落ち着いた声 / 少し高く / 機械感を弱く)"
        onkeydown={(event) => {
          if (event.key === 'Enter') void refineSelected();
        }}
      />
      <button onclick={refineSelected} disabled={!refineInstruction.trim() || !selectedCandidate || busy}>
        {refining ? 'REFINING...' : '再設計'}
      </button>
      <button class="save-btn" onclick={saveProfile} disabled={!selectedCandidate || !characterId || busy}>
        {saving ? 'SAVING...' : 'この声を保存'}
      </button>
    </div>
  {/if}

  <!-- COST -->
  <div class="cost-grid" aria-label="コスト管理">
    <span>今回の推定コスト</span><b>{usd(lastCostUsd)}</b>
    <span>累計推定コスト</span><b>{usage ? usd(usage.estimatedCostTotalUsd) : '-'}</b>
    <span>生成回数</span><b>{usage?.generationCount ?? '-'}</b>
    <span>候補数</span><b>{usage?.candidateCount ?? '-'}</b>
    <span>文字数</span><b>{usage?.previewCharCount ?? '-'}</b>
    <span>残り予算</span><b class:over-budget={(guardInfo?.budget.remainingUsd ?? 0) <= 0}>{guardInfo ? usd(guardInfo.budget.remainingUsd) : '-'}</b>
  </div>

  <!-- DESIGN HISTORY -->
  {#if historySessions.length > 0}
    <div class="section-head"><span>DESIGN HISTORY</span><b>{historySessions.length} SESSIONS</b></div>
    <div class="history-list">
      {#each historySessions as session (session.id)}
        <div class="history-card" class:current={session.id === currentSessionId}>
          <div class="history-side">
            {#if session.imageThumb}
              <img src={session.imageThumb} alt="character thumbnail" />
            {:else}
              <div class="history-thumb-empty">NO IMAGE</div>
            {/if}
            <span class="history-date">{formatSessionDate(session.createdAt)}</span>
            <button
              class="history-delete"
              onclick={() => deleteHistorySession(session)}
              disabled={deletingSessionId !== ''}
            >{deletingSessionId === session.id ? 'DELETING...' : '削除'}</button>
          </div>
          <div class="history-body">
            {#each session.candidates as candidate (candidate.id)}
              <div class="history-candidate" class:adopted={candidate.id === session.adoptedCandidateId}>
                <div class="history-candidate-head">
                  <b>VOICE {candidate.slot}</b>
                  {#if candidate.id === session.adoptedCandidateId}<i>ADOPTED</i>{/if}
                  <span>{candidate.direction}</span>
                </div>
                <audio controls src={candidate.audioUrl} preload="none"></audio>
                <details>
                  <summary>Voice Prompt</summary>
                  <p>{candidate.designPrompt}</p>
                  {#if candidate.reason}<p class="history-reason">{candidate.reason}</p>{/if}
                </details>
              </div>
            {/each}
            <details class="history-profile">
              <summary>Voice Profile</summary>
              <pre>{JSON.stringify(session.profile, null, 2)}</pre>
            </details>
          </div>
        </div>
      {/each}
    </div>
  {/if}
</div>

<style>
  .cvd {
    display: grid;
    gap: 14px;
  }

  .cvd-header,
  .section-head {
    display: flex;
    justify-content: space-between;
    align-items: center;
    gap: 12px;
    color: rgba(148, 163, 184, 0.7);
    font-family: 'Orbitron', sans-serif;
    font-size: 11px !important;
  }

  .cvd-header b { color: #c084fc; }
  .section-head b { color: #67e8f9; font-size: 10px !important; }

  .upload-row {
    display: grid;
    grid-template-columns: 180px minmax(0, 1fr);
    gap: 14px;
  }

  .upload-drop {
    display: grid;
    place-items: center;
    min-height: 180px;
    border: 1px dashed rgba(56, 189, 248, 0.4);
    background: rgba(2, 6, 23, 0.68);
    cursor: pointer;
    overflow: hidden;
  }

  .upload-drop img { width: 100%; height: 180px; object-fit: contain; }
  .upload-hint { color: #64748b; text-align: center; font-size: 12px !important; }

  .upload-side { display: grid; gap: 10px; align-content: start; }

  .imagine-btn,
  .generate-btn {
    justify-self: start;
    border: 1px solid rgba(56, 189, 248, 0.45);
    background: rgba(56, 189, 248, 0.1);
    color: #67e8f9;
    font-family: 'Orbitron', sans-serif;
    padding: 12px 18px;
    cursor: pointer;
  }

  .imagine-btn:disabled,
  .generate-btn:disabled { opacity: 0.45; cursor: default; }

  .analysis-grid {
    display: grid;
    grid-template-columns: 72px minmax(0, 1fr);
    gap: 8px 12px;
    align-items: center;
    padding: 14px;
    border: 1px solid rgba(56, 189, 248, 0.2);
    background: rgba(2, 6, 23, 0.5);
  }

  .metric-label {
    color: rgba(203, 213, 225, 0.64);
    font-family: 'Orbitron', sans-serif;
    font-size: 10px !important;
  }

  .metric-text { margin: 0; color: #cbd5e1; font-size: 13px !important; }

  .meter {
    position: relative;
    height: 14px;
    border: 1px solid rgba(56, 189, 248, 0.25);
    background: rgba(8, 15, 32, 0.8);
  }

  .meter i {
    display: block;
    height: 100%;
    background: linear-gradient(90deg, rgba(56, 189, 248, 0.55), rgba(168, 85, 247, 0.55));
  }

  .meter em {
    position: absolute;
    right: 4px;
    top: 0;
    color: #a5f3fc;
    font: 10px ui-monospace, monospace;
    line-height: 14px;
  }

  .voice-thought {
    border: 1px solid rgba(168, 85, 247, 0.25);
    background: rgba(168, 85, 247, 0.05);
    padding: 10px 12px;
  }

  .voice-thought summary {
    color: #c084fc;
    font-family: 'Orbitron', sans-serif;
    font-size: 10px !important;
    cursor: pointer;
  }

  .voice-thought p { margin: 8px 0 0; color: #cbd5e1; font-size: 13px !important; }

  .candidate-grid {
    display: grid;
    grid-template-columns: repeat(3, minmax(0, 1fr));
    gap: 10px;
  }

  .candidate-card {
    display: grid;
    gap: 6px;
    padding: 12px;
    text-align: left;
    border: 1px solid rgba(56, 189, 248, 0.22);
    background: rgba(8, 15, 32, 0.72);
    color: inherit;
    font: inherit;
    cursor: pointer;
  }

  .candidate-card.selected {
    border-color: rgba(103, 232, 249, 0.8);
    box-shadow: 0 0 18px rgba(56, 189, 248, 0.18);
  }

  .candidate-head { display: flex; justify-content: space-between; align-items: center; }
  .candidate-head b { color: #67e8f9; font-family: 'Orbitron', sans-serif; font-size: 12px !important; }
  .candidate-head i { color: #fcd34d; font-size: 9px !important; font-family: 'Orbitron', sans-serif; font-style: normal; }
  .candidate-direction { margin: 0; color: #94a3b8; font-size: 11px !important; }
  .candidate-reason { margin: 0; color: #cbd5e1; font-size: 12px !important; }
  .candidate-card audio { width: 100%; height: 32px; }

  .refine-row {
    display: grid;
    grid-template-columns: minmax(0, 1fr) auto auto;
    gap: 8px;
  }

  .refine-row input {
    border: 1px solid rgba(56, 189, 248, 0.18);
    background: rgba(2, 6, 23, 0.68);
    color: #cbd5e1;
    padding: 10px 12px;
    font: inherit;
  }

  .refine-row button {
    border: 1px solid rgba(168, 85, 247, 0.36);
    background: rgba(168, 85, 247, 0.08);
    color: #c084fc;
    font-family: 'Orbitron', sans-serif;
    padding: 10px 14px;
    cursor: pointer;
  }

  .refine-row button:disabled { opacity: 0.45; cursor: default; }

  .refine-row .save-btn {
    border-color: rgba(74, 222, 128, 0.4);
    background: rgba(74, 222, 128, 0.08);
    color: #86efac;
  }

  .guard-banner {
    border: 1px solid rgba(248, 113, 113, 0.45);
    background: rgba(248, 113, 113, 0.08);
    color: #fca5a5;
    padding: 10px 12px;
    font-size: 13px !important;
  }

  .guard-banner code { color: #fcd34d; font-family: ui-monospace, monospace; }

  .provider-line { color: #94a3b8; font-size: 11px !important; }
  .provider-line b { color: #a5f3fc; }
  .provider-line i { color: #fcd34d; font-style: normal; }

  .cost-grid b.over-budget { color: #fca5a5; }

  .cost-grid {
    display: grid;
    grid-template-columns: repeat(6, minmax(0, 1fr));
    gap: 8px;
    padding: 12px;
    border: 1px solid rgba(56, 189, 248, 0.18);
    background: rgba(2, 6, 23, 0.5);
  }

  .cost-grid span {
    grid-row: 1;
    color: rgba(148, 163, 184, 0.66);
    font-family: 'Orbitron', sans-serif;
    font-size: 9px !important;
  }

  .cost-grid b {
    grid-row: 2;
    color: #a5f3fc;
    font: 13px ui-monospace, monospace;
  }

  .error-box {
    border: 1px solid rgba(248, 113, 113, 0.4);
    background: rgba(248, 113, 113, 0.08);
    color: #fca5a5;
    padding: 10px 12px;
    font-size: 13px !important;
  }

  .ok-box {
    border: 1px solid rgba(74, 222, 128, 0.35);
    background: rgba(74, 222, 128, 0.06);
    color: #86efac;
    padding: 10px 12px;
    font-size: 13px !important;
  }

  label { display: grid; gap: 6px; color: #94a3b8; font-size: 13px !important; }

  label span {
    font-family: 'Orbitron', sans-serif;
    font-size: 10px !important;
    color: rgba(203, 213, 225, 0.64);
  }

  textarea {
    width: 100%;
    border: 1px solid rgba(56, 189, 248, 0.18);
    background: rgba(2, 6, 23, 0.68);
    color: #cbd5e1;
    padding: 10px 12px;
    font: inherit;
    resize: vertical;
  }

  .history-list { display: grid; gap: 10px; }

  .history-card {
    display: grid;
    grid-template-columns: 120px minmax(0, 1fr);
    gap: 12px;
    padding: 12px;
    border: 1px solid rgba(56, 189, 248, 0.18);
    background: rgba(8, 15, 32, 0.6);
  }

  .history-card.current { border-color: rgba(103, 232, 249, 0.55); }

  .history-side { display: grid; gap: 6px; align-content: start; }
  .history-side img { width: 100%; border: 1px solid rgba(56, 189, 248, 0.2); object-fit: contain; }

  .history-thumb-empty {
    display: grid;
    place-items: center;
    height: 90px;
    border: 1px dashed rgba(100, 116, 139, 0.4);
    color: #64748b;
    font-size: 10px !important;
    font-family: 'Orbitron', sans-serif;
  }

  .history-date { color: #94a3b8; font: 11px ui-monospace, monospace; }

  .history-delete {
    border: 1px solid rgba(248, 113, 113, 0.35);
    background: rgba(248, 113, 113, 0.06);
    color: #fca5a5;
    font-family: 'Orbitron', sans-serif;
    font-size: 10px !important;
    padding: 5px 8px;
    cursor: pointer;
  }

  .history-delete:disabled { opacity: 0.45; cursor: default; }

  .history-body { display: grid; gap: 8px; }

  .history-candidate {
    display: grid;
    gap: 5px;
    padding: 8px 10px;
    border: 1px solid rgba(56, 189, 248, 0.14);
    background: rgba(2, 6, 23, 0.5);
  }

  .history-candidate.adopted { border-color: rgba(74, 222, 128, 0.45); }

  .history-candidate-head { display: flex; align-items: center; gap: 8px; }
  .history-candidate-head b { color: #67e8f9; font-family: 'Orbitron', sans-serif; font-size: 11px !important; }
  .history-candidate-head i { color: #86efac; font-family: 'Orbitron', sans-serif; font-size: 9px !important; font-style: normal; }
  .history-candidate-head span { color: #94a3b8; font-size: 11px !important; }
  .history-candidate audio { width: 100%; height: 30px; }

  .history-candidate details summary,
  .history-profile summary {
    color: rgba(148, 163, 184, 0.75);
    font-family: 'Orbitron', sans-serif;
    font-size: 9px !important;
    cursor: pointer;
  }

  .history-candidate details p { margin: 6px 0 0; color: #cbd5e1; font-size: 12px !important; }
  .history-candidate details .history-reason { color: #94a3b8; }

  .history-profile pre {
    margin: 6px 0 0;
    padding: 8px;
    overflow-x: auto;
    background: rgba(2, 6, 23, 0.7);
    border: 1px solid rgba(56, 189, 248, 0.12);
    color: #a5f3fc;
    font-size: 11px !important;
  }

  @media (max-width: 840px) {
    .upload-row,
    .candidate-grid,
    .refine-row,
    .history-card { grid-template-columns: 1fr; }
    .cost-grid { grid-template-columns: repeat(2, 1fr); }
    .cost-grid span, .cost-grid b { grid-row: auto; }
  }
</style>
