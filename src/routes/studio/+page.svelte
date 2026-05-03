<script lang="ts">
  // ============================================================
  // State
  // ============================================================
  type ImageSize = '1024x1024' | '1792x1024' | '1024x1792';

  let size          = $state<ImageSize>('1024x1024');
  let generating    = $state(false);
  let previewUrl    = $state<string | null>(null);
  let revisedPrompt = $state<string | null>(null);
  let errorMsg      = $state('');
  let characterLock = true;
  let generatedPanels: string[] = [];

  type RefImage = {
    thumb: string;   // compressed base64 thumbnail for display
    label: string;   // user-editable text injected into prompt
    name:  string;   // original filename
  };

  type LayoutId = 'single' | '2panel' | '4panel' | '3vertical' | 'free';

  const LAYOUTS: { id: LayoutId; label: string; count: number | null }[] = [
    { id: 'single',    label: '1枚絵',   count: 1    },
    { id: '2panel',    label: '2コマ',   count: 2    },
    { id: '4panel',    label: '4コマ',   count: 4    },
    { id: '3vertical', label: '縦3コマ', count: 3    },
    { id: 'free',      label: 'Free',    count: null },
  ];

  type PanelSlot = { prompt: string; imageUrl: string | null; generating: boolean };
  const emptySlot = (): PanelSlot => ({ prompt: '', imageUrl: null, generating: false });

  type Page = { id: string; prompt: string; layout: LayoutId; panels: PanelSlot[] };
  const createPage = (): Page => ({
    id: Date.now().toString() + Math.random().toString(36).slice(2, 6),
    prompt: '',
    layout: '4panel',
    panels: [emptySlot(), emptySlot(), emptySlot(), emptySlot()],
  });

  let pages       = $state<Page[]>([createPage()]);
  let activePage  = $state(0);
  let activePanel = $state<number | null>(null);

  let refA         = $state<RefImage | null>(null);
  let refB         = $state<RefImage | null>(null);
  let refPanelOpen = $state(true);

  // ── Model toggle ─────────────────────────────────────────
  let studioModel = $state<'gpt-image-2' | 'fal-fast' | 'fal-pro'>('gpt-image-2');

  // ── One Panel Pro Mode ────────────────────────────────────
  let proModeOpen   = $state(false);
  let proExpression = $state('');
  let proCamera     = $state('');
  let proPose       = $state('');
  let proStyle      = $state('');
  let proLighting   = $state('');

  // ── ミュリィ キャラクター辞書（常時付与）────────────────────
  const MURYI_CHAR_DICT =
    'short silver bob hair, glowing cyan eyes, white cyberpunk uniform, ' +
    'android circuit markings on forearms, thigh-high boots, 1girl';

  const PRO_EXPRESSIONS = [
    { id: 'neutral',     label: 'Neutral',     prompt: 'neutral composed expression, steady calm gaze, relaxed closed lips, collected posture' },
    { id: 'smile',       label: 'Smile',       prompt: 'suppressed smile, slight blush, trying not to look too pleased, faint upward lip curve, soft warm eyes' },
    { id: 'happy',       label: 'Happy',       prompt: 'bright blush across cheeks, tsundere look-away smile, glowing brighter cyan eyes, barely contained happiness, sparkling gaze' },
    { id: 'sad',         label: 'Sad',         prompt: 'low battery sad mode, dim eye glow, head slightly down, subdued circuit markings, quiet sorrow, downcast gaze' },
    { id: 'angry',       label: 'Angry',       prompt: 'error-state glare, sparking overloaded circuit markings, clenched fist, intense cyan stare, sharp indignant expression, furrowed brow' },
    { id: 'surprised',   label: 'Surprised',   prompt: 'wide-eyed surprise, eyebrows raised high, mouth slightly parted, startled caught-off-guard expression, pupils dilated' },
    { id: 'embarrassed', label: 'Embarrassed', prompt: 'deeply flustered bright blush, flushed silver-haired cheeks, averted glowing eyes, unable to hide feelings, fidgeting hands' },
    { id: 'sleepy',      label: 'Sleepy',      prompt: 'power-saving mode half-closed cyan eyes, slow heavy blinking, minimal circuit activity, drowsy sluggish expression, soft drooping eyelids' },
    { id: 'determined',  label: 'Determined',  prompt: 'fierce determined stare, intensified glowing cyan eyes, set jaw, circuit markings pulsing bright, strong-willed focused gaze' },
    { id: 'smug',        label: 'Smug',        prompt: 'knowing smug expression, confident side-glance, self-satisfied smirk, one eyebrow slightly raised, amused superior look' },
    { id: 'shy',         label: 'Shy',         prompt: 'shy averted downward gaze, barely visible blush, fingers fidgeting, circuit patterns dimming softly, timid withdrawn posture' },
    { id: 'pout',        label: 'Pout',        prompt: 'tsundere pout, puffed cheeks, poorly hidden sulkiness, flushed face, refusing to look directly, crossed arms' },
  ] as const;

  const PRO_CAMERAS = [
    { id: 'closeup',    label: 'Close-up',    prompt: 'extreme close-up portrait, face filling frame, intimate tight framing, shallow depth of field, detailed facial features' },
    { id: 'bust',       label: 'Bust',        prompt: 'bust shot, upper body portrait, collar to crown, three-quarter angle, flattering crop, balanced composition' },
    { id: 'medium',     label: 'Medium',      prompt: 'medium shot, waist-up framing, natural standing distance, balanced negative space, clean background separation' },
    { id: 'full_body',  label: 'Full Body',   prompt: 'full body shot, head to toe, complete figure visible, grounded stance, full character design showcase' },
    { id: 'from_above', label: 'High Angle',  prompt: 'bird\'s eye high angle shot, looking down at subject, foreshortening effect, top-down perspective, vulnerability implied' },
    { id: 'from_below', label: 'Low Angle',   prompt: 'low angle shot from below, looking upward at subject, heroic imposing perspective, worm\'s eye view, dramatic scale' },
    { id: 'side',       label: 'Side View',   prompt: 'clean side profile view, pure 90-degree lateral angle, elegant silhouette, hair and outfit shape highlighted' },
    { id: 'dutch',      label: 'Dutch Angle', prompt: 'dutch angle tilted camera, diagonal tension in frame, dynamic off-kilter composition, cinematic unease' },
  ] as const;

  const PRO_POSES = [
    { id: 'standing',     label: 'Standing',     prompt: 'confident upright standing pose, natural weight distribution, balanced grounded posture' },
    { id: 'sitting',      label: 'Sitting',       prompt: 'relaxed seated pose, legs slightly angled, casual comfortable position, hands resting naturally' },
    { id: 'leaning',      label: 'Leaning',       prompt: 'casually leaning against surface, one shoulder resting on wall, arms loose at sides, cool relaxed attitude' },
    { id: 'arms_crossed', label: 'Arms Crossed',  prompt: 'arms folded across chest, guarded defensive stance, chin slightly raised, assertive closed body language' },
    { id: 'hand_hip',     label: 'Hand on Hip',   prompt: 'one hand on hip, slight side turn, look-away stance, weight shifted to one leg, confident assertive attitude' },
    { id: 'looking_back', label: 'Looking Back',  prompt: 'glancing back over shoulder, head turned, body facing away, hair catching light, caught elegantly mid-turn' },
    { id: 'action',       label: 'Action',        prompt: 'dynamic action pose, mid-motion kinetic energy, clothes and hair flowing in movement, energetic explosive stance' },
    { id: 'reaching',     label: 'Reaching',      prompt: 'arm extended toward viewer, fingers reaching out, leaning slightly forward, direct intimate visual engagement' },
  ] as const;

  const PRO_STYLES = [
    { id: '',           label: 'Default',    prompt: '' },
    { id: 'anime',      label: 'Anime',      prompt: 'high-quality anime illustration, vibrant cel shading, clean precise linework, professional character art quality' },
    { id: 'realistic',  label: 'Realistic',  prompt: 'photorealistic rendering, cinematic photography quality, ultra-detailed skin and fabric textures, 8k resolution, subsurface scattering' },
    { id: 'watercolor', label: 'Watercolor', prompt: 'delicate watercolor illustration, flowing pigment bleeds, soft translucent color layers, loose artistic brushwork' },
    { id: 'cyberpunk',  label: 'Cyberpunk',  prompt: 'cyberpunk neon aesthetic, dark atmospheric background, vivid cyan and magenta accents, synthwave color palette, rain-slicked streets' },
    { id: 'sketch',     label: 'Sketch',     prompt: 'detailed pencil sketch illustration, expressive confident linework, subtle cross-hatching shading, clean hand-drawn quality' },
    { id: 'oil',        label: 'Oil Paint',  prompt: 'rich oil painting technique, thick impasto brushwork, deep saturated jewel-toned colors, painterly canvas texture' },
  ] as const;

  const PRO_LIGHTING = [
    { id: '',         label: 'Default',     prompt: '' },
    { id: 'soft',     label: 'Soft',        prompt: 'soft diffused natural lighting, gentle fill light, even flattering exposure, minimal harsh shadows' },
    { id: 'dramatic', label: 'Dramatic',    prompt: 'high-contrast dramatic lighting, deep noir shadows, powerful single-source rim light, chiaroscuro effect' },
    { id: 'golden',   label: 'Golden Hour', prompt: 'warm golden hour sunlight, long amber-orange shadows, glowing skin tones, romantic atmospheric haze' },
    { id: 'neon',     label: 'Neon',        prompt: 'vibrant neon sign illumination, colorful mixed light sources, electric cyan and magenta glow, reflective wet surfaces' },
    { id: 'studio',   label: 'Studio',      prompt: 'professional studio lighting setup, soft box fill light, subtle edge rim light, clean neutral separation from background' },
    { id: 'backlit',  label: 'Backlit',     prompt: 'strong rim backlight, glowing silhouette edges, hair lit brilliantly from behind, subtle lens flare, contre-jour atmosphere' },
  ] as const;

  // ── Pro Mode Presets ──────────────────────────────────────
  type ProPreset = {
    id:         string;
    name:       string;
    expression: string;
    camera:     string;
    pose:       string;
    style:      string;
    lighting:   string;
    isDefault?: true;
  };

  const PRO_PRESET_KEY = 'studio-pro-presets';

  const DEFAULT_PRO_PRESETS: ProPreset[] = [
    { id: 'dp_portrait',  name: 'Portrait',  expression: 'smile',      camera: 'bust',       pose: 'standing',     style: 'anime',      lighting: 'soft',     isDefault: true },
    { id: 'dp_dramatic',  name: 'Dramatic',  expression: 'determined', camera: 'closeup',    pose: 'hand_hip',     style: 'realistic',  lighting: 'dramatic', isDefault: true },
    { id: 'dp_action',    name: 'Action',    expression: 'determined', camera: 'from_below', pose: 'action',       style: 'anime',      lighting: 'neon',     isDefault: true },
    { id: 'dp_emotional', name: 'Emotional', expression: 'sad',        camera: 'medium',     pose: 'leaning',      style: 'watercolor', lighting: 'golden',   isDefault: true },
    { id: 'dp_cyberpunk', name: 'Cyberpunk', expression: 'smug',       camera: 'dutch',      pose: 'arms_crossed', style: 'cyberpunk',  lighting: 'neon',     isDefault: true },
  ];

  let proPresets    = $state<ProPreset[]>([...DEFAULT_PRO_PRESETS]);
  let proPresetName = $state('');

  let layout    = $derived(pages[activePage].layout);
  let panels    = $derived(pages[activePage].panels);
  // free レイアウト時はコマ数の平方根で列数を自動決定（4→2列, 6→3列, 9→3列）
  let gridCols  = $derived(
    layout === 'single' || layout === '3vertical' ? 1 :
    layout === 'free' ? Math.ceil(Math.sqrt(panels.length)) :
    2
  );
  let gridRows  = $derived(Math.ceil(panels.length / gridCols));
  let gridStyle = $derived(
    layout === 'free'
      ? `grid-template-columns: repeat(${gridCols}, 1fr);`
      : `grid-template-columns: repeat(${gridCols}, 1fr); grid-template-rows: repeat(${gridRows}, 1fr);`
  );

