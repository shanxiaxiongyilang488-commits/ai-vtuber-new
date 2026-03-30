<script lang="ts">
    import { goto } from '$app/navigation';

    function navigateTo(path: string) {
      goto(path);
    }
  </script>

  <div class="terminal-root">
    <!-- スキャンラインオーバーレイ -->
    <div class="scanlines" aria-hidden="true"></div>

    <!-- グリッドバックグラウンド -->
    <div class="grid-bg" aria-hidden="true"></div>

    <!-- コーナーデコレーション -->
    <div class="corner corner-tl" aria-hidden="true"></div>
    <div class="corner corner-tr" aria-hidden="true"></div>
    <div class="corner corner-bl" aria-hidden="true"></div>
    <div class="corner corner-br" aria-hidden="true"></div>

    <!-- メインコンテンツ -->
    <main class="main-content">

      <!-- ヘッダー部 -->
      <header class="header">
        <div class="header-line top-line" aria-hidden="true"></div>
        <div class="status-bar">
          <span class="status-dot pulse" aria-hidden="true"></span>
          <span class="status-text">SYSTEM ONLINE</span>
          <span class="divider" aria-hidden="true">|</span>
          <span class="status-text">v2.0.0</span>
        </div>
        <h1 class="title">
          <span class="title-accent">AI</span>
          <span class="title-main"> EXPERIMENT</span>
          <br />
          <span class="title-sub">TERMINAL</span>
        </h1>
        <p class="subtitle">マルチエージェント会話実験システム</p>
        <div class="header-line bottom-line" aria-hidden="true"></div>
      </header>

      <!-- キャラクター表示エリア -->
      <section class="character-area" aria-label="キャラクター表示エリア">
        <div class="char-frame">
          <div class="char-glow" aria-hidden="true"></div>
          <div class="char-inner">
            <!-- MotionPNG用プレースホルダー -->
            <div class="char-placeholder">
              <div class="char-rings" aria-hidden="true">
                <div class="ring ring-1"></div>
                <div class="ring ring-2"></div>
                <div class="ring ring-3"></div>
              </div>
              <div class="char-icon" aria-hidden="true">
                <svg viewBox="0 0 80 80" fill="none" xmlns="http://www.w3.org/2000/svg">
                  <circle cx="40" cy="28" r="14" stroke="currentColor" stroke-width="1.5" stroke-dasharray="4 2"/>
                  <path d="M18 68c0-12.15 9.85-22 22-22h0c12.15 0 22 9.85 22 22" stroke="currentColor"
  stroke-width="1.5" stroke-linecap="round" stroke-dasharray="4 2"/>
                  <circle cx="40" cy="28" r="6" fill="currentColor" opacity="0.3"/>
                </svg>
              </div>
              <p class="char-label">CHARACTER SLOT</p>
            </div>
          </div>
          <!-- HUDデコ -->
          <div class="hud-top-left" aria-hidden="true">
            <span>SYS</span>
            <span class="hud-val">READY</span>
          </div>
          <div class="hud-top-right" aria-hidden="true">
            <span class="hud-val">◈</span>
            <span>AI CORE</span>
          </div>
          <div class="hud-bottom-left" aria-hidden="true">
            <span>MODE</span>
            <span class="hud-val">──</span>
          </div>
          <div class="hud-bottom-right" aria-hidden="true">
            <span class="hud-val">●</span>
            <span>STANDBY</span>
          </div>
        </div>
      </section>

      <!-- モード選択ボタン -->
      <section class="mode-select" aria-label="モード選択">
        <p class="mode-label">— SELECT MODE —</p>
        <div class="buttons">

          <button
            class="mode-btn duo"
            onclick={() => navigateTo('/duo')}
            aria-label="DUO CHAT モードへ"
          >
            <div class="btn-bg" aria-hidden="true"></div>
            <div class="btn-border-anim" aria-hidden="true"></div>
            <div class="btn-content">
              <span class="btn-icon" aria-hidden="true">◈◈</span>
              <span class="btn-title">DUO CHAT</span>
              <span class="btn-desc">2人のAIが対話する</span>
            </div>
            <div class="btn-tag" aria-hidden="true">2 AGENTS</div>
          </button>

          <button
            class="mode-btn trio"
            onclick={() => navigateTo('/trio')}
            aria-label="TRIO DISCUSSION モードへ"
          >
            <div class="btn-bg" aria-hidden="true"></div>
            <div class="btn-border-anim" aria-hidden="true"></div>
            <div class="btn-content">
              <span class="btn-icon" aria-hidden="true">◈◈◈</span>
              <span class="btn-title">TRIO DISCUSSION</span>
              <span class="btn-desc">3人のAIがディスカッション</span>
            </div>
            <div class="btn-tag" aria-hidden="true">3 AGENTS</div>
          </button>

        </div>
      </section>

    </main>

    <!-- フッター -->
    <footer class="footer">
      <span>AI VTUBER EXPERIMENT LAB</span>
      <span class="divider" aria-hidden="true">◆</span>
      <span>POWERED BY LM STUDIO</span>
    </footer>
  </div>

  <style>
    .terminal-root {
      position: relative;
      min-height: 100vh;
      background: #050810;
      overflow: hidden;
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: space-between;
      font-family: 'Segoe UI', 'Hiragino Sans', 'Noto Sans JP', system-ui, sans-serif;
      color: #c8d8f0;
    }

    .grid-bg {
      position: fixed;
      inset: 0;
      background-image:
        linear-gradient(rgba(99, 102, 241, 0.04) 1px, transparent 1px),
        linear-gradient(90deg, rgba(99, 102, 241, 0.04) 1px, transparent 1px);
      background-size: 40px 40px;
      pointer-events: none;
      z-index: 0;
    }

    .scanlines {
      position: fixed;
      inset: 0;
      background: repeating-linear-gradient(
        0deg,
        transparent,
        transparent 2px,
        rgba(0, 0, 0, 0.08) 2px,
        rgba(0, 0, 0, 0.08) 4px
      );
      pointer-events: none;
      z-index: 1;
    }

    .corner {
      position: fixed;
      width: 40px;
      height: 40px;
      z-index: 2;
    }
    .corner::before,
    .corner::after {
      content: '';
      position: absolute;
      background: #7c3aed;
    }
    .corner::before { width: 100%; height: 2px; }
    .corner::after  { width: 2px;  height: 100%; }

    .corner-tl { top: 16px; left: 16px; }
    .corner-tl::before { top: 0; left: 0; }
    .corner-tl::after  { top: 0; left: 0; }

    .corner-tr { top: 16px; right: 16px; }
    .corner-tr::before { top: 0; right: 0; }
    .corner-tr::after  { top: 0; right: 0; }

    .corner-bl { bottom: 16px; left: 16px; }
    .corner-bl::before { bottom: 0; left: 0; }
    .corner-bl::after  { bottom: 0; left: 0; }

    .corner-br { bottom: 16px; right: 16px; }
    .corner-br::before { bottom: 0; right: 0; }
    .corner-br::after  { bottom: 0; right: 0; }

    .main-content {
      position: relative;
      z-index: 10;
      display: flex;
      flex-direction: column;
      align-items: center;
      gap: 2rem;
      padding: 2rem 1.5rem;
      width: 100%;
      max-width: 720px;
    }

    .header {
      text-align: center;
      width: 100%;
    }

    .header-line {
      height: 1px;
      background: linear-gradient(
        90deg,
        transparent,
        #7c3aed 20%,
        #6366f1 50%,
        #7c3aed 80%,
        transparent
      );
      margin: 0.5rem auto;
      width: 80%;
    }

    .status-bar {
      display: flex;
      align-items: center;
      justify-content: center;
      gap: 0.5rem;
      font-size: 0.65rem;
      letter-spacing: 0.15em;
      color: #7c3aed;
      margin-bottom: 0.75rem;
      font-family: 'Courier New', monospace;
    }

    .status-dot {
      width: 6px;
      height: 6px;
      border-radius: 50%;
      background: #22d3ee;
      box-shadow: 0 0 6px #22d3ee;
    }

    .status-dot.pulse {
      animation: dot-pulse 2s ease-in-out infinite;
    }

    @keyframes dot-pulse {
      0%, 100% { opacity: 1; box-shadow: 0 0 6px #22d3ee; }
      50%       { opacity: 0.4; box-shadow: 0 0 2px #22d3ee; }
    }

    .status-text {
      font-size: 0.65rem;
      letter-spacing: 0.12em;
      color: #64748b;
    }

    .divider {
      color: #2a2d3e;
      margin: 0 0.25rem;
    }

    .title {
      font-size: clamp(1.8rem, 5vw, 3rem);
      font-weight: 800;
      letter-spacing: 0.08em;
      line-height: 1.15;
      text-transform: uppercase;
      margin-bottom: 0.5rem;
    }

    .title-accent {
      color: #22d3ee;
      text-shadow: 0 0 20px rgba(34, 211, 238, 0.6);
    }

    .title-main {
      color: #e2e8f0;
      text-shadow: 0 0 30px rgba(99, 102, 241, 0.3);
    }

    .title-sub {
      color: #a5b4fc;
      font-size: 0.55em;
      letter-spacing: 0.35em;
      text-shadow: 0 0 20px rgba(165, 180, 252, 0.5);
    }

    .subtitle {
      font-size: 0.75rem;
      color: #475569;
      letter-spacing: 0.1em;
      margin-top: 0.25rem;
    }

    .character-area {
      width: 100%;
      display: flex;
      justify-content: center;
    }

    .char-frame {
      position: relative;
      width: 280px;
      height: 300px;
      border-radius: 24px;
      background: linear-gradient(
        160deg,
        rgba(26, 29, 39, 0.9) 0%,
        rgba(15, 17, 30, 0.95) 100%
      );
      border: 1px solid rgba(124, 58, 237, 0.3);
      box-shadow:
        0 0 0 1px rgba(99, 102, 241, 0.1),
        0 0 40px rgba(124, 58, 237, 0.15),
        0 0 80px rgba(34, 211, 238, 0.05),
        inset 0 1px 0 rgba(255,255,255,0.05);
      overflow: hidden;
      display: flex;
      align-items: center;
      justify-content: center;
    }

    .char-glow {
      position: absolute;
      bottom: -20px;
      left: 50%;
      transform: translateX(-50%);
      width: 200px;
      height: 80px;
      background: radial-gradient(ellipse, rgba(124, 58, 237, 0.3) 0%, transparent 70%);
      pointer-events: none;
      animation: glow-breathe 3s ease-in-out infinite;
    }

    @keyframes glow-breathe {
      0%, 100% { opacity: 0.6; transform: translateX(-50%) scaleX(1); }
      50%       { opacity: 1;   transform: translateX(-50%) scaleX(1.15); }
    }

    .char-inner {
      position: relative;
      z-index: 2;
      display: flex;
      align-items: center;
      justify-content: center;
      width: 100%;
      height: 100%;
    }

    .char-placeholder {
      display: flex;
      flex-direction: column;
      align-items: center;
      gap: 0.5rem;
    }

    .char-rings {
      position: relative;
      width: 80px;
      height: 80px;
      display: flex;
      align-items: center;
      justify-content: center;
    }

    .ring {
      position: absolute;
      border-radius: 50%;
      border: 1px solid;
      animation: ring-spin 8s linear infinite;
    }

    .ring-1 {
      width: 80px; height: 80px;
      border-color: rgba(124, 58, 237, 0.4);
      animation-duration: 8s;
    }
    .ring-2 {
      width: 60px; height: 60px;
      border-color: rgba(99, 102, 241, 0.5);
      animation-duration: 6s;
      animation-direction: reverse;
    }
    .ring-3 {
      width: 40px; height: 40px;
      border-color: rgba(34, 211, 238, 0.4);
      animation-duration: 4s;
    }

    @keyframes ring-spin {
      from { transform: rotate(0deg); }
      to   { transform: rotate(360deg); }
    }

    .char-icon {
      position: absolute;
      color: rgba(165, 180, 252, 0.5);
      width: 40px;
      height: 40px;
    }

    .char-label {
      font-size: 0.6rem;
      letter-spacing: 0.2em;
      color: #334155;
      margin-top: 0.5rem;
      font-family: 'Courier New', monospace;
    }

    .hud-top-left,
    .hud-top-right,
    .hud-bottom-left,
    .hud-bottom-right {
      position: absolute;
      display: flex;
      flex-direction: column;
      font-size: 0.5rem;
      letter-spacing: 0.1em;
      font-family: 'Courier New', monospace;
      color: #334155;
      line-height: 1.3;
      padding: 8px;
      z-index: 3;
    }

    .hud-top-left    { top: 0; left: 0; }
    .hud-top-right   { top: 0; right: 0; align-items: flex-end; }
    .hud-bottom-left { bottom: 0; left: 0; }
    .hud-bottom-right{ bottom: 0; right: 0; align-items: flex-end; }

    .hud-val {
      color: #6366f1;
      font-size: 0.55rem;
    }

    .mode-select {
      width: 100%;
      display: flex;
      flex-direction: column;
      align-items: center;
      gap: 1rem;
    }

    .mode-label {
      font-size: 0.65rem;
      letter-spacing: 0.25em;
      color: #475569;
      font-family: 'Courier New', monospace;
    }

    .buttons {
      display: flex;
      gap: 1rem;
      width: 100%;
      flex-wrap: wrap;
      justify-content: center;
    }

    .mode-btn {
      position: relative;
      flex: 1;
      min-width: 220px;
      max-width: 300px;
      padding: 0;
      border: none;
      border-radius: 16px;
      cursor: pointer;
      background: transparent;
      overflow: hidden;
      transition: transform 0.2s ease;
    }

    .mode-btn:hover { transform: translateY(-3px); }
    .mode-btn:active { transform: translateY(0px) scale(0.98); }

    .btn-bg {
      position: absolute;
      inset: 0;
      border-radius: 16px;
      transition: box-shadow 0.3s ease, border-color 0.3s ease;
    }

    .duo .btn-bg {
      background: linear-gradient(
        135deg,
        rgba(34, 211, 238, 0.08) 0%,
        rgba(99, 102, 241, 0.12) 50%,
        rgba(15, 17, 30, 0.95) 100%
      );
      border: 1px solid rgba(34, 211, 238, 0.25);
      box-shadow: inset 0 1px 0 rgba(34, 211, 238, 0.1), 0 0 20px rgba(34, 211, 238, 0.05);
    }

    .trio .btn-bg {
      background: linear-gradient(
        135deg,
        rgba(124, 58, 237, 0.1) 0%,
        rgba(168, 85, 247, 0.12) 50%,
        rgba(15, 17, 30, 0.95) 100%
      );
      border: 1px solid rgba(124, 58, 237, 0.3);
      box-shadow: inset 0 1px 0 rgba(168, 85, 247, 0.1), 0 0 20px rgba(124, 58, 237, 0.05);
    }

    .duo:hover .btn-bg {
      box-shadow:
        inset 0 1px 0 rgba(34, 211, 238, 0.2),
        0 0 30px rgba(34, 211, 238, 0.2),
        0 0 60px rgba(34, 211, 238, 0.08);
      border-color: rgba(34, 211, 238, 0.6);
    }

    .trio:hover .btn-bg {
      box-shadow:
        inset 0 1px 0 rgba(168, 85, 247, 0.2),
        0 0 30px rgba(124, 58, 237, 0.3),
        0 0 60px rgba(168, 85, 247, 0.1);
      border-color: rgba(168, 85, 247, 0.7);
    }

    .btn-border-anim {
      position: absolute;
      inset: 0;
      border-radius: 16px;
      opacity: 0;
      pointer-events: none;
    }

    .duo:hover .btn-border-anim {
      opacity: 1;
      background: linear-gradient(90deg, transparent, rgba(34, 211, 238, 0.15), transparent);
      animation: btn-sweep 1.5s ease-in-out infinite;
    }

    .trio:hover .btn-border-anim {
      opacity: 1;
      background: linear-gradient(90deg, transparent, rgba(168, 85, 247, 0.2), transparent);
      animation: btn-sweep 1.5s ease-in-out infinite;
    }

    @keyframes btn-sweep {
      from { transform: translateX(-100%); }
      to   { transform: translateX(100%); }
    }

    .btn-content {
      position: relative;
      z-index: 2;
      display: flex;
      flex-direction: column;
      align-items: center;
      gap: 0.25rem;
      padding: 1.5rem 1.25rem 2rem;
    }

    .btn-icon {
      font-size: 1rem;
      letter-spacing: 0.2em;
      transition: text-shadow 0.3s ease;
    }

    .duo .btn-icon  { color: #22d3ee; }
    .trio .btn-icon { color: #a855f7; }

    .duo:hover .btn-icon  { text-shadow: 0 0 12px rgba(34, 211, 238, 0.8); }
    .trio:hover .btn-icon { text-shadow: 0 0 12px rgba(168, 85, 247, 0.8); }

    .btn-title {
      font-size: 1rem;
      font-weight: 700;
      letter-spacing: 0.12em;
      text-transform: uppercase;
      color: #e2e8f0;
      transition: color 0.3s ease;
    }

    .duo:hover .btn-title  { color: #67e8f9; }
    .trio:hover .btn-title { color: #c084fc; }

    .btn-desc {
      font-size: 0.7rem;
      color: #475569;
      letter-spacing: 0.05em;
      transition: color 0.3s ease;
    }

    .duo:hover .btn-desc,
    .trio:hover .btn-desc { color: #94a3b8; }

    .btn-tag {
      position: absolute;
      bottom: 10px;
      right: 12px;
      font-size: 0.5rem;
      letter-spacing: 0.15em;
      font-family: 'Courier New', monospace;
      padding: 2px 6px;
      border-radius: 4px;
      z-index: 3;
    }

    .duo .btn-tag {
      color: #22d3ee;
      background: rgba(34, 211, 238, 0.08);
      border: 1px solid rgba(34, 211, 238, 0.2);
    }

    .trio .btn-tag {
      color: #a855f7;
      background: rgba(168, 85, 247, 0.08);
      border: 1px solid rgba(168, 85, 247, 0.2);
    }

    .mode-btn:focus-visible {
      outline: 2px solid #6366f1;
      outline-offset: 3px;
    }

    .footer {
      position: relative;
      z-index: 10;
      display: flex;
      align-items: center;
      gap: 0.75rem;
      padding: 1rem;
      font-size: 0.55rem;
      letter-spacing: 0.15em;
      color: #1e293b;
      font-family: 'Courier New', monospace;
      text-transform: uppercase;
    }

    @media (max-width: 500px) {
      .main-content { gap: 1.5rem; padding: 1.5rem 1rem; }
      .char-frame { width: 240px; height: 240px; }
      .buttons { flex-direction: column; align-items: center; }
      .mode-btn { width: 100%; max-width: 100%; }
    }
  </style>