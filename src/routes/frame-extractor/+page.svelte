<script lang="ts">
  let video: HTMLVideoElement;
  let canvas: HTMLCanvasElement;
  let ctx: CanvasRenderingContext2D;

  let currentTime = 0;

  function onLoaded() {
    ctx = canvas.getContext("2d")!;
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
  }

  function seekFrame() {
    video.currentTime = currentTime;
  }

  function drawFrame() {
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
  }

  function capture() {
    drawFrame();
    const url = canvas.toDataURL("image/png");

    const a = document.createElement("a");
    a.href = url;
    a.download = `frame_${Date.now()}.png`;
    a.click();
  }
</script>

<style>
  .container {
    display: flex;
    flex-direction: column;
    gap: 10px;
    max-width: 800px;
    margin: auto;
  }

  video, canvas {
    width: 100%;
    border-radius: 10px;
  }
</style>

<div class="container">
  <h2>🎬 フレーム抽出ツール</h2>

  <video
    bind:this={video}
    src="/grok.mp4"
    controls
    on:loadeddata={onLoaded}
  />

  <input
    type="range"
    min="0"
    max={video?.duration || 0}
    step="0.01"
    bind:value={currentTime}
    on:input={seekFrame}
  />

  <button on:click={drawFrame}>
    🖼 フレーム表示
  </button>

  <button on:click={capture}>
    📸 画像保存
  </button>

  <canvas bind:this={canvas}></canvas>
</div>