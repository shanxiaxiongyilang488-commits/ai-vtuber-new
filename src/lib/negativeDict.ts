// ============================================================
// ネガティブプロンプト辞書
// カテゴリ別に管理し、precheckEngine.ts から参照する
// ============================================================

export type NegativeCategory = 'base' | 'hand_fix' | 'prism_fix' | 'outfit_fix';

export const NEGATIVE_DICT: Record<NegativeCategory, string> = {
  // 共通ベース：全生成に常時付与する基礎ネガティブ
  base: [
    'nsfw',
    'lowres',
    'bad anatomy',
    'bad hands',
    'text',
    'error',
    'missing fingers',
    'extra digit',
    'fewer digits',
    'cropped',
    'worst quality',
    'low quality',
    'normal quality',
    'jpeg artifacts',
    'signature',
    'watermark',
    'username',
    'blurry',
    'out of frame',
    'mutation',
    'deformed',
    'ugly',
  ].join(', '),

  // 手の修正：指の本数・形状ミスを抑制
  hand_fix: [
    'extra fingers',
    'fused fingers',
    'too many fingers',
    'missing fingers',
    'bad hands',
    'deformed hands',
    'malformed hands',
    'mutated hands',
    'poorly drawn hands',
    'extra limbs',
    'missing limbs',
    'floating limbs',
    'disconnected limbs',
    'mangled hands',
    'cloned hands',
  ].join(', '),

  // プリズム暴走修正：色収差・レンズ光学アーティファクトを抑制
  prism_fix: [
    'chromatic aberration',
    'prismatic artifacts',
    'rainbow fringing',
    'lens flare overexposure',
    'color bleeding',
    'spectral noise',
    'color fringing',
    'over-saturated colors',
    'neon bleeding',
    'iridescent noise',
    'glitch artifacts',
    'color banding',
  ].join(', '),

  // 衣装ノイズ修正：テクスチャ崩れ・ロゴ・文字化けを抑制
  outfit_fix: [
    'pattern noise',
    'texture distortion',
    'logo artifacts',
    'text on clothes',
    'warped fabric',
    'melted outfit',
    'dissolving clothes',
    'broken pattern',
    'misaligned seams',
    'blurry fabric',
    'noisy texture',
    'repeating texture error',
  ].join(', '),
};
