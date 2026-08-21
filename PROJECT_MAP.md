# PROJECT_MAP.md

> Snapshot generated 2026-06-13 (branch `feature/project-mode`). Read-only analysis; no source files were modified.

## What this repository is

A **personal AI-VTuber / AI-character creative suite**, built as a single SvelteKit app (Svelte 5 runes + TypeScript) with two optional Python FastAPI side-servers and one standalone mobile PWA. It combines:

- An "AI Personality Lab" — chat with persona-driven AI characters (trust/affection/emotion state, memory, TTS, avatar rendering)
- A **Character Library** — register original characters (reference image + appearance "Character Bible" YAML), chat with them, grow per-character memory
- A **Studio** — image and video generation (OpenAI / FAL / Ideogram / Gemini; Kling 3 Pro video) driven by YAML scene definitions
- Story / manga generation tooling, PNGTuber utilities, voice (Irodori TTS) tooling, and a mobile chat PWA

Everything persists to local JSON files under `data/` — there is no database and no authentication (single-user, localhost design).

## Top-level layout

```
ai-vtuber/
├── package.json            SvelteKit app (vite dev) — THE main application
├── src/                    All app code (see below)
├── static/                 Static assets (frames, mouth sprites, avatars…)
├── data/                   Runtime data store (JSON/YAML/PNG) — written by the server
├── server/                 Python FastAPI: avatar state WebSocket hub (breathing/gaze/emotion @20Hz)
├── python/                 Python FastAPI: keyword-based emotion engine (Phase 0) + Irodori TTS helpers
├── tools/                  pick_mouth.py — PNGTuber mouth-frame extraction (PIL)
├── mobile-chat/            Standalone SvelteKit PWA (separate package.json; calls main app API)
├── docs/                   fal-video-models.md — FAL video model research (2026-06-12)
└── ai-vtuber-new/          Orphan: a single src/lib/ai/personas.ts (apparent abandoned restart)
```

## src/ map

### Routes (pages)

| Route | Size | Purpose |
|---|---|---|
| `/` | small | Landing page; links to `/lab` |
| `/lab` | **13,717 lines** | The AI Personality Lab — main chat UI, personality sliders, emotion radar, avatar viewers, memory viewer, reflection diary, image-gen intent routing, story/manga YAML, internal 5-persona discussion |
| `/lab/precheck` | small | Precheck engine UI (`src/lib/precheckEngine.ts`) |
| `/characters` | 350 | **Character Library** — grid of registered characters, registration modal |
| `/characters/[id]/chat` | 371 | Per-character chat + Character Memory editor panel |
| `/studio` | **10,506 lines** | Image/video generation studio (panels, YAML scenes, reference images, Kling video) |
| `/story` | 600 | Story library / YAML story viewer |
| `/manga` | 308 | Manga page viewer/converter |
| `/project` | 57 | Project-mode hub (new, WIP) |
| `/chat`, `/ai-chat`, `/discussion` | med | Older chat UIs (multi-character discussion, radio-style) |
| `/voice`, `/voice-lab` | 444 | Irodori TTS voice generation & voice designer |
| `/settings`, `/settings/api` | 910 | Provider/API-key settings UI |
| `/mobile-chat` | med | In-app copy of the mobile chat UI (`src/lib/mobile-chat/*`) |
| `/pngtuber-lab`, `/motion-viewer`, `/frame-extractor`, `/mouth-picker` | med | PNGTuber tooling (frame extraction, mouth sprite picking, motion preview) |
| `/test`, `/_backup/homepage_v1.svelte` | — | Scratch/backup |

### API endpoints (`src/routes/api/`)

| Endpoint | Role |
|---|---|
| `lab-chat` (**785 ln**) | **Central chat endpoint.** Routes: `chat`, `yaml_generate`, `character_discussion`, `image_analysis`, `story_generate`. Provider switch (OpenAI/Gemini/Claude/Ollama/LM Studio/Colab), Memory Core injection, vision images, structured-discussion JSON parsing, reasoning-leak stripping |
| `chat` (227 ln) | Older chat endpoint (muryi persona + memory core + `aiRouter.generateText`) — used by discussion-style UIs |
| `characters`, `characters/[id]`, `…/chat`, `…/memory`, `…/reference`, `characters/story-context` | Character Library CRUD, chat log persistence, memory persistence, reference image, story-context lookup |
| `generate`, `studio/generate`, `studio/generate-video`, `yaml-image`, `prompt` | Image/video generation (media provider registry, FAL Kling video, YAML scene → image) |
| `fal/models` | FAL model discovery (new, untracked) |
| `memory` (14 ln) | Thin wrapper over memory-core |
| `reflection`, `personality-evolution` | Daily reflection diary (writes `data/reflection/<date>.json`) + personality drift rules |
| `intent-router`, `persona-generator`, `emotion-py` | Intent classification for image-gen, AI persona generation, proxy to Python emotion engine |
| `speak`, `voice/*` | Irodori TTS proxy (generate, designer, models, ping) |
| `mobile-chat/reply` | Mobile PWA reply endpoint (client sends its own memories) |
| `onair`, `radio`, `discussion` | AITuber OnAir integration, radio-show script generation, multi-character discussion |
| `settings`, `check-api-status` | Settings persistence (**GET returns API keys to client**), provider status checks |
| `ollama-models`, `lmstudio-models`, `colab-ollama-models`, `lmstudio`, `gemini-image-models` | Local/remote model listing |
| `mouth-picker/*`, `pick-mouth`, `export-frames`, `stories/[id]/reference-images` | PNGTuber & story asset utilities |

