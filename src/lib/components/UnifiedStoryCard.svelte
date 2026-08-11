<script lang="ts">
	import SceneThumbnail from './SceneThumbnail.svelte';

	type TimelineCut = {
		id?: string;
		eventType?: 'story_event' | 'scene_transition' | 'character_action';
		storyEvent?: string;
		sceneTransition?: string;
		requiredEvent?: boolean;
		characters?: string[];
		title?: string;
		summary?: string;
		description?: string;
		time?: string;
		duration?: number;
		camera?: string;
		motion?: string;
		action?: string;
		dialogue?: string;
		tags?: string[];
		thumbnailUrl?: string;
		sourcePanel?: string;
		sourceSheetId?: string;
		panelBounds?: { panelId?: string; sourceSheetIndex?: number; x: number; y: number; width: number; height: number };
	};

	let {
		kind,
		title,
		characters,
		length,
		summary,
		sceneCount,
		cuts = [],
		onthumbnailclick,
		onpreview,
		onsavescene,
		canPreview = false,
	}: {
		kind: 'video' | 'manga' | 'voice' | 'experiment';
		title: string;
		characters: string;
		length: string;
		summary: string;
		sceneCount: string;
		cuts?: TimelineCut[];
		onthumbnailclick?: (cut: TimelineCut, index: number) => void;
		onpreview?: (cut: TimelineCut, index: number) => void;
		onsavescene?: (cut: TimelineCut, index: number) => void;
		canPreview?: boolean;
	} = $props();

	const icon = $derived({ video: '🎬', manga: '📖', voice: '🎵', experiment: '🧪' }[kind]);
	const kindLabel = $derived(kind === 'video' ? 'SCENE TIMELINE' : 'STORY CARD');
	const shortSummary = $derived(summary.slice(0, 40));
	let expanded = $state<Record<number, boolean>>({});
	let currentScene = $state(0);
	let editingScene = $state<number | null>(null);
	let editDraft = $state<TimelineCut | null>(null);
	let editCharactersDraft = $state('');

	function timelineLabel(value: string | undefined): string {
		if (!value) return '';
		const pad = (part: string) => part.includes(':') ? part.trim().replace(/^(\d):/u, '0$1:') : `00:${part.trim().padStart(2, '0')}`;
		const [start, end] = value.split(/\s*(?:-|–|—|〜|~|to)\s*/iu);
		return start && end ? `${pad(start)}〜${pad(end)}` : value;
	}

	function jumpToScene(index: number): void {
		currentScene = index;
		document.getElementById(`timeline-scene-${index}`)?.scrollIntoView({ behavior: 'smooth', block: 'center' });
	}

	function updateCurrentSceneFromScroll(event: Event): void {
		const container = event.currentTarget as HTMLElement;
		const rows = Array.from(container.querySelectorAll<HTMLElement>('.cut-row'));
		if (rows.length === 0) return;
		const target = container.scrollTop + container.clientHeight * 0.35;
		let closestIndex = 0;
		let closestDistance = Number.POSITIVE_INFINITY;
		rows.forEach((row, index) => {
			const distance = Math.abs(row.offsetTop - target);
			if (distance < closestDistance) { closestDistance = distance; closestIndex = index; }
		});
		currentScene = closestIndex;
	}

	function toggleScene(index: number): void {
		currentScene = index;
		expanded = { ...expanded, [index]: !expanded[index] };
	}

	function startEdit(cut: TimelineCut, index: number): void {
		editingScene = index;
		editDraft = { ...cut };
		editCharactersDraft = (cut.characters ?? []).join(', ');
		expanded = { ...expanded, [index]: true };
	}

	function saveEdit(index: number): void {
		if (!editDraft) return;
		const characters = editCharactersDraft.split(/[,、]/u).map((name) => name.trim()).filter(Boolean);
		onsavescene?.({ ...editDraft, characters }, index);
		editingScene = null;
		editDraft = null;
		editCharactersDraft = '';
	}

	function cancelEdit(): void {
		editingScene = null;
		editDraft = null;
		editCharactersDraft = '';
	}
</script>

