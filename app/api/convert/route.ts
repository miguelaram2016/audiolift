import { NextResponse } from "next/server";
import { canonicalVideoUrl, getYoutubeVideoId } from "@/lib/youtube";
import { clientIp, workerSettings } from "@/lib/worker";
export const runtime = "nodejs";
export const maxDuration = 20;
const BITRATES = new Set(["128", "192", "256", "320"]);

export async function POST(request: Request) {
  const type = request.headers.get("content-type") || "";
  if (!type.includes("application/json")) return NextResponse.json({ error: "JSON is required." }, { status: 415 });
  if (Number(request.headers.get("content-length") || "0") > 4096) return NextResponse.json({ error: "Request is too large." }, { status: 413 });
  let body: { url?: unknown; bitrate?: unknown; permission?: unknown };
  try { body = await request.json(); } catch { return NextResponse.json({ error: "Malformed JSON." }, { status: 400 }); }
  const id = typeof body.url === "string" ? getYoutubeVideoId(body.url) : null;
  if (!id) return NextResponse.json({ error: "Enter a supported YouTube video URL." }, { status: 400 });
  if (body.permission !== true) return NextResponse.json({ error: "You must confirm you have permission to download this media." }, { status: 400 });
  const bitrate = String(body.bitrate);
  if (!BITRATES.has(bitrate)) return NextResponse.json({ error: "Choose a valid MP3 bitrate." }, { status: 400 });
  const worker = workerSettings();
  if (!worker) return NextResponse.json({
    error: "Link conversion is not available yet. The processing worker has not been connected. You can convert a downloaded file locally using the File tab."
  }, { status: 503 });
  try {
    const res = await fetch(`${worker.base}/jobs`, {
      method: "POST",
      headers: { "content-type": "application/json", "x-api-key": worker.key, "x-client-ip": clientIp(request) },
      body: JSON.stringify({ url: canonicalVideoUrl(id), bitrate: Number(bitrate), permission: true }),
      signal: AbortSignal.timeout(15000), cache: "no-store"
    });
    const data = await res.json() as Record<string, unknown>;
    if (!res.ok) return NextResponse.json({ error: String(data.detail || "The converter is currently unavailable.").slice(0, 250) }, { status: res.status >= 500 ? 502 : res.status });
    return NextResponse.json({ jobId: data.jobId, status: data.status });
  } catch { return NextResponse.json({ error: "Could not reach the processing service." }, { status: 502 }); }
}
