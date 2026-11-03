import { NextResponse } from "next/server";
import { canonicalVideoUrl, getYoutubeVideoId } from "@/lib/youtube";
export const runtime = "nodejs";

export async function GET(request: Request) {
  const url = new URL(request.url).searchParams.get("url") || "";
  const id = getYoutubeVideoId(url);
  if (!id) return NextResponse.json({ error: "Enter a valid YouTube video URL." }, { status: 400 });
  const fallback = {
    videoId: id,
    title: "YouTube video",
    author: "Preview available",
    thumbnail: `https://i.ytimg.com/vi/${id}/hqdefault.jpg`,
    videoUrl: canonicalVideoUrl(id)
  };
  try {
    const endpoint = new URL("https://www.youtube.com/oembed");
    endpoint.searchParams.set("url", canonicalVideoUrl(id));
    endpoint.searchParams.set("format", "json");
    const response = await fetch(endpoint, { signal: AbortSignal.timeout(6000), next: { revalidate: 300 } });
    if (!response.ok) return NextResponse.json(fallback);
    const data = await response.json() as Record<string, unknown>;
    return NextResponse.json({
      ...fallback,
      title: typeof data.title === "string" ? data.title.slice(0, 200) : fallback.title,
      author: typeof data.author_name === "string" ? data.author_name.slice(0, 120) : fallback.author
    });
  } catch {
    return NextResponse.json(fallback);
  }
}
