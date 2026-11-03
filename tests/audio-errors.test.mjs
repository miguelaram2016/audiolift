import test from "node:test";
import assert from "node:assert/strict";
import { classifyAudioError } from "../lib/audio-errors.mjs";

test("403 from YouTube is categorized without including a source URL", () => {
  const error = Object.assign(new Error("Fetch failed https://sensitive.example/?token=sensitive-value"), { info: { response: { status: 403 } } });
  const result = classifyAudioError(error, "opening_stream");
  assert.equal(result.code, "UPSTREAM_ACCESS_DENIED");
  assert.equal(result.status, 403);
  assert.ok(!JSON.stringify(result).includes("sensitive-value"));
});
test("classifies unavailable audio formats separately", () => {
  assert.equal(classifyAudioError(new Error("No matching formats found"), "opening_stream").code, "NO_AUDIO_FORMAT");
});
test("uses upstream HTTP 429 for rate limits", () => {
  assert.equal(classifyAudioError({ response: { status: 429 } }, "opening_stream").code, "UPSTREAM_RATE_LIMIT");
});
test("unknown error before metadata is distinct from stream errors", () => {
  assert.equal(classifyAudioError(new Error("mysterious failure"), "loading_metadata").code, "SOURCE_METADATA_FAILURE");
  assert.equal(classifyAudioError(new Error("mysterious failure"), "reading_stream").code, "SOURCE_STREAM_FAILURE");
});
test("privacy: classification never includes the original message", () => {
  const result = classifyAudioError(new Error("Bearer example-private-credential"), "opening_stream");
  assert.ok(!JSON.stringify(result).includes("example-private-credential"));
});

test("YouTube not-a-bot interstitial is not called a private video", () => {
  const result = classifyAudioError(new Error("Sign in to confirm you're not a bot"), "opening_stream");
  assert.equal(result.code, "UPSTREAM_BOT_CHALLENGE");
  assert.match(result.userMessage, /server/i);
});
test("ambiguous login required message is not treated as private content", () => {
  const result = classifyAudioError(new Error("LOGIN_REQUIRED"), "opening_stream");
  assert.equal(result.code, "UPSTREAM_LOGIN_REQUIRED");
});
test("explicit age restriction remains an access restriction", () => {
  const result = classifyAudioError(new Error("Video is age restricted"), "opening_stream");
  assert.equal(result.code, "ACCESS_RESTRICTED");
});
