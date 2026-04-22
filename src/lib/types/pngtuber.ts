/** キャラクターの感情状態 */
export type EmotionType = 'neutral' | 'happy' | 'sad' | 'angry' | 'shy';

/** PNGTuberキャラクター定義 */
export interface PNGTuberCharacter {
  /** キャラクター一意ID */
  id: string;
  /** 表示名 */
  name: string;

  /** 使用する画像アセットのパス群 */
  assets: {
    /** ベースレイヤー (体・背景) */
    base: string;
    mouth: {
      /** 口閉じ */
      close: string;
      /** 口半開き */
      mid: string;
      /** 口全開き */
      open: string;
    };
    eyes: {
      /** 目開き */
      open: string;
      /** 目閉じ (まばたき) */
      closed: string;
    };
  };

  /** 各パーツの配置オフセット (px, キャンバス左上原点) */
  layout: {
    /** 口パーツ X */
    mouthX: number;
    /** 口パーツ Y */
    mouthY: number;
    /** 目パーツ X */
    eyeX: number;
    /** 目パーツ Y */
    eyeY: number;
  };

  /** モーション挙動パラメータ */
  motion: {
    /** 体の揺れスケール係数 (1.0 = 標準) */
    swayScale: number;
    /** まばたき保持時間 (ms) */
    blinkHoldMs: number;
    /** 呼吸アニメーション拡縮係数 (1.0 = 無効) */
    breathingScale: number;
  };
}
