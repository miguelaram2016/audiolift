export function parseDurationSeconds(value: unknown): number | null;
export function videoDurationSeconds(info: unknown): number | null;
export function checkVideoDuration(
  info: unknown,
  limitSeconds?: number
): { status: "ok" | "unknown" | "too_long" | "live"; seconds: number | null };
