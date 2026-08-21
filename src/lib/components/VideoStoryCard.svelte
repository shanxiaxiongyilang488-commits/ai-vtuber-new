<script lang="ts">
  import UnifiedStoryCard from './UnifiedStoryCard.svelte';
  import CharacterPresetManager from './CharacterPresetManager.svelte';
  import type { VideoPackage } from '../../core/videoPackageCore';
	import type { PanelBounds, StoryScene } from '../../core/sceneTimeline';
  import { videoPackagePrompt } from '../../core/videoPackageCore';
  import { getVideoProductionMediaEntries, resolveVideoProductionImageReference, storeVideoProductionData, storeVideoProductionImage, toVideoProductionImageReference, type VideoProductionMediaEntry } from '$lib/videoProductionStorage';
  import { VIDEO_MODELS } from '$lib/config/videoModels';
	import { motionPromptFromTimeline } from '$lib/animationSheetMotionPrompt';
	import { classifyAnimationReference, referenceNameFromUrl } from '$lib/animationReferenceClassifier';
	import type { StoryCard } from '$lib/storycard/storycard';
  let {
		message = null,
    title,
    characterName,
    summary,
    tags = [],
    referenceCount = 0,
    referenceImages = [],
    referenceSource = '',
    sourceMessageId = '',
    referenceImageFileName = null,
    initialMotionPrompt = '',
		initialVideoPackage = null,
		storyCard = null,
    initialVideoModelId = '',
		duration = '15秒',
    createdAt,
    videoUrl = '',
    onVideoCompleted,
    onVideoStateChange,
    onVideoPackageCreated,
    onReferenceImagesChange,
		onSceneTimelineChange,
    interactive = true,
    compact = false,
  }: {
		message?: {
			id?: string;
			role?: string;
			text?: string;
			storyCard?: StoryCard;
			motionPrompt?: string;
			videoPackage?: VideoPackage;
			referenceImages?: string[];
		} | null;
    title: string;
    characterName: string;
    summary: string;
    tags?: string[];
    referenceCount?: number;
    referenceImages?: string[];
    referenceSource?: string;
    sourceMessageId?: string;
    referenceImageFileName?: string | null;
    initialMotionPrompt?: string;
		initialVideoPackage?: VideoPackage | null;
		storyCard?: StoryCard | null;
    initialVideoModelId?: string;
    duration?: string;
    createdAt: string;
    videoUrl?: string;
    onVideoCompleted?: (url: string) => void;
    onVideoStateChange?: (state: 'idle' | 'generating' | 'completed' | 'error') => void;
    onVideoPackageCreated?: (referenceImages: string[]) => void;
    onReferenceImagesChange?: (images: string[]) => void;
		onSceneTimelineChange?: (scenes: StoryScene[], motionPrompt: string) => void | Promise<void>;
    interactive?: boolean;
    compact?: boolean;
  } = $props();
  let open = $state(false);
	let activeSection = $state<'timeline' | 'project' | 'motion'>('timeline');
	let selectedTimelineScene = $state<{ title: string; thumbnailUrl: string; sourcePanel: string; sourceSheetId: string; panelBounds?: PanelBounds; index: number } | null>(null);
	let showPanelOverlays = $state(true);
	let generatedVideoElement = $state<HTMLVideoElement>();
	let timelineSaveStatus = $state('');
  let videoPackage = $state<VideoPackage | null>(null);
  $effect(() => {
    if (initialVideoPackage && videoPackage?.source_storycard_id !== initialVideoPackage.source_storycard_id) {
      videoPackage = initialVideoPackage;
    }
  });
  let videoModelId = $state('');
  $effect(() => {
    if (!videoModelId && initialVideoModelId) videoModelId = initialVideoModelId;
  });
  const selectedVideoModel = $derived(VIDEO_MODELS.find((model) => model.id === videoModelId));
  const originalVideoDuration = $derived(Number((initialVideoPackage ?? videoPackage)?.duration ?? 5));
  const safeSeedanceMiniDuration = $derived(Math.min(15, Math.max(1, Math.round(originalVideoDuration))));
  let sendingVideoPrompt = $state(false);
  let videoPromptSendStatus = $state('');
  let videoProgress = $state(0);
	let completedVideoUrl = $state('');
	$effect(() => {
		completedVideoUrl = videoUrl;
	});
  let mediaEntries = $state<VideoProductionMediaEntry[]>([]);
  let referenceImageUrls = $state<string[]>([]);
  let showMediaImagePicker = $state(false);
  let excludedReferenceImages = $state<string[]>([]);
  let referenceImageFileInput = $state<HTMLInputElement>();
  let previousMessageImages: { images: string[]; messageId: string } | null = null;
	const activePackage = $derived(videoPackage ?? initialVideoPackage);
	/** Always derived from the Scene Timeline — never edited or stored directly. */
	const motionPrompt = $derived(activePackage && activePackage.scenes.length > 0
		? motionPromptFromTimeline(activePackage.scenes)
		: initialMotionPrompt);
	const currentTitle = $derived(activePackage?.title || title);
	const currentSummary = $derived(activePackage?.story_summary || summary);
	const currentDuration = $derived(activePackage ? `${activePackage.duration}秒` : duration);
	const currentSceneCount = $derived(activePackage ? `${activePackage.scenes.length} SCENE` : 'PROJECT未設定');
	const timelineScenes = $derived(activePackage?.scenes ?? []);
	const currentCuts = $derived(timelineScenes.length > 0 ? timelineScenes.map((scene) => ({
		id: String(scene.id),
		eventType: scene.eventType,
		storyEvent: scene.storyEvent,
		sceneTransition: scene.sceneTransition,
		requiredEvent: scene.requiredEvent,
		characters: scene.characters ?? [],
		title: scene.title || `SCENE${String(scene.id).padStart(2, '0')}`,
		summary: scene.visual,
		time: scene.timecode,
		duration: scene.duration,
		camera: scene.camera,
		motion: scene.action,
		dialogue: scene.dialogue,
		tags: scene.tags ?? [],
		thumbnailUrl: resolveVideoProductionImageReference(scene.thumbnailUrl || activePackage?.reference_images[0] || referenceImages[0] || ''),
		sourcePanel: scene.sourcePanel || `PANEL${String((scene.sceneIndex ?? Number(scene.id) - 1) + 1).padStart(2, '0')}`,
		sourceSheetId: scene.sourceSheetId || activePackage?.reference_images[0] || referenceImages[0] || '',
		panelBounds: scene.panelBounds,
	})) : (storyCard?.cuts ?? []).map((cut, index) => ({
		...cut,
		thumbnailUrl: resolveVideoProductionImageReference(referenceImages[0] || ''),
		sourcePanel: `PANEL${String(index + 1).padStart(2, '0')}`,
		sourceSheetId: referenceImages[0] || '',
		panelBounds: undefined,
	})));

	function openAnimationSheetViewer(cut: { thumbnailUrl?: string; sourcePanel?: string; sourceSheetId?: string; panelBounds?: PanelBounds; title?: string }, index: number): void {
		if (!cut.thumbnailUrl) return;
		selectedTimelineScene = {
			title: cut.title || `SCENE${String(index + 1).padStart(2, '0')}`,
			thumbnailUrl: cut.thumbnailUrl,
			sourcePanel: cut.sourcePanel || `PANEL${String(index + 1).padStart(2, '0')}`,
			sourceSheetId: cut.sourceSheetId || '',
			panelBounds: cut.panelBounds,
			index,
		};
	}
	function referenceLabelFor(image: string): string {
		const entry = getVideoProductionMediaEntries().find((item) => item.id === image || item.value === image);
		return entry?.label || referenceNameFromUrl(image);
	}
	const referenceCategories = $derived(referenceImages.map((image) => classifyAnimationReference(referenceLabelFor(image))));
	const animationSheetCount = $derived(initialVideoPackage?.animation_sheet_count ?? referenceCategories.filter((category) => category === 'Animation Sheet').length);
	const worldReferenceCount = $derived(referenceCategories.filter((category) => category === 'World Reference').length);
	const propReferenceCount = $derived(referenceCategories.filter((category) => category === 'Prop Reference').length);
	const characterReferenceCount = $derived(referenceCategories.filter((category) => category === 'Character Reference').length);

	function saveTimelineScene(cut: { title?: string; camera?: string; motion?: string; action?: string; dialogue?: string; characters?: string[] }, index: number): void {
		const original = timelineScenes[index];
		if (!original) return;
		const next = timelineScenes.map((scene, sceneIndex) => sceneIndex === index ? {
			...scene,
			title: cut.title ?? scene.title,
			characters: cut.characters ?? scene.characters,
			camera: cut.camera ?? scene.camera,
			action: cut.motion ?? cut.action ?? scene.action,
			dialogue: cut.dialogue ?? scene.dialogue,
		} : scene);
		const nextMotionPrompt = motionPromptFromTimeline(next);
		if (activePackage) videoPackage = { ...activePackage, scenes: next, motion_prompt: nextMotionPrompt };
		timelineSaveStatus = 'Scene Timelineを保存中…';
		const saveResult = onSceneTimelineChange?.(next, nextMotionPrompt);
		Promise.resolve(saveResult).then(() => {
			timelineSaveStatus = 'Scene TimelineとMotion Promptを保存しました。';
		}).catch((error) => {
			timelineSaveStatus = error instanceof Error ? error.message : 'Scene Timelineの保存に失敗しました。';
		});
	}

	function sceneStartSeconds(cut: { time?: string }, index: number): number {
		const start = cut.time?.split(/\s*(?:-|–|—|〜|~|to)\s*/iu)[0]?.trim();
		if (start) {
			const parts = start.split(':').map(Number);
			const parsed = parts.length === 2 ? parts[0] * 60 + parts[1] : Number(start);
			if (Number.isFinite(parsed)) return parsed;
		}
		return timelineScenes.slice(0, index).reduce((total, scene) => total + Number(scene.duration || 0), 0);
	}

	function previewTimelineScene(cut: { time?: string }, index: number): void {
		if (!generatedVideoElement || !(completedVideoUrl || videoUrl)) return;
		generatedVideoElement.currentTime = sceneStartSeconds(cut, index);
		generatedVideoElement.scrollIntoView({ behavior: 'smooth', block: 'center' });
		void generatedVideoElement.play().catch(() => undefined);
	}

	$effect(() => {
		console.log('[VIDEO_STORYCARD_DEBUG_RENDER_MESSAGE]', message);
		console.log('[VIDEO_STORYCARD_DEBUG_RENDER_STATE]', {
			storyCard,
			motionPrompt: initialMotionPrompt,
			referenceImages,
			referenceCount: referenceImages.length,
		});
	});

  $effect(() => {
    const currentMessageImages = {
      images: [...referenceImages],
      messageId: sourceMessageId,
    };
    if (previousMessageImages && (
      previousMessageImages.images.join('\u0000') !== currentMessageImages.images.join('\u0000')
      || previousMessageImages.messageId !== currentMessageImages.messageId
    )) {
      console.log('[MESSAGE_IMAGE_CHANGED]', {
        previousMessageImages,
        currentMessageImages,
        hasVideoPackage: Boolean(videoPackage),
      });
      if (videoPackage) {
        videoPackage = null;
        console.log('[VIDEO_PACKAGE_CLEARED]', { reason: 'message image changed' });
      }
      excludedReferenceImages = [];
      referenceImageUrls = [...currentMessageImages.images];
    }
    previousMessageImages = currentMessageImages;
  });

  function refreshMediaEntries(): void {
    mediaEntries = getVideoProductionMediaEntries();
  }

  function isStoredVideo(entry: VideoProductionMediaEntry): boolean {
    return /generated video$/iu.test(entry.label) || /\.(?:mp4|webm|mov)(?:[?#]|$)/iu.test(entry.value);
  }

  const isReferenceToVideo = $derived(selectedVideoModel?.mode === 'r2v');
  const supportsReferenceImages = $derived(
    selectedVideoModel?.mode === 'i2v' || isReferenceToVideo,
  );

  $effect(() => {
    if (!supportsReferenceImages) return;
    const messageImages = referenceImages.filter((image) => image && !excludedReferenceImages.includes(image));
    const remainingImages = referenceImageUrls.filter((image) => !messageImages.includes(image));
    const nextReferenceImageUrls = [...new Set([...messageImages, ...remainingImages])];
    if (nextReferenceImageUrls.length !== referenceImageUrls.length || nextReferenceImageUrls.some((image, index) => image !== referenceImageUrls[index])) {
      referenceImageUrls = nextReferenceImageUrls;
    }
  });

  function addReferenceImage(imageUrl: string): void {
    if (referenceImageUrls.includes(imageUrl)) return;
    excludedReferenceImages = excludedReferenceImages.filter((image) => image !== imageUrl);
    referenceImageUrls = [...referenceImageUrls, imageUrl];
    onReferenceImagesChange?.(referenceImageUrls);
    showMediaImagePicker = false;
  }

  function removeReferenceImage(imageUrl: string): void {
    if (referenceImages.includes(imageUrl) && !excludedReferenceImages.includes(imageUrl)) {
      excludedReferenceImages = [...excludedReferenceImages, imageUrl];
    }
    referenceImageUrls = referenceImageUrls.filter((selectedImageUrl) => selectedImageUrl !== imageUrl);
    onReferenceImagesChange?.(referenceImageUrls);
  }

  function initializeReferenceCollection(): void {
    const messageImage = referenceImages[0] ?? '';
    if (messageImage && !excludedReferenceImages.includes(messageImage) && !referenceImageUrls.includes(messageImage)) {
      referenceImageUrls = [messageImage, ...referenceImageUrls];
    }
    refreshMediaEntries();
  }

  function loadCharacterPreset(mediaIds: string[]): void {
    const acceptedImages = [...new Set(mediaIds)];
    referenceImageUrls = acceptedImages;
    excludedReferenceImages = referenceImages.filter((image) => !acceptedImages.includes(image));
    onReferenceImagesChange?.(referenceImageUrls);
    showMediaImagePicker = false;
  }

  function readFileAsDataUrl(file: File): Promise<string> {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(typeof reader.result === 'string' ? reader.result : '');
      reader.onerror = () => reject(reader.error ?? new Error(`Unable to read ${file.name}`));
      reader.readAsDataURL(file);
    });
  }

  async function addReferenceImageFiles(event: Event): Promise<void> {
    const input = event.currentTarget as HTMLInputElement;
    const files = Array.from(input.files ?? []).filter((file) => file.type.startsWith('image/'));
    input.value = '';
    for (const file of files) {
      const dataUrl = await readFileAsDataUrl(file);
      const mediaId = storeVideoProductionImage(dataUrl, file.name);
      addReferenceImage(mediaId);
    }
    refreshMediaEntries();
  }

  async function r2vImageUrls(): Promise<string[]> {
    return Promise.all(referenceImageUrls.map(resolveVideoProductionImageReference).map(toFalImageInput));
  }

  function httpError(status: number, body: string): Error {
    return new Error(`HTTP: ${status}\n\nBody:\n${body || '(empty response body)'}`);
  }

  function parseJsonResponse<T>(status: number, body: string): T {
    try {
      return JSON.parse(body) as T;
    } catch {
      throw httpError(status, body);
    }
  }

  async function toFalImageInput(image: string): Promise<string> {
    if (image.startsWith('data:image/')) return image;

    const url = new URL(image, window.location.origin);
    if (url.origin !== window.location.origin) return image;

    const response = await fetch(url);
    if (!response.ok) throw new Error(`Unable to read video reference image: HTTP ${response.status}`);
    const blob = await response.blob();
    return new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(typeof reader.result === 'string' ? reader.result : '');
      reader.onerror = () => reject(reader.error ?? new Error('Unable to encode video reference image'));
      reader.readAsDataURL(blob);
    });
  }

  function createVideoPackageForChat(images = referenceImages): VideoPackage | null {
    console.log('[VIDEO_STORY_CREATE_PACKAGE]', {
      referenceSource,
      referenceImages: images,
      referenceImageCount: images.length,
    });
    const references = images
      .map((image) => toVideoProductionImageReference(image, `${referenceSource || characterName} reference`))
      .filter(Boolean);
	const basePackage = videoPackage ?? initialVideoPackage;
    if (!basePackage) return null;
    videoPackage = {
      ...basePackage,
      reference_images: references,
      motion_prompt: motionPromptFromTimeline(basePackage.scenes),
    };
    console.log('[VIDEO_PACKAGE_CREATED]', { referenceImages: videoPackage.reference_images });
    onVideoPackageCreated?.(videoPackage.reference_images);
    refreshMediaEntries();
    videoPromptSendStatus = '';
    return videoPackage;
  }

  async function sendVideoPrompt(): Promise<void> {
    console.log('[VIDEO_STORY_CREATE_BUTTON_CLICKED]', {
      videoModelId,
      sendingVideoPrompt,
      hasVideoPackage: Boolean(videoPackage),
    });
    if (!selectedVideoModel || sendingVideoPrompt) return;
    const activeReferenceImages = referenceImageUrls.length > 0 ? referenceImageUrls : referenceImages;
    const packageData = createVideoPackageForChat(activeReferenceImages);
    if (!packageData) {
	  videoPromptSendStatus = 'Animation Projectがありません。先にAnimation Sheetまたは参照画像を追加してください。';
      return;
    }
    if (!packageData.motion_prompt.trim()) {
      videoPromptSendStatus = 'Motion Promptが空のため動画生成を中止しました。Scene Timelineにシーンがありません。アニメシートを再解析してください。';
      onVideoStateChange?.('error');
      return;
    }

    sendingVideoPrompt = true;
    onVideoStateChange?.('generating');
    videoProgress = 0;
    videoPromptSendStatus = `${selectedVideoModel.label} (FAL) の動画生成ジョブを開始しています…`;
    try {
      const resolvedImageUrl = packageData?.reference_images
        .map(resolveVideoProductionImageReference)
        .find((reference) => Boolean(reference)) ?? '';
      if (selectedVideoModel.mode === 'i2v' && !resolvedImageUrl) throw new Error('Image to Video requires a reference image.');
      const imageUrl = selectedVideoModel.mode === 'i2v' ? await toFalImageInput(resolvedImageUrl) : '';
      const referenceImageUrls = selectedVideoModel.mode === 'r2v' ? await r2vImageUrls() : [];
      if (selectedVideoModel.mode === 'r2v' && referenceImageUrls.length === 0) throw new Error('Reference to Video requires at least one reference image.');
      const isSeedanceMini = selectedVideoModel.id === 'seedance-2-mini-reference';
      const parsedDuration = Number(packageData.duration);
      const originalDuration = Number.isFinite(parsedDuration) ? parsedDuration : 5;
      const safeDuration = isSeedanceMini
        ? Math.min(15, Math.max(1, Math.round(originalDuration)))
        : originalDuration;
      if (isSeedanceMini) {
        console.log('[SEEDANCE_MINI_PAYLOAD]', {
          duration: originalDuration,
          safeDuration,
          imageCount: referenceImageUrls.length,
          modelId: selectedVideoModel.id,
        });
      }
      console.log('[FAL_VIDEO_IMAGE_URL_CREATED]', { modelId: selectedVideoModel.id, falModel: selectedVideoModel.falModel, mode: selectedVideoModel.mode, imageUrl, imageCount: referenceImageUrls.length || Number(Boolean(imageUrl)), referenceSource });
      const submittedPrompt = videoPackagePrompt(packageData);
      const response = await fetch('/api/video', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
	        body: JSON.stringify({
	          modelId: selectedVideoModel.id,
	          videoMode: selectedVideoModel.videoMode ?? (selectedVideoModel.id === 'seedance-2-mini-reference' ? 'draft' : 'production'),
	          ...(selectedVideoModel.mode === 'i2v' ? { imageUrl } : {}),
	          ...(selectedVideoModel.mode === 'r2v' ? { imageUrls: referenceImageUrls } : {}),
	          prompt: submittedPrompt,
		  duration: safeDuration,
        }),
      });
      const responseBody = await response.text();
      if (!response.ok) throw new Error(`Video generation failed.\nmodelId:${selectedVideoModel.id}\nfalModel:${selectedVideoModel.falModel}\n${httpError(response.status, responseBody).message}`);
      const result = parseJsonResponse<{ url?: string; model?: string }>(response.status, responseBody);
      if (!result.url) throw new Error(`Video generation failed.\nmodelId:${selectedVideoModel.id}\nfalModel:${selectedVideoModel.falModel}\nNo video URL returned.`);
      storeVideoProductionImage(result.url, `${selectedVideoModel.label} generated video`);
	  storeVideoProductionData('video', { url: result.url, modelId: selectedVideoModel.id, messageId: sourceMessageId, createdAt: new Date().toISOString() });
      refreshMediaEntries();
      completedVideoUrl = result.url;
      onVideoCompleted?.(result.url);
      onVideoStateChange?.('completed');
      videoProgress = 100;
      videoPromptSendStatus = `${selectedVideoModel.label} (FAL) の動画生成が完了しました。`;
    } catch (error) {
      console.error('[VIDEO_STORY_VIDU_ERROR]', error);
      onVideoStateChange?.('error');
      videoPromptSendStatus = error instanceof Error ? error.message : 'Vidu video generation failed';
    } finally {
      sendingVideoPrompt = false;
    }
  }
