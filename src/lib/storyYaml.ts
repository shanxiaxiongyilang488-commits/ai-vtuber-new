export type StoryYamlType =
  | 'short_story'
  | 'comic_story'
  | 'long_story'
  | 'novel_story'
  | 'character_sheet'
  | 'world_setting'
  | string;

export type StoryYamlCharacter = {
  name: string;
  role: string;
  visual: string;
  personality: string;
  speechStyle?: string;
};

export type StoryContinuityCharacter = {
  name: string;
  role: string;
  appearance: string;
  personality: string;
  speechStyle: string;
};

export type StoryContinuityMemory = {
  seriesTitle: string;
  currentEpisodeTitle: string;
  pageIndex: number;
  characters: StoryContinuityCharacter[];
  lockedFacts: string[];
  lastPageSummary: string;
  currentLocation: string;
  unresolvedThreads: string[];
  nextPageIntent: string;
};

export type StoryYamlBeat = {
  beat: string;
  summary: string;
};

export type StoryYamlPanel = {
  panel: number;
  scene: string;
  dialogue: string[];
  prompt: string;
};

export type StoryYamlPage = {
  page: number;
  layout: string;
  summary: string;
  panels: StoryYamlPanel[];
};

export type StoryYamlDocument = {
  storyType: StoryYamlType;
  title: string;
  theme: string;
  characters: StoryYamlCharacter[];
  storyBeats: StoryYamlBeat[];
  pages: StoryYamlPage[];
  overview: string;
  continuity: StoryContinuityMemory;
  rawYaml: string;
};

export const DEFAULT_CONTINUITY_LOCKED_FACTS = [
  'キャラクター名を変更しない',
  '既存キャラクターの関係性を維持する',
  '姉妹設定を維持する',
  '前ページの直後から開始する',
  '記憶喪失・別世界転移など、ユーザー未指定の新展開を追加しない',
  '新キャラクターはユーザーが指定した場合のみ追加する',
  'シリーズタイトルを変更しない',
] as const;

function stripYamlFence(text: string): string {
  const fenced = text.match(/```ya?ml\s*([\s\S]*?)```/i);
  return (fenced?.[1] ?? text).trim();
}

