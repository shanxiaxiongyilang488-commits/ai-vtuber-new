<script lang="ts">
  // ─────────────────────────────────────────────
  // BubbleEditor — drag-to-define region editor
  //
  // Props:
  //   imageUrl  (bindable) — updated in-place after baking
  //   filename             — download file name
  //
  // Usage:
  //   <BubbleEditor bind:imageUrl={slot.imageUrl} filename="panel_1.png" />
  // ─────────────────────────────────────────────

  type TextRegion = {
    id:   string;
    x:    number;   // left edge  0-1 (slot-normalized)
    y:    number;   // top edge   0-1
    w:    number;   // width      0-1
    h:    number;   // height     0-1
    text: string;
  };

  type Drag = { x0: number; y0: number; x1: number; y1: number };

  const FONTS = [
    { id: 'noto',  label: 'Noto Sans JP',   css: '"Noto Sans JP", sans-serif' },
    { id: 'bizud', label: 'BIZ UDゴシック', css: '"BIZ UDGothic", sans-serif' },
    { id: 'klee',  label: '源暎アンチック', css: '"Klee One", cursive' },
  ] as const;
  type FontId = typeof FONTS[number]['id'];

  let {
    imageUrl = $bindable(),
    filename = 'panel.png',
  }: {
    imageUrl: string;
    filename?: string;
  } = $props();

  let regions  = $state<TextRegion[]>([]);
  let font     = $state<FontId>('noto');
  let fontSize = $state(16);
  let bold     = $state(true);
  let drag     = $state<Drag | null>(null);
  let container = $state<HTMLElement | null>(null);

  const fontCss = $derived(FONTS.find(f => f.id === font)?.css ?? 'sans-serif');

  // ── Drag to create a new region ──────────────────────────
  function startDrag(e: MouseEvent): void {
    const el = e.currentTarget as HTMLElement;
    const rc = el.getBoundingClientRect();
    const x0 = (e.clientX - rc.left) / rc.width;
    const y0 = (e.clientY - rc.top)  / rc.height;
    drag = { x0, y0, x1: x0, y1: y0 };

    const onMove = (ev: MouseEvent) => {
      drag = { x0, y0,
        x1: (ev.clientX - rc.left) / rc.width,
        y1: (ev.clientY - rc.top)  / rc.height,
      };
    };
    const onUp = (ev: MouseEvent) => {
      document.removeEventListener('mousemove', onMove);
      document.removeEventListener('mouseup',   onUp);
      if (!drag) return;
      const x1 = (ev.clientX - rc.left) / rc.width;
      const y1 = (ev.clientY - rc.top)  / rc.height;
      const lx = Math.max(0, Math.min(1, Math.min(x0, x1)));
      const ly = Math.max(0, Math.min(1, Math.min(y0, y1)));
      const lw = Math.min(1 - lx, Math.abs(x1 - x0));
      const lh = Math.min(1 - ly, Math.abs(y1 - y0));
      drag = null;
      if (lw < 0.05 || lh < 0.03) return;
      regions = [
        ...regions,
        { id: crypto.randomUUID(), x: lx, y: ly, w: lw, h: lh, text: '' },
      ];
    };
    document.addEventListener('mousemove', onMove);
    document.addEventListener('mouseup',   onUp);
  }

  function updateText(id: string, text: string): void {
    regions = regions.map(r => r.id === id ? { ...r, text } : r);
  }

  function deleteRegion(id: string): void {
    regions = regions.filter(r => r.id !== id);
  }

  // ── Canvas composite ─────────────────────────────────────
  async function composite(): Promise<string> {
    const img = await new Promise<HTMLImageElement>((resolve, reject) => {
      const el = new Image();
      el.onload  = () => resolve(el);
      el.onerror = reject;
      el.src     = imageUrl;
    });

    const slotW = container?.clientWidth  ?? 512;
    const slotH = container?.clientHeight ?? 512;

    // object-fit:cover — find the scale that fills the slot, then derive visible crop
    const scale = Math.max(slotW / img.naturalWidth, slotH / img.naturalHeight);
    const cropW = slotW / scale;
    const cropH = slotH / scale;
    const cropX = (img.naturalWidth  - cropW) / 2;
    const cropY = (img.naturalHeight - cropH) / 2;

    const canvas  = document.createElement('canvas');
    canvas.width  = img.naturalWidth;
    canvas.height = img.naturalHeight;
    const ctx = canvas.getContext('2d')!;
    ctx.drawImage(img, 0, 0);

    const fsize = Math.round(fontSize * (img.naturalWidth / 512));

    for (const r of regions.filter(r => r.text.trim())) {
      const ix = Math.max(0, cropX + r.x * cropW);
      const iy = Math.max(0, cropY + r.y * cropH);
      const iw = r.w * cropW;
      const ih = r.h * cropH;

      // White mask
      ctx.fillStyle = 'rgba(255,255,255,0.97)';
      ctx.fillRect(ix, iy, iw, ih);

      // Text centered in masked area
      ctx.font         = `${bold ? 700 : 400} ${fsize}px ${fontCss}`;
      ctx.fillStyle    = '#111';
      ctx.textAlign    = 'center';
      ctx.textBaseline = 'middle';
      const lines = r.text.trim().split('\n');
      const lineH = fsize * 1.6;
      let ty = iy + ih / 2 - ((lines.length - 1) * lineH) / 2;
      for (const line of lines) {
        ctx.fillText(line, ix + iw / 2, ty, iw * 0.9);
        ty += lineH;
      }
    }

    return canvas.toDataURL('image/png');
  }

  async function bake(): Promise<void> {
    if (!regions.some(r => r.text.trim())) return;
    imageUrl = await composite();
    regions  = [];
  }

  async function download(): Promise<void> {
    const url = regions.some(r => r.text.trim()) ? await composite() : imageUrl;
    const a = document.createElement('a');
    a.href     = url;
    a.download = filename;
    a.click();
  }
