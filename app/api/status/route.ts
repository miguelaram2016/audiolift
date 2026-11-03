import { NextResponse } from "next/server";

export async function GET() {
  return NextResponse.json(
    { linkConversionAvailable: true, mode: "experimental-vercel-stream" },
    { headers: { "Cache-Control": "no-store" } }
  );
}
