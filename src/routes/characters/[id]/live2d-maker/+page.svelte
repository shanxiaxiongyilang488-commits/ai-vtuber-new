<script lang="ts">
  import { onMount } from 'svelte';
  import { page } from '$app/state';
  import JSZip from 'jszip';
  import type { Live2DPartsData, Live2DPartState } from '$lib/live2dParts';

  type CharacterEntry = {
    id: string;
    name: string;
    image?: string;
    hasReference?: boolean;
  };

  type PartRow = {
    key: string;
    group: string;
    label: string;
    state: Live2DPartState;
  };

  type PartBbox = NonNullable<Live2DPartState['bbox']>;
  type DraftBox = PartBbox & {
    left: number;
    top: number;
    width: number;
    height: number;
  };

  const characterId = $derived(page.params.id ?? '');
  let character = $state<CharacterEntry | null>(null);
  let parts = $state<Live2DPartsData | null>(null);
  let selectedImage = $state<File | null>(null);
  let previewUrl = $state('');
  let selectedPartKey = $state('');
  let imageEl = $state<HTMLImageElement | null>(null);
  let imageStageEl = $state<HTMLDivElement | null>(null);
  let imageNaturalWidth = $state(0);
  let imageNaturalHeight = $state(0);
  let isDrawing = $state(false);
  let drawStart = $state<{ x: number; y: number } | null>(null);
  let draftBox = $state<DraftBox | null>(null);
  let savingParts = $state(false);
  let exportingParts = $state(false);
  let exportingZip = $state(false);
  let savingReview = $state(false);
  let autoDetecting = $state(false);
  let loading = $state(true);
  let analyzing = $state(false);
  let errorMessage = $state('');

  const partRows = $derived<PartRow[]>(parts ? [
    { key: 'face.detected', group: '顔', label: '検出', state: parts.parts.face },
    { key: 'hair.front', group: '髪', label: '前髪', state: parts.parts.hair.front },
    { key: 'hair.side', group: '髪', label: '横髪', state: parts.parts.hair.side },
    { key: 'hair.back', group: '髪', label: '後髪', state: parts.parts.hair.back },
    { key: 'eyes.left', group: '目', label: '左目', state: parts.parts.eyes.left },
    { key: 'eyes.right', group: '目', label: '右目', state: parts.parts.eyes.right },
    { key: 'mouth.closed', group: '口', label: '閉じ口', state: parts.parts.mouth.closed },
    { key: 'mouth.open', group: '口', label: '開き口', state: parts.parts.mouth.open },
    { key: 'eyebrows.left', group: '眉', label: '左眉', state: parts.parts.eyebrows.left },
    { key: 'eyebrows.right', group: '眉', label: '右眉', state: parts.parts.eyebrows.right },
    { key: 'body.detected', group: '体', label: '検出', state: parts.parts.body },
    ...parts.parts.accessories.items.map((item, index) => ({
      key: `accessories.${index}`,
      group: '装備',
      label: item,
      state: parts!.parts.accessories.itemStates?.[item] ?? { detected: parts!.parts.accessories.detected },
    })),
  ] : []);

  const selectedPart = $derived(partRows.find((row) => row.key === selectedPartKey) ?? partRows[0] ?? null);
  const currentBox = $derived(draftBox ?? boxToDraft(selectedPart?.state.bbox));
  const exportableRows = $derived(partRows.filter((row) => row.state.bbox));
  const exportedRows = $derived(partRows.filter((row) => row.state.assetPath));
  const requiredRows = $derived(partRows.filter((row) => !row.key.startsWith('accessories.')));
  const readyRows = $derived(requiredRows.filter((row) => row.state.status === 'ready' && row.state.assetPath));
  const candidateRows = $derived(requiredRows.filter((row) => row.state.status === 'candidate' || (row.state.bbox && !row.state.assetPath)));
  const missingRows = $derived(requiredRows.filter((row) => !row.state.detected || row.state.status === 'missing' || !row.state.bbox));
  const readyPercent = $derived(requiredRows.length ? Math.round((readyRows.length / requiredRows.length) * 100) : 0);

  onMount(() => {
    void loadLive2DMaker();
    return () => {
      if (previewUrl.startsWith('blob:')) URL.revokeObjectURL(previewUrl);
    };
  });

  async function loadLive2DMaker(): Promise<void> {
    loading = true;
    errorMessage = '';
    try {
      if (!characterId) throw new Error('character id is required');
      const [characterResponse, partsResponse] = await Promise.all([
        fetch(`/api/characters/${encodeURIComponent(characterId)}`),
        fetch(`/api/characters/${encodeURIComponent(characterId)}/live2d-parts`),
      ]);
      const characterData = await characterResponse.json().catch(() => ({}));
      const partsData = await partsResponse.json().catch(() => ({}));
      if (!characterResponse.ok) throw new Error(characterData?.message ?? 'character not found');
      if (!partsResponse.ok) throw new Error(partsData?.message ?? 'Live2D Partsを読み込めませんでした');
      character = characterData.character;
      parts = partsData.parts ?? null;
      previewUrl = parts?.sourceImage?.dataUrl ?? '';
    } catch (error) {
      errorMessage = error instanceof Error ? error.message : String(error);
    } finally {
      loading = false;
    }
  }

  function chooseImage(event: Event): void {
    const input = event.currentTarget as HTMLInputElement;
    const file = input.files?.[0] ?? null;
    selectedImage = file;
    if (previewUrl.startsWith('blob:')) URL.revokeObjectURL(previewUrl);
    previewUrl = file ? URL.createObjectURL(file) : parts?.sourceImage?.dataUrl ?? '';
  }

  async function analyzeParts(): Promise<void> {
    analyzing = true;
    errorMessage = '';
    try {
      if (!characterId) throw new Error('character id is required');
      const fd = new FormData();
      if (selectedImage) fd.set('image', selectedImage);
      const response = await fetch(`/api/characters/${encodeURIComponent(characterId)}/live2d-parts`, {
        method: 'POST',
        body: fd,
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data?.message ?? 'Live2D解析に失敗しました');
      parts = data.parts;
      selectedPartKey = '';
      draftBox = null;
      previewUrl = parts?.sourceImage?.dataUrl ?? previewUrl;
    } catch (error) {
      errorMessage = error instanceof Error ? error.message : String(error);
    } finally {
      analyzing = false;
    }
  }

  function groupedRows(group: string): PartRow[] {
    return partRows.filter((row) => row.group === group);
  }

  function setImageSize(): void {
    imageNaturalWidth = imageEl?.naturalWidth ?? 0;
    imageNaturalHeight = imageEl?.naturalHeight ?? 0;
  }

  function boxToDraft(box: PartBbox | undefined): DraftBox | null {
    if (!box || !imageNaturalWidth || !imageNaturalHeight) return null;
    return {
      ...box,
      left: (box.x / imageNaturalWidth) * 100,
      top: (box.y / imageNaturalHeight) * 100,
      width: (box.w / imageNaturalWidth) * 100,
      height: (box.h / imageNaturalHeight) * 100,
    };
  }

  function pointFromEvent(event: PointerEvent): { x: number; y: number } | null {
    if (!imageStageEl) return null;
    const rect = imageStageEl.getBoundingClientRect();
    if (rect.width <= 0 || rect.height <= 0) return null;
    return {
      x: Math.min(Math.max(event.clientX - rect.left, 0), rect.width),
      y: Math.min(Math.max(event.clientY - rect.top, 0), rect.height),
    };
  }

  function draftFromPoints(start: { x: number; y: number }, end: { x: number; y: number }): DraftBox | null {
    if (!imageStageEl || !imageNaturalWidth || !imageNaturalHeight) return null;
    const rect = imageStageEl.getBoundingClientRect();
    const leftPx = Math.min(start.x, end.x);
    const topPx = Math.min(start.y, end.y);
    const widthPx = Math.abs(end.x - start.x);
    const heightPx = Math.abs(end.y - start.y);
    if (widthPx < 2 || heightPx < 2) return null;
    return {
      x: Math.round((leftPx / rect.width) * imageNaturalWidth),
      y: Math.round((topPx / rect.height) * imageNaturalHeight),
      w: Math.round((widthPx / rect.width) * imageNaturalWidth),
      h: Math.round((heightPx / rect.height) * imageNaturalHeight),
      left: (leftPx / rect.width) * 100,
      top: (topPx / rect.height) * 100,
      width: (widthPx / rect.width) * 100,
      height: (heightPx / rect.height) * 100,
    };
  }

  function startBoxSelection(event: PointerEvent): void {
    if (!selectedPart || !previewUrl) return;
    const point = pointFromEvent(event);
    if (!point) return;
    isDrawing = true;
    drawStart = point;
    draftBox = null;
    imageStageEl?.setPointerCapture(event.pointerId);
  }

  function moveBoxSelection(event: PointerEvent): void {
    if (!isDrawing || !drawStart) return;
    const point = pointFromEvent(event);
    if (!point) return;
    draftBox = draftFromPoints(drawStart, point);
  }

  function finishBoxSelection(event: PointerEvent): void {
    if (!isDrawing || !drawStart) return;
    const point = pointFromEvent(event);
    if (point) draftBox = draftFromPoints(drawStart, point) ?? draftBox;
    isDrawing = false;
    drawStart = null;
    imageStageEl?.releasePointerCapture(event.pointerId);
  }

  function stateWithBox(
    state: Live2DPartState,
    box: PartBbox,
    status: NonNullable<Live2DPartState['status']> = 'ready',
  ): Live2DPartState {
    return {
      ...state,
      detected: true,
      status,
      bbox: box,
    };
  }

  function stateWithAsset(state: Live2DPartState, assetPath: string): Live2DPartState {
    return {
      ...state,
      detected: true,
      status: 'ready',
      assetPath,
    };
  }

  function stateWithReview(
    state: Live2DPartState,
    status: NonNullable<Live2DPartState['status']>,
    note: string,
  ): Live2DPartState {
    return {
      ...state,
      detected: status !== 'missing',
      status,
      note: note.trim(),
    };
  }

  function fileNameForPart(row: PartRow): string {
    const mapped: Record<string, string> = {
      'face.detected': 'face',
      'hair.front': 'hair_front',
      'hair.side': 'hair_side',
      'hair.back': 'hair_back',
      'eyes.left': 'eye_left',
      'eyes.right': 'eye_right',
      'mouth.closed': 'mouth_closed',
      'mouth.open': 'mouth_open',
      'eyebrows.left': 'eyebrow_left',
      'eyebrows.right': 'eyebrow_right',
      'body.detected': 'body',
    };
    if (mapped[row.key]) return mapped[row.key];
    if (row.key.startsWith('accessories.')) return `accessory_${Number(row.key.split('.')[1]) + 1}`;
    return 'part';
  }

  function assetUrl(path: string | undefined): string {
    return path ? `/${path.replace(/^\/+/, '')}` : '';
  }

  function layerStyle(row: PartRow): string {
    const box = row.state.bbox;
    if (!box || !imageNaturalWidth || !imageNaturalHeight) return '';
    return [
      `left:${(box.x / imageNaturalWidth) * 100}%`,
      `top:${(box.y / imageNaturalHeight) * 100}%`,
      `width:${(box.w / imageNaturalWidth) * 100}%`,
      `height:${(box.h / imageNaturalHeight) * 100}%`,
    ].join(';');
  }

  function clonePartsData(source: Live2DPartsData): Live2DPartsData {
    return JSON.parse(JSON.stringify(source)) as Live2DPartsData;
  }

  function updatePartWithBox(
    source: Live2DPartsData,
    key: string,
    box: PartBbox,
    status: NonNullable<Live2DPartState['status']> = 'ready',
  ): Live2DPartsData {
    const next = clonePartsData(source);
    if (key === 'face.detected') next.parts.face = stateWithBox(next.parts.face, box, status);
    else if (key === 'hair.front') next.parts.hair.front = stateWithBox(next.parts.hair.front, box, status);
    else if (key === 'hair.side') next.parts.hair.side = stateWithBox(next.parts.hair.side, box, status);
    else if (key === 'hair.back') next.parts.hair.back = stateWithBox(next.parts.hair.back, box, status);
    else if (key === 'eyes.left') next.parts.eyes.left = stateWithBox(next.parts.eyes.left, box, status);
    else if (key === 'eyes.right') next.parts.eyes.right = stateWithBox(next.parts.eyes.right, box, status);
    else if (key === 'mouth.closed') next.parts.mouth.closed = stateWithBox(next.parts.mouth.closed, box, status);
    else if (key === 'mouth.open') next.parts.mouth.open = stateWithBox(next.parts.mouth.open, box, status);
    else if (key === 'eyebrows.left') next.parts.eyebrows.left = stateWithBox(next.parts.eyebrows.left, box, status);
    else if (key === 'eyebrows.right') next.parts.eyebrows.right = stateWithBox(next.parts.eyebrows.right, box, status);
    else if (key === 'body.detected') next.parts.body = stateWithBox(next.parts.body, box, status);
    else if (key.startsWith('accessories.')) {
      const index = Number(key.split('.')[1]);
      const item = next.parts.accessories.items[index];
      if (item) {
        next.parts.accessories.detected = true;
        next.parts.accessories.itemStates = {
          ...(next.parts.accessories.itemStates ?? {}),
          [item]: stateWithBox(next.parts.accessories.itemStates?.[item] ?? { detected: true }, box, status),
        };
      }
    }
    next.analyzedAt = new Date().toISOString();
    return next;
  }

  function updatePartWithAsset(source: Live2DPartsData, key: string, assetPath: string): Live2DPartsData {
    const next = clonePartsData(source);
    if (key === 'face.detected') next.parts.face = stateWithAsset(next.parts.face, assetPath);
    else if (key === 'hair.front') next.parts.hair.front = stateWithAsset(next.parts.hair.front, assetPath);
    else if (key === 'hair.side') next.parts.hair.side = stateWithAsset(next.parts.hair.side, assetPath);
    else if (key === 'hair.back') next.parts.hair.back = stateWithAsset(next.parts.hair.back, assetPath);
    else if (key === 'eyes.left') next.parts.eyes.left = stateWithAsset(next.parts.eyes.left, assetPath);
    else if (key === 'eyes.right') next.parts.eyes.right = stateWithAsset(next.parts.eyes.right, assetPath);
    else if (key === 'mouth.closed') next.parts.mouth.closed = stateWithAsset(next.parts.mouth.closed, assetPath);
    else if (key === 'mouth.open') next.parts.mouth.open = stateWithAsset(next.parts.mouth.open, assetPath);
    else if (key === 'eyebrows.left') next.parts.eyebrows.left = stateWithAsset(next.parts.eyebrows.left, assetPath);
    else if (key === 'eyebrows.right') next.parts.eyebrows.right = stateWithAsset(next.parts.eyebrows.right, assetPath);
    else if (key === 'body.detected') next.parts.body = stateWithAsset(next.parts.body, assetPath);
    else if (key.startsWith('accessories.')) {
      const index = Number(key.split('.')[1]);
      const item = next.parts.accessories.items[index];
      if (item) {
        next.parts.accessories.detected = true;
        next.parts.accessories.itemStates = {
          ...(next.parts.accessories.itemStates ?? {}),
          [item]: stateWithAsset(next.parts.accessories.itemStates?.[item] ?? { detected: true }, assetPath),
        };
      }
    }
    next.analyzedAt = new Date().toISOString();
    return next;
  }

  function updatePartReview(
    source: Live2DPartsData,
    key: string,
    status: NonNullable<Live2DPartState['status']>,
    note: string,
  ): Live2DPartsData {
    const next = clonePartsData(source);
    if (key === 'face.detected') next.parts.face = stateWithReview(next.parts.face, status, note);
    else if (key === 'hair.front') next.parts.hair.front = stateWithReview(next.parts.hair.front, status, note);
    else if (key === 'hair.side') next.parts.hair.side = stateWithReview(next.parts.hair.side, status, note);
    else if (key === 'hair.back') next.parts.hair.back = stateWithReview(next.parts.hair.back, status, note);
    else if (key === 'eyes.left') next.parts.eyes.left = stateWithReview(next.parts.eyes.left, status, note);
    else if (key === 'eyes.right') next.parts.eyes.right = stateWithReview(next.parts.eyes.right, status, note);
    else if (key === 'mouth.closed') next.parts.mouth.closed = stateWithReview(next.parts.mouth.closed, status, note);
    else if (key === 'mouth.open') next.parts.mouth.open = stateWithReview(next.parts.mouth.open, status, note);
    else if (key === 'eyebrows.left') next.parts.eyebrows.left = stateWithReview(next.parts.eyebrows.left, status, note);
    else if (key === 'eyebrows.right') next.parts.eyebrows.right = stateWithReview(next.parts.eyebrows.right, status, note);
    else if (key === 'body.detected') next.parts.body = stateWithReview(next.parts.body, status, note);
    else if (key.startsWith('accessories.')) {
      const index = Number(key.split('.')[1]);
      const item = next.parts.accessories.items[index];
      if (item) {
        next.parts.accessories.itemStates = {
          ...(next.parts.accessories.itemStates ?? {}),
          [item]: stateWithReview(next.parts.accessories.itemStates?.[item] ?? { detected: true }, status, note),
        };
        next.parts.accessories.detected = Object.values(next.parts.accessories.itemStates).some((state) => state.detected);
      }
    }
    next.analyzedAt = new Date().toISOString();
    return next;
  }

  function autoBox(x: number, y: number, w: number, h: number): PartBbox {
    const left = Math.max(0, Math.round(x * imageNaturalWidth));
    const top = Math.max(0, Math.round(y * imageNaturalHeight));
    const width = Math.max(1, Math.round(w * imageNaturalWidth));
    const height = Math.max(1, Math.round(h * imageNaturalHeight));
    return {
      x: Math.min(left, Math.max(0, imageNaturalWidth - 1)),
      y: Math.min(top, Math.max(0, imageNaturalHeight - 1)),
      w: Math.min(width, Math.max(1, imageNaturalWidth - left)),
      h: Math.min(height, Math.max(1, imageNaturalHeight - top)),
    };
  }

  function buildAutoCandidateParts(source: Live2DPartsData): Live2DPartsData {
    const candidates: Array<[string, PartBbox]> = [
      ['face.detected', autoBox(0.36, 0.08, 0.28, 0.28)],
      ['hair.front', autoBox(0.33, 0.03, 0.34, 0.18)],
      ['hair.side', autoBox(0.26, 0.08, 0.48, 0.42)],
      ['hair.back', autoBox(0.28, 0.07, 0.44, 0.52)],
      ['eyes.left', autoBox(0.40, 0.20, 0.08, 0.06)],
      ['eyes.right', autoBox(0.52, 0.20, 0.08, 0.06)],
      ['mouth.closed', autoBox(0.47, 0.31, 0.07, 0.035)],
      ['mouth.open', autoBox(0.47, 0.31, 0.07, 0.05)],
      ['eyebrows.left', autoBox(0.39, 0.17, 0.09, 0.035)],
      ['eyebrows.right', autoBox(0.52, 0.17, 0.09, 0.035)],
      ['body.detected', autoBox(0.22, 0.32, 0.58, 0.58)],
    ];
    return candidates.reduce(
      (next, [key, box]) => updatePartWithBox(next, key, box, 'candidate'),
      source,
    );
  }

  async function autoDetectPartBoxes(): Promise<void> {
    if (!parts) return;
    if (!imageNaturalWidth || !imageNaturalHeight) {
      setImageSize();
      if (!imageNaturalWidth || !imageNaturalHeight) {
        errorMessage = '画像を読み込んでから自動抽出してください';
        return;
      }
    }
    autoDetecting = true;
    errorMessage = '';
    try {
      const nextParts = buildAutoCandidateParts(parts);
      const response = await fetch(`/api/characters/${encodeURIComponent(characterId)}/live2d-parts`, {
        method: 'PUT',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ parts: nextParts }),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data?.message ?? '自動抽出に失敗しました');
      parts = data.parts;
      selectedPartKey = 'face.detected';
      draftBox = null;
    } catch (error) {
      errorMessage = error instanceof Error ? error.message : String(error);
    } finally {
      autoDetecting = false;
    }
  }

  async function saveSelectedPartBox(): Promise<void> {
    if (!parts || !selectedPart || !draftBox) return;
    savingParts = true;
    errorMessage = '';
    try {
      const nextParts = updatePartWithBox(parts, selectedPart.key, {
        x: draftBox.x,
        y: draftBox.y,
        w: draftBox.w,
        h: draftBox.h,
      });
      const response = await fetch(`/api/characters/${encodeURIComponent(characterId)}/live2d-parts`, {
        method: 'PUT',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ parts: nextParts }),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data?.message ?? 'パーツ範囲の保存に失敗しました');
      parts = data.parts;
      draftBox = null;
    } catch (error) {
      errorMessage = error instanceof Error ? error.message : String(error);
    } finally {
      savingParts = false;
    }
  }

  async function saveSelectedPartReview(
    status: NonNullable<Live2DPartState['status']>,
    note: string,
  ): Promise<void> {
    if (!parts || !selectedPart) return;
    savingReview = true;
    errorMessage = '';
    try {
      const nextParts = updatePartReview(parts, selectedPart.key, status, note);
      const response = await fetch(`/api/characters/${encodeURIComponent(characterId)}/live2d-parts`, {
        method: 'PUT',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ parts: nextParts }),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data?.message ?? 'パーツ状態の保存に失敗しました');
      parts = data.parts;
    } catch (error) {
      errorMessage = error instanceof Error ? error.message : String(error);
    } finally {
      savingReview = false;
    }
  }

  function cropPart(row: PartRow): { fileName: string; dataUrl: string } | null {
    if (!imageEl || !row.state.bbox) return null;
    const box = row.state.bbox;
    const canvas = document.createElement('canvas');
    canvas.width = Math.max(1, box.w);
    canvas.height = Math.max(1, box.h);
    const context = canvas.getContext('2d');
    if (!context) return null;
    context.drawImage(
      imageEl,
      box.x,
      box.y,
      box.w,
      box.h,
      0,
      0,
      box.w,
      box.h,
    );
    return {
      fileName: fileNameForPart(row),
      dataUrl: canvas.toDataURL('image/png'),
    };
  }

  async function exportPartImages(): Promise<void> {
    if (!parts || exportableRows.length === 0) return;
    exportingParts = true;
    errorMessage = '';
    try {
      const crops = exportableRows.flatMap((row) => {
        const crop = cropPart(row);
        return crop ? [crop] : [];
      });
      if (crops.length === 0) throw new Error('切り出し可能なパーツがありません');
      const savedByFileName = Object.fromEntries(crops.map((crop) => [crop.fileName, '']));
      let nextParts = parts;
      for (const row of exportableRows) {
        const fileName = fileNameForPart(row);
        if (fileName in savedByFileName) {
          nextParts = updatePartWithAsset(
            nextParts,
            row.key,
            `data/project/character-assets/${characterId}/live2d/parts/${fileName}.png`,
          );
        }
      }
      const response = await fetch(`/api/characters/${encodeURIComponent(characterId)}/live2d-parts`, {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ parts: nextParts, crops }),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data?.message ?? 'パーツ切り出しに失敗しました');
      parts = data.parts;
    } catch (error) {
      errorMessage = error instanceof Error ? error.message : String(error);
    } finally {
      exportingParts = false;
    }
  }

  function manifestRows(): Array<Record<string, unknown>> {
    return partRows.map((row) => ({
      key: row.key,
      group: row.group,
      label: row.label,
      detected: row.state.detected,
      status: row.state.status ?? (row.state.detected ? 'candidate' : 'missing'),
      bbox: row.state.bbox ?? null,
      assetPath: row.state.assetPath ?? null,
      note: row.state.note ?? '',
    }));
  }

  function buildManifest(): Record<string, unknown> | null {
    if (!parts) return null;
    return {
      kind: 'live2d-maker-manifest',
      version: 1,
      generatedAt: new Date().toISOString(),
      character: {
        id: characterId,
        name: character?.name ?? characterId,
      },
      sourceImage: parts.sourceImage
        ? {
          fileName: parts.sourceImage.fileName,
          mimeType: parts.sourceImage.mimeType,
          uploadedAt: parts.sourceImage.uploadedAt,
        }
        : null,
      readiness: {
        required: requiredRows.length,
        ready: readyRows.length,
        candidate: candidateRows.length,
        missing: missingRows.length,
        percent: readyPercent,
      },
      parts: manifestRows(),
    };
  }

  function downloadManifest(): void {
    const manifest = buildManifest();
    if (!manifest) return;
    const blob = new Blob([JSON.stringify(manifest, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = `${characterId || 'character'}-live2d-manifest.json`;
    anchor.click();
    URL.revokeObjectURL(url);
  }

  async function fetchAssetBlob(path: string): Promise<Blob | null> {
    const response = await fetch(assetUrl(path));
    if (!response.ok) return null;
    return response.blob();
  }

  function extensionFromMimeType(mimeType: string): string {
    if (mimeType.includes('jpeg') || mimeType.includes('jpg')) return 'jpg';
    if (mimeType.includes('png')) return 'png';
    return 'png';
  }

  async function downloadCubismPrepZip(): Promise<void> {
    const manifest = buildManifest();
    if (!parts || !manifest) return;
    exportingZip = true;
    errorMessage = '';
    try {
      const zip = new JSZip();
      zip.file('manifest.json', JSON.stringify(manifest, null, 2));
      zip.file('parts.json', JSON.stringify(parts, null, 2));
      zip.file('README.txt', [
        'Live2D Maker export',
        '',
        'This package contains source artwork, cropped part PNGs, parts.json, and manifest.json.',
        'Phase 1 does not generate Cubism, PSD, mesh, or rigging files.',
        'Use the PNG files in parts/ as preparation material for Live2D Cubism.',
      ].join('\n'));

      if (parts.sourceImage?.dataUrl) {
        const sourceResponse = await fetch(parts.sourceImage.dataUrl);
        const sourceBlob = await sourceResponse.blob();
        zip.file(`source/${parts.sourceImage.fileName || `source.${extensionFromMimeType(parts.sourceImage.mimeType)}`}`, sourceBlob);
      }

      for (const row of exportedRows) {
        if (!row.state.assetPath) continue;
        const blob = await fetchAssetBlob(row.state.assetPath);
        if (blob) zip.file(`parts/${fileNameForPart(row)}.png`, blob);
      }

      const blob = await zip.generateAsync({ type: 'blob', mimeType: 'application/zip' });
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement('a');
      anchor.href = url;
      anchor.download = `${characterId || 'character'}-live2d-prep.zip`;
      anchor.click();
      URL.revokeObjectURL(url);
    } catch (error) {
      errorMessage = error instanceof Error ? error.message : String(error);
    } finally {
      exportingZip = false;
    }
  }
</script>

<svelte:head>
  <title>Live2D Maker | AI VTuber</title>
</svelte:head>

<main class="maker-page">
  <header>
    <a href="/characters">← CHARACTER LAB</a>
    <p>CHARACTER LAB / LIVE2D MAKER</p>
    <h1>Live2D Maker</h1>
    <span>{character?.name ?? characterId} のLive2D制作準備パーツを管理します。</span>
  </header>

  {#if errorMessage}
    <div class="notice error">{errorMessage}</div>
  {/if}

  {#if loading}
    <div class="notice">Live2D Makerを読み込み中...</div>
  {:else}
    <section class="workspace">
      <div class="image-panel">
        <div class="preview">
          {#if previewUrl}
            <div
              class="image-stage"
              role="application"
              aria-label="Live2D part region selector"
              bind:this={imageStageEl}
              onpointerdown={startBoxSelection}
              onpointermove={moveBoxSelection}
              onpointerup={finishBoxSelection}
              onpointercancel={finishBoxSelection}
            >
              <img bind:this={imageEl} src={previewUrl} alt="Live2D source" onload={setImageSize} />
              {#if currentBox}
                <div
                  class="bbox"
                  style={`left:${currentBox.left}%;top:${currentBox.top}%;width:${currentBox.width}%;height:${currentBox.height}%`}
                ></div>
              {/if}
            </div>
          {:else}
            <div class="empty-preview">PNG / JPG</div>
          {/if}
        </div>
        <div class="upload-row">
          <label>
            <span>AIキャラクター画像</span>
            <input type="file" accept="image/png,image/jpeg" onchange={chooseImage} />
          </label>
          <button onclick={analyzeParts} disabled={analyzing || (!selectedImage && !previewUrl)}>
            {analyzing ? '解析中...' : 'Live2D解析開始'}
          </button>
          <button onclick={autoDetectPartBoxes} disabled={autoDetecting || !parts || !previewUrl}>
            {autoDetecting ? '自動抽出中...' : '自動抽出'}
          </button>
        </div>
        <p class="hint">
          Phase 1ではCubism/PSD/リギングは生成せず、制作に必要なパーツ構造だけを保存します。
        </p>
      </div>

      <div class="parts-panel">
        <div class="panel-heading">
          <div>
            <p>Live2D Parts</p>
            <h2>{parts ? '解析結果' : '未解析'}</h2>
          </div>
          {#if parts}
            <time>{new Date(parts.analyzedAt).toLocaleString('ja-JP')}</time>
          {/if}
        </div>

        {#if parts}
          {#each ['顔', '髪', '目', '口', '眉', '体', '装備'] as group}
            <section class="part-group">
              <h3>{group}</h3>
              <div>
                {#each groupedRows(group) as row}
                  <button
                    class:active={selectedPart?.key === row.key}
                    class:missing={!row.state.detected}
                    onclick={() => {
                      selectedPartKey = row.key;
                      draftBox = null;
                    }}
                  >
                    <span>{row.state.detected ? '✓' : '・'}</span>
                    {row.label}
                  </button>
                {/each}
              </div>
            </section>
          {/each}
          <section class="export-panel">
            <div>
              <strong>Parts Export</strong>
              <span>{exportableRows.length} parts ready / {exportedRows.length} exported</span>
            </div>
            <button onclick={exportPartImages} disabled={exportingParts || exportableRows.length === 0}>
              {exportingParts ? '切り出し中...' : '切り出し実行'}
            </button>
          </section>
          {#if exportedRows.length}
            <section class="asset-list">
              <h3>切り出し済みパーツ</h3>
              {#each exportedRows as row}
                <button
                  class="asset-row"
                  class:active={selectedPart?.key === row.key}
                  onclick={() => {
                    selectedPartKey = row.key;
                    draftBox = null;
                  }}
                >
                  <img src={assetUrl(row.state.assetPath)} alt={row.label} />
                  <span>{row.label}</span>
                  <code>{row.state.status ?? 'candidate'}</code>
                </button>
              {/each}
            </section>
          {/if}
        {:else}
          <div class="empty-result">画像をアップロードして「Live2D解析開始」を押してください。</div>
        {/if}
      </div>
    </section>

    {#if parts}
      <section class="prep-panel">
        <div class="prep-heading">
          <div>
            <p>Live2D Production Prep</p>
            <h2>{readyPercent}% Ready</h2>
          </div>
          <div class="prep-actions">
            <button onclick={downloadManifest} disabled={partRows.length === 0}>Manifest JSON</button>
            <button onclick={downloadCubismPrepZip} disabled={exportingZip || exportedRows.length === 0}>
              {exportingZip ? 'Exporting...' : 'Export ZIP'}
            </button>
          </div>
        </div>
        <div class="prep-meter" aria-label="Live2D required parts readiness">
          <span style={`width:${readyPercent}%`}></span>
        </div>
        <div class="prep-stats">
          <span><strong>{readyRows.length}</strong> ready</span>
          <span><strong>{candidateRows.length}</strong> candidate</span>
          <span><strong>{missingRows.length}</strong> missing</span>
          <span><strong>{exportedRows.length}</strong> assets</span>
        </div>
        <div class="prep-grid">
          {#each requiredRows as row}
            <button
              class="prep-item"
              class:ready={row.state.status === 'ready' && row.state.assetPath}
              class:missing={!row.state.detected || row.state.status === 'missing' || !row.state.bbox}
              onclick={() => {
                selectedPartKey = row.key;
                draftBox = null;
              }}
            >
              <span>{row.label}</span>
              <code>{row.state.assetPath ? 'asset' : row.state.bbox ? 'bbox' : 'todo'}</code>
            </button>
          {/each}
        </div>
      </section>
    {/if}

    {#if parts}
      <section class="layer-panel">
        <div class="panel-heading">
          <div>
            <p>Live2D Layer Preview</p>
            <h2>レイヤー確認</h2>
          </div>
          <span>{exportedRows.length} layers</span>
        </div>
        {#if previewUrl && exportedRows.length && imageNaturalWidth && imageNaturalHeight}
          <div class="layer-workspace">
            <div class="layer-stage">
              <img class="layer-source" src={previewUrl} alt="source layer guide" />
              {#each exportedRows as row}
                {#if row.state.assetPath && row.state.bbox}
                  <button
                    class="layer-part"
                    class:active={selectedPart?.key === row.key}
                    style={layerStyle(row)}
                    title={row.label}
                    onclick={() => {
                      selectedPartKey = row.key;
                      draftBox = null;
                    }}
                  >
                    <img src={assetUrl(row.state.assetPath)} alt={row.label} />
                  </button>
                {/if}
              {/each}
            </div>
            <div class="layer-list">
              {#each exportedRows as row}
                <button
                  class:active={selectedPart?.key === row.key}
                  onclick={() => {
                    selectedPartKey = row.key;
                    draftBox = null;
                  }}
                >
                  <span>{row.label}</span>
                  <code>{row.state.bbox ? 'placed' : 'no bbox'}</code>
                </button>
              {/each}
            </div>
          </div>
        {:else}
          <div class="empty-result">パーツ切り出し後に、元画像上でレイヤー位置を確認できます。</div>
        {/if}
      </section>
    {/if}

    {#if selectedPart}
      <section class="detail-panel">
        <strong>{selectedPart.group} / {selectedPart.label}</strong>
        <span>{selectedPart.state.detected ? '素材候補として検出済み' : '未検出または追加作業が必要'}</span>
        {#if currentBox}
          <span class="bbox-text">x:{currentBox.x} y:{currentBox.y} w:{currentBox.w} h:{currentBox.h}</span>
        {/if}
        <button onclick={saveSelectedPartBox} disabled={!draftBox || savingParts}>
          {savingParts ? '保存中...' : 'この範囲を保存'}
        </button>
        <code>{selectedPart.key}</code>
        <form
          class="review-form"
          onsubmit={(event) => {
            event.preventDefault();
            const form = event.currentTarget;
            const formData = new FormData(form);
            const status = String(formData.get('status') || selectedPart.state.status || 'candidate') as NonNullable<Live2DPartState['status']>;
            const note = String(formData.get('note') || '');
            void saveSelectedPartReview(status, note);
          }}
        >
          {#if selectedPart.state.assetPath}
            <img src={assetUrl(selectedPart.state.assetPath)} alt={selectedPart.label} />
          {/if}
          <label>
            <span>Status</span>
            <select name="status" value={selectedPart.state.status ?? (selectedPart.state.detected ? 'candidate' : 'missing')}>
              <option value="ready">ready</option>
              <option value="candidate">candidate</option>
              <option value="missing">missing</option>
            </select>
          </label>
          <label>
            <span>Note</span>
            <textarea name="note" rows="2" placeholder="例: 髪と耳が混ざっているので再切り出し">{selectedPart.state.note ?? ''}</textarea>
          </label>
          <button type="submit" disabled={savingReview}>
            {savingReview ? '状態保存中...' : '状態を保存'}
          </button>
        </form>
      </section>
    {/if}
  {/if}
</main>

<style>
  :global(body) {
    margin: 0;
    background: #030712;
    color: #e2e8f0;
    font-family: 'Segoe UI', sans-serif;
  }
  .maker-page {
    min-height: 100vh;
    padding: 28px;
    background:
      radial-gradient(circle at 18% 0%, rgba(34, 211, 238, 0.12), transparent 34%),
      radial-gradient(circle at 90% 20%, rgba(244, 114, 182, 0.1), transparent 30%),
      #030712;
    box-sizing: border-box;
  }
  header, .workspace, .prep-panel, .layer-panel, .detail-panel, .notice {
    max-width: 1220px;
    margin-inline: auto;
  }
  header {
    display: grid;
    gap: 6px;
    margin-bottom: 22px;
  }
  header a {
    width: fit-content;
    color: #67e8f9;
    text-decoration: none;
    font: 800 11px/1 Consolas, monospace;
    letter-spacing: 0.12em;
  }
  header p, header h1, header span {
    margin: 0;
  }
  header p {
    color: #22d3ee;
    font-size: 10px;
    letter-spacing: 0.18em;
  }
  header h1 {
    color: #f8fafc;
    font-size: clamp(34px, 6vw, 62px);
  }
  header span {
    color: #94a3b8;
    font-size: 13px;
  }
  .workspace {
    display: grid;
    grid-template-columns: minmax(320px, 0.95fr) minmax(360px, 1.05fr);
    gap: 18px;
  }
  .image-panel, .parts-panel, .prep-panel, .layer-panel, .detail-panel, .notice {
    border: 1px solid rgba(34, 211, 238, 0.2);
    border-radius: 12px;
    background: rgba(8, 15, 32, 0.88);
  }
  .image-panel, .parts-panel {
    padding: 16px;
  }
  .preview {
    aspect-ratio: 4 / 5;
    display: grid;
    place-items: center;
    overflow: hidden;
    border: 1px solid rgba(148, 163, 184, 0.14);
    border-radius: 8px;
    background: #020617;
  }
  .image-stage {
    position: relative;
    max-width: 100%;
    max-height: 100%;
    touch-action: none;
    user-select: none;
    cursor: crosshair;
  }
  .image-stage img {
    max-width: 100%;
    max-height: min(72vh, 720px);
    width: auto;
    height: auto;
    display: block;
  }
  .bbox {
    position: absolute;
    box-sizing: border-box;
    border: 2px solid #22d3ee;
    background: rgba(34, 211, 238, 0.16);
    box-shadow: 0 0 0 1px rgba(2, 6, 23, 0.85), 0 0 18px rgba(34, 211, 238, 0.28);
    pointer-events: none;
  }
  .empty-preview {
    color: #475569;
    font: 800 12px/1 Consolas, monospace;
    letter-spacing: 0.18em;
  }
  .upload-row {
    display: grid;
    grid-template-columns: 1fr auto auto;
    gap: 10px;
    align-items: end;
    margin-top: 12px;
  }
  label {
    display: grid;
    gap: 5px;
  }
  label span {
    color: #94a3b8;
    font-size: 10px;
    font-weight: 800;
  }
  input {
    color: #cbd5e1;
    font-size: 12px;
  }
  button {
    min-height: 36px;
    padding: 8px 12px;
    border: 1px solid rgba(34, 211, 238, 0.35);
    border-radius: 6px;
    background: rgba(34, 211, 238, 0.08);
    color: #a5f3fc;
    font: inherit;
    font-size: 11px;
    font-weight: 800;
    cursor: pointer;
  }
  button:disabled {
    cursor: not-allowed;
    opacity: 0.45;
  }
  .hint {
    margin: 12px 0 0;
    color: #64748b;
    font-size: 11px;
    line-height: 1.6;
  }
  .panel-heading {
    display: flex;
    justify-content: space-between;
    gap: 12px;
    align-items: start;
    margin-bottom: 12px;
  }
  .panel-heading p, .panel-heading h2 {
    margin: 0;
  }
  .panel-heading p {
    color: #67e8f9;
    font: 800 10px/1 Consolas, monospace;
    letter-spacing: 0.12em;
  }
  .panel-heading h2 {
    margin-top: 5px;
    color: #f8fafc;
    font-size: 24px;
  }
  time {
    color: #64748b;
    font-size: 11px;
  }
  .part-group {
    padding: 11px 0;
    border-top: 1px solid rgba(148, 163, 184, 0.14);
  }
  .part-group h3 {
    margin: 0 0 8px;
    color: #f8fafc;
    font-size: 14px;
  }
  .part-group div {
    display: flex;
    flex-wrap: wrap;
    gap: 7px;
  }
  .part-group button {
    min-height: 32px;
    color: #dbeafe;
    background: rgba(15, 23, 42, 0.72);
    border-color: rgba(148, 163, 184, 0.2);
  }
  .part-group button.active {
    border-color: rgba(34, 211, 238, 0.7);
    background: rgba(34, 211, 238, 0.16);
  }
  .part-group button.missing {
    color: #94a3b8;
    border-style: dashed;
  }
  .part-group span {
    margin-right: 5px;
    color: #86efac;
  }
  .empty-result {
    padding: 28px;
    border: 1px dashed rgba(148, 163, 184, 0.2);
    border-radius: 8px;
    color: #64748b;
    text-align: center;
  }
  .export-panel {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 12px;
    padding: 13px 0 0;
    border-top: 1px solid rgba(148, 163, 184, 0.14);
  }
  .export-panel div {
    display: grid;
    gap: 4px;
  }
  .export-panel strong {
    color: #fbcfe8;
    font-size: 13px;
  }
  .export-panel span {
    color: #94a3b8;
    font-size: 11px;
  }
  .asset-list {
    margin-top: 14px;
    padding-top: 12px;
    border-top: 1px solid rgba(148, 163, 184, 0.14);
  }
  .asset-list h3 {
    margin: 0 0 8px;
    color: #f8fafc;
    font-size: 14px;
  }
  .asset-row {
    width: 100%;
    display: grid;
    grid-template-columns: 48px minmax(72px, 1fr) auto;
    gap: 8px;
    align-items: center;
    margin-top: 7px;
    padding: 7px;
    color: #cbd5e1;
    text-align: left;
    background: rgba(15, 23, 42, 0.72);
    border-color: rgba(148, 163, 184, 0.2);
  }
  .asset-row.active {
    border-color: rgba(34, 211, 238, 0.7);
    background: rgba(34, 211, 238, 0.12);
  }
  .asset-row img {
    width: 48px;
    height: 48px;
    object-fit: contain;
    border-radius: 5px;
    background: #020617;
  }
  .asset-row code {
    overflow-wrap: anywhere;
    color: #67e8f9;
    font-size: 10px;
  }
  .prep-panel {
    margin-top: 16px;
    padding: 16px;
  }
  .prep-heading {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 12px;
  }
  .prep-actions {
    display: flex;
    flex-wrap: wrap;
    gap: 8px;
    justify-content: flex-end;
  }
  .prep-heading p,
  .prep-heading h2 {
    margin: 0;
  }
  .prep-heading p {
    color: #67e8f9;
    font: 800 10px/1 Consolas, monospace;
    letter-spacing: 0.12em;
  }
  .prep-heading h2 {
    margin-top: 5px;
    color: #f8fafc;
    font-size: 24px;
  }
  .prep-meter {
    height: 9px;
    margin-top: 14px;
    overflow: hidden;
    border-radius: 999px;
    background: rgba(15, 23, 42, 0.9);
    border: 1px solid rgba(148, 163, 184, 0.16);
  }
  .prep-meter span {
    display: block;
    height: 100%;
    border-radius: inherit;
    background: linear-gradient(90deg, #22d3ee, #86efac);
  }
  .prep-stats {
    display: flex;
    flex-wrap: wrap;
    gap: 8px;
    margin-top: 12px;
  }
  .prep-stats span {
    display: inline-flex;
    gap: 5px;
    align-items: baseline;
    padding: 7px 9px;
    border: 1px solid rgba(148, 163, 184, 0.16);
    border-radius: 6px;
    color: #94a3b8;
    font-size: 11px;
  }
  .prep-stats strong {
    color: #e2e8f0;
  }
  .prep-grid {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(140px, 1fr));
    gap: 8px;
    margin-top: 12px;
  }
  .prep-item {
    display: flex;
    justify-content: space-between;
    gap: 8px;
    align-items: center;
    color: #cbd5e1;
    background: rgba(15, 23, 42, 0.72);
    border-color: rgba(148, 163, 184, 0.18);
    text-align: left;
  }
  .prep-item.ready {
    border-color: rgba(134, 239, 172, 0.45);
    background: rgba(22, 163, 74, 0.1);
  }
  .prep-item.missing {
    border-style: dashed;
    color: #94a3b8;
  }
  .prep-item code {
    color: #67e8f9;
    font-size: 10px;
  }
  .layer-panel {
    margin-top: 16px;
    padding: 16px;
  }
  .panel-heading > span {
    color: #94a3b8;
    font-size: 11px;
  }
  .layer-workspace {
    display: grid;
    grid-template-columns: minmax(280px, 1fr) 220px;
    gap: 14px;
    align-items: start;
  }
  .layer-stage {
    position: relative;
    width: fit-content;
    max-width: 100%;
    overflow: hidden;
    border: 1px solid rgba(148, 163, 184, 0.16);
    border-radius: 8px;
    background:
      linear-gradient(45deg, rgba(148, 163, 184, 0.06) 25%, transparent 25%),
      linear-gradient(-45deg, rgba(148, 163, 184, 0.06) 25%, transparent 25%),
      linear-gradient(45deg, transparent 75%, rgba(148, 163, 184, 0.06) 75%),
      linear-gradient(-45deg, transparent 75%, rgba(148, 163, 184, 0.06) 75%),
      #020617;
    background-position: 0 0, 0 10px, 10px -10px, -10px 0;
    background-size: 20px 20px;
  }
  .layer-source {
    display: block;
    max-width: 100%;
    max-height: min(70vh, 720px);
    opacity: 0.28;
  }
  .layer-part {
    position: absolute;
    min-height: 0;
    padding: 0;
    overflow: visible;
    border: 1px solid rgba(34, 211, 238, 0.18);
    border-radius: 0;
    background: transparent;
  }
  .layer-part.active {
    border-color: rgba(34, 211, 238, 0.9);
    box-shadow: 0 0 0 1px rgba(2, 6, 23, 0.85), 0 0 16px rgba(34, 211, 238, 0.4);
    z-index: 10;
  }
  .layer-part img {
    display: block;
    width: 100%;
    height: 100%;
    object-fit: contain;
    pointer-events: none;
  }
  .layer-list {
    display: grid;
    gap: 7px;
  }
  .layer-list button {
    display: flex;
    justify-content: space-between;
    gap: 8px;
    align-items: center;
    color: #cbd5e1;
    background: rgba(15, 23, 42, 0.72);
    border-color: rgba(148, 163, 184, 0.18);
    text-align: left;
  }
  .layer-list button.active {
    border-color: rgba(34, 211, 238, 0.7);
    background: rgba(34, 211, 238, 0.12);
  }
  .layer-list code {
    color: #67e8f9;
    font-size: 10px;
  }
  .detail-panel, .notice {
    margin-top: 16px;
    padding: 14px 16px;
  }
  .detail-panel {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 12px;
  }
  .detail-panel strong {
    color: #f8fafc;
  }
  .detail-panel span {
    color: #94a3b8;
    font-size: 12px;
  }
  .detail-panel button {
    min-height: 32px;
  }
  .bbox-text {
    color: #a5f3fc !important;
    font-family: Consolas, monospace;
  }
  .detail-panel code {
    margin-left: auto;
    color: #67e8f9;
    font-size: 11px;
  }
  .review-form {
    width: 100%;
    display: grid;
    grid-template-columns: 80px minmax(130px, 180px) 1fr auto;
    gap: 10px;
    align-items: end;
    padding-top: 12px;
    border-top: 1px solid rgba(148, 163, 184, 0.14);
  }
  .review-form img {
    width: 80px;
    height: 80px;
    object-fit: contain;
    border: 1px solid rgba(148, 163, 184, 0.16);
    border-radius: 6px;
    background: #020617;
  }
  .review-form label {
    display: grid;
    gap: 5px;
  }
  .review-form label span {
    color: #94a3b8;
    font-size: 10px;
    font-weight: 800;
  }
  .review-form select,
  .review-form textarea {
    width: 100%;
    box-sizing: border-box;
    border: 1px solid rgba(148, 163, 184, 0.22);
    border-radius: 6px;
    background: #020617;
    color: #e2e8f0;
    font: inherit;
    font-size: 12px;
  }
  .review-form select {
    min-height: 34px;
    padding: 6px 8px;
  }
  .review-form textarea {
    min-height: 52px;
    padding: 8px;
    resize: vertical;
  }
  .notice {
    color: #94a3b8;
    text-align: center;
  }
  .notice.error {
    border-color: rgba(251, 113, 133, 0.28);
    color: #fb7185;
  }
  @media (max-width: 860px) {
    .maker-page {
      padding: 18px;
    }
    .workspace {
      grid-template-columns: 1fr;
    }
    .upload-row {
      grid-template-columns: 1fr;
    }
    .detail-panel code {
      margin-left: 0;
    }
    .review-form {
      grid-template-columns: 1fr;
    }
    .layer-workspace {
      grid-template-columns: 1fr;
    }
  }
</style>
