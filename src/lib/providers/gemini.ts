import type { ChatImageInput, ProviderChatInput } from './types';

export const GEMINI_DEFAULT_MODEL = 'gemini-2.0-flash';

function geminiUserParts(userMessage: string, images: ChatImageInput[]) {
  const parts: any[] = images.map((img, i) => {
    const commaIdx = img.dataUrl.indexOf(',');
    const header = commaIdx >= 0 ? img.dataUrl.slice(0, commaIdx) : '';
    const data = commaIdx >= 0 ? img.dataUrl.slice(commaIdx + 1) : '';
    const mimeType = header.match(/^data:(.*?);/)?.[1] ?? 'image/jpeg';

    console.log(`[lab-chat][gemini] image[${i}] mimeType=${mimeType} dataLen=${data.length} valid=${data.length > 100 && mimeType.startsWith('image/')}`);
    if (!data || data.length < 10) {
      console.error(`[lab-chat][gemini] image[${i}] INVALID - empty or too-short base64 (len=${data.length})`);
    }

    return { inlineData: { mimeType, data } };
  });
  parts.push({ text: userMessage });
  console.log(`[lab-chat][gemini] parts built: ${images.length} image(s) + 1 text = ${parts.length} total`);
  return parts;
}

export async function chatGemini(input: ProviderChatInput & { apiKey?: string }): Promise<string> {
  if (!input.apiKey) throw new Error('Gemini API key is not set');

  const images = input.images ?? [];
  const model = input.model || GEMINI_DEFAULT_MODEL;
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${input.apiKey}`;
  const userParts = geminiUserParts(input.userMessage, images);

  console.log('[lab-chat][gemini] request_summary:', JSON.stringify({
    model,
    systemPromptLen: input.systemPrompt.length,
    partsCount: userParts.length,
    imageParts: userParts
      .filter((p: any) => p.inlineData)
      .map((p: any) => ({ mimeType: p.inlineData.mimeType, dataLen: p.inlineData.data.length })),
    textPart: (userParts.find((p: any) => p.text) as any)?.text?.slice(0, 80),
  }));

  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      system_instruction: { parts: [{ text: input.systemPrompt }] },
      contents: [{ role: 'user', parts: userParts }],
      generationConfig: images.length > 0 ? { maxOutputTokens: 2400 } : undefined,
    }),
  });

  if (!res.ok) {
    const body = await res.text().catch(() => `HTTP ${res.status}`);
    throw new Error(`Gemini API error: HTTP ${res.status}: ${body.slice(0, 300)}`);
  }

  const data = await res.json();
  const text: string = data?.candidates?.[0]?.content?.parts?.[0]?.text ?? '';
  if (!text) {
    console.warn('[lab-chat][gemini] empty text - candidates:', JSON.stringify(data?.candidates?.map((c: any) => ({
      finishReason: c.finishReason,
      safetyRatings: c.safetyRatings,
    }))));
    throw new Error('Gemini empty response');
  }

  return text;
}
