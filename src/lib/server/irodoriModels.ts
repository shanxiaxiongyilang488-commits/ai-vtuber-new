import { existsSync, readdirSync } from 'node:fs';
import path from 'node:path';

export type VoiceEngineId = 'irodori-tts' | 'kizuna-voice-designer';

export type VoiceModelOption = {
  id: string;
  label: string;
  source: 'default' | 'env' | 'local';
  path?: string;
  note?: string;
};

export type VoiceModelGroup = {
  id: VoiceEngineId;
  label: string;
  models: VoiceModelOption[];
};

const DEFAULT_IRODORI_ROOT = 'E:\\Irodori-TTS\\Irodori-TTS';
const DEFAULT_LOCAL_V4_INT8 =
  'E:\\AI-Local-Models\\Irodori-v4-int8\\model.safetensors';
const DEFAULT_TTS_MODEL = 'Aratako/Irodori-TTS-v4-Small';
const DEFAULT_VOICE_DESIGN_MODEL = 'Aratako/Irodori-TTS-v4-Small';
const V4_INT4_VOICE_DESIGN_MODEL =
  'Aratako/Irodori-TTS-v4-Small-Quantized/int4-weight-only';

const KNOWN_TTS_MODELS = [DEFAULT_TTS_MODEL];
const KNOWN_VOICE_DESIGN_MODELS: VoiceModelOption[] = [
  {
    id: DEFAULT_VOICE_DESIGN_MODEL,
    label: 'Irodori-TTS-v4-Small (Latest)',
    source: 'default',
    note: 'Latest unified VoiceDesign model. Works on CPU or GPU and predicts duration automatically.',
  },
  {
    id: V4_INT4_VOICE_DESIGN_MODEL,
    label: 'Irodori-TTS-v4-Small INT4 (Lightest / RTX)',
    source: 'default',
    note: 'Smallest official checkpoint (813 MiB). Requires NVIDIA Ampere or newer; RTX 5070 is supported.',
  },
  {
    id: 'Aratako/Irodori-TTS-600M-v3-VoiceDesign',
    label: 'Irodori-TTS-600M-v3-VoiceDesign (Legacy stable)',
    source: 'default',
    note: 'Previous VoiceDesign model. Smaller than v4, but with weaker text and caption understanding.',
  },
  {
    id: 'Aratako/Irodori-TTS-500M-v2-VoiceDesign',
    label: 'Irodori-TTS-500M-v2-VoiceDesign (Legacy smallest CPU)',
    source: 'default',
    note: 'Older caption-only model. Lowest parameter count among the CPU-compatible choices.',
  },
];

const MODEL_FILE_EXTENSIONS = new Set(['.safetensors', '.pt', '.pth', '.ckpt']);
const SKIP_DIRS = new Set([
  '.git',
  '.venv',
  '__pycache__',
  'gradio_outputs',
  'gradio_outputs_voicedesign',
  'node_modules',
]);

function cleanModelId(value: string | undefined): string {
  return (value ?? '').replace(/[\uD800-\uDFFF]/g, '\uFFFD').trim();
}

function modelLabel(id: string): string {
  return id.split(/[\\/]/).filter(Boolean).pop() ?? id;
}

function addModel(models: VoiceModelOption[], model: VoiceModelOption) {
  if (!model.id || models.some((item) => item.id === model.id)) return;
  models.push(model);
}

function classifyLocalModel(filePath: string): VoiceEngineId {
  const lowered = filePath.toLowerCase();
  return lowered.includes('voice') || lowered.includes('caption') || lowered.includes('design')
    ? 'kizuna-voice-designer'
    : 'irodori-tts';
}

function scanLocalModelFiles(root: string): VoiceModelOption[] {
  const found: VoiceModelOption[] = [];
  if (!existsSync(root)) return found;

  const walk = (dir: string, depth: number) => {
    if (depth > 6) return;

    let entries;
    try {
      entries = readdirSync(dir, { withFileTypes: true });
    } catch {
      return;
    }

    for (const entry of entries) {
      const fullPath = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        if (!SKIP_DIRS.has(entry.name)) walk(fullPath, depth + 1);
        continue;
      }

      if (!entry.isFile() || !MODEL_FILE_EXTENSIONS.has(path.extname(entry.name).toLowerCase())) continue;

      const id = fullPath;
      found.push({
        id,
        label: modelLabel(id),
        source: 'local',
        path: fullPath,
      });
    }
  };

  walk(root, 0);
  return found;
}

export function resolveIrodoriRoot(env: Record<string, string | undefined>): string {
  return cleanModelId(env.IRODORI_TTS_ROOT) || DEFAULT_IRODORI_ROOT;
}

export function getVoiceModelGroups(env: Record<string, string | undefined>): VoiceModelGroup[] {
  const irodoriRoot = resolveIrodoriRoot(env);
  const ttsModels: VoiceModelOption[] = [];
  const designerModels: VoiceModelOption[] = [];

  // Prefer the verified local INT8 checkpoint even when the app was launched
  // via `npm run dev` instead of start-ai-vtuber.cmd.  This keeps downloads,
  // weights and inference caches off C: in every supported launch path.
  if (existsSync(DEFAULT_LOCAL_V4_INT8)) {
    const localV4: VoiceModelOption = {
      id: DEFAULT_LOCAL_V4_INT8,
      label: 'Irodori-TTS-v4-Small INT8 (Local E:)',
      source: 'local',
      path: DEFAULT_LOCAL_V4_INT8,
      note: 'Verified local CPU checkpoint. No model download is required.',
    };
    addModel(ttsModels, localV4);
    addModel(designerModels, localV4);
  }

  for (const id of KNOWN_TTS_MODELS) {
    addModel(ttsModels, { id, label: modelLabel(id), source: 'default' });
  }

  for (const model of KNOWN_VOICE_DESIGN_MODELS) {
    addModel(designerModels, model);
  }

  const envTtsModel = cleanModelId(env.IRODORI_TTS_CHECKPOINT || env.IRODORI_TTS_MODEL);
  if (envTtsModel && envTtsModel !== 'irodori-tts') {
    addModel(ttsModels, { id: envTtsModel, label: modelLabel(envTtsModel), source: 'env' });
  }

  const envDesignerModel = cleanModelId(env.IRODORI_VOICE_DESIGN_CHECKPOINT);
  if (envDesignerModel) {
    addModel(designerModels, { id: envDesignerModel, label: modelLabel(envDesignerModel), source: 'env' });
  }

  for (const localModel of scanLocalModelFiles(irodoriRoot)) {
    const target = classifyLocalModel(localModel.id) === 'kizuna-voice-designer' ? designerModels : ttsModels;
    addModel(target, localModel);
  }

  return [
    { id: 'irodori-tts', label: 'Irodori-TTS', models: ttsModels },
    { id: 'kizuna-voice-designer', label: 'Kizuna Voice Designer', models: designerModels },
  ];
}

export function resolveVoiceModel(
  env: Record<string, string | undefined>,
  engineId: VoiceEngineId,
  requestedModel: string | undefined,
): string {
  const group = getVoiceModelGroups(env).find((item) => item.id === engineId);
  const models = group?.models ?? [];
  const requested = cleanModelId(requestedModel);

  if (requested) {
    if (models.some((item) => item.id === requested)) return requested;
    throw new Error(`unknown model for ${group?.label ?? engineId}: ${requested}`);
  }

  const fallback = models.find((item) => item.source === 'env')?.id ?? models[0]?.id;
  if (!fallback) throw new Error(`no models detected for ${group?.label ?? engineId}`);
  return fallback;
}