<article class="card">
	<p class="kind">{icon} {kindLabel}</p>
	<div class="project-meta"><span>🏷️ {title}</span><span>👥 {characters}</span><span>⏱️ {length}</span><span>🎞️ {sceneCount}</span></div>
	{#if shortSummary}<p class="summary">{shortSummary}</p>{/if}

	{#if cuts.length > 0}
		<nav class="scene-navigator" aria-label="Scene Navigator">
			{#each cuts as _cut, index}
				<button type="button" class:active={currentScene === index} onclick={() => jumpToScene(index)}>{String(index + 1).padStart(2, '0')}</button>
			{/each}
		</nav>

		<div class="thumbnail-strip" aria-label="Thumbnail Strip">
			{#each cuts as cut, index (cut.id ?? `${index}-${cut.title ?? ''}`)}
				<div class:active={currentScene === index}>
					{#if cut.thumbnailUrl}
						<SceneThumbnail src={cut.thumbnailUrl} alt={`${cut.title || `SCENE${String(index + 1).padStart(2, '0')}`} source panel`} panel={cut.sourcePanel || `PANEL${String(index + 1).padStart(2, '0')}`} bounds={cut.panelBounds} onclick={() => jumpToScene(index)} />
					{:else}
						<button type="button" class="empty-panel" onclick={() => jumpToScene(index)}>{cut.sourcePanel || `PANEL${String(index + 1).padStart(2, '0')}`}</button>
					{/if}
				</div>
			{/each}
		</div>

		<div class="cut-list" aria-label="Scene Timeline" onscroll={updateCurrentSceneFromScroll}>
			{#each cuts as cut, index (cut.id ?? `${index}-${cut.title ?? cut.summary ?? ''}`)}
				<article id={`timeline-scene-${index}`} class="cut-row" class:current={currentScene === index}>
					<div class="scene-summary-row">
						<button class="scene-toggle" type="button" aria-expanded={Boolean(expanded[index])} onclick={() => toggleScene(index)}>
							<strong>SCENE{String(index + 1).padStart(2, '0')}</strong>
							<span>{cut.title || cut.summary || `Scene ${index + 1}`}{#if cut.requiredEvent}<small class="required-event">必須イベント</small>{/if}</span>
							{#if cut.time}<time>{timelineLabel(cut.time)}</time>{/if}
							<i>{expanded[index] ? '▾' : '▸'}</i>
						</button>
						<div class="scene-quick-actions">
							<button type="button" disabled={!canPreview} onclick={() => onpreview?.(cut, index)}>▶ Preview</button>
							<button type="button" onclick={() => startEdit(cut, index)}>✏ Edit Scene</button>
							<button type="button" class="panel-link" onclick={() => onthumbnailclick?.(cut, index)}>{cut.sourcePanel || `PANEL${String(index + 1).padStart(2, '0')}`}</button>
						</div>
					</div>

					{#if expanded[index]}
						{#if editingScene === index && editDraft}
							<div class="scene-editor">
								<label><span>title</span><input bind:value={editDraft.title} /></label>
								<label><span>characters</span><input bind:value={editCharactersDraft} placeholder="Lucia, Nula（カンマ区切り）" /></label>
								<label><span>camera</span><textarea bind:value={editDraft.camera}></textarea></label>
								<label><span>motion</span><textarea bind:value={editDraft.motion}></textarea></label>
								<label><span>dialogue</span><textarea bind:value={editDraft.dialogue}></textarea></label>
								<div><button type="button" onclick={cancelEdit}>キャンセル</button><button type="button" onclick={() => saveEdit(index)}>保存してMotion Prompt再生成</button></div>
							</div>
						{:else}
							{#if cut.description || cut.summary}<p>{cut.description || cut.summary}</p>{/if}
							<dl>
								{#if cut.storyEvent}<div><dt>story event</dt><dd>{cut.storyEvent}</dd></div>{/if}
								{#if cut.sceneTransition}<div><dt>transition</dt><dd>{cut.sceneTransition}</dd></div>{/if}
								{#if cut.characters?.length}<div><dt>characters</dt><dd>{cut.characters.join(', ')}</dd></div>{/if}
								<div><dt>duration</dt><dd>{cut.duration ?? '未設定'}{typeof cut.duration === 'number' ? 's' : ''}</dd></div>
								<div><dt>camera</dt><dd>{cut.camera || '未設定'}</dd></div>
								<div><dt>motion</dt><dd>{cut.motion || cut.action || cut.description || cut.summary || '未設定'}</dd></div>
								<div><dt>dialogue</dt><dd>{cut.dialogue || '（台詞なし）'}</dd></div>
							</dl>
							{#if cut.tags?.length}<div class="scene-tags">{#each cut.tags as tag (tag)}<span>#{tag}</span>{/each}</div>{/if}
						{/if}
					{/if}
				</article>
			{/each}
		</div>
	{/if}
</article>

<style>
	.card { padding: 12px; border: 1px solid rgba(125,211,252,.32); border-radius: 10px; background: rgba(8,47,73,.18); }
	p { margin: 5px 0; color:#e0f2fe; font-size:13px; line-height:1.45; }
	.kind { color:#7dd3fc; font-size:11px; font-weight:800; letter-spacing:.08em; }
	.project-meta { display: flex; flex-wrap: wrap; gap: 5px 12px; color: #bae6fd; font-size: 11px; }
	.summary { color: #94a3b8; }
	button, input, textarea { border:1px solid rgba(125,211,252,.35); border-radius:5px; padding:6px 9px; color:#e0f2fe; background:rgba(14,116,144,.18); font: inherit; }
	button { cursor:pointer; }
	button:disabled { cursor: not-allowed; opacity: .38; }
	.scene-navigator { position: sticky; top: 0; z-index: 4; display: flex; gap: 5px; margin-top: 10px; padding: 7px; overflow-x: auto; border: 1px solid rgba(34,211,238,.2); border-radius: 7px; background: rgba(2,6,23,.92); }
	.scene-navigator button { min-width: 34px; padding: 5px; color: #94a3b8; }
	.scene-navigator button.active { border-color: #22d3ee; color: #ecfeff; background: rgba(14,116,144,.4); box-shadow: 0 0 8px rgba(34,211,238,.25); }
	.thumbnail-strip { display: flex; gap: 7px; margin-top: 8px; padding: 8px; overflow-x: auto; scroll-snap-type: x proximity; border-bottom: 1px solid rgba(34,211,238,.14); }
	.thumbnail-strip > div { flex: 0 0 150px; padding: 3px; border: 1px solid transparent; border-radius: 7px; scroll-snap-align: start; }
	.thumbnail-strip > div.active { border-color: #22d3ee; background: rgba(14,116,144,.12); }
	.thumbnail-strip :global(.scene-thumbnail) { height: 84px; }
	.empty-panel { width: 100%; height: 84px; }
	.cut-list { display: grid; gap: 6px; margin-top: 9px; max-height: 560px; overflow-y: auto; scroll-behavior: smooth; }
	.cut-row { display: grid; gap: 7px; padding: 8px; border: 1px solid rgba(125,211,252,.18); border-radius: 6px; color: #e0f2fe; font-size: 12px; scroll-margin-block: 90px; }
	.cut-row.current { border-color: rgba(34,211,238,.55); box-shadow: inset 3px 0 #22d3ee; }
	.scene-summary-row { display: grid; grid-template-columns: minmax(0, 1fr) auto; gap: 8px; align-items: center; }
	.scene-toggle { display: grid; grid-template-columns: auto minmax(0,1fr) auto auto; gap: 8px; align-items: center; margin: 0; padding: 6px; text-align: left; border: 0; background: transparent; }
	.scene-toggle strong { color: #67e8f9; }
	.scene-toggle span { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
	.required-event { display: inline-block; margin-left: 7px; padding: 2px 6px; border: 1px solid rgba(251,191,36,.55); border-radius: 999px; color: #fde68a; background: rgba(120,53,15,.28); font-size: 9px; line-height: 1.2; vertical-align: 1px; }
	.scene-toggle time { color: #93c5fd; font-size: 11px; }
	.scene-toggle i { color: #67e8f9; font-style: normal; }
	.scene-quick-actions { display: flex; flex-wrap: wrap; justify-content: flex-end; gap: 4px; }
	.scene-quick-actions button { margin: 0; padding: 4px 6px; font-size: 10px; }
	.panel-link { color: #67e8f9 !important; }
	.cut-row p { margin: 0; color: #dbeafe; }
	.cut-row dl { display: grid; gap: 4px; margin: 0; }
	.cut-row dl div { display: grid; grid-template-columns: 66px minmax(0, 1fr); gap: 7px; }
	.cut-row dt { color: #67e8f9; font: 700 11px ui-monospace, monospace; }
	.cut-row dd { margin: 0; color: #e2e8f0; overflow-wrap: anywhere; white-space: pre-wrap; }
	.scene-tags { display: flex; flex-wrap: wrap; gap: 4px; }
	.scene-tags span { padding: 2px 6px; border-radius: 999px; color: #a5f3fc; background: rgba(14,116,144,.2); font-size: 10px; }
	.scene-editor { display: grid; gap: 7px; padding: 8px; border: 1px solid rgba(251,191,36,.25); border-radius: 6px; background: rgba(120,53,15,.08); }
	.scene-editor label { display: grid; grid-template-columns: 68px minmax(0,1fr); gap: 7px; align-items: start; }
	.scene-editor label span { padding-top: 6px; color: #fde68a; font: 700 10px ui-monospace, monospace; }
	.scene-editor input, .scene-editor textarea { width: 100%; box-sizing: border-box; color: #fff; background: rgba(2,6,23,.72); }
	.scene-editor textarea { min-height: 60px; resize: vertical; }
	.scene-editor > div { display: flex; justify-content: flex-end; gap: 6px; }
	@media (max-width: 680px) { .scene-summary-row { grid-template-columns: 1fr; } .scene-quick-actions { justify-content: flex-start; } .scene-toggle { grid-template-columns: auto minmax(0,1fr) auto; } .scene-toggle time { grid-column: 2; } }
</style>
