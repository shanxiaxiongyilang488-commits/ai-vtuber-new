/**
 * Character Voice Design (VOICE LAB / Character Voice モード) の共有型。
 * キャラクター画像から声の仮説 (VoiceProfile) を生成し、
 * クラウドTTSで候補音声を生成・比較するための構造。
 */

export type VoiceProfile = {
	identity: {
		apparent_age: string;
		pitch: string;
		texture: string;
		brightness: number;
		breathiness: number;
		softness: number;
		mechanical_precision: number;
	};
	personality: {
		warmth: number;
		energy: number;
		emotional_range: number;
		speaking_rate: number;
		speaking_style: string;
	};
	analysis_reason: string;
};

export type VoiceAnalyzeResponse = {
	profile: VoiceProfile;
	/** AI VOICE THOUGHT 用のユーザー向け短文要約 (raw CoT ではない)。 */
	voiceThought: string[];
	provider: string;
	model: string;
	estimatedCostUsd: number;
	usage: VoiceUsageSummary;
	timestamp: string;
};

export type CharacterVoiceCandidate = {
	id: string;
	/** A / B / C */
	slot: string;
	/** 候補の方向性 (例: 画像から最も自然な声)。 */
	direction: string;
	designPrompt: string;
	/** ユーザーに見せてよい短い判断要約。 */
	reason: string;
	audioUrl: string;
	voiceId?: string;
	provider: string;
	model: string;
	previewText: string;
	createdAt: string;
};

export type VoiceCandidatesResponse = {
	candidates: CharacterVoiceCandidate[];
	estimatedCostUsd: number;
	usage: VoiceUsageSummary;
	timestamp: string;
};

export type VoiceRefineResponse = {
	profile: VoiceProfile;
	candidate: CharacterVoiceCandidate;
	voiceThought: string[];
	estimatedCostUsd: number;
	usage: VoiceUsageSummary;
	timestamp: string;
};

export type VoiceUsageSummary = {
	generationCount: number;
	candidateCount: number;
	previewCharCount: number;
	estimatedCostTotalUsd: number;
};

/** 1回の生成セッション (A/B/C候補ひとまとまり) の履歴レコード。 */
export type VoiceDesignSession = {
	id: string;
	characterId: string;
	characterName?: string;
	/** 縮小サムネイル (data URL, 160px程度)。元画像は保存しない。 */
	imageThumb?: string;
	profile: VoiceProfile;
	testPhrase: string;
	candidates: CharacterVoiceCandidate[];
	/** 「この声を保存」済みの候補id。 */
	adoptedCandidateId?: string;
	createdAt: string;
	updatedAt: string;
};

export type SavedCharacterVoiceProfile = {
	characterId: string;
	characterName?: string;
	profile: VoiceProfile;
	selectedCandidate: CharacterVoiceCandidate;
	provider: string;
	model: string;
	savedAt: string;
};
