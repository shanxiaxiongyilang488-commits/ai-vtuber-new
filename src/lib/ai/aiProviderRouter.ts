/**
 * AI Provider Router — Character Memory chat.
 *
 * Maps a Personality Engine selection (stored in `character_settings.json`) to
 * the concrete LLM provider understood by the chat backend (`/api/lab-chat`).
 *
 * Implemented now:
 *   🟣 GPT-5.5 → OpenAI
 *   🟢 Gemini  → Gemini API
 *   🤖 AUTO    → GPT-5.5 (OpenAI) for now (no real auto-router yet)
 *
 * Reserved / disabled (not wired to any LLM yet):
 *   ⚫ Grok   🟠 Claude   🖥️ Local LLM
 *
 * This module is pure mapping logic (no Node-only APIs) so it can be imported
 * from both the browser (header chip, modal) and the server.
 */

export type PersonalityProvider =
  | 'AUTO'
  | 'GPT-5.5'
  | 'Grok'
  | 'Gemini'
  | 'Claude'
  | 'Local LLM';

/** Provider id understood by /api/lab-chat (MEMORYCORE backend — left untouched). */
export type LabChatProvider = 'openai' | 'gemini';

export interface ProviderDescriptor {
  id: PersonalityProvider;
  label: string;
  icon: string;
  /** False for reserved providers that are greyed out in the UI. */
  implemented: boolean;
}

/** Canonical provider list, in display order, shared by the modal and the router. */
export const PROVIDER_DESCRIPTORS: ProviderDescriptor[] = [
  { id: 'AUTO', label: 'AUTO', icon: '🤖', implemented: true },
  { id: 'GPT-5.5', label: 'GPT-5.5', icon: '🟣', implemented: true },
  { id: 'Grok', label: 'Grok', icon: '⚫', implemented: false },
  { id: 'Gemini', label: 'Gemini', icon: '🟢', implemented: true },
  { id: 'Claude', label: 'Claude', icon: '🟠', implemented: false },
  { id: 'Local LLM', label: 'Local LLM', icon: '🖥️', implemented: false },
];

const DESCRIPTOR_BY_ID = new Map(PROVIDER_DESCRIPTORS.map((descriptor) => [descriptor.id, descriptor]));
const DEFAULT_DESCRIPTOR = DESCRIPTOR_BY_ID.get('AUTO') as ProviderDescriptor;

export interface RoutedProvider {
  /** Original Personality Engine selection (normalized to a known id). */
  selection: PersonalityProvider;
  /** Display label, e.g. "GPT-5.5". */
  label: string;
  /** Emoji icon for the header chip. */
  icon: string;
  /** Concrete lab-chat provider, or null when the selection is not implemented. */
  labChatProvider: LabChatProvider | null;
  /** False for reserved/disabled providers (Grok / Claude / Local LLM). */
  implemented: boolean;
}

function descriptorFor(selection: string): ProviderDescriptor {
  return DESCRIPTOR_BY_ID.get(selection as PersonalityProvider) ?? DEFAULT_DESCRIPTOR;
}

/**
 * Resolve a stored provider selection to a concrete lab-chat provider.
 * Unknown values fall back to AUTO.
 */
export function routeProvider(selection: string): RoutedProvider {
  const descriptor = descriptorFor(selection);

  let labChatProvider: LabChatProvider | null;
  switch (descriptor.id) {
    case 'GPT-5.5':
      labChatProvider = 'openai';
      break;
    case 'Gemini':
      labChatProvider = 'gemini';
      break;
    case 'AUTO':
      // No real auto-router yet — default to GPT-5.5 (OpenAI).
      labChatProvider = 'openai';
      break;
    default:
      // Grok / Claude / Local LLM are reserved and not wired to any LLM yet.
      labChatProvider = null;
  }

  return {
    selection: descriptor.id,
    label: descriptor.label,
    icon: descriptor.icon,
    labChatProvider,
    implemented: descriptor.implemented,
  };
}
