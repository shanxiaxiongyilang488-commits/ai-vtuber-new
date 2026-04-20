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
  export type VrmEmotion = 'neutral' | 'happy' | 'angry' | 'thinking' | 'sad';
  export type VrmGaze    = 'center'  | 'left'  | 'right' | 'down';

  let {
    vrmUrl     = '',
    isThinking  = false,
    isSpeaking  = false,
    emotion     = 'neutral' as VrmEmotion,
    /** Python サーバーからの呼吸値 0.0〜1.0。-1 = 内部サイン波フォールバック */
    breathing   = -1,
    gaze        = 'center' as VrmGaze,
    class: className = '',
  }: {
    vrmUrl?:     string;
    isThinking?: boolean;
    isSpeaking?: boolean;
    emotion?:    VrmEmotion;
    breathing?:  number;
    gaze?:       VrmGaze;
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
  let debugView  = $state(false);

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

  /** 上半身ボーンキャッシュ */
  let spineBoneNode:         THREE.Object3D | null = null;
  let chestBoneNode:         THREE.Object3D | null = null;
  let rightShoulderBoneNode: THREE.Object3D | null = null;
  let leftShoulderBoneNode:  THREE.Object3D | null = null;

  /** 頭部回転の現在値（lerp 用） */
  let headRotX = 0;
  let headRotY = 0;

  /** thinking 時前傾の lerp 値 */
  let thinkLean = 0;

  // ──────────────────────────────────────────────────────────────
  // 口パクアニメーション用ステート（非リアクティブ）
  // ──────────────────────────────────────────────────────────────
  /** 現在の口の開き具合（lerp 後） */
  let mouthValue  = 0;
  /** 目標の口の開き具合 */
  let mouthTarget = 0;
  /** 次にターゲットを変える elapsed time */
  let mouthNextT  = 0;

  // ──────────────────────────────────────────────────────────────
  // 瞬き・待機モーション用ステート（非リアクティブ）
  // ──────────────────────────────────────────────────────────────
  /** 呼吸の頭部遅延追従値 */
  let breathHead = 0;

  /** 次の待機モーション更新の elapsed time */
  let idleNextT          = 0;
  /** 首こてん 目標/現在 (headBone Z) */
  let idleHeadTiltTarget = 0;
  let idleHeadTilt       = 0;
  /** 視線ずらし 目標/現在 (headBone Y offset) */
  let idleGazeTarget = 0;
  let idleGaze       = 0;
  /** 姿勢調整 目標/現在 (spine X offset) */
  let idlePostureTarget = 0;
  let idlePosture       = 0;

  /** 瞬き */
  let blinkNextT = 0;
  let blinking   = false;
  let blinkT     = 0;
  let blinkValue = 0;

  // ──────────────────────────────────────────────────────────────
  // 感情表情 lerp ステート（非リアクティブ）
  // ──────────────────────────────────────────────────────────────
  /** happy / Joy blendshape の現在値 */
  let emoHappy   = 0;
  /** angry / Angry blendshape の現在値 */
  let emoAngry   = 0;
  /** sad / Sorrow blendshape の現在値（thinking 困り顔用） */
  let emoSad = 0;

  /** 外部 breathing prop (0〜1) の 60fps スムージング用 */
  let breathSmooth = 0.5;

  // ──────────────────────────────────────────────────────────────
  // Tポーズ解除: ロード直後の自然な腕姿勢
  // ──────────────────────────────────────────────────────────────
  function applyIdlePose() {
    if (!vrm) return;
    const h = vrm.humanoid;
    const rUA = h?.getNormalizedBoneNode('rightUpperArm');
    const lUA = h?.getNormalizedBoneNode('leftUpperArm');
    const rLA = h?.getNormalizedBoneNode('rightLowerArm');
    const lLA = h?.getNormalizedBoneNode('leftLowerArm');
    // 上腕: Z で腕を下げる / X で少し前へ（肩内側）
    if (rUA) { rUA.rotation.z =  1.2; rUA.rotation.x = 0.1; }
    if (lUA) { lUA.rotation.z = -1.2; lUA.rotation.x = 0.1; }
    // 前腕: わずかに曲げる
    if (rLA) { rLA.rotation.z =  0.15; }
    if (lLA) { lLA.rotation.z = -0.15; }
  }

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
        // ── 呼吸 ──────────────────────────────────────────────────
        const t = clock!.getElapsedTime();
        // 外部 breathing prop(0〜1) があれば 60fps lerp で補間、なければ内部サイン波
        let breath: number;
        if (breathing >= 0) {
          breathSmooth = THREE.MathUtils.lerp(breathSmooth, breathing, 0.12);
          breath = breathSmooth * 2 - 1;   // 0〜1 → -1〜1
        } else {
          const breathMain = Math.sin(t * (Math.PI / 2));
          const breathSub  = Math.sin(t * (Math.PI / 1.8)) * 0.3;
          breath = (breathMain + breathSub) / 1.3;
        }

        // thinking 時の前傾をなめらかに lerp
        thinkLean = THREE.MathUtils.lerp(thinkLean, isThinking ? 0.045 : 0, 0.04);

        // ── ランダム待機モーション (3〜8秒間隔) ──────────────────
        if (t >= idleNextT) {
          idleNextT = t + 3 + Math.random() * 5;
          const s = isSpeaking ? 0.25 : isThinking ? 0.45 : 1.0;
          idleHeadTiltTarget = (Math.random() - 0.5) * 0.10 * s; // 首こてん
          idleGazeTarget     = (Math.random() - 0.5) * 0.18 * s; // 視線ずらし
          idlePostureTarget  = (Math.random() - 0.5) * 0.014 * s; // 姿勢調整
        }
        idleHeadTilt = THREE.MathUtils.lerp(idleHeadTilt, idleHeadTiltTarget, 0.012);
        idleGaze     = THREE.MathUtils.lerp(idleGaze,     idleGazeTarget,     0.012);
        idlePosture  = THREE.MathUtils.lerp(idlePosture,  idlePostureTarget,  0.012);

        // 脊椎・胸: 呼吸揺れ + thinking 前傾 + 姿勢調整
        if (spineBoneNode) {
          spineBoneNode.rotation.x = breath * 0.030 + thinkLean + idlePosture;
        }
        if (chestBoneNode) {
          chestBoneNode.rotation.x = breath * 0.020 + thinkLean * 0.55;
        }

        // 肩: 呼吸で微かに上下 (applyIdlePose のベース値に重ねる)
        if (rightShoulderBoneNode) {
          rightShoulderBoneNode.rotation.z = -0.08 + breath * 0.040;
        }
        if (leftShoulderBoneNode) {
          leftShoulderBoneNode.rotation.z  =  0.08 - breath * 0.040;
        }

        // ① 頭部ボーン回転 (thinking 時に視線が斜め上へ + speaking 時うなずき)
        //    vrm.update() より前に設定してスプリングボーンに反映させる
        if (headBoneNode) {
          breathHead = THREE.MathUtils.lerp(breathHead, breath, 0.04); // 呼吸の遅延追従
          // gaze prop による基本向き
          const gazeY = gaze === 'left'  ? -0.20 : gaze === 'right' ? 0.20 : 0;
          const gazeX = gaze === 'down'  ?  0.12 : 0;
          const tX = (isThinking ? -0.16 : 0) + gazeX;
          const tY = (isThinking ?  0.22 : 0) + gazeY;
          headRotX = THREE.MathUtils.lerp(headRotX, tX, 0.05);
          headRotY = THREE.MathUtils.lerp(headRotY, tY, 0.05);
          const speakNod = isSpeaking ? Math.sin(t * (Math.PI * 2 / 0.9)) * 0.025 : 0;
          headBoneNode.rotation.x = headRotX + speakNod + breathHead * 0.005;
          headBoneNode.rotation.y = headRotY + idleGaze;
          headBoneNode.rotation.z = idleHeadTilt;
        }

        // ── 瞬き (ランダム 2.5〜6秒間隔) ─────────────────────────
        if (!blinking && t >= blinkNextT) {
          blinking   = true;
          blinkT     = 0;
          blinkNextT = t + 2.5 + Math.random() * 3.5;
        }
        if (blinking) {
          blinkT += delta;
          const CLOSE = 0.12; // 閉じるのに 120ms
          const OPEN  = 0.18; // 開くのに 180ms
          if (blinkT < CLOSE) {
            blinkValue = blinkT / CLOSE;
          } else if (blinkT < CLOSE + OPEN) {
            blinkValue = 1 - (blinkT - CLOSE) / OPEN;
          } else {
            blinkValue = 0;
            blinking   = false;
          }
        }
        if (vrm.expressionManager) {
          vrm.expressionManager.setValue('blink', blinkValue); // VRM 1.0
          vrm.expressionManager.setValue('Blink', blinkValue); // VRM 0.x
        }

        // ── 口パク (isSpeaking 時のみ) ────────────────────────────
        if (isSpeaking) {
          if (t >= mouthNextT) {
            mouthTarget = 0.4 + Math.random() * 0.6;
            // 6〜8 回/秒 → 0.125〜0.167 秒間隔
            mouthNextT  = t + 0.125 + Math.random() * 0.042;
          }
        } else {
          mouthTarget = 0;
        }
        mouthValue = THREE.MathUtils.lerp(mouthValue, mouthTarget, 0.35);
        if (vrm.expressionManager) {
          vrm.expressionManager.setValue('aa', mouthValue); // VRM 1.0
          vrm.expressionManager.setValue('A',  mouthValue); // VRM 0.x
        }

        // ── 感情表情 (emotion prop) ──────────────────────────────────
        // happy=0.60 / angry=0.55 / thinking(困り)=0.35 / neutral=0
        const EL = 0.04;
        emoHappy = THREE.MathUtils.lerp(emoHappy, emotion === 'happy'    ? 0.60 : 0, EL);
        emoAngry = THREE.MathUtils.lerp(emoAngry, emotion === 'angry'    ? 0.55 : 0, EL);
        emoSad   = THREE.MathUtils.lerp(emoSad,   emotion === 'thinking' ? 0.35 : 0, EL);
        if (vrm.expressionManager) {
          // VRM 1.0 expression names
          vrm.expressionManager.setValue('happy',   emoHappy);
          vrm.expressionManager.setValue('angry',   emoAngry);
          vrm.expressionManager.setValue('sad',     emoSad);
          // VRM 0.x (Pre-VRM 1.0) expression names
          vrm.expressionManager.setValue('Joy',     emoHappy);
          vrm.expressionManager.setValue('Angry',   emoAngry);
          vrm.expressionManager.setValue('Sorrow',  emoSad);
        }

        // ② VRM 更新 (スプリングボーン・表情など)
        vrm.update(delta);
      }

      // ③ OrbitControls 更新 (ユーザー操作 + ダンピング)
      controls!.update();

      // ④ speaking 時に少し寄る (DEBUG 時はユーザー操作に委ねる)
      if (vrm && !debugView) {
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
    headBoneNode          = null;
    spineBoneNode         = null;
    chestBoneNode         = null;
    rightShoulderBoneNode = null;
    leftShoulderBoneNode  = null;
    headRotX  = 0;
    headRotY  = 0;
    thinkLean = 0;
    mouthValue  = 0;
    mouthTarget = 0;
    mouthNextT  = 0;
    breathHead  = 0;
    idleNextT          = 0;
    idleHeadTiltTarget = 0;  idleHeadTilt = 0;
    idleGazeTarget     = 0;  idleGaze     = 0;
    idlePostureTarget  = 0;  idlePosture  = 0;
    blinkNextT = 0;
    blinking   = false;
    blinkT     = 0;
    blinkValue = 0;
    emoHappy     = 0;
    emoAngry     = 0;
    emoSad       = 0;
    breathSmooth = 0.5;

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

      // ボーンをキャッシュ (tick 内でのルックアップを省く)
      headBoneNode          = vrm.humanoid?.getNormalizedBoneNode('head')          ?? null;
      spineBoneNode         = vrm.humanoid?.getNormalizedBoneNode('spine')         ?? null;
      chestBoneNode         = vrm.humanoid?.getNormalizedBoneNode('chest')         ?? null;
      rightShoulderBoneNode = vrm.humanoid?.getNormalizedBoneNode('rightShoulder') ?? null;
      leftShoulderBoneNode  = vrm.humanoid?.getNormalizedBoneNode('leftShoulder')  ?? null;

      // Tポーズ解除: ロード直後に自然な腕の姿勢を適用
      applyIdlePose();

      // カメラを胸上フレーミングに自動調整
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

  // debugView 切り替え時に OrbitControls のズーム設定を同期
  $effect(() => {
    if (!controls || !camera) return;
    if (debugView) {
      controls.enableZoom  = true;
      controls.minDistance = 0.3;
      controls.maxDistance = 5.0;
    } else {
      controls.enableZoom  = false;
      controls.minDistance = 0;
      controls.maxDistance = Infinity;
      // LIVE に戻った瞬間の実距離を currentDist に同期してスムーズに戻す
      currentDist = camera.position.distanceTo(controls.target);
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

  <button
    class="dbg-btn"
    class:dbg-active={debugView}
    onclick={() => debugView = !debugView}
  >{debugView ? 'LIVE' : 'DEBUG VIEW'}</button>

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

/* DEBUG VIEW ボタン */
.dbg-btn {
  position: absolute;
  top: 0.5rem;
  right: 0.5rem;
  padding: 0.18rem 0.5rem;
  font-family: 'Courier New', monospace;
  font-size: 0.60rem;
  letter-spacing: 0.07em;
  background: rgba(0, 0, 0, 0.50);
  border: 1px solid rgba(0, 229, 255, 0.28);
  border-radius: 3px;
  color: rgba(0, 229, 255, 0.50);
  cursor: pointer;
  user-select: none;
  z-index: 10;
  transition: color 0.2s, border-color 0.2s;
}
.dbg-btn:hover {
  color: rgba(0, 229, 255, 0.90);
  border-color: rgba(0, 229, 255, 0.60);
}
.dbg-btn.dbg-active {
  color: rgba(251, 191, 36, 0.85);
  border-color: rgba(251, 191, 36, 0.45);
}

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
