/**
 * Disabled prototype retained only so older imports fail explicitly instead of
 * silently changing the chat provider. RunPod is currently voice-only.
 */
export async function generateRunpodReflection(): Promise<never> {
  throw new Error('RunPod reflection/deep reasoning is disabled.');
}
