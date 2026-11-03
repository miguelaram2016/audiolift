import { NextResponse } from "next/server";
export async function GET() {
  return NextResponse.json({ linkConversionAvailable: Boolean(process.env.CONVERTER_API_BASE_URL && process.env.CONVERTER_API_KEY) }, { headers: { "Cache-Control": "no-store" } });
}
