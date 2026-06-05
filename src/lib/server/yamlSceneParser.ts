export type YamlScenePanel = {
  panel: number;
  scene: string;
  chars: string[];
  pose: string;
  line: string;
  prompt: string;
  negativePrompt?: string;
  model?: string;
};

export type YamlSceneDocument = {
  pagePrompt: string;
  storySummary: string;
  chars: string[];
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
    // Keep the plain scalar fallback below.
  }
  return trimmed.replace(/^["']|["']$/g, '');
}

function unique(values: Array<string | undefined>): string[] {
  return Array.from(new Set(values.map((value) => (value ?? '').trim()).filter(Boolean)));
}

function stringArray(value: unknown): string[] {
  if (Array.isArray(value)) return value.map((item) => String(item));
  if (typeof value === 'string') return value.split(/[,/]/).map((item) => item.trim());
  return [];
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

function panelFromObject(raw: Record<string, unknown>, index: number): YamlScenePanel {
  const line = typeof raw.line === 'string' ? raw.line : lineFromDialogue(raw.dialogue);
  return {
    panel: Number(raw.panel) || index + 1,
    scene: typeof raw.scene === 'string' ? raw.scene : '',
    chars: unique([
      ...stringArray(raw.chars),
      ...stringArray(raw.character),
      ...stringArray(raw.characters),
    ]),
    pose: typeof raw.pose === 'string' ? raw.pose : '',
    line,
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
      chars: unique([...refs, ...stringArray(parsed.chars), ...stringArray(parsed.characters)]),
      panels: panels.map(panelFromObject),
    };
  } catch {
    return null;
  }
}

function emptyPanel(panel = 1): YamlScenePanel {
  return { panel, scene: '', chars: [], pose: '', line: '', prompt: '' };
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
  let inPanels = false;
  let inRefs = false;
  let inChars = false;
  let inDialogue = false;
  let dialogueSpeaker = '';

  const pushChars = (value: string) => {
    document.chars = unique([...document.chars, ...stringArray(parseScalar(value))]);
  };
  const flushPanel = () => {
    if (!currentPanel) return;
    if (currentPanel.scene || currentPanel.chars.length > 0 || currentPanel.pose || currentPanel.line || currentPanel.prompt) {
      currentPanel.chars = unique(currentPanel.chars);
      document.panels.push(currentPanel);
    }
    currentPanel = null;
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

    const panelHeader = trimmed.match(/^(?:-\s*)?panel_?([0-9]+):\s*$/i);
    if (panelHeader) {
      flushPanel();
      currentPanel = emptyPanel(Number(panelHeader[1]) || document.panels.length + 1);
      inPanels = true;
      inRefs = false;
      inChars = false;
      continue;
    }

    const kv = keyVal(line);
    if (!kv) continue;
    const key = kv[1].toLowerCase();
    const value = kv[2] ?? '';

    if (key === 'refs') {
      inRefs = true;
      inChars = false;
      inPanels = false;
      continue;
    }
    if (key === 'chars' || key === 'characters') {
      inChars = true;
      inRefs = false;
      if (value) pushChars(value);
      continue;
    }
    if (key === 'panels') {
      inPanels = true;
      inRefs = false;
      inChars = false;
      continue;
    }

    if (inRefs && indent <= 4 && ['a', 'b', 'c', 'd', 'ref', 'character'].includes(key)) {
      pushChars(value);
      continue;
    }
    if (inChars && trimmed.startsWith('- ')) {
      pushChars(value || trimmed.replace(/^-\s*/, ''));
      continue;
    }

    if (!inPanels && indent <= 4) {
      if (key === 'prompt') document.pagePrompt = parseScalar(value);
      else if (key === 'story_summary') document.storySummary = parseScalar(value);
      else if (key === 'chars' || key === 'character' || key === 'characters') pushChars(value);
      continue;
    }

    if (inPanels && trimmed.startsWith('- ') && ['panel', 'scene', 'chars', 'character', 'characters', 'pose', 'line', 'prompt'].includes(key)) {
      flushPanel();
      const panel = ensurePanel(key === 'panel' ? Number(parseScalar(value)) || undefined : undefined);
      if (key === 'scene') panel.scene = parseScalar(value);
      else if (key === 'pose') panel.pose = parseScalar(value);
      else if (key === 'line') panel.line = parseScalar(value);
      else if (key === 'prompt') panel.prompt = parseScalar(value);
      else if (key === 'chars' || key === 'character' || key === 'characters') panel.chars = unique([...panel.chars, ...stringArray(parseScalar(value))]);
      inDialogue = false;
      continue;
    }

    const panel = inPanels ? ensurePanel() : currentPanel;
    if (!panel) continue;

    if (key === 'panel') panel.panel = Number(parseScalar(value)) || panel.panel;
    else if (key === 'scene') panel.scene = parseScalar(value);
    else if (key === 'pose') panel.pose = parseScalar(value);
    else if (key === 'line') panel.line = parseScalar(value);
    else if (key === 'prompt') panel.prompt = parseScalar(value);
    else if (key === 'negative_prompt') panel.negativePrompt = parseScalar(value);
    else if (key === 'model') panel.model = parseScalar(value);
    else if (key === 'chars' || key === 'character' || key === 'characters') {
      panel.chars = unique([...panel.chars, ...stringArray(parseScalar(value))]);
    } else if (key === 'dialogue') {
      panel.line = parseScalar(value);
      try {
        panel.line = lineFromDialogue(JSON.parse(panel.line.replace(/\\"/g, '"'))) || panel.line;
      } catch {
        // Plain scalar dialogue.
      }
      inDialogue = true;
      dialogueSpeaker = '';
    } else if (inDialogue && trimmed.startsWith('- ') && key === 'speaker') {
      dialogueSpeaker = parseScalar(value);
    } else if (inDialogue && key === 'text') {
      const lineText = [dialogueSpeaker, parseScalar(value)].filter(Boolean).join(': ');
      panel.line = [panel.line, lineText].filter(Boolean).join('\n');
    }
  }

  flushPanel();

  const speakers = document.panels.flatMap((panel) =>
    panel.line.split('\n')
      .map((line) => line.match(/^([^:：]{1,40})[:：]/)?.[1])
      .filter((value): value is string => Boolean(value)),
  );
  document.chars = unique([
    ...document.chars,
    ...document.panels.flatMap((panel) => panel.chars),
    ...speakers,
  ]);

  return document;
}

export function getYamlScenePanel(document: YamlSceneDocument): YamlScenePanel | null {
  return document.panels[0] ?? null;
}

export function buildImagePromptFromYamlPanel(document: YamlSceneDocument, panel: YamlScenePanel): string {
  const chars = unique([...document.chars, ...panel.chars]);
  return [
    'single finished illustration based on the latest YAML scene',
    document.storySummary ? `story summary: ${document.storySummary}` : '',
    document.pagePrompt ? `page direction: ${document.pagePrompt}` : '',
    panel.scene ? `scene: ${panel.scene}` : '',
    chars.length > 0 ? `chars: ${chars.join(' / ')}` : '',
    panel.pose ? `pose: ${panel.pose}` : '',
    panel.line ? `line: ${panel.line}` : '',
    panel.prompt ? `visual prompt: ${panel.prompt}` : '',
    'anime style, clean lineart, highly detailed, consistent character design, cinematic composition',
    panel.negativePrompt ? `avoid: ${panel.negativePrompt}` : '',
  ].filter(Boolean).join(', ');
}
