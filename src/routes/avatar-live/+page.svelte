<script lang="ts">
  import { onMount } from 'svelte';

  type CharacterSummary = {
    id: string;
    name: string;
    avatarType?: string;
    avatarSrc?: string;
    hasReference?: boolean;
  };

  let characters = $state<CharacterSummary[]>([]);
  let selectedCharacterId = $state('');
  let charactersLoading = $state(true);
  let characterError = $state('');
  let startingMode = $state('');

  const selectedCharacter = $derived(characters.find((character) => character.id === selectedCharacterId) ?? null);

  const avatarModes = [
    {
      name: 'PNGTuber',
      tag: '2D PNG',
      url: 'http://127.0.0.1:5181',
      accent: '#22d3ee',
      description: '4枚のPNG差分で口パクとまばたき。同梱素材ですぐ起動できます。',
      ready: true,
    },
    {
      name: 'VRM',
      tag: '3D AVATAR',
      url: 'http://127.0.0.1:5182',
      accent: '#a78bfa',
      description: '3Dモデル、表情、口パク、待機VRMA。同梱のMiko VRMで試せます。',
      ready: true,
    },
    {
      name: 'Live2D',
      tag: 'CUBISM 5',
      url: 'http://127.0.0.1:5183',
      accent: '#f472b6',
      description: 'Cubismモデルの表情・モーション・口パク。Coreと利用許諾済みモデルの配置が必要です。',
      ready: true,
    },
    {
      name: 'PuruPuru',
      tag: 'LAYER PHYSICS',
      url: 'http://127.0.0.1:5184',
      accent: '#facc15',
      description: '.purupuruのレイヤー物理、視線、表情、口パク。同梱のMikoで試せます。',
      ready: true,
    },
    {
      name: 'Inochi2D',
      tag: 'WEBGL 2D',
      url: 'http://127.0.0.1:5185',
      accent: '#34d399',
      description: '.inx / .inpのWebGL表示、モーション、口パク。同梱のAkaモデルで試せます。',
      ready: true,
    },
  ] as const;

  const quickActions = [
    { label: 'Character Library', href: '/characters', note: 'Create, register, and assign avatar assets.' },
    { label: 'AITuber Stage', href: '/aituber', note: 'Use a selected character in the main talking stage.' },
    { label: 'Live2D Maker', href: () => selectedCharacter ? `/characters/${encodeURIComponent(selectedCharacter.id)}/live2d-maker` : '/characters', note: 'Open Live2D preparation for the selected character.' },
    { label: 'PuruPuru Maker', href: () => selectedCharacter ? `/mouth-picker?character=${encodeURIComponent(selectedCharacter.id)}` : '/mouth-picker', note: 'Build .purupuru packages from PNG face materials.' },
  ] as const;

  function setupFor(name: string): { label: string; href: string } {
    if (name === 'PNGTuber') return { label: 'PNGTuber Lab', href: '/pngtuber-lab' };
    if (name === 'Live2D') {
      return {
        label: 'Live2D Maker',
        href: selectedCharacter ? `/characters/${encodeURIComponent(selectedCharacter.id)}/live2d-maker` : '/characters',
      };
    }
    if (name === 'PuruPuru') {
      return {
        label: 'PuruPuru Maker',
        href: selectedCharacter ? `/mouth-picker?character=${encodeURIComponent(selectedCharacter.id)}` : '/mouth-picker',
      };
    }
    return { label: 'Character Setup', href: '/characters' };
  }

  function actionHref(href: string | (() => string)): string {
    return typeof href === 'function' ? href() : href;
  }

  onMount(() => {
    void loadCharacters();
  });

  async function loadCharacters(): Promise<void> {
    charactersLoading = true;
    characterError = '';
    try {
      const response = await fetch('/api/characters');
      const data = await response.json().catch(() => ({})) as { characters?: CharacterSummary[]; message?: string };
      if (!response.ok) throw new Error(data.message ?? 'characters load failed');
      characters = Array.isArray(data.characters) ? data.characters : [];
      if (!selectedCharacterId && characters.length > 0) selectedCharacterId = characters[0].id;
    } catch (error) {
      characterError = error instanceof Error ? error.message : String(error);
    } finally {
      charactersLoading = false;
    }
  }

  async function startAvatarMode(mode: string, fallbackUrl: string): Promise<void> {
    if (startingMode) return;
    startingMode = mode;
    characterError = '';
    const pendingWindow = window.open('', `avatar-${mode.toLowerCase()}`);
    if (pendingWindow) {
      pendingWindow.opener = null;
      pendingWindow.document.title = `Starting ${mode}...`;
      pendingWindow.document.body.innerHTML = `
        <main style="min-height:100vh;display:grid;place-items:center;background:#030712;color:#e5f5ff;font-family:system-ui,sans-serif">
          <div style="text-align:center">
            <h1 style="margin:0 0 12px;color:#22d3ee">${mode}</h1>
            <p>Starting avatar runtime...</p>
            <p style="color:#94a3b8">This can take up to 15 seconds.</p>
          </div>
        </main>
      `;
    }
    try {
      if (!pendingWindow) throw new Error('Popup was blocked. Allow popups for this site and try again.');
      const response = await fetch('/api/avatar-live/start', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ mode }),
      });
      const data = await response.json().catch(() => ({})) as { url?: string; message?: string };
      if (!response.ok) throw new Error(data.message ?? 'avatar launch failed');
      const targetUrl = data.url ?? fallbackUrl;
      pendingWindow.location.replace(targetUrl);
    } catch (error) {
      pendingWindow?.close();
      characterError = error instanceof Error ? error.message : String(error);
    } finally {
      startingMode = '';
    }
  }
