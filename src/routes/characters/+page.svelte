<script lang="ts">
  import { onMount } from 'svelte';
  import CharacterLibraryCard, {
    type CharacterLibraryItem,
  } from '$lib/components/characters/CharacterLibraryCard.svelte';
  import PersonalityEngineModal from '$lib/components/characters/PersonalityEngineModal.svelte';
  import {
    VOICE_ADJUSTMENTS,
    VOICE_PERFORMANCE_CONTROLS,
    VOICE_SPEED_OPTIONS,
    VOICE_TUNING_STRENGTHS,
    DEFAULT_VOICE_PERFORMANCE,
    applyVoiceTuning,
    stripVoiceTuning,
    type VoiceAdjustmentId,
    type VoicePerformanceParameterId,
    type VoicePerformanceParameters,
    type VoiceTuningStrength,
  } from '$lib/localVoiceTuning';

  const PURUPURU_CHARACTER_IDS = new Set(['shiro', 'mike', 'n-02']);
  const VOICE_QUALITY_ADJUSTMENTS = VOICE_ADJUSTMENTS.filter((adjustment) => adjustment.category === 'voice');
  const VOICE_CHARACTER_ADJUSTMENTS = VOICE_ADJUSTMENTS.filter((adjustment) => adjustment.category === 'character');

  let characters = $state<CharacterLibraryItem[]>([]);
  let loading = $state(true);
  let errorMessage = $state('');
  let editingId = $state('');
  let busyId = $state('');
  let analysisCandidates = $state<Record<string, string>>({});

  // Personality Engine modal (CHARACTER LIBRARY CHAT button)
  type StudioProfile = { brainAI?: string; conversationAI?: string; storyCardAI?: string; motionPromptAI?: string; characterAnalysisAI?: string; intentRouterAI?: string; imageAI: string; videoAI: string; voiceAI: string; memoryEnabled: boolean; reflectionTendency?: 'quick' | 'balanced' | 'reflective' };
  let providerSettings = $state<Record<string, { provider: string; aiProfile?: StudioProfile }>>({});
  let chatModalCharacter = $state<CharacterLibraryItem | null>(null);
  let chatModalProvider = $state('GPT-5.6 Terra');
  let chatModalConversationAI = $state('INHERIT');
  let chatModalStoryCardAI = $state('INHERIT');
  let chatModalMotionPromptAI = $state('INHERIT');
  let chatModalCharacterAnalysisAI = $state('INHERIT');
  let chatModalIntentRouterAI = $state('INHERIT');
  let chatModalImageAI = $state('GPT Image');
  let chatModalVideoAI = $state('Seedance2');
  let chatModalVoiceAI = $state('Irodori');
  let chatModalMemoryEnabled = $state(true);
  let chatModalReflectionTendency = $state<'quick' | 'balanced' | 'reflective'>('balanced');
  let chatModalBusy = $state(false);
  let createOpen = $state(false);
  let newId = $state('');
  let newName = $state('');
  let newRole = $state('');
  let newDescription = $state('');
  let newImage = $state<File | null>(null);

  type LocalVoiceProposal = {
    caption: string;
    summary: string;
    reasons: string[];
    testPhrase: string;
    backend: 'ollama-vision' | 'local-visual-profile';
    model: string;
    usedImagePixels: boolean;
    notice: string;
  };

  let voiceDesignerCharacter = $state<CharacterLibraryItem | null>(null);
  let voiceProposal = $state<LocalVoiceProposal | null>(null);
  let voiceCaption = $state('');
  let voiceTestPhrase = $state('');
  let voiceCandidateAudioUrl = $state('');
  let voiceComparisonAudioUrl = $state('');
  let selectedVoiceAdjustments = $state<VoiceAdjustmentId[]>([]);
  let voiceTuningStrength = $state<VoiceTuningStrength>('medium');
  let voicePerformance = $state<VoicePerformanceParameters>({ ...DEFAULT_VOICE_PERFORMANCE });
  let voiceSpeedLevel = $state(2);
  let voiceModalBusy = $state<'' | 'analyze' | 'generate' | 'adopt'>('');
  let voiceModalMessage = $state('');
  let voiceDesignerReturnUrl = $state('');
  let voiceExecutionBackend = $state<'local' | 'runpod'>('local');
  let voiceExecutionConfigured = $state(true);

  onMount(() => {
    void initializeCharactersPage();
  });

  async function initializeCharactersPage(): Promise<void> {
    await Promise.all([loadCharacters(), loadVoiceExecutionBackend()]);
    const params = new URLSearchParams(window.location.search);
    const requestedCharacterId = params.get('voiceDesigner')?.trim().toLowerCase() ?? '';
    const requestedReturnUrl = params.get('returnTo')?.trim() ?? '';
    if (!requestedCharacterId) return;

    const requestedCharacter = characters.find((character) => character.id.toLowerCase() === requestedCharacterId);
    if (!requestedCharacter) {
      errorMessage = `音声を調整するキャラクター「${requestedCharacterId}」が見つかりません。`;
      return;
    }

    voiceDesignerReturnUrl = requestedReturnUrl.startsWith('/') && !requestedReturnUrl.startsWith('//')
      ? requestedReturnUrl
      : '';
    openLocalVoiceDesigner(requestedCharacter);
  }

  async function loadVoiceExecutionBackend(): Promise<void> {
    try {
      const response = await fetch('/api/runpod/voice-session', { cache: 'no-store' });
      const data = await response.json();
      voiceExecutionBackend = data?.selected ? 'runpod' : 'local';
      voiceExecutionConfigured = voiceExecutionBackend === 'local' || Boolean(data?.configured);
    } catch {
      voiceExecutionBackend = 'local';
      voiceExecutionConfigured = true;
    }
  }

  function voiceExecutionLabel(): string {
    return voiceExecutionBackend === 'runpod' ? 'RunPod RTX 5090 · Irodori v4' : 'ローカル Irodori v4';
  }

  async function loadCharacters(): Promise<void> {
    loading = true;
    errorMessage = '';
    try {
      const response = await fetch('/api/characters');
      const data = await response.json();
      if (!response.ok) throw new Error(data?.message ?? 'Character Libraryの読み込みに失敗しました。');
      const entries = Array.isArray(data?.characters) ? data.characters : [];
      const memoryListResponse = await fetch('/api/character-memory');
      const memoryListData = memoryListResponse.ok ? await memoryListResponse.json() : { characters: [] };
      const criticalFeaturesById = new Map<string, string[]>(
        (Array.isArray(memoryListData?.characters) ? memoryListData.characters : []).map((item: { id?: unknown; criticalFeatures?: unknown }) => [
          String(item.id ?? ''),
          Array.isArray(item.criticalFeatures) ? item.criticalFeatures.filter((value): value is string => typeof value === 'string') : [],
        ]),
      );
      characters = await Promise.all(entries.map(async (entry: CharacterLibraryItem & { hasReference?: boolean }) => {
        let imageDataUrl = '';
        if (entry.hasReference) {
          const imageResponse = await fetch(`/api/characters/${encodeURIComponent(entry.id)}/reference`);
          if (imageResponse.ok) {
            const imageData = await imageResponse.json();
            imageDataUrl = typeof imageData?.referenceImageDataUrl === 'string'
              ? imageData.referenceImageDataUrl
              : '';
          }
        }
        const criticalFeatures = criticalFeaturesById.get(entry.id) ?? [];
        return { ...entry, image: entry.image ?? '', imageDataUrl, criticalFeatures };
      }));
      void loadProviderSettings();
    } catch (error) {
      errorMessage = error instanceof Error ? error.message : String(error);
    } finally {
      loading = false;
    }
  }

  async function loadProviderSettings(): Promise<void> {
    try {
      const response = await fetch('/api/character-settings');
      if (!response.ok) return;
      const data = await response.json();
      providerSettings = data?.settings && typeof data.settings === 'object' ? data.settings : {};
    } catch {
      // Non-fatal: the modal falls back to AUTO when settings can't be loaded.
    }
  }

  function openChatModal(character: CharacterLibraryItem): void {
    chatModalCharacter = character;
    chatModalProvider = providerSettings[character.id]?.provider ?? 'GPT-5.6 Terra';
    chatModalConversationAI = providerSettings[character.id]?.aiProfile?.conversationAI ?? 'INHERIT';
    chatModalStoryCardAI = providerSettings[character.id]?.aiProfile?.storyCardAI ?? 'INHERIT';
    chatModalMotionPromptAI = providerSettings[character.id]?.aiProfile?.motionPromptAI ?? 'INHERIT';
    chatModalCharacterAnalysisAI = providerSettings[character.id]?.aiProfile?.characterAnalysisAI ?? 'INHERIT';
    chatModalIntentRouterAI = providerSettings[character.id]?.aiProfile?.intentRouterAI ?? 'INHERIT';
    chatModalImageAI = providerSettings[character.id]?.aiProfile?.imageAI ?? 'GPT Image';
    chatModalVideoAI = providerSettings[character.id]?.aiProfile?.videoAI ?? 'Seedance2';
    chatModalVoiceAI = providerSettings[character.id]?.aiProfile?.voiceAI ?? 'Irodori';
    chatModalMemoryEnabled = providerSettings[character.id]?.aiProfile?.memoryEnabled ?? true;
    chatModalReflectionTendency = providerSettings[character.id]?.aiProfile?.reflectionTendency ?? 'balanced';
  }

  async function startChat(): Promise<void> {
    const character = chatModalCharacter;
    if (!character) return;
    chatModalBusy = true;
    try {
      const response = await fetch('/api/character-settings', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ id: character.id, provider: chatModalProvider, aiProfile: { brainAI: chatModalProvider, conversationAI: chatModalConversationAI, storyCardAI: chatModalStoryCardAI, motionPromptAI: chatModalMotionPromptAI, characterAnalysisAI: chatModalCharacterAnalysisAI, intentRouterAI: chatModalIntentRouterAI, imageAI: chatModalImageAI, videoAI: chatModalVideoAI, voiceAI: chatModalVoiceAI, memoryEnabled: chatModalMemoryEnabled, reflectionTendency: chatModalReflectionTendency } }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data?.message ?? 'AI設定の保存に失敗しました。');
      providerSettings = { ...providerSettings, [character.id]: data.setting };
      window.location.href = `/character-memory?id=${encodeURIComponent(character.id)}`;
    } catch (error) {
      errorMessage = error instanceof Error ? error.message : String(error);
      chatModalBusy = false;
    }
  }

  async function createCharacter(): Promise<void> {
    if (!newId.trim() || !newName.trim()) return;
    busyId = '__new__';
    errorMessage = '';
    try {
      const form = new FormData();
      form.set('id', newId.trim());
      form.set('name', newName.trim());
      form.set('role', newRole.trim());
      form.set('description', newDescription.trim());
      if (newImage) form.set('reference', newImage);
      const response = await fetch('/api/characters', { method: 'POST', body: form });
      const data = await response.json();
      if (!response.ok) throw new Error(data?.message ?? 'キャラクター登録に失敗しました。');
      newId = '';
      newName = '';
      newRole = '';
      newDescription = '';
      newImage = null;
      createOpen = false;
      await loadCharacters();
    } catch (error) {
      errorMessage = error instanceof Error ? error.message : String(error);
    } finally {
      busyId = '';
    }
  }

  async function updateCharacter(
    id: string,
    input: Pick<CharacterLibraryItem, 'name' | 'role' | 'description'>,
  ): Promise<void> {
    busyId = id;
    errorMessage = '';
    try {
      const response = await fetch(`/api/characters/${encodeURIComponent(id)}`, {
        method: 'PUT',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(input),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data?.message ?? 'キャラクター更新に失敗しました。');
      editingId = '';
      await loadCharacters();
    } catch (error) {
      errorMessage = error instanceof Error ? error.message : String(error);
    } finally {
      busyId = '';
    }
  }

  async function deleteCharacter(id: string, name: string): Promise<void> {
    if (!window.confirm(`「${name}」(${id}) をCharacter Libraryから削除しますか？`)) return;

    busyId = id;
    errorMessage = '';
    try {
      const response = await fetch(`/api/characters/${encodeURIComponent(id)}`, {
        method: 'DELETE',
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data?.message ?? 'キャラクター削除に失敗しました。');
      if (editingId === id) editingId = '';
      await loadCharacters();
    } catch (error) {
      errorMessage = error instanceof Error ? error.message : String(error);
    } finally {
      busyId = '';
    }
  }

  async function changeImage(id: string, file: File): Promise<void> {
    busyId = id;
    errorMessage = '';
    try {
      const form = new FormData();
      form.set('reference', file);
      const response = await fetch(`/api/characters/${encodeURIComponent(id)}/reference`, {
        method: 'PUT',
        body: form,
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data?.message ?? '画像変更に失敗しました。');
      await loadCharacters();
    } catch (error) {
      errorMessage = error instanceof Error ? error.message : String(error);
    } finally {
      busyId = '';
    }
  }

  function parseVisionCharacterYaml(text: string, characterId: string) {
    const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/i)?.[1];
    const jsonText = fenced ?? text.match(/\{[\s\S]*\}/)?.[0] ?? text;
    const parsed = JSON.parse(jsonText);
    if (!Array.isArray(parsed?.characters) || parsed.characters.length === 0) {
      throw new Error('Vision解析結果にcharactersがありません。');
    }
    return {
      unitId: String(parsed.unitId || characterId.toUpperCase()),
      characters: parsed.characters.map((entry: Record<string, unknown>, index: number) => ({
        id: String(entry.id || (index === 0 ? characterId.toUpperCase() : `${characterId.toUpperCase()}-${index + 1}`)),
        hairColor: String(entry.hair_color ?? entry.hairColor ?? 'unknown'),
        eyeColor: String(entry.eye_color ?? entry.eyeColor ?? 'unknown'),
        ears: String(entry.ears ?? 'unknown'),
        tail: String(entry.tail ?? 'unknown'),
        androidParts: String(entry.android_parts ?? entry.androidParts ?? 'unknown'),
        outfit: String(entry.outfit ?? 'unknown'),
        accessories: String(entry.accessories ?? 'unknown'),
        appearance: String(entry.appearance ?? 'unknown'),
      })),
    };
  }

  async function generateCharacterYaml(character: CharacterLibraryItem): Promise<void> {
    if (!character.imageDataUrl) {
      errorMessage = 'Character Ref画像が必要です。';
      return;
    }
    busyId = character.id;
    errorMessage = '';
    try {
      const response = await fetch('/api/lab-chat', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          characterId: character.id,
          route: 'image_analysis',
          visionMode: 'strict',
          memory: { enabled: false },
          systemPrompt: [
            'Analyze only directly visible facts in the attached Character Ref image.',
            'The image is the sole source for appearance. Do not infer from the character name.',
            'Do not invent personality, favorite foods, hobbies, preferences, biography, or relationships.',
            'Return JSON only using this schema:',
            '{"unitId":"...","characters":[{"id":"...","hair_color":"...","eye_color":"...","ears":"...","tail":"...","android_parts":"...","outfit":"...","accessories":"...","appearance":"..."}]}',
            'Use "unknown" when a detail cannot be seen and "none visible" when visibly absent.',
          ].join('\n'),
          userMessage: `Analyze this Character Ref. The label ${character.id} identifies the record only and is not appearance evidence.`,
          images: [character.imageDataUrl],
        }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data?.message ?? `Vision HTTP ${response.status}`);
      const parsedBible = parseVisionCharacterYaml(String(data?.text ?? ''), character.id);
      // YAML生成は対象キャラ自身のみを更新する。Vision結果のidに関わらず、
      // 対象キャラの既存idで単一キャラとして保存し、別キャラを新規作成しない。
      const characterBible = {
        unitId: parsedBible.unitId,
        characters: [{ ...parsedBible.characters[0], id: character.id }],
      };
      const saveResponse = await fetch(`/api/characters/${encodeURIComponent(character.id)}`, {
        method: 'PUT',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ characterBible }),
      });
      const saved = await saveResponse.json();
      if (!saveResponse.ok) throw new Error(saved?.message ?? 'Character YAMLの保存に失敗しました。');
      await loadCharacters();
    } catch (error) {
      errorMessage = error instanceof Error ? error.message : String(error);
    } finally {
      busyId = '';
    }
  }

  async function analyzeResidentAsset(character: CharacterLibraryItem, category: string): Promise<void> {
    busyId = character.id;
    try {
      const response = await fetch('/api/lab-chat', {
        method: 'POST', headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          characterId: character.id,
          route: 'image_analysis',
          systemPrompt: 'Return a concise Japanese analysis candidate only. Never update a character persona, memory, or registry. Do not output YAML or technical implementation details.',
          userMessage: `${character.name} の ${category} について、住人管理用の更新候補を1〜2文で提案してください。`,
          ...(character.imageDataUrl ? { images: [character.imageDataUrl] } : {}),
        }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data?.message ?? 'AI analysis failed');
      analysisCandidates = { ...analysisCandidates, [`${character.id}:${category}`]: String(data?.text ?? data?.reply ?? '').trim() };
    } catch (error) {
      errorMessage = error instanceof Error ? error.message : String(error);
    } finally {
      busyId = '';
    }
  }

  function openLocalVoiceDesigner(character: CharacterLibraryItem): void {
    voiceDesignerCharacter = character;
    voiceProposal = null;
    voiceCaption = '';
    voiceTestPhrase = '';
    voiceCandidateAudioUrl = '';
    voiceComparisonAudioUrl = '';
    selectedVoiceAdjustments = [];
    voiceTuningStrength = 'medium';
    voicePerformance = { ...DEFAULT_VOICE_PERFORMANCE };
    voiceSpeedLevel = 2;
    voiceModalMessage = '';
    void analyzeCharacterVoice(character);
  }

  function closeLocalVoiceDesigner(): void {
    if (voiceModalBusy) return;
    const returnUrl = voiceDesignerReturnUrl;
    voiceDesignerCharacter = null;
    voiceProposal = null;
    voiceCandidateAudioUrl = '';
    voiceComparisonAudioUrl = '';
    selectedVoiceAdjustments = [];
    voicePerformance = { ...DEFAULT_VOICE_PERFORMANCE };
    voiceSpeedLevel = 2;
    voiceModalMessage = '';
    voiceDesignerReturnUrl = '';
    if (returnUrl) window.location.href = returnUrl;
  }

  function stageCurrentCandidateForComparison(): void {
    if (!voiceCandidateAudioUrl) return;
    voiceComparisonAudioUrl = voiceCandidateAudioUrl;
    voiceCandidateAudioUrl = '';
  }

  function refreshVoiceTuning(message: string): void {
    stageCurrentCandidateForComparison();
    voiceCaption = applyVoiceTuning(
      voiceCaption,
      selectedVoiceAdjustments,
      voiceTuningStrength,
      voicePerformance,
    );
    voiceModalMessage = message;
  }

  function voiceTuningIsDefault(): boolean {
    return selectedVoiceAdjustments.length === 0
      && voicePerformance.expressiveness === DEFAULT_VOICE_PERFORMANCE.expressiveness
      && voicePerformance.distance === DEFAULT_VOICE_PERFORMANCE.distance
      && voicePerformance.synthetic === DEFAULT_VOICE_PERFORMANCE.synthetic
      && voiceSpeedLevel === 2;
  }

  function toggleVoiceAdjustment(adjustmentId: VoiceAdjustmentId): void {
    selectedVoiceAdjustments = selectedVoiceAdjustments.includes(adjustmentId)
      ? selectedVoiceAdjustments.filter((id) => id !== adjustmentId)
      : [...selectedVoiceAdjustments, adjustmentId];
    refreshVoiceTuning(
      !voiceTuningIsDefault()
        ? '修正内容を声の設計へ反映しました。「この声を生成して試聴」で新しい候補を作れます。'
        : '修正を解除し、元の声の設計へ戻しました。',
    );
  }

  function setVoicePerformanceParameter(parameterId: VoicePerformanceParameterId, event: Event): void {
    const nextValue = Number((event.currentTarget as HTMLInputElement).value);
    if (!Number.isInteger(nextValue) || nextValue < 0 || nextValue > 4) return;
    if (voicePerformance[parameterId] === nextValue) return;
    voicePerformance = { ...voicePerformance, [parameterId]: nextValue };
    refreshVoiceTuning('発声パラメータを更新しました。新しい設定で候補を生成してください。');
  }

  function setVoiceSpeed(event: Event): void {
    const nextValue = Number((event.currentTarget as HTMLInputElement).value);
    if (!Number.isInteger(nextValue) || nextValue < 0 || nextValue >= VOICE_SPEED_OPTIONS.length) return;
    if (voiceSpeedLevel === nextValue) return;
    stageCurrentCandidateForComparison();
    voiceSpeedLevel = nextValue;
    voiceModalMessage = `話速を「${VOICE_SPEED_OPTIONS[voiceSpeedLevel].label}」へ変更しました。新しい候補を生成してください。`;
  }

  function setVoiceTuningStrength(strength: VoiceTuningStrength): void {
    if (voiceTuningStrength === strength) return;
    voiceTuningStrength = strength;
    refreshVoiceTuning(
      selectedVoiceAdjustments.length > 0
        ? '変化量を更新しました。新しい設定で候補を生成してください。'
        : '変化量を選びました。続けて声の修正ボタンを選んでください。',
    );
  }

  function clearVoiceTuning(): void {
    if (voiceTuningIsDefault() && voiceCaption === stripVoiceTuning(voiceCaption)) return;
    selectedVoiceAdjustments = [];
    voicePerformance = { ...DEFAULT_VOICE_PERFORMANCE };
    voiceSpeedLevel = 2;
    refreshVoiceTuning('修正をすべて解除し、元の声の設計へ戻しました。');
  }

  function handleVoiceCaptionInput(event: Event): void {
    const nextCaption = (event.currentTarget as HTMLTextAreaElement).value;
    if (nextCaption === voiceCaption) return;
    stageCurrentCandidateForComparison();
    selectedVoiceAdjustments = [];
    voicePerformance = { ...DEFAULT_VOICE_PERFORMANCE };
    voiceCaption = nextCaption;
    voiceModalMessage = '声の設計を手動編集しました。新しい候補を生成すると比較できます。';
  }

  function handleVoiceTestPhraseInput(event: Event): void {
    const nextPhrase = (event.currentTarget as HTMLInputElement).value;
    if (nextPhrase === voiceTestPhrase) return;
    voiceTestPhrase = nextPhrase;
    voiceCandidateAudioUrl = '';
    voiceComparisonAudioUrl = '';
    voiceModalMessage = '試聴セリフを変更しました。同じセリフで比較するため候補音声をリセットしました。';
  }

  function localVoiceError(error: unknown): string {
    const message = error instanceof Error ? error.message : String(error);
    if (/\[quality-gate\]|acceptable candidate/u.test(message)) {
      return 'ノイズ状の候補を検出したため採用しませんでした。自動再生成でも改善しなかったので、もう一度生成してください。';
    }
    if (/worker returned no response|short audition exited|synthesis failed|Voice Bridge HTTP 500/u.test(message)) {
      return 'Irodoriの生成処理が途中で停止しました。短時間生成へ切り替えた最新版で再試行してください。再試行前にVoice Bridgeは自動的に再起動されます。';
    }
    if (/Voice Bridge is not reachable|fetch failed|ローカル音声エンジン/u.test(message)) {
      return `ローカル音声エンジンを起動できませんでした。少し待ってから再試行してください。${message ? ` 詳細: ${message}` : ''}`;
    }
    return message;
  }

  async function analyzeCharacterVoice(character = voiceDesignerCharacter): Promise<void> {
    if (!character) return;
    voiceModalBusy = 'analyze';
    voiceModalMessage = 'キャラクター画像から、似合う声をローカルで考えています…';
    voiceCandidateAudioUrl = '';
    voiceComparisonAudioUrl = '';
    selectedVoiceAdjustments = [];
    voiceTuningStrength = 'medium';
    voicePerformance = { ...DEFAULT_VOICE_PERFORMANCE };
    voiceSpeedLevel = 2;
    try {
      const response = await fetch('/api/voice/analyze-character-local', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ characterId: character.id }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data?.message ?? `Local Voice Analyze HTTP ${response.status}`);
      if (voiceDesignerCharacter?.id !== character.id) return;
      voiceProposal = data as LocalVoiceProposal;
      voiceCaption = String(data?.caption ?? '');
      voiceTestPhrase = String(data?.testPhrase ?? `${character.name}です。よろしくお願いします。`);
      voiceModalMessage = String(data?.notice ?? 'ローカル音声案を作成しました。');
    } catch (error) {
      voiceModalMessage = localVoiceError(error);
    } finally {
      voiceModalBusy = '';
    }
  }

  async function generateLocalVoiceCandidate(): Promise<void> {
    const character = voiceDesignerCharacter;
    if (!character || !voiceCaption.trim() || !voiceTestPhrase.trim()) return;
    voiceModalBusy = 'generate';
    voiceCandidateAudioUrl = '';
    voiceModalMessage = voiceExecutionBackend === 'runpod'
      ? 'RunPod RTX 5090でIrodori公式VoiceDesign設定を使って候補を生成しています…'
      : 'ローカル音声エンジンを確認しています。停止中なら自動起動します。CPUでは起動と生成に数分かかることがあります…';
    try {
      const response = await fetch('/api/voice/speak', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          characterId: character.id,
          text: voiceTestPhrase,
          voiceCaption,
          voiceSpeed: VOICE_SPEED_OPTIONS[voiceSpeedLevel].speed,
          auditionNonce: crypto.randomUUID(),
        }),
      });
      const data = await response.json();
      if (!response.ok || !data?.success || !data?.audioUrl) {
        throw new Error(data?.message ?? `${voiceExecutionLabel()} HTTP ${response.status}`);
      }
      if (voiceDesignerCharacter?.id !== character.id) return;
      if (data?.backend === 'runpod' || data?.backend === 'local') voiceExecutionBackend = data.backend;
      voiceCandidateAudioUrl = String(data.audioUrl);
      voiceModalMessage = data.cached
        ? `${voiceExecutionLabel()}で生成済みの同じ候補を読み込みました。異常音があれば保存せず、もう一度生成してください。`
        : `${voiceExecutionLabel()}で新しい候補を生成しました。異常音がないことを確認し、気に入った場合だけ基本声にできます。`;
    } catch (error) {
      voiceModalMessage = localVoiceError(error);
    } finally {
      voiceModalBusy = '';
    }
  }

  async function adoptLocalVoiceCandidate(): Promise<void> {
    const character = voiceDesignerCharacter;
    if (!character || !voiceCandidateAudioUrl) return;
    voiceModalBusy = 'adopt';
    voiceModalMessage = '候補音声をキャラクターの基本声としてローカル保存しています…';
    try {
      const response = await fetch(`/api/characters/${encodeURIComponent(character.id)}/voice`, {
        method: 'PUT',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          voice: {
            engine: 'irodori',
            mode: 'design',
            model: '',
            caption: voiceCaption,
            speed: VOICE_SPEED_OPTIONS[voiceSpeedLevel].speed,
            autoSpeak: true,
          },
          keptVoice: {
            sourceAudioUrl: voiceCandidateAudioUrl,
            text: voiceTestPhrase,
            name: `${character.id}_image_voice_${Date.now()}`,
          },
        }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data?.message ?? `Voice Save HTTP ${response.status}`);
      voiceModalMessage = `${character.name}の基本声として保存しました。以後のチャットでこの声を使います。`;
      await loadCharacters();
    } catch (error) {
      voiceModalMessage = localVoiceError(error);
    } finally {
      voiceModalBusy = '';
    }
  }
