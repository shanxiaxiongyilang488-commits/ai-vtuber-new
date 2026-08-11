import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { getCharacter } from '$lib/server/characterRegistry';

const SKILLS_ROOT = resolve(process.cwd(), 'src', 'lib', 'skills');

const IMAGE_SKILL_REFERENCES: Record<string, readonly string[]> = {
  'design-mecha-cat-android': ['design-contract.md', 'prompt-patterns.md'],
};

export interface ImageDesignSkillContext {
  activeSkillIds: string[];
  context: string;
}

function readSkillFile(skillId: string, relativePath: string): string {
  const file = resolve(SKILLS_ROOT, skillId, relativePath);
  const skillRoot = resolve(SKILLS_ROOT, skillId);
  if (!file.startsWith(`${skillRoot}\\`) && !file.startsWith(`${skillRoot}/`)) {
    throw new Error(`invalid skill resource path: ${relativePath}`);
  }
  return readFileSync(file, 'utf-8').trim();
}

/** Build IMAGE-only design context. CHAT paths never call this loader. */
export function loadImageDesignSkillContext(characterId: string): ImageDesignSkillContext {
  const character = getCharacter(characterId);
  const configuredIds = character?.skillIds ?? [];
  const activeSkillIds = configuredIds.filter((skillId) => skillId in IMAGE_SKILL_REFERENCES);
  const sections = activeSkillIds.map((skillId) => {
    const resources = [
      ['SKILL.md', readSkillFile(skillId, 'SKILL.md')],
      ...IMAGE_SKILL_REFERENCES[skillId].map((name) => [
        `references/${name}`,
        readSkillFile(skillId, `references/${name}`),
      ]),
    ];
    return [
      `DESIGN SKILL: ${skillId}`,
      ...resources.map(([name, content]) => `--- ${name} ---\n${content}`),
    ].join('\n\n');
  });
  return { activeSkillIds, context: sections.join('\n\n') };
}
