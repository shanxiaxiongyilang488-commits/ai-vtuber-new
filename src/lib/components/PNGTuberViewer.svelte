<script lang="ts">
  import { onMount, onDestroy } from 'svelte';

  // ── Props ───────────────────────────────────────────────────────
  let {
    src             = '',
    isSpeaking      = false,
    isThinking      = false,
    emotion         = 'neutral',
    audioEl         = null as HTMLAudioElement | null,
    enableBlink     = true,
    enableLipsync   = true,
    scale           = 1.0,
    offsetY         = 0,
    shakeIntensity  = 1.0,
  }: {
    src?:            string;
    isSpeaking?:     boolean;
    isThinking?:     boolean;
    emotion?:        string;
    audioEl?:        HTMLAudioElement | null;
    enableBlink?:    boolean;
    enableLipsync?:  boolean;
    scale?:          number;
    offsetY?:        number;
    shakeIntensity?: number;
  } = $props();

  // ── フォールバックレベル ─────────────────────────────────────────
  // 0 = 3状態 PNG (_idle / _speak / _blink)
  // 1 = 単体 PNG (src + '.png')
  // 2 = /avatars/default.png
  let fallbackLevel    = $state(0);
  let emotionImgFailed = $state(false);

  // src が切り替わったらフォールバックを全リセット
  $effect(() => { void src; fallbackLevel = 0; emotionImgFailed = false; });
  // emotion が変わったら感情フォールバックだけリセット
  $effect(() => { void emotion; emotionImgFailed = false; });

  // ── まばたきスケジューラー ─────────────────────────────────────
  // 2〜5秒ごとに blink.png を 100ms だけ表示。
  // speaking / thinking 中はスキップして次の周期へ。
  let blinking = $state(false);
  let _active  = false;
  let _blinkOpenTimer:  ReturnType<typeof setTimeout> | null = null;
  let _blinkCloseTimer: ReturnType<typeof setTimeout> | null = null;

  function cancelBlinkTimers() {
    if (_blinkOpenTimer  !== null) { clearTimeout(_blinkOpenTimer);  _blinkOpenTimer  = null; }
    if (_blinkCloseTimer !== null) { clearTimeout(_blinkCloseTimer); _blinkCloseTimer = null; }
  }

  function scheduleBlink() {
    cancelBlinkTimers();
    const delay = 2000 + Math.random() * 3000;   // 2〜5秒間隔
    _blinkOpenTimer = setTimeout(() => {
      _blinkOpenTimer = null;
      if (!_active) return;
      if (!enableBlink || isThinking || isSpeaking) {
        scheduleBlink();
        return;
      }
      blinking = true;
      _blinkCloseTimer = setTimeout(() => {
        _blinkCloseTimer = null;
        if (!_active) return;
        blinking = false;
        scheduleBlink();
      }, 100);   // 100ms だけ目を閉じる
    }, delay);
  }

  // ── 口パクフレーム交互切替（talk_a ↔ talk_i） ─────────────────
  // isSpeaking=true の間だけ 150ms 間隔で talk_a / talk_i を交互に切り替える。
  // isSpeaking=false になった瞬間インターバルを破棄して talk_a に戻す。
  let talkFrame = $state(false);   // false=talk_a, true=talk_i

  $effect(() => {
    if (!isSpeaking || !enableLipsync) {
      talkFrame = false;
      return;
    }
    talkFrame = false;
    const t = setInterval(() => { talkFrame = !talkFrame; }, 150);
    return () => clearInterval(t);
  });

  // ── 音量解析による口パク（audioEl オプション） ──────────────────
  // audioEl なしでも isSpeaking=true で口パク演出は動く。
  // audioEl を渡すと振幅ベースで口開閉がより自然になる（将来拡張）
  let _audioCtx: AudioContext | null = null;
  let _rafId:    number         | null = null;

  $effect(() => {
    // 既存セッションを閉じてからリセット
    if (_rafId !== null) { cancelAnimationFrame(_rafId); _rafId = null; }
    if (_audioCtx) { _audioCtx.close().catch(() => {}); _audioCtx = null; }

    if (!audioEl || !isSpeaking) return;

    try {
      const ctx      = new AudioContext();
      const analyser = ctx.createAnalyser();
      analyser.fftSize = 256;
      ctx.createMediaElementSource(audioEl).connect(analyser);
      analyser.connect(ctx.destination);
      _audioCtx = ctx;

      const buf = new Uint8Array(analyser.frequencyBinCount);
      const tick = () => {
        if (!_audioCtx) return;
        analyser.getByteFrequencyData(buf);
        // 将来: 振幅に応じて _speak / _idle を切り替える拡張ポイント
        _rafId = requestAnimationFrame(tick);
      };
      _rafId = requestAnimationFrame(tick);
    } catch { /* SSR / 権限エラーは無視 */ }
  });

  // ── 表示画像決定 ─────────────────────────────────────────────────
  // 優先順位: フォールバック > speaking(talk_a/talk_i) > blink > 感情 > idle
  // speaking=false かつ blinking=false かつ emotion=neutral → idle.png 固定
  const imgSrc = $derived(
    fallbackLevel === 2 ? '/avatars/default.png'
    : fallbackLevel === 1 ? `${src}.png`
    : (isSpeaking && enableLipsync)                ? `${src}/${talkFrame ? 'talk_i' : 'talk_a'}.png`
    : (blinking && enableBlink && !isThinking)     ? `${src}/blink.png`
    : (emotion !== 'neutral' && !emotionImgFailed) ? `${src}/${emotion}.png`
    : `${src}/idle.png`
  );

  // 画像が存在しない場合のフォールバック処理
  function onImgError() {
    // level 0 の感情画像失敗 → idle に戻すだけ（level は上げない）
    if (fallbackLevel === 0 && !isSpeaking && !blinking && emotion !== 'neutral' && !emotionImgFailed) {
      emotionImgFailed = true;
    } else if (fallbackLevel < 2) {
      fallbackLevel++;   // idle/blink/talk が失敗 → 既存フラットPNG → default.png
    }
  }

  onMount(() => {
    _active = true;
    scheduleBlink();
  });

  onDestroy(() => {
    _active = false;
    cancelBlinkTimers();
    if (_rafId !== null) cancelAnimationFrame(_rafId);
    if (_audioCtx) _audioCtx.close().catch(() => {});
  });
