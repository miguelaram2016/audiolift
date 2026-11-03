<div align="center">

# AudioLift 🎧

**Convert your own audio and video to MP3, including permitted YouTube links.**

A responsive, open-source audio converter built with **Next.js, TypeScript, and FFmpeg WebAssembly**. No login or user account; this isolated trial connects to an optional free worker only after explicit safety checks.

[Try the site](https://audiolift-miguelaram2016s-projects.vercel.app) · [Source code](https://github.com/miguelaram2016/audiolift) · [How to use](#how-to-use) · [Fork or clone](#fork-or-clone) · [Deploy](#deploy-your-own-copy) · [License](#license)

</div>

> **Status:** This **Render-trial branch** is isolated from production. The Vercel preview has built successfully; creating a free Render service and live MP3 testing remain gated on workspace and $0 billing verification. Do not treat the flow as validated.

## Isolated Render Free trial (this branch only)

This branch is **not** the original Vercel-only extraction experiment. It tests the known-working local `yt-dlp` + FFmpeg Docker worker on an external **Render Free** web service, without changing production. The connection is disabled by default, and no worker has been created or deployed. See [the deployment gates and full test checklist](docs/render-free-trial.md).

For the experimental branch only:
- **YouTube link:** Vercel preview `/api/convert` → private server-to-server API key → Render `POST /jobs` → Render converts using `yt-dlp` + native FFmpeg → Vercel polls job status → the browser submits a short-lived token in a **form POST** to download `audio/mpeg`. **No token in query strings.**
- **Local file:** still converted entirely in the user's browser with FFmpeg WebAssembly.
- **Limits:** one active job, up to two retained jobs, a 10-minute known video duration, 25 MiB source limit, 30 MiB final MP3 cap, at most three trial jobs per hour globally, and eight-minute download retention.
- **Server-only preview secrets:** `AUDIO_SOURCE_MODE=render-worker`, `CONVERTER_API_BASE_URL`, `CONVERTER_API_KEY` scoped to this branch's Vercel Preview environment. The worker gets the same API key privately. No account or key is required from visitors.
- **Availability:** Render Free sleeps after fifteen idle minutes, so first job may take about a minute to wake; files and job states are not persistent.
- **Hard gate:** first confirm intended Render workspace and confirm absence of a payment method or a verified $0 overage policy covering bandwidth **and** build minutes. No keep-awake pings until after live tests and that gate are satisfied.

**Status:** Preview compiles; Render worker runtime and authorized MP3 download have **not** been tested on Render. Preserve `main` and draft PR #1 until the full flow is proven.

## Features

- 🎵 **Local file → MP3:** Select an audio/video file, choose 128, 192, 256, or 320 kbps, and encode it in your browser. The file stays on your device.
- 🔗 **Permitted YouTube link → MP3 (experimental):** Paste a supported video URL, preview it, choose a bitrate, and download the MP3 encoded by the temporary Render worker once connected.
- 🛡️ Restrictive YouTube URL validation, response-size caps, short-video duration checks, and basic request throttling.
- 📱 Responsive interface, progress feedback, and clear error messages.
- 🔓 Apache License 2.0; clone, fork, customize, and self-host.

**Branch note:** The Vercel-only method above describes the parent branch and is not active in this Render-trial branch. The trial uses a separate free worker and does not guarantee zero charges if a payment method is attached. Consult [the gating checklist](docs/render-free-trial.md) before creating anything.

## How to use

### Convert a local file

1. Open AudioLift and select **Local file**.
2. Choose an audio/video file (up to 100 MB).
3. Choose your MP3 bitrate, then select **Convert to MP3**.
4. Download the result.

Your local file is processed in your browser. Encoding speed and supported formats depend on your device.

### Convert a YouTube link (experimental feature branch)

1. Choose **YouTube link** and paste a standard watch, short, or supported YouTube video URL.
2. Review the video's preview and select the MP3 quality.
3. Read the notice: **By using AudioLift, you confirm that you own the content you download or have permission to download and convert it, in accordance with YouTube's terms and applicable law.** There is no checkbox.
4. Click **Convert link to MP3**. The trial worker performs server-side MP3 encoding, then your browser downloads the file directly from Render using a short-lived form token.

YouTube can decline or restrict extraction for some videos. Live/upcoming streams, protected videos, and unavailable audio cannot be processed. **A verified duration over 10 minutes is rejected**. If duration metadata is missing or unreliable, AudioLift **attempts the download instead of wrongly rejecting the video as too long**; all streams remain limited to 25 MiB. Such conversions may still fail if YouTube does not provide playable audio.

**Important:** A usage disclaimer is not proof of permission and does not override copyright law, YouTube's terms, or access controls. For your own YouTube uploads, you can also export via YouTube Studio and then convert that local file.

## Architecture and free-tier limits

| Component | Where it runs | Notes |
| --- | --- | --- |
| Next.js / React frontend | Vercel Hobby | Responsive UI; URL and file modes |
| YouTube URL validation and metadata | Vercel Node.js functions | Only supported HTTPS YouTube URLs |
| YouTube link worker | Render Free Docker web service (trial only) | yt-dlp + native FFmpeg; 10 minutes / 25 MiB source |
| MP3 encoding | Render for links; user browser for local files | Temporary MP3s expire after eight minutes |
| Storage / database | Render ephemeral filesystem only; no database | No durable job history |
| Auth secret | Render + Vercel preview backend only | Shared `CONVERTER_API_KEY`; never browser-visible |

The worker enforces two trial attempts per IP and three globally per hour in a single running instance, plus job/size limits. These counters reset on service restart and are **not durable anti-abuse protection**. Render's included free compute does not imply unlimited bandwidth/build minutes or guarantee no charges if a payment method is attached. This trial **does** use the `worker/` Docker prototype and its private server-to-server API key; it remains entirely disabled until preview environment variables are configured.

## Fork or clone

**Fork** [the repository](https://github.com/miguelaram2016/audiolift) using GitHub's **Fork** button to develop your own version under your account, or **clone** it directly:

```bash
git clone https://github.com/miguelaram2016/audiolift.git
cd audiolift
# For this experimental pipeline:
git switch experiment/render-worker-preview-20261103
npm install
npm run dev
```

Open **http://localhost:3000**. For your fork, replace the origin with your own repository URL. Local-file conversion needs no secrets. To enable YouTube-link conversion in this trial, privately configure the Render worker and three Preview-scoped environment variables described in [the gating checklist](docs/render-free-trial.md).

## Run locally

Requires Node.js 22 and npm, plus a recent desktop or mobile browser with enough memory for WebAssembly.

```bash
npm install
npm run dev        # Development server
npm run test       # Duration and URL validation tests
npm run typecheck  # TypeScript type checks
npm run build      # Runs tests, then builds production assets
npm start          # Serve the build
```

If the YouTube source function cannot retrieve a media stream, that is not necessarily a bug in MP3 encoding: extraction depends on an unofficial API and YouTube network restrictions. The Local file tab does not depend on YouTube.

## Deploy your own copy

1. Fork the GitHub repository and select the `experiment/render-worker-preview-20261103` branch if you want to try the isolated Render trial.
2. Import your fork into [Vercel](https://vercel.com/new) with the Next.js defaults; choose the desired deployment branch.
3. Deploy the frontend on Vercel Hobby. Leave URL conversion **disabled** unless the Render workspace and $0 billing conditions in [docs/render-free-trial.md](docs/render-free-trial.md) have been verified and the backend configured privately.
4. Verify the local file converter and permitted YouTube test case in your deployed browser before sharing publicly.
5. Observe Vercel quota and bandwidth limits; add durable rate limiting and real abuse controls before a broad public launch.

For local-file-only use, you may deploy the stable `main` branch and ignore the optional backend.

## Project structure

```text
app/                         Next.js UI, styles, API handlers
app/api/audio-source/        Experimental, size-limited audio streaming
app/api/metadata/            YouTube link preview
app/api/status/              Link conversion availability
lib/youtube.ts               URL validation and canonical links
lib/video-duration.mjs       Duration normalization and audio-format fallback
tests/                       URL parsing and duration unit tests
worker/                      Dockerized yt-dlp + FFmpeg trial worker
.env.example                 Optional legacy worker settings, blank by default
.gitignore                   Dependencies, build output, and private files
LICENSE                      Apache License 2.0
```

## Troubleshooting

| Problem | Explanation / next step |
| --- | --- |
| A video under 10 minutes says it is too long | The feature branch distinguishes unverified length from real over-limit length; use an updated preview deployment. |
| Video has missing duration metadata | AudioLift now attempts a size-limited source stream; if that fails, YouTube did not make usable audio available to the server. Try Local file. |
| Trial worker unavailable | Render Free may be waking from its idle state or might not have been configured in the isolated preview. Check environment scope before retrying. |\n| URL extraction fails | The Render host may still be refused by YouTube. This requires real worker-side testing; use Local file as fallback. |
| Browser conversion is slow or crashes | Try a smaller file or a desktop browser with more RAM. |
| Rate limited | Try later; limits are best effort and per warm serverless instance. |

## Contributing

Pull requests are welcome. Fork, make a topic branch, document any behavior changes, and run `npm run test`, `npm run typecheck`, and `npm run build`. Do not commit credentials, downloaded media, or private `.env` files. Please include tests for any duration-validation changes.

## License

Licensed under [Apache License, Version 2.0](LICENSE). You may use, modify, distribute, and build on this project subject to the license conditions.

AudioLift is not affiliated with or endorsed by YouTube. Use it only with media you own or are otherwise permitted to download and convert.
