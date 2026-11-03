const VALID_ID = /^[a-zA-Z0-9_-]{11}$/;
const YOUTUBE_HOSTS = new Set([
  "youtube.com", "www.youtube.com", "m.youtube.com", "music.youtube.com",
  "youtube-nocookie.com", "www.youtube-nocookie.com"
]);
const SHORT_HOSTS = new Set(["youtu.be", "www.youtu.be"]);

/** Parse only well-known YouTube video URLs. Never fetch unvalidated user URLs. */
export function getYoutubeVideoId(input: string): string | null {
  if (typeof input !== "string" || input.length > 2048) return null;
  try {
    const url = new URL(input.trim());
    if (url.protocol !== "https:" || url.username || url.password || url.port) return null;
    const host = url.hostname.toLowerCase();
    let candidate: string | undefined | null;
    if (SHORT_HOSTS.has(host)) {
      candidate = url.pathname.split("/").filter(Boolean)[0];
    } else if (YOUTUBE_HOSTS.has(host)) {
      const segments = url.pathname.split("/").filter(Boolean);
      if (url.pathname === "/watch") candidate = url.searchParams.get("v");
      else if (["shorts", "live", "embed"].includes(segments[0])) candidate = segments[1];
    }
    return candidate && VALID_ID.test(candidate) ? candidate : null;
  } catch {
    return null;
  }
}
export function canonicalVideoUrl(id: string): string {
  if (!VALID_ID.test(id)) throw new Error("Invalid YouTube video ID");
  return `https://www.youtube.com/watch?v=${id}`;
}
