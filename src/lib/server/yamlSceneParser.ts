export type YamlPanelCharacter = {
  name: string;
  pose: string;
  line: string;
};

export type YamlScenePanel = {
  panel: number;
  scene: string;
  chars: YamlPanelCharacter[];
  prompt: string;
  negativePrompt?: string;
  model?: string;
};

export type YamlSceneDocument = {
  layout: string;
  pagePrompt: string;
  storySummary: string;
  chars: YamlPanelCharacter[];
  panels: YamlScenePanel[];
};

function stripCodeFence(text: string): string {
  const block = text.match(/```(?:ya?ml|json)?\s*([\s\S]*?)```/i);
  return (block?.[1] ?? text).trim();
}

function parseScalar(raw: string): string {
  const trimmed = raw.trim();
  if (!trimmed) return '';
  try {
    if (
      (trimmed.startsWith('"') && trimmed.endsWith('"')) ||
      (trimmed.startsWith("'") && trimmed.endsWith("'"))
    ) {
      return JSON.parse(trimmed.replace(/^'/, '"').replace(/'$/, '"'));
    }
  } catch {
    // Use the plain scalar fallback below.
  }
  return trimmed.replace(/^["']|["']$/g, '');
}

function splitNames(value: unknown): string[] {
  if (Array.isArray(value)) {
    return value.flatMap((item) => {
      if (typeof item === 'string') return item.split(/[,/]/);
      if (item && typeof item === 'object') {
        const record = item as { name?: unknown; id?: unknown; character?: unknown };
        return [record.name, record.id, record.character].filter(Boolean).map(String);
      }
      return [];
    }).map((item) => item.trim()).filter(Boolean);
  }
  if (typeof value === 'string') return value.split(/[,/]/).map((item) => item.trim()).filter(Boolean);
  return [];
}

function characterKey(character: YamlPanelCharacter): string {
  return `${character.name}\n${character.pose}\n${character.line}`.trim().toLowerCase();
}

function uniqueCharacters(characters: YamlPanelCharacter[]): YamlPanelCharacter[] {
  const seen = new Set<string>();
  const result: YamlPanelCharacter[] = [];
  for (const character of characters) {
    const normalized: YamlPanelCharacter = {
      name: character.name.trim(),
      pose: character.pose.trim(),
      line: character.line.trim(),
    };
    if (!normalized.name && !normalized.pose && !normalized.line) continue;
    const key = characterKey(normalized);
    if (seen.has(key)) continue;
    seen.add(key);
    result.push(normalized);
  }
  return result;
}

function lineFromDialogue(value: unknown): string {
  if (Array.isArray(value)) {
    return value
      .map((item) => {
        if (typeof item === 'string') return item;
        if (item && typeof item === 'object') {
          const record = item as { speaker?: unknown; text?: unknown };
          return [record.speaker, record.text].filter(Boolean).join(': ');
        }
        return '';
      })
      .filter(Boolean)
      .join('\n');
  }
  return typeof value === 'string' ? value : '';
}

function charactersFromUnknown(value: unknown, fallbackPose = '', fallbackLine = ''): YamlPanelCharacter[] {
  if (Array.isArray(value)) {
    return uniqueCharacters(value.flatMap((item) => {
      if (typeof item === 'string') return [{ name: item, pose: fallbackPose, line: fallbackLine }];
      if (item && typeof item === 'object') {
        const record = item as {
          name?: unknown;
          id?: unknown;
          character?: unknown;
          pose?: unknown;
          position?: unknown;
          action?: unknown;
          expression?: unknown;
          cat_ears?: unknown;
          line?: unknown;
          speech?: unknown;
          dialogue?: unknown;
        };
        const pose = [
          typeof record.pose === 'string' ? record.pose : '',
          typeof record.position === 'string' ? `position: ${record.position}` : '',
          typeof record.action === 'string' ? `action: ${record.action}` : '',
          typeof record.expression === 'string' ? `expression: ${record.expression}` : '',
          typeof record.cat_ears === 'string' ? `cat ears: ${record.cat_ears}` : '',
        ].filter(Boolean).join(', ');
        return [{
          name: String(record.name ?? record.id ?? record.character ?? ''),
          pose: pose || fallbackPose,
          line: typeof record.speech === 'string'
            ? record.speech
            : typeof record.line === 'string'
              ? record.line
              : lineFromDialogue(record.dialogue) || fallbackLine,
        }];
      }
      return [];
    }));
  }
  return splitNames(value).map((name) => ({ name, pose: fallbackPose, line: fallbackLine }));
}

function panelFromObject(raw: Record<string, unknown>, index: number): YamlScenePanel {
  const visualDetails = [
    typeof raw.position === 'string' ? `position: ${raw.position}` : '',
    typeof raw.action === 'string' ? `action: ${raw.action}` : '',
    typeof raw.expression === 'string' ? `expression: ${raw.expression}` : '',
    typeof raw.cat_ears === 'string' ? `cat ears: ${raw.cat_ears}` : '',
  ].filter(Boolean);
  const fallbackPose = [
    typeof raw.pose === 'string' ? raw.pose : '',
    ...visualDetails,
  ].filter(Boolean).join(', ');
  const fallbackLine = typeof raw.speech === 'string'
    ? raw.speech
    : typeof raw.line === 'string'
      ? raw.line
      : lineFromDialogue(raw.dialogue);
  const chars = uniqueCharacters([
    ...charactersFromUnknown(raw.chars, fallbackPose, fallbackLine),
    ...charactersFromUnknown(raw.character, fallbackPose, fallbackLine),
    ...charactersFromUnknown(raw.characters, fallbackPose, fallbackLine),
  ]);

  return {
    panel: Number(raw.panel ?? raw.number) || index + 1,
    scene: typeof raw.scene === 'string'
      ? raw.scene
      : typeof raw.bg === 'string'
        ? raw.bg
        : typeof raw.background === 'string'
          ? raw.background
          : '',
    chars,
    prompt: typeof raw.prompt === 'string' ? raw.prompt : '',
    negativePrompt: typeof raw.negative_prompt === 'string' ? raw.negative_prompt : undefined,
    model: typeof raw.model === 'string' ? raw.model : undefined,
  };
}

function parseJsonDocument(text: string): YamlSceneDocument | null {
  try {
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    const parsed = JSON.parse(jsonMatch?.[0] ?? text) as {
      pages?: Array<{ layout?: string; prompt?: string; story_summary?: string; panels?: Array<Record<string, unknown>> }>;
      refs?: Record<string, unknown>;
      chars?: unknown;
      characters?: unknown;
    };
    const pages = Array.isArray(parsed.pages) ? parsed.pages : [];
    const panels = pages.flatMap((page) => Array.isArray(page.panels) ? page.panels : []);
    if (panels.length === 0) return null;

    const refs = parsed.refs && typeof parsed.refs === 'object'
      ? Object.values(parsed.refs).map((value) => typeof value === 'string' ? value : '')
      : [];

    return {
      layout: pages.map((page) => page.layout).find(Boolean) ?? '',
      pagePrompt: pages.map((page) => page.prompt).filter(Boolean).join('\n'),
      storySummary: pages.map((page) => page.story_summary).filter(Boolean).join('\n'),
      chars: uniqueCharacters([
        ...charactersFromUnknown(refs),
        ...charactersFromUnknown(parsed.chars),
        ...charactersFromUnknown(parsed.characters),
      ]),
      panels: panels.map(panelFromObject),
    };
  } catch {
    return null;
  }
}

function emptyPanel(panel = 1): YamlScenePanel {
  return { panel, scene: '', chars: [], prompt: '' };
}

function firstPanelRawBlock(yaml: string): string {
  const lines = yaml.split('\n');
  const start = lines.findIndex((line) => {
    const trimmed = line.trim();
    return /^-\s*panel\s*:\s*1\b/i.test(trimmed) || /^panel_?1\s*:\s*$/i.test(trimmed);
  });
  if (start < 0) return yaml.slice(0, 2000);

  const startIndent = lines[start].match(/^\s*/)?.[0].length ?? 0;
  let end = lines.length;
  for (let i = start + 1; i < lines.length; i++) {
    const line = lines[i];
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const indent = line.match(/^\s*/)?.[0].length ?? 0;
    if (indent <= startIndent && (/^-\s*panel\s*:/i.test(trimmed) || /^panel_?[0-9]+\s*:\s*$/i.test(trimmed))) {
      end = i;
      break;
    }
  }
  return lines.slice(start, end).join('\n').trim();
}

function logPanelParseDebug(raw: string, panel: YamlScenePanel | null): void {
  console.log('[YAML_PANEL_RAW]', raw);
  console.log('[YAML_PANEL_PARSED]', panel);
  console.log('[PANEL_CHAR_COUNT]', panel?.chars.length ?? 0);
}

export function parseYamlSceneDocument(source: string): YamlSceneDocument {
  const yaml = stripCodeFence(source);
  const jsonDoc = parseJsonDocument(yaml);
  if (jsonDoc) {
    logPanelParseDebug(firstPanelRawBlock(yaml), jsonDoc.panels[0] ?? null);
    return jsonDoc;
  }

  const document: YamlSceneDocument = {
    layout: '',
    pagePrompt: '',
    storySummary: '',
    chars: [],
    panels: [],
  };

  const keyVal = (line: string) => line.match(/^\s*(?:-\s*)?([A-Za-z0-9_]+):\s*(.*)$/);
  let currentPanel: YamlScenePanel | null = null;
  let currentCharacter: YamlPanelCharacter | null = null;
  let inPanels = false;
  let inRefs = false;
  let inDocumentChars = false;
  let inPanelChars = false;
  let inDialogue = false;
  let dialogueSpeaker = '';

  const appendCharacterPose = (label: string, value: string) => {
    currentCharacter = currentCharacter ?? { name: '', pose: '', line: '' };
    const detail = `${label}: ${parseScalar(value)}`;
    currentCharacter.pose = [currentCharacter.pose, detail].filter(Boolean).join(', ');
  };

  const pushDocumentChars = (value: string) => {
    document.chars = uniqueCharacters([
      ...document.chars,
      ...charactersFromUnknown(parseScalar(value)),
    ]);
  };

  const flushCharacter = () => {
    if (!currentCharacter || !currentPanel) {
      currentCharacter = null;
      return;
    }
    currentPanel.chars = uniqueCharacters([...currentPanel.chars, currentCharacter]);
    currentCharacter = null;
  };

  const flushPanel = () => {
    flushCharacter();
    if (!currentPanel) return;
    currentPanel.chars = uniqueCharacters(currentPanel.chars);
    if (currentPanel.scene || currentPanel.chars.length > 0 || currentPanel.prompt) {
      document.panels.push(currentPanel);
    }
    currentPanel = null;
    inPanelChars = false;
    inDialogue = false;
    dialogueSpeaker = '';
  };

  const ensurePanel = (panel?: number) => {
    if (!currentPanel) currentPanel = emptyPanel(panel ?? document.panels.length + 1);
    return currentPanel;
  };

  for (const rawLine of yaml.split('\n')) {
    const line = rawLine.replace(/\t/g, '  ');
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    if (trimmed === 'pages:') {
      flushCharacter();
      inPanels = false;
      inRefs = false;
      inDocumentChars = false;
      inPanelChars = false;
      continue;
    }
    const indent = line.match(/^\s*/)?.[0].length ?? 0;

    if (trimmed.startsWith('- ') && !trimmed.includes(':')) {
      const item = trimmed.replace(/^-\s*/, '');
      if (inPanelChars) {
        ensurePanel().chars = uniqueCharacters([
          ...ensurePanel().chars,
          { name: parseScalar(item), pose: '', line: '' },
        ]);
        continue;
      }
      if (inDocumentChars) {
        pushDocumentChars(item);
        continue;
      }
    }

    const panelHeader = trimmed.match(/^(?:-\s*)?panel_?([0-9]+):\s*$/i);
    if (panelHeader) {
      flushPanel();
      currentPanel = emptyPanel(Number(panelHeader[1]) || document.panels.length + 1);
      inPanels = true;
      inRefs = false;
      inDocumentChars = false;
      continue;
    }

    const kv = keyVal(line);
    if (!kv) continue;
    const key = kv[1].toLowerCase();
    const value = kv[2] ?? '';

    if (key === 'refs') {
      flushCharacter();
      inRefs = true;
      inDocumentChars = false;
      inPanelChars = false;
      inPanels = false;
      continue;
    }

    if (key === 'panels') {
      flushCharacter();
      inPanels = true;
      inRefs = false;
      inDocumentChars = false;
      inPanelChars = false;
      continue;
    }

    if (inRefs && indent <= 4 && ['a', 'b', 'c', 'd', 'ref', 'character'].includes(key)) {
      pushDocumentChars(value);
      continue;
    }

    if (!inPanels && (key === 'chars' || key === 'characters')) {
      inDocumentChars = true;
      if (value) pushDocumentChars(value);
      continue;
    }

    if (!inPanels && inDocumentChars && trimmed.startsWith('- ')) {
      pushDocumentChars(value || trimmed.replace(/^-\s*/, ''));
      continue;
    }

    if (!inPanels && indent <= 4) {
      if (key === 'layout') document.layout = parseScalar(value);
      else if (key === 'prompt') document.pagePrompt = parseScalar(value);
      else if (key === 'story_summary') document.storySummary = parseScalar(value);
      else if (key === 'character') pushDocumentChars(value);
      continue;
    }

    if (inPanels && trimmed.startsWith('- ') && ['panel', 'number'].includes(key)) {
      flushPanel();
      currentPanel = emptyPanel(Number(parseScalar(value)) || document.panels.length + 1);
      inPanelChars = false;
      inDialogue = false;
      continue;
    }

    if (inPanels && trimmed.startsWith('- ') && ['scene', 'bg', 'background', 'chars', 'character', 'characters', 'pose', 'line', 'speech', 'prompt'].includes(key)) {
      if (inPanelChars && (key === 'name' || key === 'character')) {
        flushCharacter();
      } else {
        flushPanel();
      }
      const panel = ensurePanel(key === 'panel' ? Number(parseScalar(value)) || undefined : undefined);
      if (key === 'scene' || key === 'bg' || key === 'background') panel.scene = parseScalar(value);
      else if (key === 'prompt') panel.prompt = parseScalar(value);
      else if (key === 'chars' || key === 'character' || key === 'characters') {
        const chars = charactersFromUnknown(parseScalar(value));
        if (chars.length > 0) panel.chars = uniqueCharacters([...panel.chars, ...chars]);
        inPanelChars = true;
      } else if (key === 'pose') {
        currentCharacter = currentCharacter ?? { name: '', pose: '', line: '' };
        currentCharacter.pose = parseScalar(value);
      } else if (key === 'line') {
        currentCharacter = currentCharacter ?? { name: '', pose: '', line: '' };
        currentCharacter.line = parseScalar(value);
      } else if (key === 'speech') {
        currentCharacter = currentCharacter ?? { name: '', pose: '', line: '' };
        currentCharacter.line = parseScalar(value);
      }
      inDialogue = false;
      continue;
    }

    const panel = inPanels ? ensurePanel() : currentPanel;
    if (!panel) continue;

    if (key === 'panel' || key === 'number') panel.panel = Number(parseScalar(value)) || panel.panel;
    else if (key === 'scene' || key === 'bg' || key === 'background') panel.scene = parseScalar(value);
    else if (key === 'prompt') panel.prompt = parseScalar(value);
    else if (key === 'negative_prompt') panel.negativePrompt = parseScalar(value);
    else if (key === 'model') panel.model = parseScalar(value);
    else if (key === 'chars' || key === 'characters') {
      if (value) panel.chars = uniqueCharacters([...panel.chars, ...charactersFromUnknown(parseScalar(value))]);
      inPanelChars = true;
    } else if (inPanelChars && trimmed.startsWith('- ') && (key === 'name' || key === 'character' || key === 'id')) {
      flushCharacter();
      currentCharacter = { name: parseScalar(value), pose: '', line: '' };
    } else if (inPanelChars && key === 'name') {
      currentCharacter = currentCharacter ?? { name: '', pose: '', line: '' };
      currentCharacter.name = parseScalar(value);
    } else if (inPanelChars && key === 'pose') {
      currentCharacter = currentCharacter ?? { name: '', pose: '', line: '' };
      currentCharacter.pose = parseScalar(value);
    } else if (inPanelChars && ['position', 'action', 'expression', 'cat_ears'].includes(key)) {
      appendCharacterPose(key === 'cat_ears' ? 'cat ears' : key, value);
    } else if (inPanelChars && (key === 'line' || key === 'speech')) {
      currentCharacter = currentCharacter ?? { name: '', pose: '', line: '' };
      currentCharacter.line = parseScalar(value);
    } else if (key === 'character') {
      panel.chars = uniqueCharacters([...panel.chars, ...charactersFromUnknown(parseScalar(value))]);
    } else if (key === 'pose' || key === 'line' || key === 'dialogue') {
      const fallback = panel.chars.length === 1
        ? panel.chars[0]
        : { name: '', pose: '', line: '' };
      const next = { ...fallback };
      if (key === 'pose') next.pose = parseScalar(value);
      else {
        next.line = parseScalar(value);
        try {
          next.line = lineFromDialogue(JSON.parse(next.line.replace(/\\"/g, '"'))) || next.line;
        } catch {
          // Plain scalar line.
        }
      }
      panel.chars = uniqueCharacters([...panel.chars.filter((char) => char.name !== next.name || !next.name), next]);
      inDialogue = key === 'dialogue';
      dialogueSpeaker = '';
    } else if (inDialogue && trimmed.startsWith('- ') && key === 'speaker') {
      dialogueSpeaker = parseScalar(value);
    } else if (inDialogue && key === 'text') {
      const lineText = [dialogueSpeaker, parseScalar(value)].filter(Boolean).join(': ');
      panel.chars = uniqueCharacters([...panel.chars, { name: dialogueSpeaker, pose: '', line: lineText }]);
    }
  }

  flushPanel();

  const speakers = document.panels.flatMap((panel) =>
    panel.chars
      .flatMap((character) => character.line.split('\n'))
      .map((line) => line.match(/^([^:：]{1,40})[:：]/)?.[1])
      .filter((value): value is string => Boolean(value))
      .map((name) => ({ name, pose: '', line: '' })),
  );
  document.chars = uniqueCharacters([
    ...document.chars,
    ...document.panels.flatMap((panel) => panel.chars),
    ...speakers,
  ]);

  logPanelParseDebug(firstPanelRawBlock(yaml), document.panels[0] ?? null);
  return document;
}

export function getYamlScenePanel(document: YamlSceneDocument): YamlScenePanel | null {
  return document.panels[0] ?? null;
}

function characterPrompt(character: YamlPanelCharacter): string {
  return [
    character.name ? `name: ${character.name}` : '',
    character.pose ? `pose: ${character.pose}` : '',
    character.line ? `line: ${character.line}` : '',
  ].filter(Boolean).join(', ');
}

export function buildImagePromptFromYamlPanel(document: YamlSceneDocument, panel: YamlScenePanel): string {
  const chars = uniqueCharacters([...document.chars, ...panel.chars]);
  const dialogue = chars.map((character) => character.line.trim()).filter(Boolean);
  return [
    'Japanese manga panel',
    document.storySummary ? `story summary: ${document.storySummary}` : '',
    document.pagePrompt ? `page direction: ${document.pagePrompt}` : '',
    panel.scene ? `scene: ${panel.scene}` : '',
    chars.length > 0 ? `characters: ${chars.map(characterPrompt).join(' | ')}` : '',
    panel.prompt ? `visual prompt: ${panel.prompt}` : '',
    dialogue.length > 0
      ? `MANDATORY SPEECH BUBBLES: Draw a clear manga speech bubble for every dialogue line. Preserve the exact dialogue text: ${dialogue.join(' | ')}. Do not omit speech bubbles.`
      : 'No dialogue is present; do not add an empty speech bubble.',
    'anime style, clean lineart, highly detailed, consistent character design, cinematic composition',
    panel.negativePrompt ? `avoid: ${panel.negativePrompt}` : '',
  ].filter(Boolean).join(', ');
}

export function buildComicPanelStoryText(panels: YamlScenePanel[]): string {
  return panels.map((panel, index) => {
    const storyBeats = panel.chars.map((character) => {
      const action = [character.name, character.pose].filter(Boolean).join(': ');
      const dialogue = character.line
        ? `${character.name || 'Character'} says: ${character.line}`
        : '';
      return [action, dialogue].filter(Boolean).join('\n');
    });
    return [
      `Panel ${panel.panel || index + 1}:`,
      panel.scene || '',
      ...storyBeats,
      panel.prompt || '',
    ].filter(Boolean).join('\n');
  }).join('\n\n');
}

export function buildComicPagePromptFromPanels(
  document: YamlSceneDocument,
  panels: YamlScenePanel[],
): string {
  const panelStoryText = buildComicPanelStoryText(panels);
  const dialogueLines = panels.flatMap((panel) =>
    panel.chars.map((character) => character.line.trim()).filter(Boolean),
  );
  return [
    'STRICT REQUIREMENTS:',
    '',
    'Generate ONE manga page.',
    '',
    `Must contain EXACTLY ${panels.length} comic panels.`,
    '',
    'Panels must be visually separated.',
    '',
    'Each panel must follow the YAML story progression.',
    '',
    'Do NOT create a character poster.',
    'Do NOT create a character sheet.',
    'Do NOT create a reference sheet.',
    'Do NOT create a single illustration.',
    '',
    'Style:',
    'Japanese manga page',
    'comic storytelling',
    'clear panel layout',
    dialogueLines.length > 0
      ? `MANDATORY SPEECH BUBBLES: Every dialogue line must appear in a readable manga speech bubble using the exact text. Do not omit any speech bubble. Dialogue: ${dialogueLines.join(' | ')}`
      : 'No dialogue is present; do not add empty speech bubbles.',
    '',
    document.storySummary ? `Overall story: ${document.storySummary}` : '',
    document.pagePrompt ? `Page direction: ${document.pagePrompt}` : '',
    '',
    panelStoryText,
  ].filter((line, index, lines) => line !== '' || (index > 0 && lines[index - 1] !== '')).join('\n');
}
