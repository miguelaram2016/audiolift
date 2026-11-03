import { Innertube } from "youtubei.js";
import { getYoutubeVideoId } from "@/lib/youtube";
import { checkVideoDuration } from "@/lib/video-duration.mjs";
import { classifyAudioError } from "@/lib/audio-errors.mjs";

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

  let input: { url?: unknown };
  try { input = await request.json(); }
  catch { return fail("Invalid request body.", 400); }

  const id = typeof input.url === "string" ? getYoutubeVideoId(input.url) : null;
  if (!id) return fail("Enter a valid supported YouTube video URL.", 400);

  // Lightweight per-instance rate limiting. Not a substitute for durable limits/WAF.
  const ip = (request.headers.get("x-real-ip") || request.headers.get("x-forwarded-for")?.split(",")[0] || "anonymous").slice(0, 90);
  const now = Date.now();
  if (recent.size > 1000) for (const [key, entries] of recent) if (entries.every(t => now - t >= WINDOW_MS)) recent.delete(key);
  const hits = (recent.get(ip) || []).filter(t => now - t < WINDOW_MS);
  if (hits.length >= 2) return fail("Free converter limit reached. Try again later.", 429);

  const diagnosticId = crypto.randomUUID();
  let stage = "loading_metadata";
  let upstreamFacts: { playability: string; hasStreamingData: boolean; formatCount: number; audioFormatCount: number } | null = null;
  try {
    const youtube = await Innertube.create();
    const info = await youtube.getBasicInfo(id);
    // Only record non-sensitive facts about the upstream response; never log
    // the media ID, title, URLs, or raw playability reason.
    const playability = String(info.playability_status?.status || "UNKNOWN").slice(0, 32);
    const formats = [
      ...(info.streaming_data?.adaptive_formats || []),
      ...(info.streaming_data?.formats || [])
    ];
    const audioFormats = formats.filter(f => f.has_audio || f.mime_type?.startsWith("audio/"));
    const facts = {
      playability: /^(OK|LOGIN_REQUIRED|UNPLAYABLE|ERROR|LIVE_STREAM_OFFLINE|CONTENT_CHECK_REQUIRED|UNKNOWN)$/.test(playability) ? playability : "OTHER",
      hasStreamingData: Boolean(info.streaming_data),
      formatCount: Math.min(formats.length, 1000),
      audioFormatCount: Math.min(audioFormats.length, 1000)
    };
    upstreamFacts = facts;
    const duration = checkVideoDuration(info, MAX_DURATION_SECONDS);
    if (duration.status === "live") {
      return fail("Live or upcoming streams are not supported.", 422);
    }
    // YouTube can omit duration even for short, otherwise accessible videos.
    // In that case, attempt the media stream; the strict 25 MiB cap still applies.
    // Only reject a video when its duration is known to exceed the limit.
    if (duration.status === "too_long") {
      return fail("This video exceeds the current 10-minute limit.", 422);
    }
    // Count only eligible attempts against the per-instance rate limit.
    hits.push(now);
    recent.set(ip, hits);
    if (facts.playability === "LOGIN_REQUIRED") {
      console.warn("AudioLift upstream playability challenge", { diagnosticId, ...facts });
      return Response.json(
        { error: "YouTube rejected this server's unauthenticated playback request. The video itself may be public; use Local file for now. (Code: UPSTREAM_LOGIN_REQUIRED)", code: "UPSTREAM_LOGIN_REQUIRED", diagnosticId: diagnosticId.slice(0, 8) },
        { status: 502, headers: { "Cache-Control": "no-store" } }
      );
    }
    if (facts.audioFormatCount === 0) {
      console.warn("AudioLift upstream returned no audio formats", { diagnosticId, ...facts });
      return Response.json(
        { error: "YouTube did not offer an audio stream to this server. The video may still be publicly playable. (Code: UPSTREAM_NO_AUDIO_FORMAT)", code: "UPSTREAM_NO_AUDIO_FORMAT", diagnosticId: diagnosticId.slice(0, 8) },
        { status: 502, headers: { "Cache-Control": "no-store" } }
      );
    }
    stage = "opening_stream";
    const source = await info.download({ type: "audio", quality: "best" });
    const reader = source.getReader();

    // Verify that at least one chunk of real media can be read before sending
    // HTTP 200. Otherwise the browser would see a successful response whose
    // body fails immediately with no useful extraction error.
    let probeTimer: ReturnType<typeof setTimeout> | undefined;
    let firstChunk: ReadableStreamReadResult<Uint8Array>;
    try {
      firstChunk = await Promise.race([
        reader.read(),
        new Promise<never>((_, reject) => {
          probeTimer = setTimeout(() => reject(new Error("Audio source timed out")), 15000);
        })
      ]);
    } finally {
      if (probeTimer) clearTimeout(probeTimer);
    }
    if (firstChunk.done || !firstChunk.value?.byteLength) {
      return fail("YouTube returned an empty audio stream.", 502);
    }
    let sent = firstChunk.value.byteLength;
    if (sent > MAX_AUDIO_BYTES) {
      void reader.cancel("Source exceeded size limit");
      return fail("Source audio exceeds the 25 MiB limit.", 413);
    }
    stage = "reading_stream";
    const capped = new ReadableStream<Uint8Array>({
      start(controller) { controller.enqueue(firstChunk.value); },
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
        } catch (err) {
          const failure = classifyAudioError(err, "reading_stream");
          console.warn("AudioLift upstream stream failure", {
            diagnosticId, stage: failure.stage, code: failure.code, upstreamStatus: failure.status, ...upstreamFacts
          });
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
  } catch (err) {
    const failure = classifyAudioError(err, stage);
    // Never log the raw exception: YouTube's errors can include signed URLs.
    const errorKind = err instanceof TypeError ? "TypeError" : err instanceof RangeError ? "RangeError" :
      err instanceof Error && ["PlayerError", "InnertubeError", "Error", "SyntaxError"].includes(err.name)
        ? err.name : "Other";
    console.warn("AudioLift upstream request failure", {
      diagnosticId, stage: failure.stage, code: failure.code, upstreamStatus: failure.status,
      errorKind, ...upstreamFacts
    });
    return Response.json(
      {
        error: `${failure.userMessage} (Code: ${failure.code})`,
        code: failure.code,
        diagnosticId: diagnosticId.slice(0, 8)
      },
      { status: 502, headers: { "Cache-Control": "no-store" } }
    );
  }
}
