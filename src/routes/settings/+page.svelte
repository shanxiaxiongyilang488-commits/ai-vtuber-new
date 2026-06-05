<svelte:head>
  <link rel="preconnect" href="https://fonts.googleapis.com" />
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin="anonymous" />
  <link
    href="https://fonts.googleapis.com/css2?family=Orbitron:wght@400;600;700;800;900&family=Rajdhani:wght@300;400;500;600;700&display=swap"
    rel="stylesheet"
  />
</svelte:head>

<div class="settings-shell">
  <div class="grid-bg" aria-hidden="true"></div>
  <div class="scanlines" aria-hidden="true"></div>

  <main class="settings-page">
    <header class="settings-header">
      <a href="/" class="back-link">BACK TO TERMINAL</a>
      <div class="status"><span></span>SYSTEM CONFIG SECTION</div>
    </header>

    <section class="hero">
      <div>
        <p class="eyebrow">RESEARCH FACILITY CONTROL</p>
        <h1>SETTINGS</h1>
        <p class="lead">API, model, and local connection configuration terminal</p>
      </div>
    </section>

    <section class="panel-grid">
      <a href="/settings/api" class="panel">
        <div class="panel-header">
          <span>CONFIG MODULE</span>
          <b>READY</b>
        </div>
        <h2>API SETTINGS</h2>
        <p>Manage provider keys, model names, and local endpoint settings.</p>
        <span class="open-link">OPEN CONFIG</span>
      </a>

      <div class="panel">
        <div class="panel-header">
          <span>ROUTE STATUS</span>
          <b>ONLINE</b>
        </div>
        <ul>
          <li>/settings</li>
          <li>/settings/api</li>
        </ul>
      </div>
    </section>
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

  .settings-shell {
    position: relative;
    min-height: 100vh;
    overflow: hidden;
    background:
      radial-gradient(circle at 50% -12%, rgba(56, 189, 248, 0.18), transparent 38%),
      radial-gradient(circle at 92% 74%, rgba(168, 85, 247, 0.14), transparent 34%),
      linear-gradient(180deg, #020617 0%, #030712 55%, #050816 100%);
  }

  .grid-bg,
  .scanlines {
    position: fixed;
    inset: 0;
    pointer-events: none;
  }

  .grid-bg {
    z-index: 0;
    background-image:
      linear-gradient(rgba(56, 189, 248, 0.045) 1px, transparent 1px),
      linear-gradient(90deg, rgba(56, 189, 248, 0.045) 1px, transparent 1px),
      linear-gradient(rgba(168, 85, 247, 0.025) 1px, transparent 1px),
      linear-gradient(90deg, rgba(168, 85, 247, 0.025) 1px, transparent 1px);
    background-size: 56px 56px, 56px 56px, 14px 14px, 14px 14px;
  }

  .scanlines {
    z-index: 3;
    opacity: 0.45;
    background: repeating-linear-gradient(0deg, rgba(255,255,255,0.018), rgba(255,255,255,0.018) 1px, transparent 1px, transparent 4px);
  }

  .settings-page {
    position: relative;
    z-index: 2;
    width: min(1120px, calc(100vw - 40px));
    min-height: 100vh;
    margin: 0 auto;
    padding: 34px 0;
    display: grid;
    grid-template-rows: auto auto 1fr;
    gap: 24px;
  }

  .settings-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    gap: 16px;
    font-family: 'Orbitron', sans-serif;
    font-size: 11px !important;
  }

  .back-link {
    color: #67e8f9;
    text-decoration: none;
    border: 1px solid rgba(56, 189, 248, 0.24);
    background: rgba(8, 18, 36, 0.58);
    padding: 10px 14px;
  }

  .status {
    display: inline-flex;
    align-items: center;
    gap: 8px;
    color: rgba(203, 213, 225, 0.66);
  }

  .status span {
    width: 7px;
    height: 7px;
    border-radius: 50%;
    background: #38bdf8;
    box-shadow: 0 0 12px #38bdf8;
  }

  .hero {
    padding: 34px;
    border: 1px solid rgba(56, 189, 248, 0.24);
    background:
      linear-gradient(120deg, rgba(8, 15, 32, 0.82), rgba(12, 12, 34, 0.76)),
      radial-gradient(circle at 82% 50%, rgba(56,189,248,0.14), transparent 38%);
    box-shadow: 0 28px 80px rgba(0,0,0,0.42), inset 0 1px 0 rgba(255,255,255,0.06);
  }

  .eyebrow,
  .panel-header,
  .open-link {
    font-family: 'Orbitron', sans-serif;
  }

  .eyebrow {
    margin: 0 0 10px;
    color: rgba(148, 163, 184, 0.68);
    font-size: 11px !important;
  }

  h1 {
    margin: 0;
    font-family: 'Orbitron', sans-serif;
    font-size: clamp(48px, 9vw, 96px) !important;
    line-height: 0.95;
    color: transparent;
    background: linear-gradient(90deg, #38bdf8, #818cf8 46%, #c084fc);
    -webkit-background-clip: text;
    background-clip: text;
    filter: drop-shadow(0 0 24px rgba(56,189,248,0.5)) drop-shadow(0 0 46px rgba(168,85,247,0.34));
  }

  .lead {
    margin: 12px 0 0;
    color: #cbd5e1;
    font-size: 20px !important;
  }

  .panel-grid {
    display: grid;
    grid-template-columns: minmax(0, 1.25fr) minmax(280px, 0.75fr);
    gap: 18px;
  }

  .panel {
    border: 1px solid rgba(56, 189, 248, 0.2);
    background: rgba(8, 15, 32, 0.72);
    box-shadow: inset 0 1px 0 rgba(255,255,255,0.05);
    padding: 20px;
  }

  a.panel {
    color: inherit;
    text-decoration: none;
  }

  .panel-header {
    display: flex;
    justify-content: space-between;
    gap: 16px;
    color: rgba(148, 163, 184, 0.7);
    font-size: 11px !important;
    margin-bottom: 18px;
  }

  .panel-header b,
  .open-link {
    color: #67e8f9;
  }

  h2 {
    margin: 0 0 8px;
    color: #e9d5ff;
    font-family: 'Orbitron', sans-serif;
    font-size: 30px !important;
  }

  p {
    margin: 0 0 18px;
    color: rgba(203, 213, 225, 0.78);
    font-size: 17px !important;
  }

  .open-link {
    font-size: 11px !important;
  }

  ul {
    list-style: none;
    margin: 0;
    padding: 0;
    display: grid;
    gap: 12px;
  }

  li {
    padding: 12px;
    color: #cbd5e1;
    border: 1px solid rgba(168, 85, 247, 0.18);
    background: rgba(168, 85, 247, 0.045);
  }

  @media (max-width: 840px) {
    .settings-page {
      width: min(100% - 24px, 680px);
    }

    .panel-grid {
      grid-template-columns: 1fr;
    }
  }
</style>
