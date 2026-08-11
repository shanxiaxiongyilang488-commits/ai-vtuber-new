<script lang="ts">
  import { goto } from '$app/navigation';

  type LabModule = {
    id: string;
    label: string;
    href: string;
    status: string;
    description: string;
    tone: 'cyan' | 'purple';
  };

  const modules: LabModule[] = [
    {
      id: 'avatar-live',
      label: 'AVATAR LIVE',
      href: '/avatar-live',
      status: '5 AVATAR SYSTEMS',
      description: 'PNGTuber / VRM / Live2D / PuruPuru / Inochi2D を選んでAI配信',
      tone: 'purple',
    },
    {
      id: 'aituber',
      label: 'AITUBER STUDIO',
      href: '/aituber',
      status: 'LIVE CHARACTER',
      description: 'キャラクターを選び、音声・自発会話・配信アバターをまとめてセットアップ',
      tone: 'cyan',
    },
    {
      id: 'memory',
      label: 'CHAT',
      href: '/chat',
      status: 'MEMORY SYSTEM',
      description: '会話・人格記憶・対話ログ研究画面',
      tone: 'purple',
    },
    {
      id: 'voice',
      label: 'VOICE LAB',
      href: '/voice',
      status: 'LOCAL AUDIO',
      description: '音声合成・声質設計・音声ライブラリ研究',
      tone: 'cyan',
    },
    {
      id: 'manga',
      label: 'PROJECT',
      href: '/project',
      status: 'VISUAL GEN',
      description: 'コマ割り・画像生成・マンガ制作研究',
      tone: 'purple',
    },
    {
      id: 'story',
      label: 'STORY',
      href: '/story',
      status: 'YAML ARCHIVE',
      description: '生成したStory YAMLのカード表示・保存・漫画化',
      tone: 'cyan',
    },
    {
      id: 'characters',
      label: 'CHARACTERS',
      href: '/characters',
      status: 'CHARACTER SHEET',
      description: 'キャラクター画像・名前・役割・説明の管理',
      tone: 'purple',
    },
    {
      id: 'character-memory',
      label: 'CHARACTER MEMORY',
      href: '/character-memory',
      status: 'MEMORY CHAT',
      description: 'キャラと会話して性格・口調・好き嫌いを記憶',
      tone: 'cyan',
    },
    {
      id: 'settings',
      label: 'SETTINGS',
      href: '/settings/api',
      status: 'SYSTEM CONFIG',
      description: 'API・モデル・接続状態の管理端末',
      tone: 'cyan',
    },
    {
      id: 'video-analysis',
      label: '🔎 CHARACTER SCANNER',
      href: '/video-analysis',
      status: 'VISUAL MEMORY EXTRACTION',
      description: 'MP4から1秒ごとに最大20枚を抽出し、顔・全身・耳・尻尾のキャラクター資料JSONを生成',
      tone: 'cyan',
    },
    {
      id: 'mouth-picker',
      label: '🎭 MOUTH PICKER',
      href: '/mouth-picker',
      status: 'AVATAR ASSETS',
      description: '動画から口パク・瞬き差分をタグ付けし、.purupuru アバターを書き出す',
      tone: 'purple',
    },
    {
      id: 'lab',
      label: 'AI PERSONALITY LAB',
      href: '/lab',
      status: 'DEVELOPER TOOLS',
      description: '動画エンジン、デバッグ、実験のための開発ツール。',
      tone: 'purple',
    },
  ];

  function openProject() {
    console.log('OPEN PROJECT');
    goto('/project');
  }

  function openSettings() {
    console.log('OPEN SETTINGS');
    goto('/settings/api');
  }

  function openModule(event: MouseEvent, module: LabModule) {
    if (module.id === 'manga') {
      event.preventDefault();
      openProject();
    }

    if (module.id === 'settings') {
      event.preventDefault();
      openSettings();
    }
  }
</script>

