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
          line?: unknown;
          dialogue?: unknown;
        };
        return [{
          name: String(record.name ?? record.id ?? record.character ?? ''),
          pose: typeof record.pose === 'string' ? record.pose : fallbackPose,
          line: typeof record.line === 'string' ? record.line : lineFromDialogue(record.dialogue) || fallbackLine,
        }];
      }
      return [];
    }));
  }
  return splitNames(value).map((name) => ({ name, pose: fallbackPose, line: fallbackLine }));
}

function panelFromObject(raw: Record<string, unknown>, index: number): YamlScenePanel {
  const fallbackPose = typeof raw.pose === 'string' ? raw.pose : '';
  const fallbackLine = typeof raw.line === 'string' ? raw.line : lineFromDialogue(raw.dialogue);
  const chars = uniqueCharacters([
    ...charactersFromUnknown(raw.chars, fallbackPose, fallbackLine),
    ...charactersFromUnknown(raw.character, fallbackPose, fallbackLine),
    ...charactersFromUnknown(raw.characters, fallbackPose, fallbackLine),
  ]);

  return {
    panel: Number(raw.panel) || index + 1,
    scene: typeof raw.scene === 'string' ? raw.scene : '',
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
      pages?: Array<{ prompt?: string; story_summary?: string; panels?: Array<Record<string, unknown>> }>;
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

export function parseYamlSceneDocument(source: string): YamlSceneDocument {
  const yaml = stripCodeFence(source);
  const jsonDoc = parseJsonDocument(yaml);
  if (jsonDoc) return jsonDoc;

  const document: YamlSceneDocument = {
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
    if (!trimmed || trimmed.startsWith('#') || trimmed === 'pages:') continue;
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
      if (key === 'prompt') document.pagePrompt = parseScalar(value);
      else if (key === 'story_summary') document.storySummary = parseScalar(value);
      else if (key === 'character') pushDocumentChars(value);
      continue;
    }

    if (inPanels && trimmed.startsWith('- ') && ['panel', 'scene', 'chars', 'character', 'characters', 'pose', 'line', 'prompt'].includes(key)) {
      if (inPanelChars && (key === 'name' || key === 'character')) {
        flushCharacter();
      } else {
        flushPanel();
      }
      const panel = ensurePanel(key === 'panel' ? Number(parseScalar(value)) || undefined : undefined);
      if (key === 'scene') panel.scene = parseScalar(value);
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
      }
      inDialogue = false;
      continue;
    }

    const panel = inPanels ? ensurePanel() : currentPanel;
    if (!panel) continue;

    if (key === 'panel') panel.panel = Number(parseScalar(value)) || panel.panel;
    else if (key === 'scene') panel.scene = parseScalar(value);
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
    } else if (inPanelChars && key === 'line') {
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
  return [
    'full panel illustration',
    document.storySummary ? `story summary: ${document.storySummary}` : '',
    document.pagePrompt ? `page direction: ${document.pagePrompt}` : '',
    panel.scene ? `scene: ${panel.scene}` : '',
    chars.length > 0 ? `characters: ${chars.map(characterPrompt).join(' | ')}` : '',
    panel.prompt ? `visual prompt: ${panel.prompt}` : '',
    'anime style, clean lineart, highly detailed, consistent character design, cinematic composition',
    panel.negativePrompt ? `avoid: ${panel.negativePrompt}` : '',
  ].filter(Boolean).join(', ');
}