</script>

<!-- ── Toolbar ─────────────────────────────────────────── -->
<div class="be-toolbar">
  <span class="be-label">吹き出し</span>
  <select class="be-select" bind:value={font}>
    {#each FONTS as f}
      <option value={f.id}>{f.label}</option>
    {/each}
  </select>
  <input class="be-size" type="number" bind:value={fontSize} min="10" max="48" step="2" title="サイズ" />
  <span class="be-unit">px</span>
  <button class="be-bold" class:active={bold} onclick={() => bold = !bold}>B</button>
  <div class="be-spacer"></div>
  <button class="be-bake-btn"     onclick={bake}>🖊 確定</button>
  <button class="be-download-btn" onclick={download}>⬇ PNG</button>
</div>

<!-- ── Image + region overlays ───────────────────────────── -->
<!-- svelte-ignore a11y_no_static_element_interactions -->
<div class="be-stage" bind:this={container}>
  <img src={imageUrl} alt="comic panel" class="be-img" />

  <!-- Region overlays (z:2, above drag surface z:1) -->
  {#each regions as r (r.id)}
    <div class="be-region" style="left:{r.x*100}%;top:{r.y*100}%;width:{r.w*100}%;height:{r.h*100}%;">
      <!-- svelte-ignore a11y_no_static_element_interactions -->
      <textarea
        class="be-region-input"
        value={r.text}
        oninput={(e) => updateText(r.id, (e.currentTarget as HTMLTextAreaElement).value)}
        onclick={(e) => e.stopPropagation()}
        style="font-family:{fontCss}; font-size:{fontSize}px; font-weight:{bold ? 700 : 400};"
        placeholder="セリフ..."
      ></textarea>
      <button class="be-region-del" onclick={(e) => { e.stopPropagation(); deleteRegion(r.id); }}>✕</button>
    </div>
  {/each}

  <!-- Drag preview (pointer-events:none so it doesn't block the surface) -->
  {#if drag}
    <div class="be-drag-preview" style="
      left:{Math.min(drag.x0,drag.x1)*100}%;
      top:{Math.min(drag.y0,drag.y1)*100}%;
      width:{Math.abs(drag.x1-drag.x0)*100}%;
      height:{Math.abs(drag.y1-drag.y0)*100}%;
    "></div>
  {/if}

  <!-- Drag surface (z:1, below regions z:2) — captures new-region drags -->
  <div
    class="be-surface"
    onmousedown={(e) => { e.stopPropagation(); startDrag(e); }}
  ></div>
</div>

<style>
  /* ── Layout ── */
  .be-toolbar {
    display: flex;
    align-items: center;
    gap: 6px;
    padding: 6px 8px;
    background: rgba(255,255,255,0.03);
    border-bottom: 1px solid rgba(255,255,255,0.07);
    flex-wrap: wrap;
  }
  .be-spacer { flex: 1; }

  .be-label {
    font-size: 11px;
    color: rgba(0,229,255,0.6);
    letter-spacing: 0.5px;
  }

  /* ── Toolbar controls ── */
  .be-select {
    font-size: 11px;
    padding: 2px 4px;
    background: rgba(255,255,255,0.05);
    border: 1px solid rgba(255,255,255,0.12);
    border-radius: 3px;
    color: inherit;
    cursor: pointer;
  }
  .be-size {
    width: 44px;
    font-size: 11px;
    text-align: center;
    padding: 2px 4px;
    background: rgba(255,255,255,0.05);
    border: 1px solid rgba(255,255,255,0.12);
    border-radius: 3px;
    color: inherit;
  }
  .be-unit { font-size: 10px; color: rgba(255,255,255,0.35); }
  .be-bold {
    width: 24px;
    height: 24px;
    font-weight: 700;
    font-size: 12px;
    background: rgba(255,255,255,0.04);
    border: 1px solid rgba(255,255,255,0.12);
    border-radius: 3px;
    color: rgba(255,255,255,0.5);
    cursor: pointer;
  }
  .be-bold.active {
    background: rgba(0,229,255,0.12);
    border-color: rgba(0,229,255,0.4);
    color: #00e5ff;
  }
  .be-bake-btn, .be-download-btn {
    padding: 3px 10px;
    font-size: 11px;
    font-family: inherit;
    border-radius: 4px;
    cursor: pointer;
    white-space: nowrap;
    border: 1px solid;
  }
  .be-bake-btn {
    background: rgba(167,139,250,0.15);
    border-color: rgba(167,139,250,0.4);
    color: rgba(167,139,250,0.95);
  }
  .be-bake-btn:hover {
    background: rgba(167,139,250,0.3);
    color: #fff;
  }
  .be-download-btn {
    background: rgba(52,211,153,0.12);
    border-color: rgba(52,211,153,0.35);
    color: rgba(52,211,153,0.9);
  }
  .be-download-btn:hover {
    background: rgba(52,211,153,0.25);
    color: #fff;
  }

  /* ── Stage ── */
  .be-stage {
    position: relative;
    width: 100%;
    aspect-ratio: 1;
    overflow: hidden;
    background: #111;
    cursor: crosshair;
  }
  .be-img {
    display: block;
    width: 100%;
    height: 100%;
    object-fit: cover;
  }

  /* ── Drag surface (lowest z — below regions) ── */
  .be-surface {
    position: absolute;
    inset: 0;
    z-index: 1;
    cursor: crosshair;
  }

  /* ── Region overlay ── */
  .be-region {
    position: absolute;
    z-index: 2;
    box-sizing: border-box;
  }
  .be-region::before {
    content: '';
    position: absolute;
    inset: 0;
    background: rgba(255,255,255,0.96);
    border: 1.5px solid rgba(0,0,0,0.45);
    border-radius: 3px;
    pointer-events: none;
  }
  .be-region-input {
    position: relative;
    z-index: 1;
    width: 100%;
    height: 100%;
    background: transparent;
    border: none;
    outline: none;
    resize: none;
    color: #111;
    line-height: 1.5;
    padding: 4px 6px;
    box-sizing: border-box;
    cursor: text;
  }
  .be-region-del {
    position: absolute;
    top: -10px;
    right: -10px;
    z-index: 3;
    width: 20px;
    height: 20px;
    background: #f43f5e;
    border: none;
    border-radius: 50%;
    color: #fff;
    font-size: 10px;
    cursor: pointer;
    display: flex;
    align-items: center;
    justify-content: center;
    padding: 0;
  }

  /* ── Drag preview ── */
  .be-drag-preview {
    position: absolute;
    z-index: 4;
    border: 2px dashed #00e5ff;
    background: rgba(0,229,255,0.08);
    pointer-events: none;
  }
</style>