<svelte:head>
  <link rel="preconnect" href="https://fonts.googleapis.com" />
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin="anonymous" />
  <link
    href="https://fonts.googleapis.com/css2?family=Orbitron:wght@400;600;700;800;900&family=Rajdhani:wght@300;400;500;600;700&display=swap"
    rel="stylesheet"
  />
</svelte:head>

<div class="terminal-shell">
  <div class="grid-bg" aria-hidden="true"></div>
  <div class="scanlines" aria-hidden="true"></div>
  <div class="holo-sweep" aria-hidden="true"></div>

  <main class="terminal">
    <header class="terminal-header">
      <div class="status-row">
        <span class="status-pill"><span class="status-dot"></span>SYSTEM ONLINE</span>
        <span class="status-code">AI RESEARCH FACILITY / CENTRAL TERMINAL</span>
        <span class="status-pill purple">SECURE LINK</span>
      </div>

      <div class="title-block">
        <p class="eyebrow">MAIN FACILITY LAUNCHER</p>
        <h1>
          <span>AI EXPERIMENT</span>
          <strong>TERMINAL</strong>
        </h1>
        <p class="subtitle">AI研究施設 中央制御端末</p>
      </div>
    </header>

    <section class="core-zone" aria-label="Main route">
      <a href="/character-memory" class="core-link primary-memory-link" aria-label="CHARACTER MEMORY CHAT">
        <span class="core-ready">[ MAIN EXPERIENCE ]</span>
        <span class="core-title">CHARACTER MEMORY CHAT</span>
        <span class="core-description">キャラクターと暮らし、会話から物語と映像を育てる場所</span>
        <span class="core-enter">START LIVING</span>
      </a>
      <div class="side-readout left">
        <span>CORE ROUTE</span>
        <b>CHAT SYSTEM</b>
      </div>

      <a href="/lab" class="core-link" aria-label="AI PERSONALITY LABへ移動">
        <span class="corner tl"></span>
        <span class="corner tr"></span>
        <span class="corner bl"></span>
        <span class="corner br"></span>
        <span class="core-scan"></span>

        <span class="core-ready">[ SYS READY ]</span>
        <span class="core-graphic" aria-hidden="true">
          <span class="ring ring-outer"></span>
          <span class="ring ring-mid"></span>
          <span class="ring ring-inner"></span>
          <span class="core-dot"></span>
        </span>
        <span class="core-title">AI PERSONALITY LAB</span>
        <span class="core-description">人格・感情・記憶研究システム</span>
        <span class="core-enter">ENTER CORE</span>
      </a>

      <div class="side-readout right">
        <span>ACCESS LEVEL</span>
        <b>ACTIVE</b>
      </div>
    </section>

    <section class="module-section" aria-label="Research modules">
      <div class="section-title">
        <span></span>
        <h2>RESEARCH MODULES</h2>
        <span></span>
      </div>

      <div class="module-grid">
        {#each modules as module}
          <a
            href={module.href}
            class:cyan={module.tone === 'cyan'}
            class:purple={module.tone === 'purple'}
            class="module-card"
            onclick={(event) => openModule(event, module)}
          >
            <div class="module-topline">
              <span>{module.status}</span>
              <i>{module.id.toUpperCase()}</i>
            </div>
            <h3>{module.label}</h3>
            <p>{module.description}</p>
            <div class="module-footer">
              <span>OPEN MODULE</span>
              <b>→</b>
            </div>
          </a>
        {/each}
      </div>
    </section>

    <footer class="terminal-footer">
      <span>NEURAL LINK ESTABLISHED</span>
      <span class="divider"></span>
      <span>AI CORE ACTIVE</span>
      <span class="divider"></span>
      <span>LAB NETWORK STANDBY</span>
    </footer>
  </main>
</div>

<style>
  :global(body) {
    margin: 0;
    background: #030712 !important;
    color: #e2e8f0;
    font-family: 'Rajdhani', 'Segoe UI', sans-serif;
    overflow-x: hidden;
  }

  :global(*, *::before, *::after) {
    box-sizing: border-box;
    letter-spacing: 0;
  }

  .terminal-shell {
    position: relative;
    min-height: 100vh;
    overflow: hidden;
    background:
      radial-gradient(circle at 50% -10%, rgba(56, 189, 248, 0.18), transparent 38%),
      radial-gradient(circle at 15% 80%, rgba(168, 85, 247, 0.14), transparent 34%),
      linear-gradient(180deg, #020617 0%, #030712 48%, #050816 100%);
  }

  .grid-bg,
  .scanlines,
  .holo-sweep {
    position: fixed;
    inset: 0;
    pointer-events: none;
  }

  .grid-bg {
    z-index: 0;
    background-image:
      linear-gradient(rgba(56, 189, 248, 0.045) 1px, transparent 1px),
      linear-gradient(90deg, rgba(56, 189, 248, 0.045) 1px, transparent 1px),
      linear-gradient(rgba(168, 85, 247, 0.028) 1px, transparent 1px),
      linear-gradient(90deg, rgba(168, 85, 247, 0.028) 1px, transparent 1px);
    background-size: 56px 56px, 56px 56px, 14px 14px, 14px 14px;
    mask-image: linear-gradient(to bottom, rgba(0,0,0,0.9), rgba(0,0,0,0.42));
  }

  .scanlines {
    z-index: 3;
    background: repeating-linear-gradient(
      0deg,
      rgba(255,255,255,0.018),
      rgba(255,255,255,0.018) 1px,
      transparent 1px,
      transparent 4px
    );
    mix-blend-mode: screen;
    opacity: 0.45;
  }

  .holo-sweep {
    z-index: 1;
    background: linear-gradient(115deg, transparent 0%, rgba(56,189,248,0.05) 48%, transparent 58%);
    transform: translateX(-70%);
    animation: sweep 9s ease-in-out infinite;
  }

  @keyframes sweep {
    0%, 36% { transform: translateX(-70%); opacity: 0; }
    48% { opacity: 1; }
    64%, 100% { transform: translateX(70%); opacity: 0; }
  }

  .terminal {
    position: relative;
    z-index: 2;
    width: min(1180px, calc(100vw - 40px));
    min-height: 100vh;
    margin: 0 auto;
    padding: 36px 0 28px;
    display: grid;
    grid-template-rows: auto auto 1fr auto;
    gap: 30px;
  }

  .terminal-header {
    display: grid;
    gap: 24px;
  }

  .status-row {
    display: grid;
    grid-template-columns: minmax(160px, auto) 1fr minmax(140px, auto);
    align-items: center;
    gap: 14px;
    font-family: 'Orbitron', sans-serif;
    font-size: 11px !important;
    color: rgba(203, 213, 225, 0.55);
    text-transform: uppercase;
  }

  .status-code {
    justify-self: center;
    color: rgba(56, 189, 248, 0.7);
    letter-spacing: 0.14em;
  }

  .status-pill {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    gap: 8px;
    min-height: 30px;
    border: 1px solid rgba(56, 189, 248, 0.24);
    background: rgba(8, 18, 36, 0.55);
    color: #67e8f9;
    box-shadow: inset 0 0 16px rgba(56, 189, 248, 0.05);
  }

  .status-pill.purple {
    border-color: rgba(168, 85, 247, 0.28);
    color: #c084fc;
  }

  .status-dot {
    width: 6px;
    height: 6px;
    border-radius: 50%;
    background: #38bdf8;
    box-shadow: 0 0 10px #38bdf8, 0 0 22px rgba(56,189,248,0.7);
    animation: pulse-dot 2.2s ease-in-out infinite;
  }

  @keyframes pulse-dot {
    0%, 100% { opacity: 1; }
    50% { opacity: 0.28; }
  }

  .title-block {
    text-align: center;
  }

  .eyebrow {
    margin: 0 0 8px;
    color: rgba(148, 163, 184, 0.68);
    font-family: 'Orbitron', sans-serif;
    font-size: 11px !important;
    letter-spacing: 0.22em;
  }

  h1 {
    margin: 0;
    display: grid;
    gap: 2px;
    font-family: 'Orbitron', sans-serif;
    line-height: 0.95;
    text-transform: uppercase;
  }

  h1 span {
    color: #cbd5e1;
    font-size: clamp(30px, 5.4vw, 62px) !important;
    font-weight: 600;
    letter-spacing: 0.16em;
    text-shadow: 0 0 30px rgba(203, 213, 225, 0.16);
  }

  h1 strong {
    font-size: clamp(48px, 9vw, 104px) !important;
    font-weight: 900;
    letter-spacing: 0.1em;
    background: linear-gradient(90deg, #38bdf8, #818cf8 48%, #c084fc);
    -webkit-background-clip: text;
    background-clip: text;
    color: transparent;
    filter:
      drop-shadow(0 0 18px rgba(56, 189, 248, 0.65))
      drop-shadow(0 0 42px rgba(168, 85, 247, 0.45));
  }

  .subtitle {
    margin: 14px 0 0;
    color: #64748b;
    font-size: 15px !important;
    letter-spacing: 0.16em;
  }

  .core-zone {
    display: grid;
    grid-template-columns: 1fr auto 1fr;
    align-items: center;
    gap: 26px;
    margin-top: 4px;
  }

  .side-readout {
    display: grid;
    gap: 6px;
    max-width: 230px;
    padding: 12px 14px;
    border-top: 1px solid rgba(56, 189, 248, 0.24);
    border-bottom: 1px solid rgba(56, 189, 248, 0.1);
    color: rgba(148, 163, 184, 0.66);
    font-family: 'Orbitron', sans-serif;
    font-size: 10px !important;
  }

  .side-readout.right {
    justify-self: end;
    text-align: right;
    border-top-color: rgba(168, 85, 247, 0.32);
  }

  .side-readout b {
    color: #e2e8f0;
    font-size: 13px !important;
    font-weight: 700;
  }

  .core-link {
    position: relative;
    width: 360px;
    min-height: 370px;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 15px;
    text-decoration: none;
    color: #e2e8f0;
    border: 1px solid rgba(56, 189, 248, 0.28);
    background:
      linear-gradient(180deg, rgba(15, 23, 42, 0.82), rgba(5, 10, 26, 0.9)),
      radial-gradient(circle at 50% 42%, rgba(56, 189, 248, 0.13), transparent 44%);
    box-shadow:
      0 0 0 1px rgba(56,189,248,0.06),
      0 0 70px rgba(56,189,248,0.16),
      0 36px 80px rgba(0,0,0,0.55),
      inset 0 1px 0 rgba(255,255,255,0.06);
    overflow: hidden;
    transition: transform 0.25s ease, border-color 0.25s ease, box-shadow 0.25s ease;
  }

  .core-link:hover,
  .core-link:focus-visible {
    transform: translateY(-5px);
    border-color: rgba(56, 189, 248, 0.85);
    box-shadow:
      0 0 0 1px rgba(56,189,248,0.18),
      0 0 95px rgba(56,189,248,0.26),
      0 0 65px rgba(168,85,247,0.16),
      0 42px 90px rgba(0,0,0,0.62),
      inset 0 1px 0 rgba(255,255,255,0.09);
  }

  .corner {
    position: absolute;
    width: 22px;
    height: 22px;
    border-color: #38bdf8;
    border-style: solid;
    opacity: 0.78;
  }

  .tl { top: -1px; left: -1px; border-width: 2px 0 0 2px; }
  .tr { top: -1px; right: -1px; border-width: 2px 2px 0 0; }
  .bl { bottom: -1px; left: -1px; border-width: 0 0 2px 2px; }
  .br { bottom: -1px; right: -1px; border-width: 0 2px 2px 0; }

  .core-scan {
    position: absolute;
    left: 0;
    right: 0;
    top: 0;
    height: 1px;
    background: linear-gradient(90deg, transparent, rgba(56,189,248,0.8), transparent);
    animation: scan-down 3.6s ease-in-out infinite;
  }

  @keyframes scan-down {
    0% { top: 0%; opacity: 0; }
    12%, 80% { opacity: 1; }
    100% { top: 100%; opacity: 0; }
  }

  .core-ready,
  .core-enter {
    font-family: 'Orbitron', sans-serif;
    font-size: 11px !important;
    color: #67e8f9;
    letter-spacing: 0.18em;
  }
  .core-link[href="/lab"] { display: none; }
  .primary-memory-link { grid-column: 2; display: grid; place-items: center; gap: 12px; text-align: center; }

  .core-enter {
    color: rgba(192, 132, 252, 0.9);
  }

  .core-graphic {
    position: relative;
    width: 150px;
    height: 150px;
    display: grid;
    place-items: center;
  }

  .ring {
    position: absolute;
    border-radius: 50%;
    border-style: solid;
  }

  .ring-outer {
    width: 150px;
    height: 150px;
    border-width: 1px;
    border-color: rgba(56, 189, 248, 0.18);
    border-top-color: rgba(56, 189, 248, 0.86);
    animation: spin 18s linear infinite;
  }

  .ring-mid {
    width: 108px;
    height: 108px;
    border-width: 1px;
    border-color: rgba(168, 85, 247, 0.18);
    border-right-color: rgba(168, 85, 247, 0.82);
    animation: spin-reverse 10s linear infinite;
  }

  .ring-inner {
    width: 70px;
    height: 70px;
    border-width: 2px;
    border-color: rgba(56, 189, 248, 0.16);
    border-bottom-color: #38bdf8;
    animation: spin 5s linear infinite;
  }

  .core-dot {
    width: 28px;
    height: 28px;
    border-radius: 50%;
    background: radial-gradient(circle, #fff 0 16%, #7dd3fc 17% 40%, rgba(56,189,248,0.18) 65%, transparent 100%);
    box-shadow: 0 0 20px #38bdf8, 0 0 60px rgba(56,189,248,0.55);
    animation: core-pulse 2.7s ease-in-out infinite;
  }

  @keyframes spin { to { transform: rotate(360deg); } }
  @keyframes spin-reverse { to { transform: rotate(-360deg); } }
  @keyframes core-pulse {
    0%, 100% { transform: scale(1); }
    50% { transform: scale(1.16); }
  }

  .core-title {
    font-family: 'Orbitron', sans-serif;
    font-size: 28px !important;
    font-weight: 800;
    color: #f8fafc;
    text-shadow: 0 0 24px rgba(56, 189, 248, 0.58);
  }

  .core-description {
    color: #94a3b8;
    font-size: 16px !important;
  }

  .module-section {
    display: grid;
    gap: 18px;
  }

  .section-title {
    display: grid;
    grid-template-columns: 1fr auto 1fr;
    align-items: center;
    gap: 18px;
  }

  .section-title span {
    height: 1px;
    background: linear-gradient(90deg, transparent, rgba(56, 189, 248, 0.45));
  }

  .section-title span:last-child {
    background: linear-gradient(90deg, rgba(168, 85, 247, 0.45), transparent);
  }

  .section-title h2 {
    margin: 0;
    color: rgba(203, 213, 225, 0.66);
    font-family: 'Orbitron', sans-serif;
    font-size: 12px !important;
    letter-spacing: 0.24em;
  }

  .module-grid {
    display: grid;
    grid-template-columns: repeat(4, minmax(0, 1fr));
    gap: 14px;
  }

  .module-card {
    position: relative;
    min-height: 178px;
    padding: 18px;
    display: flex;
    flex-direction: column;
    justify-content: space-between;
    text-decoration: none;
    overflow: hidden;
    border: 1px solid rgba(56, 189, 248, 0.18);
    background: rgba(8, 15, 32, 0.76);
    color: #e2e8f0;
    transition: transform 0.22s ease, border-color 0.22s ease, background 0.22s ease;
  }

  .module-card::before {
    content: '';
    position: absolute;
    inset: 0;
    opacity: 0;
    background: radial-gradient(circle at 20% 100%, rgba(56,189,248,0.13), transparent 58%);
    transition: opacity 0.22s ease;
  }

  .module-card.purple {
    border-color: rgba(168, 85, 247, 0.2);
  }

  .module-card.purple::before {
    background: radial-gradient(circle at 20% 100%, rgba(168,85,247,0.15), transparent 58%);
  }

  .module-card:hover,
  .module-card:focus-visible {
    transform: translateY(-4px);
    background: rgba(12, 22, 45, 0.86);
    border-color: rgba(56, 189, 248, 0.7);
  }

  .module-card.purple:hover,
  .module-card.purple:focus-visible {
    border-color: rgba(168, 85, 247, 0.72);
  }

  .module-card:hover::before,
  .module-card:focus-visible::before {
    opacity: 1;
  }

  .module-topline,
  .module-footer {
    position: relative;
    z-index: 1;
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 10px;
    font-family: 'Orbitron', sans-serif;
    font-size: 10px !important;
    color: rgba(148, 163, 184, 0.66);
  }

  .module-card h3 {
    position: relative;
    z-index: 1;
    margin: 16px 0 8px;
    color: #f8fafc;
    font-family: 'Orbitron', sans-serif;
    font-size: 19px !important;
    font-weight: 800;
  }

  .module-card.cyan h3 {
    text-shadow: 0 0 20px rgba(56, 189, 248, 0.38);
  }

  .module-card.purple h3 {
    text-shadow: 0 0 20px rgba(168, 85, 247, 0.42);
  }

  .module-card p {
    position: relative;
    z-index: 1;
    margin: 0;
    min-height: 48px;
    color: #94a3b8;
    font-size: 14px !important;
    line-height: 1.55;
  }

  .module-footer {
    margin-top: 18px;
    color: #67e8f9;
  }

  .module-card.purple .module-footer {
    color: #c084fc;
  }

  .terminal-footer {
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 12px;
    color: rgba(100, 116, 139, 0.58);
    font-family: 'Orbitron', sans-serif;
    font-size: 10px !important;
    letter-spacing: 0.14em;
  }

  .divider {
    width: 4px;
    height: 4px;
    transform: rotate(45deg);
    background: rgba(56, 189, 248, 0.5);
  }

  @media (max-width: 920px) {
    .terminal {
      width: min(720px, calc(100vw - 28px));
      padding-top: 26px;
    }

    .status-row {
      grid-template-columns: 1fr;
      justify-items: center;
    }

    .core-zone {
      grid-template-columns: 1fr;
      justify-items: center;
    }

    .side-readout {
      display: none;
    }

    .module-grid {
      grid-template-columns: repeat(2, minmax(0, 1fr));
    }
  }

  @media (max-width: 560px) {
    .terminal {
      width: min(100% - 20px, 420px);
      gap: 22px;
    }

    h1 span {
      font-size: clamp(24px, 10vw, 34px) !important;
      letter-spacing: 0.08em;
    }

    h1 strong {
      font-size: clamp(42px, 17vw, 60px) !important;
      letter-spacing: 0.04em;
    }

    .core-link {
      width: 100%;
      min-height: 330px;
    }

    .module-grid {
      grid-template-columns: 1fr;
    }

    .terminal-footer {
      flex-wrap: wrap;
      line-height: 1.6;
    }
  }
</style>
