# FAL Video Provider Research

Checked against the public FAL model catalog on 2026-06-12.
Pricing and schemas can change, so the linked API page remains authoritative.

## Recommended provider list

| Family | Endpoint | I2V | T2V | Input images | Duration | Resolution | Current FAL pricing |
| --- | --- | --- | --- | --- | --- | --- | --- |
| Kling 3.0 Pro | `fal-ai/kling-video/v3/pro/image-to-video` | Yes | Separate endpoint | 1 start + optional end; optional element refs | 3-15 sec | No resolution field exposed | $0.112/sec audio off; $0.168/sec audio on; $0.196/sec with voice control |
| Kling 3.0 Pro | `fal-ai/kling-video/v3/pro/text-to-video` | Separate endpoint | Yes | 0 | 3-15 sec | No resolution field exposed | Same as Kling I2V |
| Seedance 2.0 | `bytedance/seedance-2.0/image-to-video` | Yes | Separate endpoint | 1 start + optional end | 4-15 sec or auto | 480p, 720p, 1080p | $0.3034/sec at 720p; $0.682/sec at 1080p |
| Seedance 2.0 | `bytedance/seedance-2.0/text-to-video` | Separate endpoint | Yes | 0 | 4-15 sec or auto | 480p, 720p, 1080p | Same as Seedance I2V |
| Seedance 2.0 Reference | `bytedance/seedance-2.0/reference-to-video` | Yes | No | Up to 9 images; also 3 video + 3 audio, 12 total files | 4-15 sec or auto | 480p, 720p, 1080p | Same base price; 720p with video input is listed at $0.1814/sec |
| Hailuo-02 Standard | `fal-ai/minimax/hailuo-02/standard/image-to-video` | Yes | Separate endpoint | 1 start + optional end | 6 or 10 sec | 512p, 768p | About $0.017/sec at 512p; $0.045/sec at 768p |
| Hailuo-02 Standard | `fal-ai/minimax/hailuo-02/standard/text-to-video` | Separate endpoint | Yes | 0 | 6 or 10 sec | 768p | $0.045/sec |
| PixVerse V6 | `fal-ai/pixverse/v6/image-to-video` | Yes | Separate endpoint | 1 | 1-15 sec | 360p, 540p, 720p, 1080p | No audio: $0.025/$0.035/$0.045/$0.090 per sec |
| PixVerse V6 | `fal-ai/pixverse/v6/text-to-video` | Separate endpoint | Yes | 0 | 1-15 sec | 360p, 540p, 720p, 1080p | Same as PixVerse I2V; audio costs more |
| Vidu | No current public FAL endpoint found | Not verified | Not verified | Not verified | Not verified | Not verified | Not available |

## Integration recommendation

1. Use separate endpoint records for text-to-video and image-to-video.
2. Add a request mode field instead of inferring the mode from whether an image exists.
3. Keep endpoint-specific payload builders. Field names differ:
   - Kling: `start_image_url`, optional `end_image_url`
   - Seedance I2V: `image_url`, optional `end_image_url`
   - Seedance reference: `image_urls`
   - Hailuo: `image_url`, optional `end_image_url`
   - PixVerse: `image_url`
4. Do not expose a model in Studio until its payload builder is implemented.
5. Prefer the FAL queue API for long-running video requests.

## API samples

Install:

```bash
npm install @fal-ai/client
```

Kling 3.0 Pro image-to-video:

```ts
import { fal } from '@fal-ai/client';

const result = await fal.subscribe('fal-ai/kling-video/v3/pro/image-to-video', {
  input: {
    prompt: 'A slow cinematic camera push-in.',
    start_image_url: imageUrl,
    duration: '5',
    generate_audio: false,
  },
  logs: true,
});
```

Seedance 2.0 reference-to-video:

```ts
const result = await fal.subscribe('bytedance/seedance-2.0/reference-to-video', {
  input: {
    prompt: '@Image1 and @Image2 walk through a neon city.',
    image_urls: [characterImage1, characterImage2],
    resolution: '720p',
    duration: '5',
    aspect_ratio: '16:9',
    generate_audio: true,
  },
  logs: true,
});
```

Hailuo-02 image-to-video:

```ts
const result = await fal.subscribe('fal-ai/minimax/hailuo-02/standard/image-to-video', {
  input: {
    prompt: 'Hair and clothing move gently in the wind.',
    image_url: imageUrl,
    duration: '6',
    resolution: '768P',
    prompt_optimizer: true,
  },
  logs: true,
});
```

PixVerse V6 text-to-video:

```ts
const result = await fal.subscribe('fal-ai/pixverse/v6/text-to-video', {
  input: {
    prompt: 'A dramatic manga-style rooftop confrontation.',
    aspect_ratio: '16:9',
    resolution: '720p',
    duration: 5,
    generate_audio_switch: false,
  },
  logs: true,
});
```

## Sources

- [FAL model catalog](https://fal.ai/models)
- [Kling 3.0 Pro I2V](https://fal.ai/models/fal-ai/kling-video/v3/pro/image-to-video/api)
- [Kling 3.0 Pro T2V](https://fal.ai/models/fal-ai/kling-video/v3/pro/text-to-video/api)
- [Seedance 2.0 I2V](https://fal.ai/models/bytedance/seedance-2.0/image-to-video/api)
- [Seedance 2.0 T2V](https://fal.ai/models/bytedance/seedance-2.0/text-to-video/api)
- [Seedance 2.0 Reference](https://fal.ai/models/bytedance/seedance-2.0/reference-to-video/api)
- [Hailuo-02 I2V](https://fal.ai/models/fal-ai/minimax/hailuo-02/standard/image-to-video/api)
- [Hailuo-02 T2V](https://fal.ai/models/fal-ai/minimax/hailuo-02/standard/text-to-video/api)
- [PixVerse V6 I2V](https://fal.ai/models/fal-ai/pixverse/v6/image-to-video/api)
- [PixVerse V6 T2V](https://fal.ai/models/fal-ai/pixverse/v6/text-to-video/api)
