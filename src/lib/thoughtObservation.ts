import type { ActionCandidate, MemoryReviewCost } from './memoryReview';

export type ThoughtObservationStatus = 'thinking' | 'waiting' | 'uncertain' | 'ready_to_act';

export type ThoughtObservation = {
	id: string;
	currentFocus: string;
	observation: string;
	conflict?: string;
	memoryReference?: string;
	actionCandidate?: ActionCandidate;
	emotionalState?: {
		label: string;
		intensity: number;
	};
	status: ThoughtObservationStatus;
	timestamp: string;
};

export type ThoughtObservationMemoryHint = {
	title: string;
	summary: string;
};

export type ThoughtObservationRequest = {
	characterId: string;
	characterName?: string;
	userMessage: string;
	recentMessages?: { role: 'user' | 'assistant' | 'system'; text: string }[];
	relevantMemories?: ThoughtObservationMemoryHint[];
	emotion?: string;
};

export type ThoughtObservationResponse = ThoughtObservation & {
	cost?: MemoryReviewCost;
};