</script>

<svelte:head><title>Avatar Live | AI VTuber</title></svelte:head>

<main>
  <header>
    <a href="/">← CENTRAL TERMINAL</a>
    <p class="eyebrow">AITUBER AVATAR SYSTEMS</p>
    <h1>AVATAR <span>LIVE</span></h1>
    <p class="lead">5つの公式テンプレートから、配信に使うアバター方式を選択します。</p>
  </header>

  <section class="character-hub" aria-label="Selected character">
    <div>
      <strong>SELECT CHARACTER</strong>
      <span>{selectedCharacter ? `${selectedCharacter.name} / ${selectedCharacter.avatarType ?? 'avatar'}` : 'キャラクター未選択'}</span>
    </div>
    {#if charactersLoading}
      <p>Loading characters...</p>
    {:else if characterError}
      <p class="error">{characterError}</p>
    {:else if characters.length}
      <select bind:value={selectedCharacterId}>
        {#each characters as character}
          <option value={character.id}>{character.name} ({character.id})</option>
        {/each}
      </select>
      <a href={selectedCharacter ? `/characters/${encodeURIComponent(selectedCharacter.id)}/chat` : '/characters'}>Character Chat</a>
    {:else}
      <a href="/characters">Create Character</a>
    {/if}
  </section>

  <section class="grid" aria-label="Avatar systems">
    {#each avatarModes as mode}
      <article style={`--accent:${mode.accent}`}>
        <div class="status"><span>{mode.tag}</span><b class:needs-setup={!mode.ready}>{mode.ready ? 'READY' : 'ASSET SETUP'}</b></div>
        <h2>{mode.name}</h2>
        <p>{mode.description}</p>
        <button class="launch" type="button" onclick={() => void startAvatarMode(mode.name, mode.url)} disabled={Boolean(startingMode)}>
          {startingMode === mode.name ? 'STARTING...' : `LAUNCH ${mode.name} ↗`}
        </button>
        <a class="setup" href={setupFor(mode.name).href}>{setupFor(mode.name).label}</a>
      </article>
    {/each}
  </section>

  <section class="ops" aria-label="Avatar production actions">
    <div class="ops-heading">
      <strong>MODE CONTROL</strong>
      <span>この画面から制作・登録・起動へ移動できます。</span>
    </div>
    <div class="ops-grid">
      {#each quickActions as action}
        <a href={actionHref(action.href)}>
          <b>{action.label}</b>
          <span>{action.note}</span>
        </a>
      {/each}
    </div>
  </section>

  <aside>
    <strong>START COMMAND</strong>
    <code>npm run avatar:all</code>
    <span>個別起動: npm run avatar:pngtuber / avatar:vrm / avatar:live2d / avatar:purupuru / avatar:inochi2d</span>
  </aside>
</main>

<style>
  :global(body) { margin: 0; background: #030712; color: #e5f5ff; font-family: Inter, ui-sans-serif, system-ui, sans-serif; }
  main { min-height: 100vh; box-sizing: border-box; padding: 42px clamp(20px, 5vw, 76px) 70px; background: radial-gradient(circle at 50% 0, #11213a 0, #030712 42%); }
  header { max-width: 1100px; margin: 0 auto 32px; }
  header > a { color: #67e8f9; text-decoration: none; font: 700 12px/1 monospace; letter-spacing: .12em; }
  .eyebrow { margin: 40px 0 7px; color: #64748b; font: 700 12px/1 monospace; letter-spacing: .22em; }
  h1 { margin: 0; font-size: clamp(42px, 7vw, 82px); letter-spacing: -.055em; } h1 span { color: #22d3ee; }
  .lead { max-width: 680px; color: #94a3b8; line-height: 1.8; }
  .character-hub { max-width: 1056px; margin: 0 auto 18px; padding: 16px 18px; display: grid; grid-template-columns: 1fr minmax(220px, 320px) auto; gap: 12px; align-items: center; border: 1px solid #23324a; border-radius: 12px; background: rgba(7, 13, 24, .88); }
  .character-hub div { display: grid; gap: 5px; }
  .character-hub strong { color: #22d3ee; font: 700 11px/1 monospace; letter-spacing: .16em; }
  .character-hub span, .character-hub p { margin: 0; color: #94a3b8; font-size: 13px; }
  .character-hub .error { color: #fb7185; }
  .character-hub select { min-height: 36px; border: 1px solid rgba(34, 211, 238, .24); border-radius: 6px; background: #050b16; color: #e5f5ff; padding: 0 10px; }
  .character-hub a { width: fit-content; padding: 9px 11px; border: 1px solid rgba(34, 211, 238, .35); border-radius: 6px; color: #a5f3fc; text-decoration: none; font: 800 11px/1 monospace; letter-spacing: .08em; }
  .grid { max-width: 1100px; margin: auto; display: grid; grid-template-columns: repeat(auto-fit, minmax(260px, 1fr)); gap: 14px; }
  article { min-height: 245px; padding: 22px; display: flex; flex-direction: column; border: 1px solid color-mix(in srgb, var(--accent) 48%, #20304a); border-radius: 14px; background: linear-gradient(145deg, color-mix(in srgb, var(--accent) 8%, #0b1220), #070d18); box-shadow: inset 0 1px color-mix(in srgb, var(--accent) 18%, transparent); }
  .status { display: flex; justify-content: space-between; gap: 12px; color: var(--accent); font: 700 10px/1 monospace; letter-spacing: .12em; }
  .status b { color: #86efac; } .status b.needs-setup { color: #fda4af; }
  h2 { margin: 30px 0 10px; font-size: 27px; } article p { margin: 0; color: #94a3b8; line-height: 1.65; font-size: 14px; }
  .launch { width: fit-content; margin-top: auto; padding: 24px 0 0; border: 0; background: transparent; color: var(--accent); text-align: left; font: 800 12px/1 monospace; letter-spacing: .1em; cursor: pointer; }
  .launch:disabled { cursor: wait; opacity: .55; }
  .setup { width: fit-content; margin-top: 10px; padding: 7px 9px; border: 1px solid color-mix(in srgb, var(--accent) 38%, #23324a); border-radius: 6px; color: #dbeafe; text-decoration: none; font: 800 11px/1 monospace; letter-spacing: .08em; background: color-mix(in srgb, var(--accent) 8%, transparent); }
  .ops { max-width: 1056px; margin: 18px auto 0; padding: 18px; border: 1px solid #23324a; border-radius: 12px; background: rgba(7, 13, 24, .88); }
  .ops-heading { display: flex; justify-content: space-between; gap: 12px; align-items: center; margin-bottom: 12px; }
  .ops-heading strong { color: #22d3ee; font: 700 11px/1 monospace; letter-spacing: .16em; }
  .ops-heading span { color: #94a3b8; font-size: 12px; }
  .ops-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(210px, 1fr)); gap: 10px; }
  .ops-grid a { display: grid; gap: 6px; min-height: 70px; padding: 13px; border: 1px solid rgba(34, 211, 238, .16); border-radius: 8px; background: #050b16; color: #e5f5ff; text-decoration: none; }
  .ops-grid b { color: #f8fafc; font-size: 14px; }
  .ops-grid span { color: #64748b; font-size: 12px; line-height: 1.45; }
  aside { max-width: 1056px; margin: 18px auto 0; padding: 20px 22px; display: grid; gap: 8px; border: 1px solid #23324a; border-radius: 12px; background: #070d18; }
  aside strong { color: #22d3ee; font: 700 11px/1 monospace; letter-spacing: .16em; } aside code { color: #fff; font-size: 16px; } aside span { color: #64748b; font-size: 12px; line-height: 1.6; }
  @media (max-width: 760px) {
    .character-hub { grid-template-columns: 1fr; }
    .character-hub a { width: auto; text-align: center; }
  }
</style>
