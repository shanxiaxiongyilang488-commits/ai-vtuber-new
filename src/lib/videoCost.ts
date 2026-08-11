import type { VideoModelConfig } from '$lib/config/videoModels';

const USD_PER_SECOND: ReadonlyArray<[RegExp, number]> = [
  [/MiniMax-H3|minimax-h3/i, 0.08],
  [/kling-video\/v3/i, 0.112],
  [/seedance-2\.0/i, 0.3034],
  [/sora-2/i, 0.10],
  [/gemini-omni-flash/i, 0.16],
  [/grok-imagine-video/i, 0.10],
  [/vidu/i, 0.10],
];

export function estimateVideoCostUsd(model: Pick<VideoModelConfig, 'falModel'>, duration: number): number {
  const seconds = Number.isFinite(duration) ? Math.max(1, duration) : 5;
  const rate = USD_PER_SECOND.find(([pattern]) => pattern.test(model.falModel))?.[1];
  return Number((rate ? rate * seconds : 0.80).toFixed(4));
}

export function videoCostConfirmation(model: Pick<VideoModelConfig, 'label' | 'falModel'>, duration: number): string {
  if (/RunPod/i.test(model.label)) {
    return `RunPod GPU料金が発生します（動画ごとのMiniMax API料金はありません）。\nモデル: ${model.label}\n時間: ${duration}秒\n\n続行しますか？`;
  }
  const cost = estimateVideoCostUsd(model, duration);
  return `推定料金: $${cost.toFixed(2)}\nモデル: ${model.label}\n時間: ${duration}秒\n\n続行しますか？`;
}
