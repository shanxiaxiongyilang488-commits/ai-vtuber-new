export type ChatImageInput = {
  dataUrl: string;
  name?: string;
};

export type ProviderChatInput = {
  systemPrompt: string;
  userMessage: string;
  model?: string;
  temperature?: number;
  maxTokens?: number;
  images?: ChatImageInput[];
};

export function localMessages(systemPrompt: string, userMessage: string) {
  return [
    { role: 'system', content: systemPrompt },
    { role: 'user', content: userMessage },
  ];
}

export function extractReplyText(data: unknown): string {
  const value = data as {
    message?: { content?: unknown };
    response?: unknown;
    choices?: Array<{ message?: { content?: unknown }; text?: unknown }>;
    text?: unknown;
    replyText?: unknown;
  };

  const candidates = [
    value?.message?.content,
    value?.response,
    value?.choices?.[0]?.message?.content,
    value?.choices?.[0]?.text,
    value?.replyText,
    value?.text,
  ];

  for (const candidate of candidates) {
    if (typeof candidate === 'string') return candidate;
  }

  return '';
}

export function logEmptyReply(provider: string, data: unknown): void {
  console.log(`[${provider}] empty reply response JSON`, JSON.stringify(data, null, 2));
}
