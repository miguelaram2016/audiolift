# Render Free worker trial — deployment gate and test plan

**Status: PREPARED ONLY. No Render service or keep-awake automation is authorized or created.**
**Branch:** `experiment/render-worker-preview-20261103`. Production `main` and draft PR #1 stay unchanged.

## Required gates before any new Render service

1. User confirms **My Workspace** (account `miguelcodes7@gmail.com`) is the intended Render workspace.
2. User checks **Render Dashboard → Billing**, confirms **no payment method** is attached **or** verifies an effective $0 policy for **both outbound bandwidth and build-pipeline overages**. Pipeline spend limits alone do not cap bandwidth. Do not infer this from the service's Free plan. The connected Render tools cannot read payment methods or account-level spend limits.
3. Check remaining free instance hours, outbound bandwidth, and build minutes on the **same Billing** screen. Do not alter or wake unrelated services.
4. Only after both gates: create **one Free web service** from this experiment branch with Docker, auto-deploy **disabled** (`no`), `worker` build context and `worker/Dockerfile`. Explicitly set `CONVERTER_API_KEY` to a new random private 32+ character secret (never add it to GitHub or expose it to the browser), `MAX_DURATION_SECONDS=600`, and `MAX_SOURCE_BYTES=26214400`. Render automatically provides `RENDER_EXTERNAL_URL` for download links.
5. Test only the authorized video specified in the investigation. Do not deploy on a paid plan or enable paid storage, Render cron jobs, or keep-alive automation.

## Connection only to non-production preview

- GitHub feature branch has a preview-only gate: `AUDIO_SOURCE_MODE=render-worker`, `CONVERTER_API_BASE_URL=https://<your-service>.onrender.com`, and `CONVERTER_API_KEY`.
- In Vercel, scope those variables to the **specific experiment Git branch** under the **Preview** environment. Never configure them for Production.
- The Next.js frontend submits `{url, bitrate}` to `/api/convert`; the server adds its private worker API key and polls `/api/jobs/{id}`.
- Download uses an **HTML form POST** to the worker; its unique download capability token is sent in the request **body**. It is never placed in a query string or embedded in a download URL.
- The worker turns off uvicorn HTTP access logs, suppresses raw yt-dlp warnings, uses only sanitized failure classes in its own logs, and expires files after eight minutes of completion.
- `/health` is a lightweight public liveness endpoint, **not** an indication that media extraction works.

## Test matrix — do not claim completion until observed

1. **Service/health:** cold-start then `GET /health`, check a Free instance is actually running and job creation is authenticated.
2. **Authentication:** `POST /jobs` without the key returns 401; invalid URLs and bitrates reject; unexpected jobs are rate/capacity limited.
3. **Authorized conversion:** use the authorized test link already documented in Issue #2 (do not add it to server logs). Request 192 kbps. Poll to completed without cookies, fingerprint spoofing, proxies, or other bypasses.
4. **Download:** browser form POST yields HTTP 200 with `Content-Type: audio/mpeg`, `Content-Disposition` attachment filename `audiolift-<job-id-prefix>.mp3`. Decode audio with ffprobe/ffmpeg and verify nonzero bytes, bitrate near 192 kbps, and playable duration near 5m18s.
5. **Privacy:** verify failed auth, job status, and successful download do **not** produce token-bearing URLs or raw signed YouTube media URLs in Render logs or Vercel logs. The token should not appear in browser address/history.
6. **Failure handling:** test unsupported host, known over-duration/live URL when suitable authorized fixtures exist, 429 limits, wrong/missing download token, expired file (404 or 410), and missing worker / cold-start handling.
7. **Resource cap:** one conversion at a time; two retained jobs; 25 MiB source; 30 MiB final MP3; approximately 80 MiB preflight storage budget; max three attempts per hour globally in-memory. Render free service has ephemeral files and can restart unexpectedly.
8. **Browser:** verify complete download in desktop and mobile browser where accessible. A successful API call or passing build alone is not an end-to-end pass.

## Zero-cost gate for keeping awake (do not enable now)

Render Free spins down after 15 idle minutes; the platform allocates 750 **instance hours per workspace**, not per service, each calendar month. A service held awake throughout a 31-day month could use **744 hours** by itself, leaving roughly six hours for everything else. With the workspace's free bandwidth/build usage and payment controls unknown, **do not enable periodic keep-awake pings** or create any cron job. If every safety and functional test passes, first agree on a bounded uptime window and the specific $0 threshold; use a reversible local script with a stop condition, not a paid Render cron job.

## Rollback

- Remove three branch-scoped Preview env vars from Vercel (or disable `AUDIO_SOURCE_MODE`).
- Suspend/delete **only** the new AudioLift trial worker if desired. Never touch unrelated Render services.
- Leave production `main` and PR #1 draft unchanged.
