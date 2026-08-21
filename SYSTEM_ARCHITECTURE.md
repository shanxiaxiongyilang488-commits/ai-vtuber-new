# SYSTEM_ARCHITECTURE.md

> Snapshot 2026-06-13, branch `feature/project-mode`.

## 1. High-level topology

```
┌─────────────────────────────────────────────────────────────────────┐
│ Browser (localhost:5173)                                            │
│  /lab  /characters  /studio  /story  /voice  /settings  /mobile-chat│
│  - Svelte 5 runes UI                                                │
│  - localStorage: legacy lab memory, story library, UI prefs         │
│  - IndexedDB: mobile-chat messages/memories                         │
└──────────────┬───────────────────────────────┬──────────────────────┘
               │ fetch JSON / FormData         │ WebSocket
┌──────────────▼───────────────────────────┐ ┌─▼──────────────────────┐
│ SvelteKit server (vite dev, Node)        │ │ server/main.py :8000   │
│  ~40 API endpoints under /api/*          │ │ Avatar state hub (WS)  │
│  - lab-chat (chat hub)                   │ │ 20Hz breathing/emotion │
│  - characterRegistry (fs)                │ └────────────────────────┘
│  - memory-core (fs)                      │ ┌────────────────────────┐
│  - media/image/video providers           │ │ python/main.py :8000   │
│  - settings.json (keys)                  │ │ Emotion engine (HTTP)  │
└──────┬───────────────────────────────────┘ │ keyword-based Phase 0  │
       │ HTTPS                               └────────────────────────┘
┌──────▼───────────────────────────────────────────────────────────┐
│ External providers                                               │
│  OpenAI (Responses API, gpt-image) · Gemini · Anthropic Claude   │
│  FAL (nano-banana, Flux, Kling 3 Pro video) · Ideogram           │
│  Ollama / LM Studio / Colab-Ollama (local & tunneled LLMs)       │
│  Irodori TTS (local Gradio or Colab URL)                         │
└──────────────────────────────────────────────────────────────────┘
```

All persistence is **flat JSON/YAML/PNG files under `data/`**, written synchronously with `node:fs`. No DB, no auth, no sessions — single local user assumed.

## 2. Character Library architecture

Owner module: [characterRegistry.ts](src/lib/server/characterRegistry.ts) (server-only).

### Storage layout (per character `id`, lowercase `[a-z0-9_-]+`)

```
data/project/characters/<id>.yaml          ← "Character Bible" (appearance)
data/project/character-assets/<id>/
  ├── profile.json    { id, name, role, description, image }
  ├── reference.png   reference image (stored from data-URL upload)
  ├── sheet.png       optional character sheet
  ├── chat.json       chat log (capped at 200 messages)
  └── memory.json     Character Memory (see §3)
```

### Character Bible

A fixed-schema appearance record (hair color, eye color, ears, tail, android parts, outfit, accessories, appearance) produced by **vision analysis of the reference image** (`source: character_ref_vision`, via lab-chat `image_analysis` route). YAML is serialized and parsed by **hand-written code** (`characterBibleToYaml` / `characterBibleFromYaml` — regex-based, not a YAML library). Validation requires every field non-empty.

### Lifecycle behaviors (all inside `ensureRoot()` — run on nearly every read)

1. **Legacy migration**: copies `data/characters/<id>/*` → `data/project/...` if missing.
2. **Multi-character split**: a bible YAML containing multiple characters (e.g. unit "S-22" with N-01 and N-02) is split into one YAML + asset dir per character; the source reference image is copied to each.
3. Profile read reconciles `profile.json` against `<id>.yaml` (YAML wins; embedded `characterBible` in profile.json is migrated out).

### API surface

- `GET/POST /api/characters` — list/search & register (name + reference image data-URL)
- `GET/PATCH/DELETE /api/characters/[id]` — read/update (incl. bible re-save with re-split)/delete
- `GET /api/characters/[id]/reference` — reference image as data-URL
- `GET/POST/DELETE /api/characters/[id]/chat` — persisted chat log
- `GET/PUT /api/characters/[id]/memory` — Character Memory
- `GET /api/characters/story-context` — finds characters mentioned in a story query and returns profile+memory for story generation grounding

## 3. Character Memory architecture

There are **four distinct memory systems** in the codebase. Understanding which is which is the most important orientation step.

