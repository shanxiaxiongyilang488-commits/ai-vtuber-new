/**
 * AIレスポンス共通のJSON抽出・パース（GPT / Gemini / Grok / Claude / Local LLM 全プロバイダ対応）。
 *
 * - ```json コードフェンスを除去してから抽出する
 * - 前後に説明文が混じっていても最初のJSONオブジェクト/配列を切り出す
 * - パース失敗・空応答時は logTag で生レスポンスを必ずログに残す
 *
 * Gemini 専用の parts 連結・finishReason 抽出は geminiText.ts 側に残し、
 * テキスト→JSON の抽出だけを本モジュールで共通化する。
 */

/** テキストからJSON値を抽出してパースする。失敗時は `${label} response was not JSON` を throw。 */
export function extractAiJson(text: string, label: string): unknown {
  let candidate = text.replace(/^﻿/, '').trim();
  const fence = candidate.match(/```(?:json)?\s*([\s\S]*?)```/iu);
  if (fence?.[1]?.trim()) candidate = fence[1].trim();
  try {
    return JSON.parse(candidate);
  } catch {
    const objStart = candidate.indexOf('{');
    const arrStart = candidate.indexOf('[');
    const start = objStart < 0 ? arrStart : arrStart < 0 ? objStart : Math.min(objStart, arrStart);
    const closer = start === objStart ? '}' : ']';
    const end = candidate.lastIndexOf(closer);
    if (start < 0 || end <= start) throw new Error(`${label} response was not JSON`);
    return JSON.parse(candidate.slice(start, end + 1));
  }
}

/**
 * AIレスポンステキストをJSONとしてパースする。
 * 空応答・パース失敗時は logTag で context（provider / model / usage 等）と
 * 生テキスト先頭1000文字をログ出力してから throw する。
 * 呼び出し元は既存の catch でフォールバック（502→クライアント側で空配列/通常会話に退避）する。
 */
export function parseAiJson(
  text: string,
  options: { label: string; logTag: string; context?: Record<string, unknown> },
): unknown {
  if (!text.trim()) {
    console.warn(options.logTag, { ...options.context, raw: '' });
    throw new Error(`${options.label} returned an empty response`);
  }
  try {
    return extractAiJson(text, options.label);
  } catch (parseError) {
    console.warn(options.logTag, {
      ...options.context,
      rawLength: text.length,
      raw: text.slice(0, 1000),
    });
    throw parseError;
  }
}
