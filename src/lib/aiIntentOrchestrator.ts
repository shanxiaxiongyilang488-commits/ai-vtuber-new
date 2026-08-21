import { classifyIntentAI } from './aiIntentRouter';

export type OrchestratedIntent = 'chat' | 'memory_test' | 'image_reference_chat' | 'image_generate' | 'manga_generate' | 'video_generate' | 'story_card' | 'multi_ai_room' | 'character_edit';
export type EngineName = 'chat' | 'image' | 'manga' | 'video' | 'story' | 'memory' | 'character';
export type IntentDecision = { intent: OrchestratedIntent; sub_intent: string; generate: boolean; confidence: number };
export type TaskPlan = { engine: EngineName; allow_generation: boolean; reason: string };

const engineFor: Record<OrchestratedIntent, EngineName> = {
  chat: 'chat', memory_test: 'memory', image_reference_chat: 'chat', image_generate: 'image', manga_generate: 'manga', video_generate: 'video', story_card: 'story', multi_ai_room: 'chat', character_edit: 'character',
};

/** Intent AI JSON → planner → permission manager. Ambiguous requests always chat. */
export async function orchestrateIntent(message: string): Promise<{ decision: IntentDecision; plan: TaskPlan }> {
  try {
    const raw = await classifyIntentAI(message);
    const intent: OrchestratedIntent = raw.intent === 'image' ? 'image_generate'
      : raw.intent === 'manga' ? 'manga_generate'
      : raw.intent === 'memory' ? 'memory_test'
      : raw.intent === 'yaml' ? 'story_card'
      : 'chat';
    const generate = Boolean(raw.generate_image || raw.generate_manga) && raw.confidence >= 0.85;
    const decision: IntentDecision = { intent, sub_intent: raw.subtype ?? raw.action ?? 'general', generate, confidence: raw.confidence };
    const engine = engineFor[intent];
    return { decision, plan: { engine, allow_generation: generate && ['image', 'manga', 'video'].includes(engine), reason: generate ? 'explicit high-confidence intent' : 'ambiguous or non-generation intent' } };
  } catch {
    return { decision: { intent: 'chat', sub_intent: 'fallback', generate: false, confidence: 0 }, plan: { engine: 'chat', allow_generation: false, reason: 'intent unavailable; chat fallback' } };
  }
}