### 3a. Character Library memory (`memory.json` per character)

Shape: `{ personality: string[], speechStyle: string[], likes: string[], dislikes: string[], updatedAt }`.
- Edited manually in the `/characters/[id]/chat` right panel, or
- Extracted by LLM ("履歴から更新"): last 80 chat messages → lab-chat with a JSON-extraction prompt → parsed → saved.
- Consumed by: the per-character system prompt (client-built) and `story-context` for story generation.

### 3b. Memory Core (`src/lib/ai/memory-core/`) — the "real" conversational memory

File-backed, server-side:

| Store | File | Notes |
|---|---|---|
| Short-term | `data/memory/short-term.json` | Last 30 messages, optional `characterId` filter |
| Long-term shared | `data/memory/shared.json` | Scope `shared` (user facts) |
| Long-term per character | `data/memory/character-<id>.json` | Scope `character` |
| Events | `data/memory/events.json` | `eventMemoryStore.ts` |

**Write path** (`recordMemoryCoreTurn`, called after every memory-enabled chat):
1. Append user+assistant turns to short-term.
2. Explicit triggers: 「覚えて/覚えておいて/remember…」 → save normalized content as a shared long-term memory (importance 4). 「忘れて…」 → delete matching shared memories.
3. **Auto-classifier** (`memoryClassifier.ts`): every other user message is sent to Gemini-or-OpenAI with a YES/NO prompt ("is this a useful personal fact?"); YES → stored automatically.

**Read path** (`buildMemoryContext`):
1. Load shared + character memories (merged with any client-supplied ones).
2. `memoryRetrieval.searchMemories`: tokenize query (incl. Japanese 3..12-char n-grams), score = term-weight×2 + tag×3 + importance×0.25 + recency×0.5 + scope bonus; threshold 12; top 5.
3. `promptBuilder.buildMemorySystemPrompt`: injects 【共有記憶】/【このキャラクターとの記憶】/【最近の会話】 blocks plus **trust/affection-conditioned instructions** (high trust → use memories proactively; low → barely reference them). A debug mode produces a retrieval-test-only prompt.

The long-term store also contains a parallel localStorage code path (`canUseLocalStorage()`), a leftover from when it ran client-side; on the server it is dead code.

### 3c. Legacy lab memory (`src/lib/ai/memory/`, localStorage, client-side)

Used only by `/lab`: rootMemory (last 20 exchanges), specialMemory, anniversaryMemory (talk-day tracking + personality drift), habitMemory (visit-hour habits), imageMemory, labChatHistory (chat persistence + localStorage→server migration helper).

### 3d. Mobile-chat memory (IndexedDB, client-side)

The PWA keeps its own short/long-term memories and **uploads them in each request** to `/api/mobile-chat/reply`, which inlines them into a single prompt string. Nothing is persisted server-side.

## 4. Character Chat architecture

### Central endpoint: `POST /api/lab-chat`

```
parseRequest (FormData with image_N files / JSON with image URLs)
  → resolve route: chat | yaml_generate | character_discussion | image_analysis | story_generate
  → readSettings() (provider + API keys from data/settings.json)
  → route-specific base system prompt
      - non-chat routes get persona-suppression preambles + night-mode line stripping
      - visionMode: 'strict' prepends a facts-only vision guard
  → buildMemoryContext(...) — memory disabled for yaml/image/story routes
  → provider dispatch:
      openai → chatOpenAI (Responses API)        gemini → chatGemini (fallback → OpenAI!)
      claude → chatClaude                        ollama/lmstudio/colab-ollama → local HTTP
  → withMemory(response):
      stripLeakedReasoning (removes <think> blocks etc.)
      character_discussion → parse strict JSON {discussion:[{speaker,text}×5], answer}
      recordMemoryCoreTurn (short-term append + remember/forget/auto-classify)
  → JSON response { text, provider, actualModel, [discussion], [memory debug] }
```

Notable details:
- **Internal discussion**: one LLM call generates a 5-persona (ミュリィ/リセア/シエル/メノア/ピオナ) "council" in strict JSON; entries failing dialogue heuristics (English text, narration markers) are rejected.
- **Gemini failover**: if Gemini fails or has no key, it silently retries with OpenAI (`failover: true` in response).
- Ollama timeout returns the literal string `'生成中...'` as the reply instead of an error.
- Three local-provider call functions exist **both** here (legacy `callOllama`/`callLMStudio`/`callColabOllama`) and in `src/lib/providers/*`; the legacy copies appear unused by the main path.

