# FEATURE_INVENTORY.md

> Snapshot 2026-06-13. Status legend: ✅ working/complete · 🟡 partial/experimental · 🔴 stub/legacy/abandoned

## A. Conversation & personality

| Feature | Where | Status | Notes |
|---|---|---|---|
| Lab chat (persona AI) | `/lab`, `/api/lab-chat` | ✅ | Multi-provider, persona prompt, emotion/trust/affection state |
| Personality sliders & presets | `/lab` | ✅ | trust/affection/lonely/energy/tsundere/yandere/talkative/sleepy; save slots |
| Persona presets (5 cast members) | `lib/ai/personas`, `characterProfiles.ts` | ✅ | ミュリィ, リセア, シエル, メノア, ピオナ; android persona w/ battery system |
| Internal discussion (5-persona council) | lab-chat `character_discussion` | ✅ | Strict JSON, dialogue-only filtering |
| Night mode / short-chat / auto-talk / android battery | `/lab` toggles | ✅ | Night-mode lines stripped for non-chat routes |
| AI persona generator | `/api/persona-generator` | 🟡 | Generates custom persona profile via LLM |
| Emotion engine (server, keyword Phase 0) | `python/main.py`, `/api/emotion-py` | 🟡 | Explicitly "Phase 0"; ML upgrade planned per docstring |
| Emotion style engine / tone hints (client) | `lib/ai/emotion`, `conversationCore` | ✅ | Reply-driven emotion updates + radar chart |
| Reflection diary (daily) | `/api/reflection`, `data/reflection/` | ✅ | Summarizes day's chat; trust/affection deltas |
| Personality evolution / drift | `/api/personality-evolution`, `anniversaryMemory` | 🟡 | Rule-based daily drift |
| Multi-character discussion / radio show | `/discussion`, `/api/discussion`, `/api/radio` | 🟡 | Script-style generation (bright/midnight/news) |
| AITuber OnAir integration | `/api/onair` | 🟡 | Dynamic import of `@aituber-onair/core` — package not in package.json (runtime risk) |
| Legacy chat page(s) | `/chat`, `/ai-chat`, `/api/chat` | 🔴 | Superseded by `/lab` |
| Precheck engine | `/lab/precheck`, `precheckEngine.ts` | 🟡 | Prompt pre-validation experiments |

## B. Character Library (project mode)

| Feature | Where | Status | Notes |
|---|---|---|---|
| Character registration (image + name) | `/characters`, `POST /api/characters` | ✅ | Reference image stored as PNG |
| Character Bible (appearance YAML) | registry + lab `image_analysis` | ✅ | Vision-extracted; hand-rolled YAML codec |
| Multi-character YAML split (units) | registry | ✅ | e.g. S-22 → N-01 + N-02 |
| Per-character chat (persisted) | `/characters/[id]/chat` | ✅ | 200-message cap; Memory Core NOT engaged |
| Character Memory (personality/speech/likes/dislikes) | same page + `/api/characters/[id]/memory` | ✅ | Manual edit + LLM extraction from history |
| Story-context lookup | `/api/characters/story-context` | ✅ | Injects character profiles+memory into story generation |
| Legacy data migration | registry `ensureRoot` | ✅ | `data/characters` → `data/project/*` |
| `character_profile.json` schema | `types/characterProfile.ts` (untracked) | 🟡 | New shape, not yet wired (WIP on this branch) |

## C. Memory

| Feature | Where | Status | Notes |
|---|---|---|---|
| Short-term memory (30 msgs, file) | memory-core | ✅ | |
| Long-term shared/character memories | memory-core, `data/memory/*` | ✅ | Keyword+n-gram retrieval, importance/recency scoring |
| Remember/forget verbal triggers | memoryCore | ✅ | 「覚えて」「忘れて」 etc. |
| Auto-remember LLM classifier | memoryClassifier | 🟡 | Extra LLM call on most messages; stores raw text (noisy data observed in shared.json) |
| Trust/affection-modulated memory usage | promptBuilder | ✅ | |
| Event memory store | eventMemoryStore | 🟡 | Present; light usage |
| Legacy lab memories (localStorage) | `lib/ai/memory/*` | 🔴/🟡 | rootMemory, special, anniversary, habit, image — still used by `/lab` |
| Memory viewer / cognitive monitor | `/lab` UI | ✅ | Shows retrieved memories, deltas |
| Mobile memories (IndexedDB, client-owned) | mobile-chat | ✅ | Sent per-request to server |

## D. Image / video / story generation

