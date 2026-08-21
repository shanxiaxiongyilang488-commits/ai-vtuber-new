/**
 * Classifies production reference images by file name / label keywords.
 *
 * Priority (first match wins):
 *   1. Character Reference — identity / reference / turnaround / 4view / expression / mood / character
 *   2. Prop Reference      — prop / item / weapon / pod
 *   3. World Reference     — world / environment / background
 *   4. Animation Sheet     — animation_sheet / storyboard / scene / panel ONLY
 *
 * Character and Prop keywords deliberately outrank Animation Sheet so that
 * "character sheet", "expression sheet", and "mood sheet" never fall into
 * Animation Sheet. Names matching nothing default to Character Reference —
 * only explicit sheet keywords qualify as Animation Sheet.
 */

export type AnimationReferenceCategory =
	| 'Character Reference'
	| 'Animation Sheet'
	| 'World Reference'
	| 'Prop Reference';

const CHARACTER_KEYWORDS = ['identity', 'reference', 'turnaround', '4view', 'expression', 'mood', 'character', 'キャラ', '表情', '立ち絵'] as const;
const PROP_KEYWORDS = ['prop', 'item', 'weapon', 'pod', '小物', '道具', '武器'] as const;
const WORLD_KEYWORDS = ['world', 'environment', 'background', '世界', '背景'] as const;
const ANIMATION_SHEET_KEYWORDS = ['animation_sheet', 'storyboard', 'scene', 'panel', 'アニメシート', '絵コンテ'] as const;

/** Lowercases and unifies separators so "Animation Sheet" / "animation-sheet" match "animation_sheet". */
function normalizeReferenceName(name: string): string {
	return name.toLowerCase().replace(/[\s\-.]+/gu, '_');
}

function matchesAny(normalized: string, keywords: readonly string[]): boolean {
	return keywords.some((keyword) => normalized.includes(normalizeReferenceName(keyword)));
}

export function classifyAnimationReference(name: string): AnimationReferenceCategory {
	const normalized = normalizeReferenceName(name);
	if (matchesAny(normalized, CHARACTER_KEYWORDS)) return 'Character Reference';
	if (matchesAny(normalized, PROP_KEYWORDS)) return 'Prop Reference';
	if (matchesAny(normalized, WORLD_KEYWORDS)) return 'World Reference';
	if (matchesAny(normalized, ANIMATION_SHEET_KEYWORDS)) return 'Animation Sheet';
	return 'Character Reference';
}

/** Extracts a classifiable name from a URL; data URLs carry no name. */
export function referenceNameFromUrl(url: string): string {
	if (!url || url.startsWith('data:image/')) return '';
	try {
		return decodeURIComponent(url.split('?')[0].split('#')[0].split('/').at(-1) ?? '');
	} catch {
		return url.split('?')[0].split('#')[0].split('/').at(-1) ?? '';
	}
}
