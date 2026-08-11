<script lang="ts">
  import { onDestroy, onMount } from 'svelte';
  import { page } from '$app/state';
  import {
    EYE_STATE_LABELS,
    MOUTH_STATE_LABELS,
    PICKER_MODES,
    faceStateIdOf,
    mouthStateToShape,
    parseFaceStateId,
    parseStoredFrameTags,
    toLegacyTagMap,
  } from '$lib/types/mouth-picker';
  import type {
    EyeState,
    FaceStateId,
    FrameTag,
    FrameTagMap,
    FramesResponse,
    ExportResponse,
    MouthOpenState,
    PickerMode,
  } from '$lib/types/mouth-picker';
  import { FaceAutoClassifier } from '$lib/mouth-picker/autoClassifier';
  import { NO_FACE_RESULT, analyzeRegionSeries, analyzeTemporalSeries, parseStoredAutoResults, pickCandidates } from '$lib/mouth-picker/classification';
  import type { AutoFrameResult, TemporalAnalysis } from '$lib/mouth-picker/classification';
  import { FrameStabilityAnalyzer, RegionDarkRatioAnalyzer, regionFromPoint } from '$lib/mouth-picker/regionAnalyzer';
  import type { FrameStability, NormRegion } from '$lib/mouth-picker/regionAnalyzer';
  import {
    ORGANIZER_STATE_KEYS,
    organizerAnalysisFromAuto,
    organizerCoverage,
    organizerFilename,
  } from '$lib/mouth-picker/imageOrganizer';
  import type { OrganizerAnalysis } from '$lib/mouth-picker/imageOrganizer';
  import {
    purupuruMaterialBaseUrl,
    purupuruMaterialFiles,
    summarizePuruPuruMaterials,
  } from '$lib/mouth-picker/purupuruMaterialCheck';
  import type { PuruPuruMaterialFileCheck } from '$lib/mouth-picker/purupuruMaterialCheck';
  import { packPuruPuruPackage, PURUPURU_FACE_KEYS, resolveFaceSources, type PuruPuruFaceKey } from '$lib/purupuru';

  type MouthPickerMode = PickerMode | 'image-organizer' | 'png-import';
  const MOUTH_PICKER_MODES: { id: MouthPickerMode; label: string; description: string }[] = [
    ...PICKER_MODES,
    {
      id: 'image-organizer',
      label: 'IMAGE ORGANIZER',
      description: '既存PNGを6状態へ自動分類し、PuruPuru向けの規則的なファイル名を生成します。',
    },
    {
      id: 'png-import',
      label: 'PNGインポート',
      description: '完成済みの6表情PNGを検査し、対象キャラクターの.purupuruへ直接パッケージします。',
    },
  ];

  interface OrganizerImage {
    id: string;
    file: File;
    sourceName: string;
    previewUrl: string;
    analysis: OrganizerAnalysis | null;
    faceDetected: boolean | null;
    error: string;
  }

  interface PuruPuruTargetCharacter {
    id: string;
    name: string;
    avatarType?: 'purupuru';
    avatarSrc?: string;
  }

  interface ImportedFacePng {
    file: File;
    previewUrl: string;
    width: number;
    height: number;
    hasTransparency: boolean;
  }

  let videoFile = $state<File | null>(null);
  let isExtracting = $state(false);
  let extractError = $state('');
  let frames = $state<string[]>([]);
  let currentIndex = $state(0);
  // 二軸タグ(目×口)。旧 open/mid/close は parseStoredFrameTags で互換読込する。
  let frameTags = $state<FrameTagMap>({});
  let mode = $state<MouthPickerMode>('auto-assist');
  let isExporting = $state(false);
  let exportPaths = $state<{ shape: string; path: string }[]>([]);
  let purupuruName = $state('shiro');
  let isPacking = $state(false);
  let packError = $state('');
  let packDone = $state(false);
  let savedPuruPuruUrl = $state('');

  let organizerImages = $state<OrganizerImage[]>([]);
  let organizerCharacterName = $state('shiro');
  let organizerIsAnalyzing = $state(false);
  let organizerAnalyzedCount = $state(0);
  let organizerError = $state('');
  let purupuruMaterialChecks = $state<PuruPuruMaterialFileCheck[]>([]);
  let isCheckingPuruPuruMaterials = $state(false);
  let purupuruMaterialCheckDone = $state(0);
  let purupuruMaterialCheckError = $state('');
  let targetCharacter = $state<PuruPuruTargetCharacter | null>(null);
  let targetCharacterLoading = $state(false);
  let targetCharacterError = $state('');
  let characterAvatarSaved = $state(false);
  let availableCharacters = $state<PuruPuruTargetCharacter[]>([]);
  let availableCharactersLoading = $state(false);
  let importedFacePngs = $state<Partial<Record<PuruPuruFaceKey, ImportedFacePng>>>({});
  let pngImportError = $state('');
  let pngImportSaving = $state(false);
  let pngImportSavedUrl = $state('');

  // 自動分類(Phase 2): フレーム名 → 解析結果。タグとは別に保持し、採用時のみ frameTags へ反映する。
  let autoResults = $state<Record<string, AutoFrameResult>>({});
  let isAnalyzing = $state(false);
  let analyzeDone = $state(0);
  let analyzeError = $state('');
  let analyzeMethod = $state<'mediapipe' | 'region' | null>(null);
  let classifier: FaceAutoClassifier | null = null;
  // アニメ顔フォールバック: 目・口領域の暗部率解析。領域はビューア上のクリックで指定する。
  let regionAnalyzer: RegionDarkRatioAnalyzer | null = null;
  // 顔位置安定性(Phase 4): フレーム名 → 基準フレームとのズレ・ブレ量。解析実行時のみ計測(永続化しない)。
  let stabilityResults = $state<Record<string, FrameStability>>({});
  let stabilityAnalyzer: FrameStabilityAnalyzer | null = null;
  let eyeRegion = $state<NormRegion | null>(null);
  let mouthRegion = $state<NormRegion | null>(null);
  let regionPickStage = $state<'idle' | 'eye' | 'mouth'>('idle');

  // 手動モード: プレビュークリックで登録した採用候補フレーム(タグ確定前の作業リスト)。
  let manualCandidates = $state<string[]>([]);
  let manualNotice = $state('');

  // 時間的解析(Phase 2): フレーム独立の autoResults から前後関係を含めて再評価する。
  // localStorage 復元時も autoResults から常に再計算できるため、派生値として持つ。
  const temporalAnalysis = $derived.by<TemporalAnalysis | null>(() => {
    if (frames.length === 0) return null;
    const detected = frames.some((filename) => autoResults[filename]?.faceDetected);
    if (!detected) return null;
    return analyzeTemporalSeries(frames, autoResults, stabilityResults);
  });

  const currentFrame = $derived(frames[currentIndex] ?? null);
  const currentTag = $derived<FrameTag | null>(currentFrame ? (frameTags[currentFrame] ?? null) : null);
  const currentSuggestion = $derived<AutoFrameResult | null>(currentFrame ? (autoResults[currentFrame] ?? null) : null);
  const activeMode = $derived(MOUTH_PICKER_MODES.find((entry) => entry.id === mode) ?? MOUTH_PICKER_MODES[0]);
  const organizerResults = $derived(organizerImages.flatMap((image) => (image.analysis ? [image.analysis] : [])));
  const organizerStateCoverage = $derived(organizerCoverage(organizerResults));
  const purupuruMaterialSummary = $derived(
    purupuruMaterialChecks.length > 0 ? summarizePuruPuruMaterials(purupuruMaterialChecks) : null,
  );
  const requestedCharacterId = $derived(page.url.searchParams.get('character')?.trim().toLowerCase() ?? '');
  const materialCharacterId = $derived((targetCharacter?.id ?? requestedCharacterId) || 'shiro');
  const purupuruMaterialFilenames = $derived(purupuruMaterialFiles(materialCharacterId));
  const purupuruMaterialDirectoryUrl = $derived(purupuruMaterialBaseUrl(materialCharacterId));
  const importedFaceCount = $derived(PURUPURU_FACE_KEYS.filter((key) => importedFacePngs[key]).length);
  const pngImportSizeMatch = $derived.by(() => {
    const assets = PURUPURU_FACE_KEYS.flatMap((key) => (importedFacePngs[key] ? [importedFacePngs[key]] : []));
    if (assets.length !== PURUPURU_FACE_KEYS.length) return false;
    return assets.every((asset) => asset.width === assets[0].width && asset.height === assets[0].height);
  });
  const pngImportTransparencyOk = $derived(
    importedFaceCount === PURUPURU_FACE_KEYS.length
    && PURUPURU_FACE_KEYS.every((key) => importedFacePngs[key]?.hasTransparency === true),
  );
  const pngImportReady = $derived(
    Boolean(targetCharacter)
    && importedFaceCount === PURUPURU_FACE_KEYS.length
    && pngImportSizeMatch
    && pngImportTransparencyOk,
  );

  const STORAGE_PREFIX = 'ai-vtuber:mouth-picker:tags:';
  const AUTO_STORAGE_PREFIX = 'ai-vtuber:mouth-picker:auto:';
  const REGION_STORAGE_PREFIX = 'ai-vtuber:mouth-picker:regions:';
  const MANUAL_STORAGE_PREFIX = 'ai-vtuber:mouth-picker:manual:';

  function storageKey(): string | null {
    return videoFile ? `${STORAGE_PREFIX}${videoFile.name}` : null;
  }

  function autoStorageKey(): string | null {
    return videoFile ? `${AUTO_STORAGE_PREFIX}${videoFile.name}` : null;
  }

  function regionStorageKey(): string | null {
    return videoFile ? `${REGION_STORAGE_PREFIX}${videoFile.name}` : null;
  }

  function manualStorageKey(): string | null {
    return videoFile ? `${MANUAL_STORAGE_PREFIX}${videoFile.name}` : null;
  }

  function persistManualCandidates(): void {
    const key = manualStorageKey();
    if (!key) return;
    try {
      if (manualCandidates.length === 0) localStorage.removeItem(key);
      else localStorage.setItem(key, JSON.stringify(manualCandidates));
    } catch {
      // 保存できなくても登録リスト自体は使える。
    }
  }

  function loadStoredManualCandidates(): void {
    const key = manualStorageKey();
    if (!key) return;
    try {
      const raw = localStorage.getItem(key);
      if (!raw) return;
      const parsed = JSON.parse(raw);
      if (!Array.isArray(parsed)) return;
      const known = new Set(frames);
      manualCandidates = [...new Set(parsed.filter((entry): entry is string => typeof entry === 'string' && known.has(entry)))];
    } catch {
      // 同上。
    }
  }

  /** 手動モード: プレビュークリックで現在フレームを採用候補に登録する(二重登録はしない)。 */
  function registerCurrentFrame(): void {
    if (!currentFrame) return;
    if (manualCandidates.includes(currentFrame)) {
      manualNotice = `${frameLabelOf(currentFrame)} は登録済みです`;
      return;
    }
    manualCandidates = [...manualCandidates, currentFrame];
    manualNotice = `${frameLabelOf(currentFrame)} を候補に登録しました — 目・口の状態を選んで確定してください`;
    persistManualCandidates();
  }

  /** 候補リストから外す(確定済みタグは消さない。タグ削除は一覧の×で行う)。 */
  function removeManualCandidate(filename: string): void {
    manualCandidates = manualCandidates.filter((entry) => entry !== filename);
    manualNotice = '';
    persistManualCandidates();
  }

  function frameLabelOf(filename: string): string {
    return filename.replace(/\.png$/, '');
  }

  function persistRegions(): void {
    const key = regionStorageKey();
    if (!key) return;
    try {
      if (eyeRegion && mouthRegion) localStorage.setItem(key, JSON.stringify({ eye: eyeRegion, mouth: mouthRegion }));
    } catch {
      // 保存できなくても解析自体は可能。
    }
  }

  function loadStoredRegions(): void {
    const key = regionStorageKey();
    if (!key) return;
    try {
      const raw = localStorage.getItem(key);
      if (!raw) return;
      const parsed = JSON.parse(raw) as { eye?: NormRegion; mouth?: NormRegion };
      if (parsed.eye && typeof parsed.eye.cx === 'number') eyeRegion = parsed.eye;
      if (parsed.mouth && typeof parsed.mouth.cx === 'number') mouthRegion = parsed.mouth;
    } catch {
      // 同上。
    }
  }

  function onRegionPickClick(event: MouseEvent): void {
    if (regionPickStage === 'idle') return;
    const target = event.currentTarget as HTMLElement;
    const rect = target.getBoundingClientRect();
    if (rect.width === 0 || rect.height === 0) return;
    const cx = (event.clientX - rect.left) / rect.width;
    const cy = (event.clientY - rect.top) / rect.height;
    if (regionPickStage === 'eye') {
      eyeRegion = regionFromPoint(cx, cy, 'eye');
      regionPickStage = 'mouth';
    } else {
      mouthRegion = regionFromPoint(cx, cy, 'mouth');
      regionPickStage = 'idle';
      persistRegions();
    }
  }

  function regionStyle(region: NormRegion): string {
    return `left:${(region.cx - region.w / 2) * 100}%;top:${(region.cy - region.h / 2) * 100}%;width:${region.w * 100}%;height:${region.h * 100}%`;
  }

  function loadStoredTags(): void {
    const known = new Set(frames);
    const key = storageKey();
    if (key) {
      try {
        const raw = localStorage.getItem(key);
        if (raw) {
          const parsed = parseStoredFrameTags(JSON.parse(raw));
          frameTags = Object.fromEntries(Object.entries(parsed).filter(([filename]) => known.has(filename)));
        }
      } catch {
        // 保存データが壊れていても抽出結果は使えるので握りつぶす。
      }
    }
    const autoKey = autoStorageKey();
    if (autoKey) {
      try {
        const raw = localStorage.getItem(autoKey);
        if (raw) {
          const parsed = parseStoredAutoResults(JSON.parse(raw));
          autoResults = Object.fromEntries(Object.entries(parsed).filter(([filename]) => known.has(filename)));
        }
      } catch {
        // 同上。
      }
    }
    loadStoredRegions();
    loadStoredManualCandidates();
  }

  function persistTags(): void {
    const key = storageKey();
    if (!key) return;
    try {
      if (Object.keys(frameTags).length === 0) localStorage.removeItem(key);
      else localStorage.setItem(key, JSON.stringify(frameTags));
    } catch {
      // 容量超過等で保存できなくてもタグ付け自体は続行できる。
    }
  }

  function persistAutoResults(): void {
    const key = autoStorageKey();
    if (!key) return;
    try {
      if (Object.keys(autoResults).length === 0) localStorage.removeItem(key);
      else localStorage.setItem(key, JSON.stringify(autoResults));
    } catch {
      // 同上。
    }
  }

  async function fetchFrameBitmap(filename: string): Promise<ImageBitmap> {
    const res = await fetch(`/frames/${filename}`);
    if (!res.ok) throw new Error(`フレームを取得できません: ${filename}`);
    return createImageBitmap(await res.blob());
  }

  /** 進捗表示のためUIへ制御を返す。 */
  async function yieldToUi(): Promise<void> {
    if (analyzeDone % 10 === 0) await new Promise((resolve) => setTimeout(resolve));
  }

  /**
   * 全フレームを解析する。MediaPipeを先に試し、序盤のフレームで顔が1つも
   * 検出できない場合(アニメ顔)は領域輝度解析へフォールバックする。
   * 既存タグは触らず、autoモードのみ解析後に仮選択を反映。
   */
  async function runAutoClassify(): Promise<void> {
    if (frames.length === 0 || isAnalyzing) return;
    isAnalyzing = true;
    analyzeError = '';
    analyzeDone = 0;
    analyzeMethod = null;
    try {
      let useMediapipe = true;
      try {
        classifier ??= new FaceAutoClassifier();
        await classifier.init();
      } catch {
        useMediapipe = false;
      }

      // 安定性(位置ズレ・ブレ)は時系列順の計測が前提。基準=最初のフレーム。
      stabilityAnalyzer ??= new FrameStabilityAnalyzer();
      stabilityAnalyzer.reset();
      let stabilityMap: Record<string, FrameStability> = {};

      if (useMediapipe) {
        const results: Record<string, AutoFrameResult> = {};
        const probeCount = Math.min(12, frames.length);
        let detected = 0;
        for (let index = 0; index < probeCount; index += 1) {
          const bitmap = await fetchFrameBitmap(frames[index]);
          try {
            const result = classifier!.classify(bitmap);
            results[frames[index]] = result;
            stabilityMap[frames[index]] = stabilityAnalyzer.measure(bitmap);
            if (result.faceDetected) detected += 1;
          } finally {
            bitmap.close();
          }
          analyzeDone += 1;
          await yieldToUi();
        }
        if (detected === 0) {
          // アニメ顔でMediaPipeが全滅 → 領域解析へ切替(安定性も測り直す)。
          useMediapipe = false;
          analyzeDone = 0;
          stabilityAnalyzer.reset();
          stabilityMap = {};
        } else {
          for (let index = probeCount; index < frames.length; index += 1) {
            const bitmap = await fetchFrameBitmap(frames[index]);
            try {
              results[frames[index]] = classifier!.classify(bitmap);
              stabilityMap[frames[index]] = stabilityAnalyzer.measure(bitmap);
            } finally {
              bitmap.close();
            }
            analyzeDone += 1;
            await yieldToUi();
          }
          autoResults = results;
          stabilityResults = stabilityMap;
          analyzeMethod = 'mediapipe';
        }
      }

      if (!useMediapipe) {
        if (!eyeRegion || !mouthRegion) {
          throw new Error('アニメ顔のため顔検出に失敗しました。「🎯 目と口の位置を指定」でフレーム上の目と口をクリックしてから、もう一度実行してください。');
        }
        regionAnalyzer ??= new RegionDarkRatioAnalyzer();
        const eyeDark: number[] = [];
        const eyeBright: number[] = [];
        const mouthDark: number[] = [];
        for (const filename of frames) {
          const bitmap = await fetchFrameBitmap(filename);
          try {
            const [eyeMeasure, mouthMeasure] = regionAnalyzer.measureDetail(bitmap, [eyeRegion, mouthRegion]);
            eyeDark.push(eyeMeasure.dark);
            eyeBright.push(eyeMeasure.bright);
            mouthDark.push(mouthMeasure.dark);
            stabilityMap[filename] = stabilityAnalyzer.measure(bitmap);
          } finally {
            bitmap.close();
          }
          analyzeDone += 1;
          await yieldToUi();
        }
        // 瞳ハイライトの明部率を補助信号にする(アニメ顔補正)。
        const series = analyzeRegionSeries(eyeDark, mouthDark, eyeBright);
        const results: Record<string, AutoFrameResult> = {};
        frames.forEach((filename, index) => {
          results[filename] = series[index];
        });
        autoResults = results;
        stabilityResults = stabilityMap;
        analyzeMethod = 'region';
      }

      persistAutoResults();
      if (mode === 'auto') applyAutoSelection();
    } catch (e) {
      analyzeError = e instanceof Error ? e.message : String(e);
    } finally {
      isAnalyzing = false;
    }
  }

  /**
   * autoモード: 6状態それぞれ最良候補を仮タグ(source:auto, locked:false)にする。locked(手動確定)は上書きしない。
   * 時間的解析が使える場合は持続性込みの候補を採用し、条件を満たさない状態は無理に埋めない。
   * 解析結果が単フレーム分しか無い場合のみ従来のフレーム独立判定へフォールバックする。
   */
  function applyAutoSelection(): void {
    const next: FrameTagMap = { ...frameTags };
    for (const [filename, tag] of Object.entries(next)) {
      if (!tag.locked && tag.source === 'auto') delete next[filename];
    }
    const lockedStates = new Set(Object.values(next).filter((tag) => tag.locked).map(faceStateIdOf));
    const assign = (stateId: FaceStateId, filename: string, confidence: number) => {
      if (lockedStates.has(stateId)) return;
      if (next[filename]?.locked) return;
      // 手動候補に登録されたフレームはユーザーの作業対象なので自動仮選択で触らない。
      if (manualCandidates.includes(filename)) return;
      next[filename] = { ...parseFaceStateId(stateId), source: 'auto', locked: false, confidence };
    };

    if (temporalAnalysis) {
      for (const [stateId, verdict] of Object.entries(temporalAnalysis.states)) {
        const best = verdict.candidates[0];
        if (best) assign(stateId as FaceStateId, best.filename, best.strength);
      }
    } else {
      const candidates = pickCandidates(autoResults, 1);
      for (const [stateId, list] of Object.entries(candidates)) {
        const best = list?.[0];
        if (!best || best.result.confidence <= 0) continue;
        assign(stateId as FaceStateId, best.filename, best.result.confidence);
      }
    }
    frameTags = next;
    persistTags();
  }

  /** 候補ランキングUIの表示順(目開き系→目閉じ系、口閉じ→全開)。 */
  const FACE_STATE_ORDER: { id: FaceStateId; label: string }[] = EYE_STATE_LABELS.flatMap(({ state: eyes, label: eyeLabel }) =>
    MOUTH_STATE_LABELS.map(({ state: mouth, label: mouthLabel }) => ({
      id: faceStateIdOf({ eyes, mouth }),
      label: `${eyeLabel}・${mouthLabel}`,
    })),
  );

  /** 候補UIからの最終選択: その状態の既存タグを置き換え、選んだフレームをユーザー確定にする。 */
  function adoptCandidate(stateId: FaceStateId, filename: string): void {
    const next: FrameTagMap = { ...frameTags };
    for (const [file, tag] of Object.entries(next)) {
      if (file !== filename && faceStateIdOf(tag) === stateId) delete next[file];
    }
    next[filename] = { ...parseFaceStateId(stateId), source: 'manual', locked: true };
    frameTags = next;
    persistTags();
  }

  function isAdoptedFor(stateId: FaceStateId, filename: string): boolean {
    const tag = frameTags[filename];
    return tag !== undefined && faceStateIdOf(tag) === stateId;
  }

  /** 自動補助モード: 現在フレームのAI候補をユーザー確定(manual/locked)として採用する。 */
  function adoptCurrentSuggestion(): void {
    if (!currentFrame || !currentSuggestion?.faceDetected) return;
    frameTags = {
      ...frameTags,
      [currentFrame]: { eyes: currentSuggestion.eyes, mouth: currentSuggestion.mouth, source: 'manual', locked: true },
    };
    persistTags();
  }

  function clearOrganizerImages(): void {
    for (const image of organizerImages) URL.revokeObjectURL(image.previewUrl);
    organizerImages = [];
    organizerAnalyzedCount = 0;
    organizerError = '';
  }

  function onOrganizerFilesChange(event: Event): void {
    const input = event.target as HTMLInputElement;
    const files = [...(input.files ?? [])].filter(
      (file) => file.type === 'image/png' || file.name.toLowerCase().endsWith('.png'),
    );
    clearOrganizerImages();
    organizerImages = files.map((file, index) => ({
      id: `${file.name}:${file.size}:${file.lastModified}:${index}`,
      file,
      sourceName: file.name,
      previewUrl: URL.createObjectURL(file),
      analysis: null,
      faceDetected: null,
      error: '',
    }));
    if (files.length === 0 && (input.files?.length ?? 0) > 0) organizerError = 'PNG画像のみ選択できます。';
  }

  async function runOrganizerAnalysis(): Promise<void> {
    if (organizerImages.length === 0 || organizerIsAnalyzing) return;
    organizerIsAnalyzing = true;
    organizerAnalyzedCount = 0;
    organizerError = '';
    try {
      let useMediapipe = true;
      try {
        classifier ??= new FaceAutoClassifier();
        await classifier.init();
      } catch {
        useMediapipe = false;
      }
      regionAnalyzer ??= new RegionDarkRatioAnalyzer();
      const organizerEyeRegion: NormRegion = { cx: 0.5, cy: 0.38, w: 0.34, h: 0.12 };
      const organizerMouthRegion: NormRegion = { cx: 0.5, cy: 0.62, w: 0.2, h: 0.12 };
      const valid: {
        id: string;
        autoResult: AutoFrameResult;
        eyeDark: number;
        eyeBright: number;
        mouthDark: number;
      }[] = [];
      for (const image of organizerImages) {
        let bitmap: ImageBitmap | null = null;
        try {
          bitmap = await createImageBitmap(image.file);
          const [eyeMeasure, mouthMeasure] = regionAnalyzer.measureDetail(bitmap, [organizerEyeRegion, organizerMouthRegion]);
          valid.push({
            id: image.id,
            autoResult: useMediapipe ? classifier!.classify(bitmap) : { ...NO_FACE_RESULT },
            eyeDark: eyeMeasure.dark,
            eyeBright: eyeMeasure.bright,
            mouthDark: mouthMeasure.dark,
          });
        } catch (error) {
          const message = error instanceof Error ? error.message : String(error);
          organizerImages = organizerImages.map((entry) =>
            entry.id === image.id ? { ...entry, error: message, faceDetected: false } : entry,
          );
        } finally {
          bitmap?.close();
        }
        organizerAnalyzedCount += 1;
        await new Promise((resolve) => setTimeout(resolve));
      }
      const mediapipeDetected = valid.filter((entry) => entry.autoResult.faceDetected).length;
      const fallbackResults =
        mediapipeDetected === 0 && valid.length > 0
          ? analyzeRegionSeries(
              valid.map((entry) => entry.eyeDark),
              valid.map((entry) => entry.mouthDark),
              valid.map((entry) => entry.eyeBright),
            )
          : null;
      const completed = new Map(
        valid.map((entry, index) => {
          const result = fallbackResults?.[index] ?? entry.autoResult;
          return [entry.id, result] as const;
        }),
      );
      organizerImages = organizerImages.map((entry) => {
        const result = completed.get(entry.id);
        if (!result) return entry;
        return {
          ...entry,
          analysis: organizerAnalysisFromAuto(result),
          faceDetected: result.faceDetected,
          error: result.faceDetected ? '' : '顔を検出できなかったため信頼度は0%です。',
        };
      });
    } catch (error) {
      organizerError = error instanceof Error ? error.message : String(error);
    } finally {
      organizerIsAnalyzing = false;
    }
  }

  function downloadOrganizerImage(image: OrganizerImage): void {
    if (!image.analysis) return;
    const anchor = document.createElement('a');
    anchor.href = image.previewUrl;
    anchor.download = organizerFilename(organizerCharacterName, image.analysis);
    document.body.appendChild(anchor);
    anchor.click();
    document.body.removeChild(anchor);
  }

  async function inspectPuruPuruMaterial(
    filename: string,
  ): Promise<PuruPuruMaterialFileCheck> {
    const url = `${purupuruMaterialDirectoryUrl}/${filename}`;
    let bitmap: ImageBitmap | null = null;
    try {
      const response = await fetch(url, { cache: 'no-store' });
      if (!response.ok) {
        return {
          filename,
          exists: false,
          width: null,
          height: null,
          hasTransparency: null,
          error: response.status === 404 ? 'ファイルが見つかりません' : `HTTP ${response.status}`,
        };
      }
      const blob = await response.blob();
      bitmap = await createImageBitmap(blob);
      const canvas = document.createElement('canvas');
      canvas.width = bitmap.width;
      canvas.height = bitmap.height;
      const context = canvas.getContext('2d', { willReadFrequently: true });
      if (!context) throw new Error('透過確認用Canvasを作成できません。');
      context.drawImage(bitmap, 0, 0);
      const pixels = context.getImageData(0, 0, canvas.width, canvas.height).data;
      let hasTransparency = false;
      for (let index = 3; index < pixels.length; index += 4) {
        if (pixels[index] < 255) {
          hasTransparency = true;
          break;
        }
      }
      return {
        filename,
        exists: true,
        width: bitmap.width,
        height: bitmap.height,
        hasTransparency,
      };
    } catch (error) {
      return {
        filename,
        exists: false,
        width: null,
        height: null,
        hasTransparency: null,
        error: error instanceof Error ? error.message : String(error),
      };
    } finally {
      bitmap?.close();
    }
  }

  async function runPuruPuruMaterialCheck(): Promise<void> {
    if (isCheckingPuruPuruMaterials) return;
    isCheckingPuruPuruMaterials = true;
    purupuruMaterialChecks = [];
    purupuruMaterialCheckDone = 0;
    purupuruMaterialCheckError = '';
    try {
      const checks: PuruPuruMaterialFileCheck[] = [];
      for (const filename of purupuruMaterialFilenames) {
        checks.push(await inspectPuruPuruMaterial(filename));
        purupuruMaterialChecks = [...checks];
        purupuruMaterialCheckDone += 1;
        await new Promise((resolve) => setTimeout(resolve));
      }
    } catch (error) {
      purupuruMaterialCheckError = error instanceof Error ? error.message : String(error);
    } finally {
      isCheckingPuruPuruMaterials = false;
    }
  }

  async function onFacePngImport(key: PuruPuruFaceKey, event: Event): Promise<void> {
    const input = event.currentTarget as HTMLInputElement;
    const file = input.files?.[0];
    input.value = '';
    if (!file) return;
    pngImportError = '';
    pngImportSavedUrl = '';
    if (file.type !== 'image/png' && !file.name.toLowerCase().endsWith('.png')) {
      pngImportError = `${FACE_LABELS[key]}はPNGファイルを選択してください。`;
      return;
    }
    let bitmap: ImageBitmap | null = null;
    try {
      bitmap = await createImageBitmap(file);
      const canvas = document.createElement('canvas');
      canvas.width = bitmap.width;
      canvas.height = bitmap.height;
      const context = canvas.getContext('2d', { willReadFrequently: true });
      if (!context) throw new Error('透過確認用Canvasを作成できません。');
      context.drawImage(bitmap, 0, 0);
      const pixels = context.getImageData(0, 0, canvas.width, canvas.height).data;
      let hasTransparency = false;
      for (let index = 3; index < pixels.length; index += 4) {
        if (pixels[index] < 255) {
          hasTransparency = true;
          break;
        }
      }
      const previous = importedFacePngs[key];
      if (previous) URL.revokeObjectURL(previous.previewUrl);
      importedFacePngs = {
        ...importedFacePngs,
        [key]: {
          file,
          previewUrl: URL.createObjectURL(file),
          width: bitmap.width,
          height: bitmap.height,
          hasTransparency,
        },
      };
    } catch (error) {
      pngImportError = error instanceof Error ? error.message : String(error);
    } finally {
      bitmap?.close();
    }
  }

  function removeImportedFace(key: PuruPuruFaceKey): void {
    const previous = importedFacePngs[key];
    if (previous) URL.revokeObjectURL(previous.previewUrl);
    const next = { ...importedFacePngs };
    delete next[key];
    importedFacePngs = next;
    pngImportSavedUrl = '';
  }

  async function exportImportedPuruPuru(): Promise<void> {
    if (!targetCharacter || !pngImportReady || pngImportSaving) return;
    pngImportSaving = true;
    pngImportError = '';
    pngImportSavedUrl = '';
    characterAvatarSaved = false;
    try {
      const faces: Partial<Record<PuruPuruFaceKey, Blob>> = {};
      for (const key of PURUPURU_FACE_KEYS) faces[key] = importedFacePngs[key]!.file;
      const blob = await packPuruPuruPackage({ faces });
      const modelName = targetCharacter.id;
      const form = new FormData();
      form.set('name', modelName);
      form.set('file', blob, `${modelName}.purupuru`);
      const saveResponse = await fetch('/api/purupuru', { method: 'POST', body: form });
      const saveResult = await saveResponse.json().catch(() => ({})) as {
        ok?: boolean;
        exists?: boolean;
        url?: string;
        error?: string;
      };
      if (!saveResponse.ok || !saveResult.ok || !saveResult.exists || !saveResult.url) {
        throw new Error(saveResult.error ?? `.purupuruの保存に失敗しました（HTTP ${saveResponse.status}）。`);
      }
      const characterResponse = await fetch(`/api/characters/${encodeURIComponent(targetCharacter.id)}`, {
        method: 'PUT',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ avatarType: 'purupuru', avatarSrc: saveResult.url }),
      });
      const characterResult = await characterResponse.json().catch(() => ({})) as {
        character?: PuruPuruTargetCharacter;
        message?: string;
      };
      if (!characterResponse.ok || !characterResult.character) {
        throw new Error(characterResult.message ?? 'キャラクター設定への保存に失敗しました。');
      }
      targetCharacter = characterResult.character;
      characterAvatarSaved = true;
      pngImportSavedUrl = saveResult.url;

      const downloadUrl = URL.createObjectURL(blob);
      const anchor = document.createElement('a');
      anchor.href = downloadUrl;
      anchor.download = `${modelName}.purupuru`;
      document.body.appendChild(anchor);
      anchor.click();
      document.body.removeChild(anchor);
      URL.revokeObjectURL(downloadUrl);
    } catch (error) {
      pngImportError = error instanceof Error ? error.message : String(error);
    } finally {
      pngImportSaving = false;
    }
  }

  async function loadTargetCharacter(): Promise<void> {
    if (!requestedCharacterId) return;
    targetCharacterLoading = true;
    targetCharacterError = '';
    try {
      const response = await fetch(`/api/characters/${encodeURIComponent(requestedCharacterId)}`);
      const data = await response.json().catch(() => ({})) as {
        character?: PuruPuruTargetCharacter;
        message?: string;
      };
      if (!response.ok || !data.character) {
        throw new Error(data.message ?? `キャラクターを取得できませんでした（HTTP ${response.status}）。`);
      }
      targetCharacter = data.character;
      purupuruName = data.character.id;
      organizerCharacterName = data.character.id;
    } catch (error) {
      targetCharacterError = error instanceof Error ? error.message : String(error);
    } finally {
      targetCharacterLoading = false;
    }
  }

  async function loadAvailableCharacters(): Promise<void> {
    availableCharactersLoading = true;
    try {
      const response = await fetch('/api/characters');
      const data = await response.json().catch(() => ({})) as { characters?: PuruPuruTargetCharacter[] };
      availableCharacters = response.ok && Array.isArray(data.characters) ? data.characters : [];
    } finally {
      availableCharactersLoading = false;
    }
  }

  function selectTargetCharacter(event: Event): void {
    const id = (event.currentTarget as HTMLSelectElement).value;
    if (id) window.location.href = `/mouth-picker?character=${encodeURIComponent(id)}`;
  }

  onMount(() => {
    if (requestedCharacterId) void loadTargetCharacter();
    else void loadAvailableCharacters();
  });

  onDestroy(() => {
    classifier?.dispose();
    classifier = null;
    for (const image of organizerImages) URL.revokeObjectURL(image.previewUrl);
    for (const key of PURUPURU_FACE_KEYS) {
      const imported = importedFacePngs[key];
      if (imported) URL.revokeObjectURL(imported.previewUrl);
    }
  });
  const tagCounts = $derived({
    open:  Object.values(frameTags).filter((tag) => tag.mouth === 'mouth_open').length,
    mid:   Object.values(frameTags).filter((tag) => tag.mouth === 'mouth_half').length,
    close: Object.values(frameTags).filter((tag) => tag.mouth === 'mouth_closed').length,
    eyesClosed: Object.values(frameTags).filter((tag) => tag.eyes === 'eyes_closed').length,
  });
  const taggedEntries = $derived(Object.entries(frameTags));

  async function extract() {
    if (!videoFile) return;
    isExtracting = true;
    extractError = '';
    frames = [];
    frameTags = {};
    autoResults = {};
    stabilityResults = {};
    manualCandidates = [];
    manualNotice = '';
    analyzeDone = 0;
    analyzeError = '';
    exportPaths = [];

    try {
      const fd = new FormData();
      fd.append('file', videoFile);
      const res = await fetch('/api/export-frames', { method: 'POST', body: fd });
      const result = await res.json();
      if (!result.ok) throw new Error(result.error ?? 'ffmpeg failed');

      const frRes = await fetch('/api/mouth-picker/frames');
      const frData: FramesResponse = await frRes.json();
      frames = frData.files ?? [];
      currentIndex = 0;
      loadStoredTags();
    } catch (e) {
      extractError = String(e);
    } finally {
      isExtracting = false;
    }
  }

  /** 片軸だけ指定された場合、もう片方は既存値(なければ目開き・口閉じ)を引き継ぐ。手動操作は常にlocked。 */
  function tagCurrentAxis(update: { eyes?: EyeState; mouth?: MouthOpenState }) {
    if (!currentFrame) return;
    const previous = frameTags[currentFrame];
    frameTags = {
      ...frameTags,
      [currentFrame]: {
        eyes: update.eyes ?? previous?.eyes ?? 'eyes_open',
        mouth: update.mouth ?? previous?.mouth ?? 'mouth_closed',
        source: 'manual',
        locked: true,
      },
    };
    persistTags();
  }

  function toggleEyeCurrent() {
    if (!currentFrame) return;
    const current = frameTags[currentFrame]?.eyes ?? 'eyes_open';
    tagCurrentAxis({ eyes: current === 'eyes_open' ? 'eyes_closed' : 'eyes_open' });
  }

  function untag(filename: string) {
    const next = { ...frameTags };
    delete next[filename];
    frameTags = next;
    persistTags();
  }

  function mouthLabelOf(state: MouthOpenState): string {
    return MOUTH_STATE_LABELS.find((entry) => entry.state === state)?.label ?? state;
  }

  const FACE_LABELS: Record<PuruPuruFaceKey, string> = {
    eyesOpenMouthClosed: '目開き・口閉じ',
    eyesOpenMouthHalf: '目開き・口半開き',
    eyesOpenMouthOpen: '目開き・口全開',
    eyesClosedMouthClosed: '目閉じ・口閉じ',
    eyesClosedMouthHalf: '目閉じ・口半開き',
    eyesClosedMouthOpen: '目閉じ・口全開',
  };

  function faceKeyFor(tag: FrameTag): PuruPuruFaceKey {
    const mouth = tag.mouth === 'mouth_open' ? 'MouthOpen' : tag.mouth === 'mouth_half' ? 'MouthHalf' : 'MouthClosed';
    return `${tag.eyes === 'eyes_closed' ? 'eyesClosed' : 'eyesOpen'}${mouth}` as PuruPuruFaceKey;
  }

  // 6状態それぞれの代表フレーム(同一状態に複数タグがあれば最初の1枚)。
  const faceAssignments = $derived.by(() => {
    const map: Partial<Record<PuruPuruFaceKey, string>> = {};
    for (const [filename, tag] of Object.entries(frameTags)) {
      map[faceKeyFor(tag)] ??= filename;
    }
    return map;
  });

  const faceSources = $derived.by(() => {
    try {
      return resolveFaceSources(Object.keys(faceAssignments) as PuruPuruFaceKey[]);
    } catch {
      return null;
    }
  });

  async function exportPuruPuru() {
    if (!faceSources || isPacking) return;
    isPacking = true;
    packError = '';
    packDone = false;
    characterAvatarSaved = false;
    savedPuruPuruUrl = '';
    try {
      const faces: Partial<Record<PuruPuruFaceKey, Blob>> = {};
      for (const [key, filename] of Object.entries(faceAssignments)) {
        const res = await fetch(`/frames/${filename}`);
        if (!res.ok) throw new Error(`フレームを取得できません: ${filename}`);
        faces[key as PuruPuruFaceKey] = await res.blob();
      }
      const blob = await packPuruPuruPackage({ faces });
      const modelName = targetCharacter?.id ?? (purupuruName.trim().replace(/\.purupuru$/i, '') || 'avatar');
      const form = new FormData();
      form.set('name', modelName);
      form.set('file', blob, `${modelName}.purupuru`);
      const saveResponse = await fetch('/api/purupuru', { method: 'POST', body: form });
      const saveResult = await saveResponse.json() as { ok?: boolean; exists?: boolean; url?: string; error?: string };
      if (!saveResponse.ok || !saveResult.ok || !saveResult.exists || !saveResult.url) {
        throw new Error(saveResult.error || `.purupuru の保存に失敗しました（HTTP ${saveResponse.status}）。`);
      }

      if (targetCharacter) {
        const characterResponse = await fetch(`/api/characters/${encodeURIComponent(targetCharacter.id)}`, {
          method: 'PUT',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ avatarType: 'purupuru', avatarSrc: saveResult.url }),
        });
        const characterResult = await characterResponse.json().catch(() => ({})) as {
          character?: PuruPuruTargetCharacter;
          message?: string;
        };
        if (!characterResponse.ok || !characterResult.character) {
          throw new Error(characterResult.message ?? 'PuruPuruをキャラクター設定へ保存できませんでした。');
        }
        targetCharacter = characterResult.character;
        characterAvatarSaved = true;
      }

      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${modelName}.purupuru`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      savedPuruPuruUrl = saveResult.url;
      packDone = true;
    } catch (e) {
      packError = e instanceof Error ? e.message : String(e);
    } finally {
      isPacking = false;
    }
  }

  function downloadFrame(filename: string, tag: FrameTag) {
    const mouthName = tag.mouth === 'mouth_open' ? 'mouth_open' : tag.mouth === 'mouth_half' ? 'mouth_mid' : 'mouth_close';
    const eyePrefix = tag.eyes === 'eyes_closed' ? 'eyes_closed_' : '';
    const a = document.createElement('a');
    a.href = `/frames/${filename}`;
    a.download = `${eyePrefix}${mouthName}.png`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
  }

  async function exportToStatic() {
    if (taggedEntries.length === 0) return;
    isExporting = true;
    exportPaths = [];
    try {
      const res = await fetch('/api/mouth-picker/export', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ tags: toLegacyTagMap(frameTags) }),
      });
      const data: ExportResponse = await res.json();
      if (!data.ok || !data.manifest) throw new Error(data.error ?? 'export failed');
      exportPaths = Object.entries(data.manifest).map(([shape, p]) => ({ shape, path: p }));
    } catch (e) {
      extractError = String(e);
    } finally {
      isExporting = false;
    }
  }

  function onFileChange(e: Event) {
    const input = e.target as HTMLInputElement;
    videoFile = input.files?.[0] ?? null;
    frames = [];
    frameTags = {};
    autoResults = {};
    stabilityResults = {};
    manualCandidates = [];
    manualNotice = '';
    analyzeError = '';
    analyzeDone = 0;
    extractError = '';
    exportPaths = [];
    packError = '';
    packDone = false;
  }

  function prev() { if (currentIndex > 0) currentIndex -= 1; }
  function next() { if (currentIndex < frames.length - 1) currentIndex += 1; }

  function handleKey(e: KeyboardEvent) {
    if (frames.length === 0) return;
    const tag = e.target as HTMLElement;
    if (tag.tagName === 'INPUT') return;
    switch (e.key) {
      case 'o': case 'O': tagCurrentAxis({ mouth: 'mouth_open' }); break;
      case 'h': case 'H': tagCurrentAxis({ mouth: 'mouth_half' }); break;
      case 'c': case 'C': tagCurrentAxis({ mouth: 'mouth_closed' }); break;
      case 'e': case 'E': toggleEyeCurrent(); break;
      case 'ArrowRight': next(); break;
      case 'ArrowLeft':  prev(); break;
    }
  }
</script>

<svelte:window onkeydown={handleKey} />

<div class="page">
  <header class="header">
    <h1>MOUTH PICKER <span class="sub">口パク素材ピッカー</span></h1>
    <a href="/" class="back">← HOME</a>
  </header>

  <section class="card target-character-card">
    <div>
      <span class="target-eyebrow">PURUPURU MATERIAL BUILDER</span>
      <h2>PuruPuru素材作成</h2>
      {#if targetCharacterLoading}
        <p class="hint">対象キャラクターを読み込んでいます…</p>
      {:else if targetCharacter}
        <p class="target-name">対象キャラクター: <strong>{targetCharacter.name}</strong> <code>{targetCharacter.id}</code></p>
        {#if targetCharacter.avatarType === 'purupuru' && targetCharacter.avatarSrc}
          <p class="ok">✓ 現在の設定: <code>{targetCharacter.avatarSrc}</code></p>
        {/if}
      {:else if requestedCharacterId}
        <p class="error">⚠ {targetCharacterError || `キャラクター「${requestedCharacterId}」を読み込めませんでした。`}</p>
      {:else}
        <label class="target-select">
          <span>対象キャラクターを選択</span>
          <select onchange={selectTargetCharacter} disabled={availableCharactersLoading}>
            <option value="">{availableCharactersLoading ? '読み込み中…' : 'キャラクターを選択してください'}</option>
            {#each availableCharacters as character (character.id)}
              <option value={character.id}>{character.name} ({character.id})</option>
            {/each}
          </select>
        </label>
      {/if}
    </div>
    <div class="target-actions">
      <a href="/characters">Character Library</a>
      <a href="/characters">＋ 新規キャラクター作成</a>
    </div>
  </section>

  <!-- ── Mode switch ── -->
  <section class="card mode-card">
    <div class="mode-row">
      <span class="axis-label">モード</span>
      <div class="mode-switch" role="group" aria-label="モード切替">
        {#each MOUTH_PICKER_MODES as entry (entry.id)}
          <button class="mode-btn" class:active={mode === entry.id} onclick={() => (mode = entry.id)}>
            {entry.label}
          </button>
        {/each}
      </div>
    </div>
    <p class="mode-desc">{activeMode.description}</p>
    {#if mode !== 'manual' && mode !== 'image-organizer' && mode !== 'png-import'}
      <div class="analyze-row">
        <button class="btn btn-analyze" onclick={runAutoClassify} disabled={frames.length === 0 || isAnalyzing}>
          {isAnalyzing ? `✨ 解析中... ${analyzeDone} / ${frames.length}` : '✨ 目・口を自動分類'}
        </button>
        {#if frames.length === 0}
          <span class="hint-inline">先に動画からフレームを抽出してください</span>
        {:else if Object.keys(autoResults).length > 0 && !isAnalyzing}
          <span class="ok">✓ {Object.keys(autoResults).length} フレームを解析済み{analyzeMethod ? `(エンジン: ${analyzeMethod === 'region' ? '領域解析' : 'MediaPipe'}）` : ''}</span>
        {/if}
      </div>
      {#if analyzeError}<p class="error">⚠ {analyzeError}</p>{/if}
    {/if}
  </section>

  {#if mode === 'image-organizer'}
    <section class="card material-check-card">
      <h2><span class="step">P1</span> PuruPuru登録前チェック</h2>
      <p class="hint">
        <code>static/purupuru/{materialCharacterId}/</code> の規定6枚について、存在・画像サイズ・PNG透過を確認します。
      </p>
      <button class="btn btn-analyze" onclick={runPuruPuruMaterialCheck} disabled={isCheckingPuruPuruMaterials}>
        {isCheckingPuruPuruMaterials
          ? `🔎 チェック中... ${purupuruMaterialCheckDone} / ${purupuruMaterialFilenames.length}`
          : `🔎 ${targetCharacter?.name ?? materialCharacterId}の素材をチェック`}
      </button>
      {#if purupuruMaterialCheckError}<p class="error">⚠ {purupuruMaterialCheckError}</p>{/if}

      {#if purupuruMaterialChecks.length === purupuruMaterialFilenames.length && purupuruMaterialSummary}
        <div class="material-summary" aria-live="polite">
          <div class:passed={purupuruMaterialSummary.allPresent} class:failed={!purupuruMaterialSummary.allPresent}>
            <span>{purupuruMaterialSummary.allPresent ? '✓' : '✕'}</span>
            {purupuruMaterialSummary.allPresent
              ? '6枚そろっています'
              : `${purupuruMaterialSummary.presentCount} / 6枚（不足あり）`}
          </div>
          <div class:passed={purupuruMaterialSummary.sizeMatch} class:failed={!purupuruMaterialSummary.sizeMatch}>
            <span>{purupuruMaterialSummary.sizeMatch ? '✓' : '✕'}</span>
            {purupuruMaterialSummary.sizeMatch
              ? `サイズ一致（${purupuruMaterialSummary.referenceSize?.width} × ${purupuruMaterialSummary.referenceSize?.height}）`
              : 'サイズ不一致、または未確認の画像があります'}
          </div>
          <div class:passed={purupuruMaterialSummary.allHaveTransparency} class:failed={!purupuruMaterialSummary.allHaveTransparency}>
            <span>{purupuruMaterialSummary.allHaveTransparency ? '✓' : '✕'}</span>
            {purupuruMaterialSummary.allHaveTransparency
              ? '6枚すべて透過あり'
              : '透過なし、または未確認の画像があります'}
          </div>
        </div>
      {/if}

      {#if purupuruMaterialChecks.length > 0}
        <div class="organizer-table-wrap material-file-table">
          <table class="export-table">
            <thead>
              <tr>
                <th>規定ファイル</th>
                <th>存在</th>
                <th>サイズ</th>
                <th>透過</th>
                <th>詳細</th>
              </tr>
            </thead>
            <tbody>
              {#each purupuruMaterialChecks as check (check.filename)}
                <tr>
                  <td class="filename">{check.filename}</td>
                  <td class:check-pass={check.exists} class:check-fail={!check.exists}>{check.exists ? '✓' : '✕'}</td>
                  <td>{check.width !== null && check.height !== null ? `${check.width} × ${check.height}` : '—'}</td>
                  <td class:check-pass={check.hasTransparency === true} class:check-fail={check.hasTransparency === false}>
                    {check.hasTransparency === null ? '—' : check.hasTransparency ? '✓ あり' : '✕ なし'}
                  </td>
                  <td>{check.error ?? '—'}</td>
                </tr>
              {/each}
            </tbody>
          </table>
        </div>
      {/if}
    </section>

    <section class="card organizer-card">
      <h2><span class="step">01</span> 複数PNGを読み込む</h2>
      <p class="hint">画像はブラウザ内で解析されます。既存ファイルやPuruPuru書き出しデータは変更しません。</p>
      <div class="upload-row">
        <label class="file-label">
          <input type="file" accept="image/png,.png" multiple onchange={onOrganizerFilesChange} class="file-input" />
          {organizerImages.length > 0 ? `${organizerImages.length}枚を選択中` : 'PNG画像を複数選択'}
        </label>
        <button class="btn btn-analyze" onclick={runOrganizerAnalysis} disabled={organizerImages.length === 0 || organizerIsAnalyzing}>
          {organizerIsAnalyzing
            ? `✨ 解析中... ${organizerAnalyzedCount} / ${organizerImages.length}`
            : '✨ 6状態へ自動分類'}
        </button>
      </div>
      {#if organizerError}<p class="error">⚠ {organizerError}</p>{/if}
    </section>

    {#if organizerImages.length > 0}
      <section class="card">
        <h2><span class="step">02</span> 6状態の充足チェック</h2>
        <div class="organizer-toolbar">
          <label class="character-field">
            <span>キャラクター名</span>
            <input class="purupuru-name" type="text" bind:value={organizerCharacterName} readonly={Boolean(targetCharacter)} placeholder="shiro" />
          </label>
          <span class="hint-inline">例: {organizerFilename(organizerCharacterName, { eye: 'open', mouth: 'closed' })}</span>
        </div>
        <div class="coverage-grid">
          {#each ORGANIZER_STATE_KEYS as key (key)}
            <div class="coverage-item" class:complete={organizerStateCoverage[key]}>
              <span aria-hidden="true">{organizerStateCoverage[key] ? '✅' : '❌'}</span>
              <code>{key}</code>
            </div>
          {/each}
        </div>
      </section>

      <section class="card">
        <h2><span class="step">03</span> 解析結果一覧</h2>
        <div class="organizer-table-wrap">
          <table class="export-table organizer-table">
            <thead>
              <tr>
                <th>元画像</th>
                <th>判定結果</th>
                <th>信頼度</th>
                <th>新ファイル名</th>
                <th>DL</th>
              </tr>
            </thead>
            <tbody>
              {#each organizerImages as image (image.id)}
                <tr>
                  <td>
                    <div class="organizer-source">
                      <img src={image.previewUrl} alt={image.sourceName} />
                      <span class="filename">{image.sourceName}</span>
                    </div>
                  </td>
                  <td>
                    {#if image.analysis}
                      <code>eye: {image.analysis.eye}<br />mouth: {image.analysis.mouth}</code>
                      {#if image.faceDetected === false}<span class="organizer-warning">顔未検出</span>{/if}
                    {:else}
                      <span class="hint-inline">未解析</span>
                    {/if}
                  </td>
                  <td>{image.analysis ? `${Math.round(image.analysis.confidence * 100)}%` : '—'}</td>
                  <td class="filename">
                    {image.analysis ? organizerFilename(organizerCharacterName, image.analysis) : '—'}
                    {#if image.error}<span class="organizer-warning">{image.error}</span>{/if}
                  </td>
                  <td>
                    <button class="btn btn-dl" onclick={() => downloadOrganizerImage(image)} disabled={!image.analysis}>↓</button>
                  </td>
                </tr>
              {/each}
            </tbody>
          </table>
        </div>
      </section>
    {/if}
  {:else if mode === 'png-import'}
    <section class="card png-import-card">
      <h2><span class="step">01</span> 完成済みPNGを6表情へ登録</h2>
      <p class="hint">各状態に対応する透過PNGを1枚ずつ選択してください。画像は分類せず、そのままパッケージへ格納します。</p>
      {#if !targetCharacter}
        <p class="error">⚠ 先に画面上部で対象キャラクターを選択してください。</p>
      {/if}
      <div class="png-import-grid">
        {#each PURUPURU_FACE_KEYS as key (key)}
          {@const asset = importedFacePngs[key]}
          <article class="png-import-slot" class:filled={Boolean(asset)}>
            <div class="png-import-slot-head">
              <strong>{FACE_LABELS[key]}</strong>
              <span>{asset ? '✓ 登録済み' : '未登録'}</span>
            </div>
            {#if asset}
              <img src={asset.previewUrl} alt={`${FACE_LABELS[key]}プレビュー`} />
              <div class="png-import-meta">
                <code>{asset.file.name}</code>
                <span>{asset.width} × {asset.height}</span>
                <span class:check-pass={asset.hasTransparency} class:check-fail={!asset.hasTransparency}>
                  {asset.hasTransparency ? '✓ 透過あり' : '✕ 透過なし'}
                </span>
              </div>
              <div class="png-import-actions">
                <label class="btn btn-nav">
                  差し替え
                  <input type="file" accept="image/png,.png" onchange={(event) => void onFacePngImport(key, event)} />
                </label>
                <button class="btn btn-remove" onclick={() => removeImportedFace(key)}>削除</button>
              </div>
            {:else}
              <label class="png-import-drop">
                <span>PNGを選択</span>
                <input type="file" accept="image/png,.png" onchange={(event) => void onFacePngImport(key, event)} />
              </label>
            {/if}
          </article>
        {/each}
      </div>
    </section>

    <section class="card">
      <h2><span class="step">02</span> 登録前チェック</h2>
      <div class="material-summary png-import-summary">
        <div class:passed={Boolean(targetCharacter)} class:failed={!targetCharacter}>
          <span>{targetCharacter ? '✓' : '✕'}</span>
          {targetCharacter ? `対象: ${targetCharacter.name} (${targetCharacter.id})` : '対象キャラクター未指定'}
        </div>
        <div class:passed={importedFaceCount === PURUPURU_FACE_KEYS.length} class:failed={importedFaceCount !== PURUPURU_FACE_KEYS.length}>
          <span>{importedFaceCount === PURUPURU_FACE_KEYS.length ? '✓' : '✕'}</span>
          PNG {importedFaceCount} / {PURUPURU_FACE_KEYS.length}枚
        </div>
        <div class:passed={pngImportSizeMatch} class:failed={!pngImportSizeMatch}>
          <span>{pngImportSizeMatch ? '✓' : '✕'}</span>
          {pngImportSizeMatch ? '6枚のサイズ一致' : 'サイズ未確認、または不一致'}
        </div>
        <div class:passed={pngImportTransparencyOk} class:failed={!pngImportTransparencyOk}>
          <span>{pngImportTransparencyOk ? '✓' : '✕'}</span>
          {pngImportTransparencyOk ? '6枚すべて透過あり' : '透過なし、または未登録の画像あり'}
        </div>
      </div>
      {#if pngImportError}<p class="error">⚠ {pngImportError}</p>{/if}
    </section>

    <section class="card png-import-export">
      <h2><span class="step">03</span> .purupuru書き出し</h2>
      <p class="hint">
        出力: <code>static/purupuru/{targetCharacter?.id ?? 'character'}.purupuru</code><br />
        キャラクター設定の <code>avatarSrc</code> も同時に更新します。
      </p>
      <button class="btn btn-export" onclick={exportImportedPuruPuru} disabled={!pngImportReady || pngImportSaving}>
        {pngImportSaving ? '書き出し中…' : `⬇ ${targetCharacter?.id ?? 'character'}.purupuruを生成`}
      </button>
      {#if pngImportSavedUrl}
        <p class="ok">✓ 保存・登録しました: <a href={pngImportSavedUrl} target="_blank" rel="noreferrer">{pngImportSavedUrl}</a></p>
      {/if}
    </section>
  {:else}

  <!-- ── Step 1: Upload ── -->
  <section class="card">
    <h2><span class="step">01</span> 動画を選択してフレーム抽出</h2>
    <p class="hint">推奨: 10秒以内のMP4 &nbsp;|&nbsp; 30fps で抽出されます &nbsp;|&nbsp; FFmpeg が必要</p>
    <div class="upload-row">
      <label class="file-label">
        <input type="file" accept=".mp4,.webm" onchange={onFileChange} class="file-input" />
        {videoFile ? videoFile.name : 'ファイルを選択'}
      </label>
      <button class="btn btn-primary" onclick={extract} disabled={!videoFile || isExtracting}>
        {isExtracting ? '抽出中...' : 'フレーム抽出'}
      </button>
    </div>
    {#if extractError}
      <p class="error">⚠ {extractError}</p>
    {/if}
    {#if frames.length > 0}
      <p class="ok">✓ {frames.length} フレームを抽出しました</p>
    {/if}
  </section>

  <!-- ── Step 2: Browse & Tag ── -->
  {#if frames.length > 0}
    <section class="card">
      <h2><span class="step">02</span> タグ付け &nbsp;<span class="hint-inline">キー: C=口閉じ &nbsp;H=口半開き &nbsp;O=口全開 &nbsp;E=目トグル &nbsp;←→=移動</span></h2>

      <div class="region-controls">
        <button
          class="btn btn-nav"
          onclick={() => (regionPickStage = 'eye')}
          disabled={regionPickStage !== 'idle' || !currentFrame}
        >🎯 目と口の位置を指定</button>
        {#if regionPickStage === 'eye'}
          <span class="hint-inline pick-hint">フレーム上の【目】の中心をクリックしてください</span>
        {:else if regionPickStage === 'mouth'}
          <span class="hint-inline pick-hint">次に【口】の中心をクリックしてください</span>
        {:else if eyeRegion && mouthRegion}
          <span class="ok">✓ 領域設定済み(アニメ顔でも自動分類できます)</span>
        {:else}
          <span class="hint-inline">アニメ顔で顔検出に失敗する場合に使います</span>
        {/if}
      </div>

      <div class="viewer" class:picking={regionPickStage !== 'idle'}>
        {#if currentFrame}
          <img class="frame-img" src="/frames/{currentFrame}" alt="frame {currentIndex + 1}" />
          {#if eyeRegion}<span class="region-box region-eye" style={regionStyle(eyeRegion)} aria-hidden="true"></span>{/if}
          {#if mouthRegion}<span class="region-box region-mouth" style={regionStyle(mouthRegion)} aria-hidden="true"></span>{/if}
          {#if regionPickStage !== 'idle'}
            <button class="region-hitbox" aria-label="領域を指定" onclick={onRegionPickClick}></button>
          {:else if mode === 'manual'}
            <button
              class="frame-register-hitbox"
              aria-label="このフレームを候補に登録"
              title="クリックで現在フレームを候補に登録"
              onclick={registerCurrentFrame}
            ></button>
            {#if manualCandidates.includes(currentFrame)}
              <span class="registered-badge" aria-hidden="true">📌 登録済み</span>
            {/if}
          {/if}
          {#if currentTag}
            <span class="tag-badge shape-{mouthStateToShape(currentTag.mouth)}">{mouthLabelOf(currentTag.mouth)}</span>
            {#if currentTag.eyes === 'eyes_closed'}
              <span class="tag-badge shape-eye eye-badge">目閉じ</span>
            {/if}
          {/if}
        {/if}
      </div>

      {#if mode !== 'manual' && currentSuggestion}
        <div class="auto-suggestion">
          {#if currentSuggestion.faceDetected}
            <span class="suggestion-text">
              🤖 AI候補: {currentSuggestion.eyes === 'eyes_closed' ? '目閉じ' : '目開き'}・{mouthLabelOf(currentSuggestion.mouth)}
              <b>信頼度 {Math.round(currentSuggestion.confidence * 100)}%</b>
            </span>
            <button class="btn btn-adopt" onclick={adoptCurrentSuggestion}>✋ 採用して確定</button>
          {:else}
            <span class="suggestion-text face-missing">🤖 このフレームでは顔を検出できませんでした</span>
          {/if}
        </div>
      {/if}

      <div class="seek-row">
        <button class="btn btn-nav" onclick={prev} disabled={currentIndex === 0}>◀</button>
        <input
          class="slider"
          type="range"
          min="0"
          max={frames.length - 1}
          bind:value={currentIndex}
        />
        <button class="btn btn-nav" onclick={next} disabled={currentIndex === frames.length - 1}>▶</button>
        <span class="frame-count">{currentIndex + 1} / {frames.length}</span>
        {#if currentFrame}<code class="frame-name">{frameLabelOf(currentFrame)}</code>{/if}
      </div>

      <div class="axis-groups">
        <div class="axis-group">
          <span class="axis-label">目の状態</span>
          <div class="tag-buttons">
            {#each EYE_STATE_LABELS as { state, label } (state)}
              <button
                class="tag-btn shape-eye"
                class:active={currentTag !== null && currentTag.eyes === state}
                onclick={() => tagCurrentAxis({ eyes: state })}
              >
                {label}
              </button>
            {/each}
          </div>
        </div>
        <div class="axis-group">
          <span class="axis-label">口の状態</span>
          <div class="tag-buttons">
            {#each MOUTH_STATE_LABELS as { state, label, key } (state)}
              <button
                class="tag-btn shape-{mouthStateToShape(state)}"
                class:active={currentTag?.mouth === state}
                onclick={() => tagCurrentAxis({ mouth: state })}
              >
                {label} <kbd>{key}</kbd>
              </button>
            {/each}
          </div>
        </div>
      </div>

      <!-- ── 手動候補リスト(手動モード) ── -->
      {#if mode === 'manual'}
        <div class="manual-candidates">
          <div class="manual-head">
            <span class="axis-label">📌 手動候補 ({manualCandidates.length})</span>
            {#if manualNotice}<span class="manual-notice">{manualNotice}</span>{/if}
          </div>
          {#if manualCandidates.length === 0}
            <p class="hint">プレビュー画像をクリックすると、表示中のフレームを採用候補に登録できます。登録後に上の「目の状態」「口の状態」を選ぶと確定します。</p>
          {:else}
            <div class="manual-list">
              {#each manualCandidates as filename (filename)}
                {@const tag = frameTags[filename] ?? null}
                <div class="manual-cell" class:current={filename === currentFrame}>
                  <button class="candidate-thumb" onclick={() => (currentIndex = frames.indexOf(filename))} title="ビューアで表示">
                    <img src="/frames/{filename}" alt={frameLabelOf(filename)} />
                  </button>
                  <span class="candidate-meta">
                    <code>{frameLabelOf(filename)}</code><br />
                    {#if tag}
                      ✓ {tag.eyes === 'eyes_closed' ? '目閉じ' : '目開き'}・{mouthLabelOf(tag.mouth)}
                    {:else}
                      <span class="manual-pending">未確定 — 目・口の状態を選択してください</span>
                    {/if}
                  </span>
                  <button class="btn btn-remove" onclick={() => removeManualCandidate(filename)} title="候補から外す(確定済みタグは残ります)">×</button>
                </div>
              {/each}
            </div>
          {/if}
        </div>
      {/if}
    </section>
  {/if}

  <!-- ── Step 2+: 時間解析による状態別候補ランキング ── -->
  {#if mode !== 'manual' && temporalAnalysis && !isAnalyzing}
    <section class="card">
      <h2><span class="step">02+</span> 状態別候補(時間解析) <span class="hint-inline">前後フレームの持続性で選定 &nbsp;|&nbsp; サムネクリック=表示 &nbsp;|&nbsp; 採用=最終選択</span></h2>
      <div class="candidate-grid">
        {#each FACE_STATE_ORDER as { id, label } (id)}
          {@const verdict = temporalAnalysis.states[id]}
          <div class="candidate-state" class:empty={verdict.candidates.length === 0}>
            <span class="candidate-state-label">{verdict.candidates.length === 0 ? '❌' : '✦'} {label}</span>
            {#if verdict.candidates.length === 0}
              <p class="candidate-reason">理由: {verdict.missingReason ?? '条件を満たすフレームがありません。'}</p>
            {:else}
              <div class="candidate-list">
                {#each verdict.candidates as candidate, rank (candidate.filename)}
                  {@const adopted = isAdoptedFor(id, candidate.filename)}
                  <div class="candidate-cell" class:adopted>
                    <button class="candidate-thumb" onclick={() => (currentIndex = candidate.index)} title="ビューアで表示">
                      <img src="/frames/{candidate.filename}" alt="{label} 候補{rank + 1}" />
                    </button>
                    <span class="candidate-meta">
                      候補{rank + 1} <code>{candidate.filename.replace(/\.png$/, '')}</code> 信頼度{Math.round(candidate.strength * 100)}%{#if candidate.stabilityScore !== undefined}
                        · 安定度{Math.round(candidate.stabilityScore * 100)}%{/if}
                    </span>
                    <button class="btn btn-adopt candidate-adopt" onclick={() => adoptCandidate(id, candidate.filename)} disabled={adopted}>
                      {adopted ? '✓ 選択中' : '採用'}
                    </button>
                  </div>
                {/each}
              </div>
            {/if}
          </div>
        {/each}
      </div>
    </section>
  {/if}

  <!-- ── Step 3: Export ── -->
  {#if taggedEntries.length > 0}
    <section class="card">
      <h2><span class="step">03</span> ダウンロード &amp; エクスポート</h2>

      <div class="counts">
        <span class="count shape-open">口全開: {tagCounts.open}</span>
        <span class="count shape-mid">口半開き: {tagCounts.mid}</span>
        <span class="count shape-close">口閉じ: {tagCounts.close}</span>
        <span class="count count-eye">目閉じ: {tagCounts.eyesClosed}</span>
      </div>

      <div class="export-actions">
        <button class="btn btn-export" onclick={exportToStatic} disabled={isExporting}>
          {isExporting ? 'エクスポート中...' : '✦ /static/ にエクスポート'}
        </button>
      </div>

      {#if exportPaths.length > 0}
        <div class="manifest">
          <p class="ok">✓ エクスポート完了 — 以下のパスに保存されました:</p>
          {#each exportPaths as { shape, path }}
            <div class="manifest-row">
              <span class="badge shape-{shape}">{shape === 'mid' ? 'half' : shape}</span>
              <code>{path}</code>
            </div>
          {/each}
        </div>
      {/if}

      <!-- ── .purupuru 書き出し(AITuberアバター) ── -->
      <div class="purupuru-export">
        <h3>🎭 .purupuru 書き出し(AITuberアバター用)</h3>
        <p class="hint">口タグ × 目閉じトグルの6状態から差分を組みます。足りない状態は近い差分で自動補完されます。</p>
        <div class="purupuru-grid">
          {#each PURUPURU_FACE_KEYS as key (key)}
            <div class="purupuru-cell" class:filled={Boolean(faceAssignments[key])}>
              <span class="face-label">{FACE_LABELS[key]}</span>
              {#if faceAssignments[key]}
                <img src="/frames/{faceAssignments[key]}" alt={FACE_LABELS[key]} />
              {:else if faceSources}
                <span class="face-fallback">補完 ← {FACE_LABELS[faceSources[key]]}</span>
              {:else}
                <span class="face-missing">未割当</span>
              {/if}
            </div>
          {/each}
        </div>
        <div class="purupuru-actions">
          <input class="purupuru-name" type="text" bind:value={purupuruName} readonly={Boolean(targetCharacter)} placeholder="ファイル名 (例: shiro)" />
          <button class="btn btn-export" onclick={exportPuruPuru} disabled={!faceSources || isPacking}>
            {isPacking ? '梱包中...' : '⬇ .purupuru 書き出し'}
          </button>
        </div>
        {#if !faceSources}
          <p class="hint">「目開き・口閉じ」のフレームを最低1枚タグ付けすると書き出せます。瞬き対応するなら、目を閉じたフレームに「目の状態: 目閉じ」を付けてください。</p>
        {/if}
        {#if packError}<p class="error">⚠ {packError}</p>{/if}
        {#if packDone}<p class="ok">✓ 保存しました: <code>static{savedPuruPuruUrl}</code>（取得URL: <a href={savedPuruPuruUrl} target="_blank" rel="noreferrer">{savedPuruPuruUrl}</a>）</p>{/if}
        {#if characterAvatarSaved && targetCharacter}
          <p class="ok">✓ {targetCharacter.name}のキャラクター設定へPuruPuruアバターを登録しました。</p>
        {/if}
      </div>

      <table class="export-table">
        <thead>
          <tr>
            <th>フレーム</th>
            <th>タグ</th>
            <th>DL</th>
            <th></th>
          </tr>
        </thead>
        <tbody>
          {#each taggedEntries as [filename, tag] (filename)}
            <tr>
              <td class="filename">{filename}</td>
              <td>
                <span class="badge shape-{mouthStateToShape(tag.mouth)}">{mouthLabelOf(tag.mouth)}</span>
                <span class="badge shape-eye">{tag.eyes === 'eyes_closed' ? '目閉じ' : '目開き'}</span>
                {#if tag.source === 'manual' && tag.locked}
                  <span class="badge badge-manual" title="手動確定(自動分類で上書きされません)">✋</span>
                {:else if tag.source === 'auto'}
                  <span class="badge badge-auto" title="自動仮選択(再解析や手動タグで置き換わります)">🤖 {tag.confidence !== undefined ? `${Math.round(tag.confidence * 100)}%` : '仮'}</span>
                {/if}
              </td>
              <td>
                <button class="btn btn-dl" onclick={() => downloadFrame(filename, tag)}>
                  ↓
                </button>
              </td>
              <td>
                <button class="btn btn-remove" onclick={() => untag(filename)}>×</button>
              </td>
            </tr>
          {/each}
        </tbody>
      </table>
    </section>
  {/if}
  {/if}
</div>

<style>
  .page {
    min-height: 100vh;
    background: #0a0a0f;
    color: #e0e0f0;
    font-family: 'Rajdhani', 'Segoe UI', sans-serif;
    padding: 2rem;
    max-width: 900px;
    margin: 0 auto;
  }

  .header {
    display: flex;
    align-items: baseline;
    justify-content: space-between;
    margin-bottom: 2rem;
  }
  .target-character-card {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 1rem;
    border-color: #a855f766;
    background: linear-gradient(135deg, #a855f70d, #0d1520);
  }
  .target-character-card h2 { margin: 0.2rem 0 0.45rem; }
  .target-eyebrow {
    color: #c4b5fd;
    font-family: 'Orbitron', monospace;
    font-size: 0.68rem;
    letter-spacing: 0.12em;
  }
  .target-name { margin: 0; color: #aabbcc; }
  .target-name strong { color: #f3e8ff; }
  .target-name code { margin-left: 0.45rem; color: #c4b5fd; }
  .target-select { display: grid; gap: 0.35rem; color: #aabbcc; font-size: 0.8rem; }
  .target-select select {
    min-width: 260px;
    padding: 0.5rem 0.7rem;
    border: 1px solid #a855f766;
    border-radius: 4px;
    background: #111827;
    color: #f3e8ff;
  }
  .target-actions { display: flex; flex-wrap: wrap; justify-content: flex-end; gap: 0.55rem; }
  .target-actions a {
    padding: 0.45rem 0.7rem;
    border: 1px solid #a855f755;
    border-radius: 4px;
    color: #d8b4fe;
    text-decoration: none;
    font-size: 0.75rem;
    white-space: nowrap;
  }
  .target-actions a:hover { border-color: #a855f7; }

  h1 {
    font-family: 'Orbitron', monospace;
    font-size: 1.5rem;
    color: #22d3ee;
    margin: 0;
    letter-spacing: 0.1em;
  }

  .sub {
    font-size: 0.85rem;
    color: #88aabb;
    margin-left: 0.75rem;
    font-family: sans-serif;
  }

  .back {
    color: #88aabb;
    text-decoration: none;
    font-size: 0.9rem;
  }
  .back:hover { color: #22d3ee; }

  .card {
    background: #111118;
    border: 1px solid #1e2a3a;
    border-radius: 8px;
    padding: 1.5rem;
    margin-bottom: 1.5rem;
  }

  h2 {
    font-family: 'Orbitron', monospace;
    font-size: 0.95rem;
    color: #a0c0d0;
    margin: 0 0 1rem 0;
    display: flex;
    align-items: center;
    gap: 0.75rem;
  }

  .step {
    background: #22d3ee22;
    border: 1px solid #22d3ee66;
    color: #22d3ee;
    border-radius: 4px;
    padding: 0.1rem 0.4rem;
    font-size: 0.75rem;
  }

  .hint {
    color: #667788;
    font-size: 0.82rem;
    margin: -0.5rem 0 1rem 0;
  }

  .hint-inline {
    color: #556677;
    font-size: 0.75rem;
    font-family: monospace;
    font-weight: normal;
  }

  /* Upload */
  .upload-row {
    display: flex;
    gap: 0.75rem;
    align-items: center;
    flex-wrap: wrap;
  }

  .file-label {
    cursor: pointer;
    background: #1a2030;
    border: 1px solid #334455;
    border-radius: 4px;
    padding: 0.5rem 1rem;
    font-size: 0.9rem;
    color: #aabbcc;
    flex: 1;
    min-width: 200px;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  .file-input {
    display: none;
  }

  /* Buttons */
  .btn {
    cursor: pointer;
    border: none;
    border-radius: 4px;
    padding: 0.5rem 1.25rem;
    font-family: 'Orbitron', monospace;
    font-size: 0.8rem;
    transition: opacity 0.15s;
  }
  .btn:disabled { opacity: 0.4; cursor: not-allowed; }

  .btn-primary {
    background: #22d3ee;
    color: #0a0a0f;
  }
  .btn-primary:hover:not(:disabled) { opacity: 0.85; }

  .btn-nav {
    background: #1a2030;
    color: #aabbcc;
    border: 1px solid #334455;
    padding: 0.4rem 0.75rem;
  }
  .btn-nav:hover:not(:disabled) { border-color: #22d3ee; color: #22d3ee; }

  .btn-export {
    background: #a855f7;
    color: #fff;
    font-size: 0.85rem;
  }
  .btn-export:hover:not(:disabled) { opacity: 0.85; }

  .btn-dl {
    background: #1a2030;
    color: #22d3ee;
    border: 1px solid #22d3ee44;
    padding: 0.25rem 0.6rem;
    font-family: monospace;
    font-size: 0.9rem;
  }
  .btn-dl:hover { border-color: #22d3ee; }

  .btn-remove {
    background: transparent;
    color: #556677;
    border: 1px solid #334455;
    padding: 0.25rem 0.5rem;
    font-size: 0.85rem;
  }
  .btn-remove:hover { color: #ff6677; border-color: #ff6677; }

  /* Viewer */
  .viewer {
    position: relative;
    display: inline-block;
    max-width: 100%;
    margin-bottom: 1rem;
    background: #000;
    border: 1px solid #1e2a3a;
    border-radius: 4px;
  }

  .frame-img {
    display: block;
    max-width: 100%;
    max-height: 400px;
    object-fit: contain;
  }

  .tag-badge {
    position: absolute;
    top: 0.5rem;
    right: 0.5rem;
    font-family: 'Orbitron', monospace;
    font-size: 0.75rem;
    padding: 0.2rem 0.6rem;
    border-radius: 3px;
  }

  /* Seek */
  .seek-row {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    margin-bottom: 1rem;
  }

  .slider {
    flex: 1;
    accent-color: #22d3ee;
  }

  .frame-count {
    font-family: monospace;
    font-size: 0.85rem;
    color: #667788;
    white-space: nowrap;
  }

  /* Tag buttons */
  .tag-buttons {
    display: flex;
    gap: 0.75rem;
    flex-wrap: wrap;
  }

  .tag-btn {
    cursor: pointer;
    font-family: 'Orbitron', monospace;
    font-size: 0.85rem;
    padding: 0.6rem 1.5rem;
    border-radius: 4px;
    border: 2px solid transparent;
    transition: all 0.1s;
  }

  /* Counts */
  .counts {
    display: flex;
    gap: 1.5rem;
    margin-bottom: 1rem;
    font-family: monospace;
    font-size: 1rem;
  }

  .export-actions {
    margin-bottom: 1rem;
  }

  /* Manifest */
  .manifest {
    background: #0d1520;
    border: 1px solid #1e3a2a;
    border-radius: 4px;
    padding: 0.75rem 1rem;
    margin-bottom: 1rem;
  }

  .manifest-row {
    display: flex;
    align-items: center;
    gap: 0.75rem;
    margin-top: 0.4rem;
  }

  .manifest-row code {
    color: #88ccaa;
    font-size: 0.85rem;
  }

  /* Table */
  .export-table {
    width: 100%;
    border-collapse: collapse;
    font-size: 0.9rem;
    margin-top: 0.5rem;
  }

  .export-table th {
    text-align: left;
    color: #556677;
    font-weight: normal;
    padding: 0.4rem 0.5rem;
    border-bottom: 1px solid #1e2a3a;
    font-size: 0.8rem;
  }

  .export-table td {
    padding: 0.4rem 0.5rem;
    border-bottom: 1px solid #111820;
    vertical-align: middle;
  }

  .filename {
    font-family: monospace;
    font-size: 0.82rem;
    color: #778899;
  }

  /* Shape color system */
  .shape-open  { --c: #22d3ee; }
  .shape-mid   { --c: #f59e0b; }
  .shape-close { --c: #a855f7; }

  .tag-badge.shape-open,
  .badge.shape-open {
    background: #22d3ee22;
    border: 1px solid #22d3ee66;
    color: #22d3ee;
  }
  .tag-badge.shape-mid,
  .badge.shape-mid {
    background: #f59e0b22;
    border: 1px solid #f59e0b66;
    color: #f59e0b;
  }
  .tag-badge.shape-close,
  .badge.shape-close {
    background: #a855f722;
    border: 1px solid #a855f766;
    color: #a855f7;
  }

  .tag-btn.shape-open {
    background: #22d3ee11;
    color: #22d3ee;
    border-color: #22d3ee44;
  }
  .tag-btn.shape-open:hover,
  .tag-btn.shape-open.active {
    background: #22d3ee33;
    border-color: #22d3ee;
  }

  .tag-btn.shape-mid {
    background: #f59e0b11;
    color: #f59e0b;
    border-color: #f59e0b44;
  }
  .tag-btn.shape-mid:hover,
  .tag-btn.shape-mid.active {
    background: #f59e0b33;
    border-color: #f59e0b;
  }

  .tag-btn.shape-close {
    background: #a855f711;
    color: #a855f7;
    border-color: #a855f744;
  }
  .tag-btn.shape-close:hover,
  .tag-btn.shape-close.active {
    background: #a855f733;
    border-color: #a855f7;
  }

  .count.shape-open  { color: #22d3ee; }
  .count.shape-mid   { color: #f59e0b; }
  .count.shape-close { color: #a855f7; }

  .badge {
    font-family: 'Orbitron', monospace;
    font-size: 0.7rem;
    padding: 0.15rem 0.5rem;
    border-radius: 3px;
  }

  .error { color: #ff6677; font-size: 0.88rem; margin-top: 0.5rem; }
  .ok    { color: #44cc88; font-size: 0.88rem; margin-top: 0.5rem; }

  /* Mode switch */
  .mode-card { padding: 1rem 1.5rem; }
  .mode-row { display: flex; align-items: center; gap: 1rem; flex-wrap: wrap; }
  .mode-switch { display: inline-flex; border: 1px solid #334455; border-radius: 6px; overflow: hidden; }
  .mode-btn {
    cursor: pointer;
    background: #1a2030;
    color: #88aabb;
    border: none;
    border-right: 1px solid #334455;
    padding: 0.45rem 1.2rem;
    font-family: 'Orbitron', monospace;
    font-size: 0.8rem;
  }
  .mode-btn:last-child { border-right: none; }
  .mode-btn:hover { color: #22d3ee; }
  .mode-btn.active { background: #22d3ee22; color: #22d3ee; }
  .mode-desc { color: #667788; font-size: 0.82rem; margin: 0.6rem 0 0; }
  .analyze-row { display: flex; align-items: center; gap: 1rem; margin-top: 0.75rem; flex-wrap: wrap; }
  .btn-analyze {
    background: #22d3ee22;
    color: #22d3ee;
    border: 1px solid #22d3ee66;
  }
  .btn-analyze:hover:not(:disabled) { background: #22d3ee33; border-color: #22d3ee; }

  /* 領域指定(アニメ顔フォールバック) */
  .region-controls { display: flex; align-items: center; gap: 0.75rem; flex-wrap: wrap; margin-bottom: 0.75rem; }
  .pick-hint { color: #f59e0b; }
  .viewer.picking { cursor: crosshair; }
  .region-hitbox {
    position: absolute;
    inset: 0;
    z-index: 4;
    background: transparent;
    border: none;
    cursor: crosshair;
    padding: 0;
  }
  .region-box {
    position: absolute;
    z-index: 3;
    border: 2px dashed;
    border-radius: 4px;
    pointer-events: none;
  }
  .region-eye { border-color: #44cc88cc; }
  .region-mouth { border-color: #f59e0bcc; }

  /* AI候補 */
  .auto-suggestion {
    display: flex;
    align-items: center;
    gap: 1rem;
    flex-wrap: wrap;
    margin-bottom: 1rem;
    padding: 0.5rem 0.75rem;
    border: 1px dashed #22d3ee44;
    border-radius: 6px;
    background: #0d1520;
    font-size: 0.85rem;
    color: #a0c0d0;
  }
  .suggestion-text b { color: #22d3ee; margin-left: 0.5em; }
  .btn-adopt {
    background: #44cc8822;
    color: #44cc88;
    border: 1px solid #44cc8866;
    font-size: 0.75rem;
    padding: 0.35rem 0.9rem;
  }
  .btn-adopt:hover { background: #44cc8833; border-color: #44cc88; }
  .badge-auto {
    background: #22d3ee15;
    border: 1px solid #22d3ee44;
    color: #7dd3fc;
  }

  /* 状態別候補ランキング(時間解析) */
  .candidate-grid {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(250px, 1fr));
    gap: 0.75rem;
  }
  .candidate-state {
    border: 1px solid #1e2a3a;
    border-radius: 6px;
    padding: 0.6rem 0.75rem;
    display: flex;
    flex-direction: column;
    gap: 0.5rem;
  }
  .candidate-state.empty { border-style: dashed; border-color: #33445588; }
  .candidate-state-label {
    font-weight: 600;
    font-size: 0.85rem;
    color: #7dd3fc;
    letter-spacing: 0.05em;
  }
  .candidate-state.empty .candidate-state-label { color: #778899; }
  .candidate-reason {
    color: #99aabb;
    font-size: 0.8rem;
    margin: 0;
    line-height: 1.5;
  }
  .candidate-list { display: flex; flex-direction: column; gap: 0.5rem; }
  .candidate-cell {
    display: flex;
    align-items: center;
    gap: 0.6rem;
    padding: 0.3rem;
    border: 1px solid transparent;
    border-radius: 6px;
  }
  .candidate-cell.adopted {
    border-color: #44cc8866;
    background: #44cc880d;
  }
  .candidate-thumb {
    padding: 0;
    border: 1px solid #334455;
    border-radius: 4px;
    background: #0a0a0f;
    cursor: pointer;
    line-height: 0;
    flex-shrink: 0;
  }
  .candidate-thumb:hover { border-color: #22d3ee; }
  .candidate-thumb img {
    width: 72px;
    height: 48px;
    object-fit: cover;
    border-radius: 3px;
    display: block;
  }
  .candidate-meta {
    flex: 1;
    font-size: 0.75rem;
    color: #aabbcc;
    line-height: 1.4;
  }
  .candidate-meta code { color: #7dd3fc; font-size: 0.72rem; }
  .candidate-adopt { white-space: nowrap; }
  .candidate-adopt:disabled { opacity: 1; cursor: default; }

  /* 手動モード: プレビュークリック登録 */
  .frame-register-hitbox {
    position: absolute;
    inset: 0;
    z-index: 4;
    background: transparent;
    border: none;
    cursor: copy;
    padding: 0;
  }
  .frame-register-hitbox:hover { box-shadow: inset 0 0 0 2px #22d3ee88; }
  .frame-register-hitbox:active { box-shadow: inset 0 0 0 3px #22d3ee; }
  .registered-badge {
    position: absolute;
    bottom: 0.5rem;
    left: 0.5rem;
    z-index: 3;
    font-size: 0.75rem;
    padding: 0.2rem 0.5rem;
    border-radius: 4px;
    background: #0a0a0fcc;
    border: 1px solid #22d3ee66;
    color: #7dd3fc;
  }
  .frame-name {
    font-family: monospace;
    font-size: 0.8rem;
    color: #7dd3fc;
    white-space: nowrap;
  }

  /* 手動候補リスト */
  .manual-candidates {
    margin-top: 1rem;
    border: 1px solid #1e2a3a;
    border-radius: 6px;
    padding: 0.75rem;
  }
  .manual-head {
    display: flex;
    align-items: baseline;
    gap: 0.75rem;
    flex-wrap: wrap;
    margin-bottom: 0.5rem;
  }
  .manual-notice { color: #44cc88; font-size: 0.8rem; }
  .manual-list {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(250px, 1fr));
    gap: 0.5rem;
  }
  .manual-cell {
    display: flex;
    align-items: center;
    gap: 0.6rem;
    padding: 0.3rem;
    border: 1px solid transparent;
    border-radius: 6px;
  }
  .manual-cell.current {
    border-color: #22d3ee66;
    background: #22d3ee0d;
  }
  .manual-pending { color: #f59e0b; }

  /* Axis groups (目/口の二軸タグ) */
  .axis-groups { display: flex; flex-direction: column; gap: 0.75rem; }
  .axis-group { display: flex; align-items: center; gap: 0.75rem; flex-wrap: wrap; }
  .axis-label { color: #88aabb; font-size: 0.82rem; min-width: 4.5em; }
  .tag-btn kbd {
    font-family: monospace;
    font-size: 0.7rem;
    opacity: 0.6;
    border: 1px solid currentColor;
    border-radius: 3px;
    padding: 0 0.3em;
    margin-left: 0.35em;
  }
  .badge-manual {
    background: #f59e0b22;
    border: 1px solid #f59e0b66;
    color: #f59e0b;
  }
  .count-eye { color: #44cc88; }

  /* Eye tag */
  .shape-eye { --c: #44cc88; }
  .tag-btn.shape-eye {
    background: #44cc8811;
    color: #44cc88;
    border-color: #44cc8844;
  }
  .tag-btn.shape-eye:hover,
  .tag-btn.shape-eye.active {
    background: #44cc8833;
    border-color: #44cc88;
  }
  .tag-badge.shape-eye {
    background: #44cc8822;
    border: 1px solid #44cc8866;
    color: #44cc88;
  }
  .eye-badge { top: 2.2rem; }

  /* .purupuru export */
  .purupuru-export {
    margin-top: 1.5rem;
    padding-top: 1.25rem;
    border-top: 1px solid #1e2a3a;
  }
  .purupuru-export h3 {
    font-family: 'Orbitron', monospace;
    font-size: 0.85rem;
    color: #a0c0d0;
    margin: 0 0 0.5rem 0;
  }
  .purupuru-grid {
    display: grid;
    grid-template-columns: repeat(3, 1fr);
    gap: 0.6rem;
    margin: 0.75rem 0 1rem;
  }
  @media (max-width: 640px) { .purupuru-grid { grid-template-columns: repeat(2, 1fr); } }
  .purupuru-cell {
    border: 1px dashed #334455;
    border-radius: 6px;
    padding: 0.5rem;
    display: flex;
    flex-direction: column;
    gap: 0.4rem;
    min-height: 90px;
  }
  .purupuru-cell.filled { border-style: solid; border-color: #22d3ee66; }
  .purupuru-cell img {
    width: 100%;
    max-height: 110px;
    object-fit: contain;
    background: #000;
    border-radius: 4px;
  }
  .face-label { font-size: 0.75rem; color: #88aabb; }
  .face-fallback { font-size: 0.72rem; color: #667788; }
  .face-missing { font-size: 0.72rem; color: #55404a; }
  .purupuru-actions {
    display: flex;
    gap: 0.75rem;
    align-items: center;
    flex-wrap: wrap;
  }
  .purupuru-name {
    background: #1a2030;
    border: 1px solid #334455;
    border-radius: 4px;
    padding: 0.5rem 0.75rem;
    color: #e0e0f0;
    font-size: 0.9rem;
    width: 200px;
  }
  .purupuru-name[readonly] { color: #c4b5fd; cursor: default; }
  @media (max-width: 640px) {
    .target-character-card { align-items: flex-start; flex-direction: column; }
    .target-actions { justify-content: flex-start; }
  }

  /* Image organizer */
  .organizer-toolbar {
    display: flex;
    align-items: end;
    gap: 1rem;
    flex-wrap: wrap;
    margin-bottom: 1rem;
  }
  .character-field {
    display: flex;
    flex-direction: column;
    gap: 0.35rem;
    color: #88aabb;
    font-size: 0.82rem;
  }
  .coverage-grid {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(240px, 1fr));
    gap: 0.5rem;
  }
  .coverage-item {
    display: flex;
    align-items: center;
    gap: 0.55rem;
    border: 1px dashed #49313b;
    border-radius: 5px;
    padding: 0.55rem 0.7rem;
    color: #aa7788;
  }
  .coverage-item.complete {
    border-style: solid;
    border-color: #44cc8866;
    color: #88ccaa;
  }
  .organizer-table-wrap { overflow-x: auto; }
  .organizer-table { min-width: 780px; }
  .organizer-source {
    display: flex;
    align-items: center;
    gap: 0.65rem;
    min-width: 180px;
  }
  .organizer-source img {
    width: 72px;
    height: 72px;
    object-fit: contain;
    border: 1px solid #334455;
    border-radius: 4px;
    background: #000;
  }
  .organizer-warning {
    display: block;
    color: #f59e0b;
    font-size: 0.72rem;
    margin-top: 0.25rem;
    white-space: normal;
  }
  .png-import-grid {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(240px, 1fr));
    gap: 0.75rem;
    margin-top: 1rem;
  }
  .png-import-slot {
    display: grid;
    gap: 0.65rem;
    min-height: 240px;
    padding: 0.75rem;
    border: 1px dashed #334155;
    border-radius: 7px;
    background: #080d16;
  }
  .png-import-slot.filled { border-style: solid; border-color: #22d3ee66; }
  .png-import-slot-head { display: flex; justify-content: space-between; gap: 0.5rem; }
  .png-import-slot-head strong { color: #c4b5fd; font-size: 0.82rem; }
  .png-import-slot-head span { color: #64748b; font-size: 0.72rem; }
  .png-import-slot img {
    width: 100%;
    height: 180px;
    object-fit: contain;
    border-radius: 5px;
    background:
      linear-gradient(45deg, #172033 25%, transparent 25%),
      linear-gradient(-45deg, #172033 25%, transparent 25%),
      linear-gradient(45deg, transparent 75%, #172033 75%),
      linear-gradient(-45deg, transparent 75%, #172033 75%),
      #0b1220;
    background-position: 0 0, 0 8px, 8px -8px, -8px 0;
    background-size: 16px 16px;
  }
  .png-import-meta { display: grid; gap: 0.25rem; color: #94a3b8; font-size: 0.75rem; }
  .png-import-meta code { overflow-wrap: anywhere; color: #7dd3fc; }
  .png-import-actions { display: flex; gap: 0.5rem; }
  .png-import-actions label { display: inline-flex; align-items: center; }
  .png-import-actions input, .png-import-drop input { display: none; }
  .png-import-drop {
    min-height: 190px;
    display: grid;
    place-items: center;
    border: 1px dashed #475569;
    border-radius: 5px;
    color: #7dd3fc;
    cursor: pointer;
  }
  .png-import-drop:hover { border-color: #22d3ee; background: #22d3ee08; }
  .png-import-summary { margin-top: 0; }
  .png-import-export .btn-export { margin-top: 0.5rem; }
  .material-summary {
    display: grid;
    gap: 0.5rem;
    margin-top: 1rem;
  }
  .material-summary > div {
    display: flex;
    align-items: center;
    gap: 0.65rem;
    border: 1px solid #334455;
    border-radius: 5px;
    padding: 0.6rem 0.8rem;
  }
  .material-summary .passed {
    color: #88ccaa;
    border-color: #44cc8866;
    background: #44cc880b;
  }
  .material-summary .failed {
    color: #ff8899;
    border-color: #ff667766;
    background: #ff66770b;
  }
  .material-file-table { margin-top: 1rem; }
  .material-file-table table { min-width: 760px; }
  .check-pass { color: #44cc88; }
  .check-fail { color: #ff6677; }
</style>
