<script lang="ts">
  import type { StoryYamlPanel } from '$lib/storyYaml';
  import type { StoryPanelPatch } from '$lib/storyPanelYaml';

  let {
    panel,
    onChange,
  }: {
    panel: StoryYamlPanel;
    onChange: (patch: StoryPanelPatch) => void;
  } = $props();

  function patch(field: keyof StoryPanelPatch, value: string): void {
    onChange({
      scene: field === 'scene' ? value : panel.scene,
      dialogue: field === 'dialogue'
        ? value.split(/\r?\n/).map((line) => line.trim()).filter(Boolean)
        : panel.dialogue,
      prompt: field === 'prompt' ? value : panel.prompt,
    });
  }
</script>

<article class="panel-editor">
  <div class="panel-number">PANEL {panel.panel}</div>

  <label>
    <span>SCENE</span>
    <textarea
      value={panel.scene}
      rows="2"
      oninput={(event) => patch('scene', event.currentTarget.value)}
    ></textarea>
  </label>

  <label>
    <span>DIALOGUE</span>
    <textarea
      value={panel.dialogue.join('\n')}
      rows="3"
      placeholder="1行につき1つの台詞"
      oninput={(event) => patch('dialogue', event.currentTarget.value)}
    ></textarea>
  </label>

  <label>
    <span>PROMPT</span>
    <textarea
      value={panel.prompt}
      rows="4"
      oninput={(event) => patch('prompt', event.currentTarget.value)}
    ></textarea>
  </label>
</article>

<style>
  .panel-editor {
    display: grid;
    gap: 8px;
    padding: 10px;
    border: 1px solid rgba(0, 229, 255, 0.2);
    border-left: 2px solid rgba(0, 229, 255, 0.55);
    border-radius: 6px;
    background: rgba(0, 229, 255, 0.035);
  }

  .panel-number, label span {
    color: rgba(0, 229, 255, 0.8);
    font-size: 9px;
    font-weight: 800;
    letter-spacing: 1.2px;
  }

  label {
    display: grid;
    gap: 4px;
  }

  textarea {
    width: 100%;
    padding: 7px 8px;
    resize: vertical;
    border: 1px solid rgba(148, 163, 184, 0.2);
    border-radius: 5px;
    outline: none;
    background: rgba(2, 6, 23, 0.82);
    color: #e2e8f0;
    font: 11px/1.5 inherit;
    box-sizing: border-box;
  }

  textarea:focus {
    border-color: rgba(251, 191, 36, 0.55);
  }
</style>
