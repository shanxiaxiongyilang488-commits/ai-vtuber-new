<script lang="ts">
  import { onMount, onDestroy } from 'svelte';
  import * as THREE from 'three';
  import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
  import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
  import { VRMLoaderPlugin, VRMUtils } from '@pixiv/three-vrm';
  import type { VRM } from '@pixiv/three-vrm';

  // ──────────────────────────────────────────────────────────────
  // Props
  // ──────────────────────────────────────────────────────────────
  let {
    vrmUrl = '',
    isThinking = false,
    class: className = '',
  }: {
    vrmUrl?: string;
    isThinking?: boolean;
    class?: string;
  } = $props();

  // ──────────────────────────────────────────────────────────────
  // DOM refs
  // ──────────────────────────────────────────────────────────────
  let wrapEl: HTMLDivElement;
  let canvasEl: HTMLCanvasElement;

  // ──────────────────────────────────────────────────────────────
  // UI state (reactive)
  // ──────────────────────────────────────────────────────────────
  let loaded   = $state(false);
  let loading  = $state(false);
  let loadError = $state('');
  let sceneReady = $state(false);   // Three.js 初期化完了フラグ

  // ──────────────────────────────────────────────────────────────
  // Three.js オブジェクト（非リアクティブ、直接管理）
  // ──────────────────────────────────────────────────────────────
  let renderer: THREE.WebGLRenderer | null = null;
  let scene:    THREE.Scene | null = null;
  let camera:   THREE.PerspectiveCamera | null = null;
  let controls: OrbitControls | null = null;
  let clock:    THREE.Clock | null = null;
  let animId:   number | null = null;
  let ro:       ResizeObserver | null = null;

  /**
   * VRM インスタンス。
   * 将来的に口パク・瞬き・感情表情を制御する場合はここを操作する。
   *   vrm.expressionManager?.setValue('happy', 1.0)
   *   vrm.humanoid?.getNormalizedBoneNode('head')?.rotation.set(...)
   */
  let vrm: VRM | null = null;

  // ──────────────────────────────────────────────────────────────
  // Three.js 初期化
  // ──────────────────────────────────────────────────────────────
  function initScene() {
    const w = wrapEl.clientWidth  || 400;
    const h = wrapEl.clientHeight || 400;

    // Renderer
    renderer = new THREE.WebGLRenderer({ canvas: canvasEl, alpha: true, antialias: true });
    renderer.setSize(w, h);
    renderer.setPixelRatio(window.devicePixelRatio);
    renderer.outputColorSpace = THREE.SRGBColorSpace;

    // Scene
    scene = new THREE.Scene();

    // Camera
    camera = new THREE.PerspectiveCamera(30, w / h, 0.1, 20);
    camera.position.set(0, 1.2, 3.2);

    // Lights
    const dir = new THREE.DirectionalLight(0xffffff, 1.4);
    dir.position.set(1, 2, 2);
    scene.add(dir);
    scene.add(new THREE.AmbientLight(0xffffff, 0.6));

    // OrbitControls
    controls = new OrbitControls(camera, renderer.domElement);
    controls.target.set(0, 0.9, 0);
    controls.enableDamping = true;
    controls.dampingFactor = 0.05;
    controls.minDistance   = 0.5;
    controls.maxDistance   = 10;
    controls.update();

    // Clock
    clock = new THREE.Clock();

    // Render loop
    const tick = () => {
      animId = requestAnimationFrame(tick);
      const delta = clock!.getDelta();

      // VRM 更新 ── 口パク・瞬き・spring bone はここで動く
      if (vrm) vrm.update(delta);

      controls!.update();
      renderer!.render(scene!, camera!);
    };
    tick();

    // ResizeObserver でキャンバスを親に追従させる
    ro = new ResizeObserver(updateSize);
    ro.observe(wrapEl);
  }

  function updateSize() {
    if (!renderer || !camera || !wrapEl) return;
    const w = wrapEl.clientWidth;
    const h = wrapEl.clientHeight;
    if (w === 0 || h === 0) return;
    renderer.setSize(w, h);
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
  }

  // ──────────────────────────────────────────────────────────────
  // VRM ロード
  // ──────────────────────────────────────────────────────────────
  async function loadVRM(url: string) {
    if (!scene) return;
    loading   = true;
    loadError = '';
    loaded    = false;

    const loader = new GLTFLoader();
    loader.register(parser => new VRMLoaderPlugin(parser));

    try {
      const gltf = await loader.loadAsync(url);
      const newVrm: VRM = gltf.userData.vrm;

      if (!newVrm) throw new Error('VRM データが見つかりませんでした');

      // 不要ジョイントを削除してパフォーマンス改善
      VRMUtils.removeUnnecessaryJoints(gltf.scene);

      // 前のモデルを破棄
      if (vrm) {
        scene.remove(vrm.scene);
        VRMUtils.deepDispose(vrm.scene);
      }

      vrm = newVrm;
      scene.add(vrm.scene);

      // カメラをモデルに自動フィット
      const box    = new THREE.Box3().setFromObject(vrm.scene);
      const center = box.getCenter(new THREE.Vector3());
      const size   = box.getSize(new THREE.Vector3());
      const h      = size.y;

      controls!.target.set(center.x, h * 0.55, center.z);
      camera!.position.set(center.x, h * 0.55, h * 1.7);
      controls!.update();

      loaded = true;
    } catch (e) {
      loadError = e instanceof Error ? e.message : 'VRM ロードに失敗しました';
    } finally {
      loading = false;
    }
  }

  // ──────────────────────────────────────────────────────────────
  // vrmUrl が変わったらリロード（sceneReady 後のみ実行）
  // ──────────────────────────────────────────────────────────────
  $effect(() => {
    if (sceneReady && vrmUrl) {
      loadVRM(vrmUrl);
    }
  });

  // ──────────────────────────────────────────────────────────────
  // Lifecycle
  // ──────────────────────────────────────────────────────────────
  onMount(() => {
    initScene();
    sceneReady = true;
    // $effect が sceneReady 変化で発火するので loadVRM は effect 側に任せる
  });

  onDestroy(() => {
    if (animId !== null) cancelAnimationFrame(animId);
    ro?.disconnect();
    if (vrm && scene) {
      scene.remove(vrm.scene);
      VRMUtils.deepDispose(vrm.scene);
    }
    controls?.dispose();
    renderer?.dispose();
  });
