/**
 * Shared media payload for chat-attached generated content.
 * Used by MEMORYCORE and AI Personality Lab through ChatMediaCard.
 */
export type MediaInfo = {
  type: 'image' | 'video' | 'audio' | 'storyboard' | 'yaml';
  url?: string;
  title?: string;
  prompt?: string;
  summary?: string;
  thumbnailUrl?: string;
  source?: 'memorycore' | 'personality-lab' | 'media-engine' | string;
  stage?: 'storyboard' | 'keyframe' | 'animation' | 'voice' | 'bgm';
  metadata?: Record<string, unknown>;
};

export interface Message {
  role: 'user' | 'assistant';
  content: string;
  /** Optional media attachment for inline display in chat */
  media?: MediaInfo;
}
