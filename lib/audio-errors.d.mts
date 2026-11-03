export function classifyAudioError(
  error: unknown,
  stage: string
): { code: string; status: number | null; userMessage: string; stage: string };
