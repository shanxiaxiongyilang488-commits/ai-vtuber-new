<script lang="ts">
  import { onMount, onDestroy } from 'svelte';

  // ── Props ───────────────────────────────────────────────────────
  let {
    src        = '',      // 拡張子なしのベースパス例: /avatars/muryi
    isSpeaking = false,
    isThinking = false,
    emotion    = 'neutral',   // 感情名: 'smile' | 'angry' | 'sad' | 'blush' | ... | 'neutral'
    audioEl    = null as HTMLAudioElement | null,
  }: {
    src?:        string;
    isSpeaking?: boolean;
    isThinking?: boolean;
    emotion?:    string;
    audioEl?:    HTMLAudioElement | null;
  } = $props();

  // ── フォールバックレベル ─────────────────────────────────────────
  // 0 = 3状態 PNG (_idle / _speak / _blink)
  // 1 = 単体 PNG (src + '.png')
  // 2 = /avatars/default.png
  let fallbackLevel    = $state(0);
  let emotionImgFailed = $state(false);   // 感情画像が存在しない場合のフラグ

  // src が切り替わったらフォールバックを全リセット
  $effect(() => { void src; fallbackLevel = 0; emotionImgFailed = false; });
  // emotion が変わったら感情フォールバックだけリセット
  $effect(() => { void emotion; emotionImgFailed = false; });

  // ── まばたきスケジューラー ─────────────────────────────────────
  let blinking = $state(false);
  let _active  = false;
  let _bTimer: ReturnType<typeof setTimeout> | null = null;

  function scheduleBlink() {
    _bTimer = setTimeout(() => {
      if (!_active) return;
      // speaking / thinking 中はまばたきしない
      if (!isThinking && !isSpeaking) {
        blinking = true;
        _bTimer = setTimeout(() => {
          if (!_active) return;
          blinking = false;
          scheduleBlink();
        }, 130);                            // 目を閉じる時間 130ms
      } else {
        scheduleBlink();
      }
    }, 2500 + Math.random() * 3500);        // 2.5〜6秒間隔
  }

  // ── 口パクフレーム交互切替（talk_a ↔ talk_i） ─────────────────
  // isSpeaking 中に 150ms 間隔で talk_a / talk_i を交互に切り替える
  let talkFrame = $state(false);   // false=talk_a, true=talk_i

  $effect(() => {
    if (!isSpeaking) { talkFrame = false; return; }
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
  // 優先順位: speak(talk_a/talk_i 交互) > blink > 感情表情 > idle
  // fallback: level1=既存フラットPNG({src}.png) / level2=default.png
  const imgSrc = $derived(
    fallbackLevel === 2 ? '/avatars/default.png'
    : fallbackLevel === 1 ? `${src}.png`
    : isSpeaking                                   ? `${src}/${talkFrame ? 'talk_i' : 'talk_a'}.png`
    : (blinking && !isThinking)                    ? `${src}/blink.png`
    : (emotion !== 'neutral' && !emotionImgFailed) ? `${src}/${emotion}.png`
    : `${src}/idle.png`
  );

  // 画像が存在しない場合にフォールバックレベルを上げる
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
    if (_bTimer) clearTimeout(_bTimer);
    if (_rafId !== null) cancelAnimationFrame(_rafId);
    if (_audioCtx) _audioCtx.close().catch(() => {});
  });
</script>

<!-- ── Template ── -->
<div class="png-tuber-wrap" class:speaking={isSpeaking} class:thinking={isThinking}>
  <img
    src={imgSrc}
    alt=""
    class="png-tuber-img"
    class:anim-speak={isSpeaking}
    class:anim-blink={blinking && !isThinking && !isSpeaking}
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
  }

  /* 発話中: 縦バウンス（口パクの視覚的代替） */
  .png-tuber-img.anim-speak {
    animation: pngtuber-speak 0.30s ease-in-out infinite;
  }

  /* まばたき: Y 方向に瞬間的に縮める */
  .png-tuber-img.anim-blink {
    animation: pngtuber-blink 0.13s ease-in-out;
    transform-origin: 50% 28%;
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
  @keyframes pngtuber-speak {
    0%   { transform: translateY(0)    scaleY(1);    }
    20%  { transform: translateY(-3px) scaleY(1.01); }
    50%  { transform: translateY(0)    scaleY(0.99); }
    80%  { transform: translateY(-2px) scaleY(1.01); }
    100% { transform: translateY(0)    scaleY(1);    }
  }

  @keyframes pngtuber-blink {
    0%, 100% { transform: scaleY(1);    }
    40%, 60% { transform: scaleY(0.05); }
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
