<script lang="ts">
  import { onMount } from 'svelte';

  type AnimeProject = {
    id: string;
    createdAt: string;
    title: string;
    provider: 'mock' | 'grok' | 'vidu' | 'veo' | 'seedream' | 'seedance-2-mini-reference' | 'sora';
    mode: 'image-to-video' | 'text-to-video';
    referenceImage: string;
    prompt: string;
    duration: 3 | 5 | 8;
    aspectRatio: '1:1' | '16:9' | '9:16';
    motionPreset: string;
    status: 'draft' | 'queued' | 'generating' | 'completed' | 'failed';
    videoUrl: string;
  };

  const PROJECTS_KEY = 'anime-lab-projects';
  const MOTION_PRESETS = [
    'blink',
    'breathing',
    'catEarReact',
    'tailCableSway',
    'hudFlicker',
    'slowCameraPush',
    'androidBoot',
  ];

  let activeTab = $state<'animate' | 'motion' | 'clip' | 'ending' | 'queue'>('animate');
  
  // Animate Image form state
  let animateTitle = $state('');
  let animatePrompt = $state('');
  let animateDuration = $state<3 | 5 | 8>(5);
  let animateAspectRatio = $state<'1:1' | '16:9' | '9:16'>('16:9');
  let animateProvider = $state<'mock' | 'grok' | 'vidu' | 'veo' | 'seedream' | 'seedance-2-mini-reference' | 'sora'>('mock');
  let animateMotionPreset = $state('blink');
  let animateReferenceImage = $state('');
  let animateReferenceName = $state('');
  
  let generating = $state(false);
  let errorMessage = $state('');
  let statusMessage = $state('');
  let previewVideoUrl = $state('');
  
  let projects = $state<AnimeProject[]>([]);

  const selectedModelConfig = $derived(
    animateReferenceImage ? 'image-to-video' : 'text-to-video'
  );

  onMount(() => {
    try {
      const saved = localStorage.getItem(PROJECTS_KEY);
      if (saved) projects = JSON.parse(saved) as AnimeProject[];
    } catch {
      projects = [];
    }
  });

  function saveProjects(nextProjects: AnimeProject[]): void {
    projects = nextProjects;
    try {
      localStorage.setItem(PROJECTS_KEY, JSON.stringify(nextProjects));
    } catch {
      // Best effort only; output remains visible in this session.
    }
  }

  function handleReferenceUpload(event: Event): void {
    const file = (event.currentTarget as HTMLInputElement).files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      animateReferenceImage = typeof reader.result === 'string' ? reader.result : '';
      animateReferenceName = file.name;
    };
    reader.readAsDataURL(file);
  }

  function clearReference(): void {
    animateReferenceImage = '';
    animateReferenceName = '';
  }


  async function generateAnimation(): Promise<void> {
    if (generating) return;
    if (!animatePrompt.trim()) {
      errorMessage = 'プロンプトを入力してください。';
      return;
    }

    generating = true;
    errorMessage = '';
    statusMessage = 'キューに追加中...';
    
    try {
      // Create project in draft state
      const projectId = `prj-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
      const newProject: AnimeProject = {
        id: projectId,
        createdAt: new Date().toISOString(),
        title: animateTitle.trim() || 'Untitled',
        provider: animateProvider,
        mode: animateReferenceImage ? 'image-to-video' : 'text-to-video',
        referenceImage: animateReferenceImage,
        prompt: animatePrompt,
        duration: animateDuration,
        aspectRatio: animateAspectRatio,
        motionPreset: animateMotionPreset,
        status: 'queued',
        videoUrl: '',
      };

      saveProjects([newProject, ...projects]);
      statusMessage = 'Mock Provider で処理中...';

      // Simulate generation delay
      await new Promise(resolve => setTimeout(resolve, 1500));

      // Mock provider: Create a data URI with a simple placeholder
      // In production, this would be replaced with actual video generation
      const canvas = document.createElement('canvas');
      canvas.width = animateAspectRatio === '1:1' ? 512 : animateAspectRatio === '16:9' ? 1024 : 576;
      canvas.height = animateAspectRatio === '1:1' ? 512 : animateAspectRatio === '16:9' ? 576 : 1024;
      const ctx = canvas.getContext('2d');
      if (ctx) {
        // Create a simple gradient background
        const gradient = ctx.createLinearGradient(0, 0, canvas.width, canvas.height);
        gradient.addColorStop(0, '#1a1a2e');
        gradient.addColorStop(1, '#16213e');
        ctx.fillStyle = gradient;
        ctx.fillRect(0, 0, canvas.width, canvas.height);
        
        // Add text
        ctx.fillStyle = '#00e5ff';
        ctx.font = 'bold 24px Arial';
        ctx.textAlign = 'center';
        ctx.fillText('MOCK VIDEO GENERATED', canvas.width / 2, canvas.height / 2 - 40);
        ctx.font = '16px Arial';
        ctx.fillStyle = '#8be9ff';
        ctx.fillText(`Duration: ${animateDuration}s`, canvas.width / 2, canvas.height / 2 + 20);
        ctx.fillText(`Motion: ${animateMotionPreset}`, canvas.width / 2, canvas.height / 2 + 50);
      }
      
      const dummyVideoUrl = canvas.toDataURL('image/png');

      const updatedProject: AnimeProject = {
        ...newProject,
        status: 'completed',
        videoUrl: dummyVideoUrl,
      };

      previewVideoUrl = dummyVideoUrl;
      saveProjects(projects.map(p => p.id === projectId ? updatedProject : p));
      statusMessage = '完了！';

      // Clear form
      setTimeout(() => {
        animateTitle = '';
        animatePrompt = '';
        animateDuration = 5;
        animateMotionPreset = 'blink';
        animateReferenceImage = '';
        animateReferenceName = '';
        previewVideoUrl = '';
      }, 1200);
    } catch (error) {
      errorMessage = error instanceof Error ? error.message : String(error);
      statusMessage = '';
    } finally {
      generating = false;
    }
  }

  function loadProject(project: AnimeProject): void {
    animateTitle = project.title;
    animatePrompt = project.prompt;
    animateDuration = project.duration;
    animateAspectRatio = project.aspectRatio;
    animateMotionPreset = project.motionPreset;
    animateProvider = project.provider;
    animateReferenceImage = project.referenceImage;
    animateReferenceName = project.referenceImage ? 'Loaded reference' : '';
    previewVideoUrl = project.videoUrl;
    activeTab = 'animate';
  }

  function deleteProject(id: string): void {
    saveProjects(projects.filter(p => p.id !== id));
  }

  function regenerateProject(project: AnimeProject): void {
    loadProject(project);
    generateAnimation();
  }

  function previewProject(project: AnimeProject): void {
    previewVideoUrl = project.videoUrl;
  }

  function saveProject(project: AnimeProject): void {
    // This could save to a file or backend
    const dataStr = JSON.stringify(project, null, 2);
    const dataBlob = new Blob([dataStr], { type: 'application/json' });
    const url = URL.createObjectURL(dataBlob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `${project.id}.json`;
    link.click();
    URL.revokeObjectURL(url);
  }

</script>

<svelte:head>
  <title>ANIME LAB | AI VTuber</title>
</svelte:head>

<div class="anime-lab">
  <header class="lab-header">
    <a href="/">AI VTuber</a>
    <div>
      <p>STUDIO / ANIMATION TOOL</p>
      <h1>ANIME LAB</h1>
    </div>
    <div class="tabs">
      <button
        class:active={activeTab === 'animate'}
        onclick={() => { activeTab = 'animate'; }}
      >
        🎬 Animate Image
      </button>
      <button
        class:active={activeTab === 'motion'}
        onclick={() => { activeTab = 'motion'; }}
      >
        🎭 Motion Test
      </button>
      <button
        class:active={activeTab === 'clip'}
        onclick={() => { activeTab = 'clip'; }}
      >
        📽️ Story Clip
      </button>
      <button
        class:active={activeTab === 'ending'}
        onclick={() => { activeTab = 'ending'; }}
      >
        🎞️ Ending Maker
      </button>
      <button
        class:active={activeTab === 'queue'}
        onclick={() => { activeTab = 'queue'; }}
      >
        📊 Render Queue
      </button>
    </div>
  </header>

  <main>
    <!-- Animate Image Tab -->
    {#if activeTab === 'animate'}
      <section class="animate-panel">
        <div class="panel-head">
          <h2>🎥 Animate Image</h2>
        </div>

        <div class="form-group">
          <label>
            <span>Title</span>
            <input bind:value={animateTitle} placeholder="Shot title..." />
          </label>
        </div>

        <div class="form-group">
          <label>
            <span>Prompt</span>
            <textarea
              bind:value={animatePrompt}
              rows="8"
              placeholder="ミケが夜の研究室で振り返り、耳アンテナを淡く光らせながら微笑む。ゆっくりドリーイン。"
            ></textarea>
          </label>
        </div>

        <div class="form-grid">
          <label>
            <span>Duration</span>
            <select bind:value={animateDuration}>
              <option value={3}>3 seconds</option>
              <option value={5}>5 seconds</option>
              <option value={8}>8 seconds</option>
            </select>
          </label>

          <label>
            <span>Aspect Ratio</span>
            <select bind:value={animateAspectRatio}>
              <option value="1:1">1:1 (Square)</option>
              <option value="16:9">16:9 (Wide)</option>
              <option value="9:16">9:16 (Tall)</option>
            </select>
          </label>

          <label>
            <span>Provider</span>
            <select bind:value={animateProvider}>
              <option value="mock">Mock (Testing)</option>
              <option value="grok">Grok</option>
              <option value="vidu">Vidu</option>
              <option value="veo">Veo</option>
              <option value="seedream">SeedDream</option>
              <option value="seedance-2-mini-reference">Seedance 2.0 Mini Reference to Video</option>
              <option value="sora">Sora 2 Video Engine</option>
            </select>
          </label>

          <label>
            <span>Motion Preset</span>
            <select bind:value={animateMotionPreset}>
              {#each MOTION_PRESETS as preset}
                <option value={preset}>{preset}</option>
              {/each}
            </select>
          </label>
        </div>

        <div class="reference-box">
          <div>
            <span>Reference Image</span>
            <strong>{animateReferenceName || '(Optional)'}</strong>
          </div>
          <label class="upload-button">
            📤 UPLOAD
            <input type="file" accept="image/*" onchange={handleReferenceUpload} />
          </label>
          {#if animateReferenceImage}
            <button class="ghost" onclick={clearReference}>✕ CLEAR</button>
          {/if}
        </div>

        {#if animateReferenceImage}
          <img class="reference-preview" src={animateReferenceImage} alt="Reference" />
        {/if}

        {#if errorMessage}
          <div class="error">{errorMessage}</div>
        {/if}
        {#if statusMessage}
          <div class="status">{statusMessage}</div>
        {/if}

        <div class="actions">
          <button
            class="primary"
            onclick={generateAnimation}
            disabled={generating}
          >
            {generating ? '⏳ Processing...' : '🎥 Animate'}
          </button>
        </div>

        {#if previewVideoUrl}
          <div class="preview-section">
            <h3>Preview</h3>
            <img src={previewVideoUrl} alt="Animation preview" class="preview-image" />
          </div>
        {/if}
      </section>
    {/if}

    <!-- Motion Test Tab -->
    {#if activeTab === 'motion'}
      <section class="tab-placeholder">
        <div class="panel-head">
          <h2>🎭 Motion Test</h2>
        </div>
        <div class="empty-state">
          <p>Motion library preview and testing tools coming soon.</p>
        </div>
      </section>
    {/if}

    <!-- Story Clip Tab -->
    {#if activeTab === 'clip'}
      <section class="tab-placeholder">
        <div class="panel-head">
          <h2>📽️ Story Clip</h2>
        </div>
        <div class="empty-state">
          <p>Story-based clip generation tools coming soon.</p>
        </div>
      </section>
    {/if}

    <!-- Ending Maker Tab -->
    {#if activeTab === 'ending'}
      <section class="tab-placeholder">
        <div class="panel-head">
          <h2>🎞️ Ending Maker</h2>
        </div>
        <div class="empty-state">
          <p>Ending sequence creation tools coming soon.</p>
        </div>
      </section>
    {/if}

    <!-- Render Queue Tab -->
    {#if activeTab === 'queue'}
      <section class="queue-panel">
        <div class="panel-head">
          <h2>📊 Render Queue</h2>
          <span class="count">({projects.length})</span>
        </div>

        {#if projects.length === 0}
          <div class="empty-state">
            <p>Render queue is empty. Create a project in Animate Image tab.</p>
          </div>
        {:else}
          <div class="project-list">
            {#each projects as project (project.id)}
              <article class="project-card">
                {#if project.videoUrl}
                  <div class="thumbnail">
                    <img src={project.videoUrl} alt="Thumbnail" />
                  </div>
                {:else}
                  <div class="thumbnail empty-thumb">
                    <span>📹</span>
                  </div>
                {/if}

                <div class="project-info">
                  <h4>{project.title}</h4>
                  <div class="meta">
                    <span><strong>Provider:</strong> {project.provider}</span>
                    <span><strong>Duration:</strong> {project.duration}s</span>
                    <span><strong>Status:</strong> <code class={`status-${project.status}`}>{project.status}</code></span>
                    <span><strong>Aspect:</strong> {project.aspectRatio}</span>
                    <span><strong>Motion:</strong> {project.motionPreset}</span>
                  </div>
                  <p class="prompt">{project.prompt}</p>
                  <span class="timestamp">{new Date(project.createdAt).toLocaleString('ja-JP')}</span>
                </div>

                <div class="project-actions">
                  <button onclick={() => previewProject(project)} title="Preview">
                    ▶
                  </button>
                  <button onclick={() => regenerateProject(project)} title="Regenerate">
                    🔄
                  </button>
                  <button onclick={() => saveProject(project)} title="Save">
                    💾
                  </button>
                  <button class="danger" onclick={() => deleteProject(project.id)} title="Delete">
                    🗑
                  </button>
                </div>
              </article>
            {/each}
          </div>

          {#if previewVideoUrl}
            <div class="queue-preview">
              <h3>Preview</h3>
              <img src={previewVideoUrl} alt="Animation preview" class="preview-image" />
            </div>
          {/if}
        {/if}
      </section>
    {/if}
  </main>
</div>

<style>
  :global(body) {
    margin: 0;
    background: #05070d;
    color: #e8eef8;
    font-family: "Segoe UI", system-ui, sans-serif;
  }

  .anime-lab {
    min-height: 100vh;
    padding: 22px;
    background:
      radial-gradient(circle at 28% 0%, rgba(0, 229, 255, .14), transparent 32%),
      linear-gradient(135deg, #05070d 0%, #101522 54%, #061118 100%);
  }

  .lab-header {
    max-width: 1400px;
    margin: 0 auto 24px;
    display: grid;
    grid-template-columns: 1fr 2fr 2fr;
    align-items: end;
    gap: 24px;
  }

  .lab-header a {
    color: #8be9ff;
    font-size: 11px;
    font-weight: 800;
    text-decoration: none;
  }

  .lab-header > div:nth-child(2) { text-align: center; }
  .lab-header p, .lab-header h1 { margin: 0; }
  .lab-header p {
    color: #f6c453;
    font-size: 10px;
    font-weight: 900;
    letter-spacing: .18em;
  }
  .lab-header h1 {
    margin-top: 4px;
    font-size: 34px;
    letter-spacing: .04em;
  }

  .tabs {
    display: flex;
    gap: 8px;
    flex-wrap: wrap;
  }

  .tabs button {
    padding: 8px 14px;
    border: 1px solid rgba(148, 163, 184, .25);
    border-radius: 6px;
    background: rgba(9, 14, 24, .6);
    color: #8ba3bd;
    font-size: 11px;
    font-weight: 700;
    cursor: pointer;
    transition: all 0.2s;
  }

  .tabs button:hover {
    border-color: rgba(148, 163, 184, .45);
    color: #e8eef8;
  }

  .tabs button.active {
    border-color: rgba(246, 196, 83, .5);
    background: rgba(246, 196, 83, .15);
    color: #fde68a;
  }

  main {
    max-width: 1400px;
    margin: 0 auto;
  }

  .animate-panel,
  .queue-panel,
  .tab-placeholder {
    border: 1px solid rgba(148, 163, 184, .18);
    border-radius: 10px;
    background: rgba(9, 14, 24, .86);
    box-shadow: 0 20px 70px rgba(0, 0, 0, .28);
    padding: 24px;
  }

  .panel-head {
    display: flex;
    align-items: center;
    gap: 10px;
    margin-bottom: 20px;
    border-bottom: 1px solid rgba(148, 163, 184, .12);
    padding-bottom: 12px;
  }

  .panel-head h2 {
    margin: 0;
    font-size: 18px;
    flex: 1;
  }

  .panel-head .count {
    color: #8ba3bd;
    font-size: 12px;
  }

  .form-group {
    margin-bottom: 18px;
  }

  .form-grid {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(180px, 1fr));
    gap: 16px;
    margin-bottom: 18px;
  }

  label {
    display: grid;
    gap: 6px;
  }

  label span {
    color: #8ba3bd;
    font-size: 10px;
    font-weight: 900;
    letter-spacing: .08em;
    text-transform: uppercase;
  }

  input,
  textarea,
  select,
  button,
  .upload-button {
    box-sizing: border-box;
    border: 1px solid rgba(148, 163, 184, .22);
    border-radius: 6px;
    background: #060a12;
    color: #e8eef8;
    font: inherit;
  }

  input,
  textarea,
  select {
    width: 100%;
    padding: 9px 10px;
  }

  textarea { resize: vertical; line-height: 1.55; }

  button,
  .upload-button {
    padding: 9px 12px;
    color: #8be9ff;
    font-size: 11px;
    font-weight: 900;
    cursor: pointer;
  }

  button:disabled {
    opacity: .45;
    cursor: not-allowed;
  }

  button.primary {
    width: 100%;
    padding: 12px;
    border-color: rgba(246, 196, 83, .42);
    color: #fde68a;
    background: rgba(246, 196, 83, .12);
    font-size: 13px;
    margin-top: 12px;
  }

  button.ghost { color: #aebdd0; }
  button.danger { color: #fb7185; }

  .reference-box {
    margin: 18px 0;
    display: grid;
    grid-template-columns: 1fr auto auto;
    gap: 8px;
    align-items: center;
    padding: 10px;
    border: 1px solid rgba(148, 163, 184, .14);
    border-radius: 8px;
    background: rgba(2, 6, 14, .48);
  }

  .reference-box strong {
    display: block;
    margin-top: 3px;
    color: #e8eef8;
    font-size: 12px;
    overflow-wrap: anywhere;
  }

  .upload-button {
    position: relative;
    display: inline-grid;
    place-items: center;
  }

  .upload-button input {
    position: absolute;
    inset: 0;
    opacity: 0;
    cursor: pointer;
  }

  .reference-preview {
    width: 100%;
    max-height: 300px;
    margin: 12px 0 0 0;
    border: 1px solid rgba(148, 163, 184, .18);
    border-radius: 8px;
    background: #020617;
    object-fit: contain;
  }

  .error,
  .status {
    margin: 12px 0;
    padding: 10px;
    border-radius: 7px;
    font-size: 12px;
  }

  .error {
    color: #fecdd3;
    background: rgba(244, 63, 94, .12);
  }

  .status {
    color: #fde68a;
    background: rgba(246, 196, 83, .1);
  }

  .actions {
    margin: 20px 0;
  }

  .preview-section {
    margin-top: 24px;
    padding-top: 24px;
    border-top: 1px solid rgba(148, 163, 184, .12);
  }

  .preview-section h3 {
    margin: 0 0 12px 0;
    font-size: 14px;
  }

  .preview-section video,
  .queue-preview video {
    width: 100%;
    max-height: 500px;
    border: 1px solid rgba(148, 163, 184, .16);
    border-radius: 9px;
    background: #020617;
  }

  .preview-image {
    width: 100%;
    max-height: 500px;
    border: 1px solid rgba(148, 163, 184, .16);
    border-radius: 9px;
    background: #020617;
    display: block;
  }

  .empty-state {
    padding: 60px 24px;
    text-align: center;
    color: #8ba3bd;
  }

  .empty-state p {
    margin: 0;
    font-size: 14px;
  }

  .project-list {
    display: grid;
    gap: 12px;
  }

  .project-card {
    display: grid;
    grid-template-columns: 120px 1fr auto;
    gap: 16px;
    padding: 12px;
    border: 1px solid rgba(148, 163, 184, .14);
    border-radius: 8px;
    background: rgba(2, 6, 14, .45);
    align-items: start;
  }

  .thumbnail {
    width: 120px;
    aspect-ratio: 16 / 9;
    border-radius: 6px;
    background: #020617;
    overflow: hidden;
  }

  .thumbnail img {
    width: 100%;
    height: 100%;
    object-fit: cover;
  }

  .thumbnail video {
    width: 100%;
    height: 100%;
    object-fit: cover;
  }

  .empty-thumb {
    display: grid;
    place-items: center;
    font-size: 32px;
  }

  .project-info h4 {
    margin: 0 0 8px 0;
    font-size: 13px;
  }

  .meta {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(150px, 1fr));
    gap: 8px;
    margin-bottom: 8px;
    font-size: 11px;
  }

  .meta span {
    color: #8ba3bd;
  }

  .meta strong {
    color: #e8eef8;
    font-weight: 600;
  }

  .status-draft { color: #aebdd0; }
  .status-queued { color: #fde68a; }
  .status-generating { color: #fb923c; }
  .status-completed { color: #86efac; }
  .status-failed { color: #fb7185; }

  .prompt {
    margin: 8px 0;
    color: #cbd5e1;
    font-size: 12px;
    line-height: 1.5;
    max-height: 60px;
    overflow: hidden;
    text-overflow: ellipsis;
    display: -webkit-box;
    -webkit-line-clamp: 3;
    -webkit-box-orient: vertical;
  }

  .timestamp {
    display: block;
    color: #64748b;
    font-size: 10px;
    margin-top: 4px;
  }

  .project-actions {
    display: grid;
    grid-template-columns: repeat(4, 32px);
    gap: 4px;
    align-content: start;
  }

  .project-actions button {
    padding: 6px;
    font-size: 14px;
    line-height: 1;
    border-radius: 4px;
    background: rgba(148, 163, 184, .08);
  }

  .project-actions button:hover {
    background: rgba(148, 163, 184, .18);
  }

  .queue-preview {
    margin-top: 24px;
    padding-top: 24px;
    border-top: 1px solid rgba(148, 163, 184, .12);
  }

  .queue-preview h3 {
    margin: 0 0 12px 0;
    font-size: 14px;
  }

  @media (max-width: 1200px) {
    .lab-header {
      grid-template-columns: 1fr;
      gap: 12px;
    }
    .lab-header > div:nth-child(2) { text-align: left; }
    .tabs { justify-content: flex-start; }
  }

  @media (max-width: 768px) {
    .animate-panel,
    .queue-panel,
    .tab-placeholder {
      padding: 16px;
    }

    .form-grid {
      grid-template-columns: 1fr;
    }

    .project-card {
      grid-template-columns: 1fr;
      gap: 12px;
    }

    .project-actions {
      grid-template-columns: repeat(4, 1fr);
    }

    .meta {
      grid-template-columns: 1fr;
    }
  }
</style>
