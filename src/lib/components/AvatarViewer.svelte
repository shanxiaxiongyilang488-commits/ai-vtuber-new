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
    vrmUrl    = '',
    isThinking = false,
    isSpeaking = false,
    class: className = '',
  }: {
    vrmUrl?:     string;
    isThinking?: boolean;
    isSpeaking?: boolean;
    class?:      string;
  } = $props();

  // ──────────────────────────────────────────────────────────────
  // DOM refs
  // ──────────────────────────────────────────────────────────────
  let wrapEl:   HTMLDivElement;
  let canvasEl: HTMLCanvasElement;

  // ──────────────────────────────────────────────────────────────
  // UI state (reactive)
  // ──────────────────────────────────────────────────────────────
  let loaded     = $state(false);
  let loading    = $state(false);
  let loadError  = $state('');
  let sceneReady = $state(false);

  // ──────────────────────────────────────────────────────────────
  // Three.js オブジェクト（非リアクティブ）
  // ──────────────────────────────────────────────────────────────
  let renderer: THREE.WebGLRenderer    | null = null;
  let scene:    THREE.Scene            | null = null;
  let camera:   THREE.PerspectiveCamera | null = null;
  let controls: OrbitControls          | null = null;
  let clock:    THREE.Clock            | null = null;
  let animId:   number                 | null = null;
  let ro:       ResizeObserver         | null = null;
  let vrm:      VRM                    | null = null;

  // ──────────────────────────────────────────────────────────────
  // カメラ / 頭部アニメーション用ステート（非リアクティブ）
  // ──────────────────────────────────────────────────────────────
  /** ロード直後に計算した「基準距離」。speaking/thinking で前後する */
  let baseDistance = 2.0;
  /** 毎フレーム lerp する現在距離 */
  let currentDist  = 2.0;

  /** ヘッドボーンへのキャッシュ（毎フレーム lookup しない） */
  let headBoneNode: THREE.Object3D | null = null;

  /** 頭部回転の現在値（lerp 用） */
  let headRotX = 0;
  let headRotY = 0;

  // ──────────────────────────────────────────────────────────────
  // カメラ自動フレーミング（胸上・会話向け）
  // ──────────────────────────────────────────────────────────────
  /**
   * ロードしたVRMモデルのサイズに合わせてカメラを調整する。
   * - ヘッドボーンがあればその世界座標を使い、なければ bbox で推定。
   * - FOV 22° 固定で「全身の約 25%（肩〜頭頂）」がちょうど収まる距離を計算。
   * - これによりモデルを差し替えてもフレーミングが破綻しにくい。
   */
  function frameForConversation(loadedVrm: VRM) {
    const box    = new THREE.Box3().setFromObject(loadedVrm.scene);
    const size   = box.getSize(new THREE.Vector3());
    const center = box.getCenter(new THREE.Vector3());
    const modelH = size.y;

    // ── 視点ターゲット Y: 顎の高さ ────────────────────────────
    // 頭ボーン原点から少し下 = 顎〜顎下あたり
    let targetY: number;
    const head = loadedVrm.humanoid?.getNormalizedBoneNode('head');
    if (head) {
      const wp = new THREE.Vector3();
      head.getWorldPosition(wp);
      targetY = wp.y + modelH * 0.02;
    } else {
      // fallback: bbox 上端から 12% 下 ≈ 顎あたり
      targetY = box.max.y - modelH * 0.08;
    }

    // ── 距離: FOV 22° で「肩〜頭頂」が縦幅の 25% ────────────
    // targetY (顎) ± 12.5% → 上端がほぼ頭頂・下端が肩あたり
    const FOV_DEG  = 18;
    const fovRad   = (FOV_DEG / 2) * (Math.PI / 180);
    const visibleH = modelH * 0.25;
    const dist     = (visibleH / 2) / Math.tan(fovRad) * 0.82;

    // ── 中央配置: オフセットなし ──────────────────────────────
    const rightShift = 0;

    baseDistance = dist;
    currentDist  = dist;

    camera!.fov = FOV_DEG;
    camera!.updateProjectionMatrix();

    controls!.target.set(center.x + rightShift, targetY, center.z);
    camera!.position.set(center.x + rightShift, targetY, dist);
    controls!.update();
  }

  // ──────────────────────────────────────────────────────────────
  // 自然な待機ポーズ（ロード時一度だけ適用）
  // ──────────────────────────────────────────────────────────────
  /**
   * Tポーズになっている腕ボーンを自然な下ろし姿勢に補正する。
   * three-vrm の Normalized Bone（Y-up, T-pose = 回転ゼロ）に対して
   * 直接 Euler 回転を設定するだけなので vrm.update() で上書きされない。
   * 顔・首・カメラ・speaking/thinking 演出には一切触れない。
   */
  function applyIdlePose(loadedVrm: VRM) {
    const h = loadedVrm.humanoid;
    if (!h) return;

    // [ボーン名, { x?, y?, z? }] — Euler 角度 (rad)
    // 右腕系は Z 負方向で下へ、左腕系は Z 正方向で下へ（Y-up 右手系）
    const poseTable: Array<[string, { x?: number; y?: number; z?: number }]> = [
      ['rightShoulder',  { z: -0.08 }],          // 肩の力を抜く
      ['leftShoulder',   { z:  0.08 }],
      ['rightUpperArm',  { z:  1.25, x: 0.08 }], // 腕を体側へ下ろす + 少し前傾
      ['leftUpperArm',   { z: -1.25, x: 0.08 }],
      ['rightLowerArm',  { z: -0.2  }],           // 肘を自然に曲げる
      ['leftLowerArm',   { z:  0.2  }],
      ['rightHand',      { z: -0.1  }],           // 手首の自然な角度
      ['leftHand',       { z:  0.1  }],
    ];

    for (const [name, rot] of poseTable) {
      const bone = h.getNormalizedBoneNode(name as any);
      if (!bone) continue;
      if (rot.x !== undefined) bone.rotation.x = rot.x;
      if (rot.y !== undefined) bone.rotation.y = rot.y;
      if (rot.z !== undefined) bone.rotation.z = rot.z;
    }
  }

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

    // Camera (FOV はモデルロード後に上書きされる)
    camera = new THREE.PerspectiveCamera(22, w / h, 0.1, 20);
    camera.position.set(0, 1.3, 2.5);

    // ── ライティング: 顔を自然に見せるキー+フィル ────────────
    const keyLight = new THREE.DirectionalLight(0xffffff, 1.2);
    keyLight.position.set(0.6, 1.5, 2.0);
    scene.add(keyLight);

    const fillLight = new THREE.DirectionalLight(0xffffff, 0.45);
    fillLight.position.set(-1.2, 0.5, 1.0);
    scene.add(fillLight);

    scene.add(new THREE.AmbientLight(0xffffff, 0.55));

    // ── OrbitControls: 回転のみ（ズーム・パンは無効） ─────────
    controls = new OrbitControls(camera, renderer.domElement);
    controls.target.set(0, 1.3, 0);
    controls.enableDamping  = true;
    controls.dampingFactor  = 0.06;
    controls.enableZoom     = false;   // 距離はプログラム側で制御
    controls.enablePan      = false;
    controls.minPolarAngle  = Math.PI * 0.2;   // 真上方向に回しすぎない
    controls.maxPolarAngle  = Math.PI * 0.75;  // 真下方向に回しすぎない
    controls.update();

    // Clock
    clock = new THREE.Clock();

    // ── レンダーループ ────────────────────────────────────────
    const tick = () => {
      animId = requestAnimationFrame(tick);
      const delta = clock!.getDelta();

      if (vrm) {
        // ① 頭部ボーン回転 (thinking 時に視線が斜め上へ)
        //    vrm.update() より前に設定してスプリングボーンに反映させる
        if (headBoneNode) {
          const tX = isThinking ? -0.16 : 0;  // 上を向く (負 = look up)
          const tY = isThinking ?  0.22 : 0;  // 横を向く
          headRotX = THREE.MathUtils.lerp(headRotX, tX, 0.05);
          headRotY = THREE.MathUtils.lerp(headRotY, tY, 0.05);
          headBoneNode.rotation.x = headRotX;
          headBoneNode.rotation.y = headRotY;
        }

        // ② VRM 更新 (スプリングボーン・表情など)
        vrm.update(delta);
      }

      // ③ OrbitControls 更新 (ユーザー操作 + ダンピング)
      controls!.update();

      // ④ speaking 時に少し寄る (controls.update() 後に距離を上書き)
      if (vrm) {
        const targetDist = isSpeaking ? baseDistance * 0.84 : baseDistance;
        currentDist = THREE.MathUtils.lerp(currentDist, targetDist, 0.04);

        // カメラ〜ターゲット方向を維持しつつ距離だけ変える
        const dir = camera!.position.clone().sub(controls!.target).normalize();
        camera!.position.copy(controls!.target).addScaledVector(dir, currentDist);
      }

      renderer!.render(scene!, camera!);
    };
    tick();

    // ResizeObserver でキャンバスを親に追従
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

    // アニメーション状態リセット
    headBoneNode = null;
    headRotX     = 0;
    headRotY     = 0;

    const loader = new GLTFLoader();
    loader.register(parser => new VRMLoaderPlugin(parser));

    try {
      const gltf   = await loader.loadAsync(url);
      const newVrm: VRM = gltf.userData.vrm;

      if (!newVrm) throw new Error('VRM データが見つかりませんでした');

      VRMUtils.removeUnnecessaryJoints(gltf.scene);

      // 前モデルを破棄
      if (vrm) {
        scene.remove(vrm.scene);
        VRMUtils.deepDispose(vrm.scene);
      }

      vrm = newVrm;
      scene.add(vrm.scene);

      // ヘッドボーンをキャッシュ (tick 内でのルックアップを省く)
      headBoneNode = vrm.humanoid?.getNormalizedBoneNode('head') ?? null;

      // Tポーズを自然な待機姿勢へ補正（ロード時一度だけ）
      applyIdlePose(vrm);

      // カメラを胸上フレーミングに自動調整（ポーズ適用後に bbox を取る）
      frameForConversation(vrm);

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