### Character Library chat (`/characters/[id]/chat`)

Thin client orchestration:
1. Page loads profile + chat log + memory via REST.
2. **System prompt is built in the browser** from name/role/description + Character Memory lists + guardrails ("don't generate Story here").
3. User message → `POST /api/characters/[id]/chat` (persist) → `POST /api/lab-chat` (route `chat`, last 12 messages as history) → reply persisted via chat POST.
4. Memory Core is *not* engaged here by default (no `memory` field, JSON path without images ⇒ `enableMemoryByDefault=false`), so Character Library chat relies on its own memory.json — the two memory systems do not feed each other.

### Lab chat (`/lab`)

The 13.7k-line page assembles a much richer prompt client-side: persona profile, personality sliders (trust/affection/lonely/energy/tsundere/yandere/talkative/sleepy), emotion-style hints, tone hints, night/android/short modes, anniversary/habit/special-memory hints, then calls lab-chat with `memory: { enabled, characterId, trust, affection … }`. Replies update emotion state, drive the avatar (WS), optionally TTS via `/api/speak`, and feed the reflection diary (`/api/reflection` → `data/reflection/<date>.json`) and personality evolution rules.

## 5. Data flow (end-to-end examples)

### Chat turn (Character Library)
```
UI → POST /api/characters/n-01/chat {user msg}      (persist)
UI → POST /api/lab-chat {systemPrompt(client-built), history}
       └→ provider API → cleaned text
UI → POST /api/characters/n-01/chat {assistant msg} (persist)
```

### Memory-enabled lab turn
```
UI → POST /api/lab-chat {memory:{enabled, characterId, trust, affection}}
   → buildMemoryContext: fs reads shared.json/character-*.json/short-term.json
   → provider call with injected memory prompt
   → recordMemoryCoreTurn: fs writes short-term.json (+ shared.json when triggered)
   → optional 2nd LLM call (auto-remember classifier)
```

### Image generation (Studio / lab intent)
```
UI (intentRouter classifies "draw …") → /api/generate or /api/studio/generate
   → mediaProviders/registry.resolveMediaModel(selectedModelId)
   → fal.ts | imageProviders/openai.ts | ideogram.ts
   → recordImageGenerationUsage → data/media-usage.json
   → images returned as URLs/data-URLs; studio attaches them to YAML panels
Video: /api/studio/generate-video → FAL Kling 3 Pro (phase 1, recently exposed)
```

### Avatar state
```
/lab UI ⇄ ws://localhost:8000/ws/avatar (server/main.py)
  server pushes {emotion, gaze, speaking, breathing} at 20 Hz
  UI/external scripts can POST /avatar/state
```

## 6. Configuration & secrets

- `data/settings.json` (gitignored, template committed): all provider keys, chat/image/media provider+model selections, voice backend (local vs Colab), Irodori voice profiles, LM Studio base URL.
- `writeSettings` merges incoming partials over current (empty strings can't erase keys).
- **`GET /api/settings` returns the full object — including raw API keys — to the browser**; the settings UI depends on this. Safe only under the localhost single-user assumption.
- `.env` is used only for `COLAB_OLLAMA_URL` / `COLAB_OLLAMA_MODEL` / Irodori TTS vars.

## 7. Design observations

- **Client-built system prompts** are the dominant pattern; the server mostly relays them. Flexible for experimentation, but prompt logic is duplicated across pages and not testable.
- **The server is stateless except for the filesystem**; concurrent writes (e.g. two chat tabs) can interleave because all fs writes are read-modify-write without locks.
- **Two character data models coexist**: registry `CharacterProfile` (+Bible) for the library, and persona/`characterProfiles.ts` for the built-in lab cast; `types/characterProfile.ts` defines a third (`character_profile.json`) shape that nothing else references yet (new, untracked — presumably the in-progress "project mode").
- Provider abstraction is clean in `src/lib/providers/*`; lab-chat and aiRouter both add their own dispatch layers on top, giving three parallel "router" implementations (`lab-chat`, `aiRouter.ts`, `intentRouter`/`aiIntentRouter`).
