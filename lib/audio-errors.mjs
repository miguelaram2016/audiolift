/**
 * Classify extraction failures without printing user URLs or upstream exception
 * bodies. YouTube.js exceptions can include request URLs, cookies or tokens.
 */
export function classifyAudioError(error, stage) {
  const raw = error && typeof error === "object" ? error : {};
  const firstStatus = [
    raw.status,
    raw.response?.status,
    raw.info?.response?.status,
    raw.cause?.status,
    raw.cause?.response?.status
  ].find(v => Number.isInteger(v) && v >= 400 && v <= 599);
  const status = typeof firstStatus === "number" ? firstStatus : null;
  const message = typeof raw.message === "string" ? raw.message.toLowerCase() : "";
  let code = "SOURCE_ERROR";
  let userMessage = "YouTube audio could not be retrieved. Please try again later or use Local file.";

  if (status === 403 || status === 401 || /(?:\b403\b|forbidden|unauthorized|access denied)/.test(message)) {
    code = "UPSTREAM_ACCESS_DENIED";
    userMessage = "YouTube rejected the audio request from this server. This can happen when cloud IPs are restricted; try Local file instead.";
  } else if (status === 429 || /(?:\b429\b|too many requests|rate.?limit)/.test(message)) {
    code = "UPSTREAM_RATE_LIMIT";
    userMessage = "YouTube temporarily limited requests from this server. Please try later or use Local file.";
  } else if (/sign.?in|login required|age restricted|private video|members.only/.test(message)) {
    code = "ACCESS_RESTRICTED";
    userMessage = "This video requires access that the converter does not have. Use Local file for media you can download legitimately.";
  } else if (/no (?:audio|matching|suitable|compatible) formats?|streaming data|playability|not playable/.test(message)) {
    code = "NO_AUDIO_FORMAT";
    userMessage = "No downloadable audio format was returned for this video. Use Local file or try another permitted source.";
  } else if (/timeout|timed out|aborterror/.test(message)) {
    code = "SOURCE_TIMEOUT";
    userMessage = "The upstream audio request timed out. Please retry later.";
  } else if (/fetch failed|network|econnreset|enotfound|dns|etimedout/.test(message)) {
    code = "SOURCE_NETWORK_FAILURE";
    userMessage = "The server could not reach YouTube's media endpoint. Please retry later.";
  } else if (stage === "opening_stream" || stage === "reading_stream") {
    code = "SOURCE_STREAM_FAILURE";
    userMessage = "The audio stream failed before it could be downloaded. Try Local file instead.";
  } else if (stage === "loading_metadata") {
    code = "SOURCE_METADATA_FAILURE";
    userMessage = "YouTube video metadata could not be retrieved from the server. Please retry later.";
  }

  return { code, status, userMessage, stage };
}
