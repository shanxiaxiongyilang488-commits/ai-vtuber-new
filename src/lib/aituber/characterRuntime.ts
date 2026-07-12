import type { AITuberEvent, CharacterRuntimeSnapshot, CharacterRuntimeState } from './types.ts';

export type RuntimeListener = (snapshot: CharacterRuntimeSnapshot) => void;
export type RuntimeEventSink = (event: Omit<AITuberEvent, 'id' | 'timestamp'>) => void;

export class CharacterRuntime {
  private snapshot: CharacterRuntimeSnapshot;
  private listeners = new Set<RuntimeListener>();
  private readonly eventSink?: RuntimeEventSink;

  constructor(characterId = '', eventSink?: RuntimeEventSink, now = Date.now()) {
    this.eventSink = eventSink;
    this.snapshot = {
      characterId,
      state: 'idle',
      lastUserActivityAt: now,
      lastProactiveAt: null,
      proactiveTimestamps: [],
      awaitingUserAfterProactive: false,
    };
  }

  get(): CharacterRuntimeSnapshot {
    return { ...this.snapshot, proactiveTimestamps: [...this.snapshot.proactiveTimestamps] };
  }

  subscribe(listener: RuntimeListener): () => void {
    this.listeners.add(listener);
    listener(this.get());
    return () => this.listeners.delete(listener);
  }

  selectCharacter(characterId: string, now = Date.now()): void {
    this.snapshot = {
      characterId,
      state: 'idle',
      lastUserActivityAt: now,
      lastProactiveAt: null,
      proactiveTimestamps: [],
      awaitingUserAfterProactive: false,
    };
    this.emit();
  }

  setState(state: CharacterRuntimeState): void {
    if (state === this.snapshot.state) return;
    const previous = this.snapshot.state;
    this.snapshot = { ...this.snapshot, state };
    this.eventSink?.({
      type: 'runtime_state_changed',
      characterId: this.snapshot.characterId,
      metadata: { previous, state },
    });
    this.emit();
  }

  recordUserActivity(now = Date.now()): void {
    this.snapshot = { ...this.snapshot, lastUserActivityAt: now, awaitingUserAfterProactive: false };
    this.emit();
  }

  recordProactive(now = Date.now()): void {
    this.snapshot = {
      ...this.snapshot,
      lastProactiveAt: now,
      proactiveTimestamps: [...this.snapshot.proactiveTimestamps.filter((time) => time > now - 3_600_000), now],
      awaitingUserAfterProactive: true,
    };
    this.emit();
  }

  private emit(): void {
    const snapshot = this.get();
    for (const listener of this.listeners) listener(snapshot);
  }
}