### Library code (`src/lib/`)

| Area | Files | Notes |
|---|---|---|
| **Server: characters** | `server/characterRegistry.ts` (578 ln) | Single source of truth for Character Library: profiles, Character Bible YAML (hand-rolled parser/serializer), chat logs, memory, legacy migration, multi-character YAML splitting |
| **Server: settings** | `server/settings.ts` | `data/settings.json` read/write, extensive legacy-key normalization, provider key access |
| **Server: media** | `server/mediaProviders/{fal,registry}.ts`, `server/imageProviders/{openai,gemini,ideogram}.ts`, `server/mediaUsage.ts`, `server/experimental/falImageClient.ts` | Image/video provider registry + usage/cost recording |
| **Server: voice** | `server/irodoriGradio.ts`, `server/irodoriModels.ts` | Irodori TTS Gradio client |
| **Server: YAML** | `server/yamlSceneParser.ts` (636 ln) | Hand-rolled YAML scene parser for studio |
| **Memory Core** (current) | `ai/memory-core/*` (8 files) | Server-side file-backed memory: short-term (30 msgs), long-term shared/character scopes, keyword+n-gram retrieval, trust/affection prompt modulation, remember/forget triggers, LLM auto-classifier |
| **Legacy memory** | `ai/memory/*` (6 files) | localStorage-based client memory used by `/lab`: rootMemory, specialMemory, anniversaryMemory, habitMemory, imageMemory, labChatHistory |
| **Personas** | `ai/personas/*` (muryi), `ai/characters/characterProfiles.ts`, `data/pngtuber/characters.ts` | Built-in personas (ミュリィ, リセア, シエル, メノア, ピオナ) |
| **Prompting** | `ai/prompts/buildCharacterPrompt.ts`, `personality/buildCharacterPrompt.ts` (duplicate names), `ai/conversationCore/toneHints.ts`, `ai/emotion/emotionStyleEngine.ts` | Prompt construction & emotion styling |
| **Providers (chat)** | `providers/{openai,gemini,claude,ollama,lmstudio,colab,types}.ts` | Thin chat clients; OpenAI uses Responses API |
| **Routers** | `aiRouter.ts`, `intentRouter.ts`, `aiIntentRouter.ts`, `characterContextRouter.ts` | Engine routing, image-gen intent classification, character-context resolution for image prompts |
| **Story** | `storyLibrary.ts`, `storyYaml.ts`, `storyPanelYaml.ts` | Story YAML parse/serialize, continuity memory, story library (localStorage) |
| **Avatar/PNGTuber** | `components/{AvatarViewer,PNGTuberViewer,MotionPNGTuberViewer}.svelte`, `ws/avatarSocket.ts`, `components/pngtuber/*` | VRM (three-vrm), PNGTuber sprites, WebSocket to `server/main.py` |
| **Stores** | `stores/{appStore,characterStore}.svelte.ts`, `routerStateStore.ts`, `sessionStore.ts` | Svelte 5 rune stores |
| **Mobile** | `mobile-chat/{db,tts,types,id}.ts` | IndexedDB chat storage for in-app mobile UI |
| **Config** | `config/{models,mediaModels,videoModels}.ts` | Provider/model option lists |

## data/ map (runtime store)

```
data/
├── settings.json            API keys & provider config (gitignored; template committed)
├── memory/                  Memory Core: shared.json, short-term.json, events.json, character-*.json
├── project/                 CURRENT character data root
│   ├── characters/<id>.yaml          Character Bible (appearance YAML, one per character)
│   ├── character-assets/<id>/        profile.json, reference.png, chat.json, memory.json
│   └── story-assets/<story-id>/      reference-images.json, generated manga pages
├── characters/              LEGACY character root (auto-migrated by characterRegistry on read)
├── reflection/<date>.json   Daily AI reflection diaries (committed to git)
├── personality/risea.json   Personality state
├── media-usage.json         Image-gen cost tracking
└── media-model-registry.json
```

## Python services

| Service | Port | Purpose |
|---|---|---|
| `server/main.py` | 8000 | Avatar state hub: WS `/ws/avatar` broadcasting emotion/gaze/speaking/breathing at 20 Hz; REST get/post state. Emotion-dependent breathing waveform |
| `python/main.py` | 8000 (**same port — cannot run both**) | Emotion Engine Phase 0: keyword-based `analyze(text) → {emotion, confidence, delta_trust}`; proxied by `/api/emotion-py` |
| `python/irodori_tts.py`, `irodori_voice_design.py` | — | Irodori TTS helpers |

## mobile-chat/ (standalone PWA)

Separate SvelteKit project (own `package.json`). Client-side only: IndexedDB for messages and long-term memories, settings in localStorage, TTS via Web Speech. Sends `{input, settings, shortTermMessages, longTermMemories}` to the **main app's** `/api/mobile-chat/reply`, which builds a prompt and calls `aiRouter.generateReply`. Build output (`.svelte-kit/output`) is committed.

## Key entry points for a new developer

1. `src/routes/api/lab-chat/+server.ts` — how every chat request flows
2. `src/lib/server/characterRegistry.ts` — how characters are stored
3. `src/lib/ai/memory-core/memoryCore.ts` — how memory is injected & recorded
4. `src/lib/server/settings.ts` — where API keys and provider defaults come from
5. `src/routes/lab/+page.svelte` — the (very large) main UI
