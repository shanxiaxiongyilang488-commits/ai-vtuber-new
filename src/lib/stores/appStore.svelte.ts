import type { Character } from '$lib/types/character';
import type { Message, ConversationStatus } from '$lib/types/conversation';

class AppStore {
  // ----- Characters -----
  characters = $state<[Character, Character]>([
    {
      id: 'char1',
      name: 'アリス',
      prompt:
        'あなたは明るく好奇心旺盛な女の子です。短めのフレンドリーな文体で話してください。',
      aiEngine: 'dummy',
      voiceEngine: 'irodori-tts',
      voice: 'none',
      color: '#e91e8c',
      avatarEmoji: '🌸',
      ollamaModel: 'qwen:0.5b',
    },
    {
      id: 'char2',
      name: 'ボブ',
      prompt:
        'あなたは落ち着いた知的な男の子です。論理的で丁寧な文体で話してください。',
      aiEngine: 'dummy',
      voiceEngine: 'irodori-tts',
      voice: 'none',
      color: '#1e90ff',
      avatarEmoji: '⭐',
      ollamaModel: 'qwen:0.5b',
    },
  ]);

  // ----- Conversation -----
  messages = $state<Message[]>([]);
  status = $state<ConversationStatus>('idle');
  currentTurn = $state<'char1' | 'char2'>('char1');
  topic = $state<string>('今日の天気と季節について話しましょう');
  isTyping = $state<boolean>(false);

  // ----- Derived helpers -----
  get char1(): Character {
    return this.characters[0];
  }
  get char2(): Character {
    return this.characters[1];
  }

  // ----- Mutators -----
  updateCharacter(index: 0 | 1, updates: Partial<Omit<Character, 'id'>>) {
    this.characters[index] = { ...this.characters[index], ...updates };
  }

  addMessage(msg: Message) {
    this.messages = [...this.messages, msg];
  }

  clearMessages() {
    this.messages = [];
  }

  setStatus(s: ConversationStatus) {
    this.status = s;
  }

  setCurrentTurn(turn: 'char1' | 'char2') {
    this.currentTurn = turn;
  }

  setTopic(t: string) {
    this.topic = t;
  }

  setTyping(v: boolean) {
    this.isTyping = v;
  }
}

export const appStore = new AppStore();
