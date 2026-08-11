<script lang="ts">
  import type { AvatarEmotion } from '$lib/aituber/types';
  import PuruPuruAvatar from './PuruPuruAvatar.svelte';

  interface Props {
    src: string;
    alt: string;
    speaking?: boolean;
    mouthLevel?: number;
    emotion?: AvatarEmotion;
    thinking?: boolean;
    modelKey?: string;
  }

  let { src, alt, speaking = false, mouthLevel = 0, emotion = 'neutral', thinking = false, modelKey = 'default' }: Props = $props();
</script>

<!-- 配信用の大型AITuber表示。チャットアイコン(72px)とは独立した矩形ステージで、全身/上半身が切れないようfit="contain"で描画する。 -->
<div class="aituber-stage" class:speaking>
  <PuruPuruAvatar {src} {alt} {speaking} {mouthLevel} {emotion} {thinking} {modelKey} fit="contain" />
</div>

<style>
  .aituber-stage {
    position: relative;
    width: 100%;
    height: clamp(400px, 56vh, 600px);
    overflow: hidden;
    border-radius: 10px;
    background: #020617;
    border: 1px solid rgba(34,211,238,.45);
    box-shadow: 0 0 16px rgba(34,211,238,.25), inset 0 0 10px rgba(34,211,238,.1);
    transition: border-color .2s ease, box-shadow .2s ease;
  }
  .aituber-stage.speaking { border-color: rgba(74,222,128,.72); box-shadow: 0 0 18px rgba(74,222,128,.24), inset 0 0 12px rgba(34,211,238,.12); }
  @media (max-width: 700px) { .aituber-stage { height: min(50vh, 420px); } }
</style>
