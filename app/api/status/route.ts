import { NextResponse } from "next/server";
import { workerSettings } from "@/lib/worker";

export async function GET() {
  const enabled = Boolean(workerSettings());
  return NextResponse.json(
    { linkConversionAvailable: enabled, mode: enabled ? "render-worker-trial" : "preview-only" },
    { headers: { "Cache-Control": "no-store" } }
  );
}
