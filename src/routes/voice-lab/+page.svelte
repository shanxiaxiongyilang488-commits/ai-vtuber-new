<script lang="ts">
  const roadmap = [
    'Irodori-TTS',
    'Irodori VoiceDesign',
    'VoiceColorMapping',
    '音声ライブラリ',
  ];

  const dummySlots = [
    { label: 'REFERENCE VOICE', value: '未接続', tone: 'cyan' },
    { label: 'EMOTION BUS', value: 'STANDBY', tone: 'purple' },
    { label: 'COLOR MAP', value: 'EMPTY', tone: 'cyan' },
  ];
</script>

<svelte:head>
  <link rel="preconnect" href="https://fonts.googleapis.com" />
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin="anonymous" />
  <link
    href="https://fonts.googleapis.com/css2?family=Orbitron:wght@400;600;700;800;900&family=Rajdhani:wght@300;400;500;600;700&display=swap"
    rel="stylesheet"
  />
</svelte:head>

<div class="voice-shell">
  <div class="grid-bg" aria-hidden="true"></div>
  <div class="scanlines" aria-hidden="true"></div>

  <main class="voice-lab">
    <header class="lab-header">
      <a href="/" class="back-link">← CENTRAL TERMINAL</a>
      <div class="status">
        <span></span>
        LOCAL AUDIO SECTION
      </div>
    </header>

    <section class="hero">
      <div class="hero-copy">
        <p class="eyebrow">RESEARCH MODULE / AUDIO SYNTHESIS</p>
        <h1>VOICE LAB</h1>
        <p class="lead">ローカル音声研究専用ページ</p>
      </div>

      <div class="voice-core" aria-hidden="true">
        <span class="wave wave-a"></span>
        <span class="wave wave-b"></span>
        <span class="wave wave-c"></span>
        <span class="voice-dot"></span>
      </div>
    </section>

    <section class="panel-grid">
      <div class="main-panel">
        <div class="panel-header">
          <span>VOICE ROUTER</span>
          <b>DUMMY UI</b>
        </div>

        <div class="control-stack">
          <label>
            <span>Engine</span>
            <select disabled>
              <option>Irodori-TTS / pending</option>
            </select>
          </label>

          <label>
            <span>Reference Voice</span>
            <input value="voices/sample.wav" disabled />
          </label>

          <label>
            <span>Test Text</span>
            <textarea disabled>ここに音声研究用のテスト文章を入力します。</textarea>
          </label>

          <button disabled>GENERATE WAV</button>
        </div>
      </div>

      <aside class="side-panel">
        <div class="panel-header">
          <span>FUTURE INTEGRATION</span>
          <b>ROADMAP</b>
        </div>

        <ul class="roadmap">
          {#each roadmap as item}
            <li>{item}</li>
          {/each}
        </ul>
      </aside>
    </section>

    <section class="slot-grid" aria-label="Voice lab slots">
      {#each dummySlots as slot}
        <div class:purple={slot.tone === 'purple'} class="slot-card">
          <span>{slot.label}</span>
          <b>{slot.value}</b>
        </div>
      {/each}
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

  .voice-shell {
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

  .voice-lab {
    position: relative;
    z-index: 2;
    width: min(1120px, calc(100vw - 40px));
    min-height: 100vh;
    margin: 0 auto;
    padding: 34px 0;
    display: grid;
    grid-template-rows: auto auto 1fr auto;
    gap: 24px;
  }

  .lab-header {
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

  .back-link:hover {
    border-color: rgba(56, 189, 248, 0.72);
    box-shadow: 0 0 24px rgba(56,189,248,0.14);
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
    display: grid;
    grid-template-columns: minmax(0, 1fr) 320px;
    gap: 28px;
    align-items: center;
    padding: 34px;
    border: 1px solid rgba(56, 189, 248, 0.24);
    background:
      linear-gradient(120deg, rgba(8, 15, 32, 0.82), rgba(12, 12, 34, 0.76)),
      radial-gradient(circle at 82% 50%, rgba(56,189,248,0.14), transparent 38%);
    box-shadow: 0 28px 80px rgba(0,0,0,0.42), inset 0 1px 0 rgba(255,255,255,0.06);
  }

  .eyebrow {
    margin: 0 0 10px;
    color: rgba(148, 163, 184, 0.68);
    font-family: 'Orbitron', sans-serif;
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
    filter: drop-shadow(0 0 24px rgba(56,189,248,0.56)) drop-shadow(0 0 46px rgba(168,85,247,0.36));
  }

  .lead {
    margin: 12px 0 0;
    color: #cbd5e1;
    font-size: 20px !important;
  }

  .voice-core {
    position: relative;
    height: 220px;
    display: grid;
    place-items: center;
  }

  .wave {
    position: absolute;
    border-radius: 50%;
    border: 1px solid rgba(56, 189, 248, 0.32);
  }

  .wave-a {
    width: 210px;
    height: 210px;
    border-top-color: #38bdf8;
    animation: spin 14s linear infinite;
  }

  .wave-b {
    width: 150px;
    height: 150px;
    border-right-color: #c084fc;
    border-color: rgba(168, 85, 247, 0.28);
    animation: spin-reverse 9s linear infinite;
  }

  .wave-c {
    width: 86px;
    height: 86px;
    border-bottom-color: #67e8f9;
    animation: spin 5s linear infinite;
  }

  .voice-dot {
    width: 28px;
    height: 28px;
    border-radius: 50%;
    background: #e0f2fe;
    box-shadow: 0 0 18px #38bdf8, 0 0 56px rgba(56,189,248,0.56);
    animation: pulse 2.4s ease-in-out infinite;
  }

  @keyframes spin { to { transform: rotate(360deg); } }
  @keyframes spin-reverse { to { transform: rotate(-360deg); } }
  @keyframes pulse {
    50% { transform: scale(1.18); box-shadow: 0 0 26px #38bdf8, 0 0 74px rgba(168,85,247,0.44); }
  }

  .panel-grid {
    display: grid;
    grid-template-columns: minmax(0, 1.4fr) minmax(300px, 0.6fr);
    gap: 18px;
  }

  .main-panel,
  .side-panel,
  .slot-card {
    border: 1px solid rgba(56, 189, 248, 0.2);
    background: rgba(8, 15, 32, 0.72);
    box-shadow: inset 0 1px 0 rgba(255,255,255,0.05);
  }

  .main-panel,
  .side-panel {
    padding: 20px;
  }

  .panel-header {
    display: flex;
    justify-content: space-between;
    gap: 16px;
    color: rgba(148, 163, 184, 0.7);
    font-family: 'Orbitron', sans-serif;
    font-size: 11px !important;
    margin-bottom: 18px;
  }

  .panel-header b {
    color: #67e8f9;
  }

  .control-stack {
    display: grid;
    gap: 14px;
  }

  label {
    display: grid;
    gap: 7px;
    color: #94a3b8;
    font-size: 14px !important;
  }

  label span {
    font-family: 'Orbitron', sans-serif;
    font-size: 10px !important;
    color: rgba(203, 213, 225, 0.64);
  }

  input,
  select,
  textarea {
    width: 100%;
    border: 1px solid rgba(56, 189, 248, 0.18);
    background: rgba(2, 6, 23, 0.68);
    color: #cbd5e1;
    padding: 12px 14px;
    font: inherit;
    min-height: 44px;
  }

  textarea {
    min-height: 120px;
    resize: vertical;
  }

  button {
    justify-self: start;
    border: 1px solid rgba(168, 85, 247, 0.36);
    background: rgba(168, 85, 247, 0.08);
    color: #c084fc;
    font-family: 'Orbitron', sans-serif;
    padding: 12px 18px;
  }

  .roadmap {
    list-style: none;
    margin: 0;
    padding: 0;
    display: grid;
    gap: 12px;
  }

  .roadmap li {
    padding: 12px;
    color: #cbd5e1;
    border: 1px solid rgba(168, 85, 247, 0.18);
    background: rgba(168, 85, 247, 0.045);
  }

  .slot-grid {
    display: grid;
    grid-template-columns: repeat(3, 1fr);
    gap: 14px;
  }

  .slot-card {
    padding: 18px;
    display: grid;
    gap: 8px;
  }

  .slot-card.purple {
    border-color: rgba(168, 85, 247, 0.24);
  }

  .slot-card span {
    color: rgba(148, 163, 184, 0.68);
    font-family: 'Orbitron', sans-serif;
    font-size: 10px !important;
  }

  .slot-card b {
    color: #67e8f9;
    font-family: 'Orbitron', sans-serif;
    font-size: 18px !important;
  }

  .slot-card.purple b {
    color: #c084fc;
  }

  @media (max-width: 840px) {
    .voice-lab {
      width: min(100% - 24px, 680px);
    }

    .hero,
    .panel-grid {
      grid-template-columns: 1fr;
    }

    .voice-core {
      height: 180px;
    }

    .slot-grid {
      grid-template-columns: 1fr;
    }
  }

  @media (max-width: 520px) {
    .lab-header {
      align-items: stretch;
      flex-direction: column;
    }

    .hero {
      padding: 24px;
    }
  }
</style>
