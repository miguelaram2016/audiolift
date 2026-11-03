import { NextResponse } from "next/server";
import { workerSettings } from "@/lib/worker";
export const runtime = "nodejs";
export const maxDuration = 15;
export async function GET(_request: Request, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params;
  if (!/^[0-9a-f-]{36}$/.test(id)) return NextResponse.json({ error: "Invalid job ID." }, { status: 400 });
  const worker = workerSettings();
  if (!worker) return NextResponse.json({ error: "Worker not connected." }, { status: 503 });
  try {
    const res = await fetch(`${worker.base}/jobs/${id}`, {
      headers: { "x-api-key": worker.key }, signal: AbortSignal.timeout(9000), cache: "no-store"
    });
    if (!res.ok) return NextResponse.json({ error: "Job status could not be retrieved." }, { status: res.status === 404 ? 404 : 502 });
    return NextResponse.json(await res.json(), { headers: { "Cache-Control": "no-store" } });
  } catch { return NextResponse.json({ error: "Worker unavailable." }, { status: 502 }); }
}
