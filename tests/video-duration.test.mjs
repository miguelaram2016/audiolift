import test from "node:test";
import assert from "node:assert/strict";
import { parseDurationSeconds, videoDurationSeconds, checkVideoDuration } from "../lib/video-duration.mjs";

test("accepts numeric and formatted under-ten-minute durations", () => {
  assert.equal(parseDurationSeconds(579), 579);
  assert.equal(parseDurationSeconds("579"), 579);
  assert.equal(parseDurationSeconds("9:39"), 579);
  assert.equal(parseDurationSeconds("00:09:39"), 579);
});

test("rejects invalid duration representations without declaring videos too long", () => {
  for (const duration of [undefined, null, NaN, Infinity, 0, -1, "unknown", "9:99", {}, ""]) {
    assert.equal(parseDurationSeconds(duration), null);
    assert.equal(checkVideoDuration({ basic_info: { duration } }).status, "unknown");
  }
});

test("keeps the 10-minute cap accurate at its boundary", () => {
  assert.deepEqual(checkVideoDuration({ basic_info: { duration: 599 } }), { status: "ok", seconds: 599 });
  assert.deepEqual(checkVideoDuration({ basic_info: { duration: 600 } }), { status: "ok", seconds: 600 });
  assert.deepEqual(checkVideoDuration({ basic_info: { duration: 601 } }), { status: "too_long", seconds: 601 });
});

test("uses audio-format milliseconds when YouTube omits the main duration", () => {
  const info = {
    basic_info: { duration: NaN },
    streaming_data: { adaptive_formats: [
      { has_audio: false, approx_duration_ms: 400000 },
      { has_audio: true, approx_duration_ms: 485000 }
    ] }
  };
  assert.equal(videoDurationSeconds(info), 485);
  assert.equal(checkVideoDuration(info).status, "ok");
});

test("does not misinterpret audio format milliseconds as seconds", () => {
  const result = checkVideoDuration({
    basic_info: {},
    streaming_data: { formats: [{ mime_type: "audio/mp4", approx_duration_ms: 599000 }] }
  });
  assert.deepEqual(result, { status: "ok", seconds: 599 });
});

test("rejects true over-limit durations and live content", () => {
  assert.equal(checkVideoDuration({
    basic_info: {},
    streaming_data: { adaptive_formats: [{ has_audio: true, approx_duration_ms: 601000 }] }
  }).status, "too_long");
  assert.equal(checkVideoDuration({ basic_info: { duration: 120, is_live: true } }).status, "live");
  assert.equal(checkVideoDuration({ basic_info: { duration: 120, is_post_live_dvr: true } }).status, "live");
});
