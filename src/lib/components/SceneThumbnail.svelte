<script lang="ts">
	import { onMount } from 'svelte';

	let {
		src,
		alt,
		panel,
		bounds,
		onclick,
	}: {
		src: string;
		alt: string;
		panel: string;
		bounds?: { panelId?: string; sourceSheetIndex?: number; x: number; y: number; width: number; height: number };
		onclick?: () => void;
	} = $props();

	let canvas = $state<HTMLCanvasElement>();
	let mounted = $state(false);

	function draw(): void {
		if (!mounted || !canvas || !src) return;
		const image = new Image();
		image.onload = () => {
			const context = canvas?.getContext('2d');
			if (!canvas || !context) return;
			// Missing legacy bounds must never trigger an invented equal-grid crop.
			// Showing the complete source sheet is safer than cutting a panel midway.
			const crop = bounds ?? { x: 0, y: 0, width: 1, height: 1 };
			const sourceWidth = crop.width * image.naturalWidth;
			const sourceHeight = crop.height * image.naturalHeight;
			const scale = Math.min(canvas.width / sourceWidth, canvas.height / sourceHeight);
			const targetWidth = sourceWidth * scale;
			const targetHeight = sourceHeight * scale;
			const targetX = (canvas.width - targetWidth) / 2;
			const targetY = (canvas.height - targetHeight) / 2;
			context.clearRect(0, 0, canvas.width, canvas.height);
			context.drawImage(
				image,
				crop.x * image.naturalWidth,
				crop.y * image.naturalHeight,
				crop.width * image.naturalWidth,
				crop.height * image.naturalHeight,
				targetX,
				targetY,
				targetWidth,
				targetHeight,
			);
		};
		image.src = src;
	}

	onMount(() => {
		mounted = true;
		draw();
	});

	$effect(() => {
		src;
		bounds;
		draw();
	});
</script>

<button class="scene-thumbnail" type="button" {onclick} aria-label={`${panel}をAnimation Sheetで開く`}>
	<canvas bind:this={canvas} width="640" height="360" aria-label={alt}></canvas>
	<span>{panel}</span>
</button>

<style>
	.scene-thumbnail { position: relative; width: 100%; height: 112px; padding: 0; overflow: hidden; border: 1px solid rgba(34,211,238,.3); border-radius: 6px; background: #020617; cursor: zoom-in; }
	canvas { width: 100%; height: 100%; object-fit: cover; }
	span { position: absolute; left: 6px; bottom: 6px; padding: 2px 6px; border-radius: 999px; color: #ecfeff; background: rgba(8,47,73,.88); font-size: 10px; font-weight: 900; }
</style>
