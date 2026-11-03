import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
// Test pure URL parser semantics from source after stripping TS type annotations.
const source = readFileSync(new URL('../lib/youtube.ts', import.meta.url), 'utf8');
const code = source
  .replace(/export function getYoutubeVideoId\(input: string\): string \| null/, 'function getYoutubeVideoId(input)')
  .replace(/export function canonicalVideoUrl\(id: string\): string/, 'function canonicalVideoUrl(id)')
  .replace(/let candidate: string \| undefined \| null;/, 'let candidate;');
const getYoutubeVideoId = new Function(code + '; return getYoutubeVideoId;')();
const ID = 'dQw4w9WgXcQ';
test('accept canonical, short, mobile, shorts and live video URLs', () => {
  for(const value of [`https://www.youtube.com/watch?v=${ID}`,`https://youtu.be/${ID}?t=42`,`https://m.youtube.com/watch?v=${ID}`,`https://www.youtube.com/shorts/${ID}`,`https://youtube.com/live/${ID}`]) assert.equal(getYoutubeVideoId(value), ID);
});
test('reject SSRF hosts, non-https, invalid IDs, embedded credentials, and nonvideo URLs', () => {
  for(const value of [`https://youtube.com.evil.com/watch?v=${ID}`,`http://youtube.com/watch?v=${ID}`,`https://127.0.0.1/watch?v=${ID}`,`https://youtu.be/notvalid`,`https://youtube.com/playlist?list=123`, `https://person:pass@youtube.com/watch?v=${ID}`,`https://youtube.com:444/watch?v=${ID}`]) assert.equal(getYoutubeVideoId(value), null);
});
