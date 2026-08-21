import type { StoryScene } from './sceneTimeline';

/** Scene Timeline types now live in sceneTimeline.ts. Re-exported for legacy importers. */
export type { PanelBounds, SceneEventType, StoryScene } from './sceneTimeline';

export type VideoProfile = {
  pace: 'slow' | 'gentle' | 'brisk';
  camera_style: string;
  mood: string;
  default_duration: number;
  daily_routine: string[];
  forbidden: string[];
};

export const DAILY_VIDEO_PROFILE: VideoProfile = {
  pace: 'slow',
  camera_style: 'documentary',
  mood: 'peaceful',
  default_duration: 60,
  daily_routine: ['wake_up', 'greeting', 'helping_master', 'evening_walk', 'sleep'],
  forbidden: ['dramatic_pv', 'action_battle', 'flashy_effects'],
};

export type StoryBlueprint = {
  title: string;
  duration: number;
  story_summary: string;
  scenes: StoryScene[];
  dialogues: string[];
  camera: string;
  mood: string;
  music_mood: string;
};

const quote = (value: string): string => JSON.stringify(value);

/** Builds a quiet 30–60 second daily-life video plan, not a flashy PV. */
export function createStoryBlueprint(source: string, characterName = 'Character', profile: VideoProfile = DAILY_VIDEO_PROFILE, characterContext = ''): StoryBlueprint {
  const request = source.trim().replace(/\s+/g, ' ') || `${characterName} daily video`;
  const duration = Math.max(30, Math.min(60, profile.default_duration));
  const isWakeUp = /wake|boot|起動|おはよう|朝/u.test(request);
  const isShiro = /^(shiro|シロ)$/iu.test(characterName.trim());
  const isShiroMorningPv = isShiro && (isWakeUp || /日常|master|マスター/u.test(request));
  const title = isShiroMorningPv ? 'シロの日常 #001「おはようございます、マスター」' : isWakeUp ? `${characterName} Daily #001: Wake Up` : `${characterName} Daily: ${request.slice(0, 48)}`;
  const mood = `${profile.mood}, quiet, warm, and observational`;
  const musicMood = 'soft electronic piano, gentle ambient pads, light morning chimes, no dramatic drop';
  const memoryNote = characterContext.trim().replace(/\s+/g, ' ').slice(0, 240);
  const beats = isShiroMorningPv
    ? [
        ['wake up', 'Shiro wakes in her charging pod inside the cat-android sisters research lab.', 'Boot complete. Good morning, Master.'],
        ['stretch', 'Shiro steps out and makes a small natural stretch; ears and tail move gently.', 'Systems are feeling good today.'],
        ['greeting', 'Shiro faces Master and gives a polite, warm morning greeting.', 'Good morning, Master.'],
        ['laboratory walk', 'Shiro slowly looks around the sisters research lab, checking quiet glowing terminals.', 'Everything in the laboratory looks normal.'],
        ['smile to camera', 'Shiro looks directly into the camera and smiles softly in the morning light.', 'What shall we do today?'],
      ]
    : isWakeUp
    ? [
        ['charging pod boot', `${characterName} wakes inside a quiet charging pod; its soft status light turns on in the early morning room.`, '...boot sequence complete.'],
        ['eyes open', `${characterName} slowly opens their eyes, takes a natural breath, and sits up without dramatic movement.`, 'Good morning, Master.'],
        ['morning greeting', `${characterName} steps out of the pod, fixes their hair, and gives a small greeting toward Master.`, 'I am ready for today.'],
        ['window light', `${characterName} stands by the window and quietly watches warm sunlight fill the room.`, 'It is a beautiful morning.'],
        ['daily question', `${characterName} turns back to Master with a gentle, curious expression and leaves space for the title card.`, 'What shall we do today?'],
      ]
    : [
        ['daily opening', `${characterName} is shown in a familiar everyday place.`, 'Hello.'],
        ['routine', `${characterName} performs a small daily task at a relaxed pace.`, 'I will take care of this.'],
        ['connection', `${characterName} pauses to notice a small detail in the world.`, 'That is nice.'],
        ['helping master', `${characterName} gently offers help, keeping the action grounded and personal.`, 'Can I help?'],
        ['quiet ending', `${characterName} finishes the moment with a calm look toward the camera.`, 'See you later.'],
      ];
  const resolvedDuration = isShiroMorningPv ? 30 : duration;
  const durations = isShiroMorningPv ? [6, 6, 6, 6, 6] : [11, 12, 12, 12, duration - 47];
  const scenes = beats.map(([label, visual, dialogue], index) => ({
    id: index + 1,
    duration: durations[index],
    visual: `${label}: ${visual}`,
    action: 'subtle natural movement, clear everyday gesture, no exaggerated acting',
    dialogue: `${characterName}: ${dialogue}`,
    camera: index === 0 ? 'wide static establishing shot' : index === 4 ? 'medium close-up, gentle hold' : 'handheld documentary medium shot, very slow movement',
    mood,
  }));
  return {
    title,
    duration: resolvedDuration,
    story_summary: isShiroMorningPv
      ? 'A 30-second character introduction PV set in the cat-android sisters research lab: Shiro wakes, stretches, greets Master, checks the laboratory, and smiles at the camera.'
      : `An ordinary ${duration}-second record of ${characterName}'s daily life. Theme: ${request}. The camera observes small routines instead of staging a dramatic PV.${memoryNote ? ` Character memory to preserve: ${memoryNote}` : ''}`,
    scenes,
    dialogues: scenes.map((scene) => scene.dialogue),
    camera: `${profile.camera_style}, ${profile.pace} pace, observational framing`,
    mood,
    music_mood: musicMood,
  };
}

export function storyBlueprintToYaml(blueprint: StoryBlueprint): string {
  return [
    `title: ${quote(blueprint.title)}`,
    `duration: ${blueprint.duration}s`,
    `story_summary: ${quote(blueprint.story_summary)}`,
    'scenes:',
    ...blueprint.scenes.flatMap((scene) => [
      `  - id: ${scene.id}`, `    duration: ${scene.duration}s`, `    visual: ${quote(scene.visual)}`,
      `    action: ${quote(scene.action)}`, `    dialogue: ${quote(scene.dialogue)}`,
      `    camera: ${quote(scene.camera)}`, `    mood: ${quote(scene.mood)}`,
    ]),
    'dialogues:', ...blueprint.dialogues.map((dialogue) => `  - ${quote(dialogue)}`),
    `camera: ${quote(blueprint.camera)}`,
    `mood: ${quote(blueprint.mood)}`,
    `music_mood: ${quote(blueprint.music_mood)}`,
  ].join('\n');
}
