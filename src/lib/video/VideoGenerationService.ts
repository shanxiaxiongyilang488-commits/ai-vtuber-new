import type { VideoPackage } from '../../core/videoPackageCore';
import { FalVideoEngine, type GeneratedVideo, type VideoEngine } from './VideoEngine';

/**
 * The only client-facing entry point for video generation.
 * Feature screens must depend on this service, never on a provider or API route.
 */
export class VideoGenerationService {
  constructor(private readonly engine: VideoEngine = new FalVideoEngine('kling-fal', 'fal-ai/kling-video/v3/pro/image-to-video')) {}

  generate(videoPackage: VideoPackage): Promise<GeneratedVideo> {
    return this.engine.generate(videoPackage);
  }
}

export const videoGenerationService = new VideoGenerationService();
