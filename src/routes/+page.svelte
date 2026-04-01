<script lang="ts">
  let hoveredCard = $state<string | null>(null);
</script>

<svelte:head>
  <link rel="preconnect" href="https://fonts.googleapis.com" />
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin="anonymous" />
  <link
    href="https://fonts.googleapis.com/css2?family=Orbitron:wght@400;600;700;800;900&family=Rajdhani:wght@300;400;500;600;700&display=swap"
    rel="stylesheet"
  />
</svelte:head>

<div class="root">
  <!-- Grid background -->
  <div class="grid-bg" aria-hidden="true"></div>

  <!-- Scanline overlay -->
  <div class="scanlines" aria-hidden="true"></div>

  <!-- Ambient orbs -->
  <div class="orb orb-blue" aria-hidden="true"></div>
  <div class="orb orb-purple" aria-hidden="true"></div>

  <main class="content">
    <!-- ── Top Section ── -->
    <header class="top-section">
      <p class="system-status">
        <span class="status-dot"></span>
        SYSTEM ONLINE | v2.0.0
      </p>

      <h1 class="main-title">
        <span class="title-line title-top">AI EXPERIMENT</span>
        <span class="title-line title-bottom">TERMINAL</span>
      </h1>

      <div class="title-divider" aria-hidden="true">
        <span class="divider-line"></span>
        <span class="divider-diamond"></span>
        <span class="divider-line"></span>
      </div>

      <p class="subtitle-jp">マルチエージェント会話実験システム</p>
    </header>

    <!-- ── Center Panel ── -->
    <section class="center-panel">
      <div class="core-card">
        <div class="card-corner card-corner--tl"></div>
        <div class="card-corner card-corner--tr"></div>
        <div class="card-corner card-corner--bl"></div>
        <div class="card-corner card-corner--br"></div>

        <!-- Top edge scan line -->
        <div class="card-scan" aria-hidden="true"></div>

        <p class="sys-ready">
          <span class="sys-ready-bracket">[</span>
          SYS READY
          <span class="sys-ready-bracket">]</span>
        </p>

        <div class="core-ring-wrap">
          <!-- Outer decorative arc -->
          <div class="ring-arc ring-arc--left" aria-hidden="true"></div>
          <div class="ring-arc ring-arc--right" aria-hidden="true"></div>

          <div class="core-ring ring-outer"></div>
          <div class="core-ring ring-mid"></div>
          <div class="core-ring ring-inner"></div>
          <div class="core-dot">
            <div class="core-dot-inner"></div>
          </div>
        </div>

        <p class="slot-label">CHARACTER SLOT — ACTIVE</p>
      </div>
    </section>

    <!-- ── Bottom Section ── -->
    <section class="bottom-section">
      <h2 class="select-mode-label">
        <span class="select-mode-line"></span>
        SELECT MODE
        <span class="select-mode-line"></span>
      </h2>

      <div class="mode-cards">
        <!-- DUO CHAT -->
        <a
          href="/chat"
          class="mode-card mode-card--cyan"
          class:hovered={hoveredCard === 'duo'}
          onmouseenter={() => (hoveredCard = 'duo')}
          onmouseleave={() => (hoveredCard = null)}
        >
          <div class="mode-card-inner">
            <div class="mode-tag tag-cyan">2 AGENTS</div>
            <h3 class="mode-title">DUO CHAT</h3>
            <p class="mode-sub">2人のAIが対話する</p>
            <div class="mode-arrow">
              <span class="arrow-text">ENTER</span>
              <span class="arrow-icon">→</span>
            </div>
          </div>
          <div class="card-glow glow-cyan"></div>
          <div class="card-shimmer"></div>
        </a>

        <!-- TRIO DISCUSSION -->
        <a
          href="/discussion"
          class="mode-card mode-card--purple"
          class:hovered={hoveredCard === 'trio'}
          onmouseenter={() => (hoveredCard = 'trio')}
          onmouseleave={() => (hoveredCard = null)}
        >
          <div class="mode-card-inner">
            <div class="mode-tag tag-purple">3 AGENTS</div>
            <h3 class="mode-title">TRIO<br/>DISCUSSION</h3>
            <p class="mode-sub">3人のAIがディスカッション</p>
            <div class="mode-arrow">
              <span class="arrow-text">ENTER</span>
              <span class="arrow-icon">→</span>
            </div>
          </div>
          <div class="card-glow glow-purple"></div>
          <div class="card-shimmer"></div>
        </a>
      </div>
    </section>

    <!-- Footer -->
    <footer class="page-footer">
      <span class="footer-text">NEURAL LINK ESTABLISHED</span>
      <span class="footer-sep">·</span>
      <span class="footer-text">AI CORE ACTIVE</span>
    </footer>
  </main>
