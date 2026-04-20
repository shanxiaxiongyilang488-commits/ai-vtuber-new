<script lang="ts">
  import { onMount } from 'svelte';

  interface Props {
    videoSrc?: string;
    trackSrc?: string;
    mouthDir?: string;
    mouthState?: 'closed' | 'half' | 'open' | 'u' | 'e';
    width?: number;
    height?: number;
  }

  let {
    videoSrc = '/asmr_tomari/asmr_loop_mouthless_h264.mp4',
    trackSrc = '/asmr_tomari/mouth_track.json',
    mouthDir = '/asmr_tomari/mouth',
    mouthState = 'closed',
    width = 960,
    height = 540,
  }: Props = $props();

  interface QuadFrame {
    quad: [[number, number], [number, number], [number, number], [number, number]];
    valid: boolean;
  }

  interface MouthTrackData {
    fps: number;
    width: number;
    height: number;
    frames: QuadFrame[];
  }

  let mounted = $state(false);
  let videoEl: HTMLVideoElement;
  let canvasEl: HTMLCanvasElement;
  let track: MouthTrackData | null = null;
  let filledQuads: QuadFrame['quad'][] = [];
  let mouthImages: Record<string, HTMLImageElement> = {};
  let rafId = 0;
  let ctx: CanvasRenderingContext2D | null = null;

  const MOUTH_STATES: Props['mouthState'][] = ['closed', 'half', 'open', 'u', 'e'];

  async function loadTrack() {
    const res = await fetch(trackSrc);
    track = await res.json() as MouthTrackData;
    filledQuads = buildFilledQuads(track.frames);
  }

  function buildFilledQuads(frames: QuadFrame[]): QuadFrame['quad'][] {
    const N = frames.length;
    const result: QuadFrame['quad'][] = new Array(N);
    let last = -1;

    // forward fill
    for (let i = 0; i < N; i++) {
      if (frames[i].valid) {
        last = i;
        result[i] = frames[i].quad;
      } else if (last >= 0) {
        result[i] = result[last];
      }
    }

    // backward fill for leading invalid frames
    const firstValid = frames.findIndex(f => f.valid);
    if (firstValid > 0) {
      for (let i = 0; i < firstValid; i++) {
        result[i] = result[firstValid];
      }
    }

    return result;
  }

  async function loadMouthImages() {
    await Promise.all(
      MOUTH_STATES.map(state =>
        new Promise<void>((resolve) => {
          const img = new Image();
          img.onload = () => { mouthImages[state!] = img; resolve(); };
          img.onerror = () => resolve();
          img.src = `${mouthDir}/${state}.png`;
        })
      )
    );
  }

  // Warp one triangle of the mouth image onto the canvas using affine transform.
  // src: three corners in image space; dst: corresponding corners in canvas space.
  function warpTriangle(
    c: CanvasRenderingContext2D, img: HTMLImageElement,
    sx0: number, sy0: number, sx1: number, sy1: number, sx2: number, sy2: number,
    dx0: number, dy0: number, dx1: number, dy1: number, dx2: number, dy2: number
  ) {
    const D = sx0 * (sy1 - sy2) + sx1 * (sy2 - sy0) + sx2 * (sy0 - sy1);
    if (Math.abs(D) < 1e-6) return;
    const a  = (dx0 * (sy1 - sy2) + dx1 * (sy2 - sy0) + dx2 * (sy0 - sy1)) / D;
    const b  = (dy0 * (sy1 - sy2) + dy1 * (sy2 - sy0) + dy2 * (sy0 - sy1)) / D;
    const cc = (sx0 * (dx1 - dx2) + sx1 * (dx2 - dx0) + sx2 * (dx0 - dx1)) / D;
    const d  = (sx0 * (dy1 - dy2) + sx1 * (dy2 - dy0) + sx2 * (dy0 - dy1)) / D;
    const e  = dx0 - a * sx0 - cc * sy0;
    const f  = dy0 - b * sx0 - d  * sy0;
    c.save();
    c.beginPath();
    c.moveTo(dx0, dy0); c.lineTo(dx1, dy1); c.lineTo(dx2, dy2);
    c.closePath();
    c.clip();
    c.setTransform(a, b, cc, d, e, f);
    c.drawImage(img, 0, 0);
    c.restore();
  }

  function drawFrame() {
    if (!ctx || !track || !videoEl || filledQuads.length === 0) {
      rafId = requestAnimationFrame(drawFrame);
      return;
    }

    const frameIdx = Math.floor(videoEl.currentTime * track.fps) % filledQuads.length;
    const quad = filledQuads[frameIdx];
    if (!quad) {
      rafId = requestAnimationFrame(drawFrame);
      return;
    }

    ctx.clearRect(0, 0, width, height);

    const img = mouthImages[mouthState];
    if (!img) {
      rafId = requestAnimationFrame(drawFrame);
      return;
    }

    const scaleX = width  / track.width;
    const scaleY = height / track.height;
    const [tl, tr, br, bl] = quad.map(([x, y]) => [x * scaleX, y * scaleY] as [number, number]);
    const iW = img.naturalWidth;
    const iH = img.naturalHeight;

    // Perspective quad warp: split into 2 triangles, affine-warp each half
    // Triangle 1 — upper-left: image(0,0)(iW,0)(0,iH) → quad tl,tr,bl
    warpTriangle(ctx, img,
        0,  0,  iW,  0,  0, iH,
      tl[0], tl[1], tr[0], tr[1], bl[0], bl[1]
    );
    // Triangle 2 — lower-right: image(iW,0)(iW,iH)(0,iH) → quad tr,br,bl
    warpTriangle(ctx, img,
      iW,  0, iW, iH,  0, iH,
      tr[0], tr[1], br[0], br[1], bl[0], bl[1]
    );

    rafId = requestAnimationFrame(drawFrame);
  }

  onMount(async () => {
    mounted = true;
    ctx = canvasEl.getContext('2d');
    await Promise.all([loadTrack(), loadMouthImages()]);
    videoEl.play().catch(() => {});
    rafId = requestAnimationFrame(drawFrame);
    return () => cancelAnimationFrame(rafId);
  });
</script>

<div class="viewer" style="width:{width}px; height:{height}px;">
  {#if mounted}
    <!-- svelte-ignore a11y_media_has_caption -->
    <video
      bind:this={videoEl}
      src={videoSrc}
      {width}
      {height}
      loop
      muted
      playsinline
      class="bg-video"
    ></video>
    <canvas
      bind:this={canvasEl}
      {width}
      {height}
      class="mouth-canvas"
    ></canvas>
  {/if}
</div>

<style>
  .viewer {
    position: relative;
    display: inline-block;
    overflow: hidden;
  }
  .bg-video {
    display: block;
    width: 100%;
    height: 100%;
    object-fit: contain;
  }
  .mouth-canvas {
    position: absolute;
    top: 0;
    left: 0;
    width: 100%;
    height: 100%;
    pointer-events: none;
  }
</style>
