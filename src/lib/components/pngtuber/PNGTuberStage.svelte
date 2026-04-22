<script lang="ts">
  import type { PNGTuberCharacter } from '$lib/types/pngtuber';
  import type { MouthShape } from '$lib/types/motion';

  interface Props {
    character:   PNGTuberCharacter;
    speaking:    boolean;
    mouthLevel:  number;
    /** 口形状を外部から直接指定する場合に使用（省略時は speaking+mouthLevel から導出） */
    mouthShape?: MouthShape;
    /** まばたき: 0=開 / 1=閉 (省略時 0) */
    blink?:  0 | 1;
    /** 頭部X揺れ -1〜1 (省略時 0) */
    headX?:  number;
    /** 頭部Y揺れ -1〜1 (省略時 0) */
    headY?:  number;
  }

  let {
    character,
    speaking,
    mouthLevel,
    mouthShape: mouthShapeProp = undefined,
    blink  = 0,
    headX  = 0,
    headY  = 0,
  }: Props = $props();

  function resolveMouthShape(active: boolean, level: number): MouthShape {
    if (!active || level < 0.25) return 'close';
    if (level < 0.6)             return 'mid';
    return 'open';
  }

  // $state にしてから $effect で更新 → props 変化を確実に追跡
  let resolvedMouthShape = $state<MouthShape>('close');
  let mouthSrc           = $state<string>('/mouth/mouth_close.png');

  $effect(() => {
    const shape: MouthShape = mouthShapeProp ?? resolveMouthShape(speaking, mouthLevel);
    resolvedMouthShape = shape;
    // 明示パスで切替 — URL が必ず変わるので img が確実に再描画される
    mouthSrc =
      shape === 'open' ? '/mouth/mouth_open.png' :
      shape === 'mid'  ? '/mouth/mouth_mid.png'  :
                         '/mouth/mouth_close.png';
  });

  // CSS アニメーション振れ幅 (character.motion パラメータから算出)
  const swayPx   = $derived((character.motion.swayScale    * 4).toFixed(1));
  const breathPx = $derived((character.motion.breathingScale * 5).toFixed(1));

  // モーションデータ由来の追加オフセット (headX/Y ×係数)
  const motionOffX = $derived((headX * 14 * character.motion.swayScale).toFixed(1));
  const motionOffY = $derived((headY *  8).toFixed(1));
</script>

<div class="stage">
  <!-- モーションデータ offset レイヤー -->
  <div
    class="motion-off"
    style="transform: translate({motionOffX}px, {motionOffY}px)"
  >
    <!-- 左右揺れ (CSS) -->
    <div class="sway" style="--sway-px:{swayPx}px">
      <!-- 呼吸 (CSS) -->
      <div class="breath" style="--breath-px:{breathPx}px">
        <div class="character">

          <!-- ベース -->
          <img
            src={character.assets.base}
            alt={character.name}
            class="layer base"
            draggable="false"
          />

          <!-- 目: blink で open/closed 切替 -->
          {#if blink === 1}
            <img
              src={character.assets.eyes.closed}
              alt="eyes closed"
              class="layer overlay"
              style="left:{character.layout.eyeX}px; top:{character.layout.eyeY}px"
              draggable="false"
            />
          {:else}
            <img
              src={character.assets.eyes.open}
              alt="eyes open"
              class="layer overlay"
              style="left:{character.layout.eyeX}px; top:{character.layout.eyeY}px"
              draggable="false"
            />
          {/if}

          <!-- 口 -->
          <img
            src={mouthSrc}
            alt="mouth {resolvedMouthShape}"
            class="layer overlay"
            style="left:{character.layout.mouthX}px; top:{character.layout.mouthY}px"
            draggable="false"
          />

        </div>
      </div>
    </div>
  </div>
</div>

<style>
  .stage {
    display: flex;
    align-items: center;
    justify-content: center;
    background: transparent;
    user-select: none;
  }

  .motion-off {
    transition: transform 0.05s linear;
  }

  /* ── 左右揺れ ── */
  .sway {
    animation: sway 4s ease-in-out infinite;
  }
  @keyframes sway {
    0%,  100% { transform: translateX(0)                               rotate(0deg);   }
    25%        { transform: translateX(var(--sway-px, 4px))            rotate(0.4deg); }
    75%        { transform: translateX(calc(var(--sway-px, 4px) * -1)) rotate(-0.4deg); }
  }

  /* ── 呼吸 ── */
  .breath {
    animation: breath 3s ease-in-out infinite;
  }
  @keyframes breath {
    0%,  100% { transform: translateY(0); }
    50%        { transform: translateY(calc(var(--breath-px, 5px) * -1)); }
  }

  /* ── キャラコンテナ ── */
  .character {
    position: relative;
    width: 400px;
  }

  .base {
    display: block;
    width: 100%;
    height: auto;
  }

  .overlay {
    position: absolute;
  }

  .layer {
    image-rendering: pixelated;
    pointer-events: none;
  }
</style>
