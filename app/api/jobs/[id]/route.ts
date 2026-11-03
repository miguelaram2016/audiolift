import { NextResponse } from "next/server";
import { workerSettings } from "@/lib/worker";

export const runtime = "nodejs";
export const maxDuration = 30;
export async function GET(_request: Request, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params;
  if (!/^[0-9a-f-]{36}$/.test(id))
    return NextResponse.json({ error: "Invalid job ID." }, { status: 400 });
  const worker = workerSettings();
  if (!worker)
    return NextResponse.json({ error: "Worker not configured in this preview." }, { status: 503 });
  try {
    const res = await fetch(`${worker.base}/jobs/${id}`, {
      headers: { "x-api-key": worker.key }, signal: AbortSignal.timeout(12000), cache: "no-store"
    });
    if (!res.ok)
      return NextResponse.json({ error: "Job not available (it may have expired)." },
        { status: res.status === 404 ? 404 : 502 });
    const data = await res.json() as Record<string, unknown>;
    if (!["queued", "processing", "completed", "failed"].includes(String(data.status)))
      return NextResponse.json({ error: "Worker returned an invalid job state." }, { status: 502 });

    const status = String(data.status);
    const response: Record<string, unknown> = {
      status,
      progress: typeof data.progress === "number" ? Math.max(0, Math.min(100, data.progress)) : 0,
      filename: typeof data.filename === "string" ? data.filename.slice(0, 120) : undefined,
      error: status === "failed" ? "This video could not be converted on the trial worker." : undefined
    };

    if (status === "completed") {
      if (typeof data.downloadUrl !== "string" || typeof data.downloadToken !== "string")
        return NextResponse.json({ error: "The download capability is missing." }, { status: 502 });
      const url = new URL(data.downloadUrl);
      if (url.origin !== worker.base || url.pathname !== `/downloads/${id}` ||
          url.search || url.hash || !/^[a-zA-Z0-9_-]{32,128}$/.test(data.downloadToken))
        return NextResponse.json({ error: "The download endpoint is invalid." }, { status: 502 });
      response.downloadUrl = url.toString();
      response.downloadToken = data.downloadToken;
    }
    return NextResponse.json(response, { headers: { "Cache-Control": "no-store" } });
  } catch {
    return NextResponse.json({ error: "Trial worker is temporarily unavailable." }, { status: 502 });
  }
}
