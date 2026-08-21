<script lang="ts">
  type AnimationImage = { id: string; name: string; dataUrl: string };
  type ImageClassification = { index: number; category: 'character_reference' | 'world_setting' | 'background'; reason: string };
  type ChatMessage = {
    id: string;
    role: 'user' | 'assistant';
    text: string;
    images?: AnimationImage[];
    classifications?: ImageClassification[];
    videoUrl?: string;
  };

  const categoryLabel: Record<ImageClassification['category'], string> = {
    character_reference: 'キャラ資料',
    world_setting: '世界観',
    background: '背景',
  };

  const VIDEO_MODEL_OPTIONS = [
    { id: 'gemini-omni-flash-reference', label: 'Gemini Omni Flash Reference', videoMode: 'production', enabled: true },
    { id: 'gemini-omni-flash-image', label: 'Gemini Omni Flash Image', videoMode: 'production', enabled: true },
    { id: 'gemini-omni-flash-edit', label: 'Gemini Omni Flash Edit', videoMode: 'production', enabled: true },
    { id: 'seedance-2-mini-reference', label: 'Seedance2 Mini（実験用）', videoMode: 'draft', enabled: true },
    { id: 'seedance-2-reference', label: 'Seedance2（本番）', videoMode: 'production', enabled: true },
    { id: 'sora-2-i2v', label: 'Sora2', videoMode: 'production', enabled: true },
    { id: 'kling-1-6-placeholder', label: 'Kling 1.6', videoMode: 'production', enabled: false },
    { id: 'kling-elements-placeholder', label: 'Kling Elements', videoMode: 'production', enabled: false },
  ];

  let messages = $state<ChatMessage[]>([]);
  let images = $state<AnimationImage[]>([]);
  let instruction = $state('');
  let manualMotionPrompt = $state('');
  let modelId = $state('seedance-2-mini-reference');
  let generating = $state(false);
  let status = $state('');
  let fileInput = $state<HTMLInputElement>();

  function readFile(file: File): Promise<string> {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(typeof reader.result === 'string' ? reader.result : '');
      reader.onerror = () => reject(reader.error ?? new Error(`Unable to read ${file.name}`));
      reader.readAsDataURL(file);
    });
  }

  async function addImages(event: Event): Promise<void> {
    const input = event.currentTarget as HTMLInputElement;
    const files = Array.from(input.files ?? []).filter((file) => file.type.startsWith('image/'));
    input.value = '';
    const room = Math.max(0, 9 - images.length);
    const loaded = await Promise.all(files.slice(0, room).map(async (file) => ({
      id: `${file.name}-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      name: file.name,
      dataUrl: await readFile(file),
    })));
    images = [...images, ...loaded];
  }

  function removeImage(id: string): void {
    images = images.filter((image) => image.id !== id);
  }

  function responseError(statusCode: number, body: string): Error {
    return new Error(`HTTP: ${statusCode}\n${body || '(empty response body)'}`);
  }

  async function generateAnimation(): Promise<void> {
    const selectedModel = VIDEO_MODEL_OPTIONS.find((model) => model.id === modelId);
    const userInstruction = instruction.trim();
    if (!selectedModel?.enabled || !userInstruction || images.length === 0 || generating) return;

    const sourceImages = images;
    messages = [...messages, { id: `user-${Date.now()}`, role: 'user', text: userInstruction, images: sourceImages }];
    instruction = '';
    generating = true;
    status = '画像を分析してMotion Promptを作成しています…';
    try {
      const analysisResponse = await fetch('/api/animation-chat', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          instruction: userInstruction,
          motionPrompt: manualMotionPrompt,
          images: sourceImages.map((image) => image.dataUrl),
        }),
      });
      const analysisBody = await analysisResponse.text();
      if (!analysisResponse.ok) throw responseError(analysisResponse.status, analysisBody);
      const analysis = JSON.parse(analysisBody) as { classifications: ImageClassification[]; motionPrompt: string };

      status = `${selectedModel.label}で動画を生成しています…`;
      const isSingleImage = selectedModel.id === 'sora-2-i2v' || selectedModel.id === 'gemini-omni-flash-image';
      const videoResponse = await fetch('/api/video', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          modelId: selectedModel.id,
          videoMode: selectedModel.videoMode,
          ...(isSingleImage
            ? { imageUrl: sourceImages[0]?.dataUrl ?? '' }
            : { imageUrls: sourceImages.map((image) => image.dataUrl) }),
          prompt: analysis.motionPrompt,
          duration: 5,
        }),
      });
      const videoBody = await videoResponse.text();
      if (!videoResponse.ok) throw responseError(videoResponse.status, videoBody);
      const video = JSON.parse(videoBody) as { url?: string };
      if (!video.url) throw new Error('No video URL returned.');
      messages = [...messages, {
        id: `assistant-${Date.now()}`,
        role: 'assistant',
        text: `Motion Prompt:\n${analysis.motionPrompt}`,
        classifications: analysis.classifications,
        videoUrl: video.url,
      }];
      status = '';
    } catch (caughtError) {
      const message = caughtError instanceof Error ? caughtError.message : String(caughtError);
      console.error('[AI_ANIMATION_CHAT_ERROR]', message);
      status = message;
    } finally {
      generating = false;
    }
  }
</script>

<section class="animation-chat">
  <header><div><p>AI Animation Chat</p><h1>画像と自然文から短編アニメを作る</h1></div></header>
  <div class="messages" aria-live="polite">
    {#if messages.length === 0}
      <p class="empty">最大9枚の資料画像と、作りたい動きを入力してください。</p>
    {/if}
    {#each messages as message (message.id)}
      <article class:user={message.role === 'user'} class:assistant={message.role === 'assistant'}>
        <span class="role">{message.role === 'user' ? 'あなた' : 'AI Animation'}</span>
        <p>{message.text}</p>
        {#if message.images}
          <div class="message-images">{#each message.images as image (image.id)}<img src={image.dataUrl} alt={image.name} />{/each}</div>
        {/if}
        {#if message.classifications}
          <ul>{#each message.classifications as item (item.index)}<li>画像 {item.index + 1}: {categoryLabel[item.category]} — {item.reason}</li>{/each}</ul>
        {/if}
        {#if message.videoUrl}
          <div class="video-preview"><video controls src={message.videoUrl}><track kind="captions" srclang="ja" label="Japanese" src="/mock/captions.vtt" /></video><a href={message.videoUrl} download>ダウンロード</a></div>
        {/if}
      </article>
    {/each}
  </div>

  <form onsubmit={(event) => { event.preventDefault(); generateAnimation(); }}>
    <div class="image-upload">
      <input bind:this={fileInput} type="file" accept="image/*" multiple onchange={addImages} hidden />
      <button type="button" onclick={() => fileInput?.click()} disabled={images.length >= 9}>資料画像を追加</button>
      <span>{images.length}/9</span>
      {#each images as image (image.id)}
        <figure><img src={image.dataUrl} alt={image.name} /><button type="button" aria-label={`${image.name}を削除`} onclick={() => removeImage(image.id)}>×</button></figure>
      {/each}
    </div>
    <textarea bind:value={instruction} placeholder="例: シロとミケが夕暮れの街を歩き、こちらを見て手を振る。" disabled={generating}></textarea>
    <textarea bind:value={manualMotionPrompt} placeholder="任意: Motion Promptを指定する場合のみ入力" disabled={generating}></textarea>
    <div class="controls"><select bind:value={modelId} disabled={generating}>{#each VIDEO_MODEL_OPTIONS as model (model.id)}<option value={model.id} disabled={!model.enabled}>{model.label}</option>{/each}</select><button type="submit" disabled={generating || images.length === 0 || !instruction.trim()}>{generating ? '生成中…' : 'アニメを作る'}</button></div>
  </form>
  {#if status}<p class="status">{status}</p>{/if}
</section>

<style>
  .animation-chat { display: grid; gap: 14px; max-width: 760px; margin: 24px auto; padding: 16px; color: #e2e8f0; border: 1px solid #334155; border-radius: 14px; background: #0f172a; }
  h1, p { margin: 0; } header p, .role { color: #7dd3fc; font-size: 12px; font-weight: 700; } h1 { margin-top: 3px; font-size: 20px; } .messages, form { display: grid; gap: 10px; } .empty { color: #94a3b8; } article { display: grid; gap: 7px; padding: 10px; border-radius: 10px; background: #1e293b; } article.user { margin-left: 8%; } article.assistant { margin-right: 8%; background: #172554; } article p { white-space: pre-wrap; line-height: 1.5; } ul { margin: 0; padding-left: 18px; color: #bae6fd; font-size: 12px; } .message-images, .image-upload { display: flex; flex-wrap: wrap; align-items: center; gap: 7px; } .message-images img, figure img { width: 58px; height: 58px; object-fit: cover; border-radius: 6px; } figure { position: relative; margin: 0; } figure button { position: absolute; top: -6px; right: -6px; width: 20px; height: 20px; padding: 0; border-radius: 50%; background: #b91c1c; } textarea, select, button { box-sizing: border-box; border: 1px solid #475569; border-radius: 7px; padding: 8px; color: #f8fafc; background: #1e293b; font: inherit; } textarea { width: 100%; min-height: 72px; resize: vertical; } button { cursor: pointer; } button:disabled, select:disabled, textarea:disabled { cursor: not-allowed; opacity: .5; } .controls { display: flex; justify-content: space-between; gap: 8px; } .controls button { background: #0369a1; } .video-preview { display: grid; justify-items: center; gap: 7px; } .video-preview video { width: 100%; max-width: 420px; height: auto; border-radius: 10px; background: #020617; } .video-preview a { color: #7dd3fc; font-size: 12px; } .status { white-space: pre-wrap; color: #fde68a; font-size: 12px; }
</style>
