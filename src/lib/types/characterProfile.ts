export const CHARACTER_PROFILE_FILENAME = 'character_profile.json';

export interface CharacterProfileJson {
  name: string;
  image: string;
  personality: string;
  speech_style: string;
  likes: string[];
  dislikes: string[];
  memories: string[];
  created_at: string;
  updated_at: string;
}
