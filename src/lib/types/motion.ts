/** 口形状の3段階 */
export type MouthShape = 'close' | 'mid' | 'open';

/** 1フレーム分のモーションデータ */
export interface MotionFrame {
  /** 動画内の時刻 (秒) */
  t: number;
  /** 口の開き具合 0.0〜1.0 (生値) */
  mouth: number;
  /** 口形状ラベル (mouth値から導出済み) */
  mouthShape: MouthShape;
  /** まばたき: 0=開 / 1=閉 */
  blink: 0 | 1;
  /** 頭部X方向揺れ -1.0〜1.0 */
  headX: number;
  /** 頭部Y方向揺れ -1.0〜1.0 */
  headY: number;
}

/** モーションクリップ全体 */
export interface MotionClip {
  meta: {
    /** フレームレート (fps) */
    fps: number;
    /** クリップ総尺 (秒) */
    duration: number;
    /** 元ファイル名やURL */
    source: string;
    /** キャラクター画像 base64 data URL (optional) */
    characterImage?: string;
    /** キャラクター名 (optional) */
    characterName?: string;
  };
  frames: MotionFrame[];
}
