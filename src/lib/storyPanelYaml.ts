import type { StoryYamlPanel } from '$lib/storyYaml';

export type StoryPanelPatch = Pick<StoryYamlPanel, 'scene' | 'dialogue' | 'prompt'>;

function yamlQuote(value: string): string {
  return `"${value
    .replace(/\r?\n/g, ' ')
    .replace(/\\/g, '\\\\')
    .replace(/"/g, '\\"')
    .trim()}"`;
}

function leadingSpaces(line: string): number {
  return line.match(/^\s*/)?.[0].length ?? 0;
}

export function updateStoryPanelYaml(
  rawYaml: string,
  pageIndex: number,
  panelIndex: number,
  patch: StoryPanelPatch,
): string {
  const lines = rawYaml.split(/\r?\n/);
  const pagesStart = lines.findIndex((line) => /^pages:\s*$/.test(line));
  if (pagesStart < 0) return rawYaml;

  const pageStarts: number[] = [];
  for (let index = pagesStart + 1; index < lines.length; index++) {
    if (/^[A-Za-z_][\w-]*:\s*/.test(lines[index])) break;
    if (/^\s*-\s+page:\s*/.test(lines[index])) pageStarts.push(index);
  }
  const pageStart = pageStarts[pageIndex];
  if (pageStart === undefined) return rawYaml;
  const pageIndent = leadingSpaces(lines[pageStart]);
  const pageEnd = pageStarts[pageIndex + 1] ?? lines.findIndex(
    (line, index) => index > pageStart && leadingSpaces(line) === 0 && /^[A-Za-z_][\w-]*:\s*/.test(line),
  );
  const effectivePageEnd = pageEnd < 0 ? lines.length : pageEnd;

  const panelStarts: number[] = [];
  for (let index = pageStart + 1; index < effectivePageEnd; index++) {
    if (
      leadingSpaces(lines[index]) > pageIndent
      && /^\s*-\s+panel:\s*/.test(lines[index])
    ) {
      panelStarts.push(index);
    }
  }
  const panelStart = panelStarts[panelIndex];
  if (panelStart === undefined) return rawYaml;
  const panelEnd = panelStarts[panelIndex + 1] ?? effectivePageEnd;
  const panelIndent = leadingSpaces(lines[panelStart]);
  const fieldIndent = ' '.repeat(panelIndent + 2);
  const itemIndent = ' '.repeat(panelIndent + 4);

  const preserved: string[] = [];
  for (let index = panelStart + 1; index < panelEnd; index++) {
    const line = lines[index];
    if (new RegExp(`^\\s{${panelIndent + 2}}(?:scene|prompt):\\s*`).test(line)) continue;
    if (new RegExp(`^\\s{${panelIndent + 2}}dialogue:\\s*`).test(line)) {
      index++;
      while (index < panelEnd && leadingSpaces(lines[index]) > panelIndent + 2) index++;
      index--;
      continue;
    }
    preserved.push(line);
  }

  const replacement = [
    lines[panelStart],
    `${fieldIndent}scene: ${yamlQuote(patch.scene)}`,
    ...(patch.dialogue.length > 0
      ? [
          `${fieldIndent}dialogue:`,
          ...patch.dialogue.map((line) => `${itemIndent}- ${yamlQuote(line)}`),
        ]
      : [`${fieldIndent}dialogue: []`]),
    `${fieldIndent}prompt: ${yamlQuote(patch.prompt)}`,
    ...preserved,
  ];

  return [...lines.slice(0, panelStart), ...replacement, ...lines.slice(panelEnd)].join('\n');
}
