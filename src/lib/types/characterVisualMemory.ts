export const VISUAL_MEMORY_REFERENCE_CATEGORIES = ['Body', 'Head Unit', 'Tail Unit', 'Connection', 'Reference'] as const;
export const SHIRO_CRITICAL_FEATURES = ['HEAD_UNIT_01', 'TAIL_UNIT_02', 'CONNECTION_PORT', 'CYAN_GLOW_LINES'] as const;
export type VisualMemoryReferenceCategory = (typeof VISUAL_MEMORY_REFERENCE_CATEGORIES)[number];

export interface VisualMemoryReferenceImage {
	id: string;
	url: string;
	title: string;
	fileName: string;
	createdAt: string;
	tags: string[];
	/** Identity details visible in the viewer and in the preflight reference review. */
	importantFeatures: string[];
	category: VisualMemoryReferenceCategory;
	official: boolean;
	/** Always attach this identity-critical image at the video engine boundary. */
	critical: boolean;
}

export interface CharacterVisualMemory {
	characterName: string;
	criticalFeatures: string[];
	appearance: {
		hair: string;
		face: string;
		eyes: string;
		body: string;
		outfit: string;
		armor: string;
		colorPalette: string[];
	};
	equipment: {
		headUnit: string;
		earUnit: string;
		tailUnit: string;
		connectionPort: string;
		mechanicalParts: string[];
		accessories: string[];
	};
	motion: {
		walking: string;
		tailMotion: string;
		earMotion: string;
	};
	rules: {
		mustKeep: string[];
		avoid: string[];
	};
	references: string[];
	referenceImages: VisualMemoryReferenceImage[];
}

export function emptyCharacterVisualMemory(): CharacterVisualMemory {
	return {
		characterName: '',
		criticalFeatures: [],
		appearance: { hair: '', face: '', eyes: '', body: '', outfit: '', armor: '', colorPalette: [] },
		equipment: { headUnit: '', earUnit: '', tailUnit: '', connectionPort: '', mechanicalParts: [], accessories: [] },
		motion: { walking: '', tailMotion: '', earMotion: '' },
		rules: { mustKeep: [], avoid: [] },
		references: [],
		referenceImages: [],
	};
}

function record(value: unknown): Record<string, unknown> {
	return value && typeof value === 'object' ? value as Record<string, unknown> : {};
}

function text(value: unknown, limit = 1000): string {
	return typeof value === 'string' ? value.trim().slice(0, limit) : '';
}

function list(value: unknown, limit = 60): string[] {
	if (!Array.isArray(value)) return [];
	return [...new Set(value.map((item) => text(item, 500)).filter(Boolean))].slice(0, limit);
}

function referenceCategory(value: unknown): VisualMemoryReferenceCategory {
	return typeof value === 'string' && (VISUAL_MEMORY_REFERENCE_CATEGORIES as readonly string[]).includes(value)
		? value as VisualMemoryReferenceCategory
		: 'Reference';
}

function referenceImages(value: unknown): VisualMemoryReferenceImage[] {
	if (!Array.isArray(value)) return [];
	return value.flatMap((item, index): VisualMemoryReferenceImage[] => {
		const source = record(item);
		const url = text(source.url, 4000);
		if (!url) return [];
		const fileName = text(source.fileName, 300) || url.split('/').pop()?.split('?')[0] || `reference-${index + 1}`;
		return [{
			id: text(source.id, 200) || `visual-reference-${index + 1}-${fileName}`,
			url,
			title: text(source.title, 300) || fileName.replace(/\.[^.]+$/, ''),
			fileName,
			createdAt: text(source.createdAt, 80) || new Date(0).toISOString(),
			tags: list(source.tags, 20),
			importantFeatures: list(source.importantFeatures, 40),
			category: referenceCategory(source.category),
			official: source.official === true,
			critical: source.critical === true,
		}];
	}).filter((item, index, all) => all.findIndex((candidate) => candidate.id === item.id || candidate.url === item.url) === index).slice(0, 60);
}

