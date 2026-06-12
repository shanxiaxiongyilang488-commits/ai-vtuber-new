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
  family: 'kling' | 'vidu' | 'seedance' | 'hailuo' | 'pixverse';
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

