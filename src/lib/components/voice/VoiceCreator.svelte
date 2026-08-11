<script lang="ts">
  import { onDestroy, onMount } from 'svelte';

  type CreatorState = 'idle' | 'submitting' | 'queued' | 'running' | 'completed' | 'failed';
  type SeedBackend = 'kizuna' | 'qwen';
  type KizunaJob = {
    job_id?: string;
    project_id?: string;
    status?: string;
    stage?: string;
    stage_label?: string;
    progress?: { current?: number; total?: number; detail?: string };
    result?: { error?: string };
  };

  let styleInstruction = $state('');
  let seedVoiceBackend = $state<SeedBackend>('kizuna');
  let computeTarget = $state('auto');
  let backendOnline = $state(false);
  let healthChecked = $state(false);
  let creatorState = $state<CreatorState>('idle');
  let stageLabel = $state('');
  let errorMessage = $state('');
  let jobId = $state('');
  let projectId = $state('');
  let audioUrl = $state('');
  let pollTimer: ReturnType<typeof setTimeout> | null = null;
  let healthTimer: ReturnType<typeof setInterval> | null = null;

  const busy = $derived(creatorState === 'submitting' || creatorState === 'queued' || creatorState === 'running');
  const canSubmit = $derived(backendOnline && !busy && Boolean(styleInstruction.trim()));

  function stateMessage() {
    if (creatorState === 'submitting') return '声の設計を解析しています...';
    if (creatorState === 'queued') return stageLabel || '生成ジョブを待機しています...';
    if (creatorState === 'running') return stageLabel || '種音声を生成しています...';
    if (creatorState === 'completed') return '完了しました';
    if (creatorState === 'failed') return 'エラーが発生しました';
    return '声の説明を入力してください';
  }

  async function checkHealth() {
    try {
      const response = await fetch('/api/voice/kizuna/health', { cache: 'no-store' });
      const data = await response.json().catch(() => ({}));
      backendOnline = response.ok && data?.online === true;
    } catch {
      backendOnline = false;
    } finally {
      healthChecked = true;
    }
  }

  function stopPolling() {
    if (pollTimer) clearTimeout(pollTimer);
    pollTimer = null;
  }

  async function pollJob() {
    if (!jobId) return;
    try {
      const response = await fetch(`/api/voice/kizuna/jobs/${encodeURIComponent(jobId)}`, { cache: 'no-store' });
      const job = (await response.json().catch(() => ({}))) as KizunaJob & { detail?: string };
      if (!response.ok) throw new Error(job.detail || `job status failed (${response.status})`);
      stageLabel = job.stage_label?.trim() || job.progress?.detail?.trim() || '';
      projectId = job.project_id?.trim() || projectId;
      if (job.status === 'completed') {
        creatorState = 'completed';
        audioUrl = `/api/voice/kizuna/projects/${encodeURIComponent(projectId)}/preview-audio?t=${Date.now()}`;
        stopPolling();
        return;
      }
      if (job.status === 'failed') {
        creatorState = 'failed';
        errorMessage = job.result?.error || stageLabel || '種音声の生成に失敗しました';
        stopPolling();
        return;
      }
      creatorState = job.status === 'running' ? 'running' : 'queued';
      pollTimer = setTimeout(pollJob, 2_000);
    } catch (error) {
      creatorState = 'failed';
      errorMessage = error instanceof Error ? error.message : 'ジョブ状態を取得できませんでした';
      stopPolling();
    }
  }

  async function createSeedVoice() {
    if (!canSubmit) return;
    stopPolling();
    creatorState = 'submitting';
    stageLabel = '';
    errorMessage = '';
    audioUrl = '';
    jobId = '';
    projectId = '';
    try {
      const response = await fetch('/api/voice/kizuna/quick-start', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          style_instruction: styleInstruction.trim(),
          seed_voice_backend: seedVoiceBackend,
          compute_target: computeTarget,
        }),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data?.detail || `quick-start failed (${response.status})`);
      jobId = String(data?.job?.job_id ?? '').trim();
      projectId = String(data?.project?.project_id ?? data?.job?.project_id ?? '').trim();
      if (!jobId || !projectId) throw new Error('Kizuna backendからjob情報を取得できませんでした');
      creatorState = data?.job?.status === 'running' ? 'running' : 'queued';
      stageLabel = String(data?.job?.stage_label ?? '').trim();
      await pollJob();
    } catch (error) {
      creatorState = 'failed';
      errorMessage = error instanceof Error ? error.message : '種音声の作成に失敗しました';
    }
  }

  onMount(() => {
    void checkHealth();
    healthTimer = setInterval(() => void checkHealth(), 30_000);
  });

  onDestroy(() => {
    stopPolling();
    if (healthTimer) clearInterval(healthTimer);
  });
</script>

