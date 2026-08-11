const ANGLE_DIRECTIVE_TAG = /[〈＜<][^〉＞>\r\n]{1,200}[〉＞>]/gu;

const STRONG_SPEECH_BOUNDARY = /[。！？!?]/u;
const SOFT_SPEECH_BOUNDARY = /[、，,；;：:\s]/u;
const CLOSING_SPEECH_PUNCTUATION = /[」』）】］〕〉》”’]/u;

/** Convert assistant display text into text that is safe to send to TTS. */
export function sanitizeSpeechText(value: string, maxCharacters?: number): string {
  const text = String(value ?? '')
    // Display-only performance/FX directions must never become spoken words.
    .replace(ANGLE_DIRECTIVE_TAG, ' ')
    .replace(/```[\s\S]*?```/g, ' ')
    .replace(/https?:\/\/\S+/g, ' ')
    .replace(/[*#>`|~_]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  // Never silently shorten an assistant reply. The voice backend can split a
  // long utterance into bounded synthesis chunks, so the spoken text should
  // remain identical to the visible text (apart from display-only markup).
  if (maxCharacters === undefined) return text;
  return Array.from(text).slice(0, Math.max(0, maxCharacters)).join('');
}

/**
 * Prepare an ordinary chat reply for local TTS.
 *
 * Do not reduce it to the first sentence or a fixed character count: either
 * makes the visible reply and the spoken reply disagree. Long synthesis is
 * bounded by backend chunking instead.
 */
export function sanitizeChatSpeechText(value: string, maxCharacters?: number): string {
  return sanitizeSpeechText(value, maxCharacters);
}

/**
 * Split already-sanitized speech into model-safe pieces without dropping text.
 * Irodori has a finite generation window; keeping each piece below that window
 * prevents long replies from being cut off or losing their ending.
 */
export function splitSpeechText(value: string, maxCharacters = 90): string[] {
  const text = sanitizeSpeechText(value);
  const safeLimit = Math.max(20, Math.floor(maxCharacters));
  const characters = Array.from(text);
  if (characters.length <= safeLimit) return text ? [text] : [];

  const chunks: string[] = [];
  let offset = 0;
  while (offset < characters.length) {
    const remaining = characters.length - offset;
    if (remaining <= safeLimit) {
      const tail = characters.slice(offset).join('').trim();
      if (tail) chunks.push(tail);
      break;
    }

    const minimumUsefulBoundary = offset + Math.floor(safeLimit * 0.45);
    const hardEnd = offset + safeLimit;
    let strongCut = -1;
    let softCut = -1;
    for (let index = offset; index < hardEnd; index += 1) {
      if (STRONG_SPEECH_BOUNDARY.test(characters[index])) {
        let boundary = index + 1;
        while (boundary < characters.length && CLOSING_SPEECH_PUNCTUATION.test(characters[boundary])) {
          boundary += 1;
        }
        if (boundary >= minimumUsefulBoundary && boundary <= hardEnd) strongCut = boundary;
      } else if (SOFT_SPEECH_BOUNDARY.test(characters[index]) && index + 1 >= minimumUsefulBoundary) {
        softCut = index + 1;
      }
    }

    const cut = strongCut > offset ? strongCut : softCut > offset ? softCut : hardEnd;
    const chunk = characters.slice(offset, cut).join('').trim();
    if (chunk) chunks.push(chunk);
    offset = cut;
    while (offset < characters.length && /\s/u.test(characters[offset])) offset += 1;
  }
  return chunks;
}
