export type VideoGenerationMode =
  | 'text-to-video'
  | 'image-to-video'
  | 'reference-to-video';

export type VideoModelAvailability = 'available' | 'not-listed';

export type VideoInputImages = {
  min: number;
  max: number;
  field: string | null;
  note?: string;
};

export type VideoPricing = {
  unit: 'second' | 'token' | 'unavailable';
  summary: string;
};

export type VideoProviderModel = {
  id: string;
  family: 'kling' | 'vidu' | 'seedance' | 'hailuo' | 'pixverse' | 'sora';
  label: string;
  provider: 'fal';
  availability: VideoModelAvailability;
  endpoint: string | null;
  mode: VideoGenerationMode | null;
  textToVideo: boolean;
  imageToVideo: boolean;
  inputImages: VideoInputImages;
  durations: readonly string[];
  resolutions: readonly string[];
  pricing: VideoPricing;
  docsUrl: string | null;
  notes?: string;
};

export const FAL_VIDEO_PROVIDER_MODELS: readonly VideoProviderModel[] = [
  {
    id: 'fal-ai/kling-video/v3/pro/text-to-video',
    family: 'kling',
    label: 'Kling 3.0 Pro - Text to Video',
    provider: 'fal',
    availability: 'available',
    endpoint: 'fal-ai/kling-video/v3/pro/text-to-video',
    mode: 'text-to-video',
    textToVideo: true,
    imageToVideo: false,
    inputImages: { min: 0, max: 0, field: null },
    durations: ['3-15 seconds'],
    resolutions: ['Model-managed; no resolution input in the endpoint schema'],
    pricing: {
      unit: 'second',
      summary: '$0.112/sec audio off; $0.168/sec audio on; $0.196/sec with voice control',
    },
    docsUrl: 'https://fal.ai/models/fal-ai/kling-video/v3/pro/text-to-video/api',
    notes: 'Supports native audio and multi-shot prompts.',
  },
  {
    id: 'fal-ai/kling-video/v3/pro/image-to-video',
    family: 'kling',
    label: 'Kling 3.0 Pro - Image to Video',
    provider: 'fal',
    availability: 'available',
    endpoint: 'fal-ai/kling-video/v3/pro/image-to-video',
    mode: 'image-to-video',
    textToVideo: false,
    imageToVideo: true,
    inputImages: {
      min: 1,
      max: 2,
      field: 'start_image_url / end_image_url',
      note: 'One start image is required; one end image is optional. Element references are separate.',
    },
    durations: ['3-15 seconds'],
    resolutions: ['Model-managed; no resolution input in the endpoint schema'],
    pricing: {
      unit: 'second',
      summary: '$0.112/sec audio off; $0.168/sec audio on; $0.196/sec with voice control',
    },
    docsUrl: 'https://fal.ai/models/fal-ai/kling-video/v3/pro/image-to-video/api',
    notes: 'Supports native audio, optional end frame, and character/object elements.',
  },
  {
    id: 'bytedance/seedance-2.0/text-to-video',
    family: 'seedance',
    label: 'Seedance 2.0 - Text to Video',
    provider: 'fal',
    availability: 'available',
    endpoint: 'bytedance/seedance-2.0/text-to-video',
    mode: 'text-to-video',
    textToVideo: true,
    imageToVideo: false,
    inputImages: { min: 0, max: 0, field: null },
    durations: ['4-15 seconds', 'auto'],
    resolutions: ['480p', '720p', '1080p'],
    pricing: {
      unit: 'second',
      summary: '$0.3034/sec at 720p; $0.682/sec at 1080p; FAL also reports token-based billing',
    },
    docsUrl: 'https://fal.ai/models/bytedance/seedance-2.0/text-to-video/api',
    notes: 'Supports native audio, multi-shot editing, and broad aspect ratios.',
  },
  {
    id: 'bytedance/seedance-2.0/image-to-video',
    family: 'seedance',
    label: 'Seedance 2.0 - Image to Video',
    provider: 'fal',
    availability: 'available',
    endpoint: 'bytedance/seedance-2.0/image-to-video',
    mode: 'image-to-video',
    textToVideo: false,
    imageToVideo: true,
    inputImages: {
      min: 1,
      max: 2,
      field: 'image_url / end_image_url',
      note: 'One start image is required; one end image is optional.',
    },
    durations: ['4-15 seconds', 'auto'],
    resolutions: ['480p', '720p', '1080p'],
    pricing: {
      unit: 'second',
      summary: '$0.3034/sec at 720p; $0.682/sec at 1080p; FAL also reports token-based billing',
    },
    docsUrl: 'https://fal.ai/models/bytedance/seedance-2.0/image-to-video/api',
    notes: 'Supports synchronized audio and start/end frame control.',
  },
  {
    id: 'bytedance/seedance-2.0/reference-to-video',
    family: 'seedance',
    label: 'Seedance 2.0 - Reference to Video',
    provider: 'fal',
    availability: 'available',
    endpoint: 'bytedance/seedance-2.0/reference-to-video',
    mode: 'reference-to-video',
    textToVideo: false,
    imageToVideo: true,
    inputImages: {
      min: 0,
      max: 9,
      field: 'image_urls',
      note: 'Up to 9 images, 3 videos, and 3 audio files; maximum 12 files total.',
    },
    durations: ['4-15 seconds', 'auto'],
    resolutions: ['480p', '720p', '1080p'],
    pricing: {
      unit: 'second',
      summary: '$0.3034/sec at 720p; $0.682/sec at 1080p; $0.1814/sec at 720p when video input discount applies',
    },
    docsUrl: 'https://fal.ai/models/bytedance/seedance-2.0/reference-to-video/api',
    notes: 'Best fit in this list for multiple character/reference images.',
  },
  {
    id: 'fal-ai/sora-2/text-to-video',
    family: 'sora',
    label: 'Sora 2 - Text to Video',
    provider: 'fal',
    availability: 'available',
    endpoint: 'fal-ai/sora-2/text-to-video',
    mode: 'text-to-video',
    textToVideo: true,
    imageToVideo: false,
    inputImages: { min: 0, max: 0, field: null },
    durations: ['4 seconds', '8 seconds', '12 seconds', '16 seconds', '20 seconds'],
    resolutions: ['720p'],
    pricing: {
      unit: 'second',
      summary: 'FAL Sora 2 endpoint pricing; see provider billing page.',
    },
    docsUrl: 'https://fal.ai/models/fal-ai/sora-2/text-to-video/api',
    notes: 'OpenAI Sora 2 through FAL queue API; supports native audio.',
  },
  {
    id: 'fal-ai/sora-2/image-to-video',
    family: 'sora',
    label: 'Sora 2 - Image to Video',
    provider: 'fal',
    availability: 'available',
    endpoint: 'fal-ai/sora-2/image-to-video',
    mode: 'image-to-video',
    textToVideo: false,
    imageToVideo: true,
    inputImages: { min: 1, max: 1, field: 'image_url', note: 'One first-frame image is required.' },
    durations: ['4 seconds', '8 seconds', '12 seconds', '16 seconds', '20 seconds'],
    resolutions: ['auto', '720p'],
    pricing: {
      unit: 'second',
      summary: 'FAL Sora 2 endpoint pricing; see provider billing page.',
    },
    docsUrl: 'https://fal.ai/models/fal-ai/sora-2/image-to-video/api',
    notes: 'OpenAI Sora 2 through FAL queue API; supports native audio.',
  },
  {
    id: 'fal-ai/minimax/hailuo-02/standard/text-to-video',
    family: 'hailuo',
    label: 'Hailuo-02 Standard - Text to Video',
    provider: 'fal',
    availability: 'available',
    endpoint: 'fal-ai/minimax/hailuo-02/standard/text-to-video',
    mode: 'text-to-video',
    textToVideo: true,
    imageToVideo: false,
    inputImages: { min: 0, max: 0, field: null },
    durations: ['6 seconds', '10 seconds'],
    resolutions: ['768p'],
    pricing: {
      unit: 'second',
      summary: '$0.045/sec; a 6-second video costs $0.27',
    },
    docsUrl: 'https://fal.ai/models/fal-ai/minimax/hailuo-02/standard/text-to-video/api',
  },
  {
    id: 'fal-ai/minimax/hailuo-02/standard/image-to-video',
    family: 'hailuo',
    label: 'Hailuo-02 Standard - Image to Video',
    provider: 'fal',
    availability: 'available',
    endpoint: 'fal-ai/minimax/hailuo-02/standard/image-to-video',
    mode: 'image-to-video',
    textToVideo: false,
    imageToVideo: true,
    inputImages: {
      min: 1,
      max: 2,
      field: 'image_url / end_image_url',
      note: 'One first frame is required; one end frame is optional.',
    },
    durations: ['6 seconds', '10 seconds'],
    resolutions: ['512p', '768p'],
    pricing: {
      unit: 'second',
      summary: 'About $0.017/sec at 512p; $0.045/sec at 768p',
    },
    docsUrl: 'https://fal.ai/models/fal-ai/minimax/hailuo-02/standard/image-to-video/api',
  },
  {
    id: 'fal-ai/pixverse/v6/text-to-video',
    family: 'pixverse',
    label: 'PixVerse V6 - Text to Video',
    provider: 'fal',
    availability: 'available',
    endpoint: 'fal-ai/pixverse/v6/text-to-video',
    mode: 'text-to-video',
    textToVideo: true,
    imageToVideo: false,
    inputImages: { min: 0, max: 0, field: null },
    durations: ['1-15 seconds'],
    resolutions: ['360p', '540p', '720p', '1080p'],
    pricing: {
      unit: 'second',
      summary: 'No audio: $0.025/$0.035/$0.045/$0.090 per sec for 360p/540p/720p/1080p',
    },
    docsUrl: 'https://fal.ai/models/fal-ai/pixverse/v6/text-to-video/api',
    notes: 'Audio adds $0.010-$0.025/sec depending on resolution.',
  },
  {
    id: 'fal-ai/pixverse/v6/image-to-video',
    family: 'pixverse',
    label: 'PixVerse V6 - Image to Video',
    provider: 'fal',
    availability: 'available',
    endpoint: 'fal-ai/pixverse/v6/image-to-video',
    mode: 'image-to-video',
    textToVideo: false,
    imageToVideo: true,
    inputImages: { min: 1, max: 1, field: 'image_url' },
    durations: ['1-15 seconds'],
    resolutions: ['360p', '540p', '720p', '1080p'],
    pricing: {
      unit: 'second',
      summary: 'No audio: $0.025/$0.035/$0.045/$0.090 per sec for 360p/540p/720p/1080p',
    },
    docsUrl: 'https://fal.ai/models/fal-ai/pixverse/v6/image-to-video/api',
    notes: 'Audio adds $0.010-$0.025/sec depending on resolution.',
  },
  {
    id: 'vidu-unavailable-on-fal',
    family: 'vidu',
    label: 'Vidu - Not listed in current FAL catalog',
    provider: 'fal',
    availability: 'not-listed',
    endpoint: null,
    mode: null,
    textToVideo: false,
    imageToVideo: false,
    inputImages: { min: 0, max: 0, field: null },
    durations: [],
    resolutions: [],
    pricing: {
      unit: 'unavailable',
      summary: 'No current FAL endpoint or pricing found',
    },
    docsUrl: null,
    notes: 'Re-check the FAL catalog before enabling Vidu in the UI.',
  },
] as const;