async function buildPrompt(basePrompt: string, refDescription: string) {
  const res = await fetch('/api/prompt', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' }, // ← 追加
  body: JSON.stringify({ basePrompt, refDescription })
});

  const data = await res.json();
  return data.prompt;
}


  // ============================================================
  // Actions
  // ============================================================
  async function callGenerate(p: string, s: ImageSize): Promise<string> {
    // Claudeでプロンプト強化
const enhanced = await buildPrompt(
  injectRefs(p),
  `
use the exact same character as the reference image

same face, same hair, same outfit, same proportions

do not redesign the character

anime girl, long twin tails with rainbow gradient hair, blue eyes, idol outfit
`
);

// 生成
const res = await fetch('/api/studio/generate', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    prompt: enhanced,
    size: s,
    model: studioModel,
    refImage: refA?.thumb ?? undefined
  })
});
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      throw new Error(data.message ?? `HTTP ${res.status}`);
    }
    const data = await res.json();
    if (!data.url) throw new Error('No image data returned.');
    return data.url as string;
  }

  async function generate() {
    const p = pages[activePage].prompt.trim();
    if (!p || generating) return;
    errorMsg      = '';
    revisedPrompt = null;
    generating    = true;
    previewUrl    = null;
    try {
      const res = await fetch('/api/studio/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ prompt: injectRefs(p), size, model: studioModel, refImage: refA?.thumb ?? undefined }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.message ?? `HTTP ${res.status}`);
      }
      const data = await res.json();
      if (!data.url) throw new Error('No image data returned.');
      previewUrl    = data.url;
      revisedPrompt = data.revisedPrompt ?? null;
      await addToHistory(data.url, p, size);
      if (diaryNote) {
        const thumb   = await createThumbnail(data.url);
        const entryId = activeDiaryId ?? genId();
        const entry: DiaryEntry = {
          id: entryId, date: diaryNote.date, diaryText: diaryNote.diaryText,
          prompt: p, mood: currentDiaryMood, thumb, createdAt: new Date().toISOString(),
        };
        const idx = diaryHistory.findIndex(e => e.id === entryId);
        if (idx >= 0) diaryHistory[idx] = entry;
        else diaryHistory = [entry, ...diaryHistory].slice(0, MAX_DIARY_ENTRIES);
        activeDiaryId = entryId;
        saveDiaryHistory();
      }
    } catch (e) {
      errorMsg = e instanceof Error ? e.message : 'Generation failed.';
    } finally {
      generating = false;
    }
  }

  async function generatePanel(i: number) {
    const p = panels[i];
    if (!p.prompt.trim() || p.generating) return;
    panels[i] = { ...p, generating: true, imageUrl: null };
    try {
      const url = await callGenerate(p.prompt.trim(), size);
      panels[i] = { ...panels[i], generating: false, imageUrl: url };
    } catch {
      panels[i] = { ...panels[i], generating: false };
    }
  }

  function sendToPanel(i: number) {
    console.log('[sendToPanel] previewUrl:', previewUrl?.slice(0, 60) ?? 'null');
    if (!previewUrl) return;
    // $derived の panels[i] ではなく $state の元データに直接代入する
    pages[activePage].panels[i] = { ...panels[i], prompt: pages[activePage].prompt, imageUrl: previewUrl };
    console.log('[sendToPanel] panel', i, 'imageUrl set:', pages[activePage].panels[i].imageUrl?.slice(0, 40));
  }

  function copyPrompt() {
    const p = pages[activePage].prompt.trim();
    if (p) navigator.clipboard.writeText(p);
  }

  function clearAll() {
    previewUrl    = null;
    revisedPrompt = null;
    errorMsg      = '';
    pages[activePage].panels = panels.map(() => emptySlot());
  }

  function setLayout(id: LayoutId): void {
    const def = LAYOUTS.find(l => l.id === id)!;
    pages[activePage].layout = id;
    if (def.count !== null) {
      const next: PanelSlot[] = [];
      for (let i = 0; i < def.count; i++) next.push(panels[i] ?? emptySlot());
      pages[activePage].panels = next;
      if (activePanel !== null && activePanel >= def.count) activePanel = null;
    }
  }

  function addPanel(): void {
    if (panels.length >= 8) return;
    pages[activePage].panels = [...panels, emptySlot()];
  }

  function removePanel(i: number): void {
    if (panels.length <= 1) return;
    pages[activePage].panels = panels.filter((_, idx) => idx !== i);
    if (activePanel === i) activePanel = null;
    else if (activePanel !== null && activePanel > i) activePanel--;
  }

  function addPage(): void {
    if (pages.length >= 8) return;
    pages = [...pages, createPage()];
    activePage  = pages.length - 1;
    activePanel = null;
  }

  function removePage(i: number): void {
    if (pages.length <= 1) return;
    pages      = pages.filter((_, idx) => idx !== i);
    activePage  = Math.min(activePage, pages.length - 1);
    activePanel = null;
  }

  function switchPage(i: number): void {
    activePage  = i;
    activePanel = null;
  }

  // ============================================================
  // History
  // ============================================================
  const HISTORY_KEY = 'studio-history';
  const MAX_HISTORY = 20;
  const THUMB_PX    = 160;

  type HistoryEntry = {
    id:        string;
    prompt:    string;
    size:      ImageSize;
    url:       string;   // full base64 in-memory; thumbnail when restored from localStorage
    thumb:     string;   // always compressed thumbnail
    createdAt: string;
  };

  let history     = $state<HistoryEntry[]>([]);
  let historyOpen = $state(true);

  function loadHistory(): void {
    if (typeof localStorage === 'undefined') return;
    try {
      const raw = localStorage.getItem(HISTORY_KEY);
      if (!raw) return;
      const entries = JSON.parse(raw) as HistoryEntry[];
      history = entries;
    } catch { /* ignore */ }
  }

  function saveHistory(entries: HistoryEntry[]): void {
    if (typeof localStorage === 'undefined') return;
    const toSave = entries.map(e => ({ ...e, url: e.thumb }));
    try {
      localStorage.setItem(HISTORY_KEY, JSON.stringify(toSave));
    } catch {
      try {
        localStorage.setItem(HISTORY_KEY, JSON.stringify(toSave.slice(-8)));
      } catch { /* fail silently */ }
    }
  }

  async function createThumbnail(dataUrl: string): Promise<string> {
    return new Promise(resolve => {
      const img = new Image();
      img.onload = () => {
        const canvas = document.createElement('canvas');
        const r = Math.min(THUMB_PX / img.width, THUMB_PX / img.height);
        canvas.width  = Math.round(img.width  * r);
        canvas.height = Math.round(img.height * r);
        canvas.getContext('2d')!.drawImage(img, 0, 0, canvas.width, canvas.height);
        resolve(canvas.toDataURL('image/jpeg', 0.75));
      };
      img.onerror = () => resolve(dataUrl);
      img.src = dataUrl;
    });
  }

  async function addToHistory(url: string, p: string, s: ImageSize): Promise<void> {
    const thumb = await createThumbnail(url);
    const entry: HistoryEntry = {
      id: Date.now().toString(), prompt: p, size: s, url, thumb,
      createdAt: new Date().toISOString(),
    };
    history = [entry, ...history].slice(0, MAX_HISTORY);
    saveHistory(history);
  }

  function restoreFromHistory(entry: HistoryEntry): void {
    previewUrl                  = entry.url;
    pages[activePage].prompt    = entry.prompt;
    size                        = entry.size;
    revisedPrompt               = null;
    errorMsg                    = '';
  }

  async function regenerateFromHistory(entry: HistoryEntry, e: MouseEvent): Promise<void> {
    e.stopPropagation();
    pages[activePage].prompt = entry.prompt;
    size                     = entry.size;
    await generate();
  }

  function sendHistoryToPanel(entry: HistoryEntry, i: number, e: MouseEvent): void {
    e.stopPropagation();
    panels[i] = { ...panels[i], imageUrl: entry.url, prompt: entry.prompt };
  }

  function removeHistory(id: string, e: MouseEvent): void {
    e.stopPropagation();
    history = history.filter(h => h.id !== id);
    saveHistory(history);
  }

  function formatTime(iso: string): string {
    const d = new Date(iso);
    return `${d.getHours().toString().padStart(2, '0')}:${d.getMinutes().toString().padStart(2, '0')}`;
  }

  // ============================================================
  // Project Save / Load
  // ============================================================
  const PROJECT_VERSION  = 1 as const;
  const PROJECT_KEY      = 'studio-project';
  const MANGA_IMPORT_KEY = 'studio-manga-import';
  const DIARY_IMPORT_KEY = 'studio-diary-import';
  const YAML_IMPORT_KEY  = 'studio-yaml-import';
  const REF_KEY          = 'studio-ref-images';

  type MangaImportData = {
    panels:     Array<{ prompt: string; scene: string }>;
    sourceText: string;
  };

  type DiaryImportData = {
    prompt:    string;
    diaryText: string;
    date:      string;
  };

  type YamlImportData = {
    pages: Array<{
      layout:  string;
      prompt:  string;
      panels:  Array<{ prompt: string }>;
    }>;
    refs?: { a?: string; b?: string };
    referenceImages?: Array<{ name: string; dataUrl: string; note: string }>;
    sourceText?: string;
  };

  // ── Diary History System ──────────────────────────────────
  type DiaryMood = 'happy' | 'excited' | 'calm' | 'sad' | 'tense' | 'tired';

  const MOOD_OPTIONS: { id: DiaryMood; icon: string; label: string; color: string }[] = [
    { id: 'happy',   icon: '✦', label: '楽しい',   color: '#00e5ff' },
    { id: 'excited', icon: '⚡', label: 'わくわく',  color: '#fbbf24' },
    { id: 'calm',    icon: '◈', label: 'のんびり',  color: '#34d399' },
    { id: 'sad',     icon: '▼', label: 'しんみり',  color: '#60a5fa' },
    { id: 'tense',   icon: '◼', label: 'もやもや',  color: '#f87171' },
    { id: 'tired',   icon: '◉', label: 'つかれた',  color: '#a78bfa' },
  ];

  type DiaryEntry = {
    id:        string;
    date:      string;
    diaryText: string;
    prompt:    string;
    mood:      DiaryMood;
    thumb?:    string;
    createdAt: string;
  };

  const DIARY_HISTORY_KEY = 'studio-diary-history';
  const MAX_DIARY_ENTRIES = 30;

  let diaryHistory      = $state<DiaryEntry[]>([]);
  let currentDiaryMood  = $state<DiaryMood>('calm');
  let activeDiaryId     = $state<string | null>(null);

  type SavedPanel  = { prompt: string };
  type SavedPage   = { id: string; prompt: string; layout: LayoutId; panels: SavedPanel[] };
  type ProjectData = {
    version:    typeof PROJECT_VERSION;
    savedAt:    string;
    activePage: number;
    size:       ImageSize;
    pages:      SavedPage[];
    history?:   HistoryEntry[];
    refs?:      { a: RefImage | null; b: RefImage | null };
  };

  let saveFlash          = $state(false);
  let mangaImportBanner  = $state(false);
  let diaryImportBanner  = $state(false);
  let yamlImportBanner   = $state(false);
  let diaryNote          = $state<DiaryImportData | null>(null);

  // ── Browser ──────────────────────────────────────────────
  const INDEX_KEY = 'studio-index';
  const PROJ_PFX  = 'studio-proj-';

  type ProjectMeta = { id: string; name: string; savedAt: string; pageCount: number };

  let currentProjectId   = $state<string | null>(null);
  let currentProjectName = $state('Untitled');
  let browserOpen        = $state(false);
  let projectIndex       = $state<ProjectMeta[]>([]);
  let renamingId         = $state<string | null>(null);
  let renameValue        = $state('');

  function buildProjectData(includeHistory: boolean): ProjectData {
    return {
      version:    PROJECT_VERSION,
      savedAt:    new Date().toISOString(),
      activePage,
      size,
      pages: pages.map(pg => ({
        id:     pg.id,
        prompt: pg.prompt,
        layout: pg.layout,
        panels: pg.panels.map(p => ({ prompt: p.prompt })),
      })),
      refs: { a: refA, b: refB },
      ...(includeHistory ? { history: history.map(e => ({ ...e, url: e.thumb })) } : {}),
    };
  }

  function applyProjectData(data: ProjectData): void {
    if (!Array.isArray(data.pages) || data.pages.length === 0) return;
    pages = data.pages.map(pg => ({
      id:     pg.id ?? (Date.now().toString() + Math.random().toString(36).slice(2, 6)),
      prompt: pg.prompt ?? '',
      layout: (pg.layout ?? '4panel') as LayoutId,
      panels: (pg.panels ?? []).map(p => ({
        prompt: p.prompt ?? '', imageUrl: null, generating: false,
      })),
    }));
    activePage    = Math.min(data.activePage ?? 0, pages.length - 1);
    size          = (data.size ?? '1024x1024') as ImageSize;
    previewUrl    = null;
    revisedPrompt = null;
    errorMsg      = '';
    activePanel   = null;
    if (data.refs) {
      refA = data.refs.a ?? null;
      refB = data.refs.b ?? null;
      saveRefImages();
    }
  }

  function genId(): string {
    return Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
  }

  function persistToIndex(id: string, name: string, data: ProjectData): void {
    const meta: ProjectMeta = { id, name, savedAt: data.savedAt, pageCount: data.pages.length };
    const idx = projectIndex.findIndex(m => m.id === id);
    if (idx >= 0) projectIndex[idx] = meta;
    else           projectIndex = [meta, ...projectIndex];
    if (typeof localStorage === 'undefined') return;
    try { localStorage.setItem(INDEX_KEY, JSON.stringify(projectIndex)); } catch { /* quota */ }
    try { localStorage.setItem(PROJ_PFX + id, JSON.stringify(data)); }
    catch {
      try { localStorage.setItem(PROJ_PFX + id, JSON.stringify({ ...data, history: undefined })); }
      catch { /* fail */ }
    }
  }

  function saveProject(): void {
    if (!currentProjectId) currentProjectId = genId();
    const data = buildProjectData(true);
    persistToIndex(currentProjectId, currentProjectName, data);
    if (typeof localStorage !== 'undefined') {
      try { localStorage.setItem(PROJECT_KEY, JSON.stringify(buildProjectData(false))); }
      catch { /* quota */ }
    }
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const url  = URL.createObjectURL(blob);
    const a    = document.createElement('a');
    a.href     = url;
    a.download = `studio-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(url);
    saveFlash = true;
    setTimeout(() => { saveFlash = false; }, 1800);
  }

  async function loadProjectFile(e: Event): Promise<void> {
    const input = e.currentTarget as HTMLInputElement;
    const file  = input.files?.[0];
    input.value = '';
    if (!file) return;
    try {
      const data = JSON.parse(await file.text()) as ProjectData;
      if (data.version !== PROJECT_VERSION) {
        errorMsg = 'バージョン不一致のプロジェクトファイルです。';
        return;
      }
      applyProjectData(data);
      if (Array.isArray(data.history)) { history = data.history; saveHistory(history); }
      const importId   = genId();
      const importName = file.name.replace(/\.json$/i, '');
      persistToIndex(importId, importName, data);
      currentProjectId   = importId;
      currentProjectName = importName;
      if (typeof localStorage !== 'undefined') {
        try { localStorage.setItem(PROJECT_KEY, JSON.stringify(buildProjectData(false))); }
        catch { /* quota */ }
      }
    } catch {
      errorMsg = 'プロジェクトファイルの読み込みに失敗しました。';
    }
  }

  function loadProjectFromStorage(): void {
    if (typeof localStorage === 'undefined') return;

    // One-shot: YAML import from Lab
    try {
      const yamlRaw = localStorage.getItem(YAML_IMPORT_KEY);
      if (yamlRaw) {
        localStorage.removeItem(YAML_IMPORT_KEY);
        const imp = JSON.parse(yamlRaw) as YamlImportData;
        if (Array.isArray(imp.pages) && imp.pages.length > 0) {
          applyProjectData({
            version:    PROJECT_VERSION,
            savedAt:    new Date().toISOString(),
            activePage: 0,
            size:       '1024x1024',
            pages: imp.pages.map(pg => ({
              id:     genId(),
              prompt: pg.prompt ?? '',
              layout: (['single','2panel','4panel','3vertical','free'].includes(pg.layout) ? pg.layout : '4panel') as LayoutId,
              panels: (pg.panels ?? []).map(p => ({ prompt: p.prompt ?? '' })),
            })),
          });
          // Import reference images into refA/refB
          if (Array.isArray(imp.referenceImages) && imp.referenceImages.length > 0) {
            const rA = imp.referenceImages[0];
            const rB = imp.referenceImages[1];
            if (rA) refA = { thumb: rA.dataUrl, label: rA.note || rA.name, name: rA.name };
            if (rB) refB = { thumb: rB.dataUrl, label: rB.note || rB.name, name: rB.name };
            saveRefImages();
          } else if (imp.refs) {
            if (imp.refs.a) refA = { thumb: '', label: imp.refs.a, name: 'yaml-ref-a' };
            if (imp.refs.b) refB = { thumb: '', label: imp.refs.b, name: 'yaml-ref-b' };
            saveRefImages();
          }
          yamlImportBanner = true;
          setTimeout(() => { yamlImportBanner = false; }, 4000);
          return;
        }
      }
    } catch { /* ignore */ }

    // One-shot: manga import from Lab
    try {
      const mangaRaw = localStorage.getItem(MANGA_IMPORT_KEY);
      if (mangaRaw) {
        localStorage.removeItem(MANGA_IMPORT_KEY);
        const imp = JSON.parse(mangaRaw) as MangaImportData;
        if (Array.isArray(imp.panels) && imp.panels.length > 0) {
          const n = imp.panels.length;
          const layout: LayoutId = n <= 1 ? 'single' : n === 2 ? '2panel' : n === 3 ? '3vertical' : '4panel';
          applyProjectData({
            version:    PROJECT_VERSION,
            savedAt:    new Date().toISOString(),
            activePage: 0,
            size:       '1024x1024',
            pages: [{
              id:     genId(),
              prompt: imp.sourceText ? `MANGA: ${imp.sourceText}` : '',
              layout,
              panels: imp.panels.map(p => ({ prompt: p.prompt })),
            }],
          });
          mangaImportBanner = true;
          setTimeout(() => { mangaImportBanner = false; }, 4000);
          return;
        }
      }
    } catch { /* ignore */ }

    // One-shot: diary import from Lab
    try {
      const diaryRaw = localStorage.getItem(DIARY_IMPORT_KEY);
      if (diaryRaw) {
        localStorage.removeItem(DIARY_IMPORT_KEY);
        const imp = JSON.parse(diaryRaw) as DiaryImportData;
        if (imp.prompt) {
          applyProjectData({
            version:    PROJECT_VERSION,
            savedAt:    new Date().toISOString(),
            activePage: 0,
            size:       '1024x1024',
            pages: [{
              id:     genId(),
              prompt: imp.prompt,
              layout: 'single',
              panels: [{ prompt: imp.prompt }],
            }],
          });
          diaryNote         = imp;
          diaryImportBanner = true;
          setTimeout(() => { diaryImportBanner = false; }, 4000);
          return;
        }
      }
    } catch { /* ignore */ }

    // Normal project load
    try {
      const raw = localStorage.getItem(PROJECT_KEY);
      if (!raw) return;
      const data = JSON.parse(raw) as ProjectData;
      if (data.version !== PROJECT_VERSION) return;
      applyProjectData(data);
    } catch { /* ignore */ }
  }

  // ── Diary History functions ──────────────────────────────
  function loadDiaryHistory(): void {
    if (typeof localStorage === 'undefined') return;
    try {
      const raw = localStorage.getItem(DIARY_HISTORY_KEY);
      diaryHistory = raw ? (JSON.parse(raw) as DiaryEntry[]) : [];
    } catch { diaryHistory = []; }
  }

  function saveDiaryHistory(): void {
    if (typeof localStorage === 'undefined') return;
    try {
      localStorage.setItem(DIARY_HISTORY_KEY, JSON.stringify(diaryHistory));
    } catch {
      try { localStorage.setItem(DIARY_HISTORY_KEY, JSON.stringify(diaryHistory.slice(0, 15))); }
      catch { /* quota */ }
    }
  }

  async function generateDiaryImage(): Promise<void> {
    if (!diaryNote) return;
    if (layout !== 'single') setLayout('single');
    await generate();
  }

  function loadDiaryEntryForView(entry: DiaryEntry): void {
    diaryNote        = { prompt: entry.prompt, diaryText: entry.diaryText, date: entry.date };
    currentDiaryMood = entry.mood;
    activeDiaryId    = entry.id;
    pages[activePage].prompt = entry.prompt;
    if (layout !== 'single') setLayout('single');
  }

  function removeDiaryEntry(id: string): void {
    diaryHistory = diaryHistory.filter(e => e.id !== id);
    saveDiaryHistory();
    if (activeDiaryId === id) { activeDiaryId = null; diaryNote = null; }
  }

  function clearDiaryHistory(): void {
    diaryHistory  = [];
    activeDiaryId = null;
    diaryNote     = null;
    if (typeof localStorage !== 'undefined') localStorage.removeItem(DIARY_HISTORY_KEY);
  }

  // ============================================================
  // Reference Image System
  // ============================================================
  function loadRefImages(): void {
    if (typeof localStorage === 'undefined') return;
    try {
      const raw = localStorage.getItem(REF_KEY);
      if (!raw) return;
      const data = JSON.parse(raw) as { a: RefImage | null; b: RefImage | null };
      refA = data.a ?? null;
      refB = data.b ?? null;
    } catch { /* ignore */ }
  }

  function saveRefImages(): void {
    if (typeof localStorage === 'undefined') return;
    try {
      localStorage.setItem(REF_KEY, JSON.stringify({ a: refA, b: refB }));
    } catch {
      // Quota exceeded: strip thumbnails and retry
      try {
        localStorage.setItem(REF_KEY, JSON.stringify({
          a: refA ? { ...refA, thumb: '' } : null,
          b: refB ? { ...refB, thumb: '' } : null,
        }));
      } catch { /* fail silently */ }
    }
  }

  async function uploadRef(slot: 'A' | 'B', e: Event): Promise<void> {
    const input = e.currentTarget as HTMLInputElement;
    const file  = input.files?.[0];
    input.value = '';
    if (!file) return;
    const objectUrl = URL.createObjectURL(file);
    const thumb     = await createThumbnail(objectUrl);
    URL.revokeObjectURL(objectUrl);
    const label = file.name.replace(/\.[^/.]+$/, '').replace(/[-_]/g, ' ');
    const ref: RefImage = { thumb, label, name: file.name };
    if (slot === 'A') refA = ref;
    else              refB = ref;
    saveRefImages();
  }

  function clearRef(slot: 'A' | 'B'): void {
    if (slot === 'A') refA = null;
    else              refB = null;
    saveRefImages();
  }

  function buildRefContext(): string {
    const parts: string[] = [];
    if (refA?.label.trim()) parts.push(`character_A: ${refA.label.trim()}`);
    if (refB?.label.trim()) parts.push(`character_B: ${refB.label.trim()}`);
    return parts.join(', ');
  }

  function injectRefs(prompt: string): string {
    const ctx = buildRefContext();
    return ctx ? `${ctx}, ${prompt}` : prompt;
  }

  // ── One Panel Pro Mode functions ─────────────────────────
  function buildEnhancedPrompt(): string {
    const base = pages[activePage].prompt.trim();
    const parts: string[] = [];
    parts.push('masterpiece, best quality, highly detailed, ultra-high resolution');
    // ① character dict: selected character takes priority, fall back to ミュリィ hardcoded
    parts.push(selectedChar?.prompt ?? MURYI_CHAR_DICT);
    if (base) parts.push(base);
    // ② expression: character-specific prompt first, generic fallback
    const charExpr = proExpression
      ? selectedChar?.expressions.find(e => e.id === proExpression)
      : undefined;
    const expr  = charExpr ?? PRO_EXPRESSIONS.find(e => e.id === proExpression);
    const cam   = PRO_CAMERAS.find(c => c.id === proCamera);
    const pose  = PRO_POSES.find(p => p.id === proPose);
    const style = PRO_STYLES.find(s => s.id === proStyle);
    const light = PRO_LIGHTING.find(l => l.id === proLighting);
    if (expr?.prompt)  parts.push(expr.prompt);
    if (cam?.prompt)   parts.push(cam.prompt);
    if (pose?.prompt)  parts.push(pose.prompt);
    if (style?.prompt) parts.push(style.prompt);
    if (light?.prompt) parts.push(light.prompt);
    return parts.filter(Boolean).join(', ');
  }

  function buildNegativeHint(): string {
    const neg = [
      'bad anatomy', 'extra fingers', 'fused fingers', 'missing limbs',
      'deformed hands', 'malformed body', 'blurry', 'low quality',
      'jpeg artifacts', 'watermark', 'signature', 'text overlay',
      'duplicate', 'out of frame',
    ];
    if (proStyle === 'anime')      neg.push('photorealistic', '3d render', 'cgi');
    if (proStyle === 'realistic')  neg.push('cartoon', 'anime flat shading');
    if (proStyle === 'watercolor') neg.push('sharp hard lines', 'digital photograph');
    if (proStyle === 'sketch')     neg.push('color fill', 'photorealistic render');
    if (proStyle === 'cyberpunk')  neg.push('bright daylight', 'pastoral nature');
    if (proStyle === 'oil')        neg.push('photograph', 'digital art');
    return `Avoid: ${neg.join(', ')}`;
  }

  async function generatePro(): Promise<void> {
    const p = buildEnhancedPrompt();
    if (!p.trim() || generating) return;
    errorMsg      = '';
    revisedPrompt = null;
    generating    = true;
    previewUrl    = null;
    try {
      const res = await fetch('/api/studio/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ prompt: injectRefs(`${p}, ${buildNegativeHint()}`), size, model: studioModel, refImage: refA?.thumb ?? undefined }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.message ?? `HTTP ${res.status}`);
      }
      const data = await res.json();
      if (!data.url) throw new Error('No image data returned.');
      previewUrl    = data.url;
      revisedPrompt = data.revisedPrompt ?? null;
      await addToHistory(data.url, p, size);
      if (diaryNote) {
        const thumb   = await createThumbnail(data.url);
        const entryId = activeDiaryId ?? genId();
        const entry: DiaryEntry = {
          id: entryId, date: diaryNote.date, diaryText: diaryNote.diaryText,
          prompt: p, mood: currentDiaryMood, thumb, createdAt: new Date().toISOString(),
        };
        const idx = diaryHistory.findIndex(e => e.id === entryId);
        if (idx >= 0) diaryHistory[idx] = entry;
        else diaryHistory = [entry, ...diaryHistory].slice(0, MAX_DIARY_ENTRIES);
        activeDiaryId = entryId;
        saveDiaryHistory();
      }
    } catch (e) {
      errorMsg = e instanceof Error ? e.message : 'Generation failed.';
    } finally {
      generating = false;
    }
  }

  function loadProPresets(): void {
    if (typeof localStorage === 'undefined') return;
    try {
      const raw = localStorage.getItem(PRO_PRESET_KEY);
      const custom: ProPreset[] = raw ? (JSON.parse(raw) as ProPreset[]) : [];
      proPresets = [...DEFAULT_PRO_PRESETS, ...custom];
    } catch {
      proPresets = [...DEFAULT_PRO_PRESETS];
    }
  }

  function saveProPresets(): void {
    if (typeof localStorage === 'undefined') return;
    try {
      const custom = proPresets.filter(p => !p.isDefault);
      localStorage.setItem(PRO_PRESET_KEY, JSON.stringify(custom));
    } catch { /* quota */ }
  }

  function applyProPreset(preset: ProPreset): void {
    proExpression = preset.expression;
    proCamera     = preset.camera;
    proPose       = preset.pose;
    proStyle      = preset.style;
    proLighting   = preset.lighting;
    proPresetName = preset.name;
  }

  function saveCurrentAsPreset(): void {
    const name = proPresetName.trim();
    if (!name) return;
    const id = `custom_${Date.now()}`;
    proPresets = [...proPresets, { id, name, expression: proExpression, camera: proCamera, pose: proPose, style: proStyle, lighting: proLighting }];
    saveProPresets();
  }

  function deleteProPreset(id: string): void {
    proPresets = proPresets.filter(p => p.id !== id);
    saveProPresets();
  }

  function proPresetTitle(preset: ProPreset): string {
    return [
      preset.expression ? `Expr: ${preset.expression}` : '',
      preset.camera     ? `Cam: ${preset.camera}`       : '',
      preset.style      ? `Style: ${preset.style}`      : '',
    ].filter(Boolean).join(' · ');
  }

  // ── Browser functions ────────────────────────────────────
  function loadIndex(): ProjectMeta[] {
    if (typeof localStorage === 'undefined') return [];
    try {
      const raw = localStorage.getItem(INDEX_KEY);
      return raw ? (JSON.parse(raw) as ProjectMeta[]) : [];
    } catch { return []; }
  }

  function loadProjectById(id: string): void {
    if (typeof localStorage === 'undefined') return;
    try {
      const raw = localStorage.getItem(PROJ_PFX + id);
      if (!raw) return;
      const data = JSON.parse(raw) as ProjectData;
      applyProjectData(data);
      if (Array.isArray(data.history)) { history = data.history; saveHistory(history); }
      currentProjectId   = id;
      currentProjectName = projectIndex.find(m => m.id === id)?.name ?? 'Untitled';
      browserOpen        = false;
    } catch { /* ignore */ }
  }

  function duplicateProject(id: string): void {
    if (typeof localStorage === 'undefined') return;
    try {
      const raw = localStorage.getItem(PROJ_PFX + id);
      if (!raw) return;
      const data    = JSON.parse(raw) as ProjectData;
      const newId   = genId();
      const srcName = projectIndex.find(m => m.id === id)?.name ?? 'Untitled';
      persistToIndex(newId, `${srcName} (copy)`, { ...data, savedAt: new Date().toISOString() });
    } catch { /* ignore */ }
  }

  function deleteProject(id: string): void {
    projectIndex = projectIndex.filter(m => m.id !== id);
    if (typeof localStorage !== 'undefined') {
      try { localStorage.setItem(INDEX_KEY, JSON.stringify(projectIndex)); } catch { /* quota */ }
      localStorage.removeItem(PROJ_PFX + id);
    }
    if (currentProjectId === id) currentProjectId = null;
  }

  function startRename(id: string, name: string, e: MouseEvent): void {
    e.stopPropagation();
    renamingId  = id;
    renameValue = name;
  }

  function commitRename(e?: KeyboardEvent | FocusEvent): void {
    if (e instanceof KeyboardEvent && e.key !== 'Enter' && e.key !== 'Escape') return;
    if (e instanceof KeyboardEvent && e.key === 'Escape') { renamingId = null; return; }
    if (!renamingId) return;
    const name = renameValue.trim();
    if (!name) { renamingId = null; return; }
    const idx = projectIndex.findIndex(m => m.id === renamingId);
    if (idx >= 0) {
      projectIndex[idx] = { ...projectIndex[idx], name };
      if (typeof localStorage !== 'undefined') {
        try { localStorage.setItem(INDEX_KEY, JSON.stringify(projectIndex)); } catch { /* quota */ }
      }
    }
    if (currentProjectId === renamingId) currentProjectName = name;
    renamingId = null;
  }

  function formatDate(iso: string): string {
    const d = new Date(iso);
    return (
      `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')} ` +
      `${String(d.getHours()).padStart(2,'0')}:${String(d.getMinutes()).padStart(2,'0')}`
    );
  }

  // ============================================================
  // Character Asset System
  // ============================================================
  type AssetItem = { id: string; label: string; prompt: string };
  type CharAsset = AssetItem & {
    expressions: AssetItem[];
    costumes:    AssetItem[];
  };
  type AssetDB = {
    version:     number;
    characters:  CharAsset[];
    backgrounds: AssetItem[];
    poses:       AssetItem[];
  };

  type AssetTab = 'char' | 'expr' | 'costume' | 'pose' | 'bg';
  const ASSET_TABS: { id: AssetTab; label: string }[] = [
    { id: 'char',    label: 'CHAR'    },
    { id: 'expr',    label: 'EXPR'    },
    { id: 'costume', label: 'COSTUME' },
    { id: 'pose',    label: 'POSE'    },
    { id: 'bg',      label: 'BG'      },
  ];

  let assetDB        = $state<AssetDB | null>(null);
  let assetTab       = $state<AssetTab>('char');
  let selectedChar   = $state<CharAsset | null>(null);
  let assetPanelOpen = $state(true);

  async function loadAssets(): Promise<void> {
    try {
      const res = await fetch('/studio/characters.json');
      if (!res.ok) return;
      assetDB = await res.json() as AssetDB;
      if (assetDB.characters.length > 0) selectedChar = assetDB.characters[0];
    } catch { /* ignore */ }
  }

  function insertAsset(prompt: string): void {
    const cur = pages[activePage].prompt.trim();
    pages[activePage].prompt = cur ? `${cur}, ${prompt}` : prompt;
  }

  function selectChar(char: CharAsset): void {
    selectedChar = char;
    insertAsset(char.prompt);
    assetTab = 'expr';
  }

  // ============================================================
  // Export Suite
  // ============================================================
  let exportMenuOpen = $state(false);
  let exporting      = $state(false);

  // ── Byte utilities ───────────────────────────────────────
  function u16le(n: number): Uint8Array {
    return new Uint8Array([n & 0xFF, (n >> 8) & 0xFF]);
  }
  function u32le(n: number): Uint8Array {
    const b = new Uint8Array(4);
    new DataView(b.buffer).setUint32(0, n >>> 0, true);
    return b;
  }
  function concatBytes(...parts: (Uint8Array | number[])[]): Uint8Array {
    const total = parts.reduce((s, p) => s + p.length, 0);
    const out   = new Uint8Array(total);
    let off = 0;
    for (const p of parts) { out.set(p instanceof Uint8Array ? p : new Uint8Array(p), off); off += p.length; }
    return out;
  }
  const CRC32_TABLE = (() => {
    const t = new Uint32Array(256);
    for (let i = 0; i < 256; i++) {
      let c = i;
      for (let j = 0; j < 8; j++) c = (c & 1) ? (0xEDB88320 ^ (c >>> 1)) : (c >>> 1);
      t[i] = c;
    }
    return t;
  })();
  function crc32b(data: Uint8Array): number {
    let crc = 0xFFFFFFFF;
    for (let i = 0; i < data.length; i++) crc = CRC32_TABLE[(crc ^ data[i]) & 0xFF] ^ (crc >>> 8);
    return (crc ^ 0xFFFFFFFF) >>> 0;
  }

  // ── ZIP (STORE, no compression) ──────────────────────────
  function buildZip(files: { name: string; data: Uint8Array }[]): Uint8Array {
    const enc = new TextEncoder();
    const locals: Uint8Array[]  = [];
    const centrals: Uint8Array[] = [];
    const offsets: number[]     = [];
    let localBytes = 0;
    const now = new Date();
    const dt  = ((now.getFullYear() - 1980) << 9) | ((now.getMonth() + 1) << 5) | now.getDate();
    const tm  = (now.getHours() << 11) | (now.getMinutes() << 5) | (now.getSeconds() >> 1);

    for (const { name, data } of files) {
      const fn  = enc.encode(name);
      const crc = crc32b(data);
      const sz  = data.length;
      offsets.push(localBytes);

      const lh = concatBytes(
        [0x50,0x4B,0x03,0x04],
        u16le(20), u16le(0), u16le(0),
        u16le(tm),  u16le(dt),
        u32le(crc), u32le(sz), u32le(sz),
        u16le(fn.length), u16le(0),
        fn, data,
      );
      locals.push(lh);
      localBytes += lh.length;

      centrals.push(concatBytes(
        [0x50,0x4B,0x01,0x02],
        u16le(20), u16le(20),
        u16le(0), u16le(0),
        u16le(tm), u16le(dt),
        u32le(crc), u32le(sz), u32le(sz),
        u16le(fn.length), u16le(0), u16le(0),
        u16le(0), u16le(0), u32le(0),
        u32le(offsets[offsets.length - 1]),
        fn,
      ));
    }

    const cdSize = centrals.reduce((s, p) => s + p.length, 0);
    return concatBytes(
      ...locals, ...centrals,
      [0x50,0x4B,0x05,0x06],
      u16le(0), u16le(0),
      u16le(files.length), u16le(files.length),
      u32le(cdSize), u32le(localBytes), u16le(0),
    );
  }

  // ── PDF (JPEG pages via DCTDecode) ───────────────────────
  function buildPdf(pages_: { bytes: Uint8Array; w: number; h: number }[]): Uint8Array {
    const enc      = new TextEncoder();
    const parts: Uint8Array[] = [];
    const xref: number[]      = [];
    let pos = 0;

    const push = (s: string | Uint8Array) => {
      const b = typeof s === 'string' ? enc.encode(s) : s;
      parts.push(b); pos += b.length;
    };
    const startObj = (n: number) => { xref[n] = pos; };
    const N     = pages_.length;
    const pNum  = (i: number) => 3 + i * 3;
    const cNum  = (i: number) => 4 + i * 3;
    const iNum  = (i: number) => 5 + i * 3;
    const total = 2 + N * 3;

    push('%PDF-1.4\n');

    startObj(1);
    push(`1 0 obj\n<< /Type /Catalog /Pages 2 0 R >>\nendobj\n`);

    startObj(2);
    push(`2 0 obj\n<< /Type /Pages /Kids [${Array.from({length:N},(_,i)=>`${pNum(i)} 0 R`).join(' ')}] /Count ${N} >>\nendobj\n`);

    for (let i = 0; i < N; i++) {
      const { bytes, w, h } = pages_[i];

      startObj(pNum(i));
      push(`${pNum(i)} 0 obj\n<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${w} ${h}]\n`);
      push(`   /Contents ${cNum(i)} 0 R /Resources << /XObject << /Im0 ${iNum(i)} 0 R >> >> >>\nendobj\n`);

      const cs = enc.encode(`q ${w} 0 0 ${-h} 0 ${h} cm /Im0 Do Q\n`);
      startObj(cNum(i));
      push(`${cNum(i)} 0 obj\n<< /Length ${cs.length} >>\nstream\n`);
      push(cs);
      push(`\nendstream\nendobj\n`);

      startObj(iNum(i));
      push(`${iNum(i)} 0 obj\n`);
      push(`<< /Type /XObject /Subtype /Image /Width ${w} /Height ${h}\n`);
      push(`   /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length ${bytes.length} >>\n`);
      push(`stream\n`); push(bytes); push(`\nendstream\nendobj\n`);
    }

    const xrefOff = pos;
    push(`xref\n0 ${total + 1}\n0000000000 65535 f \n`);
    for (let n = 1; n <= total; n++) push(`${String(xref[n]).padStart(10,'0')} 00000 n \n`);
    push(`trailer\n<< /Size ${total + 1} /Root 1 0 R >>\nstartxref\n${xrefOff}\n%%EOF\n`);

    const out = new Uint8Array(pos);
    let off = 0;
    for (const p of parts) { out.set(p, off); off += p.length; }
    return out;
  }

  // ── Canvas renderer ──────────────────────────────────────
  async function renderPageToCanvas(pg: Page): Promise<HTMLCanvasElement> {
    const CELL = 600;
    const GAP  = 8;
    const cols = pg.layout === 'single' || pg.layout === '3vertical' ? 1 : 2;
    const rows = Math.ceil(pg.panels.length / cols);
    const W    = cols * CELL + (cols - 1) * GAP;
    const H    = rows * CELL + (rows - 1) * GAP;

    const canvas  = document.createElement('canvas');
    canvas.width  = W;
    canvas.height = H;
    const ctx = canvas.getContext('2d')!;
    ctx.fillStyle = '#020912';
    ctx.fillRect(0, 0, W, H);

    for (let i = 0; i < pg.panels.length; i++) {
      const col = i % cols;
      const row = Math.floor(i / cols);
      const x   = col * (CELL + GAP);
      const y   = row * (CELL + GAP);
      const pnl = pg.panels[i];

      if (pnl.imageUrl) {
        await new Promise<void>(res => {
          const img = new Image();
          img.onload  = () => { ctx.drawImage(img, x, y, CELL, CELL); res(); };
          img.onerror = () => res();
          img.src     = pnl.imageUrl!;
        });
      } else {
        ctx.fillStyle   = '#040d1a';
        ctx.fillRect(x, y, CELL, CELL);
        ctx.strokeStyle = 'rgba(0,229,255,0.18)';
        ctx.lineWidth   = 1;
        ctx.strokeRect(x + 0.5, y + 0.5, CELL - 1, CELL - 1);
      }
      ctx.font      = 'bold 26px monospace';
      ctx.fillStyle = 'rgba(0,229,255,0.32)';
      ctx.fillText(String(i + 1), x + 13, y + 35);
    }
    return canvas;
  }

  function triggerDownload(blob: Blob, filename: string): void {
    const url = URL.createObjectURL(blob);
    const a   = document.createElement('a');
    a.href = url; a.download = filename; a.click();
    URL.revokeObjectURL(url);
  }

  function slugName(): string {
    return currentProjectName.replace(/\s+/g, '-').replace(/[^\w-]/g, '') || 'studio';
  }

  async function exportCurrentPng(): Promise<void> {
    exporting = true; exportMenuOpen = false;
    try {
      const canvas = await renderPageToCanvas(pages[activePage]);
      const blob   = await new Promise<Blob>(res => canvas.toBlob(b => res(b!), 'image/png'));
      triggerDownload(blob, `${slugName()}-page${activePage + 1}.png`);
    } finally { exporting = false; }
  }

  async function exportAllZip(): Promise<void> {
    exporting = true; exportMenuOpen = false;
    try {
      const files: { name: string; data: Uint8Array }[] = [];
      for (let i = 0; i < pages.length; i++) {
        const canvas = await renderPageToCanvas(pages[i]);
        const blob   = await new Promise<Blob>(res => canvas.toBlob(b => res(b!), 'image/png'));
        files.push({ name: `page-${i + 1}.png`, data: new Uint8Array(await blob.arrayBuffer()) });
      }
      triggerDownload(new Blob([buildZip(files).buffer as ArrayBuffer], { type: 'application/zip' }),
        `${slugName()}-export.zip`);
    } finally { exporting = false; }
  }

  async function exportPdf(): Promise<void> {
    exporting = true; exportMenuOpen = false;
    try {
      const pdfPages: { bytes: Uint8Array; w: number; h: number }[] = [];
      for (const pg of pages) {
        const canvas = await renderPageToCanvas(pg);
        const blob   = await new Promise<Blob>(res => canvas.toBlob(b => res(b!), 'image/jpeg', 0.92));
        pdfPages.push({ bytes: new Uint8Array(await blob.arrayBuffer()), w: canvas.width, h: canvas.height });
      }
      triggerDownload(new Blob([buildPdf(pdfPages).slice()], { type: 'application/pdf' }),
        `${slugName()}.pdf`);
    } finally { exporting = false; }
  }

  // ============================================================
  // Auto Save
  // ============================================================
  type AutoSaveStatus = 'idle' | 'pending' | 'saved';

  let autoSaveStatus      = $state<AutoSaveStatus>('idle');
  let autoSaveTimer: ReturnType<typeof setTimeout> | null = null;
  let autoSaveInitialized = false;

  $effect(() => {
    // Deep-track: page prompts, layouts, panel prompts, activePage
    for (const pg of pages) {
      pg.prompt;
      pg.layout;
      for (const p of pg.panels) p.prompt;
    }
    void activePage;

    if (!autoSaveInitialized) { autoSaveInitialized = true; return; }

    if (autoSaveTimer !== null) clearTimeout(autoSaveTimer);
    autoSaveStatus = 'pending';
    autoSaveTimer  = setTimeout(() => {
      if (typeof localStorage !== 'undefined') {
        try { localStorage.setItem(PROJECT_KEY, JSON.stringify(buildProjectData(false))); }
        catch { /* quota */ }
      }
      autoSaveTimer  = null;
      autoSaveStatus = 'saved';
      setTimeout(() => { autoSaveStatus = 'idle'; }, 2000);
    }, 2000);
  });

  loadRefImages();
  loadProPresets();
  loadHistory();
  loadProjectFromStorage();
  projectIndex = loadIndex();
  loadAssets();
  loadDiaryHistory();