function unquote(value: string): string {
  const trimmed = value.trim();
  if (
    (trimmed.startsWith('"') && trimmed.endsWith('"'))
    || (trimmed.startsWith("'") && trimmed.endsWith("'"))
  ) {
    const inner = trimmed.slice(1, -1);
    if (trimmed.startsWith('"')) {
      try {
        return JSON.parse(trimmed);
      } catch {
        return inner.replace(/\\"/g, '"');
      }
    }
    return inner.replace(/''/g, "'");
  }
  return trimmed;
}

function topLevelValue(yaml: string, key: string): string {
  return unquote(yaml.match(new RegExp(`^${key}:\\s*(.*)$`, 'm'))?.[1] ?? '');
}

function indentedSection(yaml: string, key: string): string {
  const match = yaml.match(new RegExp(`^${key}:\\s*\\n((?:[ \\t]+.*(?:\\n|$))*)`, 'm'));
  return match?.[1] ?? '';
}

function sectionValue(section: string, key: string): string {
  return unquote(section.match(new RegExp(`^\\s+${key}:\\s*(.*)$`, 'm'))?.[1] ?? '');
}

function sectionList(section: string, key: string): string[] {
  const lines = section.split(/\r?\n/);
  const start = lines.findIndex((line) => new RegExp(`^\\s+${key}:\\s*$`).test(line));
  if (start < 0) return [];
  const keyIndent = lines[start].match(/^\s*/)?.[0].length ?? 0;
  const values: string[] = [];
  for (let index = start + 1; index < lines.length; index++) {
    const line = lines[index];
    if (!line.trim()) continue;
    const indent = line.match(/^\s*/)?.[0].length ?? 0;
    if (indent <= keyIndent) break;
    const item = line.match(/^\s*-\s+(.*)$/);
    if (item) values.push(unquote(item[1]));
  }
  return values;
}

function mergeLockedFacts(facts: string[]): string[] {
  return Array.from(new Set([
    ...DEFAULT_CONTINUITY_LOCKED_FACTS,
    ...facts.map((fact) => fact.trim()).filter(Boolean),
  ]));
}

function pageSummary(document: Pick<StoryYamlDocument, 'pages' | 'overview'>): string {
  const lastPage = document.pages.at(-1);
  if (lastPage?.summary.trim()) return lastPage.summary.trim();
  const scenes = lastPage?.panels.map((panel) => panel.scene.trim()).filter(Boolean) ?? [];
  return scenes.join(' / ') || document.overview.trim();
}

export function extractStoryContinuity(
  text: string,
  parsedDocument?: StoryYamlDocument | null,
): StoryContinuityMemory | null {
  const document = parsedDocument ?? parseStoryYaml(text);
  if (!document) return null;
  const yaml = stripYamlFence(text);
  const section = indentedSection(yaml, 'continuity');
  const explicitPageIndex = Number(sectionValue(section, 'pageIndex'));
  const explicitCharacters = document.characters.map((character) => ({
    name: character.name,
    role: character.role,
    appearance: character.visual,
    personality: character.personality,
    speechStyle: character.speechStyle ?? '',
  }));

  return {
    seriesTitle: sectionValue(section, 'seriesTitle') || document.title,
    currentEpisodeTitle: sectionValue(section, 'currentEpisodeTitle') || document.title,
    pageIndex: Number.isFinite(explicitPageIndex) && explicitPageIndex > 0
      ? explicitPageIndex
      : Math.max(1, ...document.pages.map((page) => page.page)),
    characters: explicitCharacters,
    lockedFacts: mergeLockedFacts(sectionList(section, 'lockedFacts')),
    lastPageSummary: sectionValue(section, 'lastPageSummary') || pageSummary(document),
    currentLocation: sectionValue(section, 'currentLocation')
      || topLevelValue(yaml, 'current_location'),
    unresolvedThreads: sectionList(section, 'unresolvedThreads'),
    nextPageIntent: sectionValue(section, 'nextPageIntent'),
  };
}

function yamlQuote(value: string): string {
  return `"${value.replace(/\r?\n/g, ' ').replace(/\\/g, '\\\\').replace(/"/g, '\\"').trim()}"`;
}

export function storyContinuityToYaml(memory: StoryContinuityMemory): string {
  const lines = [
    'continuity:',
    `  seriesTitle: ${yamlQuote(memory.seriesTitle)}`,
    `  currentEpisodeTitle: ${yamlQuote(memory.currentEpisodeTitle)}`,
    `  pageIndex: ${memory.pageIndex}`,
    '  characters:',
  ];
  for (const character of memory.characters) {
    lines.push(`    - name: ${yamlQuote(character.name)}`);
    lines.push(`      role: ${yamlQuote(character.role)}`);
    lines.push(`      appearance: ${yamlQuote(character.appearance)}`);
    lines.push(`      personality: ${yamlQuote(character.personality)}`);
    lines.push(`      speechStyle: ${yamlQuote(character.speechStyle)}`);
  }
  lines.push('  lockedFacts:');
  for (const fact of mergeLockedFacts(memory.lockedFacts)) {
    lines.push(`    - ${yamlQuote(fact)}`);
  }
  lines.push(`  lastPageSummary: ${yamlQuote(memory.lastPageSummary)}`);
  lines.push(`  currentLocation: ${yamlQuote(memory.currentLocation)}`);
  if (memory.unresolvedThreads.length === 0) {
    lines.push('  unresolvedThreads: []');
  } else {
    lines.push('  unresolvedThreads:');
    for (const thread of memory.unresolvedThreads) lines.push(`    - ${yamlQuote(thread)}`);
  }
  lines.push(`  nextPageIntent: ${yamlQuote(memory.nextPageIntent)}`);
  return lines.join('\n');
}

export function formatStoryContinuityLog(memory: StoryContinuityMemory): string {
  return [
    '[CONTINUITY_MEMORY]',
    `seriesTitle: ${memory.seriesTitle}`,
    `pageIndex: ${memory.pageIndex}`,
    `characters: ${memory.characters.map((character) => character.name).join(', ')}`,
    `lastPageSummary: ${memory.lastPageSummary}`,
    `lockedFacts: ${memory.lockedFacts.join(' / ')}`,
  ].join('\n');
}

export function isStoryYaml(text: string): boolean {
  const yaml = stripYamlFence(text);
  const type = topLevelValue(yaml, 'story_type')
    || topLevelValue(yaml, 'document_type')
    || topLevelValue(yaml, 'type');
  return /^(?:story_type|document_type|title|characters|world_setting):\s*/m.test(yaml)
    || /^(?:short_story|comic_story|long_story|novel_story|character_sheet|world_setting)$/i.test(type);
}

export function parseStoryYaml(text: string): StoryYamlDocument | null {
  if (!isStoryYaml(text)) return null;

  const rawYaml = stripYamlFence(text);
  const document: StoryYamlDocument = {
    storyType: topLevelValue(rawYaml, 'story_type')
      || topLevelValue(rawYaml, 'document_type')
      || topLevelValue(rawYaml, 'type')
      || 'comic_story',
    title: topLevelValue(rawYaml, 'title') || '無題',
    theme: topLevelValue(rawYaml, 'theme'),
    characters: [],
    storyBeats: [],
    pages: [],
    overview: topLevelValue(rawYaml, 'summary')
      || topLevelValue(rawYaml, 'synopsis')
      || topLevelValue(rawYaml, 'description'),
    continuity: {} as StoryContinuityMemory,
    rawYaml,
  };

  let section = '';
  let currentCharacter: StoryYamlCharacter | null = null;
  let currentBeat: StoryYamlBeat | null = null;
  let currentPage: StoryYamlPage | null = null;
  let currentPanel: StoryYamlPanel | null = null;
  let inDialogue = false;

  const flushCharacter = () => {
    if (currentCharacter) document.characters.push(currentCharacter);
    currentCharacter = null;
  };
  const flushBeat = () => {
    if (currentBeat) document.storyBeats.push(currentBeat);
    currentBeat = null;
  };
  const flushPanel = () => {
    if (currentPage && currentPanel) currentPage.panels.push(currentPanel);
    currentPanel = null;
    inDialogue = false;
  };
  const flushPage = () => {
    flushPanel();
    if (currentPage) document.pages.push(currentPage);
    currentPage = null;
  };

  for (const rawLine of rawYaml.split(/\r?\n/)) {
    const line = rawLine.replace(/\t/g, '  ');
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;

    const topLevel = line.match(/^([A-Za-z_][\w-]*):\s*(.*)$/);
    if (topLevel) {
      flushCharacter();
      flushBeat();
      if (section === 'pages') flushPage();
      section = topLevel[1];
      continue;
    }

    if (section === 'characters') {
      const start = line.match(/^\s*-\s+name:\s*(.*)$/);
      if (start) {
        flushCharacter();
        currentCharacter = { name: unquote(start[1]), role: '', visual: '', personality: '' };
        continue;
      }
      const field = line.match(/^\s+(role|visual|personality|speechStyle|speech_style):\s*(.*)$/);
      if (field && currentCharacter) {
        const key = field[1] === 'speech_style' ? 'speechStyle' : field[1];
        currentCharacter[key as 'role' | 'visual' | 'personality' | 'speechStyle'] = unquote(field[2]);
      }
      continue;
    }

    if (section === 'story_beats') {
      const start = line.match(/^\s*-\s+beat:\s*(.*)$/);
      if (start) {
        flushBeat();
        currentBeat = { beat: unquote(start[1]), summary: '' };
        continue;
      }
      const summary = line.match(/^\s+summary:\s*(.*)$/);
      if (summary && currentBeat) currentBeat.summary = unquote(summary[1]);
      continue;
    }

    if (section !== 'pages') continue;

    const pageStart = line.match(/^\s*-\s+page:\s*(.*)$/);
    if (pageStart) {
      flushPage();
      currentPage = {
        page: Number(unquote(pageStart[1])) || document.pages.length + 1,
        layout: 'free_page',
        summary: '',
        panels: [],
      };
      continue;
    }
    if (!currentPage) continue;

    const panelStart = line.match(/^\s*-\s+panel:\s*(.*)$/);
    if (panelStart) {
      flushPanel();
      currentPanel = {
        panel: Number(unquote(panelStart[1])) || currentPage.panels.length + 1,
        scene: '',
        dialogue: [],
        prompt: '',
      };
      continue;
    }

    const pageField = line.match(/^\s+(layout|summary):\s*(.*)$/);
    if (pageField && !currentPanel) {
      currentPage[pageField[1] as 'layout' | 'summary'] = unquote(pageField[2]);
      continue;
    }
    if (!currentPanel) continue;

    if (/^\s+dialogue:\s*\[\s*\]\s*$/.test(line)) {
      inDialogue = false;
      continue;
    }
    if (/^\s+dialogue:\s*$/.test(line)) {
      inDialogue = true;
      continue;
    }
    const dialogue = inDialogue ? line.match(/^\s*-\s+(.*)$/) : null;
    if (dialogue) {
      currentPanel.dialogue.push(unquote(dialogue[1]));
      continue;
    }
    const panelField = line.match(/^\s+(scene|prompt):\s*(.*)$/);
    if (panelField) {
      inDialogue = false;
      currentPanel[panelField[1] as 'scene' | 'prompt'] = unquote(panelField[2]);
    }
  }

  flushCharacter();
  flushBeat();
  if (section === 'pages') flushPage();
  if (document.pages.length === 0) {
    const legacyPanels: StoryYamlPanel[] = [];
    for (let index = 1; index <= 12; index++) {
      const block = rawYaml.match(
        new RegExp(`(?:^|\\n)panel${index}:\\s*[^\\n]*\\n((?:[ \\t]+[^\\n]+\\n?)*)`, 'i'),
      )?.[1];
      if (!block) continue;
      const value = (key: string) => unquote(
        block.match(new RegExp(`^[ \\t]+${key}:\\s*(.*)$`, 'mi'))?.[1] ?? '',
      );
      legacyPanels.push({
        panel: index,
        scene: value('scene'),
        dialogue: [value('dialogue') || value('line')].filter(Boolean),
        prompt: value('prompt'),
      });
    }
    if (legacyPanels.length > 0) {
      document.pages.push({
        page: 1,
        layout: legacyPanels.length === 4 ? '4panel' : 'free_page',
        summary: document.overview,
        panels: legacyPanels,
      });
    }
  }
  if (!document.overview) {
    document.overview = document.storyBeats
      .map((beat) => beat.summary)
      .filter(Boolean)
      .join(' ');
  }
  document.continuity = extractStoryContinuity(rawYaml, document)!;
  return document;
}