export const AVAILABLE_FAL_VIDEO_PROVIDER_MODELS = FAL_VIDEO_PROVIDER_MODELS.filter(
  (model) => model.availability === 'available',
);

export type VideoModelConfig = {
  id: string;
  label: string;
  provider: string;
  mode: 'i2v' | 't2v' | 'r2v' | 'edit';
  videoMode?: 'draft' | 'production';
  falModel: string;
  enabled: boolean;
  description?: string;
  imageField?: 'image_url' | 'start_image_url' | 'image_urls';
  videoField?: 'video_url';
};

/** Editable video-generation menu. Add one entry here to expose a new FAL model. */
export const VIDEO_MODELS: readonly VideoModelConfig[] = [
  { id: 'minimax-h3-reference', label: 'MiniMax H3 · RunPod Reference', provider: 'runpod-h3', mode: 'r2v', falModel: 'MiniMax-H3', enabled: true, imageField: 'image_urls', description: 'RunPod RTX 5090上のオープンウェイトH3。キャラクター画像・アニメシートを最大9枚参照できます。' },
  { id: 'minimax-h3-image', label: 'MiniMax H3 · RunPod Image', provider: 'runpod-h3', mode: 'i2v', falModel: 'MiniMax-H3', enabled: true, imageField: 'image_url', description: 'RunPod RTX 5090上のオープンウェイトH3で1枚の開始画像を動画化します。' },
  { id: 'minimax-h3-text', label: 'MiniMax H3 · RunPod Text', provider: 'runpod-h3', mode: 't2v', falModel: 'MiniMax-H3', enabled: true, description: 'RunPod RTX 5090上のオープンウェイトH3で文章から動画を生成します。' },
  { id: 'gemini-omni-flash-reference', label: 'Gemini Omni Flash Reference', provider: 'gemini-omni-flash', mode: 'r2v', falModel: 'google/gemini-omni-flash/reference-to-video', enabled: true, imageField: 'image_urls', description: 'Direct multimodal reference-to-video. Supports 1-10 reference images.' },
  { id: 'gemini-omni-flash-image', label: 'Gemini Omni Flash Image', provider: 'gemini-omni-flash', mode: 'i2v', falModel: 'google/gemini-omni-flash/image-to-video', enabled: true, imageField: 'image_url', description: 'Direct single-image animation.' },
  { id: 'gemini-omni-flash-edit', label: 'Gemini Omni Flash Edit', provider: 'gemini-omni-flash', mode: 'edit', falModel: 'google/gemini-omni-flash/edit', enabled: true, videoField: 'video_url', description: 'Edits an existing video with a natural-language instruction.' },
  { id: 'grok-i2v', label: 'Grok — Image to Video', provider: 'grok', mode: 'i2v', falModel: 'xai/grok-imagine-video/image-to-video', enabled: true, imageField: 'image_url' },
  { id: 'grok-t2v', label: 'Grok — Text to Video', provider: 'grok', mode: 't2v', falModel: 'xai/grok-imagine-video/text-to-video', enabled: true },
  { id: 'kling-v3-standard-i2v', label: 'Kling v3 Standard — Image to Video', provider: 'kling', mode: 'i2v', falModel: 'fal-ai/kling-video/v3/standard/image-to-video', enabled: true, imageField: 'start_image_url' },
  { id: 'kling-v3-standard-t2v', label: 'Kling v3 Standard — Text to Video', provider: 'kling', mode: 't2v', falModel: 'fal-ai/kling-video/v3/standard/text-to-video', enabled: true },
  { id: 'vidu-q1-i2v', label: 'Vidu Q1 — Image to Video', provider: 'vidu', mode: 'i2v', falModel: 'fal-ai/vidu/q1/image-to-video', enabled: true, imageField: 'image_url' },
  { id: 'vidu-q1-t2v', label: 'Vidu Q1 — Text to Video', provider: 'vidu', mode: 't2v', falModel: 'fal-ai/vidu/q1/text-to-video', enabled: true },
  { id: 'seedance-2-i2v', label: 'Seedance 2.0 — Image to Video', provider: 'seedance', mode: 'i2v', falModel: 'bytedance/seedance-2.0/image-to-video', enabled: true, imageField: 'image_url' },
  { id: 'seedance-2-mini-reference', label: 'Seedance2 Mini（実験用）', provider: 'seedance', mode: 'r2v', videoMode: 'draft', falModel: 'bytedance/seedance-2.0/mini/reference-to-video', enabled: true, imageField: 'image_urls', description: '低コスト実験用。StoryCard確認、アニメシート解釈確認、MotionPrompt検証、本番生成前のプレビュー用途。' },
  { id: 'seedance-2-reference', label: 'Seedance2（本番）', provider: 'seedance', mode: 'r2v', videoMode: 'production', falModel: 'bytedance/seedance-2.0/reference-to-video', enabled: true, imageField: 'image_urls' },
  { id: 'sora-2-t2v', label: 'Sora 2 Video Engine - Text to Video', provider: 'sora', mode: 't2v', falModel: 'fal-ai/sora-2/text-to-video', enabled: true, description: 'FAL Sora 2 text-to-video. Durations are normalized to Sora-supported values.' },
  { id: 'sora-2-i2v', label: 'Sora 2 Video Engine - Image to Video', provider: 'sora', mode: 'i2v', falModel: 'fal-ai/sora-2/image-to-video', enabled: true, imageField: 'image_url', description: 'FAL Sora 2 image-to-video with one first-frame image.' },
  { id: 'seedream-i2v', label: 'Seedream — Image to Video（準備中）', provider: 'seedream', mode: 'i2v', falModel: '', enabled: false, description: 'Official FAL image-to-video endpoint is not configured.' },
  { id: 'seedream-t2v', label: 'Seedream — Text to Video（準備中）', provider: 'seedream', mode: 't2v', falModel: '', enabled: false, description: 'Official FAL text-to-video endpoint is not configured.' },
];