</script>

<div class="studio">
  <!-- ── HEADER ─────────────────────────────────────── -->
  <header class="studio-header">
    <div class="hd-left">
      <svg class="logo-hex" width="28" height="28" viewBox="0 0 40 40" fill="none" aria-hidden="true">
        <polygon points="20,2 36,11 36,29 20,38 4,29 4,11" stroke="#00e5ff" stroke-width="1.5" fill="rgba(0,229,255,0.06)"/>
        <polygon points="20,8 30,14 30,26 20,32 10,26 10,14" stroke="#a855f7" stroke-width="1" fill="rgba(168,85,247,0.06)"/>
        <circle cx="20" cy="20" r="3" fill="#00e5ff" opacity="0.9"/>
      </svg>
      <div class="title-group">
        <div class="main-title">IMAGE STUDIO</div>
        <div class="sub-title">MANGA · PANEL · GENERATOR</div>
      </div>
    </div>

    <div class="hd-center">
      <div class="hd-divider"></div>
      <input
        class="proj-name-input"
        bind:value={currentProjectName}
        placeholder="Untitled"
        spellcheck="false"
        title="プロジェクト名（クリックで編集）"
      />
      <div class="hd-divider"></div>
    </div>

    <div class="hd-right">
      {#if autoSaveStatus !== 'idle'}
        <span class="autosave-badge" class:saved={autoSaveStatus === 'saved'}>
          {autoSaveStatus === 'pending' ? '● …' : '✓ AUTO SAVED'}
        </span>
      {/if}
      <div class="export-wrap">
        <button
          class="proj-btn export-open-btn"
          onclick={() => (exportMenuOpen = !exportMenuOpen)}
          disabled={exporting}
        >
          {exporting ? '⏳ …' : '↗ EXPORT'}
        </button>
        {#if exportMenuOpen}
          <div class="export-menu">
            <button class="export-item" onclick={exportCurrentPng}>
              <span class="ei-icon">▣</span>
              <span class="ei-body"><span class="ei-label">PNG</span><span class="ei-desc">Current page</span></span>
            </button>
            <button class="export-item" onclick={exportAllZip}>
              <span class="ei-icon">◫</span>
              <span class="ei-body"><span class="ei-label">ZIP</span><span class="ei-desc">All pages as PNG</span></span>
            </button>
            <button class="export-item" onclick={exportPdf}>
              <span class="ei-icon">◧</span>
              <span class="ei-body"><span class="ei-label">PDF</span><span class="ei-desc">All pages</span></span>
            </button>
          </div>
        {/if}
      </div>
      <button class="proj-btn browser-open-btn" onclick={() => (browserOpen = true)}>
        ☰ PROJECTS{#if projectIndex.length > 0}<span class="proj-count-badge">{projectIndex.length}</span>{/if}
      </button>
      <div class="hd-sep"></div>
      <div class="proj-save-load">
        <button class="proj-btn save-btn" class:flash={saveFlash} onclick={saveProject}>
          {saveFlash ? '✓ SAVED' : '↓ SAVE'}
        </button>
        <!-- svelte-ignore a11y_no_noninteractive_element_interactions -->
        <label class="proj-btn load-btn">
          ↑ LOAD
          <input type="file" accept=".json" style="display:none" onchange={loadProjectFile} />
        </label>
      </div>
      <div class="hd-sep"></div>
      <button class="back-btn" onclick={() => window.close()}>
        ← CLOSE
      </button>
      <a class="back-btn" href="/lab">
        ↩ BACK TO LAB
      </a>
    </div>
  </header>
  <div class="hd-line"></div>

  {#if mangaImportBanner}
    <div class="manga-import-banner">⬛ Lab からのMANGA化データを読み込みました</div>
  {/if}
  {#if diaryImportBanner}
    <div class="diary-import-banner">📘 絵日記を読み込みました</div>
  {/if}
  {#if yamlImportBanner}
    <div class="yaml-import-banner">◈ Lab からのYAML化データを読み込みました</div>
  {/if}

  <!-- ── MAIN ──────────────────────────────────────── -->
  <main class="studio-main">

    <!-- ── LEFT COLUMN ──────────────────────────────── -->
    <section class="col-left">

      <!-- Assets -->
      <div class="panel assets-panel">
        <div class="panel-hd">
          <span class="panel-label">ASSETS</span>
          <div class="assets-hd-right">
            <div class="atab-bar">
              {#each ASSET_TABS as tab}
                <button
                  class="atab"
                  class:active={assetTab === tab.id}
                  onclick={() => (assetTab = tab.id)}
                >{tab.label}</button>
              {/each}
            </div>
            <button class="icon-btn" onclick={() => (assetPanelOpen = !assetPanelOpen)}>
              {assetPanelOpen ? '▲' : '▼'}
            </button>
          </div>
        </div>
        {#if assetPanelOpen}
          {#if !assetDB}
            <div class="asset-loading">Loading assets…</div>
          {:else}
            <div class="asset-content">
              {#if assetTab === 'char'}
                <div class="asset-grid">
                  {#each assetDB.characters as char}
                    <button
                      class="asset-chip"
                      class:selected={selectedChar?.id === char.id}
                      onclick={() => selectChar(char)}
                    >{char.label}</button>
                  {/each}
                </div>
                {#if selectedChar}
                  <div class="char-prompt-preview">{selectedChar.prompt}</div>
                {/if}

              {:else if assetTab === 'expr'}
                {#if !selectedChar}
                  <div class="asset-hint">← Select a character first</div>
                {:else}
                  <div class="asset-section-lbl">{selectedChar.label} expressions</div>
                  <div class="asset-grid">
                    {#each selectedChar.expressions as expr}
                      <button class="asset-chip" onclick={() => insertAsset(expr.prompt)}>{expr.label}</button>
                    {/each}
                  </div>
                {/if}

              {:else if assetTab === 'costume'}
                {#if !selectedChar}
                  <div class="asset-hint">← Select a character first</div>
                {:else}
                  <div class="asset-section-lbl">{selectedChar.label} costumes</div>
                  <div class="asset-grid">
                    {#each selectedChar.costumes as costume}
                      <button class="asset-chip" onclick={() => insertAsset(costume.prompt)}>{costume.label}</button>
                    {/each}
                  </div>
                {/if}

              {:else if assetTab === 'pose'}
                <div class="asset-grid">
                  {#each assetDB.poses as pose}
                    <button class="asset-chip" onclick={() => insertAsset(pose.prompt)}>{pose.label}</button>
                  {/each}
                </div>

              {:else if assetTab === 'bg'}
                <div class="asset-grid">
                  {#each assetDB.backgrounds as bg}
                    <button class="asset-chip" onclick={() => insertAsset(bg.prompt)}>{bg.label}</button>
                  {/each}
                </div>
              {/if}
            </div>
          {/if}
        {/if}
      </div>

      <!-- Reference Images -->
      <div class="panel ref-panel">
        <div class="panel-hd">
          <span class="panel-label">REFERENCE IMAGES</span>
          {#if refA || refB}
            <span class="ref-active-badge">ACTIVE</span>
          {/if}
          <span style="flex:1"></span>
          <button class="icon-btn" onclick={() => (refPanelOpen = !refPanelOpen)}>
            {refPanelOpen ? '▲' : '▼'}
          </button>
        </div>

        {#if refPanelOpen}
          <div class="ref-slots">

            <!-- Slot A -->
            <div class="ref-slot">
              <div class="ref-slot-hd">
                <span class="ref-slot-label">CHAR A</span>
                {#if refA}
                  <button class="ref-clear-btn" onclick={() => clearRef('A')} title="Remove reference">✕</button>
                {/if}
              </div>
              {#if refA}
                <div class="ref-thumb-wrap">
                  <img src={refA.thumb} alt="Reference A" class="ref-thumb" />
                </div>
                <div class="ref-fname">{refA.name}</div>
                <input
                  class="ref-label-input"
                  bind:value={refA.label}
                  placeholder="prompt tags for this character..."
                  oninput={saveRefImages}
                  title="This text will be prepended to every generated prompt"
                />
              {:else}
                <label class="ref-upload-area">
                  <input
                    type="file"
                    accept="image/*"
                    style="display:none"
                    onchange={(e) => uploadRef('A', e)}
                  />
                  <span class="ref-upload-icon">+</span>
                  <span class="ref-upload-hint">Upload reference</span>
                </label>
              {/if}
            </div>

            <!-- Slot B -->
            <div class="ref-slot">
              <div class="ref-slot-hd">
                <span class="ref-slot-label">CHAR B</span>
                {#if refB}
                  <button class="ref-clear-btn" onclick={() => clearRef('B')} title="Remove reference">✕</button>
                {/if}
              </div>
              {#if refB}
                <div class="ref-thumb-wrap">
                  <img src={refB.thumb} alt="Reference B" class="ref-thumb" />
                </div>
                <div class="ref-fname">{refB.name}</div>
                <input
                  class="ref-label-input"
                  bind:value={refB.label}
                  placeholder="prompt tags for this character..."
                  oninput={saveRefImages}
                  title="This text will be prepended to every generated prompt"
                />
              {:else}
                <label class="ref-upload-area">
                  <input
                    type="file"
                    accept="image/*"
                    style="display:none"
                    onchange={(e) => uploadRef('B', e)}
                  />
                  <span class="ref-upload-icon">+</span>
                  <span class="ref-upload-hint">Upload reference</span>
                </label>
              {/if}
            </div>

          </div>

          {#if refA || refB}
            <div class="ref-inject-preview">
              <span class="ref-inject-lbl">INJECT →</span>
              <span class="ref-inject-text">
                {buildRefContext() || '(label を入力するとプロンプトへ注入されます)'}
              </span>
            </div>
          {/if}
        {/if}
      </div>

      <!-- One Panel Pro Mode -->
      <div class="panel pro-panel" class:pro-active={proModeOpen}>
        <div class="panel-hd pro-hd" onclick={() => (proModeOpen = !proModeOpen)} style="cursor:pointer">
          <span class="pro-hex">◆</span>
          <span class="panel-label pro-label">ONE PANEL PRO</span>
          {#if proModeOpen}
            <span class="pro-on-badge">ON</span>
          {/if}
          <span style="flex:1"></span>
          <button class="icon-btn" onclick={(e) => { e.stopPropagation(); proModeOpen = !proModeOpen; }}>
            {proModeOpen ? '▲' : '▼'}
          </button>
        </div>

        {#if proModeOpen}
          <div class="pro-body">

            <!-- Expression -->
            <div class="pro-section">
              <div class="pro-section-hd">EXPRESSION</div>
              <div class="pro-chips">
                {#each PRO_EXPRESSIONS as e}
                  <button
                    class="pro-chip"
                    class:active={proExpression === e.id}
                    onclick={() => { proExpression = proExpression === e.id ? '' : e.id; }}
                    title={e.prompt}
                  >{e.label}</button>
                {/each}
              </div>
            </div>

            <!-- Camera -->
            <div class="pro-section">
              <div class="pro-section-hd">CAMERA</div>
              <div class="pro-chips">
                {#each PRO_CAMERAS as c}
                  <button
                    class="pro-chip"
                    class:active={proCamera === c.id}
                    onclick={() => { proCamera = proCamera === c.id ? '' : c.id; }}
                    title={c.prompt}
                  >{c.label}</button>
                {/each}
              </div>
            </div>

            <!-- Pose -->
            <div class="pro-section">
              <div class="pro-section-hd">POSE</div>
              <div class="pro-chips">
                {#each PRO_POSES as p}
                  <button
                    class="pro-chip"
                    class:active={proPose === p.id}
                    onclick={() => { proPose = proPose === p.id ? '' : p.id; }}
                    title={p.prompt}
                  >{p.label}</button>
                {/each}
              </div>
            </div>

            <!-- Style -->
            <div class="pro-section">
              <div class="pro-section-hd">STYLE</div>
              <div class="pro-chips">
                {#each PRO_STYLES as s}
                  <button
                    class="pro-chip pro-chip-style"
                    class:active={proStyle === s.id}
                    onclick={() => { proStyle = s.id; }}
                    title={s.prompt || 'No style override'}
                  >{s.label}</button>
                {/each}
              </div>
            </div>

            <!-- Lighting -->
            <div class="pro-section">
              <div class="pro-section-hd">LIGHTING</div>
              <div class="pro-chips">
                {#each PRO_LIGHTING as l}
                  <button
                    class="pro-chip pro-chip-light"
                    class:active={proLighting === l.id}
                    onclick={() => { proLighting = l.id; }}
                    title={l.prompt || 'No lighting override'}
                  >{l.label}</button>
                {/each}
              </div>
            </div>

            <!-- Presets -->
            <div class="pro-section">
              <div class="pro-section-hd">PRESETS</div>

              <div class="pro-preset-list">
                {#each proPresets as preset (preset.id)}
                  <div class="pro-preset-item" class:is-default={preset.isDefault}>
                    <button
                      class="pro-preset-btn"
                      onclick={() => applyProPreset(preset)}
                      title={proPresetTitle(preset)}
                    >{preset.name}</button>
                    {#if !preset.isDefault}
                      <button
                        class="pro-preset-del"
                        onclick={() => deleteProPreset(preset.id)}
                        title="Delete preset"
                      >✕</button>
                    {/if}
                  </div>
                {/each}
              </div>

              <div class="pro-preset-save-row">
                <input
                  class="pro-preset-name-input"
                  type="text"
                  placeholder="Preset name…"
                  bind:value={proPresetName}
                  onkeydown={(e) => { if (e.key === 'Enter') saveCurrentAsPreset(); }}
                  maxlength="30"
                />
                <button
                  class="pro-preset-save-btn"
                  onclick={saveCurrentAsPreset}
                  disabled={!proPresetName.trim()}
                  title="Save current settings as preset"
                >+ SAVE</button>
              </div>
            </div>

            <!-- Enhanced Prompt Preview -->
            <div class="pro-preview">
              <div class="pro-preview-hd">
                <span class="pro-preview-lbl">ENHANCED PROMPT</span>
                <span class="pro-tag-count">{buildEnhancedPrompt().split(',').filter(t => t.trim()).length} tags</span>
              </div>
              <div class="pro-preview-text">
                {buildEnhancedPrompt() || '(base promptを入力してください)'}
              </div>
            </div>

            <!-- Generate Pro -->
            <button
              class="pro-gen-btn"
              class:generating
              onclick={generatePro}
              disabled={generating || !pages[activePage].prompt.trim()}
            >
              {#if generating}
                <span class="gen-dots"><span></span><span></span><span></span></span>
                GENERATING…
              {:else}
                ◆ GENERATE PRO
              {/if}
            </button>

          </div>
        {/if}
      </div>

      <!-- Diary Panel -->
      {#if diaryNote}
        <div class="panel diary-panel">
          <div class="panel-hd">
            <span class="panel-label diary-label">📘 DIARY</span>
            <span class="diary-date-badge">{diaryNote.date}</span>
            <span style="flex:1"></span>
            <button class="icon-btn" onclick={() => { diaryNote = null; activeDiaryId = null; }} title="閉じる">✕</button>
          </div>

          <blockquote class="diary-blockquote">{diaryNote.diaryText}</blockquote>

          <div class="mood-row">
            <span class="mood-lbl">MOOD</span>
            <div class="mood-chips">
              {#each MOOD_OPTIONS as m}
                <button
                  class="mood-chip"
                  class:active={currentDiaryMood === m.id}
                  style="--mc:{m.color}"
                  onclick={() => (currentDiaryMood = m.id)}
                  title={m.label}
                ><span class="mood-icon">{m.icon}</span><span class="mood-name">{m.label}</span></button>
              {/each}
            </div>
          </div>

          <button
            class="diary-gen-btn"
            class:generating
            onclick={generateDiaryImage}
            disabled={generating || !pages[activePage].prompt.trim()}
          >
            {#if generating}
              <span class="gen-dots"><span></span><span></span><span></span></span>
              GENERATING…
            {:else}
              <span class="dg-icon">◼</span> TODAY'S IMAGE を生成
            {/if}
          </button>
        </div>
      {/if}

      <!-- Prompt -->
      <div class="panel prompt-panel">
        <div class="panel-hd">
          <span class="panel-label">PROMPT</span>
          <button class="icon-btn" onclick={copyPrompt} title="Copy">⧉</button>
        </div>
        <textarea
          class="prompt-area"
          value={pages[activePage].prompt}
          oninput={(e) => { pages[activePage].prompt = e.currentTarget.value; }}
          placeholder="1girl, cyberpunk, neon city, detailed lineart..."
          rows="5"
          onkeydown={(e) => { if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) generate(); }}
        ></textarea>
        <div class="prompt-foot">
          <span class="prompt-hint">Ctrl+Enter to generate</span>
          <div class="model-toggle">
            <button
              class="model-btn"
              class:active={studioModel === 'gpt-image-2'}
              onclick={() => studioModel = 'gpt-image-2'}
              title="GPT Image 2 — character reference edit"
            >GPT Image 2</button>
            <button
              class="model-btn"
              class:active={studioModel === 'fal-fast'}
              onclick={() => studioModel = 'fal-fast'}
              title="FAL Flux Dev — fast open-source model"
            >FAL Flux Dev</button>
            <button
              class="model-btn"
              class:active={studioModel === 'fal-pro'}
              onclick={() => studioModel = 'fal-pro'}
              title="FAL Flux Pro — high quality generation"
            >FAL Flux Pro</button>
          </div>
          <select class="size-select" bind:value={size}>
            <option value="1024x1024">1:1 Square</option>
            <option value="1792x1024">16:9 Wide</option>
            <option value="1024x1792">9:16 Portrait</option>
          </select>
        </div>
      </div>

      <!-- Generate button -->
      <button
        class="gen-btn"
        class:generating
        onclick={generate}
        disabled={generating || !pages[activePage].prompt.trim()}
      >
        {#if generating}
          <span class="gen-dots">
            <span></span><span></span><span></span>
          </span>
          GENERATING... (30–60s)
        {:else}
          ◼ GENERATE IMAGE
        {/if}
      </button>

      {#if errorMsg}
        <div class="error-bar">⚠ {errorMsg}</div>
      {/if}

      <!-- Preview -->
      <div class="panel preview-panel">
        <div class="panel-hd">
          <span class="panel-label">PREVIEW</span>
          {#if previewUrl}
            <div class="hd-actions">
              <a class="icon-btn" href={previewUrl} download="studio_output.png" title="Download">↓</a>
              <button class="icon-btn" onclick={() => { previewUrl = null; errorMsg = ''; }} title="Clear">✕</button>
            </div>
          {/if}
        </div>
        <div class="preview-area" class:has-image={!!previewUrl}>
          {#if previewUrl}
            <img src={previewUrl} alt="Generated" class="preview-img" />
          {:else if generating}
            <div class="preview-placeholder">
              <div class="spinner"></div>
              <span>Generating...</span>
            </div>
          {:else}
            <div class="preview-placeholder">
              <svg width="40" height="40" viewBox="0 0 40 40" fill="none" opacity="0.3">
                <rect x="4" y="8" width="32" height="24" rx="2" stroke="#00e5ff" stroke-width="1.5"/>
                <circle cx="14" cy="16" r="3" stroke="#00e5ff" stroke-width="1.2"/>
                <path d="M4 26 l8-8 6 6 5-5 13 9" stroke="#00e5ff" stroke-width="1.2" stroke-linejoin="round"/>
              </svg>
              <span>No image yet</span>
            </div>
          {/if}
        </div>

        {#if revisedPrompt}
          <div class="revised-prompt">
            <span class="revised-lbl">DALL·E revised: </span>{revisedPrompt}
          </div>
        {/if}

        <!-- Send to panel buttons -->
        {#if previewUrl}
          <div class="send-row">
            <span class="send-lbl">SEND TO PANEL →</span>
            {#each panels as _, i}
              <button class="send-btn" onclick={() => sendToPanel(i)}>{i + 1}</button>
            {/each}
          </div>
        {/if}
      </div>
    </section>

    <!-- ── RIGHT COLUMN ─────────────────────────────── -->
    <section class="col-right">

      <!-- Comic Panels -->
      <div class="panel comic-panel">

        <!-- Page Tabs -->
        <div class="page-tabs">
          {#each pages as _page, i}
            <button
              class="page-tab"
              class:active={activePage === i}
              onclick={() => switchPage(i)}
            >
              PAGE {i + 1}
              {#if pages.length > 1}
                <!-- svelte-ignore a11y_click_events_have_key_events a11y_no_static_element_interactions -->
                <span class="tab-del" onclick={(e) => { e.stopPropagation(); removePage(i); }}>✕</span>
              {/if}
            </button>
          {/each}
          {#if pages.length < 8}
            <button class="page-tab-add" onclick={addPage}>+ PAGE</button>
          {/if}
        </div>

        <div class="panel-hd">
          <span class="panel-label">COMIC PANELS</span>
          <div class="layout-selector">
            {#each LAYOUTS as def}
              <button
                class="layout-btn"
                class:active={layout === def.id}
                onclick={() => setLayout(def.id)}
              >{def.label}</button>
            {/each}
          </div>
          <button class="icon-btn danger" onclick={clearAll} title="Clear all">✕ CLEAR</button>
        </div>

        <div class="comic-grid" style={gridStyle}>
          {#each panels as slot, i}
            <!-- svelte-ignore a11y_click_events_have_key_events a11y_no_static_element_interactions -->
            <div
              class="comic-slot"
              class:active={activePanel === i}
              onclick={() => activePanel = activePanel === i ? null : i}
            >
              <div class="slot-num">{i + 1}</div>
              {#if layout === 'free' && panels.length > 1}
                <button class="slot-remove-btn" onclick={(e) => { e.stopPropagation(); removePanel(i); }}>✕</button>
              {/if}

              {#if slot.imageUrl}
                <img src={slot.imageUrl} alt="Panel {i+1}" class="slot-img" />
              {:else if slot.generating}
                <div class="slot-empty generating">
                  <div class="spinner sm"></div>
                </div>
              {:else}
                <div class="slot-empty">
                  <svg width="24" height="24" viewBox="0 0 24 24" fill="none" opacity="0.25">
                    <rect x="2" y="4" width="20" height="16" rx="1" stroke="#00e5ff" stroke-width="1"/>
                    <path d="M2 15 l5-5 4 4 3-3 8 5" stroke="#00e5ff" stroke-width="1" stroke-linejoin="round"/>
                  </svg>
                </div>
              {/if}

              {#if activePanel === i}
                <div class="slot-controls" onclick={(e) => e.stopPropagation()}>
                  <input
                    class="slot-input"
                    bind:value={slot.prompt}
                    placeholder="Panel {i+1} prompt..."
                    onkeydown={(e) => { if (e.key === 'Enter') generatePanel(i); }}
                  />
                  <button
                    class="slot-gen-btn"
                    onclick={() => generatePanel(i)}
                    disabled={slot.generating || !slot.prompt.trim()}
                  >
                    {slot.generating ? '...' : '▶'}
                  </button>
                  {#if slot.imageUrl}
                    <a class="slot-dl-btn" href={slot.imageUrl} download="panel_{i+1}.png">↓</a>
                    <button class="slot-clr-btn" onclick={() => { panels[i] = { ...panels[i], imageUrl: null }; }}>✕</button>
                  {/if}
                </div>
              {/if}
            </div>
          {/each}
          {#if layout === 'free' && panels.length < 8}
            <button class="add-panel-btn" onclick={addPanel}>+ ADD PANEL</button>
          {/if}
        </div>

        <div class="export-hint">
          Click a panel to edit · Enter to generate · ↓ to download
        </div>
      </div>

      <!-- History Gallery -->
      <div class="panel hist-gallery">
        <div class="panel-hd">
          <span class="panel-label">
            HISTORY
            {#if history.length > 0}
              <span class="hist-count">{history.length} / {MAX_HISTORY}</span>
            {/if}
          </span>
          <div class="hd-actions">
            {#if history.length > 0}
              <button class="icon-btn danger" onclick={() => { history = []; saveHistory([]); }} title="Clear history">✕ CLEAR</button>
            {/if}
            <button class="icon-btn" onclick={() => (historyOpen = !historyOpen)}>
              {historyOpen ? '▲' : '▼'}
            </button>
          </div>
        </div>

        {#if historyOpen}
          {#if history.length === 0}
            <div class="hist-empty">生成した画像がここに表示されます</div>
          {:else}
            <div class="hist-grid">
              {#each history as entry (entry.id)}
                <!-- svelte-ignore a11y_click_events_have_key_events a11y_no_static_element_interactions -->
                <div class="hist-item" onclick={() => restoreFromHistory(entry)}>
                  <div class="hist-thumb-wrap">
                    <img src={entry.thumb} alt="history" class="hist-thumb" />
                    <div class="hist-time">{formatTime(entry.createdAt)}</div>
                  </div>
                  <div class="hist-actions">
                    <button class="ha-btn ha-preview" onclick={() => restoreFromHistory(entry)} title="Preview に復元">↩</button>
                    <button class="ha-btn ha-regen"   onclick={(e) => regenerateFromHistory(entry, e)} title="再生成" disabled={generating}>⟳</button>
                    <div class="ha-sep"></div>
                    {#each panels as _, i}
                      <button class="ha-btn ha-panel" onclick={(e) => sendHistoryToPanel(entry, i, e)} title="Panel {i+1} へ送る">{i + 1}</button>
                    {/each}
                    <div class="ha-sep"></div>
                    <button class="ha-btn ha-del" onclick={(e) => removeHistory(entry.id, e)} title="削除">✕</button>
                  </div>
                </div>
              {/each}
            </div>
          {/if}
        {/if}
      </div>

      <!-- Diary History -->
      <div class="panel dh-panel">
        <div class="panel-hd">
          <span class="panel-label diary-label">📘 DIARY HISTORY</span>
          {#if diaryHistory.length > 0}
            <span class="hist-count">{diaryHistory.length} / {MAX_DIARY_ENTRIES}</span>
          {/if}
          <span style="flex:1"></span>
          {#if diaryHistory.length > 0}
            <button class="icon-btn danger" onclick={clearDiaryHistory} title="履歴を全削除">✕ CLEAR</button>
          {/if}
        </div>

        {#if diaryHistory.length === 0}
          <div class="dh-empty">
            <span class="dh-empty-icon">📘</span>
            <span>日記画像を生成するとここに記録されます</span>
          </div>
        {:else}
          <div class="dh-list">
            {#each diaryHistory as entry (entry.id)}
              <div
                class="dh-card"
                class:active={activeDiaryId === entry.id}
                onclick={() => loadDiaryEntryForView(entry)}
              >
                <div class="dh-card-thumb">
                  {#if entry.thumb}
                    <img src={entry.thumb} alt="diary" class="dh-thumb-img" />
                  {:else}
                    <div class="dh-no-thumb">📷</div>
                  {/if}
                </div>
                <div class="dh-card-body">
                  <div class="dh-card-meta">
                    <span class="dh-date">{entry.date}</span>
                    <span
                      class="dh-mood-badge"
                      style="--mc:{MOOD_OPTIONS.find(m => m.id === entry.mood)?.color ?? '#8ab4c2'}"
                    >{MOOD_OPTIONS.find(m => m.id === entry.mood)?.icon ?? '◈'} {MOOD_OPTIONS.find(m => m.id === entry.mood)?.label ?? entry.mood}</span>
                  </div>
                  <div class="dh-excerpt">{entry.diaryText.length > 80 ? entry.diaryText.slice(0, 80) + '…' : entry.diaryText}</div>
                </div>
                <button
                  class="dh-del-btn"
                  onclick={(e) => { e.stopPropagation(); removeDiaryEntry(entry.id); }}
                  title="削除"
                >✕</button>
              </div>
            {/each}
          </div>
        {/if}
      </div>

    </section>

  </main>

  <!-- ── EXPORT BACKDROP ──────────────────────────────── -->
  {#if exportMenuOpen}
    <!-- svelte-ignore a11y_click_events_have_key_events a11y_no_static_element_interactions -->
    <div class="export-backdrop" onclick={() => (exportMenuOpen = false)}></div>
  {/if}

  <!-- ── PROJECT BROWSER MODAL ─────────────────────────── -->
  {#if browserOpen}
    <!-- svelte-ignore a11y_click_events_have_key_events a11y_no_static_element_interactions -->
    <div class="browser-overlay" onclick={() => (browserOpen = false)}>
      <div class="browser-modal" onclick={(e) => e.stopPropagation()}>

        <div class="browser-hd">
          <span class="browser-title">PROJECT BROWSER</span>
          <span class="browser-subtitle">{projectIndex.length} saved</span>
          <button class="icon-btn" onclick={() => (browserOpen = false)}>✕</button>
        </div>

        {#if projectIndex.length === 0}
          <div class="browser-empty">
            保存済みプロジェクトはありません。<br/>
            ヘッダーの <strong>↓ SAVE</strong> で現在の状態を保存できます。
          </div>
        {:else}
          <div class="browser-grid">
            {#each projectIndex as meta (meta.id)}
              <div class="proj-card" class:current={currentProjectId === meta.id}>

                {#if renamingId === meta.id}
                  <!-- svelte-ignore a11y_autofocus -->
                  <input
                    class="rename-input"
                    bind:value={renameValue}
                    onkeydown={commitRename}
                    onblur={commitRename}
                    autofocus
                  />
                {:else}
                  <div class="proj-card-name">{meta.name}</div>
                {/if}

                <div class="proj-card-meta">
                  <span>{formatDate(meta.savedAt)}</span>
                  <span class="pc-pages">{meta.pageCount}p</span>
                </div>

                {#if currentProjectId === meta.id}
                  <div class="proj-card-current-lbl">● CURRENT</div>
                {/if}

                <div class="proj-card-actions">
                  <button class="ca-btn ca-load" onclick={() => loadProjectById(meta.id)}>LOAD</button>
                  <button class="ca-btn ca-dup"  onclick={() => duplicateProject(meta.id)}>DUP</button>
                  <button class="ca-btn ca-ren"  onclick={(e) => startRename(meta.id, meta.name, e)}>REN</button>
                  <button class="ca-btn ca-del"  onclick={() => deleteProject(meta.id)}>DEL</button>
                </div>

              </div>
            {/each}
          </div>
        {/if}

      </div>
    </div>
  {/if}

</div>

<style>
/* ============================================================
   ROOT / LAYOUT
   ============================================================ */
.studio {
  --cy:      #00e5ff;
  --cy-dim:  rgba(0,229,255,0.1);
  --cy-glow: rgba(0,229,255,0.35);
  --pu:      #a855f7;
  --pu-dim:  rgba(168,85,247,0.12);
  --gold:    rgba(251,191,36,1);
  --bg:      #020912;
  --bg2:     #040d1a;
  --panel:   rgba(0,229,255,0.015);
  --pborder: rgba(0,229,255,0.14);
  --text:    #cce8f0;
  --text2:   #8ab4c2;
  --muted:   #3a6070;
  --dim:     #1a3040;
  --red:     #f43f5e;

  min-height: 100vh;
  background:
    radial-gradient(ellipse at 15% 15%, rgba(0,40,90,0.5) 0%, transparent 55%),
    radial-gradient(ellipse at 85% 85%, rgba(90,0,140,0.35) 0%, transparent 55%),
    linear-gradient(155deg, #020912 0%, #040b1a 45%, #060416 100%);
  color: var(--text);
  font-family: 'Consolas', 'SF Mono', 'Courier New', 'Noto Sans JP', monospace;
  display: flex;
  flex-direction: column;
  overflow: hidden;
  position: relative;
}

.studio::before {
  content: '';
  position: fixed;
  inset: 0;
  background-image: radial-gradient(rgba(0,229,255,0.05) 1px, transparent 1px);
  background-size: 28px 28px;
  pointer-events: none;
  z-index: 0;
}

/* ============================================================
   HEADER
   ============================================================ */
.studio-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 14px 28px;
  background: rgba(2,5,18,0.9);
  backdrop-filter: blur(12px);
  position: relative;
  z-index: 10;
  gap: 16px;
  flex-shrink: 0;
}

.hd-line {
  height: 1px;
  background: linear-gradient(90deg, transparent 0%, var(--cy) 30%, var(--pu) 70%, transparent 100%);
  opacity: 0.45;
  flex-shrink: 0;
}

.hd-left {
  display: flex;
  align-items: center;
  gap: 12px;
  flex-shrink: 0;
}

.logo-hex {
  filter: drop-shadow(0 0 8px rgba(0,229,255,0.55));
}

.title-group { display: flex; flex-direction: column; gap: 2px; }

.main-title {
  font-size: 22px;
  font-weight: 900;
  letter-spacing: 5px;
  color: var(--cy);
  text-shadow: 0 0 14px var(--cy-glow), 0 0 35px rgba(0,229,255,0.15);
  line-height: 1;
}

.sub-title {
  font-size: 12px;
  letter-spacing: 2.5px;
  color: var(--muted);
  text-transform: uppercase;
}

.hd-center {
  display: flex;
  align-items: center;
  gap: 10px;
  flex: 1;
  min-width: 0;
}

.hd-divider {
  flex: 1;
  height: 1px;
  background: linear-gradient(90deg, transparent, var(--dim));
}

.hd-tag {
  font-size: 13px;
  letter-spacing: 1.5px;
  color: var(--dim);
  white-space: nowrap;
}

.hd-right {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-shrink: 0;
}

.back-btn {
  font-size: 15px;
  letter-spacing: 1px;
  color: var(--text2);
  background: rgba(0,229,255,0.04);
  border: 1px solid var(--pborder);
  border-radius: 4px;
  padding: 9px 16px;
  cursor: pointer;
  text-decoration: none;
  transition: background 0.15s, color 0.15s;
  display: inline-flex;
  align-items: center;
  gap: 6px;
}

.back-btn:hover {
  background: rgba(0,229,255,0.1);
  color: var(--cy);
}

/* ============================================================
   PROJECT SAVE / LOAD
   ============================================================ */
.proj-save-load {
  display: flex;
  gap: 5px;
  align-items: center;
}

.hd-sep {
  width: 1px;
  height: 24px;
  background: var(--pborder);
  margin: 0 4px;
  flex-shrink: 0;
}

.proj-btn {
  font-size: 13px;
  font-family: inherit;
  letter-spacing: 1.5px;
  padding: 8px 15px;
  border-radius: 4px;
  border: 1px solid rgba(0,229,255,0.28);
  background: rgba(0,229,255,0.05);
  color: var(--cy);
  cursor: pointer;
  text-decoration: none;
  display: inline-flex;
  align-items: center;
  gap: 6px;
  transition: background 0.15s, color 0.15s, border-color 0.15s;
  white-space: nowrap;
}

.proj-btn:hover {
  background: rgba(0,229,255,0.12);
  border-color: rgba(0,229,255,0.5);
}

.proj-btn.flash {
  color: #4ade80;
  border-color: rgba(74,222,128,0.45);
  background: rgba(74,222,128,0.07);
}

.load-btn {
  border-color: rgba(168,85,247,0.28);
  background: rgba(168,85,247,0.05);
  color: var(--pu);
}

.load-btn:hover {
  background: rgba(168,85,247,0.12);
  border-color: rgba(168,85,247,0.5);
}

/* ============================================================
   AUTO SAVE BADGE
   ============================================================ */
.autosave-badge {
  font-size: 11px;
  font-family: inherit;
  letter-spacing: 1.5px;
  padding: 5px 11px;
  border-radius: 4px;
  border: 1px solid transparent;
  color: var(--muted);
  white-space: nowrap;
  transition: color 0.3s, border-color 0.3s, background 0.3s;
}

.autosave-badge.saved {
  color: #4ade80;
  border-color: rgba(74,222,128,0.3);
  background: rgba(74,222,128,0.06);
}

/* ============================================================
   PROJECT NAME INPUT (header)
   ============================================================ */
.proj-name-input {
  font-size: 13px;
  font-family: inherit;
  letter-spacing: 2px;
  color: var(--text2);
  background: transparent;
  border: none;
  border-bottom: 1px solid transparent;
  outline: none;
  text-align: center;
  width: 100%;
  max-width: 280px;
  padding: 3px 6px;
  transition: border-color 0.15s, color 0.15s;
}
.proj-name-input:hover  { border-bottom-color: var(--pborder); }
.proj-name-input:focus  { color: var(--text); border-bottom-color: rgba(0,229,255,0.4); }
.proj-name-input::placeholder { color: var(--muted); }

.browser-open-btn {
  border-color: rgba(0,229,255,0.2);
  gap: 8px;
}

.proj-count-badge {
  font-size: 11px;
  padding: 1px 6px;
  border-radius: 10px;
  background: rgba(0,229,255,0.12);
  color: var(--cy);
  line-height: 1.4;
}

/* ============================================================
   EXPORT SUITE
   ============================================================ */
.export-wrap {
  position: relative;
}

.export-open-btn {
  border-color: rgba(251,191,36,0.35);
  background: rgba(251,191,36,0.05);
  color: var(--gold);
}
.export-open-btn:hover {
  background: rgba(251,191,36,0.12);
  border-color: rgba(251,191,36,0.6);
}
.export-open-btn:disabled {
  opacity: 0.45;
  cursor: not-allowed;
}

.export-backdrop {
  position: fixed;
  inset: 0;
  z-index: 50;
}

.export-menu {
  position: absolute;
  top: calc(100% + 8px);
  right: 0;
  z-index: 51;
  background: var(--bg2);
  border: 1px solid rgba(251,191,36,0.25);
  border-radius: 8px;
  overflow: hidden;
  min-width: 200px;
  box-shadow: 0 8px 32px rgba(0,0,0,0.5), 0 0 20px rgba(251,191,36,0.06);
}

.export-item {
  width: 100%;
  display: flex;
  align-items: center;
  gap: 14px;
  padding: 13px 16px;
  background: transparent;
  border: none;
  border-bottom: 1px solid var(--pborder);
  cursor: pointer;
  font-family: inherit;
  text-align: left;
  transition: background 0.12s;
}
.export-item:last-child { border-bottom: none; }
.export-item:hover { background: rgba(251,191,36,0.06); }

.ei-icon {
  font-size: 20px;
  color: var(--gold);
  opacity: 0.8;
  flex-shrink: 0;
  width: 24px;
  text-align: center;
}

.ei-body {
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.ei-label {
  font-size: 13px;
  letter-spacing: 2px;
  color: var(--text);
}

.ei-desc {
  font-size: 11px;
  color: var(--muted);
  letter-spacing: 0.5px;
}

/* ============================================================
   PROJECT BROWSER MODAL
   ============================================================ */
.browser-overlay {
  position: fixed;
  inset: 0;
  background: rgba(2,9,18,0.82);
  backdrop-filter: blur(6px);
  z-index: 200;
  display: flex;
  align-items: center;
  justify-content: center;
}

.browser-modal {
  width: min(880px, 94vw);
  max-height: 80vh;
  background: var(--bg2);
  border: 1px solid rgba(0,229,255,0.22);
  border-radius: 12px;
  display: flex;
  flex-direction: column;
  overflow: hidden;
  box-shadow: 0 0 60px rgba(0,229,255,0.07), 0 0 120px rgba(168,85,247,0.04);
}

.browser-hd {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 18px 22px;
  border-bottom: 1px solid var(--pborder);
  flex-shrink: 0;
}

.browser-title {
  font-size: 14px;
  letter-spacing: 3px;
  color: var(--cy);
}

.browser-subtitle {
  font-size: 12px;
  color: var(--muted);
  margin-right: auto;
}

.browser-empty {
  padding: 52px 28px;
  text-align: center;
  font-size: 14px;
  color: var(--muted);
  line-height: 2;
}
.browser-empty strong { color: var(--text2); }

.browser-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(240px, 1fr));
  gap: 14px;
  padding: 20px;
  overflow-y: auto;
  scrollbar-width: thin;
  scrollbar-color: var(--dim) transparent;
}

.proj-card {
  background: var(--panel);
  border: 1px solid var(--pborder);
  border-radius: 8px;
  padding: 16px;
  display: flex;
  flex-direction: column;
  gap: 9px;
  transition: border-color 0.15s;
}
.proj-card:hover  { border-color: rgba(0,229,255,0.28); }
.proj-card.current { border-color: rgba(0,229,255,0.45); background: rgba(0,229,255,0.025); }

.proj-card-name {
  font-size: 14px;
  color: var(--text);
  letter-spacing: 0.5px;
  word-break: break-all;
  min-height: 20px;
}

.proj-card-meta {
  display: flex;
  justify-content: space-between;
  font-size: 11px;
  color: var(--muted);
  letter-spacing: 0.3px;
}

.pc-pages {
  color: var(--text2);
}

.proj-card-current-lbl {
  font-size: 10px;
  letter-spacing: 2px;
  color: var(--cy);
  opacity: 0.7;
}

.proj-card-actions {
  display: flex;
  gap: 5px;
  margin-top: 2px;
}

.ca-btn {
  flex: 1;
  font-size: 11px;
  font-family: inherit;
  letter-spacing: 1px;
  padding: 5px 0;
  border-radius: 3px;
  border: 1px solid var(--pborder);
  background: transparent;
  color: var(--muted);
  cursor: pointer;
  transition: background 0.1s, color 0.1s, border-color 0.1s;
}

.ca-load { color: var(--cy); border-color: rgba(0,229,255,0.22); }
.ca-load:hover { background: rgba(0,229,255,0.12); border-color: rgba(0,229,255,0.5); color: var(--cy); }

.ca-dup:hover  { color: var(--text2); background: rgba(255,255,255,0.05); }
.ca-ren:hover  { color: var(--pu); border-color: rgba(168,85,247,0.3); background: rgba(168,85,247,0.05); }
.ca-del:hover  { color: var(--red); border-color: rgba(244,63,94,0.3); background: rgba(244,63,94,0.05); }

.rename-input {
  width: 100%;
  font-size: 14px;
  font-family: inherit;
  background: rgba(0,229,255,0.04);
  border: 1px solid rgba(0,229,255,0.4);
  border-radius: 4px;
  color: var(--text);
  padding: 5px 8px;
  outline: none;
  box-sizing: border-box;
}

/* ============================================================
   MAIN
   ============================================================ */
.studio-main {
  display: flex;
  gap: 24px;
  padding: 24px;
  flex: 1;
  overflow: hidden;
  position: relative;
  z-index: 1;
}

.col-left {
  display: flex;
  flex-direction: column;
  gap: 20px;
  width: 460px;
  flex-shrink: 0;
  overflow-y: auto;
}

.col-right {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  overflow-y: auto;
}

/* ============================================================
   PANELS
   ============================================================ */
.panel {
  background: var(--panel);
  border: 1px solid var(--pborder);
  border-radius: 10px;
  padding: 20px;
  position: relative;
}

.panel-hd {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 18px;
}

.panel-label {
  font-size: 14px;
  letter-spacing: 2px;
  color: var(--cy);
  opacity: 0.9;
}

.hd-actions {
  display: flex;
  gap: 6px;
}

.icon-btn {
  font-size: 15px;
  color: var(--muted);
  background: transparent;
  border: 1px solid transparent;
  border-radius: 4px;
  padding: 4px 10px;
  cursor: pointer;
  text-decoration: none;
  transition: color 0.15s, border-color 0.15s;
  display: inline-flex;
  align-items: center;
  gap: 5px;
}

.icon-btn:hover { color: var(--cy); border-color: var(--pborder); }
.icon-btn.danger:hover { color: var(--red); }

/* ============================================================
   PROMPT
   ============================================================ */
.prompt-area {
  width: 100%;
  background: rgba(0,229,255,0.03);
  border: 1px solid var(--pborder);
  border-radius: 6px;
  color: var(--text);
  font-family: inherit;
  font-size: 16px;
  line-height: 1.65;
  padding: 14px;
  resize: vertical;
  outline: none;
  transition: border-color 0.15s;
  box-sizing: border-box;
}

.prompt-area:focus { border-color: rgba(0,229,255,0.4); }
.prompt-area::placeholder { color: var(--muted); }

.prompt-foot {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-top: 10px;
  gap: 10px;
}

.prompt-hint {
  font-size: 13px;
  color: var(--muted);
  letter-spacing: 0.5px;
}

.size-select {
  font-size: 13px;
  font-family: inherit;
  background: rgba(0,229,255,0.04);
  border: 1px solid var(--pborder);
  border-radius: 4px;
  color: var(--text2);
  padding: 4px 8px;
  outline: none;
  cursor: pointer;
  transition: border-color 0.15s;
}

.size-select:focus { border-color: rgba(0,229,255,0.4); }

.model-toggle {
  display: flex;
  gap: 2px;
  background: rgba(255,255,255,0.04);
  border: 1px solid var(--pborder);
  border-radius: 4px;
  padding: 2px;
}

.model-btn {
  font-size: 12px;
  font-family: inherit;
  background: transparent;
  border: none;
  border-radius: 3px;
  color: var(--muted);
  padding: 3px 8px;
  cursor: pointer;
  transition: background 0.15s, color 0.15s;
  white-space: nowrap;
}

.model-btn:hover { background: rgba(0,229,255,0.08); color: var(--text2); }

.model-btn.active {
  background: rgba(0,229,255,0.15);
  color: var(--accent);
}

.revised-prompt {
  margin-top: 12px;
  padding: 10px 12px;
  background: rgba(168,85,247,0.05);
  border: 1px solid rgba(168,85,247,0.2);
  border-radius: 6px;
  font-size: 11px;
  line-height: 1.5;
  color: var(--text2);
}

.revised-lbl {
  color: rgba(168,85,247,0.7);
  font-size: 10px;
  letter-spacing: 1px;
}

/* ============================================================
   GENERATE BUTTON
   ============================================================ */
.gen-btn {
  width: 100%;
  height: 48px;
  padding: 0 16px;
  font-size: 15px;
  font-family: inherit;
  letter-spacing: 2px;
  font-weight: 700;
  color: var(--cy);
  background: rgba(0,229,255,0.06);
  border: 1px solid rgba(0,229,255,0.4);
  border-radius: 8px;
  cursor: pointer;
  transition: background 0.15s, box-shadow 0.15s;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 10px;
  flex-shrink: 0;
}

.gen-btn:hover:not(:disabled) {
  background: rgba(0,229,255,0.12);
  box-shadow: 0 0 16px rgba(0,229,255,0.2);
}

.gen-btn:disabled {
  opacity: 0.35;
  cursor: not-allowed;
}

.gen-btn.generating {
  color: var(--pu);
  border-color: rgba(168,85,247,0.4);
  background: rgba(168,85,247,0.06);
}

.gen-dots {
  display: flex;
  gap: 4px;
  align-items: center;
}

.gen-dots span {
  width: 5px;
  height: 5px;
  border-radius: 50%;
  background: var(--pu);
  animation: bounce 0.9s ease-in-out infinite;
}

.gen-dots span:nth-child(2) { animation-delay: 0.18s; }
.gen-dots span:nth-child(3) { animation-delay: 0.36s; }

/* ============================================================
   PREVIEW
   ============================================================ */
.preview-area {
  border: 1px solid var(--pborder);
  border-radius: 6px;
  background: rgba(0,229,255,0.02);
  overflow: hidden;
  min-height: 220px;
  display: flex;
  align-items: center;
  justify-content: center;
}

.preview-area.has-image { background: #000; }

.preview-img {
  width: 100%;
  height: 100%;
  object-fit: contain;
  display: block;
}

.preview-placeholder {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 14px;
  color: var(--muted);
  font-size: 16px;
  letter-spacing: 1px;
}

.send-row {
  display: flex;
  align-items: center;
  gap: 10px;
  margin-top: 18px;
  flex-wrap: wrap;
}

.send-lbl {
  font-size: 14px;
  letter-spacing: 1px;
  color: var(--muted);
}

.send-btn {
  width: 34px;
  height: 34px;
  font-size: 15px;
  font-family: inherit;
  color: var(--cy);
  background: rgba(0,229,255,0.05);
  border: 1px solid rgba(0,229,255,0.25);
  border-radius: 4px;
  cursor: pointer;
  transition: background 0.12s;
}

.send-btn:hover { background: rgba(0,229,255,0.15); }

/* ============================================================
   ERROR
   ============================================================ */
.error-bar {
  font-size: 16px;
  color: var(--red);
  background: rgba(244,63,94,0.07);
  border: 1px solid rgba(244,63,94,0.25);
  border-radius: 6px;
  padding: 12px 16px;
}

/* ============================================================
   COMIC GRID
   ============================================================ */
.comic-panel { flex: 1; display: flex; flex-direction: column; }

.comic-grid {
  flex: 1;
  display: grid;
  gap: 16px;
  min-height: 0;
}

.comic-slot {
  position: relative;
  border: 1px solid var(--pborder);
  border-radius: 6px;
  background: rgba(0,229,255,0.02);
  cursor: pointer;
  overflow: hidden;
  transition: border-color 0.15s, box-shadow 0.15s;
  display: flex;
  flex-direction: column;
  min-height: 160px;
}

.comic-slot:hover {
  border-color: rgba(0,229,255,0.35);
}

.comic-slot.active {
  border-color: var(--cy);
  box-shadow: 0 0 12px rgba(0,229,255,0.15);
}

.slot-num {
  position: absolute;
  top: 10px;
  left: 14px;
  font-size: 18px;
  font-weight: 700;
  letter-spacing: 1px;
  color: var(--muted);
  z-index: 2;
}

.slot-img {
  width: 100%;
  height: 100%;
  object-fit: cover;
  display: block;
}

.slot-empty {
  flex: 1;
  display: flex;
  align-items: center;
  justify-content: center;
}

.slot-controls {
  position: absolute;
  bottom: 0;
  left: 0;
  right: 0;
  background: rgba(2,9,18,0.93);
  backdrop-filter: blur(8px);
  border-top: 1px solid var(--pborder);
  padding: 12px;
  display: flex;
  gap: 8px;
  align-items: center;
  z-index: 3;
}

.slot-input {
  flex: 1;
  font-size: 16px;
  font-family: inherit;
  background: rgba(0,229,255,0.04);
  border: 1px solid var(--pborder);
  border-radius: 4px;
  color: var(--text);
  padding: 8px 11px;
  outline: none;
  min-width: 0;
}

.slot-input::placeholder { color: var(--muted); }
.slot-input:focus { border-color: rgba(0,229,255,0.4); }

.slot-gen-btn, .slot-clr-btn {
  font-size: 15px;
  font-family: inherit;
  background: rgba(0,229,255,0.07);
  border: 1px solid rgba(0,229,255,0.25);
  border-radius: 4px;
  color: var(--cy);
  padding: 8px 12px;
  cursor: pointer;
  transition: background 0.12s;
  flex-shrink: 0;
}

.slot-gen-btn:hover:not(:disabled) { background: rgba(0,229,255,0.15); }
.slot-gen-btn:disabled { opacity: 0.35; cursor: not-allowed; }

.slot-dl-btn {
  font-size: 15px;
  text-decoration: none;
  background: rgba(0,229,255,0.07);
  border: 1px solid rgba(0,229,255,0.25);
  border-radius: 4px;
  color: var(--cy);
  padding: 8px 12px;
  transition: background 0.12s;
  flex-shrink: 0;
  display: inline-flex;
  align-items: center;
}

.slot-dl-btn:hover { background: rgba(0,229,255,0.15); }

.slot-clr-btn {
  color: var(--muted);
  border-color: transparent;
}
.slot-clr-btn:hover { color: var(--red); background: rgba(244,63,94,0.08); }

.export-hint {
  margin-top: 16px;
  font-size: 13px;
  letter-spacing: 0.5px;
  color: var(--muted);
  text-align: center;
}

/* ============================================================
   LAYOUT SELECTOR
   ============================================================ */
.layout-selector {
  display: flex;
  gap: 4px;
  align-items: center;
  flex: 1;
  padding: 0 10px;
  overflow-x: auto;
}

.layout-btn {
  font-size: 12px;
  font-family: inherit;
  padding: 4px 10px;
  border-radius: 4px;
  border: 1px solid var(--pborder);
  background: transparent;
  color: var(--muted);
  cursor: pointer;
  letter-spacing: 0.5px;
  white-space: nowrap;
  flex-shrink: 0;
  transition: background 0.12s, color 0.12s, border-color 0.12s;
}

.layout-btn:hover { color: var(--cy); border-color: rgba(0,229,255,0.3); }
.layout-btn.active {
  color: var(--cy);
  border-color: rgba(0,229,255,0.5);
  background: rgba(0,229,255,0.08);
}

/* ============================================================
   PAGE TABS
   ============================================================ */
.page-tabs {
  display: flex;
  gap: 4px;
  align-items: center;
  flex-wrap: wrap;
  margin-bottom: 16px;
  padding-bottom: 14px;
  border-bottom: 1px solid var(--pborder);
}

.page-tab {
  font-size: 12px;
  font-family: inherit;
  padding: 5px 12px;
  border-radius: 4px;
  border: 1px solid var(--pborder);
  background: transparent;
  color: var(--muted);
  cursor: pointer;
  letter-spacing: 1.5px;
  display: inline-flex;
  align-items: center;
  gap: 7px;
  transition: background 0.12s, color 0.12s, border-color 0.12s;
}

.page-tab:hover { color: var(--text2); background: rgba(0,229,255,0.04); }

.page-tab.active {
  color: var(--cy);
  border-color: rgba(0,229,255,0.5);
  background: rgba(0,229,255,0.08);
}

.tab-del {
  font-size: 10px;
  color: var(--muted);
  padding: 1px 4px;
  border-radius: 2px;
  line-height: 1;
  transition: color 0.1s;
}

.tab-del:hover { color: var(--red); }

.page-tab-add {
  font-size: 12px;
  font-family: inherit;
  padding: 5px 12px;
  border-radius: 4px;
  border: 1px dashed var(--pborder);
  background: transparent;
  color: var(--muted);
  cursor: pointer;
  letter-spacing: 0.5px;
  transition: color 0.12s, border-color 0.12s, background 0.12s;
}

.page-tab-add:hover {
  color: var(--cy);
  border-color: rgba(0,229,255,0.4);
  background: rgba(0,229,255,0.04);
}

.add-panel-btn {
  font-size: 14px;
  font-family: inherit;
  letter-spacing: 1px;
  color: var(--muted);
  background: rgba(0,229,255,0.02);
  border: 1px dashed var(--pborder);
  border-radius: 6px;
  cursor: pointer;
  min-height: 100px;
  transition: color 0.12s, border-color 0.12s, background 0.12s;
  display: flex;
  align-items: center;
  justify-content: center;
}

.add-panel-btn:hover {
  color: var(--cy);
  border-color: rgba(0,229,255,0.4);
  background: rgba(0,229,255,0.05);
}

.slot-remove-btn {
  position: absolute;
  top: 8px;
  right: 10px;
  font-size: 12px;
  color: var(--muted);
  background: rgba(2,9,18,0.7);
  border: 1px solid transparent;
  border-radius: 3px;
  cursor: pointer;
  padding: 2px 6px;
  z-index: 3;
  line-height: 1;
  transition: color 0.1s, background 0.1s;
}

.slot-remove-btn:hover {
  color: var(--red);
  background: rgba(244,63,94,0.1);
  border-color: rgba(244,63,94,0.25);
}

/* ============================================================
   HISTORY GALLERY
   ============================================================ */
.hist-gallery {
  flex-shrink: 0;
  margin-top: 16px;
}

.hist-count {
  font-size: 11px;
  color: var(--muted);
  margin-left: 6px;
}

.hist-empty {
  font-size: 14px;
  color: var(--muted);
  text-align: center;
  padding: 20px 0;
  letter-spacing: 0.5px;
}

.hist-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(120px, 1fr));
  gap: 10px;
}

.hist-item {
  position: relative;
  border: 1px solid var(--pborder);
  border-radius: 6px;
  overflow: hidden;
  cursor: pointer;
  transition: border-color 0.15s, box-shadow 0.15s;
  background: rgba(0,229,255,0.02);
}

.hist-item:hover {
  border-color: rgba(0,229,255,0.4);
  box-shadow: 0 0 10px rgba(0,229,255,0.1);
}

.hist-thumb-wrap {
  position: relative;
  width: 100%;
  aspect-ratio: 1;
  overflow: hidden;
}

.hist-thumb {
  display: block;
  width: 100%;
  height: 100%;
  object-fit: cover;
}

.hist-time {
  position: absolute;
  bottom: 4px;
  right: 6px;
  font-size: 10px;
  color: var(--text2);
  background: rgba(2,9,18,0.75);
  padding: 1px 5px;
  border-radius: 3px;
  letter-spacing: 0.5px;
}

.hist-actions {
  display: flex;
  align-items: center;
  gap: 2px;
  padding: 5px 5px;
  background: rgba(2,9,18,0.55);
  overflow: hidden;
}

.ha-btn {
  font-size: 12px;
  font-family: inherit;
  padding: 2px 5px;
  border-radius: 3px;
  cursor: pointer;
  transition: background 0.1s, color 0.1s;
  border: 1px solid transparent;
  background: transparent;
  flex-shrink: 0;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-width: 22px;
  height: 22px;
}

.ha-preview { color: var(--cy); border-color: rgba(0,229,255,0.2); }
.ha-preview:hover { background: rgba(0,229,255,0.15); }

.ha-regen { color: var(--pu); border-color: rgba(168,85,247,0.2); }
.ha-regen:hover { background: rgba(168,85,247,0.15); }
.ha-regen:disabled { opacity: 0.35; cursor: not-allowed; }

.ha-panel { color: var(--text2); border-color: rgba(255,255,255,0.1); }
.ha-panel:hover { background: rgba(255,255,255,0.08); color: var(--cy); }

.ha-del { color: var(--muted); }
.ha-del:hover { color: var(--red); }

.ha-sep {
  width: 1px;
  height: 14px;
  background: var(--pborder);
  flex-shrink: 0;
  margin: 0 2px;
}

/* ============================================================
   SPINNER / ANIMATIONS
   ============================================================ */
.spinner {
  width: 22px;
  height: 22px;
  border: 2px solid var(--cy-dim);
  border-top-color: var(--cy);
  border-radius: 50%;
  animation: spin 0.8s linear infinite;
}

.spinner.sm {
  width: 16px;
  height: 16px;
  border-width: 1.5px;
}

@keyframes spin {
  to { transform: rotate(360deg); }
}

@keyframes bounce {
  0%, 100% { transform: translateY(0);    opacity: 0.6; }
  50%       { transform: translateY(-5px); opacity: 1; }
}

/* ============================================================
   IMPORT BANNERS
   ============================================================ */
.manga-import-banner,
.diary-import-banner {
  position: fixed;
  top: 56px;
  left: 50%;
  transform: translateX(-50%);
  padding: 7px 22px;
  border-radius: 6px;
  font-size: 12px;
  letter-spacing: 1.2px;
  font-weight: 600;
  z-index: 300;
  pointer-events: none;
  white-space: nowrap;
}

.manga-import-banner {
  background: rgba(168,85,247,0.1);
  border: 1px solid rgba(168,85,247,0.45);
  color: var(--pu);
}

.diary-import-banner {
  background: rgba(52,211,153,0.08);
  border: 1px solid rgba(52,211,153,0.4);
  color: #34d399;
}

.yaml-import-banner {
  background: rgba(0,229,255,0.07);
  border: 1px solid rgba(0,229,255,0.4);
  color: #00e5ff;
}

/* ============================================================
   ONE PANEL PRO MODE
   ============================================================ */
.pro-panel {
  flex-shrink: 0;
  border-color: rgba(168,85,247,0.2);
  background: rgba(168,85,247,0.025);
  transition: border-color 0.2s, background 0.2s;
}
.pro-panel.pro-active {
  border-color: rgba(168,85,247,0.45);
  background: rgba(168,85,247,0.04);
  box-shadow: 0 0 20px rgba(168,85,247,0.08) inset;
}

.pro-hd { user-select: none; }

.pro-hex {
  color: var(--pu);
  font-size: 10px;
  opacity: 0.8;
}

.pro-label {
  color: var(--pu) !important;
  letter-spacing: 2px;
}

.pro-on-badge {
  font-size: 8px;
  letter-spacing: 2px;
  font-weight: 700;
  color: var(--pu);
  background: rgba(168,85,247,0.15);
  border: 1px solid rgba(168,85,247,0.4);
  border-radius: 3px;
  padding: 1px 6px;
  animation: pro-pulse 2s ease-in-out infinite;
}
@keyframes pro-pulse {
  0%, 100% { opacity: 1; }
  50%       { opacity: 0.6; }
}

.pro-body {
  display: flex;
  flex-direction: column;
  gap: 12px;
  padding: 12px;
}

.pro-section {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.pro-section-hd {
  font-size: 9px;
  letter-spacing: 2px;
  color: rgba(168,85,247,0.7);
  font-weight: 700;
  padding-bottom: 2px;
  border-bottom: 1px solid rgba(168,85,247,0.12);
}

.pro-chips {
  display: flex;
  flex-wrap: wrap;
  gap: 5px;
}

.pro-chip {
  font-size: 10px;
  letter-spacing: 0.8px;
  font-family: inherit;
  padding: 4px 9px;
  border-radius: 3px;
  border: 1px solid rgba(168,85,247,0.2);
  background: rgba(168,85,247,0.04);
  color: var(--text2);
  cursor: pointer;
  transition: color 0.12s, background 0.12s, border-color 0.12s, box-shadow 0.12s;
  line-height: 1.3;
}
.pro-chip:hover {
  color: var(--pu);
  border-color: rgba(168,85,247,0.45);
  background: rgba(168,85,247,0.1);
}
.pro-chip.active {
  color: var(--pu);
  background: rgba(168,85,247,0.18);
  border-color: rgba(168,85,247,0.7);
  box-shadow: 0 0 8px rgba(168,85,247,0.25);
  font-weight: 600;
}

/* Style chips use gold accent, lighting chips use amber */
.pro-chip-style.active {
  color: var(--gold);
  background: rgba(251,191,36,0.12);
  border-color: rgba(251,191,36,0.5);
  box-shadow: 0 0 8px rgba(251,191,36,0.18);
}
.pro-chip-style:hover {
  color: var(--gold);
  border-color: rgba(251,191,36,0.4);
  background: rgba(251,191,36,0.07);
}
.pro-chip-light.active {
  color: #fb923c;
  background: rgba(251,146,60,0.12);
  border-color: rgba(251,146,60,0.5);
  box-shadow: 0 0 8px rgba(251,146,60,0.18);
}
.pro-chip-light:hover {
  color: #fb923c;
  border-color: rgba(251,146,60,0.4);
  background: rgba(251,146,60,0.07);
}

.pro-preview {
  border: 1px solid rgba(168,85,247,0.18);
  border-radius: 4px;
  background: rgba(168,85,247,0.04);
  overflow: hidden;
}
.pro-preview-hd {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 5px 9px;
  border-bottom: 1px solid rgba(168,85,247,0.12);
  background: rgba(168,85,247,0.06);
}
.pro-preview-lbl {
  font-size: 8px;
  letter-spacing: 2px;
  color: rgba(168,85,247,0.7);
  font-weight: 700;
}
.pro-tag-count {
  font-size: 9px;
  color: var(--muted);
  letter-spacing: 0.5px;
}
.pro-preview-text {
  padding: 8px 9px;
  font-size: 10px;
  color: var(--text2);
  line-height: 1.6;
  letter-spacing: 0.3px;
  word-break: break-all;
  max-height: 90px;
  overflow-y: auto;
  scrollbar-width: thin;
  scrollbar-color: var(--dim) transparent;
}

.pro-gen-btn {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  width: 100%;
  padding: 10px 16px;
  background: rgba(168,85,247,0.1);
  border: 1px solid rgba(168,85,247,0.35);
  border-radius: 5px;
  color: var(--pu);
  font-size: 12px;
  font-weight: 700;
  letter-spacing: 2px;
  font-family: inherit;
  cursor: pointer;
  transition: background 0.15s, border-color 0.15s, box-shadow 0.15s, color 0.15s;
}
.pro-gen-btn:hover:not(:disabled) {
  background: rgba(168,85,247,0.2);
  border-color: rgba(168,85,247,0.65);
  box-shadow: 0 0 18px rgba(168,85,247,0.3);
  color: #c084fc;
}
.pro-gen-btn:disabled {
  opacity: 0.35;
  cursor: not-allowed;
}
.pro-gen-btn.generating {
  color: var(--cy);
  border-color: rgba(0,229,255,0.3);
  background: rgba(0,229,255,0.05);
  cursor: not-allowed;
}

/* ── Pro Presets ─────────────────────────────────────────── */
.pro-preset-list {
  display: flex;
  flex-wrap: wrap;
  gap: 5px;
}

.pro-preset-item {
  display: flex;
  align-items: center;
  gap: 0;
  border-radius: 4px;
  overflow: hidden;
  border: 1px solid rgba(0,229,255,0.2);
  background: rgba(0,229,255,0.04);
  transition: border-color 0.15s, box-shadow 0.15s;
}
.pro-preset-item:hover {
  border-color: rgba(0,229,255,0.45);
  box-shadow: 0 0 8px rgba(0,229,255,0.12);
}
.pro-preset-item.is-default {
  border-color: rgba(168,85,247,0.2);
  background: rgba(168,85,247,0.04);
}
.pro-preset-item.is-default:hover {
  border-color: rgba(168,85,247,0.5);
  box-shadow: 0 0 8px rgba(168,85,247,0.15);
}

.pro-preset-btn {
  font-size: 10px;
  letter-spacing: 0.8px;
  font-family: inherit;
  font-weight: 600;
  padding: 4px 10px;
  background: transparent;
  border: none;
  color: var(--cy);
  cursor: pointer;
  transition: color 0.12s, background 0.12s;
  white-space: nowrap;
  line-height: 1.3;
}
.pro-preset-item.is-default .pro-preset-btn {
  color: var(--pu);
}
.pro-preset-btn:hover {
  background: rgba(0,229,255,0.08);
}
.pro-preset-item.is-default .pro-preset-btn:hover {
  background: rgba(168,85,247,0.1);
}

.pro-preset-del {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 22px;
  height: 100%;
  min-height: 26px;
  background: transparent;
  border: none;
  border-left: 1px solid rgba(0,229,255,0.15);
  color: var(--muted);
  font-size: 9px;
  cursor: pointer;
  transition: color 0.12s, background 0.12s;
  flex-shrink: 0;
}
.pro-preset-del:hover {
  color: #f87171;
  background: rgba(248,113,113,0.1);
}

.pro-preset-save-row {
  display: flex;
  gap: 6px;
  margin-top: 6px;
}

.pro-preset-name-input {
  flex: 1;
  background: rgba(0,229,255,0.04);
  border: 1px solid rgba(0,229,255,0.18);
  border-radius: 3px;
  color: var(--text);
  font-size: 11px;
  font-family: inherit;
  padding: 5px 8px;
  outline: none;
  transition: border-color 0.15s;
  min-width: 0;
}
.pro-preset-name-input:focus {
  border-color: rgba(0,229,255,0.4);
  box-shadow: 0 0 6px rgba(0,229,255,0.08);
}
.pro-preset-name-input::placeholder { color: var(--muted); font-size: 10px; }

.pro-preset-save-btn {
  font-size: 10px;
  letter-spacing: 1.2px;
  font-family: inherit;
  font-weight: 700;
  padding: 5px 12px;
  border-radius: 3px;
  border: 1px solid rgba(0,229,255,0.3);
  background: rgba(0,229,255,0.07);
  color: var(--cy);
  cursor: pointer;
  flex-shrink: 0;
  transition: background 0.12s, border-color 0.12s, box-shadow 0.12s;
}
.pro-preset-save-btn:hover:not(:disabled) {
  background: rgba(0,229,255,0.14);
  border-color: rgba(0,229,255,0.55);
  box-shadow: 0 0 8px rgba(0,229,255,0.18);
}
.pro-preset-save-btn:disabled {
  opacity: 0.3;
  cursor: not-allowed;
}

/* ============================================================
   DIARY PANEL (current entry + mood + generate)
   ============================================================ */
.diary-panel {
  flex-shrink: 0;
  border-color: rgba(52,211,153,0.3);
  background: rgba(52,211,153,0.03);
}

.diary-label {
  color: #34d399 !important;
}

.diary-date-badge {
  font-size: 9px;
  letter-spacing: 1px;
  color: rgba(52,211,153,0.7);
  background: rgba(52,211,153,0.08);
  border: 1px solid rgba(52,211,153,0.2);
  border-radius: 3px;
  padding: 1px 7px;
  margin-left: 4px;
}

.diary-text {
  font-size: 12px;
  line-height: 1.75;
  color: var(--text2);
  padding: 6px 2px 4px;
  white-space: pre-wrap;
  word-break: break-all;
}

/* Mood selector */
.mood-row {
  display: flex;
  align-items: center;
  gap: 5px;
  flex-wrap: wrap;
  padding: 6px 0 2px;
  border-top: 1px solid rgba(52,211,153,0.1);
}

.mood-lbl {
  font-size: 9px;
  letter-spacing: 1.5px;
  color: rgba(52,211,153,0.55);
  flex-shrink: 0;
  margin-right: 2px;
}

.mood-chip {
  padding: 2px 8px;
  font-size: 10px;
  font-family: inherit;
  letter-spacing: 0.5px;
  color: var(--muted);
  background: transparent;
  border: 1px solid var(--pborder);
  border-radius: 3px;
  cursor: pointer;
  transition: color 0.15s, background 0.15s, border-color 0.15s, box-shadow 0.15s;
}

.mood-chip:hover {
  color: var(--mc, #34d399);
  border-color: var(--mc, #34d399);
  background: color-mix(in srgb, var(--mc, #34d399) 8%, transparent);
}

.mood-chip.active {
  color: var(--mc, #34d399);
  background: color-mix(in srgb, var(--mc, #34d399) 12%, transparent);
  border-color: var(--mc, #34d399);
  box-shadow: 0 0 6px color-mix(in srgb, var(--mc, #34d399) 30%, transparent);
}

/* Diary generate button */
.diary-gen-btn {
  width: 100%;
  height: 40px;
  margin-top: 8px;
  padding: 0 16px;
  font-size: 13px;
  font-family: inherit;
  letter-spacing: 1.5px;
  font-weight: 700;
  color: #34d399;
  background: rgba(52,211,153,0.06);
  border: 1px solid rgba(52,211,153,0.4);
  border-radius: 6px;
  cursor: pointer;
  transition: background 0.15s, box-shadow 0.15s;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  flex-shrink: 0;
}

.diary-gen-btn:hover:not(:disabled) {
  background: rgba(52,211,153,0.12);
  box-shadow: 0 0 14px rgba(52,211,153,0.2);
}

.diary-gen-btn:disabled {
  opacity: 0.35;
  cursor: not-allowed;
}

.diary-gen-btn.generating {
  color: var(--pu);
  border-color: rgba(168,85,247,0.4);
  background: rgba(168,85,247,0.06);
}

/* ============================================================
   DIARY HISTORY PANEL
   ============================================================ */
.dh-panel {
  flex-shrink: 0;
  margin-top: 12px;
}

.dh-empty {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 8px;
  padding: 20px 0 12px;
  color: var(--muted);
  font-size: 12px;
  letter-spacing: 0.5px;
}

.dh-empty-icon {
  font-size: 22px;
  opacity: 0.4;
}

.dh-list {
  display: flex;
  flex-direction: column;
  gap: 6px;
  padding-top: 6px;
}

.dh-card {
  display: flex;
  gap: 10px;
  align-items: flex-start;
  padding: 8px 10px;
  border: 1px solid var(--pborder);
  border-radius: 6px;
  background: rgba(0,229,255,0.02);
  cursor: pointer;
  transition: border-color 0.15s, background 0.15s;
  position: relative;
}

.dh-card:hover {
  border-color: rgba(52,211,153,0.35);
  background: rgba(52,211,153,0.03);
}

.dh-card.active {
  border-color: rgba(52,211,153,0.5);
  background: rgba(52,211,153,0.05);
  box-shadow: 0 0 8px rgba(52,211,153,0.1);
}

.dh-card-thumb {
  flex-shrink: 0;
  width: 56px;
  height: 56px;
  border-radius: 4px;
  overflow: hidden;
  border: 1px solid var(--pborder);
  background: rgba(0,5,18,0.6);
}

.dh-thumb-img {
  width: 100%;
  height: 100%;
  object-fit: cover;
  display: block;
}

.dh-no-thumb {
  width: 100%;
  height: 100%;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 18px;
  opacity: 0.3;
}

.dh-card-body {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 5px;
}

.dh-card-meta {
  display: flex;
  align-items: center;
  gap: 6px;
  flex-wrap: wrap;
}

.dh-date {
  font-size: 10px;
  letter-spacing: 0.8px;
  color: var(--text2);
}

.dh-mood-badge {
  font-size: 9px;
  letter-spacing: 0.5px;
  padding: 1px 6px;
  border-radius: 3px;
  color: var(--mc, #34d399);
  background: color-mix(in srgb, var(--mc, #34d399) 10%, transparent);
  border: 1px solid color-mix(in srgb, var(--mc, #34d399) 25%, transparent);
}

.dh-excerpt {
  font-size: 11px;
  line-height: 1.5;
  color: var(--muted);
  word-break: break-all;
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
}

.dh-del-btn {
  position: absolute;
  top: 6px;
  right: 6px;
  font-size: 9px;
  color: var(--muted);
  background: transparent;
  border: none;
  cursor: pointer;
  padding: 2px 4px;
  border-radius: 2px;
  line-height: 1;
  transition: color 0.12s, background 0.12s;
  opacity: 0;
}

.dh-card:hover .dh-del-btn {
  opacity: 1;
}

.dh-del-btn:hover {
  color: rgba(244,63,94,0.9);
  background: rgba(244,63,94,0.1);
}

/* ============================================================
   CHARACTER ASSET SYSTEM
   ============================================================ */
.assets-panel {
  flex-shrink: 0;
}

.assets-hd-right {
  display: flex;
  align-items: center;
  gap: 6px;
}

.atab-bar {
  display: flex;
  gap: 2px;
}

.atab {
  padding: 2px 7px;
  font-size: 10px;
  font-family: inherit;
  letter-spacing: 0.8px;
  font-weight: 600;
  color: var(--text2);
  background: transparent;
  border: 1px solid var(--pborder);
  border-radius: 4px;
  cursor: pointer;
  transition: background 0.12s, color 0.12s, border-color 0.12s;
}

.atab:hover {
  color: var(--cy);
  border-color: rgba(0,229,255,0.3);
}

.atab.active {
  color: var(--cy);
  background: rgba(0,229,255,0.08);
  border-color: rgba(0,229,255,0.45);
}

.asset-loading,
.asset-hint {
  font-size: 12px;
  color: var(--muted);
  padding: 10px 4px;
  letter-spacing: 0.5px;
}

.asset-content {
  display: flex;
  flex-direction: column;
  gap: 8px;
  padding: 8px 0 4px;
}

.asset-section-lbl {
  font-size: 10px;
  letter-spacing: 1px;
  color: var(--muted);
  text-transform: uppercase;
}

.asset-grid {
  display: flex;
  flex-wrap: wrap;
  gap: 5px;
}

.asset-chip {
  padding: 3px 10px;
  font-size: 11px;
  font-family: inherit;
  letter-spacing: 0.6px;
  color: var(--text2);
  background: rgba(168,85,247,0.05);
  border: 1px solid rgba(168,85,247,0.2);
  border-radius: 4px;
  cursor: pointer;
  transition: background 0.12s, color 0.12s, border-color 0.12s;
}

.asset-chip:hover {
  color: var(--pu);
  background: rgba(168,85,247,0.12);
  border-color: rgba(168,85,247,0.45);
}

.asset-chip.selected {
  color: var(--cy);
  background: rgba(0,229,255,0.08);
  border-color: rgba(0,229,255,0.5);
}

.char-prompt-preview {
  font-size: 10px;
  color: var(--muted);
  background: rgba(0,229,255,0.03);
  border: 1px solid rgba(0,229,255,0.1);
  border-radius: 4px;
  padding: 5px 8px;
  line-height: 1.5;
  letter-spacing: 0.3px;
}

/* ============================================================
   REFERENCE IMAGE SYSTEM
   ============================================================ */
.ref-panel {
  /* inherits .panel base styles */
}

.ref-active-badge {
  font-size: 8px;
  letter-spacing: 1.5px;
  color: var(--cy);
  background: rgba(0,229,255,0.1);
  border: 1px solid rgba(0,229,255,0.3);
  border-radius: 3px;
  padding: 1px 6px;
  margin-left: 6px;
  animation: pulse-ref 2s ease-in-out infinite;
}

@keyframes pulse-ref {
  0%, 100% { opacity: 0.7; }
  50%       { opacity: 1;   }
}

.ref-slots {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 10px;
  padding: 8px 0 4px;
}

.ref-slot {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.ref-slot-hd {
  display: flex;
  align-items: center;
  justify-content: space-between;
}

.ref-slot-label {
  font-size: 9px;
  letter-spacing: 2px;
  color: var(--cy);
  opacity: 0.65;
}

.ref-clear-btn {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 28px;
  height: 28px;
  min-width: 28px;
  flex-shrink: 0;
  background: rgba(255,255,255,0.04);
  border: 1px solid rgba(255,255,255,0.1);
  border-radius: 4px;
  color: rgba(255,255,255,0.5);
  font-size: 12px;
  font-weight: 700;
  cursor: pointer;
  line-height: 1;
  transition: color 0.15s, background 0.15s, border-color 0.15s, box-shadow 0.15s;
}
.ref-clear-btn:hover {
  color: #f87171;
  background: rgba(248,113,113,0.12);
  border-color: rgba(248,113,113,0.4);
  box-shadow: 0 0 6px rgba(248,113,113,0.2);
}

.ref-thumb-wrap {
  width: 100%;
  aspect-ratio: 1;
  overflow: hidden;
  border-radius: 4px;
  border: 1px solid rgba(0,229,255,0.18);
  background: var(--bg2);
}

.ref-thumb {
  width: 100%;
  height: 100%;
  object-fit: cover;
  display: block;
}

.ref-fname {
  font-size: 8.5px;
  color: var(--muted);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  letter-spacing: 0.3px;
}

.ref-label-input {
  width: 100%;
  box-sizing: border-box;
  background: rgba(0,229,255,0.04);
  border: 1px solid rgba(0,229,255,0.15);
  border-radius: 4px;
  color: var(--text);
  font-family: inherit;
  font-size: 10px;
  padding: 4px 6px;
  outline: none;
  resize: none;
  transition: border-color 0.15s;
}
.ref-label-input:focus {
  border-color: rgba(0,229,255,0.45);
  background: rgba(0,229,255,0.07);
}
.ref-label-input::placeholder { color: var(--muted); opacity: 0.7; }

.ref-upload-area {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 5px;
  width: 100%;
  aspect-ratio: 1;
  border: 1px dashed rgba(0,229,255,0.22);
  border-radius: 4px;
  background: rgba(0,229,255,0.02);
  cursor: pointer;
  transition: background 0.15s, border-color 0.15s;
}
.ref-upload-area:hover {
  background: rgba(0,229,255,0.07);
  border-color: rgba(0,229,255,0.45);
}

.ref-upload-icon {
  font-size: 20px;
  color: rgba(0,229,255,0.35);
  line-height: 1;
}

.ref-upload-hint {
  font-size: 9px;
  color: var(--muted);
  letter-spacing: 0.5px;
  text-align: center;
}

.ref-inject-preview {
  display: flex;
  gap: 6px;
  align-items: flex-start;
  margin-top: 6px;
  padding: 5px 8px;
  background: rgba(0,229,255,0.03);
  border: 1px solid rgba(0,229,255,0.1);
  border-radius: 4px;
}

.ref-inject-lbl {
  font-size: 9px;
  letter-spacing: 1px;
  color: var(--cy);
  opacity: 0.6;
  flex-shrink: 0;
  padding-top: 1px;
}

.ref-inject-text {
  font-size: 9.5px;
  color: var(--text2);
  line-height: 1.5;
  word-break: break-all;
}

.preview-img {
  width: 100%;
  height: auto;
  object-fit: contain;
  display: block;
}

.preview-area {
  max-height: 600px;
  overflow: auto;
}

.preview-panel {
  height: auto !important;
}

.preview-area {
  max-height: none !important;
}

.preview-img {
  max-height: none !important;
}

.preview-panel {
  width: 100%;
}

.preview-area {
  width: 100%;
  overflow: auto;
}

.preview-img {
  width: 100%;
  min-width: 600px; /* ←これが重要 */
}

/* =========================
   PREVIEW 完全修正版
========================= */

/* 親パネル制限解除 */
.preview-panel,
.panel.preview-panel {
  height: auto !important;
  width: 100%;
}

/* プレビューエリア（高さ制限解除＆スクロール対応） */
.preview-area {
  width: 100%;
  height: auto;
  max-height: none;          /* ← これが超重要 */
  overflow-x: auto;          /* 横スクロール */
  overflow-y: auto;          /* 縦スクロール */
  display: flex;
  justify-content: center;
  align-items: flex-start;
}

/* 画像本体 */
.preview-img {
  display: block;
  width: 100%;
  height: auto;
  object-fit: contain;
  max-width: 100%;
  min-width: 600px;          /* ← 小さく潰れ防止（必要なら調整） */
}

/* さらに外側の制限を潰す（ラスボス対策） */
.col-left,
.panel {
  height: auto !important;
  overflow: visible !important;
}

</style>
