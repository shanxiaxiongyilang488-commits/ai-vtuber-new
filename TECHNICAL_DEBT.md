# TECHNICAL_DEBT.md

> Snapshot 2026-06-13, branch `feature/project-mode`. Ordered by risk × cost-to-fix-later. No code was changed; this is an inventory.

## P0 — structural risks (compound daily)

### 1. Monolithic pages: `/lab` (13,717 lines) and `/studio` (10,506 lines)
Single Svelte files containing state, prompt engineering, YAML parsing, avatar control, memory orchestration, emotion logic, manga conversion, and CSS. Consequences: every feature touches the same file, merge conflicts with yourself, no reuse (studio re-implements lab-chat calls), and `svelte-check` noise hides real errors. **This is the dominant tax on all future work.** Extract by domain (chat orchestration, emotion, image flow, story/manga, avatar) into `lib/` modules first; UI decomposition can come later.

### 2. Four parallel memory systems with no synchronization
- memory-core (server files) — current
- Character Library `memory.json` — separate, never sees memory-core data
- legacy localStorage memories (`lib/ai/memory/*`) — still wired into `/lab`
- mobile-chat IndexedDB — client-owned

A fact learned in one context does not exist in the others, and each has different shapes and retention rules. Pick memory-core as the single backend and adapt the others onto it (Character Memory could become a typed view over character-scoped memories).

### 3. Memory data quality is already degrading
`data/memory/shared.json` contains duplicated entries whose title/content are entire multi-line user prompts (including image notes like `[画像1: ダウンロード (33)]`) saved twice within ~2 minutes. Causes: auto-classifier stores raw input verbatim, title=content, no dedup, no summarization, and every YES from the classifier writes importance-4 memories. Retrieval quality will decay as this grows. Needs: dedup on write, summarize-before-store, and a management UI.

### 4. No tests, no CI
Zero test files, no test runner dependency. The riskiest logic — hand-rolled YAML codecs, settings normalization (≈90 lines of legacy-alias handling), memory normalization/trigger regexes, structured-reply JSON parsing — is exactly the kind that regresses silently. Even a thin vitest layer over `characterRegistry`, `memoryRetrieval`, `settings.normalizeSettings`, and `parseStructuredChatReply` would catch most regressions.

## P1 — correctness & security

### 5. API keys exposed to the browser and merged dangerously
`GET /api/settings` returns raw keys (`openai.key`, `fal.key`, …). Fine for localhost, dangerous the moment the dev server is bound to LAN (`--host`) or tunneled — anyone reaching the port can read keys and write settings. Also `writeSettings` uses `incoming.key || current.key`, so keys can never be cleared from the UI. Minimum fix: mask keys in GET (`sk-…last4`), accept a sentinel for "unchanged", support explicit clear.

### 6. Unlocked read-modify-write file persistence
All stores (`chat.json`, `shared.json`, `short-term.json`, settings) are `readFileSync → mutate → writeFileSync`. Two concurrent requests (lab tab + character chat tab, or auto-talk timers) can drop writes or interleave. Auto-remember runs an *awaited LLM call between read and write*, widening the race window. A tiny per-file mutex/queue module would fix this wholesale.

### 7. `ensureRoot()` migration side effects on every read
`listCharacters`/`getCharacter`/`readProfile` each call `ensureRoot()`, which re-runs legacy migration **and multi-character YAML splitting** synchronously on every API hit. Besides the I/O cost, a malformed YAML can silently re-spawn split characters or resurrect deleted ones (registration recreates assets from any surviving source). Run migrations once at startup.

### 8. Hand-rolled YAML parsers/serializers (3 of them)
`characterRegistry` (regex line-matching), `yamlSceneParser.ts` (636 lines), `storyYaml.ts`/`storyPanelYaml.ts`. They handle today's exact formats but break on innocuous variations (comments, folded scalars, CRLF edge cases — note the `\r\n` already embedded in stored memory titles). Adopt `yaml` (or `js-yaml`) and keep the schemas as typed validators.

### 9. Silent provider failover and placeholder replies
- Gemini failure silently retries with OpenAI → unexpected OpenAI spend and model behavior change with only a `failover: true` flag.
- Ollama timeout returns the literal reply `'生成中...'` which is then **persisted as an assistant message and recorded into memory** as if the character said it.
- `extractReplyText` probes six response shapes and returns `''` on mismatch — empty replies surface as user-facing errors far from the cause.

