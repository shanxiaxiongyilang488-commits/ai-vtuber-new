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
  // 腕仕草システム用ステート（非リアクティブ）
  // ──────────────────────────────────────────────────────────────
  /** 腕ボーンキャッシュ */
  let rightUpperArmNode: THREE.Object3D | null = null;
  let rightLowerArmNode: THREE.Object3D | null = null;
  let rightHandNode:     THREE.Object3D | null = null;
  let leftUpperArmNode:  THREE.Object3D | null = null;
  let leftLowerArmNode:  THREE.Object3D | null = null;
  let leftHandNode:      THREE.Object3D | null = null;

  /**
   * 仕草 ID: 0=なし 1=前髪を触る 2=口元に手 3=小さく手を振る 4=胸元で手を整える
   */
  let gestureId      = 0;
  /** 波振動スケール用ブレンド (0→1→0) */
  let gestureBlend   = 0;
  let gestureHolding = false;
  let gestureEndT    = 0;
  /** 最初の仕草は 8〜15 秒後 */
  let gestureNextT   = 8 + Math.random() * 7;

  /**
   * 右腕現在回転（lerp ベース、applyIdlePose と同値で初期化）
   * tick 内で毎フレーム目標へ lerp → ボーンへ適用する
   */
  let armRuax = 0.08, armRuaz =  1.25; // rightUpperArm x/z
  let armRlaz = -0.20;                   // rightLowerArm z
  let armRhz  = -0.10;                   // rightHand z
  /** 左腕現在回転 */
  let armLuax = 0.08, armLuaz = -1.25; // leftUpperArm x/z
  let armLlaz =  0.20;                   // leftLowerArm z
  let armLhz  =  0.10;                   // leftHand z

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
        // ── 呼吸 ──────────────────────────────────────────────────
        const t = clock!.getElapsedTime();
        // 主波 (4s) + 副波 (3.6s) の合成で有機的なリズムに
        const breathMain = Math.sin(t * (Math.PI / 2));
        const breathSub  = Math.sin(t * (Math.PI / 1.8)) * 0.3;
        const breath     = (breathMain + breathSub) / 1.3;

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
          spineBoneNode.rotation.x = breath * 0.012 + thinkLean + idlePosture;
        }
        if (chestBoneNode) {
          chestBoneNode.rotation.x = breath * 0.008 + thinkLean * 0.55;
        }

        // 肩: 呼吸で微かに上下 (applyIdlePose のベース値に重ねる)
        if (rightShoulderBoneNode) {
          rightShoulderBoneNode.rotation.z = -0.08 + breath * 0.018;
        }
        if (leftShoulderBoneNode) {
          leftShoulderBoneNode.rotation.z  =  0.08 - breath * 0.018;
        }

        // ① 頭部ボーン回転 (thinking 時に視線が斜め上へ + speaking 時うなずき)
        //    vrm.update() より前に設定してスプリングボーンに反映させる
        if (headBoneNode) {
          breathHead = THREE.MathUtils.lerp(breathHead, breath, 0.04); // 呼吸の遅延追従
          const tX = isThinking ? -0.16 : 0;  // 上を向く (負 = look up)
          const tY = isThinking ?  0.22 : 0;  // 横を向く
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
          const CLOSE = 0.08; // 閉じるのに 80ms
          const OPEN  = 0.12; // 開くのに 120ms
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
            mouthTarget = Math.random() * 0.8;
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

        // ── 腕仕草（10〜25 秒間隔） ───────────────────────────────
        if (t >= gestureNextT && !gestureHolding) {
          const roll = Math.random();
          if (isSpeaking) {
            gestureId = 0;                                       // speaking中は仕草なし
          } else if (isThinking) {
            gestureId = roll < 0.55 ? 2 : roll < 0.80 ? 4 : 1; // 口元を優先
          } else {
            gestureId = Math.floor(roll * 4) + 1;               // 1〜4 均等
          }
          if (gestureId > 0) {
            gestureHolding = true;
            gestureEndT    = t + 2.5 + Math.random() * 2.5;    // 2.5〜5 秒保持
          }
          gestureNextT = t + 10 + Math.random() * 15;          // 次は 10〜25 秒後
        }
        if (gestureHolding && t >= gestureEndT) gestureHolding = false;
        gestureBlend = THREE.MathUtils.lerp(gestureBlend, gestureHolding ? 1.0 : 0.0, 0.022);

        // 右腕目標値（gestureHolding でない場合はアイドル値 = 自動復帰）
        let tRuax = 0.08, tRuaz =  1.25, tRlaz = -0.20, tRhz = -0.10;
        if (gestureHolding) {
          if      (gestureId === 1) { tRuax = 0.85; tRuaz = 0.10; tRlaz = -0.75; tRhz = -0.35; }
          else if (gestureId === 2) { tRuax = 0.72; tRuaz = 0.45; tRlaz = -1.00; tRhz = -0.20; }
          else if (gestureId === 3) { tRuax = 0.42; tRuaz = 0.28; tRlaz = -0.50; tRhz =  0.00; }
          else if (gestureId === 4) { tRuax = 0.58; tRuaz = 0.62; tRlaz = -0.82; tRhz = -0.20; }
        }
        // 左腕目標値（胸元調整のみ）
        let tLuax = 0.08, tLuaz = -1.25, tLlaz =  0.20, tLhz = 0.10;
        if (gestureHolding && gestureId === 4) {
          tLuax = 0.58; tLuaz = -0.62; tLlaz = 0.82; tLhz = 0.20;
        }

        // lerp: ゆっくり自然に動かす
        const AL = 0.022;
        armRuax = THREE.MathUtils.lerp(armRuax, tRuax, AL);
        armRuaz = THREE.MathUtils.lerp(armRuaz, tRuaz, AL);
        armRlaz = THREE.MathUtils.lerp(armRlaz, tRlaz, AL);
        armRhz  = THREE.MathUtils.lerp(armRhz,  tRhz,  AL);
        armLuax = THREE.MathUtils.lerp(armLuax, tLuax, AL);
        armLuaz = THREE.MathUtils.lerp(armLuaz, tLuaz, AL);
        armLlaz = THREE.MathUtils.lerp(armLlaz, tLlaz, AL);
        armLhz  = THREE.MathUtils.lerp(armLhz,  tLhz,  AL);

        // ボーンへ適用
        if (rightUpperArmNode) { rightUpperArmNode.rotation.x = armRuax; rightUpperArmNode.rotation.z = armRuaz; }
        if (rightLowerArmNode) { rightLowerArmNode.rotation.z = armRlaz; }
        if (rightHandNode) {
          rightHandNode.rotation.z = armRhz;
          // 手振りジェスチャー: 手首に正弦波を重ねる
          if (gestureId === 3) rightHandNode.rotation.z += Math.sin(t * 8.0) * 0.28 * gestureBlend;
        }
        if (leftUpperArmNode) { leftUpperArmNode.rotation.x = armLuax; leftUpperArmNode.rotation.z = armLuaz; }
        if (leftLowerArmNode) { leftLowerArmNode.rotation.z = armLlaz; }
        if (leftHandNode)     { leftHandNode.rotation.z     = armLhz; }

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
    rightUpperArmNode = null;
    rightLowerArmNode = null;
    rightHandNode     = null;
    leftUpperArmNode  = null;
    leftLowerArmNode  = null;
    leftHandNode      = null;
    gestureId      = 0;
    gestureBlend   = 0;
    gestureHolding = false;
    gestureEndT    = 0;
    gestureNextT   = 8 + Math.random() * 7;
    armRuax = 0.08; armRuaz =  1.25; armRlaz = -0.20; armRhz = -0.10;
    armLuax = 0.08; armLuaz = -1.25; armLlaz =  0.20; armLhz =  0.10;

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
      rightUpperArmNode     = vrm.humanoid?.getNormalizedBoneNode('rightUpperArm') ?? null;
      rightLowerArmNode     = vrm.humanoid?.getNormalizedBoneNode('rightLowerArm') ?? null;
      rightHandNode         = vrm.humanoid?.getNormalizedBoneNode('rightHand')     ?? null;
      leftUpperArmNode      = vrm.humanoid?.getNormalizedBoneNode('leftUpperArm')  ?? null;
      leftLowerArmNode      = vrm.humanoid?.getNormalizedBoneNode('leftLowerArm')  ?? null;
      leftHandNode          = vrm.humanoid?.getNormalizedBoneNode('leftHand')      ?? null;

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
