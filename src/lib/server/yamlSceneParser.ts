export type YamlScenePanel = {
  panel: number;
  size?: string;
  scene: string;
  dialogue: string;
  prompt: string;
  negativePrompt?: string;
  model?: string;
  characters: string[];
};

export type YamlSceneDocument = {
  pagePrompt: string;
  storySummary: string;
  characters: string[];
  panels: YamlScenePanel[];
};

type MutablePanel = YamlScenePanel;

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
    // Fall through to plain scalar handling.
  }
  return trimmed.replace(/^["']|["']$/g, '');
}

function dialogueToText(value: unknown): string {
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

function normalizeCharacters(values: Array<string | undefined>): string[] {
  return Array.from(new Set(values
    .map((value) => (value ?? '').trim())
    .filter(Boolean)));
}

function panelFromJson(raw: Record<string, unknown>, index: number): YamlScenePanel {
  const characterValue = raw.character ?? raw.characters;
  const characters = Array.isArray(characterValue)
    ? characterValue.map((item) => String(item))
    : [typeof characterValue === 'string' ? characterValue : ''];

  return {
    panel: Number(raw.panel) || index + 1,
    size: typeof raw.size === 'string' ? raw.size : undefined,
    scene: typeof raw.scene === 'string' ? raw.scene : '',
    dialogue: dialogueToText(raw.dialogue),
    prompt: typeof raw.prompt === 'string' ? raw.prompt : '',
    negativePrompt: typeof raw.negative_prompt === 'string' ? raw.negative_prompt : undefined,
    model: typeof raw.model === 'string' ? raw.model : undefined,
    characters: normalizeCharacters(characters),
  };
}

function parseJsonDocument(text: string): YamlSceneDocument | null {
  try {
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    const parsed = JSON.parse(jsonMatch?.[0] ?? text) as {
      pages?: Array<{ prompt?: string; story_summary?: string; panels?: Array<Record<string, unknown>> }>;
      refs?: Record<string, unknown>;
      characters?: unknown;
    };
    const pages = Array.isArray(parsed.pages) ? parsed.pages : [];
    const panels = pages.flatMap((page) => Array.isArray(page.panels) ? page.panels : []);
    if (panels.length === 0) return null;

    const refs = parsed.refs && typeof parsed.refs === 'object'
      ? Object.values(parsed.refs).map((value) => typeof value === 'string' ? value : '')
      : [];
    const characters = Array.isArray(parsed.characters)
      ? parsed.characters.map((item) => String(item))
      : [];

    return {
      pagePrompt: pages.map((page) => page.prompt).filter(Boolean).join('\n'),
      storySummary: pages.map((page) => page.story_summary).filter(Boolean).join('\n'),
      characters: normalizeCharacters([...refs, ...characters]),
      panels: panels.map(panelFromJson),
    };
  } catch {
    return null;
  }
}

export function parseYamlSceneDocument(source: string): YamlSceneDocument {
  const yaml = stripCodeFence(source);
  const jsonDoc = parseJsonDocument(yaml);
  if (jsonDoc) return jsonDoc;

  const document: YamlSceneDocument = {
    pagePrompt: '',
    storySummary: '',
    characters: [],
    panels: [],
  };

  const keyVal = (line: string) => line.match(/^\s*(?:-\s*)?([A-Za-z0-9_]+):\s*(.*)$/);
  const pushCharacter = (value: string) => {
    const parsed = parseScalar(value);
    if (parsed) document.characters = normalizeCharacters([...document.characters, parsed]);
  };
  const flushPanel = () => {
    if (!currentPanel) return;
    if (currentPanel.prompt.trim() || currentPanel.scene.trim() || currentPanel.dialogue.trim()) {
      currentPanel.characters = normalizeCharacters(currentPanel.characters);
      document.panels.push(currentPanel);
    }
    currentPanel = null;
    dialogueEntry = null;
  };
  const ensurePanel = (panelNumber?: number): MutablePanel => {
    if (!currentPanel) {
      currentPanel = {
        panel: panelNumber ?? document.panels.length + 1,
        scene: '',
        dialogue: '',
        prompt: '',
        characters: [],
      };
    }
    return currentPanel;
  };

  let currentPanel: MutablePanel | null = null;
  let inPanels = false;
  let inRefs = false;
  let inCharacters = false;
  let inDialogue = false;
  let dialogueEntry: { speaker?: string; text?: string } | null = null;

  for (const rawLine of yaml.split('\n')) {
    const line = rawLine.replace(/\t/g, '  ');
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#') || trimmed === 'pages:') continue;
    const indent = line.match(/^\s*/)?.[0].length ?? 0;

    const panelHeader = trimmed.match(/^(?:-\s*)?panel_?([0-9]+):\s*$/i);
    if (panelHeader) {
      flushPanel();
      inPanels = true;
      inRefs = false;
      inCharacters = false;
      currentPanel = {
        panel: Number(panelHeader[1]) || document.panels.length + 1,
        scene: '',
        dialogue: '',
        prompt: '',
        characters: [],
      };
      continue;
    }

    const kv = keyVal(line);
    if (!kv) continue;
    const key = kv[1].toLowerCase();
    const value = kv[2] ?? '';

    if (key === 'refs') {
      inRefs = true;
      inCharacters = false;
      inPanels = false;
      continue;
    }
    if (key === 'characters') {
      inCharacters = true;
      inRefs = false;
      if (value) pushCharacter(value);
      continue;
    }
    if (key === 'panels') {
      inPanels = true;
      inRefs = false;
      inCharacters = false;
      continue;
    }

    if (inRefs && indent <= 4 && ['a', 'b', 'c', 'd', 'ref', 'character'].includes(key)) {
      pushCharacter(value);
      continue;
    }
    if (inCharacters && trimmed.startsWith('- ')) {
      pushCharacter(value || trimmed.replace(/^-\s*/, ''));
      continue;
    }

    if (!inPanels && indent <= 4) {
      if (key === 'prompt') document.pagePrompt = parseScalar(value);
      else if (key === 'story_summary') document.storySummary = parseScalar(value);
      else if (key === 'character') pushCharacter(value);
      continue;
    }

    if (inPanels && trimmed.startsWith('- ') && ['panel', 'scene', 'prompt', 'size', 'character'].includes(key)) {
      flushPanel();
      const panel = ensurePanel(key === 'panel' ? Number(parseScalar(value)) || undefined : undefined);
      if (key === 'scene') panel.scene = parseScalar(value);
      if (key === 'prompt') panel.prompt = parseScalar(value);
      if (key === 'size') panel.size = parseScalar(value);
      if (key === 'character') panel.characters = normalizeCharacters([...panel.characters, parseScalar(value)]);
      inDialogue = false;
      continue;
    }

    const panel = inPanels ? ensurePanel() : currentPanel;
    if (!panel) continue;

    if (key === 'panel') panel.panel = Number(parseScalar(value)) || panel.panel;
    else if (key === 'size') panel.size = parseScalar(value);
    else if (key === 'scene') panel.scene = parseScalar(value);
    else if (key === 'prompt') panel.prompt = parseScalar(value);
    else if (key === 'negative_prompt') panel.negativePrompt = parseScalar(value);
    else if (key === 'model') panel.model = parseScalar(value);
    else if (key === 'character' || key === 'characters') {
      panel.characters = normalizeCharacters([...panel.characters, parseScalar(value)]);
    } else if (key === 'dialogue') {
      panel.dialogue = parseScalar(value);
      try {
        panel.dialogue = dialogueToText(JSON.parse(panel.dialogue.replace(/\\"/g, '"'))) || panel.dialogue;
      } catch {
        // Plain dialogue scalar.
      }
      inDialogue = true;
      dialogueEntry = null;
    } else if (inDialogue && trimmed.startsWith('- ') && key === 'speaker') {
      dialogueEntry = { speaker: parseScalar(value), text: '' };
    } else if (inDialogue && key === 'text') {
      if (!dialogueEntry) dialogueEntry = {};
      dialogueEntry.text = parseScalar(value);
      const lineText = [dialogueEntry.speaker, dialogueEntry.text].filter(Boolean).join(': ');
      panel.dialogue = [panel.dialogue, lineText].filter(Boolean).join('\n');
    }
  }

  flushPanel();

  document.characters = normalizeCharacters([
    ...document.characters,
    ...document.panels.flatMap((panel) => panel.characters),
    ...document.panels.flatMap((panel) =>
      panel.dialogue.split('\n')
        .map((line) => line.match(/^([^:：]{1,40})[:：]/)?.[1])
        .filter((value): value is string => Boolean(value)),
    ),
  ]);

  return document;
}

export function getYamlScenePanel(document: YamlSceneDocument, panelNumber = 1): YamlScenePanel | null {
  return document.panels.find((panel) => panel.panel === panelNumber) ?? document.panels[panelNumber - 1] ?? null;
}

export function buildImagePromptFromYamlPanel(document: YamlSceneDocument, panel: YamlScenePanel): string {
  const characters = normalizeCharacters([
    ...document.characters,
    ...panel.characters,
  ]);

  return [
    'single manga panel illustration',
    document.storySummary ? `story summary: ${document.storySummary}` : '',
    document.pagePrompt ? `page direction: ${document.pagePrompt}` : '',
    panel.scene ? `scene: ${panel.scene}` : '',
    characters.length > 0 ? `characters: ${characters.join(' / ')}` : '',
    panel.dialogue ? `dialogue or acting cue: ${panel.dialogue}` : '',
    panel.prompt ? `visual prompt: ${panel.prompt}` : '',
    'anime style, clean lineart, highly detailed, consistent character design, cinematic composition',
    panel.negativePrompt ? `avoid: ${panel.negativePrompt}` : '',
  ].filter(Boolean).join(', ');
}
