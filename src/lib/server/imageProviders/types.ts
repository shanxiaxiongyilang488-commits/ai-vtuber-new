export type ImageProviderName = 'openai' | 'gemini' | 'ideogram';

export type ImageSize = '1024x1024' | '1024x1536' | '1536x1024' | '1792x1024' | '1024x1792';

export type GeneratedImage = { url: string };

export type ImageGenerationInput = {
  prompt: string;
  size: ImageSize;
  model?: string;
  refImages: string[];
  editMode: boolean;
};

export function normalizeImages(images: Array<{ url?: unknown }>): GeneratedImage[] {
  return images
    .map((img) => ({ url: typeof img.url === 'string' ? img.url : '' }))
    .filter((img) => img.url.length > 0);
}

export function firstDataUrl(refImages: string[]): string | undefined {
  return refImages.find((img) => typeof img === 'string' && img.startsWith('data:'));
}

export function dataUrlToFile(dataUrl: string, filename = 'reference.png'): File {
  const mime = dataUrl.match(/^data:(.*?);/)?.[1] ?? 'image/png';
  const b64 = dataUrl.split(',')[1] ?? '';
  return new File([Buffer.from(b64, 'base64')], filename, { type: mime });
}

export function dataUrlToInlineData(dataUrl: string): { mimeType: string; data: string } {
  const commaIndex = dataUrl.indexOf(',');
  const header = commaIndex >= 0 ? dataUrl.slice(0, commaIndex) : '';
  const data = commaIndex >= 0 ? dataUrl.slice(commaIndex + 1) : '';
  return {
    mimeType: header.match(/^data:(.*?);/)?.[1] ?? 'image/png',
    data,
  };
}
