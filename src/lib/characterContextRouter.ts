export interface CurrentCharacterContext {
  id: string;
  name: string;
}

export interface CharacterContextResult {
  prompt: string;
  imagePrompt: string;
  character?: CurrentCharacterContext;
  detectedSelfReference: boolean;
  tags: string[];
}

const SELF_REFERENCE_PATTERN = /(自分|私|あたし|僕|ボク)(?=を|の|が|は|も|で|について|$)/g;

export function resolveCharacterContextForImagePrompt(
  prompt: string,
  currentCharacter: CurrentCharacterContext
): CharacterContextResult {
  const detectedSelfReference = SELF_REFERENCE_PATTERN.test(prompt);
  SELF_REFERENCE_PATTERN.lastIndex = 0;

  if (!detectedSelfReference) {
    return {
      prompt,
      imagePrompt: prompt,
      detectedSelfReference: false,
      tags: [],
    };
  }

  const resolvedPrompt = prompt.replace(SELF_REFERENCE_PATTERN, currentCharacter.name);
  const tags = [`character:${currentCharacter.id}`];
  const imagePrompt = `${resolvedPrompt}\n${tags.join('\n')}`;

  return {
    prompt: resolvedPrompt,
    imagePrompt,
    character: currentCharacter,
    detectedSelfReference: true,
    tags,
  };
}
