<script lang="ts">
  interface Props {
    name: string;
    emoji: string;
    color: string;
    aiEngine: string;
    voiceEngine: string;
    avatar?: string;
    onclick?: () => void;
  }

  let { name, emoji, color, aiEngine, voiceEngine, avatar, onclick }: Props = $props();
</script>

<!-- svelte-ignore a11y_click_events_have_key_events a11y_no_static_element_interactions -->
<div class="card" role="button" tabindex="0"
  style="--accent: {color}; --accent-glow: {color}33"
  {onclick}
  onkeydown={(e) => e.key === 'Enter' && onclick?.()}
>
  <div class="avatar-wrap">
    <div class="avatar-ring"></div>
    <div class="avatar">
      {#if avatar}
        <img class="avatar-img" src={avatar} alt={name} />
      {:else}
        <span class="avatar-emoji">{emoji}</span>
      {/if}
    </div>
  </div>

  <div class="info">
    <h3 class="name">{name}</h3>
    <div class="labels">
      <div class="label">
        <span class="label-key">AI</span>
        <span class="label-val">{aiEngine}</span>
      </div>
      <div class="label">
        <span class="label-key">Voice</span>
        <span class="label-val">{voiceEngine}</span>
      </div>
    </div>
  </div>

  <div class="card-glow" aria-hidden="true"></div>
</div>

<style>
  .card {
    position: relative;
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 10px;
    padding: 16px 12px 14px;
    background: linear-gradient(135deg, rgba(15, 17, 23, 0.9) 0%, rgba(26, 29, 39, 0.8) 100%);
    border: 1px solid var(--accent);
    border-radius: 12px;
    overflow: hidden;
    cursor: pointer;
    transition: border-color 0.3s, box-shadow 0.3s, transform 0.2s;
  }

  .card:hover {
    box-shadow: 0 0 20px var(--accent-glow), inset 0 0 20px var(--accent-glow);
    transform: translateY(-2px);
  }

  .card:active {
    transform: translateY(0) scale(0.97);
  }

  /* Avatar */
  .avatar-wrap {
    position: relative;
    width: 56px;
    height: 56px;
  }

  .avatar-ring {
    position: absolute;
    inset: -4px;
    border-radius: 50%;
    border: 1.5px solid var(--accent);
    opacity: 0.5;
    animation: pulse-ring 3s ease-in-out infinite;
  }

  @keyframes pulse-ring {
    0%, 100% { opacity: 0.3; transform: scale(1); }
    50%       { opacity: 0.7; transform: scale(1.06); }
  }

  .avatar {
    width: 56px;
    height: 56px;
    border-radius: 50%;
    background: radial-gradient(circle at 35% 35%, rgba(255,255,255,0.08) 0%, rgba(0,0,0,0.4) 100%);
    border: 2px solid var(--accent);
    display: flex;
    align-items: center;
    justify-content: center;
    box-shadow: 0 0 12px var(--accent-glow);
  }

  .avatar-emoji {
    font-size: 24px;
    line-height: 1;
  }

  .avatar-img {
    width: 100%;
    height: 100%;
    border-radius: 50%;
    object-fit: cover;
  }

  /* Info */
  .info {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 8px;
    width: 100%;
  }

  .name {
    font-family: 'Orbitron', 'Rajdhani', sans-serif;
    font-size: 15px;
    font-weight: 700;
    color: #e2e8f0;
    letter-spacing: 0.05em;
    text-shadow: 0 0 8px var(--accent);
  }

  .labels {
    display: flex;
    flex-direction: column;
    gap: 4px;
    width: 100%;
  }

  .label {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 6px;
    padding: 3px 8px;
    background: rgba(0, 0, 0, 0.3);
    border-left: 2px solid var(--accent);
    border-radius: 0 4px 4px 0;
  }

  .label-key {
    font-family: 'Rajdhani', sans-serif;
    font-size: 10px;
    font-weight: 600;
    color: var(--accent);
    letter-spacing: 0.1em;
    text-transform: uppercase;
    flex-shrink: 0;
  }

  .label-val {
    font-family: 'Rajdhani', sans-serif;
    font-size: 11px;
    color: #94a3b8;
    text-align: right;
  }

  /* Background glow */
  .card-glow {
    position: absolute;
    inset: 0;
    background: radial-gradient(ellipse at 50% 0%, var(--accent-glow) 0%, transparent 70%);
    pointer-events: none;
    z-index: 0;
  }

  .card > :not(.card-glow) {
    position: relative;
    z-index: 1;
  }
</style>