</script>

<svelte:head>
  <title>CHARACTER LIBRARY | AI VTuber</title>
</svelte:head>

<div class="library-page">
  <header>
    <div>
      <p>CHARACTER SHEET / PHASE 1</p>
      <h1>CHARACTER LIBRARY</h1>
      <span>Character Registry互換のプロフィールと画像を管理します。</span>
    </div>
    <nav>
      <a href="/lab">CHAT</a>
      <a href="/story">STORY</a>
      <a href="/project">PROJECT</a>
      <button onclick={() => (createOpen = !createOpen)}>+ NEW CHARACTER</button>
    </nav>
  </header>

  {#if createOpen}
    <section class="create-panel">
      <div class="field-grid">
        <label><span>ID</span><input bind:value={newId} placeholder="character-id" /></label>
        <label><span>名前</span><input bind:value={newName} /></label>
        <label><span>役割</span><input bind:value={newRole} /></label>
        <label class="wide"><span>説明</span><textarea bind:value={newDescription} rows="3"></textarea></label>
        <label class="wide file-field">
          <span>画像</span>
          <input type="file" accept="image/*" onchange={(event) => (newImage = event.currentTarget.files?.[0] ?? null)} />
        </label>
      </div>
      <div class="create-actions">
        <button class="secondary" onclick={() => (createOpen = false)}>キャンセル</button>
        <button onclick={createCharacter} disabled={busyId === '__new__' || !newId.trim() || !newName.trim()}>
          {busyId === '__new__' ? '登録中...' : '登録'}
        </button>
      </div>
    </section>
  {/if}

  {#if errorMessage}<div class="error-message">{errorMessage}</div>{/if}

  {#if loading}
    <div class="empty-state">Character Libraryを読み込み中...</div>
  {:else if characters.length === 0}
    <div class="empty-state">キャラクターはまだ登録されていません。</div>
  {:else}
    <main class="card-grid">
      {#each characters as character (character.id)}
        <CharacterLibraryCard
          {character}
          editing={editingId === character.id}
          busy={busyId === character.id}
          onEdit={() => (editingId = character.id)}
          onCancel={() => (editingId = '')}
          onSave={(input) => updateCharacter(character.id, input)}
          onImageChange={(file) => changeImage(character.id, file)}
          onGenerateSheet={() => generateCharacterYaml(character)}
          onChat={() => openChatModal(character)}
          onMemory={() => (window.location.href = `/character-memory?id=${encodeURIComponent(character.id)}`)}
          onLibrary={() => (window.location.href = `/character-memory?id=${encodeURIComponent(character.id)}#project-assets`)}
          onLive2D={() => (window.location.href = `/characters/${encodeURIComponent(character.id)}/live2d-maker`)}
          onVoiceDesign={() => openLocalVoiceDesigner(character)}
          onPuruPuru={PURUPURU_CHARACTER_IDS.has(character.id)
            ? () => (window.location.href = `/mouth-picker?character=${encodeURIComponent(character.id)}`)
            : undefined}
          onAnalyze={(category) => analyzeResidentAsset(character, category)}
          analysisCandidate={Object.entries(analysisCandidates).filter(([key]) => key.startsWith(`${character.id}:`)).at(-1)?.[1] ?? ''}
        />
      {/each}
    </main>
  {/if}

  {#if voiceDesignerCharacter}
    <div class="voice-modal-backdrop">
      <dialog
        open
        class="voice-modal"
        aria-modal="true"
        aria-labelledby="local-voice-modal-title"
        data-testid="local-character-voice-modal"
      >
        <header class="voice-modal-header">
          <div>
            <p>LOCAL IMAGE → VOICE</p>
            <h2 id="local-voice-modal-title">画像から基本声を作る</h2>
          </div>
          <button type="button" class="voice-modal-close" onclick={closeLocalVoiceDesigner} disabled={Boolean(voiceModalBusy)} aria-label="閉じる">×</button>
        </header>

        <div class="voice-character-row">
          {#if voiceDesignerCharacter.imageDataUrl}
            <img src={voiceDesignerCharacter.imageDataUrl} alt={voiceDesignerCharacter.name} />
          {/if}
          <div>
            <strong>{voiceDesignerCharacter.name}</strong>
            <span>{voiceDesignerCharacter.id}</span>
            <p>画像の印象を声の仮説へ変換し、{voiceExecutionLabel()}で試聴音声を生成します。</p>
          </div>
        </div>

        <div class="local-only-banner">
          <strong>{voiceExecutionBackend === 'runpod' ? '☁️ RUNPOD SYNTHESIS' : '🖥️ LOCAL SYNTHESIS'}</strong>
          <span>{voiceExecutionConfigured ? `${voiceExecutionLabel()}を使用` : 'RunPod APIキーまたはVoice Endpointを設定してください'}</span>
        </div>

        {#if voiceModalBusy === 'analyze'}
          <div class="voice-modal-loading"><span></span>画像から声の方向を推定中…</div>
        {:else if voiceProposal}
          <div class="voice-proposal-heading">
            <div>
              <span>VOICE PROPOSAL</span>
              <strong>{voiceProposal.summary}</strong>
            </div>
            <em class:pixel-vision={voiceProposal.usedImagePixels}>
              {voiceProposal.usedImagePixels ? `OLLAMA VISION · ${voiceProposal.model}` : 'LOCAL IMAGE YAML'}
            </em>
          </div>

          <ul class="voice-reasons">
            {#each voiceProposal.reasons as reason}<li>{reason}</li>{/each}
          </ul>

          <section class="voice-tuning-panel" aria-labelledby="voice-tuning-title" data-testid="local-voice-tuning-panel">
            <div class="voice-tuning-heading">
              <div>
                <span>VOICE TUNING</span>
                <strong id="voice-tuning-title">聴いた印象から声を修正</strong>
              </div>
              <button type="button" class="voice-tuning-reset" onclick={clearVoiceTuning} disabled={Boolean(voiceModalBusy) || voiceTuningIsDefault()} data-testid="voice-tuning-reset">
                元に戻す
              </button>
            </div>

            <div class="voice-strength-row" aria-label="変化量">
              <span>変化量</span>
              <div>
                {#each VOICE_TUNING_STRENGTHS as strength}
                  <button
                    type="button"
                    class:active={voiceTuningStrength === strength.id}
                    aria-pressed={voiceTuningStrength === strength.id}
                    title={strength.description}
                    onclick={() => setVoiceTuningStrength(strength.id)}
                    disabled={Boolean(voiceModalBusy)}
                    data-testid={`voice-strength-${strength.id}`}
                  >{strength.label}</button>
                {/each}
              </div>
            </div>

            <div class="voice-adjustment-section">
              <span class="voice-adjustment-label">声質</span>
              <div class="voice-adjustment-grid">
                {#each VOICE_QUALITY_ADJUSTMENTS as adjustment}
                  <button
                    type="button"
                    class:active={selectedVoiceAdjustments.includes(adjustment.id)}
                    aria-pressed={selectedVoiceAdjustments.includes(adjustment.id)}
                    onclick={() => toggleVoiceAdjustment(adjustment.id)}
                    disabled={Boolean(voiceModalBusy)}
                    data-testid={`voice-adjustment-${adjustment.id}`}
                  >
                    <strong>{adjustment.label}</strong>
                    <span>{adjustment.description}</span>
                  </button>
                {/each}
              </div>
            </div>

            <div class="voice-adjustment-section character-flavors">
              <span class="voice-adjustment-label">キャラ味</span>
              <div class="voice-adjustment-grid">
                {#each VOICE_CHARACTER_ADJUSTMENTS as adjustment}
                  <button
                    type="button"
                    class:active={selectedVoiceAdjustments.includes(adjustment.id)}
                    aria-pressed={selectedVoiceAdjustments.includes(adjustment.id)}
                    onclick={() => toggleVoiceAdjustment(adjustment.id)}
                    disabled={Boolean(voiceModalBusy)}
                    data-testid={`voice-adjustment-${adjustment.id}`}
                  >
                    <strong>{adjustment.label}</strong>
                    <span>{adjustment.description}</span>
                  </button>
                {/each}
              </div>
            </div>

            <div class="voice-performance-panel" data-testid="voice-performance-panel">
              <span class="voice-adjustment-label">発声パラメータ</span>
              <div class="voice-parameter-grid">
                {#each VOICE_PERFORMANCE_CONTROLS as control}
                  <label class="voice-parameter-control">
                    <span><strong>{control.label}</strong><b>{control.options[voicePerformance[control.id]].label}</b></span>
                    <input
                      type="range"
                      min="0"
                      max="4"
                      step="1"
                      value={voicePerformance[control.id]}
                      oninput={(event) => setVoicePerformanceParameter(control.id, event)}
                      disabled={Boolean(voiceModalBusy)}
                      aria-label={control.label}
                      data-testid={`voice-parameter-${control.id}`}
                    />
                    <small>{control.description}</small>
                  </label>
                {/each}
                <label class="voice-parameter-control speed-control">
                  <span><strong>話す速さ</strong><b>{VOICE_SPEED_OPTIONS[voiceSpeedLevel].label} · {VOICE_SPEED_OPTIONS[voiceSpeedLevel].speed.toFixed(2)}×</b></span>
                  <input
                    type="range"
                    min="0"
                    max="4"
                    step="1"
                    value={voiceSpeedLevel}
                    oninput={setVoiceSpeed}
                    disabled={Boolean(voiceModalBusy)}
                    aria-label="話す速さ"
                    data-testid="voice-parameter-speed"
                  />
                  <small>音声生成後の実際の再生速度にも反映</small>
                </label>
              </div>
            </div>
            <p>プリセットは複数選択できます。指示は下の設計文へ一度だけ反映され、話速は音声処理にも直接適用されます。</p>
          </section>

          <label class="voice-field">
            <span>声の設計（生成前に自由に調整できます）</span>
            <textarea value={voiceCaption} oninput={handleVoiceCaptionInput} rows="5" data-testid="local-voice-caption"></textarea>
          </label>
          <label class="voice-field">
            <span>試聴セリフ</span>
            <input value={voiceTestPhrase} oninput={handleVoiceTestPhraseInput} maxlength="120" />
          </label>

          <div class="voice-modal-actions">
            <button type="button" class="secondary" onclick={() => void analyzeCharacterVoice()} disabled={Boolean(voiceModalBusy)}>
              ↻ もう一度提案
            </button>
            <button
              type="button"
              class="voice-generate-action"
              onclick={() => void generateLocalVoiceCandidate()}
              disabled={Boolean(voiceModalBusy) || !voiceCaption.trim() || !voiceTestPhrase.trim()}
              data-testid="generate-local-character-voice"
            >
              {voiceModalBusy === 'generate'
                ? voiceExecutionBackend === 'runpod' ? 'RunPod生成中…' : 'ローカル生成中…'
                : voiceExecutionBackend === 'runpod' ? '▶ RunPodでこの声を生成して試聴' : '▶ この声を生成して試聴'}
            </button>
          </div>

          {#if voiceComparisonAudioUrl || voiceCandidateAudioUrl}
            <section class="voice-audition">
              <div>
                <span>LOCAL AUDITION</span>
                <strong>{voiceComparisonAudioUrl && voiceCandidateAudioUrl ? 'A/Bで聴き比べ' : '採用前の候補音声'}</strong>
              </div>
              <div class:has-comparison={Boolean(voiceComparisonAudioUrl && voiceCandidateAudioUrl)} class="voice-audition-grid">
                {#if voiceComparisonAudioUrl}
                  <article class="voice-audition-card baseline" data-testid="voice-audition-before">
                    <b>A</b>
                    <div><strong>修正前</strong><small>直前に生成した候補</small></div>
                    <audio controls src={voiceComparisonAudioUrl}></audio>
                  </article>
                {/if}
                {#if voiceCandidateAudioUrl}
                  <article class="voice-audition-card current" data-testid="voice-audition-after">
                    <b>{voiceComparisonAudioUrl ? 'B' : '♪'}</b>
                    <div><strong>{voiceComparisonAudioUrl ? '修正後' : '現在の候補'}</strong><small>基本声にできる候補</small></div>
                    <audio controls src={voiceCandidateAudioUrl}></audio>
                  </article>
                {/if}
              </div>
              {#if voiceCandidateAudioUrl}
                <button
                  type="button"
                  onclick={() => void adoptLocalVoiceCandidate()}
                  disabled={Boolean(voiceModalBusy)}
                data-testid="adopt-local-character-voice"
              >
                  {voiceModalBusy === 'adopt'
                    ? '保存中…'
                    : voiceComparisonAudioUrl
                      ? '💾 Bの声を基本声にする'
                      : '💾 この声を基本声にする'}
                </button>
              {:else}
                <p class="voice-audition-hint">修正前の候補を保持しています。新しい声を生成すると、ここでA/B比較できます。</p>
              {/if}
            </section>
          {/if}
        {:else}
          <div class="voice-modal-empty">
            <p>ローカル音声案を取得できませんでした。</p>
            <button type="button" onclick={() => void analyzeCharacterVoice()}>再試行</button>
          </div>
        {/if}

        {#if voiceModalMessage}
          <p class:error={voiceModalMessage.includes('HTTP') || voiceModalMessage.includes('required')} class="voice-modal-message">{voiceModalMessage}</p>
        {/if}
      </dialog>
    </div>
  {/if}

  {#if chatModalCharacter}
    <PersonalityEngineModal
      characterId={chatModalCharacter.id}
      characterName={chatModalCharacter.name}
      characterImage={chatModalCharacter.imageDataUrl ?? ''}
      bind:provider={chatModalProvider}
      bind:conversationAI={chatModalConversationAI}
      bind:storyCardAI={chatModalStoryCardAI}
      bind:motionPromptAI={chatModalMotionPromptAI}
      bind:characterAnalysisAI={chatModalCharacterAnalysisAI}
      bind:intentRouterAI={chatModalIntentRouterAI}
      bind:imageAI={chatModalImageAI}
      bind:videoAI={chatModalVideoAI}
      bind:voiceAI={chatModalVoiceAI}
      bind:memoryEnabled={chatModalMemoryEnabled}
      bind:reflectionTendency={chatModalReflectionTendency}
      busy={chatModalBusy}
      onCancel={() => (chatModalCharacter = null)}
      onStart={startChat}
    />
  {/if}
</div>

<style>
  :global(body) { margin: 0; background: #030712; color: #e2e8f0; font-family: 'Segoe UI', sans-serif; }
  .library-page {
    min-height: 100vh;
    padding: 28px;
    background:
      radial-gradient(circle at 15% 0%, rgba(34, 211, 238, 0.12), transparent 34%),
      radial-gradient(circle at 90% 15%, rgba(168, 85, 247, 0.12), transparent 30%),
      #030712;
  }
  header {
    max-width: 1280px;
    margin: 0 auto 22px;
    display: flex;
    align-items: end;
    justify-content: space-between;
    gap: 20px;
  }
  header p, header h1, header span { margin: 0; }
  header p { color: #22d3ee; font-size: 10px; letter-spacing: 0.18em; }
  header h1 { margin-top: 4px; color: #f8fafc; font-size: clamp(32px, 6vw, 64px); }
  header span { color: #94a3b8; font-size: 12px; }
  nav { display: flex; flex-wrap: wrap; gap: 7px; justify-content: flex-end; }
  nav a, button {
    padding: 9px 12px;
    border: 1px solid rgba(34, 211, 238, 0.3);
    border-radius: 6px;
    background: rgba(34, 211, 238, 0.07);
    color: #a5f3fc;
    font: inherit;
    font-size: 10px;
    font-weight: 800;
    text-decoration: none;
    cursor: pointer;
  }
  button:disabled { cursor: not-allowed; opacity: 0.45; }
  .create-panel {
    max-width: 1280px;
    margin: 0 auto 18px;
    padding: 16px;
    border: 1px solid rgba(34, 211, 238, 0.22);
    border-radius: 12px;
    background: rgba(8, 15, 32, 0.88);
  }
  .field-grid { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 10px; }
  label { display: grid; gap: 4px; }
  label span { color: #94a3b8; font-size: 9px; font-weight: 800; }
  label.wide { grid-column: 1 / -1; }
  input, textarea {
    width: 100%;
    padding: 8px;
    border: 1px solid rgba(148, 163, 184, 0.22);
    border-radius: 6px;
    outline: none;
    background: #020617;
    color: #e2e8f0;
    font: inherit;
    box-sizing: border-box;
  }
  textarea { resize: vertical; }
  .create-actions { display: flex; justify-content: flex-end; gap: 7px; margin-top: 12px; }
  .secondary { border-color: rgba(148, 163, 184, 0.25); color: #94a3b8; }
  .card-grid {
    max-width: 1280px;
    margin: 0 auto;
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(260px, 1fr));
    gap: 14px;
  }
  .empty-state, .error-message {
    max-width: 1280px;
    margin: 18px auto;
    padding: 30px;
    border: 1px solid rgba(148, 163, 184, 0.16);
    border-radius: 12px;
    background: rgba(8, 15, 32, 0.75);
    color: #94a3b8;
    text-align: center;
  }
  .error-message { padding: 12px; border-color: rgba(251, 113, 133, 0.28); color: #fb7185; }
  .voice-modal-backdrop {
    position: fixed;
    inset: 0;
    z-index: 120;
    display: grid;
    place-items: center;
    padding: 24px;
    overflow: auto;
    background: rgba(1, 4, 15, .82);
    backdrop-filter: blur(10px);
  }
  .voice-modal {
    position: relative;
    width: min(720px, 100%);
    max-height: calc(100vh - 48px);
    overflow: auto;
    padding: 20px;
    margin: 0;
    border: 1px solid rgba(34, 211, 238, .42);
    border-radius: 14px;
    box-sizing: border-box;
    background:
      radial-gradient(circle at 100% 0%, rgba(124, 58, 237, .2), transparent 38%),
      #061020;
    box-shadow: 0 26px 90px rgba(0, 0, 0, .55), 0 0 36px rgba(34, 211, 238, .09);
  }
  .voice-modal-header {
    max-width: none;
    margin: 0 0 14px;
    display: flex;
    align-items: start;
    justify-content: space-between;
  }
  .voice-modal-header p { margin: 0; color: #67e8f9; font: 800 9px/1 Consolas, monospace; letter-spacing: .16em; }
  .voice-modal-header h2 { margin: 5px 0 0; color: #f8fafc; font-size: 24px; }
  .voice-modal-close { padding: 5px 10px; font-size: 18px; line-height: 1; }
  .voice-character-row {
    display: grid;
    grid-template-columns: 92px 1fr;
    gap: 13px;
    align-items: center;
    padding: 10px;
    border: 1px solid rgba(148, 163, 184, .16);
    border-radius: 10px;
    background: rgba(2, 6, 23, .56);
  }
  .voice-character-row img { width: 92px; height: 92px; object-fit: cover; border-radius: 8px; }
  .voice-character-row strong { display: block; color: #f8fafc; font-size: 18px; }
  .voice-character-row span { color: #22d3ee; font: 800 9px/1.3 Consolas, monospace; letter-spacing: .12em; }
  .voice-character-row p { margin: 8px 0 0; color: #94a3b8; font-size: 11px; }
  .local-only-banner {
    display: flex;
    justify-content: space-between;
    gap: 12px;
    margin-top: 10px;
    padding: 9px 11px;
    border: 1px solid rgba(16, 185, 129, .34);
    border-radius: 8px;
    background: rgba(6, 78, 59, .15);
    color: #a7f3d0;
    font-size: 10px;
  }
  .local-only-banner strong { letter-spacing: .1em; }
  .voice-modal-loading, .voice-modal-empty {
    margin-top: 12px;
    padding: 28px;
    border: 1px dashed rgba(34, 211, 238, .3);
    border-radius: 9px;
    color: #a5f3fc;
    text-align: center;
    font-size: 11px;
  }
  .voice-modal-loading span {
    display: inline-block;
    width: 8px;
    height: 8px;
    margin-right: 8px;
    border-radius: 50%;
    background: #22d3ee;
    box-shadow: 0 0 12px #22d3ee;
    animation: voice-pulse 1s ease-in-out infinite alternate;
  }
  @keyframes voice-pulse { to { opacity: .28; transform: scale(.7); } }
  .voice-proposal-heading {
    display: flex;
    align-items: start;
    justify-content: space-between;
    gap: 12px;
    margin-top: 14px;
  }
  .voice-proposal-heading span { display: block; color: #a78bfa; font: 800 8px/1 Consolas, monospace; letter-spacing: .14em; }
  .voice-proposal-heading strong { display: block; margin-top: 5px; color: #f5f3ff; font-size: 14px; }
  .voice-proposal-heading em {
    flex: 0 0 auto;
    padding: 5px 7px;
    border: 1px solid rgba(251, 191, 36, .3);
    border-radius: 999px;
    color: #fde68a;
    font: 800 8px/1 Consolas, monospace;
    font-style: normal;
  }
  .voice-proposal-heading em.pixel-vision { border-color: rgba(16, 185, 129, .35); color: #a7f3d0; }
  .voice-reasons { margin: 10px 0; padding: 10px 10px 10px 28px; border-radius: 8px; background: rgba(124, 58, 237, .08); color: #c4b5fd; font-size: 10px; line-height: 1.65; }
  .voice-tuning-panel {
    margin-top: 12px;
    padding: 12px;
    border: 1px solid rgba(167, 139, 250, .28);
    border-radius: 10px;
    background: linear-gradient(135deg, rgba(91, 33, 182, .12), rgba(8, 145, 178, .06));
  }
  .voice-tuning-heading { display: flex; align-items: start; justify-content: space-between; gap: 12px; }
  .voice-tuning-heading span { display: block; color: #c4b5fd; font: 800 8px/1 Consolas, monospace; letter-spacing: .14em; }
  .voice-tuning-heading strong { display: block; margin-top: 4px; color: #f5f3ff; font-size: 13px; }
  .voice-tuning-reset { padding: 5px 8px; border-color: rgba(148, 163, 184, .25); color: #cbd5e1; font-size: 9px; }
  .voice-strength-row { display: flex; align-items: center; gap: 9px; margin-top: 10px; }
  .voice-strength-row > span { color: #94a3b8; font-size: 9px; font-weight: 800; }
  .voice-strength-row > div { display: flex; gap: 5px; }
  .voice-strength-row button {
    padding: 5px 9px;
    border-color: rgba(148, 163, 184, .22);
    border-radius: 999px;
    color: #94a3b8;
    font-size: 9px;
  }
  .voice-strength-row button.active { border-color: rgba(34, 211, 238, .58); background: rgba(8, 145, 178, .2); color: #cffafe; box-shadow: 0 0 12px rgba(34, 211, 238, .08); }
  .voice-adjustment-section { margin-top: 11px; }
  .voice-adjustment-label { color: #94a3b8; font: 800 8px/1 Consolas, monospace; letter-spacing: .12em; text-transform: uppercase; }
  .voice-adjustment-grid { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 7px; margin-top: 6px; }
  .voice-adjustment-grid button {
    min-width: 0;
    padding: 9px;
    border-color: rgba(167, 139, 250, .2);
    border-radius: 8px;
    background: rgba(15, 23, 42, .5);
    color: #cbd5e1;
    text-align: left;
  }
  .voice-adjustment-grid button strong { display: block; color: inherit; font-size: 10px; }
  .voice-adjustment-grid button span { display: block; margin-top: 4px; color: #64748b; font-size: 8px; line-height: 1.35; }
  .voice-adjustment-grid button.active { border-color: rgba(244, 114, 182, .58); background: rgba(190, 24, 93, .16); color: #fce7f3; box-shadow: inset 0 0 16px rgba(244, 114, 182, .05); }
  .voice-adjustment-grid button.active span { color: #f9a8d4; }
  .character-flavors .voice-adjustment-grid button.active { border-color: rgba(34, 211, 238, .58); background: rgba(8, 145, 178, .16); color: #cffafe; box-shadow: inset 0 0 16px rgba(34, 211, 238, .05); }
  .character-flavors .voice-adjustment-grid button.active span { color: #67e8f9; }
  .voice-performance-panel { margin-top: 12px; padding-top: 11px; border-top: 1px solid rgba(167, 139, 250, .16); }
  .voice-parameter-grid { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 8px; margin-top: 7px; }
  .voice-parameter-control {
    display: grid;
    gap: 6px;
    min-width: 0;
    padding: 9px;
    border: 1px solid rgba(148, 163, 184, .15);
    border-radius: 8px;
    background: rgba(2, 6, 23, .38);
  }
  .voice-parameter-control > span { display: flex; align-items: center; justify-content: space-between; gap: 7px; }
  .voice-parameter-control strong { color: #e2e8f0; font-size: 9px; }
  .voice-parameter-control b { color: #67e8f9; font-size: 8px; font-weight: 800; text-align: right; }
  .voice-parameter-control input[type='range'] { width: 100%; margin: 0; padding: 0; accent-color: #22d3ee; }
  .voice-parameter-control small { color: #64748b; font-size: 8px; line-height: 1.35; }
  .voice-parameter-control.speed-control { border-color: rgba(16, 185, 129, .22); }
  .voice-parameter-control.speed-control b { color: #6ee7b7; }
  .voice-parameter-control.speed-control input[type='range'] { accent-color: #10b981; }
  .voice-tuning-panel > p { margin: 9px 0 0; color: #64748b; font-size: 8px; line-height: 1.45; }
  .voice-field { margin-top: 10px; }
  .voice-field textarea { min-height: 112px; line-height: 1.5; }
  .voice-modal-actions { display: flex; justify-content: flex-end; gap: 8px; margin-top: 12px; }
  .voice-generate-action { border-color: rgba(34, 211, 238, .5); background: rgba(8, 145, 178, .18); color: #cffafe; }
  .voice-audition {
    display: grid;
    gap: 10px;
    margin-top: 13px;
    padding: 13px;
    border: 1px solid rgba(16, 185, 129, .34);
    border-radius: 10px;
    background: rgba(6, 78, 59, .13);
  }
  .voice-audition span { display: block; color: #6ee7b7; font: 800 8px/1 Consolas, monospace; letter-spacing: .14em; }
  .voice-audition strong { display: block; margin-top: 4px; color: #ecfdf5; font-size: 13px; }
  .voice-audition-grid { display: grid; gap: 8px; }
  .voice-audition-grid.has-comparison { grid-template-columns: repeat(2, minmax(0, 1fr)); }
  .voice-audition-card {
    display: grid;
    grid-template-columns: auto 1fr;
    gap: 8px;
    align-items: center;
    min-width: 0;
    padding: 9px;
    border: 1px solid rgba(148, 163, 184, .18);
    border-radius: 8px;
    background: rgba(2, 6, 23, .48);
  }
  .voice-audition-card.current { border-color: rgba(16, 185, 129, .4); background: rgba(6, 78, 59, .16); }
  .voice-audition-card > b { display: grid; width: 25px; height: 25px; place-items: center; border-radius: 50%; background: rgba(100, 116, 139, .2); color: #cbd5e1; font-size: 10px; }
  .voice-audition-card.current > b { background: rgba(16, 185, 129, .2); color: #a7f3d0; }
  .voice-audition-card strong { margin: 0; font-size: 10px; }
  .voice-audition-card small { display: block; margin-top: 2px; color: #64748b; font-size: 8px; }
  .voice-audition-card audio { grid-column: 1 / -1; width: 100%; height: 34px; }
  .voice-audition button { justify-self: end; border-color: rgba(16, 185, 129, .48); background: rgba(5, 150, 105, .18); color: #d1fae5; }
  .voice-audition-hint { margin: 0; color: #94a3b8; font-size: 9px; line-height: 1.5; }
  .voice-modal-message { min-height: 0; margin: 11px 0 0; padding: 9px 10px; border-radius: 7px; background: rgba(34, 211, 238, .07); color: #a5f3fc; font-size: 10px; }
  .voice-modal-message.error { background: rgba(159, 18, 57, .16); color: #fda4af; }
  @media (max-width: 760px) {
    .library-page { padding: 18px; }
    header { align-items: start; flex-direction: column; }
    .field-grid { grid-template-columns: 1fr; }
    label.wide { grid-column: auto; }
    .voice-modal-backdrop { padding: 10px; }
    .voice-modal { max-height: calc(100vh - 20px); padding: 14px; }
    .voice-character-row { grid-template-columns: 70px 1fr; }
    .voice-character-row img { width: 70px; height: 70px; }
    .local-only-banner, .voice-proposal-heading, .voice-modal-actions { align-items: stretch; flex-direction: column; }
    .voice-adjustment-grid { grid-template-columns: repeat(2, minmax(0, 1fr)); }
    .voice-parameter-grid { grid-template-columns: 1fr; }
    .voice-audition-grid.has-comparison { grid-template-columns: 1fr; }
  }
</style>
