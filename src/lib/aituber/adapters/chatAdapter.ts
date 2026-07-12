import type { ChatAdapter, ProactiveChatContext } from '../types.ts';

export class ExistingLabChatAdapter implements ChatAdapter {
  async generateProactive(context: ProactiveChatContext, signal?: AbortSignal): Promise<{ text: string; actualModel?: string }> {
    const systemPrompt = [
      `You are ${context.characterName}. Speak in the character's established persona and speech style.`,
      context.persona,
      'This is a proactive CHAT message after a quiet period, not a reply to a new user request.',
      'Write one short, natural Japanese utterance. It may gently mention recent conversation, memory, current time, or recent work.',
      'Do not ask to generate, edit, search for, upload, or create an image, video, manga, voice, file, YAML, or StoryCard.',
      'Do not output instructions, JSON, markdown, stage directions, or a fixed greeting.',
    ].filter(Boolean).join('\n');
    const userMessage = [
      `Current time: ${context.now.toLocaleString('ja-JP')}`,
      `Idle duration: ${Math.max(1, Math.floor(context.idleMs / 60_000))} minutes`,
      context.longTermMemorySummary ? `Long-term memory summary: ${context.longTermMemorySummary}` : '',
      context.recentWorkSummary ? `Recent work: ${context.recentWorkSummary}` : '',
      'Recent conversation:',
      ...context.recentConversation.slice(-12).map((item) => `${item.role}: ${item.text.slice(0, 500)}`),
      'Now initiate a brief, natural conversation in character.',
    ].filter(Boolean).join('\n');
    const response = await fetch('/api/lab-chat', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      signal,
      body: JSON.stringify({
        route: 'chat',
        characterId: context.characterId,
        provider: context.provider,
        model: context.model,
        max_tokens: 160,
        temperature: 0.8,
        systemPrompt,
        userMessage,
        conversationHistory: context.recentConversation,
        memory: { enabled: false },
      }),
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(data?.message ?? `Proactive chat failed: HTTP ${response.status}`);
    const text = String(data?.text ?? data?.reply ?? '').trim();
    if (!text) throw new Error('Proactive chat returned an empty response');
    return { text: text.slice(0, 500), actualModel: typeof data?.actualModel === 'string' ? data.actualModel : undefined };
  }
}

