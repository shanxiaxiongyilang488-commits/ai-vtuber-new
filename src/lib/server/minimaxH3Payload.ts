export type MiniMaxH3Mode = 't2v' | 'i2v' | 'r2v';
export type MiniMaxH3Resolution = '768P' | '2K';
export type MiniMaxH3Ratio = 'adaptive' | '21:9' | '16:9' | '4:3' | '1:1' | '3:4' | '9:16';

type MiniMaxH3TextContent = { type: 'text'; text: string };
type MiniMaxH3ImageContent = {
  type: 'image_url';
  image_url: { url: string };
  role: 'first_frame' | 'reference_image';
};

export type MiniMaxH3Payload = {
  model: 'MiniMax-H3';
  content: Array<MiniMaxH3TextContent | MiniMaxH3ImageContent>;
  resolution: MiniMaxH3Resolution;
  duration: number;
  ratio: MiniMaxH3Ratio;
};

export type BuildMiniMaxH3PayloadInput = {
  prompt: string;
  mode: MiniMaxH3Mode;
  duration: number;
  resolution?: MiniMaxH3Resolution;
  ratio?: MiniMaxH3Ratio;
  imageUrl?: string;
  imageUrls?: string[];
};

function cleanImageUrls(values: string[] | undefined): string[] {
  return [...new Set((values ?? []).map((value) => value.trim()).filter(Boolean))];
}

export function buildMiniMaxH3Payload(input: BuildMiniMaxH3PayloadInput): MiniMaxH3Payload {
  const prompt = input.prompt.trim();
  if (!prompt) throw new Error('MiniMax H3 requires a text prompt.');
  if (prompt.length > 7000) throw new Error('MiniMax H3 prompt must be 7000 characters or fewer.');

  const duration = Math.round(input.duration);
  if (!Number.isInteger(input.duration) || duration < 4 || duration > 15) {
    throw new Error('MiniMax H3 duration must be an integer from 4 to 15 seconds.');
  }

  const content: MiniMaxH3Payload['content'] = [{ type: 'text', text: prompt }];
  let ratio: MiniMaxH3Ratio = input.ratio ?? '16:9';

  if (input.mode === 'i2v') {
    const imageUrl = input.imageUrl?.trim();
    if (!imageUrl) throw new Error('MiniMax H3 image-to-video requires one first-frame image.');
    content.push({ type: 'image_url', image_url: { url: imageUrl }, role: 'first_frame' });
    ratio = 'adaptive';
  } else if (input.mode === 'r2v') {
    const imageUrls = cleanImageUrls(input.imageUrls);
    if (imageUrls.length === 0) throw new Error('MiniMax H3 reference-to-video requires at least one reference image.');
    if (imageUrls.length > 9) throw new Error('MiniMax H3 supports up to 9 reference images.');
    for (const imageUrl of imageUrls) {
      content.push({ type: 'image_url', image_url: { url: imageUrl }, role: 'reference_image' });
    }
    ratio = 'adaptive';
  } else if (ratio === 'adaptive') {
    throw new Error('MiniMax H3 text-to-video requires a concrete aspect ratio.');
  }

  return {
    model: 'MiniMax-H3',
    content,
    resolution: input.resolution ?? '768P',
    duration,
    ratio,
  };
}
