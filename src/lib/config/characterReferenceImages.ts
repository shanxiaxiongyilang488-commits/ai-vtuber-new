/** Official default reference images used when an image-to-video package has no user-supplied image. */
export const CHARACTER_DEFAULT_REFERENCE_IMAGES: Record<string, string> = {
  shiro: '/assets/characters/shiro_identity_4view.png',
  'シロ': '/assets/characters/shiro_identity_4view.png',
  mike: '/assets/characters/mike_default.png',
  'ミケ': '/assets/characters/mike_default.png',
};

export type CharacterVideoReference = { role: 'identity' | 'expression' | 'mood'; image: string };

/** SHIRO OFFICIAL REFERENCE PACK. These are served static assets; mediaStore is not involved. */
export const SHIRO_OFFICIAL_REFERENCE_PACK: CharacterVideoReference[] = [
  { role: 'identity', image: '/assets/characters/shiro_identity_4view.png' },
  { role: 'expression', image: '/assets/characters/shiro_expression_smile.png' },
  { role: 'mood', image: '/assets/characters/shiro_mood_sleep.png' },
];

/** Ordered, official reference pack. Keep this order stable for image-to-video identity consistency. */
export const CHARACTER_VIDEO_REFERENCE_PACKS: Record<string, CharacterVideoReference[]> = {
  shiro: SHIRO_OFFICIAL_REFERENCE_PACK,
  'シロ': SHIRO_OFFICIAL_REFERENCE_PACK,
};

/**
 * SHIRO_SELF_REFERENCE — canonical self-portrait references.
 * Used automatically when Shiro is asked to draw herself（自分を描いて / 私を描いて / シロを描いて）.
 */
export const SHIRO_SELF_REFERENCE: string[] = [
  '/assets/characters/shiro_identity_4view.png',
  '/assets/characters/shiro_expression_smile.png',
];

export const CHARACTER_SELF_REFERENCES: Record<string, string[]> = {
  shiro: SHIRO_SELF_REFERENCE,
  'シロ': SHIRO_SELF_REFERENCE,
};

export function selfReferenceImagesFor(character: string): string[] {
  return CHARACTER_SELF_REFERENCES[character.trim().toLowerCase()]
    ?? CHARACTER_SELF_REFERENCES[character.trim()]
    ?? [];
}

export function defaultReferenceImageFor(characterName: string): string | undefined {
  return CHARACTER_DEFAULT_REFERENCE_IMAGES[characterName.trim().toLowerCase()]
    ?? CHARACTER_DEFAULT_REFERENCE_IMAGES[characterName.trim()];
}

export function videoReferencePackFor(characterName: string): CharacterVideoReference[] {
  return CHARACTER_VIDEO_REFERENCE_PACKS[characterName.trim().toLowerCase()]
    ?? CHARACTER_VIDEO_REFERENCE_PACKS[characterName.trim()]
    ?? (defaultReferenceImageFor(characterName) ? [{ role: 'identity', image: defaultReferenceImageFor(characterName)! }] : []);
}