<section class="creator" aria-labelledby="voice-creator-title">
  <header>
    <div>
      <p class="eyebrow">KIZUNA VOICE STUDIO / FASTAPI</p>
      <h2 id="voice-creator-title">VOICE CREATOR</h2>
      <p>日本語で声の特徴を指定し、種音声を作成・試聴します。</p>
    </div>
    <div class:offline={!backendOnline} class="backend-state">
      <i></i>{healthChecked ? (backendOnline ? 'ONLINE' : 'OFFLINE') : 'CHECKING'}
    </div>
  </header>

  <div class="creator-grid">
    <div class="form-area">
      <label>
        <span>声の説明</span>
        <textarea bind:value={styleInstruction} rows="5" placeholder="透明感のある若い女性の声。少し眠そうで、感情を表に出しすぎない。話す速度はゆっくり。高音すぎず柔らかい声。"></textarea>
      </label>
      <div class="fields">
        <label>
          <span>Seed Voice Backend</span>
          <select bind:value={seedVoiceBackend}>
            <option value="kizuna">Kizuna Voice Designer</option>
            <option value="qwen">Qwen Voice Designer</option>
          </select>
        </label>
        <label><span>Model Family</span><input value="piper" readonly /></label>
        <label><span>Compute Target</span><select bind:value={computeTarget}><option value="auto">auto</option></select></label>
      </div>
      <button class="create-button" onclick={createSeedVoice} disabled={!canSubmit}>
        {busy ? '作成中...' : '種音声を作成'}
      </button>
      {#if healthChecked && !backendOnline}<p class="offline-copy">Kizuna Voice backendが起動していません</p>{/if}
    </div>

    <aside class="progress-area" aria-live="polite">
      <span class="state-tag">{creatorState.toUpperCase()}</span>
      <strong>{stateMessage()}</strong>
      {#if busy}<div class="progress-track"><span></span></div>{/if}
      {#if jobId}<small>JOB {jobId}</small>{/if}
      {#if errorMessage}<p class="error">{errorMessage}</p>{/if}
      {#if audioUrl}
        <div class="preview">
          <span>SEED VOICE PREVIEW</span>
          <audio src={audioUrl} controls preload="metadata"></audio>
        </div>
      {/if}
    </aside>
  </div>
</section>

<style>
  .creator { margin-top: 22px; padding: 22px; border: 1px solid rgba(56,189,248,.32); border-radius: 6px; background: linear-gradient(135deg,rgba(5,14,28,.97),rgba(7,20,34,.94)); box-shadow: 0 0 28px rgba(14,165,233,.08); }
  header { display:flex; justify-content:space-between; gap:20px; align-items:flex-start; padding-bottom:16px; border-bottom:1px solid rgba(56,189,248,.16); }
  h2 { margin:2px 0 4px; color:#e0f2fe; font:800 22px/1 Orbitron,sans-serif; letter-spacing:.12em; }
  header p { margin:0; color:#7dd3fc; font:500 13px Rajdhani,sans-serif; }
  .eyebrow { color:#38bdf8; font-size:10px; letter-spacing:.18em; }
  .backend-state { display:flex; align-items:center; gap:7px; color:#86efac; font:700 11px Orbitron,sans-serif; }
  .backend-state i { width:8px; height:8px; border-radius:50%; background:#22c55e; box-shadow:0 0 10px #22c55e; }
  .backend-state.offline { color:#fca5a5; }.backend-state.offline i { background:#ef4444; box-shadow:0 0 10px #ef4444; }
  .creator-grid { display:grid; grid-template-columns:minmax(0,1.4fr) minmax(280px,.6fr); gap:22px; padding-top:18px; }
  label { display:grid; gap:6px; } label span,.preview>span { color:#7dd3fc; font:700 11px Orbitron,sans-serif; letter-spacing:.06em; }
  textarea,input,select { box-sizing:border-box; width:100%; padding:10px 12px; color:#e2e8f0; border:1px solid rgba(56,189,248,.24); border-radius:3px; outline:none; background:rgba(2,8,18,.84); font:500 14px Rajdhani,sans-serif; }
  textarea:focus,input:focus,select:focus { border-color:#38bdf8; box-shadow:0 0 0 2px rgba(56,189,248,.1); }
  .fields { display:grid; grid-template-columns:1.4fr .7fr .7fr; gap:10px; margin-top:12px; }
  .create-button { width:100%; margin-top:14px; padding:12px; color:#00101b; border:0; border-radius:3px; background:linear-gradient(90deg,#22d3ee,#38bdf8); font:800 13px Orbitron,sans-serif; cursor:pointer; }
  .create-button:disabled { cursor:not-allowed; opacity:.35; }
  .offline-copy,.error { color:#fca5a5; font-size:12px; }
  .progress-area { display:flex; min-height:170px; flex-direction:column; justify-content:center; gap:12px; padding:18px; border:1px solid rgba(56,189,248,.14); background:rgba(2,8,18,.55); }
  .state-tag { width:max-content; padding:3px 7px; color:#67e8f9; border:1px solid rgba(34,211,238,.28); font:700 9px Orbitron,sans-serif; }
  .progress-area strong { color:#e0f2fe; font:700 16px Rajdhani,sans-serif; }.progress-area small { overflow-wrap:anywhere; color:#64748b; }
  .progress-track { height:3px; overflow:hidden; background:rgba(56,189,248,.14); }.progress-track span { display:block; width:45%; height:100%; background:#22d3ee; animation:scan 1.25s ease-in-out infinite; }
  .preview { display:grid; gap:8px; margin-top:4px; }.preview audio { width:100%; height:34px; }
  @keyframes scan { from{transform:translateX(-110%)} to{transform:translateX(230%)} }
  @media(max-width:850px){.creator-grid{grid-template-columns:1fr}.fields{grid-template-columns:1fr}header{flex-direction:column}}
</style>
