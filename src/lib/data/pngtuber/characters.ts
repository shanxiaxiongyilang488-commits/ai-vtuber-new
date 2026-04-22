import type { PNGTuberCharacter } from '$lib/types/pngtuber';

/** muryi キャラクター定義
 *  各レイヤーはフルボディ透過 PNG を left:0 top:0 で重ねる構成。
 *  layout は全 0 (オーバーレイをキャラ左上に配置)。
 */
export const muryi: PNGTuberCharacter = {
  id: 'muryi',
  name: 'Muryi',
  assets: {
    base: '/avatars/muryi/idle.png',
    mouth: {
      close: '/avatars/muryi/idle.png',    // 口閉じ = idle と同じ
      mid:   '/avatars/muryi/talk_i.png',  // 口半開き
      open:  '/avatars/muryi/talk_a.png',  // 口全開き
    },
    eyes: {
      open:   '/avatars/muryi/idle.png',   // 目開き = idle と同じ
      closed: '/avatars/muryi/blink.png',  // まばたき
    },
  },
  layout: {
    mouthX: 0,
    mouthY: 0,
    eyeX:   0,
    eyeY:   0,
  },
  motion: {
    swayScale:      1.0,
    blinkHoldMs:    120,
    breathingScale: 1.008,
  },
};

/** risea キャラクター定義
 *  現時点では単一画像のみ存在。表情差分が追加されたら更新すること。
 */
export const risea: PNGTuberCharacter = {
  id: 'risea',
  name: 'Risea',
  assets: {
    base: '/avatars/risea.png',
    mouth: {
      close: '/avatars/risea.png',
      mid:   '/avatars/risea.png',
      open:  '/avatars/risea.png',
    },
    eyes: {
      open:   '/avatars/risea.png',
      closed: '/avatars/risea.png',
    },
  },
  layout: {
    mouthX: 0,
    mouthY: 0,
    eyeX:   0,
    eyeY:   0,
  },
  motion: {
    swayScale:      1.2,
    blinkHoldMs:    100,
    breathingScale: 1.01,
  },
};

/** 全キャラクターのマップ (id → 定義) */
export const characters: Record<string, PNGTuberCharacter> = {
  [muryi.id]: muryi,
  [risea.id]: risea,
};

/** キャラクターIDの配列 */
export const characterIds = Object.keys(characters) as string[];
