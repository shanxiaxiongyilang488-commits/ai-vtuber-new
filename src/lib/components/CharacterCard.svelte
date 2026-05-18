<script lang="ts">
  import { AI_ENGINE_OPTIONS, VOICE_ENGINE_OPTIONS, OLLAMA_MODEL_PRESETS, COLAB_TTS_VOICE_OPTIONS } from '$lib/types/character';
  import type { Character } from '$lib/types/character';

  interface Props {
    character: Character;
    onUpdate: (updates: Partial<Omit<Character, 'id'>>) => void;
    disabled?: boolean;
  }

  let { character, onUpdate, disabled = false }: Props = $props();

  const EMOJIS = ['🌸','⭐','🔥','🌙','🎵','🐱','🦊','🐻','🌊','🍀'];
</script>

<div class="card" style="--accent: {character.color}">
  <!-- ヘッダー -->
  <div class="card-header">
    <button
      class="emoji-btn"
      onclick={() => {
        const idx = (EMOJIS.indexOf(character.avatarEmoji) + 1) % EMOJIS.length;
        onUpdate({ avatarEmoji: EMOJIS[idx] });
      }}
      disabled={disabled}
    >
      {character.avatarEmoji}
    </button>
  </div>

  <!-- 名前 -->
  <div class="field">
    <label class="field-label">名前</label>
    <input
      class="text-input"
      type="text"
      value={character.name}
      oninput={(e) => onUpdate({ name: (e.target as HTMLInputElement).value })}
      disabled={disabled}
    />
  </div>

  <!-- カラー -->
  <div class="field">
    <label class="field-label">カラー</label>
    <input
      type="color"
      value={character.color}
      oninput={(e) => onUpdate({ color: (e.target as HTMLInputElement).value })}
      disabled={disabled}
    />
  </div>

  <!-- 性格 -->
  <div class="field">
    <label class="field-label">性格プロンプト</label>
    <textarea
      class="textarea"
      rows="3"
      oninput={(e) => onUpdate({ prompt: (e.target as HTMLTextAreaElement).value })}
      disabled={disabled}
    >{character.prompt}</textarea>
  </div>

  <!-- AI & Voice -->
  <div class="row">

    <!-- AI -->
    <div class="field half">
      <label class="field-label">AIエンジン</label>
      <select
        class="select"
        value={character.aiEngine}
        onchange={(e) =>
          onUpdate({
            aiEngine: (e.target as HTMLSelectElement).value as Character['aiEngine']
          })
        }
        disabled={disabled}
      >
        {#each AI_ENGINE_OPTIONS as opt}
          <option value={opt.value}>{opt.label}</option>
        {/each}
      </select>
    </div>

    <!-- Voice -->
    <div class="field half">
      <label class="field-label">音声方式</label>
      <select
        class="select"
        value={character.voiceEngine}
        onchange={(e) =>
          onUpdate({
            voiceEngine: (e.target as HTMLSelectElement).value as Character['voiceEngine']
          })
        }
        disabled={disabled}
      >
        {#each VOICE_ENGINE_OPTIONS as opt}
          <option value={opt.value}>{opt.label}</option>
        {/each}
      </select>
    </div>
  </div>

  <!-- モデル入力（共通） -->
  {#if character.aiEngine === 'ollama' || character.aiEngine === 'lmstudio'}
    <div class="field">
      <label class="field-label">
        {character.aiEngine === 'lmstudio' ? 'LM Studioモデル' : 'Ollamaモデル'}
      </label>

      <input
        class="text-input"
        type="text"
        value={character.ollamaModel}
        oninput={(e) =>
          onUpdate({
            ollamaModel: (e.target as HTMLInputElement).value
          })
        }
        list="model-presets"
        disabled={disabled}
      />

      <datalist id="model-presets">
        {#each OLLAMA_MODEL_PRESETS as preset}
          <option value={preset.value}>{preset.label}</option>
        {/each}
      </datalist>
    </div>
  {/if}

  <!-- VoiceVox -->
  {#if character.voiceEngine === 'voicevox'}
    <div class="field">
      <label class="field-label">Speaker ID</label>
      <input
        type="number"
        value={character.speakerId}
        oninput={(e) =>
          onUpdate({
            speakerId: Number((e.target as HTMLInputElement).value)
          })
        }
        disabled={disabled}
      />
    </div>
  {/if}

  <!-- ElevenLabs -->
  {#if character.voiceEngine === 'elevenlabs'}
    <div class="field">
      <label class="field-label">Voice ID</label>
      <input
        class="text-input"
        type="text"
        value={character.voiceId}
        oninput={(e) =>
          onUpdate({
            voiceId: (e.target as HTMLInputElement).value
          })
        }
        placeholder="例: EXAVITQu4vr4xnSDxMaL"
        disabled={disabled}
      />
    </div>
  {/if}

  {#if character.voiceEngine === 'colab-tts'}
    <div class="field">
      <label class="field-label">VOICE</label>
      <select
        class="select"
        value={character.voice ?? 'irodori-tts-500m-v3'}
        onchange={(e) =>
          onUpdate({
            voice: (e.target as HTMLSelectElement).value
          })
        }
        disabled={disabled}
      >
        {#each COLAB_TTS_VOICE_OPTIONS as option}
          <option value={option}>{option}</option>
        {/each}
      </select>
    </div>
  {/if}
</div>

<style>
.card {
  padding: 12px;
  border: 2px solid var(--accent);
  border-radius: 12px;
}

.row {
  display: flex;
  gap: 8px;
}

.field {
  margin-top: 8px;
}

.field.half {
  flex: 1;
}

.text-input,
.select,
.textarea {
  width: 100%;
}

.emoji-btn {
  font-size: 20px;
}
</style>
