/**
 * Keep Render integration confined to opted-in non-production previews.
 * These environment variables are server-only and never use NEXT_PUBLIC_.
 */
export function workerSettings() {
  if (process.env.VERCEL_ENV === "production" ||
      process.env.AUDIO_SOURCE_MODE !== "render-worker") return null;
  const base = process.env.CONVERTER_API_BASE_URL;
  const key = process.env.CONVERTER_API_KEY;
  if (!base || !key || key.length < 32) return null;
  try {
    const parsed = new URL(base);
    const local = process.env.VERCEL_ENV !== "preview" &&
      parsed.protocol === "http:" && ["localhost", "127.0.0.1"].includes(parsed.hostname);
    const render = parsed.protocol === "https:" &&
      parsed.hostname.endsWith(".onrender.com");
    if ((!local && !render) || parsed.username || parsed.password || parsed.search ||
        parsed.hash || parsed.pathname !== "/") return null;
    return { base: parsed.origin, key };
  } catch { return null; }
}
export function clientIp(request: Request) {
  return (request.headers.get("x-real-ip") ||
    request.headers.get("x-forwarded-for")?.split(",")[0] || "unknown").slice(0, 96);
}
