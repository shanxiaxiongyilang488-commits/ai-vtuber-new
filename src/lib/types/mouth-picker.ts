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