### 10. `@aituber-onair/core` is dynamically imported but not in `package.json`
`/api/onair` will throw at runtime unless the package is installed globally/transitively. Either add the dependency or delete the endpoint.

## P2 — duplication & dead code

| Duplication | Details |
|---|---|
| Provider call layers ×3 | `lib/providers/*` (current) vs legacy `callOllama`/`callLMStudio`/`callColabOllama` inside lab-chat (apparently unused) vs `aiRouter.ts`'s own OpenAI/Gemini/Claude fetchers |
| Chat endpoints ×2 | `/api/lab-chat` vs `/api/chat` (older muryi-specific flow) |
| `buildCharacterPrompt` ×2 | `lib/ai/prompts/` and `lib/personality/` (same filename, different code) |
| `CharacterCard.svelte` ×2 | `lib/components/` and `lib/components/chat/` |
| Mobile chat UI ×2 | standalone `mobile-chat/` app and in-app `/mobile-chat` route + `lib/mobile-chat/*` |
| Character profile types ×3 | registry `CharacterProfile`, `types/characterProfile.ts` (new, unwired), `ai/characters/characterProfiles.ts` |
| localStorage branches in server code | `longTermMemoryStore.canUseLocalStorage()` — dead on server, misleading |
| Orphans | `ai-vtuber-new/` (single file), `src/routes/_backup/homepage_v1.svelte`, `/test` route, `server/main.py` vs `python/main.py` port collision |

Per saved guidance: before deleting any of these, verify callers are rewired — several "legacy" modules (e.g. `lib/ai/memory/*`) are still imported by `/lab`.

## P3 — hygiene

- **Debug logging volume**: lab-chat, registry, and media registry log full memory contents, prompts, key-presence, and reference-image pipelines on every request (`[REFERENCE_IMAGES]`, `[EDIT FLOW]`, `[MESSAGE_SYMBOLS]`…). Move behind a debug flag; logs currently include personal conversation content.
- **Personal data committed to git**: `data/reflection/*.json` (16 daily diaries summarizing private chats), `data/memory/*.json`, character chat logs, and a profile with garbled name (`n-01` → `"EW3Y FY9XZo4GdgR8Ywg0 ewzAcV0W"` — looks like corrupted/test data). Consider gitignoring `data/` runtime subdirs the way `settings.json` already is.
- **`mobile-chat/.svelte-kit/output` committed** (build artifacts in git).
- **Model-name drift**: defaults reference `gpt-5.4-mini`, `gemini-2.5-flash`, `claude-3-5-haiku-latest`, `o4` detection in `detectProvider` — provider-default logic is scattered across settings, lab-chat, aiRouter, and memoryClassifier; centralize.
- **`aiRouter.detectProvider`** falls back to OpenAI for any unknown model string (e.g. an Ollama model name passed through) — wrong provider, confusing key error.
- **README** is the default SvelteKit template; the four docs generated today are the first real documentation.
- **Settings legacy-alias swamp**: `normalizeSettings` accepts ~5 historical key spellings per field. Freeze the schema, migrate the file once, delete the aliases.
- **Cost guards**: `media-usage.json` records image generations only; Kling video at $0.112–0.196/sec has no recorded usage or budget cap. Auto-remember classifier adds one extra LLM call to nearly every chat message.

## Suggested attack order (when you decide to act)

1. Add vitest + tests for registry YAML codec, memory retrieval/normalization, settings normalization (locks behavior before refactors).
2. Single-file mutex for `data/` writes; move `ensureRoot()` migration to startup.
3. Extract lab-chat client orchestration out of `/lab/+page.svelte` into `lib/` modules (no behavior change).
4. Unify memory: route Character Library chat through memory-core; add memory management UI; dedup/summarize on write.
5. Replace hand-rolled YAML with `yaml` package behind the existing typed interfaces.
6. Mask keys in `GET /api/settings`; fix key-clear semantics.
7. Delete confirmed-dead duplicates (legacy provider calls in lab-chat, `/api/chat` if no UI references, `ai-vtuber-new/`, `_backup/`).