/** Backward-compatible boundary normalization for persisted data and API input. */
export function normalizeCharacterVisualMemory(value: unknown): CharacterVisualMemory {
	const source = record(value);
	const appearance = record(source.appearance);
	const equipment = record(source.equipment);
	const motion = record(source.motion);
	const rules = record(source.rules);
	return {
		characterName: text(source.characterName, 200),
		criticalFeatures: list(source.criticalFeatures, 40),
		appearance: {
			hair: text(appearance.hair),
			face: text(appearance.face),
			eyes: text(appearance.eyes),
			body: text(appearance.body),
			outfit: text(appearance.outfit),
			armor: text(appearance.armor),
			colorPalette: list(appearance.colorPalette),
		},
		equipment: {
			headUnit: text(equipment.headUnit),
			earUnit: text(equipment.earUnit),
			tailUnit: text(equipment.tailUnit),
			connectionPort: text(equipment.connectionPort),
			mechanicalParts: list(equipment.mechanicalParts),
			accessories: list(equipment.accessories),
		},
		motion: {
			walking: text(motion.walking),
			tailMotion: text(motion.tailMotion),
			earMotion: text(motion.earMotion),
		},
		rules: {
			mustKeep: list(rules.mustKeep),
			avoid: list(rules.avoid),
		},
		references: list(source.references, 20),
		referenceImages: referenceImages(source.referenceImages),
	};
}

export function hasCharacterVisualMemory(value: CharacterVisualMemory): boolean {
	return Boolean(
		value.characterName
		|| value.criticalFeatures.length
		|| value.appearance.hair
		|| value.appearance.face
		|| value.appearance.eyes
		|| value.appearance.body
		|| value.appearance.outfit
		|| value.appearance.armor
		|| value.appearance.colorPalette.length
		|| value.equipment.headUnit
		|| value.equipment.earUnit
		|| value.equipment.tailUnit
		|| value.equipment.connectionPort
		|| value.equipment.mechanicalParts.length
		|| value.equipment.accessories.length
		|| value.motion.walking
		|| value.motion.tailMotion
		|| value.motion.earMotion
		|| value.rules.mustKeep.length
		|| value.rules.avoid.length
		|| value.references.length
		|| value.referenceImages.length
	);
}

export function shiroVisualMemoryPreset(): CharacterVisualMemory {
	return normalizeCharacterVisualMemory({
		criticalFeatures: [...SHIRO_CRITICAL_FEATURES],
		appearance: {
			hair: '白髪ショートボブ',
			eyes: '青い瞳',
			body: '黒い内部フレーム',
			armor: '白い分割装甲',
			colorPalette: ['シアン発光ライン'],
		},
		equipment: {
			headUnit: 'HEAD_UNIT_01: 頭部装着型メカ耳ユニット',
			tailUnit: 'TAIL_UNIT_02: 腰部接続型メカ尻尾ユニット',
			accessories: ['肉球ヘアアクセサリー'],
		},
		motion: {
			walking: '',
			tailMotion: 'TAIL_UNIT_02は重力に従って自然に遅れて揺れる',
			earMotion: 'HEAD_UNIT_01は感情に合わせて小さく動く',
		},
		rules: {
			mustKeep: ['白い分割装甲', '黒い内部フレーム', 'HEAD_UNIT_01', 'TAIL_UNIT_02', 'Rear waist connection port', 'Segmented robotic tail', 'Mechanical ear sensor units', 'シアン発光ライン'],
			avoid: ['Biological cat ears', 'Animal ears', 'Furry tail', 'Organic tail', 'Natural cat tail', '生物的な猫耳に変えない', '生物的な猫尻尾に変えない', '普通の服に変えない', '顔アップだけの構図にしない'],
		},
		references: [],
		referenceImages: [],
	});
}