</script>

<article class="video-story-card" class:compact>
	<header class="animation-project-header">
		<span>ANIMATION PROJECT</span>
		<strong>{currentTitle}</strong>
	</header>
	<section class="animation-source" aria-label="Animation Source">
		<h3>Animation Source</h3>
		<div>
			<span>Animation Sheet <strong>{animationSheetCount}枚</strong></span>
			<span>Character Reference <strong>{characterReferenceCount}点</strong></span>
			<span>World Reference <strong>{worldReferenceCount}点</strong></span>
			<span>Prop Reference <strong>{propReferenceCount}点</strong></span>
		</div>
	</section>
	<nav class="animation-project-tabs" aria-label="Animation Project">
		<button type="button" class:active={activeSection === 'timeline'} onclick={() => activeSection = 'timeline'}>Scene Timeline</button>
		<button type="button" class:active={activeSection === 'project'} onclick={() => activeSection = 'project'}>Animation Project</button>
		<button type="button" class:active={activeSection === 'motion'} onclick={() => activeSection = 'motion'}>Motion Prompt</button>
	</nav>
	{#if activeSection === 'timeline'}
		<UnifiedStoryCard kind="video" title={currentTitle} characters={characterName} length={currentDuration} summary={currentSummary} sceneCount={currentSceneCount} cuts={currentCuts} onthumbnailclick={openAnimationSheetViewer} onpreview={previewTimelineScene} onsavescene={saveTimelineScene} canPreview={Boolean(completedVideoUrl || videoUrl)} />
		{#if timelineSaveStatus}<p class="timeline-save-status">{timelineSaveStatus}</p>{/if}
		{#if storyCard}
			<details class="legacy-storycard-details">
				<summary>Legacy StoryCard data</summary>
				<pre>{JSON.stringify(storyCard, null, 2)}</pre>
			</details>
		{/if}
		<section class="timeline-video-output">
			<h3>Generated Video</h3>
			{#if completedVideoUrl || videoUrl}
				<video bind:this={generatedVideoElement} controls src={completedVideoUrl || videoUrl}><track kind="captions" srclang="ja" label="Japanese" src="/mock/captions.vtt" /></video>
			{:else}<p>未生成</p>{/if}
		</section>
	{:else if activeSection === 'motion'}
		<details class="motion-prompt-details motion-prompt-internal">
			<summary>内部データを展開</summary>
			<div class="video-production-row motion-prompt-row">
				<label for={`motion-prompt-${sourceMessageId}`}>Motion Prompt</label>
				<textarea id={`motion-prompt-${sourceMessageId}`} aria-label="Motion Prompt" value={motionPrompt} readonly title="Motion PromptはScene Timelineから自動生成されます。変更はタイムラインのシーン編集で行ってください。"></textarea>
			</div>
		</details>
	{:else}
	<section class="animation-project-overview">
		<div><span>Character</span><strong>{characterName}</strong></div>
		<div><span>Duration</span><strong>{currentDuration}</strong></div>
		<div><span>Sheets / References</span><strong>{referenceImages.length}枚</strong></div>
		<div><span>Scenes</span><strong>{currentSceneCount}</strong></div>
	</section>
	<section class="generated-video-project" aria-label="Generated Video">
		<h3>Generated Video</h3>
		{#if completedVideoUrl || videoUrl}
			<div class="completed-video-preview video-preview">
				<video bind:this={generatedVideoElement} controls src={completedVideoUrl || videoUrl}><track kind="captions" srclang="ja" label="Japanese" src="/mock/captions.vtt" /></video>
				<a href={completedVideoUrl || videoUrl} download>ダウンロード</a>
			</div>
		{:else}
			<p class="pending">生成済み動画はまだありません。</p>
		{/if}
	</section>
	<button class="video-adjust-toggle" type="button" onclick={() => { open = !open; if (open) refreshMediaEntries(); }}>
		{open ? '制作設定を閉じる' : '制作設定を開く'}
	</button>
	{#if open}
    {#if interactive}
    <section class="video-production">
      {#if !isReferenceToVideo}
      <div class="video-production-row">
        <span>🖼️動画元画像</span>
        {#if referenceImages[0]}
          <div class="video-reference-panel">
            <img class="video-reference" src={referenceImages[0]} alt={`${characterName} reference`} />
            <span class="video-reference-source">参照元: {referenceSource}</span>
          </div>
        {:else}
          <span>なし</span>
        {/if}
      </div>
      {/if}
      <div class="video-production-row">
        <span>🎥 動画モデル</span>
        <select aria-label="動画モデル" bind:value={videoModelId} disabled={sendingVideoPrompt}>
          <option value="" disabled>選択してください</option>
          {#each VIDEO_MODELS as model (model.id)}
            <option value={model.id} disabled={!model.enabled}>{model.label}</option>
          {/each}
        </select>
      </div>
      {#if selectedVideoModel?.id === 'seedance-2-mini-reference'}
        <div class="seedance-mini-duration-debug">
          <span>Original Duration: {originalVideoDuration}</span>
          <span>Safe Duration: {safeSeedanceMiniDuration}</span>
        </div>
      {/if}
      {#if supportsReferenceImages}
        <CharacterPresetManager
          mediaImages={mediaEntries.filter((entry) => !isStoredVideo(entry))}
          onLoad={loadCharacterPreset}
        />
      {/if}
      {#if isReferenceToVideo}
        {@const messageImage = referenceImages[0] ?? ''}
        {@const availableImages = mediaEntries.filter((entry) => !isStoredVideo(entry) && !referenceImageUrls.includes(entry.id))}
        <section class="reference-image-selector" aria-label="Reference image collection">
          <strong>🎥 動画資料集</strong>
	          <span>{referenceImageUrls.length}枚</span>
          <div class="reference-image-grid">
            {#each referenceImageUrls as imageUrl (imageUrl)}
              <figure>
                <img src={resolveVideoProductionImageReference(imageUrl)} alt="動画資料" />
                <button type="button" aria-label="資料画像を削除" onclick={(event) => { event.stopPropagation(); removeReferenceImage(imageUrl); }}>×</button>
              </figure>
            {/each}
          </div>
          <input bind:this={referenceImageFileInput} type="file" accept="image/*" multiple onchange={addReferenceImageFiles} hidden />
	          <button type="button" onclick={() => referenceImageFileInput?.click()}>➕ 資料画像を追加</button>
	          <button type="button" onclick={() => { initializeReferenceCollection(); showMediaImagePicker = !showMediaImagePicker; }}>mediaStoreから選択</button>
	          {#if showMediaImagePicker}
            <div class="reference-image-picker">
              {#if messageImage}
                <button type="button" class="message-image-option" onclick={() => addReferenceImage(messageImage)} disabled={referenceImageUrls.includes(messageImage)}>
                  <img src={messageImage} alt="メッセージの添付" />
                  <span>{referenceImageUrls.includes(messageImage) ? 'Message Image（追加済み）' : 'Message Image を使用'}</span>
                </button>
              {/if}
              {#if availableImages.length > 0}
                <div class="reference-image-grid available">
                  {#each availableImages as entry (entry.id)}
                    <button type="button" onclick={() => addReferenceImage(entry.id)}>
                      <img src={entry.value} alt={entry.label} />
                      <span>＋</span>
                    </button>
                  {/each}
                </div>
              {:else}
                <p>Message Image を使用できます</p>
              {/if}
            </div>
          {/if}
        </section>
      {/if}
      <div class="video-production-row">
        <span>🎥 動画を作る</span>
        <button type="button" onclick={sendVideoPrompt} disabled={!selectedVideoModel || sendingVideoPrompt || (selectedVideoModel.mode === 'i2v' && referenceImageUrls.length === 0 && !referenceImages[0]) || (selectedVideoModel.mode === 'r2v' && referenceImageUrls.length === 0)}>
          {sendingVideoPrompt ? '生成中…' : '動画を作る'}
        </button>
      </div>
      <section class="media-store-debug" aria-label="mediaStore debug">
        <p class="media-store-title">mediaStore · {mediaEntries.length}件</p>
        {#if mediaEntries.length > 0}
          <div class="media-store-list">
            {#each mediaEntries as entry (entry.id)}
              <article class="media-store-item">
                {#if isStoredVideo(entry)}
                  <video controls src={entry.value}>
                    <track kind="captions" srclang="ja" label="Japanese" src="/mock/captions.vtt" />
                  </video>
                {:else}
                  <img src={entry.value} alt={entry.label} />
                {/if}
                <div>
                  <span>{entry.label}</span>
                  <code>{entry.id}</code>
                  {#if isStoredVideo(entry)}
                    <a href={entry.value} download>ダウンロード</a>
                  {/if}
                </div>
              </article>
            {/each}
          </div>
        {:else}
          <p class="media-store-empty">登録画像はありません。</p>
        {/if}
      </section>
    </section>
    {#if videoPromptSendStatus}
      <p class="send-status">{videoPromptSendStatus}</p>
      {#if sendingVideoPrompt}
        <progress class="video-progress" max="100" value={videoProgress}>{videoProgress}%</progress>
      {/if}
    {/if}
    {/if}
    {/if}
	{/if}
	{#if selectedTimelineScene}
		<div class="animation-sheet-viewer-backdrop" role="button" tabindex="-1" aria-label="Animation Sheet Viewerを閉じる" onclick={() => selectedTimelineScene = null} onkeydown={(event) => { if (event.key === 'Escape') selectedTimelineScene = null; }}>
			<div class="animation-sheet-viewer" role="dialog" tabindex="-1" aria-modal="true" aria-label="Animation Sheet Viewer" onclick={(event) => event.stopPropagation()} onkeydown={(event) => event.stopPropagation()}>
				<header>
					<div><span>ANIMATION SHEET VIEWER</span><h3>{selectedTimelineScene.title}</h3></div>
					<div class="viewer-actions">
						<button type="button" class:active={showPanelOverlays} aria-pressed={showPanelOverlays} onclick={() => showPanelOverlays = !showPanelOverlays}>枠オーバーレイ {showPanelOverlays ? 'ON' : 'OFF'}</button>
						<button type="button" aria-label="Animation Sheet Viewerを閉じる" onclick={() => selectedTimelineScene = null}>×</button>
					</div>
				</header>
				<div class="animation-sheet-canvas">
					<div class="animation-sheet-image-frame">
						<img src={selectedTimelineScene.thumbnailUrl} alt={selectedTimelineScene.sourceSheetId || 'Animation Sheet'} />
						{#if showPanelOverlays}
							{#each currentCuts as scene, index (scene.id ?? index)}
								{#if scene.panelBounds && (!scene.sourceSheetId || scene.sourceSheetId === selectedTimelineScene.sourceSheetId)}
									<div
										class="panel-highlight"
										class:selected={index === selectedTimelineScene.index}
										style={`left:${scene.panelBounds.x * 100}%;top:${scene.panelBounds.y * 100}%;width:${scene.panelBounds.width * 100}%;height:${scene.panelBounds.height * 100}%`}
									><span>{scene.sourcePanel || scene.panelBounds.panelId || `PANEL${String(index + 1).padStart(2, '0')}`}</span></div>
								{/if}
							{/each}
						{/if}
					</div>
				</div>
				<div class="panel-selector" aria-label="Source panels">
					{#each currentCuts as scene, index (scene.id ?? index)}
						<button type="button" class:active={index === selectedTimelineScene.index} onclick={() => openAnimationSheetViewer(scene, index)}>{scene.sourcePanel || `PANEL${String(index + 1).padStart(2, '0')}`}</button>
					{/each}
				</div>
			</div>
		</div>
	{/if}
</article>

<style>
  .video-story-card { padding: 12px; border: 1px solid rgba(74,222,128,.34); border-radius: 10px; background: rgba(6,78,59,.13); }
  .video-story-card.compact { margin-top: 8px; padding: 0; border-color: transparent; background: transparent; }
	.animation-project-header { display: grid; gap: 3px; padding: 8px 10px; }
	.animation-project-header span { color: #67e8f9; font-size: 10px; font-weight: 900; letter-spacing: .12em; }
	.animation-project-header strong { color: #d1fae5; font-size: 14px; }
	.animation-source { display: grid; gap: 7px; margin: 0 0 10px; padding: 10px; border: 1px solid rgba(34,211,238,.42); border-radius: 8px; background: linear-gradient(135deg, rgba(14,116,144,.15), rgba(2,6,23,.38)); }
	.animation-source h3 { margin: 0; color: #a5f3fc; font-size: 13px; }
	.animation-source > div { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 5px; }
	.animation-source span { display: flex; justify-content: space-between; gap: 5px; color: #94a3b8; font-size: 10px; }
	.animation-source strong { color: #e0f2fe; }
	.animation-project-tabs { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 4px; margin: 0 0 9px; }
	.animation-project-tabs button { padding: 7px 5px; border: 1px solid rgba(74,222,128,.22); border-radius: 6px; color: #94a3b8; background: rgba(2,6,23,.48); font-size: 11px; font-weight: 800; cursor: pointer; }
	.animation-project-tabs button.active { border-color: rgba(34,211,238,.55); color: #a5f3fc; background: rgba(14,116,144,.18); }
	.animation-project-overview { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 6px; margin: 8px 0; }
	.animation-project-overview div { display: grid; gap: 2px; padding: 8px; border: 1px solid rgba(74,222,128,.18); border-radius: 6px; background: rgba(2,6,23,.36); }
	.animation-project-overview span { color: #94a3b8; font-size: 10px; }
	.animation-project-overview strong { color: #d1fae5; font-size: 12px; }
	.generated-video-project { display: grid; gap: 5px; margin: 8px 0; padding: 9px; border: 1px solid rgba(74,222,128,.18); border-radius: 7px; background: rgba(2,6,23,.3); }
	.generated-video-project h3 { margin: 0; color: #86efac; font-size: 12px; }
	.timeline-video-output { display: grid; gap: 6px; margin-top: 10px; padding: 9px; border-top: 1px solid rgba(74,222,128,.18); }
	.timeline-save-status { margin: 7px 0; color: #a7f3d0; font-size: 11px; }
	.timeline-video-output h3 { margin: 0; color: #86efac; font-size: 12px; }
	.timeline-video-output video { width: 100%; max-height: 260px; border-radius: 7px; background: #020617; }
	.animation-sheet-viewer-backdrop { position: fixed; inset: 0; z-index: 1200; display: grid; place-items: center; padding: 20px; background: rgba(2,6,23,.86); }
	.animation-sheet-viewer { width: min(880px, 100%); max-height: 90vh; overflow: auto; padding: 14px; border: 1px solid rgba(34,211,238,.55); border-radius: 12px; background: #07111d; box-shadow: 0 24px 70px rgba(0,0,0,.65); }
	.animation-sheet-viewer > header { display: flex; justify-content: space-between; gap: 12px; align-items: start; }
	.animation-sheet-viewer header span { color: #67e8f9; font-size: 10px; font-weight: 900; letter-spacing: .12em; }
	.animation-sheet-viewer header h3 { margin: 3px 0 10px; color: #e0f2fe; }
	.animation-sheet-viewer header button { border: 1px solid rgba(148,163,184,.3); border-radius: 6px; color: #e2e8f0; background: #020617; cursor: pointer; }
	.animation-sheet-viewer header button.active { border-color: #22d3ee; color: #ecfeff; background: rgba(14,116,144,.35); }
	.viewer-actions { display: flex; align-items: center; gap: 7px; }
	.animation-sheet-canvas { position: relative; display: grid; place-items: center; min-height: 260px; overflow: hidden; border: 2px solid #22d3ee; border-radius: 9px; background: #020617; box-shadow: 0 0 24px rgba(34,211,238,.25); }
	.animation-sheet-image-frame { position: relative; display: inline-block; max-width: 100%; }
	.animation-sheet-canvas img { display: block; max-width: 100%; max-height: 65vh; object-fit: contain; }
	.panel-highlight { position: absolute; box-sizing: border-box; border: 2px dashed rgba(103,232,249,.65); background: rgba(34,211,238,.04); pointer-events: none; }
	.panel-highlight.selected { z-index: 2; border: 3px solid #22d3ee; background: rgba(34,211,238,.12); box-shadow: 0 0 18px rgba(34,211,238,.75), inset 0 0 14px rgba(34,211,238,.18); }
	.panel-highlight span { position: absolute; top: -30px; left: -3px; padding: 4px 8px; border-radius: 999px; color: #fff; background: #0e7490; font-size: 11px; font-weight: 900; white-space: nowrap; }
	.panel-selector { display: flex; flex-wrap: wrap; gap: 6px; margin-top: 10px; }
	.panel-selector button { padding: 5px 8px; border: 1px solid rgba(148,163,184,.25); border-radius: 999px; color: #94a3b8; background: rgba(2,6,23,.6); cursor: pointer; }
	.panel-selector button.active { border-color: #22d3ee; color: #ecfeff; background: rgba(14,116,144,.3); box-shadow: 0 0 10px rgba(34,211,238,.3); }
	.motion-prompt-internal { margin: 9px 0; padding: 10px; border: 1px solid rgba(148,163,184,.18); border-radius: 7px; background: rgba(2,6,23,.35); }
	.legacy-storycard-details { margin-top: 7px; color: #64748b; font-size: 10px; }
	.legacy-storycard-details summary { cursor: pointer; }
	.legacy-storycard-details pre { max-height: 180px; overflow: auto; white-space: pre-wrap; color: #94a3b8; font: 10px ui-monospace, monospace; }
  .video-adjust-toggle { border: 1px solid rgba(74,222,128,.34); border-radius: 8px; padding: 8px 10px; cursor: pointer; color: #a7f3d0; background: rgba(6,78,59,.18); font: inherit; font-size: 12px; font-weight: 800; }
  .video-story-card.compact .video-production,
  .video-story-card.compact .completed-video-preview,
  .video-story-card.compact .pending,
  .video-story-card.compact .send-status,
  .video-story-card.compact .video-progress { margin-left: 10px; margin-right: 10px; }
  p { margin: 5px 0; color: #d1fae5; font-size: 13px; line-height: 1.5; } .pending { color: #fde68a; }
  .video-production { display: grid; gap: 8px; margin-top: 12px; }
  .video-production-row { display: flex; align-items: center; justify-content: space-between; gap: 8px; color: #cbd5e1; font-size: 12px; }
  .seedance-mini-duration-debug { display: flex; flex-wrap: wrap; gap: 8px 14px; padding: 8px 10px; border: 1px solid rgba(251,191,36,.35); border-radius: 6px; color: #fde68a; background: rgba(120,53,15,.14); font-size: 11px; font-weight: 800; }
	.video-production button, .video-production select { border: 1px solid rgba(74,222,128,.4); border-radius: 5px; padding: 6px 8px; color: #d1fae5; background: rgba(6,78,59,.42); font: inherit; font-size: 12px; }
  .video-production button { cursor: pointer; }
  .video-production button:disabled, .video-production select:disabled { cursor: not-allowed; opacity: .42; }
  .video-reference-panel { display: grid; gap: 5px; }
  .video-reference { height: 210px; aspect-ratio: 1; object-fit: cover; border-radius: 6px; border: 1px solid rgba(74,222,128,.3); }
  .video-reference-source { color: #a7f3d0; font-size: 11px; }
  .video-preview { display: flex; flex-direction: column; align-items: center; justify-content: center; width: 100%; gap: 7px; margin-top: 9px; }
  .video-preview video { width: min(70%, 420px); max-width: 100%; height: auto; border-radius: 12px; background: #020617; }
  .completed-video-preview a, .media-store-item a { color: #86efac; font-size: 12px; font-weight: 700; }
  .motion-prompt-row { align-items: start; }
  .motion-prompt-details { display: grid; gap: 7px; color: #cbd5e1; font-size: 12px; }
  .motion-prompt-details summary { cursor: pointer; color: #a7f3d0; }
  .motion-prompt-row label { padding-top: 6px; }
	.motion-prompt-row textarea { width: min(100%, 340px); min-height: 116px; padding: 6px 8px; resize: vertical; border: 1px solid rgba(74,222,128,.4); border-radius: 5px; color: #fff; background: rgba(6,78,59,.42); font: inherit; font-size: 12px; line-height: 1.5; }
  .motion-prompt-row textarea::placeholder { color: #94a3b8; opacity: 1; }
  .reference-image-selector { display: grid; gap: 6px; padding: 8px; border: 1px solid rgba(74,222,128,.22); border-radius: 6px; color: #d1fae5; font-size: 12px; }
  .reference-image-grid { display: flex; flex-wrap: wrap; gap: 6px; }
  .reference-image-grid figure, .reference-image-grid button { position: relative; margin: 0; padding: 0; border: 0; background: transparent; }
  .reference-image-grid img { width: 54px; height: 54px; object-fit: cover; border-radius: 4px; }
  .reference-image-grid figure button { position: absolute; top: -5px; right: -5px; width: 18px; height: 18px; padding: 0; border-radius: 50%; color: #fff; background: #b91c1c; }
  .reference-image-grid.available button span { position: absolute; inset: 0; display: grid; place-items: center; color: #fff; font-size: 24px; background: rgba(6,78,59,.52); border-radius: 4px; }
  .reference-image-picker { display: grid; gap: 7px; padding-top: 4px; border-top: 1px solid rgba(74,222,128,.18); }
  .reference-image-picker p { margin: 0; color: #a7f3d0; font-size: 11px; }
  .message-image-option { display: flex; align-items: center; gap: 7px; padding: 4px; text-align: left; }
  .message-image-option img { width: 38px; height: 38px; object-fit: cover; border-radius: 4px; }
  .media-store-debug { margin-top: 4px; padding-top: 9px; border-top: 1px solid rgba(74,222,128,.18); }
  .media-store-title, .media-store-empty { margin: 0; color: #a7f3d0; font-size: 11px; }
  .media-store-list { display: grid; gap: 6px; margin-top: 7px; }
  .media-store-item { display: flex; align-items: center; gap: 7px; color: #d1fae5; font-size: 11px; }
  .media-store-item img { height: 40px; aspect-ratio: 1; object-fit: cover; border-radius: 4px; }
  .media-store-item video { height: 72px; max-width: 128px; border-radius: 4px; background: #020617; }
  .media-store-item div { display: grid; gap: 2px; }
  .media-store-item code { color: #94a3b8; font: 10px ui-monospace, monospace; }
  .send-status { color: #86efac; font-size: 12px; }
  .video-progress { margin-top: 4px; accent-color: #4ade80; }
  @media (max-width: 640px) {
    .video-preview { align-items: stretch; }
    .video-preview video { width: 100%; }
  }
</style>
