import { generateReply } from '$lib/aiRouter';
import type { Character } from '$lib/types/character';

const CLASSIFIER_SYSTEM_PROMPT = [
  '次の発言が、将来の会話に役立つ個人的な事実や継続的な情報なら YES、',
  'そうでなければ NO とだけ答えてください。',
  '説明や補足は不要です。',
].join('\n');

function getClassifierModel(): string {
  return process.env.GEMINI_API_KEY ? 'gemini-2.5-flash' : 'gpt-4o-mini';
}

function getClassifierEngine(): 'openai' | 'gemini' {
  return process.env.GEMINI_API_KEY ? 'gemini' : 'openai';
}

const classifierCharacter: Character = {
  id: 'char1',
  name: 'Memory Classifier',
  systemPrompt: CLASSIFIER_SYSTEM_PROMPT,
  aiEngine: 'openai',
  voiceEngine: 'none',
  voiceId: '',
  speakerId: 0,
};

export async function shouldRemember(userInput: string): Promise<boolean> {
  const text = userInput.trim();
  if (!text) return false;

  try {
    const result = await generateReply({
      engine: getClassifierEngine(),
      model: getClassifierModel(),
      character: classifierCharacter,
      prompt: `発言:\n「${text}」`,
    });

    const answer = result.trim().toUpperCase();
    const shouldStore = answer.startsWith('YES');
    console.log('[memory-core] auto remember classifier:', { answer, shouldRemember: shouldStore });
    return shouldStore;
  } catch (error) {
    console.warn('[memory-core] auto remember classifier failed:', error);
    return false;
  }
}
