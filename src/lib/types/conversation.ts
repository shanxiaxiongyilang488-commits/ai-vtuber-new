export interface Message {
  id: string;
  characterId: 'char1' | 'char2';
  characterName: string;
  text: string;
  timestamp: Date;
}

export type ConversationStatus = 'idle' | 'running' | 'stopped';
