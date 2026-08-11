/**
 * AI Provider Router - Character Memory chat.
 *
 * Maps a Personality Engine selection to the concrete provider understood by
 * /api/lab-chat. Provider availability is supplied by /api/settings so the UI
 * can grey out unconfigured providers without hard-coding the active list.
 */

export type PersonalityProvider =
  | 'AUTO'
  | 'GPT-5.5'
  | 'GPT-5.6 Terra'
  | 'GPT-5.6 Luna'
  | 'GPT-5.6 Sol'
  | 'Grok'
  | 'Gemini'
  | 'Claude'
  | 'Local LLM';

export type LabChatProvider = 'openai' | 'grok' | 'gemini' | 'claude' | 'lmstudio';
export type ProviderAvailability = Partial<Record<'openai' | 'grok' | 'gemini' | 'claude' | 'local', boolean>>;

export interface ProviderDescriptor {
  id: PersonalityProvider;
  label: string;
  icon: string;
  implemented: boolean;
}

export const PROVIDER_DESCRIPTORS: ProviderDescriptor[] = [
  { id: 'AUTO', label: 'AUTO', icon: '*', implemented: true },
  { id: 'GPT-5.5', label: 'GPT-5.5', icon: 'O', implemented: true },
  { id: 'GPT-5.6 Terra', label: 'GPT-5.6 Terra', icon: 'O', implemented: true },
  { id: 'GPT-5.6 Luna', label: 'GPT-5.6 Luna', icon: 'O', implemented: true },
  { id: 'GPT-5.6 Sol', label: 'GPT-5.6 Sol', icon: 'O', implemented: true },
  { id: 'Grok', label: 'Grok', icon: 'X', implemented: true },
  { id: 'Gemini', label: 'Gemini', icon: 'G', implemented: true },
  { id: 'Claude', label: 'Claude', icon: 'C', implemented: true },
  { id: 'Local LLM', label: 'Local LLM', icon: 'L', implemented: true },
];

const DESCRIPTOR_BY_ID = new Map(PROVIDER_DESCRIPTORS.map((descriptor) => [descriptor.id, descriptor]));
const DEFAULT_DESCRIPTOR = DESCRIPTOR_BY_ID.get('AUTO') as ProviderDescriptor;

export interface RoutedProvider {
  selection: PersonalityProvider;
  label: string;
  icon: string;
  labChatProvider: LabChatProvider | null;
  implemented: boolean;
  model?: string;
}

export function buildProviderDescriptors(availability: ProviderAvailability): ProviderDescriptor[] {
  const autoAvailable = Boolean(
    availability.openai
      || availability.grok
      || availability.gemini
      || availability.claude
      || availability.local,
  );

  return PROVIDER_DESCRIPTORS.map((descriptor) => {
    let implemented = descriptor.implemented;
    if (descriptor.id === 'AUTO') implemented = autoAvailable;
    if (descriptor.id === 'GPT-5.5' || descriptor.id.startsWith('GPT-5.6 ')) implemented = Boolean(availability.openai);
    if (descriptor.id === 'Grok') implemented = Boolean(availability.grok);
    if (descriptor.id === 'Gemini') implemented = Boolean(availability.gemini);
    if (descriptor.id === 'Claude') implemented = Boolean(availability.claude);
    if (descriptor.id === 'Local LLM') implemented = Boolean(availability.local);
    return { ...descriptor, implemented };
  });
}

function descriptorFor(selection: string): ProviderDescriptor {
  return DESCRIPTOR_BY_ID.get(selection as PersonalityProvider) ?? DEFAULT_DESCRIPTOR;
}

export function routeProvider(selection: string): RoutedProvider {
  const descriptor = descriptorFor(selection);

  let labChatProvider: LabChatProvider | null;
  switch (descriptor.id) {
    case 'GPT-5.5':
    case 'GPT-5.6 Terra':
    case 'GPT-5.6 Luna':
    case 'GPT-5.6 Sol':
      labChatProvider = 'openai';
      break;
    case 'Grok':
      labChatProvider = 'grok';
      break;
    case 'Gemini':
      labChatProvider = 'gemini';
      break;
    case 'Claude':
      labChatProvider = 'claude';
      break;
    case 'Local LLM':
      labChatProvider = 'lmstudio';
      break;
    case 'AUTO':
      labChatProvider = 'openai';
      break;
    default:
      labChatProvider = null;
  }

  return {
    selection: descriptor.id,
    label: descriptor.label,
    icon: descriptor.icon,
    labChatProvider,
    implemented: descriptor.implemented,
    model: descriptor.id === 'GPT-5.5' ? 'gpt-5.5'
      : descriptor.id === 'GPT-5.6 Terra' ? 'gpt-5.6-terra'
      : descriptor.id === 'GPT-5.6 Luna' ? 'gpt-5.6-luna'
      : descriptor.id === 'GPT-5.6 Sol' ? 'gpt-5.6-sol'
      : undefined,
  };
}