| Feature | Where | Status | Notes |
|---|---|---|---|
| Image generation (multi-provider) | `/api/generate`, `/api/studio/generate` | ✅ | OpenAI gpt-image-2, FAL nano-banana(-2/pro), Flux, Ideogram, Gemini |
| Image edit / reference-image flows | studio + mediaProviders | ✅ | Ref-image pipeline with extensive logging |
| **Video generation (Kling 3 Pro I2V)** | `/api/studio/generate-video` | 🟡 | Phase 1, UI just exposed (recent commits); FAL catalog researched in docs/ |
| FAL model discovery | `/api/fal/models`, `types/falDiscovery.ts` | 🟡 | New, untracked files |
| Intent router (chat → image intent) | `intentRouter.ts`, `/api/intent-router` | ✅ | Rules + LLM classification, negative-keyword guard |
| Character-context router for image prompts | `characterContextRouter.ts` | ✅ | Resolves registered character appearance into prompts |
| YAML scene → image | `/api/yaml-image`, `yamlSceneParser.ts` | ✅ | Hand-rolled parser, 636 lines |
| Story YAML generation & continuity | lab `story_generate` route, `storyYaml.ts` | ✅ | Continuity memory extracted/re-injected |
| Story library | `/story`, `storyLibrary.ts` | ✅ | localStorage persistence |
| Manga conversion (4-koma/panels) | `/manga`, lab `convertToManga`, `storyPanelYaml.ts` | 🟡 | Panel editor, send-to-studio |
| Media usage/cost tracking | `mediaUsage.ts`, `data/media-usage.json` | 🟡 | Records images; video costs not evidently recorded |

## E. Avatar & VTuber rendering

| Feature | Where | Status | Notes |
|---|---|---|---|
| VRM avatar viewer | `AvatarViewer.svelte` (three + @pixiv/three-vrm) | ✅ | |
| PNGTuber viewer / motion PNGTuber | `PNGTuberViewer`, `MotionPNGTuberViewer`, `/pngtuber-lab` | ✅ | Sprite-based mouth/blink |
| Avatar state server (breathing/gaze/emotion) | `server/main.py`, `ws/avatarSocket.ts` | ✅ | 20 Hz WS broadcast; emotion-specific breathing curves |
| Frame extractor / mouth picker | `/frame-extractor`, `/mouth-picker`, `tools/pick_mouth.py`, `/api/pick-mouth` | ✅ | Mouth-frame selection by luminance stddev |
| Face tracking (MediaPipe) | `@mediapipe/tasks-vision` dep, `/motion-viewer` | 🟡 | Dependency present; integration appears partial |

## F. Voice / TTS

| Feature | Where | Status | Notes |
|---|---|---|---|
| Irodori TTS proxy | `/api/speak`, `lib/tts/irodori.ts`, `irodoriGradio.ts` | ✅ | Local Gradio or Colab backend, per-character voice profiles |
| Voice designer | `/voice-lab`, `/api/voice/designer` | 🟡 | Caption→voice design |
| Voice generate/models/ping | `/api/voice/*` | ✅ | |
| ElevenLabs key slot | settings | 🔴 | Key stored but no usage found |
| Mobile TTS (Web Speech) | mobile-chat | ✅ | |

## G. Platform & settings

| Feature | Where | Status | Notes |
|---|---|---|---|
| Provider settings UI + key storage | `/settings/api`, `data/settings.json` | ✅ | Keys returned to client by GET |
| API status checks | `/api/check-api-status` | ✅ | |
| Local model listing | `/api/{ollama,lmstudio,colab-ollama}-models` | ✅ | |
| Mobile chat PWA | `mobile-chat/`, `/mobile-chat`, `/api/mobile-chat/reply` | ✅ | Two copies of the UI (standalone + in-app) |
| Service worker | `src/service-worker.ts` | 🟡 | |

## H. Missing features (gaps a user would expect)

1. **No streaming responses** — every chat waits for the full completion; the 120 s Ollama timeout returns a placeholder string instead.
2. **Character Library chat has no Memory Core integration** — long-term memories collected in lab chat are invisible to library characters and vice versa; memory.json and memory-core never sync.
3. **No memory editing/browsing UI for memory-core** beyond lab's read-only viewer — bad auto-remembered entries (already present in `shared.json`) can only be removed by editing JSON or verbal 「忘れて」.
4. **No embeddings/semantic retrieval** — memory search is substring/n-gram only; recall fails for paraphrases.
5. **No character export/import/backup**, no versioning of bibles or memories.
6. **No multi-user/auth/remote deployment story** — keys go to any browser that can reach the dev server.
7. **No tests of any kind** and no CI (no test script, no framework dependency).
8. **No video cost tracking / budget guard** (image usage is tracked; Kling per-second pricing documented but not enforced).
9. **No queue/concurrency control for media generation**; no retry/backoff abstraction.
10. **No i18n layer** — UI strings mix Japanese/English ad hoc.
11. **Voice ↔ Character Library link missing** — Irodori voice profiles are keyed by free-text character name, not registry id.
12. **The two Python servers cannot run together** (both default to port 8000).
13. **README/docs** describe almost nothing of the real app (template README; only FAL research doc).