</div>

<style>
  /* ── Fonts ── */
  :global(body) {
    background: #030712;
    color: #e2e8f0;
    font-family: 'Rajdhani', 'Courier New', sans-serif;
    overflow-x: hidden;
  }
  :global(*, *::before, *::after) { box-sizing: border-box; margin: 0; padding: 0; }

  /* ── Root ── */
  .root {
    position: relative;
    min-height: 100vh;
    display: flex;
    align-items: center;
    justify-content: center;
    overflow: hidden;
  }

  /* ── Grid background ── */
  .grid-bg {
    position: fixed;
    inset: 0;
    background-image:
      linear-gradient(rgba(56, 189, 248, 0.045) 1px, transparent 1px),
      linear-gradient(90deg, rgba(56, 189, 248, 0.045) 1px, transparent 1px);
    background-size: 56px 56px;
    pointer-events: none;
    z-index: 0;
  }

  /* ── Scanlines ── */
  .scanlines {
    position: fixed;
    inset: 0;
    background: repeating-linear-gradient(
      0deg,
      transparent,
      transparent 2px,
      rgba(0, 0, 0, 0.04) 2px,
      rgba(0, 0, 0, 0.04) 4px
    );
    pointer-events: none;
    z-index: 0;
  }

  /* ── Ambient orbs ── */
  .orb {
    position: fixed;
    border-radius: 50%;
    filter: blur(130px);
    pointer-events: none;
    z-index: 0;
  }
  .orb-blue {
    width: 650px; height: 650px;
    top: -220px; left: -220px;
    background: radial-gradient(circle, rgba(56, 189, 248, 0.13) 0%, transparent 70%);
    animation: orb-drift-a 15s ease-in-out infinite alternate;
  }
  .orb-purple {
    width: 550px; height: 550px;
    bottom: -180px; right: -180px;
    background: radial-gradient(circle, rgba(168, 85, 247, 0.16) 0%, transparent 70%);
    animation: orb-drift-b 18s ease-in-out infinite alternate;
  }
  @keyframes orb-drift-a {
    from { transform: translate(0, 0) scale(1); }
    to   { transform: translate(70px, 90px) scale(1.08); }
  }
  @keyframes orb-drift-b {
    from { transform: translate(0, 0) scale(1); }
    to   { transform: translate(-70px, -70px) scale(1.06); }
  }

  /* ── Main content ── */
  .content {
    position: relative;
    z-index: 1;
    width: 100%;
    max-width: 820px;
    padding: 3.5rem 1.5rem 2.5rem;
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 3rem;
  }

  /* ── Top Section ── */
  .top-section {
    text-align: center;
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 1rem;
  }

  .system-status {
    display: flex;
    align-items: center;
    gap: 0.55rem;
    font-family: 'Rajdhani', monospace;
    font-size: 0.7rem;
    font-weight: 600;
    letter-spacing: 0.22em;
    color: #38bdf8;
    text-transform: uppercase;
  }
  .status-dot {
    width: 6px; height: 6px;
    border-radius: 50%;
    background: #38bdf8;
    box-shadow: 0 0 8px #38bdf8, 0 0 18px rgba(56, 189, 248, 0.7);
    animation: blink 2.2s ease-in-out infinite;
    flex-shrink: 0;
  }
  @keyframes blink {
    0%, 100% { opacity: 1; box-shadow: 0 0 8px #38bdf8, 0 0 18px rgba(56,189,248,0.7); }
    50%       { opacity: 0.25; box-shadow: 0 0 4px #38bdf8; }
  }

  /* Main title */
  .main-title {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 0.05em;
    font-family: 'Orbitron', sans-serif;
    line-height: 1.0;
  }
  .title-line {
    display: block;
    font-weight: 800;
    letter-spacing: 0.18em;
    text-transform: uppercase;
  }
  .title-top {
    font-size: clamp(1.8rem, 7vw, 3.4rem);
    font-weight: 600;
    color: #cbd5e1;
    text-shadow:
      0 0 30px rgba(203, 213, 225, 0.2),
      0 2px 4px rgba(0,0,0,0.5);
    letter-spacing: 0.22em;
  }
  .title-bottom {
    font-size: clamp(2.6rem, 10vw, 5rem);
    font-weight: 900;
    letter-spacing: 0.15em;
    /* Gradient: cyan → purple */
    background: linear-gradient(
      90deg,
      #38bdf8 0%,
      #818cf8 45%,
      #a855f7 100%
    );
    -webkit-background-clip: text;
    -webkit-text-fill-color: transparent;
    background-clip: text;
    /* Glow via filter */
    filter:
      drop-shadow(0 0 18px rgba(56, 189, 248, 0.65))
      drop-shadow(0 0 40px rgba(168, 85, 247, 0.35));
    animation: title-glow-pulse 3.5s ease-in-out infinite alternate;
  }
  @keyframes title-glow-pulse {
    from {
      filter:
        drop-shadow(0 0 16px rgba(56, 189, 248, 0.55))
        drop-shadow(0 0 36px rgba(168, 85, 247, 0.3));
    }
    to {
      filter:
        drop-shadow(0 0 26px rgba(56, 189, 248, 0.85))
        drop-shadow(0 0 60px rgba(168, 85, 247, 0.55));
    }
  }

  /* Divider */
  .title-divider {
    display: flex;
    align-items: center;
    gap: 0.75rem;
    width: 280px;
    margin-top: 0.25rem;
  }
  .divider-line {
    flex: 1;
    height: 1px;
    background: linear-gradient(90deg, transparent, rgba(56, 189, 248, 0.4), transparent);
  }
  .divider-diamond {
    width: 5px; height: 5px;
    background: #38bdf8;
    transform: rotate(45deg);
    box-shadow: 0 0 8px #38bdf8;
    flex-shrink: 0;
  }

  .subtitle-jp {
    font-family: 'Rajdhani', sans-serif;
    font-size: 0.85rem;
    font-weight: 500;
    letter-spacing: 0.25em;
    color: #475569;
    margin-top: 0.1rem;
  }

  /* ── Center Panel ── */
  .center-panel {
    width: 100%;
    display: flex;
    justify-content: center;
  }

  .core-card {
    position: relative;
    width: 290px;
    padding: 2rem 2rem 2.25rem;
    background: rgba(10, 17, 38, 0.82);
    border: 1px solid rgba(56, 189, 248, 0.22);
    border-radius: 16px;
    backdrop-filter: blur(24px);
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 1.25rem;
    box-shadow:
      0 0 0 1px rgba(56,189,248,0.06),
      0 0 50px rgba(56,189,248,0.09),
      0 32px 64px rgba(0,0,0,0.5),
      inset 0 1px 0 rgba(255,255,255,0.06);
    animation: card-pulse 4.5s ease-in-out infinite;
    overflow: hidden;
  }
  @keyframes card-pulse {
    0%, 100% {
      box-shadow:
        0 0 0 1px rgba(56,189,248,0.06),
        0 0 50px rgba(56,189,248,0.09),
        0 32px 64px rgba(0,0,0,0.5),
        inset 0 1px 0 rgba(255,255,255,0.06);
    }
    50% {
      box-shadow:
        0 0 0 1px rgba(56,189,248,0.12),
        0 0 80px rgba(56,189,248,0.2),
        0 32px 64px rgba(0,0,0,0.5),
        inset 0 1px 0 rgba(255,255,255,0.08);
    }
  }

  /* Scan line sweep */
  .card-scan {
    position: absolute;
    top: 0; left: 0; right: 0;
    height: 1px;
    background: linear-gradient(90deg, transparent, rgba(56,189,248,0.8), transparent);
    animation: scan-sweep 3.5s ease-in-out infinite;
  }
  @keyframes scan-sweep {
    0%   { top: 0%; opacity: 0; }
    10%  { opacity: 1; }
    90%  { opacity: 1; }
    100% { top: 100%; opacity: 0; }
  }

  /* Corner brackets */
  .card-corner {
    position: absolute;
    width: 16px; height: 16px;
    border-color: #38bdf8;
    border-style: solid;
    opacity: 0.75;
    z-index: 2;
  }
  .card-corner--tl { top: -1px; left: -1px;  border-width: 2px 0 0 2px; border-radius: 4px 0 0 0; }
  .card-corner--tr { top: -1px; right: -1px;  border-width: 2px 2px 0 0; border-radius: 0 4px 0 0; }
  .card-corner--bl { bottom: -1px; left: -1px;  border-width: 0 0 2px 2px; border-radius: 0 0 0 4px; }
  .card-corner--br { bottom: -1px; right: -1px;  border-width: 0 2px 2px 0; border-radius: 0 0 4px 0; }

  .sys-ready {
    font-family: 'Rajdhani', monospace;
    font-size: 0.65rem;
    font-weight: 700;
    letter-spacing: 0.28em;
    color: #38bdf8;
    text-shadow: 0 0 12px rgba(56, 189, 248, 0.8);
  }
  .sys-ready-bracket {
    opacity: 0.5;
  }

  /* Core rings */
  .core-ring-wrap {
    position: relative;
    width: 120px; height: 120px;
    display: flex;
    align-items: center;
    justify-content: center;
  }

  /* Side arc decorations */
  .ring-arc {
    position: absolute;
    width: 8px; height: 36px;
    top: 50%; transform: translateY(-50%);
    opacity: 0.35;
  }
  .ring-arc--left  { left: -18px; border-left: 1px solid #38bdf8; border-top: 1px solid #38bdf8; border-bottom: 1px solid #38bdf8; border-radius: 4px 0 0 4px; }
  .ring-arc--right { right: -18px; border-right: 1px solid #38bdf8; border-top: 1px solid #38bdf8; border-bottom: 1px solid #38bdf8; border-radius: 0 4px 4px 0; }

  .core-ring {
    position: absolute;
    border-radius: 50%;
    border-style: solid;
  }
  .ring-outer {
    width: 120px; height: 120px;
    border-width: 1px;
    border-color: rgba(56, 189, 248, 0.2);
    border-top-color: rgba(56, 189, 248, 0.6);
    animation: spin-cw 20s linear infinite;
  }
  .ring-mid {
    width: 88px; height: 88px;
    border-width: 1px;
    border-color: rgba(168, 85, 247, 0.2);
    border-top-color: rgba(168, 85, 247, 0.85);
    border-right-color: rgba(168, 85, 247, 0.4);
    animation: spin-ccw 11s linear infinite;
  }
  .ring-inner {
    width: 58px; height: 58px;
    border-width: 1.5px;
    border-color: rgba(56, 189, 248, 0.15);
    border-top-color: rgba(56, 189, 248, 1);
    animation: spin-cw 6s linear infinite;
  }
  .core-dot {
    width: 22px; height: 22px;
    border-radius: 50%;
    background: radial-gradient(circle, #7dd3fc 0%, #38bdf8 30%, rgba(56,189,248,0.2) 70%, transparent 100%);
    box-shadow:
      0 0 12px #38bdf8,
      0 0 28px rgba(56, 189, 248, 0.6),
      0 0 50px rgba(56, 189, 248, 0.25);
    display: flex;
    align-items: center;
    justify-content: center;
    animation: dot-pulse 2.8s ease-in-out infinite;
  }
  .core-dot-inner {
    width: 6px; height: 6px;
    border-radius: 50%;
    background: #fff;
    box-shadow: 0 0 6px #fff;
  }
  @keyframes spin-cw  { to { transform: rotate(360deg); } }
  @keyframes spin-ccw { to { transform: rotate(-360deg); } }
  @keyframes dot-pulse {
    0%, 100% {
      box-shadow: 0 0 12px #38bdf8, 0 0 28px rgba(56,189,248,0.6), 0 0 50px rgba(56,189,248,0.25);
    }
    50% {
      box-shadow: 0 0 20px #38bdf8, 0 0 50px rgba(56,189,248,0.9), 0 0 80px rgba(56,189,248,0.4);
    }
  }

  .slot-label {
    font-family: 'Rajdhani', monospace;
    font-size: 0.6rem;
    font-weight: 600;
    letter-spacing: 0.32em;
    color: #334155;
    text-transform: uppercase;
  }

  /* ── Bottom Section ── */
  .bottom-section {
    width: 100%;
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 1.5rem;
  }

  .select-mode-label {
    display: flex;
    align-items: center;
    gap: 1rem;
    font-family: 'Rajdhani', sans-serif;
    font-size: 0.7rem;
    font-weight: 700;
    letter-spacing: 0.32em;
    color: #475569;
    text-transform: uppercase;
  }
  .select-mode-line {
    display: block;
    width: 40px;
    height: 1px;
    background: linear-gradient(90deg, transparent, rgba(71, 85, 105, 0.6));
  }
  .select-mode-line:first-child {
    background: linear-gradient(270deg, transparent, rgba(71, 85, 105, 0.6));
  }

  .mode-cards {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 1.25rem;
    width: 100%;
  }

  .mode-card {
    position: relative;
    display: block;
    text-decoration: none;
    border-radius: 14px;
    overflow: hidden;
    background: rgba(10, 17, 38, 0.8);
    border: 1px solid transparent;
    transition: transform 0.28s cubic-bezier(0.34, 1.56, 0.64, 1), border-color 0.25s ease, box-shadow 0.25s ease;
    cursor: pointer;
  }
  .mode-card:hover,
  .mode-card.hovered {
    transform: translateY(-6px) scale(1.015);
  }
  .mode-card--cyan {
    border-color: rgba(56, 189, 248, 0.22);
    box-shadow: 0 4px 24px rgba(56,189,248,0.04), 0 16px 32px rgba(0,0,0,0.3);
  }
  .mode-card--cyan:hover,
  .mode-card--cyan.hovered {
    border-color: rgba(56, 189, 248, 0.75);
    box-shadow:
      0 0 0 1px rgba(56,189,248,0.15),
      0 0 28px rgba(56,189,248,0.22),
      0 20px 48px rgba(0,0,0,0.4);
  }
  .mode-card--purple {
    border-color: rgba(168, 85, 247, 0.22);
    box-shadow: 0 4px 24px rgba(168,85,247,0.04), 0 16px 32px rgba(0,0,0,0.3);
  }
  .mode-card--purple:hover,
  .mode-card--purple.hovered {
    border-color: rgba(168, 85, 247, 0.75);
    box-shadow:
      0 0 0 1px rgba(168,85,247,0.15),
      0 0 28px rgba(168,85,247,0.24),
      0 20px 48px rgba(0,0,0,0.4);
  }

  .mode-card-inner {
    position: relative;
    z-index: 1;
    padding: 1.6rem 1.4rem;
    display: flex;
    flex-direction: column;
    gap: 0.6rem;
  }

  .mode-tag {
    display: inline-block;
    font-family: 'Orbitron', monospace;
    font-size: 0.5rem;
    font-weight: 700;
    letter-spacing: 0.2em;
    padding: 0.22rem 0.55rem;
    border-radius: 3px;
    width: fit-content;
    text-transform: uppercase;
  }
  .tag-cyan {
    color: #38bdf8;
    background: rgba(56,189,248,0.08);
    border: 1px solid rgba(56,189,248,0.3);
    text-shadow: 0 0 8px rgba(56,189,248,0.6);
  }
  .tag-purple {
    color: #c084fc;
    background: rgba(168,85,247,0.08);
    border: 1px solid rgba(168,85,247,0.3);
    text-shadow: 0 0 8px rgba(168,85,247,0.6);
  }

  .mode-title {
    font-family: 'Orbitron', sans-serif;
    font-size: 1.05rem;
    font-weight: 800;
    letter-spacing: 0.1em;
    color: #f1f5f9;
    line-height: 1.15;
  }
  .mode-card--cyan .mode-title {
    text-shadow: 0 0 22px rgba(56,189,248,0.45), 0 0 50px rgba(56,189,248,0.15);
  }
  .mode-card--purple .mode-title {
    text-shadow: 0 0 22px rgba(168,85,247,0.45), 0 0 50px rgba(168,85,247,0.15);
  }
  .mode-card--cyan:hover .mode-title {
    text-shadow: 0 0 28px rgba(56,189,248,0.7), 0 0 60px rgba(56,189,248,0.3);
  }
  .mode-card--purple:hover .mode-title {
    text-shadow: 0 0 28px rgba(168,85,247,0.7), 0 0 60px rgba(168,85,247,0.3);
  }

  .mode-sub {
    font-family: 'Rajdhani', sans-serif;
    font-size: 0.8rem;
    font-weight: 500;
    color: #4b5563;
    letter-spacing: 0.05em;
    line-height: 1.4;
    transition: color 0.25s;
  }
  .mode-card:hover .mode-sub { color: #94a3b8; }

  .mode-arrow {
    display: flex;
    align-items: center;
    gap: 0.4rem;
    margin-top: 0.35rem;
  }
  .arrow-text {
    font-family: 'Rajdhani', monospace;
    font-size: 0.6rem;
    font-weight: 700;
    letter-spacing: 0.2em;
    color: #1e293b;
    transition: color 0.25s;
  }
  .arrow-icon {
    font-size: 0.9rem;
    color: #1e293b;
    transition: color 0.25s, transform 0.3s cubic-bezier(0.34, 1.56, 0.64, 1);
    display: inline-block;
  }
  .mode-card--cyan:hover .arrow-text  { color: #38bdf8; }
  .mode-card--cyan:hover .arrow-icon  { color: #38bdf8; transform: translateX(5px); }
  .mode-card--purple:hover .arrow-text { color: #c084fc; }
  .mode-card--purple:hover .arrow-icon { color: #c084fc; transform: translateX(5px); }

  /* Glow layer */
  .card-glow {
    position: absolute;
    inset: 0;
    border-radius: 14px;
    opacity: 0;
    transition: opacity 0.35s ease;
    pointer-events: none;
  }
  .glow-cyan   { background: radial-gradient(ellipse at 50% 110%, rgba(56,189,248,0.14) 0%, transparent 65%); }
  .glow-purple { background: radial-gradient(ellipse at 50% 110%, rgba(168,85,247,0.16) 0%, transparent 65%); }
  .mode-card:hover .card-glow { opacity: 1; }

  /* Shimmer on hover */
  .card-shimmer {
    position: absolute;
    top: 0; left: -100%;
    width: 60%;
    height: 100%;
    background: linear-gradient(
      105deg,
      transparent 20%,
      rgba(255,255,255,0.03) 50%,
      transparent 80%
    );
    transition: left 0s;
    pointer-events: none;
    z-index: 2;
  }
  .mode-card:hover .card-shimmer {
    left: 150%;
    transition: left 0.5s ease;
  }

  /* ── Footer ── */
  .page-footer {
    display: flex;
    align-items: center;
    gap: 0.75rem;
    opacity: 0.3;
  }
  .footer-text {
    font-family: 'Rajdhani', monospace;
    font-size: 0.6rem;
    font-weight: 600;
    letter-spacing: 0.2em;
    color: #64748b;
    text-transform: uppercase;
  }
  .footer-sep {
    color: #1e293b;
    font-size: 0.7rem;
  }

  /* ── Responsive ── */
  @media (max-width: 540px) {
    .mode-cards {
      grid-template-columns: 1fr;
    }
    .title-top  { letter-spacing: 0.12em; }
    .title-bottom { letter-spacing: 0.08em; }
    .core-card { width: 250px; }
    .core-ring-wrap { width: 100px; height: 100px; }
    .ring-outer { width: 100px; height: 100px; }
    .ring-mid   { width: 74px; height: 74px; }
    .ring-inner { width: 50px; height: 50px; }
  }
</style>
