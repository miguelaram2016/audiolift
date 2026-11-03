/**
 * Lengths from YouTube.js are normally numbers in seconds. Some responses omit
 * video details, so we also accept format approximate durations (milliseconds).
 * A missing length must not be described as a video over the limit.
 */
export function parseDurationSeconds(value) {
  if (typeof value === "number") {
    return Number.isFinite(value) && value > 0 ? value : null;
  }
  if (typeof value !== "string") return null;
  const text = value.trim();
  if (/^\d{1,8}(?:\.\d+)?$/.test(text)) {
    const seconds = Number(text);
    return Number.isFinite(seconds) && seconds > 0 ? seconds : null;
  }
  // Support 9:45 and 1:02:03 when another YouTube client supplies display text.
  if (!/^\d{1,3}:\d{2}(?::\d{2})?$/.test(text)) return null;
  const parts = text.split(":").map(Number);
  if (parts.slice(1).some(part => part >= 60)) return null;
  const seconds = parts.reduce((total, part) => total * 60 + part, 0);
  return seconds > 0 ? seconds : null;
}

export function videoDurationSeconds(info) {
  const direct = parseDurationSeconds(info?.basic_info?.duration);
  if (direct !== null) return direct;
  // youtubei.js Format.approx_duration_ms is an integer in milliseconds.
  const formats = [
    ...(info?.streaming_data?.adaptive_formats || []),
    ...(info?.streaming_data?.formats || [])
  ];
  const durations = formats
    .filter(format => format?.has_audio || format?.mime_type?.startsWith("audio/"))
    .map(format => parseDurationSeconds(format.approx_duration_ms))
    .filter(duration => duration !== null)
    .map(milliseconds => milliseconds / 1000);
  // Use the maximum positive estimate rather than understating the video's length.
  return durations.length ? Math.max(...durations) : null;
}

export function checkVideoDuration(info, limitSeconds = 600) {
  if (info?.basic_info?.is_live || info?.basic_info?.is_post_live_dvr || info?.basic_info?.is_upcoming) {
    return { status: "live", seconds: null };
  }
  const seconds = videoDurationSeconds(info);
  if (seconds === null) return { status: "unknown", seconds: null };
  if (seconds > limitSeconds) return { status: "too_long", seconds };
  return { status: "ok", seconds };
}
