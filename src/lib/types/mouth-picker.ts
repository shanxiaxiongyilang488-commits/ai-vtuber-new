export type { MouthShape } from './motion';

import type { MouthShape } from './motion';

/** フレーム名 → MouthShape のマップ */
export type TagMap = Record<string, MouthShape>;

/** UIラベルと内部MouthShapeの対応。"half" は表示用で保存値は "mid" */
export const MOUTH_LABELS = [
  { label: 'OPEN',  shape: 'open'  as MouthShape, key: 'O' },
  { label: 'HALF',  shape: 'mid'   as MouthShape, key: 'H' },
  { label: 'CLOSE', shape: 'close' as MouthShape, key: 'C' },
] as const;

/** エクスポートマニフェスト（会話UI連携用） */
export interface ExportManifest {
  close: string;
  mid:   string;
  open:  string;
}

/** mouth_picker/frames API のレスポンス */
export interface FramesResponse {
  files: string[];
  count: number;
  error?: string;
}

/** mouth_picker/export API のレスポンス */
export interface ExportResponse {
  ok: boolean;
  manifest?: ExportManifest;
  error?: string;
}

/* ── 二軸タグ(目×口)モデル v2 ─────────────────────────
 * 旧 open/mid/close(口のみ)を置き換える内部表現。
 * /static/ エクスポートAPIとの通信は mouthStateToShape() で旧形式へ変換する。
 */

export type EyeState = 'eyes_open' | 'eyes_closed';
export type MouthOpenState = 'mouth_closed' | 'mouth_half' | 'mouth_open';
/** 6状態ID(`${EyeState}__${MouthOpenState}`) */
export type FaceStateId = `${EyeState}__${MouthOpenState}`;

export type TagSource = 'manual' | 'auto';

export interface FrameTag {
  eyes: EyeState;
  mouth: MouthOpenState;
  /** manual=ユーザー確定 / auto=自動分類(Phase 2) */
  source: TagSource;
  /** trueの間は自動分類の再実行で上書きしない */
  locked: boolean;
  /** 自動分類の信頼度 0..1(Phase 2で使用) */
  confidence?: number;
}

/** フレーム名 → FrameTag */
export type FrameTagMap = Record<string, FrameTag>;

export type PickerMode = 'manual' | 'auto-assist' | 'auto';

export const PICKER_MODES: { id: PickerMode; label: string; description: string }[] = [
  { id: 'manual', label: '手動', description: 'フレームを見ながら目と口を手動で設定します' },
  { id: 'auto-assist', label: '自動補助', description: '自動解析で候補を提示し、採用したものだけ確定します(解析は Phase 2 で実装)' },
  { id: 'auto', label: '自動', description: '自動解析で6状態を仮選択します(解析は Phase 2 で実装)' },
];

export const EYE_STATE_LABELS: { state: EyeState; label: string }[] = [
  { state: 'eyes_open', label: '目開き' },
  { state: 'eyes_closed', label: '目閉じ' },
];

export const MOUTH_STATE_LABELS: { state: MouthOpenState; label: string; key: string }[] = [
  { state: 'mouth_closed', label: '口閉じ', key: 'C' },
  { state: 'mouth_half', label: '口半開き', key: 'H' },
  { state: 'mouth_open', label: '口全開', key: 'O' },
];

export function faceStateIdOf(tag: Pick<FrameTag, 'eyes' | 'mouth'>): FaceStateId {
  return `${tag.eyes}__${tag.mouth}`;
}

/** FaceStateId を目・口の二軸へ戻す(faceStateIdOf の逆変換)。 */
export function parseFaceStateId(id: FaceStateId): { eyes: EyeState; mouth: MouthOpenState } {
  const [eyes, mouth] = id.split('__') as [EyeState, MouthOpenState];
  return { eyes, mouth };
}

export function mouthShapeToState(shape: MouthShape): MouthOpenState {
  return shape === 'open' ? 'mouth_open' : shape === 'mid' ? 'mouth_half' : 'mouth_closed';
}

export function mouthStateToShape(state: MouthOpenState): MouthShape {
  return state === 'mouth_open' ? 'open' : state === 'mouth_half' ? 'mid' : 'close';
}

/** FrameTagMap → 旧TagMap(口のみ)。/static/ エクスポートAPI・PNG DL名の互換用。 */
export function toLegacyTagMap(frameTags: FrameTagMap): TagMap {
  const result: TagMap = {};
  for (const [filename, tag] of Object.entries(frameTags)) {
    result[filename] = mouthStateToShape(tag.mouth);
  }
  return result;
}

/**
 * 保存データの読込。v2(FrameTagオブジェクト)と旧形式(open/mid/close文字列)の
 * 両方を受け付け、旧形式は「目開き・手動確定」として互換変換する。
 */
export function parseStoredFrameTags(raw: unknown): FrameTagMap {
  if (!raw || typeof raw !== 'object') return {};
  const result: FrameTagMap = {};
  for (const [filename, value] of Object.entries(raw as Record<string, unknown>)) {
    if (typeof value === 'string') {
      if (value === 'open' || value === 'mid' || value === 'close') {
        result[filename] = { eyes: 'eyes_open', mouth: mouthShapeToState(value), source: 'manual', locked: true };
      }
      continue;
    }
    if (value && typeof value === 'object') {
      const tag = value as Partial<FrameTag>;
      const mouth = tag.mouth === 'mouth_open' || tag.mouth === 'mouth_half' || tag.mouth === 'mouth_closed' ? tag.mouth : 'mouth_closed';
      result[filename] = {
        eyes: tag.eyes === 'eyes_closed' ? 'eyes_closed' : 'eyes_open',
        mouth,
        source: tag.source === 'auto' ? 'auto' : 'manual',
        locked: tag.locked !== false,
        ...(typeof tag.confidence === 'number' ? { confidence: tag.confidence } : {}),
      };
    }
  }
  return result;
}
