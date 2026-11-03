import { NextResponse } from "next/server";
import { canonicalVideoUrl, getYoutubeVideoId } from "@/lib/youtube";
import { clientIp, workerSettings } from "@/lib/worker";

export const runtime = "nodejs";
// Render free instances may take about one minute to wake from idle.
export const maxDuration = 120;
const BITRATES = new Set(["128", "192", "256", "320"]);

export async function POST(request: Request) {
  if (request.headers.get("origin") !== new URL(request.url).origin)
    return NextResponse.json({ error: "Only same-origin requests are accepted." }, { status: 403 });
  if (!(request.headers.get("content-type") || "").includes("application/json"))
    return NextResponse.json({ error: "Expected JSON." }, { status: 415 });
  if (Number(request.headers.get("content-length") || 0) > 4096)
    return NextResponse.json({ error: "Request too large." }, { status: 413 });

  let body: { url?: unknown; bitrate?: unknown };
  try { body = await request.json(); }
  catch { return NextResponse.json({ error: "Malformed JSON." }, { status: 400 }); }
  const id = typeof body.url === "string" ? getYoutubeVideoId(body.url) : null;
  if (!id) return NextResponse.json({ error: "Enter a supported YouTube video URL." }, { status: 400 });
  const bitrate = String(body.bitrate);
  if (!BITRATES.has(bitrate)) return NextResponse.json({ error: "Choose a valid MP3 bitrate." }, { status: 400 });

  const worker = workerSettings();
  if (!worker) return NextResponse.json({
    error: "The experimental Render worker is not connected to this preview."
  }, { status: 503 });

  try {
    const res = await fetch(`${worker.base}/jobs`, {
      method: "POST",
      headers: { "content-type": "application/json", "x-api-key": worker.key,
        "x-client-ip": clientIp(request) },
      body: JSON.stringify({ url: canonicalVideoUrl(id), bitrate: Number(bitrate) }),
      signal: AbortSignal.timeout(90000), cache: "no-store"
    });
    const data = await res.json() as Record<string, unknown>;
    if (!res.ok) {
      const message = typeof data.detail === "string" && data.detail.length < 180
        ? data.detail : "The trial converter is unavailable.";
      return NextResponse.json({ error: message }, { status: res.status === 429 ? 429 : 502 });
    }
    if (typeof data.jobId !== "string" || !/^[0-9a-f-]{36}$/.test(data.jobId))
      return NextResponse.json({ error: "Worker returned an invalid job ID." }, { status: 502 });
    return NextResponse.json({ jobId: data.jobId, status: "queued" },
      { headers: { "Cache-Control": "no-store" } });
  } catch {
    return NextResponse.json({
      error: "The free worker could not be reached or did not finish waking up. Retry later."
    }, { status: 502 });
  }
}