</script>

<!-- ============================================================
     Template
     ============================================================ -->
<div bind:this={wrapEl} class="vrm-wrap {className}">
  <canvas bind:this={canvasEl}></canvas>

  {#if loading}
    <div class="vrm-overlay">
      <span class="vrm-spinner"></span>
      <span>Loading VRM…</span>
    </div>
  {:else if loadError}
    <div class="vrm-overlay vrm-err">{loadError}</div>
  {:else if !loaded}
    <div class="vrm-overlay vrm-hint">
      VRM ファイルを読み込んでください
    </div>
  {/if}
</div>

<style>
.vrm-wrap {
  position: relative;
  width: 100%;
  height: 100%;
  overflow: hidden;
  background: transparent;
}

.vrm-wrap canvas {
  display: block;
  width: 100%;
  height: 100%;
}

/* オーバーレイ共通 */
.vrm-overlay {
  position: absolute;
  inset: 0;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 0.5rem;
  font-family: 'Courier New', monospace;
  font-size: 0.72rem;
  letter-spacing: 0.04em;
  color: rgba(0, 229, 255, 0.55);
  pointer-events: none;
  user-select: none;
}

.vrm-err  { color: rgba(244, 63, 94, 0.85); }
.vrm-hint { color: rgba(0, 229, 255, 0.35); }

/* ローディングスピナー */
.vrm-spinner {
  width: 22px;
  height: 22px;
  border: 2px solid rgba(0, 229, 255, 0.2);
  border-top-color: #00e5ff;
  border-radius: 50%;
  animation: vrm-spin 0.75s linear infinite;
}

@keyframes vrm-spin {
  to { transform: rotate(360deg); }
}
</style>