</script>

<!-- ── Template ── -->
<div
  class="png-tuber-wrap"
  class:speaking={isSpeaking}
  class:thinking={isThinking}
  style="--png-scale:{scale};--png-offset-y:{offsetY}px;--png-shake:{shakeIntensity}"
>
  <img
    src={imgSrc}
    alt=""
    class="png-tuber-img"
    class:anim-speak={isSpeaking && enableLipsync}
    onerror={onImgError}
  />
  {#if isThinking}
    <div class="think-glow" aria-hidden="true"></div>
  {/if}
</div>

<style>
  /* ── コンテナ ─────────────────────────────────────────────────── */
  .png-tuber-wrap {
    position: relative;
    width: 100%;
    height: 100%;
    display: flex;
    align-items: center;
    justify-content: center;
    overflow: hidden;
  }

  /* ── キャラ画像 ────────────────────────────────────────────────── */
  .png-tuber-img {
    max-width: 100%;
    max-height: 100%;
    object-fit: contain;
    user-select: none;
    pointer-events: none;
    transform: scale(var(--png-scale, 1)) translateY(var(--png-offset-y, 0px));
    transform-origin: center bottom;
    transition: transform 0.1s ease;
  }

  /* 発話中: 揺れ強度に応じたグロー */
  .png-tuber-img.anim-speak {
    animation: speak-glow calc(0.18s / max(var(--png-shake, 1), 0.1)) ease-in-out infinite;
  }

  /* ── thinking グロー ────────────────────────────────────────────── */
  .think-glow {
    position: absolute;
    inset: 0;
    pointer-events: none;
    border-radius: 8px;
    animation: think-pulse 0.85s ease-in-out infinite;
  }

  /* ── アニメーション定義 ─────────────────────────────────────────── */
  @keyframes speak-glow {
    0%,100% { filter: brightness(1);    }
    50%     { filter: brightness(1.06); }
  }

  @keyframes think-pulse {
    0%, 100% {
      box-shadow: 0 0 12px rgba(168, 85, 247, 0.15),
                  inset 0 0 0 1px rgba(168, 85, 247, 0.10);
    }
    50% {
      box-shadow: 0 0 30px rgba(168, 85, 247, 0.32),
                  inset 0 0 0 1px rgba(168, 85, 247, 0.22);
    }
  }
</style>
