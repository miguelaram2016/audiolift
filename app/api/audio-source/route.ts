import { Innertube } from "youtubei.js";
import { getYoutubeVideoId } from "@/lib/youtube";

export const runtime = "nodejs";
export const maxDuration = 180;

// Keep the free-tier experiment intentionally small. The browser does the MP3 encode.
const MAX_DURATION_SECONDS = 600;
const MAX_AUDIO_BYTES = 25 * 1024 * 1024;
const WINDOW_MS = 30 * 60 * 1000;
const recent = new Map<string, number[]>();

function fail(message: string, status: number) {
  return Response.json({ error: message }, { status, headers: { "Cache-Control": "no-store" } });
}

export async function POST(request: Request) {
  // Same-origin browsers only. This is an abuse guard, not authentication.
  const origin = request.headers.get("origin");
  const ownOrigin = new URL(request.url).origin;
  if (!origin || origin !== ownOrigin) return fail("Cross-origin requests are not supported.", 403);

  if (!(request.headers.get("content-type") || "").includes("application/json")) return fail("Expected JSON.", 415);
  if (Number(request.headers.get("content-length") || 0) > 2048) return fail("Request too large.", 413);

  let input: { url?: unknown; permission?: unknown };
  try { input = await request.json(); }
  catch { return fail("Invalid request body.", 400); }

  const id = typeof input.url === "string" ? getYoutubeVideoId(input.url) : null;
  if (!id || input.permission !== true) return fail("Valid YouTube URL and permission confirmation are required.", 400);

  // Lightweight per-instance rate limiting. Not a substitute for durable limits/WAF.
  const ip = (request.headers.get("x-real-ip") || request.headers.get("x-forwarded-for")?.split(",")[0] || "anonymous").slice(0, 90);
  const now = Date.now();
  if (recent.size > 1000) for (const [key, entries] of recent) if (entries.every(t => now - t >= WINDOW_MS)) recent.delete(key);
  const hits = (recent.get(ip) || []).filter(t => now - t < WINDOW_MS);
  if (hits.length >= 2) return fail("Free converter limit reached. Try again later.", 429);
  hits.push(now);
  recent.set(ip, hits);

  try {
    const youtube = await Innertube.create();
    const info = await youtube.getBasicInfo(id);
    const duration = info.basic_info?.duration;
    if (!duration || !Number.isFinite(duration) || duration > MAX_DURATION_SECONDS || info.basic_info?.is_live || info.basic_info?.is_live_content) {
      return fail("Only available non-live videos up to 10 minutes can be converted.", 422);
    }
    const source = await info.download({ type: "audio", quality: "best" });
    let sent = 0;
    const reader = source.getReader();
    const capped = new ReadableStream<Uint8Array>({
      async pull(controller) {
        try {
          const { done, value } = await reader.read();
          if (done) { controller.close(); return; }
          sent += value.byteLength;
          if (sent > MAX_AUDIO_BYTES) {
            await reader.cancel("Audio exceeds the free service limit");
            controller.error(new Error("Audio exceeds size limit"));
            return;
          }
          controller.enqueue(value);
        } catch {
          controller.error(new Error("Source audio stream failed"));
        }
      },
      cancel(reason) { void reader.cancel(reason); }
    });
    return new Response(capped, {
      status: 200,
      headers: {
        "Content-Type": "application/octet-stream",
        "Cache-Control": "private, no-store, no-transform",
        "X-Content-Type-Options": "nosniff"
      }
    });
  } catch {
    return fail("YouTube did not provide an audio stream for this video. Try another permitted video or use Local file.", 502);
  }
}
