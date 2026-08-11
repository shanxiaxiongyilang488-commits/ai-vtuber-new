import type { VoiceProfile } from '$lib/voiceDesign';

/** Gemini responseSchema (analyze / refine 共用)。 */
export const VOICE_PROFILE_SCHEMA = {
	type: 'OBJECT',
	properties: {
		identity: {
			type: 'OBJECT',
			properties: {
				apparent_age: { type: 'STRING' },
				pitch: { type: 'STRING' },
				texture: { type: 'STRING' },
				brightness: { type: 'NUMBER' },
				breathiness: { type: 'NUMBER' },
				softness: { type: 'NUMBER' },
				mechanical_precision: { type: 'NUMBER' },
			},
			required: ['apparent_age', 'pitch', 'texture', 'brightness', 'breathiness', 'softness', 'mechanical_precision'],
		},
		personality: {
			type: 'OBJECT',
			properties: {
				warmth: { type: 'NUMBER' },
				energy: { type: 'NUMBER' },
				emotional_range: { type: 'NUMBER' },
				speaking_rate: { type: 'NUMBER' },
				speaking_style: { type: 'STRING' },
			},
			required: ['warmth', 'energy', 'emotional_range', 'speaking_rate', 'speaking_style'],
		},
		analysis_reason: { type: 'STRING' },
		voiceThought: { type: 'ARRAY', items: { type: 'STRING' } },
	},
	required: ['identity', 'personality', 'analysis_reason', 'voiceThought'],
};

function asRecord(value: unknown): Record<string, unknown> {
	return value && typeof value === 'object' ? value as Record<string, unknown> : {};
}

function clamp01(value: unknown): number {
	return typeof value === 'number' && Number.isFinite(value) ? Math.min(1, Math.max(0, value)) : 0;
}

function shortText(value: unknown, max: number): string {
	return typeof value === 'string' ? value.trim().slice(0, max) : '';
}

export function normalizeVoiceProfile(value: unknown): VoiceProfile {
	const data = asRecord(value);
	const identity = asRecord(data.identity);
	const personality = asRecord(data.personality);
	return {
		identity: {
			apparent_age: shortText(identity.apparent_age, 60) || '不明',
			pitch: shortText(identity.pitch, 60) || '中音域',
			texture: shortText(identity.texture, 120) || '',
			brightness: clamp01(identity.brightness),
			breathiness: clamp01(identity.breathiness),
			softness: clamp01(identity.softness),
			mechanical_precision: clamp01(identity.mechanical_precision),
		},
		personality: {
			warmth: clamp01(personality.warmth),
			energy: clamp01(personality.energy),
			emotional_range: clamp01(personality.emotional_range),
			speaking_rate: clamp01(personality.speaking_rate),
			speaking_style: shortText(personality.speaking_style, 200) || '',
		},
		analysis_reason: shortText(data.analysis_reason, 600) || '',
	};
}

export function normalizeVoiceThought(value: unknown): string[] {
	return Array.isArray(value)
		? value.filter((item): item is string => typeof item === 'string').map((item) => item.trim().slice(0, 200)).filter(Boolean).slice(0, 6)
		: [];
}
