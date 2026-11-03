<div align="center">

# AudioLift 🎧

**Convert your own audio and video to MP3, including permitted YouTube links.**

A responsive, open-source audio converter built with **Next.js, TypeScript, and FFmpeg WebAssembly**. No login, no account, and no separate paid processing server.

[Try the site](https://audiolift-miguelaram2016s-projects.vercel.app) · [Source code](https://github.com/miguelaram2016/audiolift) · [How to use](#how-to-use) · [Fork or clone](#fork-or-clone) · [Deploy](#deploy-your-own-copy) · [License](#license)

</div>

> **Status:** The main branch is the original portfolio MVP. This experimental feature branch implements a limited, no-additional-cost YouTube-link workflow. Compilation and tests are required for the preview build, but a successful YouTube audio stream and downloaded MP3 have **not** been independently verified end to end. Treat YouTube compatibility as experimental.

## Features

- 🎵 **Local file → MP3:** Select an audio/video file, choose 128, 192, 256, or 320 kbps, and encode it in your browser. The file stays on your device.
- 🔗 **Permitted YouTube link → MP3 (experimental):** Paste a supported video URL, preview it, choose a bitrate, and download the audio encoded by your browser.
- 🛡️ Restrictive YouTube URL validation, response-size caps, short-video duration checks, and basic request throttling.
- 📱 Responsive interface, progress feedback, and clear error messages.
- 🔓 Apache License 2.0; clone, fork, customize, and self-host.

**No paid backend is required** for the experimental path. The app streams source audio through a capped Vercel Hobby function; FFmpeg then converts it locally in the browser. That avoids paying for Render, Vercel Sandbox, or object storage. It does not eliminate Vercel's free-tier limits or guarantee that YouTube permits automated extraction.

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
4. Click **Convert link to MP3**. The service fetches the source audio, then your browser encodes and downloads the MP3.

YouTube can decline or restrict extraction for some videos. Live/upcoming streams, protected videos, and unavailable audio cannot be processed. **A verified duration over 10 minutes is rejected**. If duration metadata is missing or unreliable, AudioLift **attempts the download instead of wrongly rejecting the video as too long**; all streams remain limited to 25 MiB. Such conversions may still fail if YouTube does not provide playable audio.

**Important:** A usage disclaimer is not proof of permission and does not override copyright law, YouTube's terms, or access controls. For your own YouTube uploads, you can also export via YouTube Studio and then convert that local file.

## Architecture and free-tier limits

| Component | Where it runs | Notes |
| --- | --- | --- |
| Next.js / React frontend | Vercel Hobby | Responsive UI; URL and file modes |
| YouTube URL validation and metadata | Vercel Node.js functions | Only supported HTTPS YouTube URLs |
| Source audio stream | Vercel Node.js function (experimental) | 10-minute duration limit; 25 MiB audio cap |
| MP3 encoding | User's browser | FFmpeg WebAssembly; no server-side MP3 files |
| Storage / database | None | Browser download; no conversion history |
| Auth secret | None for the experimental link flow | No shared `CONVERTER_API_KEY` required |

Basic request throttling (two attempts per IP in 30 minutes **per warm function instance**) reduces accidental load but is **not durable security protection**. Vercel's free quota may stop the service when exhausted; it will not automatically buy paid hosting. The legacy `worker/` prototype and optional `.env.example` remain in the repository for those who choose to self-host separately; this experimental pipeline does **not** use that worker or its key.

## Fork or clone

**Fork** [the repository](https://github.com/miguelaram2016/audiolift) using GitHub's **Fork** button to develop your own version under your account, or **clone** it directly:

```bash
git clone https://github.com/miguelaram2016/audiolift.git
cd audiolift
# For this experimental pipeline:
git switch feature/zero-cost-browser-audio-pipeline
npm install
npm run dev
```

Open **http://localhost:3000**. For your fork, replace the origin with your own repository URL. No API key, worker, or environment variables are required for the experimental flow.

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

1. Fork the GitHub repository and select the `feature/zero-cost-browser-audio-pipeline` branch if you want to try the experimental link flow.
2. Import your fork into [Vercel](https://vercel.com/new) with the Next.js defaults; choose the desired deployment branch.
3. Deploy on a Hobby plan without enabling paid services. **No secret environment variables are required** for the experimental branch.
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
worker/                      Older optional self-hosted converter prototype
.env.example                 Optional legacy worker settings, blank by default
.gitignore                   Dependencies, build output, and private files
LICENSE                      Apache License 2.0
```

## Troubleshooting

| Problem | Explanation / next step |
| --- | --- |
| A video under 10 minutes says it is too long | The feature branch distinguishes unverified length from real over-limit length; use an updated preview deployment. |
| Video has missing duration metadata | AudioLift now attempts a size-limited source stream; if that fails, YouTube did not make usable audio available to the server. Try Local file. |
| Link conversion fails after preview | YouTube may restrict source extraction or Vercel may hit a function or bandwidth limit. Use Local file as a fallback. |
| Browser conversion is slow or crashes | Try a smaller file or a desktop browser with more RAM. |
| Rate limited | Try later; limits are best effort and per warm serverless instance. |

## Contributing

Pull requests are welcome. Fork, make a topic branch, document any behavior changes, and run `npm run test`, `npm run typecheck`, and `npm run build`. Do not commit credentials, downloaded media, or private `.env` files. Please include tests for any duration-validation changes.

## License

Licensed under [Apache License, Version 2.0](LICENSE). You may use, modify, distribute, and build on this project subject to the license conditions.

AudioLift is not affiliated with or endorsed by YouTube. Use it only with media you own or are otherwise permitted to download and convert.
