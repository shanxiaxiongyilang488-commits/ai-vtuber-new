/**
 * Character Memory Vision Bridge V1 — 添付画像/YAML を AI 送信経路へ接続する補助ロジック。
 *
 * これは画像生成ではない。「添付画像を AI が見られるようにする」ための変換・判定のみ。
 * 純粋ロジック（副作用なし）。character-memory.json には一切触れない。
 */

/** 添付画像（入力欄の添付キュー1件）。 */
export type AttachImage = {
  name: string;
  /** data URL（FileReader.readAsDataURL の結果）。 */
  dataUrl: string;
  /** MIME タイプ（例: image/png）。 */
  mime: string;
};

/** Vision 入力（Provider へ渡せる形式）。 */
export type VisionImage = {
  name: string;
  dataUrl: string;
  mime: string;
};

export interface VisionSupport {
  supported: boolean;
  /** 未対応時の警告文。 */
  warning?: string;
}

/**
 * ③ Provider 別の Vision 対応可否。selection は Personality Engine の選択値。
 * - GPT-5.5 / AUTO（OpenAI 経由）: 対応
 * - Gemini: 対応
 * - Grok: 今回は未対応（警告）
 * - その他（Claude / Local LLM など）: 未対応（警告）
 */
export function providerVisionSupport(selection: string): VisionSupport {
  switch (selection) {
    case 'GPT-5.5':
    case 'AUTO':
    case 'Gemini':
      return { supported: true };
    case 'Grok':
      return { supported: false, warning: 'Grok Vision未対応' };
    default:
      return { supported: false, warning: 'このAI Providerは画像入力に未対応です' };
  }
}

/**
 * ② 添付画像を Vision 入力形式へ変換・検証する。
 * data URL でなければ変換失敗として例外を投げる（呼び出し側でエラー表示）。
 */
export function toVisionImages(images: AttachImage[]): VisionImage[] {
  return images.map((image) => {
    const dataUrl = (image.dataUrl ?? '').trim();
    if (!dataUrl.startsWith('data:') || !dataUrl.includes(',')) {
      throw new Error('画像をVision入力へ変換できませんでした');
    }
    const mime = image.mime || dataUrl.match(/^data:([^;,]+)/)?.[1] || 'image/png';
    return { name: image.name, dataUrl, mime };
  });
}

/**
 * ④ 添付 YAML を会話コンテキスト（テキスト）へ整形する。
 * userMessage の末尾へ付加する想定。
 */
export function buildYamlContext(name: string, text: string): string {
  const body = (text ?? '').trim();
  if (!body) return '';
  const label = name ? `[Attached STORY YAML: ${name}]` : '[Attached STORY YAML]';
  return `${label}\n${body}`;
}
