export type AIModelMetadata = {
  conversation?: string;
  storyCard?: string;
  motionPrompt?: string;
  imageAnalysis?: string;
  video?: string;
	image?: string;
  yaml?: string;
  intentRouter?: string;
};

export const AI_ROLE_MODELS = {
  conversation: 'GPT-5.5',
  storyCard: 'GPT-5.5',
  motionPrompt: 'GPT-5.5',
  yaml: 'GPT-5.5',
  intentRouter: 'GPT-5.5',
  imageAnalysis: 'Gemini 2.5 Flash',
  video: 'Seedance 2.0',
} as const;
