export function workerSettings() {
  const base = process.env.CONVERTER_API_BASE_URL;
  const key = process.env.CONVERTER_API_KEY;
  if (!base || !key) return null;
  try {
    const parsed = new URL(base);
    if (parsed.protocol !== "https:" && !(parsed.hostname === "localhost" && parsed.protocol === "http:")) return null;
    return { base: parsed.origin, key };
  } catch { return null; }
}
export function clientIp(request: Request) {
  // Vercel-managed request IP; the worker also rate-limits by job count.
  return (request.headers.get("x-real-ip") || request.headers.get("x-forwarded-for")?.split(",")[0] || "unknown").slice(0, 96);
}
