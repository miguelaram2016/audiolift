<div align="center">

# AudioLift 🎧

**Turn your own video or audio into a downloadable MP3.**

A responsive, open-source audio converter built with **Next.js**, **TypeScript**, and **FFmpeg**. Convert an audio/video file privately in your browser, or connect an optional processing worker for **authorized** YouTube video links.

[Features](#features) · [How to use](#how-to-use) · [Run locally](#run-locally) · [Fork-or-clone](#fork-or-clone) · [Deploy](#deploy-your-own-copy) · [License](#license)

</div>

> **Project status:** Portfolio MVP. The local-file converter and YouTube link preview are implemented, but a browser conversion smoke test and cloud build still need verification. **YouTube URL → MP3 downloading requires a separate processing worker**; it does not work on a frontend-only Vercel deployment. No public end-to-end URL conversion has been verified yet.

## Experimental zero-cost YouTube pipeline (feature branch)

This branch experiments with **no separate conversion service and no paid hosting**:

1. A rate- and size-limited Vercel Hobby function validates the permitted YouTube URL, checks duration, and streams source audio to the same-origin browser.
2. Your browser converts that audio to MP3 using FFmpeg WebAssembly and provides a local download.
3. Nothing is stored in a conversion database, and no shared `CONVERTER_API_KEY` is needed for this experimental mode.

**Limits:** non-live videos up to **10 minutes**, source audio up to **25 MiB**, plus an indicative **two attempts per browser IP per 30 minutes** enforced per warm function instance (not a durable abuse limit). Free Hobby quotas can halt service, and extraction may fail due to YouTube restrictions. The browser still needs memory and CPU to encode.

**Status: experimental, not verified end-to-end.** The preview build and TypeScript checks pass, but no real YouTube audio stream, browser MP3 conversion, or final download has been confirmed. Do not claim this is a fully working public converter until tested. The stable main branch retains the original preview-only workflow and optional worker architecture.

Vercel Hobby is free within usage limits; do not enable paid Sandbox/Blob services or upgrade the plan. Restrict and monitor usage before launching publicly. Only process media where downloading and conversion are authorized and permitted by the platform.

## What is AudioLift?

AudioLift puts a straightforward MP3 conversion flow behind a clean, mobile-friendly interface. It has two modes:

| Mode | What happens | Requirements |
| --- | --- | --- |
| **File → MP3** | Pick an audio/video file, select a bitrate, convert locally using FFmpeg WebAssembly, and download the result. | Modern browser; no server upload. |
| **YouTube link → MP3** | Paste a supported YouTube URL, preview its metadata, confirm permission, choose a bitrate, and submit a conversion job to a separate worker. | A configured, reachable worker; a permitted/authorized source; external hosting. |

### Features

- Responsive interface with accessible labels, conversion feedback, and clear error messages.
- YouTube `watch`, `youtu.be`, Shorts and `/live/` video **links recognized for metadata lookup**; actual live streams are not supported for conversion.
- Link title, creator and thumbnail preview via YouTube oEmbed when available.
- MP3 output options: **128, 192, 256, or 320 kbps**. Selecting a higher bitrate cannot restore detail missing from the source.
- **On-device file conversion** using WebAssembly, with a 100 MB source-file limit to reduce browser memory pressure.
- Optional Dockerized FastAPI worker using `yt-dlp` and FFmpeg for permitted YouTube links.
- Server-side worker secrets, rate and duration limits, basic job status tracking, and temporary download links.
- No database or user account required for the portfolio MVP.

## How to use

### Option A — Convert a file (no worker needed)

1. Open AudioLift and select the **File** tab.
2. Choose a supported local audio or video file (up to **100 MB**).
3. Pick an MP3 bitrate.
4. Select **Convert to MP3**, then download the result.

The selected source file is processed in your browser, rather than uploaded to the AudioLift server. The FFmpeg WebAssembly code is loaded separately by the browser. Performance and format support depend on your device and browser.

### Option B — Convert an authorized YouTube link (worker required)

1. Open the **Link** tab and paste a YouTube video URL.
2. Check the video preview and choose the output bitrate.
3. Confirm you own the media or have the permissions required to download and convert it.
4. Select **Convert link to MP3**, then download the result when the job finishes.

If **Convert link to MP3** is unavailable, the site is in preview-only mode: its processing worker has not been connected. Private, age-restricted, geo-blocked, live, or otherwise unavailable videos may not be convertible. The optional worker enforces a **45-minute** default duration limit.

**Important:** A checkbox is not proof of permission. Do not use AudioLift to circumvent access controls or download content in violation of copyright or YouTube's terms. A reliable option for your own YouTube uploads is to download them via YouTube Studio first, then use AudioLift's **File** mode.

## Tech stack

| Area | Technology |
| --- | --- |
| Web UI / API | Next.js App Router, React, TypeScript |
| Styling | CSS |
| Local audio processing | `@ffmpeg/ffmpeg` + `@ffmpeg/util` (FFmpeg WebAssembly) |
| Link preview | YouTube oEmbed |
| Optional URL processing | Python, FastAPI, `yt-dlp`, native FFmpeg |
| Hosting | Vercel frontend; separate Docker/container host for worker |

## Fork or clone

To make your own copy, either:

- **Fork:** Once the repository is published on GitHub, use its **Fork** button to create a repository under your own account. Then clone **your fork** and make changes there.
- **Clone:** Once published, use the commands below to download this project locally without creating a fork.

```bash
git clone https://github.com/miguelaram2016/audiolift.git
cd audiolift
npm install
npm run dev
```

Then visit **http://localhost:3000**. The GitHub URL above is the *intended repository address*; repository creation/publication is a remaining project milestone, so it will not resolve until that step is done. If using a fork, replace `miguelaram2016` with your GitHub username.

> If you downloaded the source ZIP before the repository is created, extract it, open a terminal in the extracted project folder, and run `npm install` followed by `npm run dev` instead.

## Run locally

**Prerequisites:** Node.js **22 or newer** and npm. A modern browser is required for local conversion. For the optional worker, Docker is recommended.

```bash
npm install
npm run dev
```

Visit **http://localhost:3000**.

Commands:

```bash
npm run dev         # Development server
npm run test        # URL validation tests
npm run typecheck   # TypeScript checks
npm run build       # Production build
npm start           # Run a production build
```

**Environment setup:** You do **not** need any environment variables to use the browser-side File mode or YouTube preview. The `.env.example` is only for the optional backend. Never commit API keys or `.env.local`.

## Deploy your own copy

### 1. Frontend — Vercel

1. Push your fork/clone to GitHub.
2. In [Vercel](https://vercel.com/new), choose **Add New → Project**, import your GitHub repository, and use the Next.js defaults.
3. Deploy. The File converter and YouTube metadata preview do not require your own conversion server. Validate file conversion in the deployed browser before sharing.
4. Leave the two backend environment variables **unset** unless you have deployed a trusted worker.

**Vercel alone is not a complete URL-to-MP3 service.** Serverless functions are used for API orchestration; they are not intended to perform long downloads/encodes or relay large generated files. The optional worker serves completed MP3s directly from its own HTTPS host.

### 2. Optional URL conversion worker — Docker/container hosting

You only need this section if you want to run authorized YouTube-link conversions. Deploy the `worker/` directory to a host that supports a long-running Docker service, such as a private container host or a properly configured Render web service.

**Example local Docker build from the repository root:**

```bash
docker build -t audiolift-worker ./worker
```

Set a long, unique, random shared secret and use it **only** on your trusted backend. For example, generate it with `openssl rand -hex 32`; do not paste it into source control.

```bash
# Create a random key in your local shell; do not save or commit it.
export CONVERTER_API_KEY="$(openssl rand -hex 32)"

docker run --rm -p 10000:10000 \
  -e CONVERTER_API_KEY \
  -e PUBLIC_BASE_URL="http://localhost:10000" \
  audiolift-worker
```

Verify the local worker health endpoint at `http://localhost:10000/health`. The worker will not be reachable from Vercel at `localhost`; a deployed worker needs a public **HTTPS** hostname. Give its container a writable temporary directory, and keep it to **one instance**; job state is held in memory.

In your Vercel project's **Settings → Environment Variables**, set these **server-side** variables and redeploy:

```dotenv
CONVERTER_API_BASE_URL=https://your-worker.example.com
```

Add `CONVERTER_API_KEY` separately in the Vercel dashboard using the **same random value** from the worker environment. Never use a placeholder key or commit the value.

The same `CONVERTER_API_KEY` must be configured on the worker. Set `PUBLIC_BASE_URL` on the worker to its own public HTTPS origin. Do **not** use `NEXT_PUBLIC_` for keys. Do **not** commit the real values to GitHub.

Additional optional worker settings:

| Variable | Default | Purpose |
| --- | --- | --- |
| `MAX_DURATION_SECONDS` | `2700` | Maximum video duration (45 minutes) |
| `MAX_SOURCE_BYTES` | `104857600` | Max source download size (100 MiB) |
| `DATA_DIR` | `/tmp/audiolift` (Docker image: `/data`) | Temporary conversion files; must be writable |
| `PORT` | `10000` in Docker image | Worker listening port |

**Before enabling publicly:** Verify an actual permitted video conversion, HTTPS download links, job expiry, quotas, error behavior, and the platform's terms. The bundled worker is a **single-instance prototype**, not a production-ready public conversion service. For public scale, add real user authentication, durable queue/storage, monitoring, resource budgets, stronger anti-abuse controls, and a clear permission policy.

## Project structure

```text
audiolift/
├── app/                 # Next.js app and API routes
│   ├── api/convert/     # Submits jobs to optional worker
│   ├── api/jobs/        # Conversion status proxy
│   ├── api/metadata/    # Safe YouTube preview
│   └── api/status/      # Worker connectivity status
├── lib/                 # URL parsing and worker configuration
├── tests/               # URL validation tests
├── worker/              # Optional FastAPI + FFmpeg worker (Docker)
├── .env.example         # Example of optional worker environment
├── .gitignore           # Ignored secrets, builds and temp files
├── LICENSE              # Apache License, Version 2.0
└── README.md            # Documentation
```

## Troubleshooting

| Problem | What to try |
| --- | --- |
| Link preview loads but conversion button is disabled | No worker configured. Use File mode, or deploy and connect the optional worker. |
| Worker reports an unavailable video | Confirm the video is accessible, not live/restricted, and you have appropriate rights. Automated extraction may be blocked by YouTube. |
| Local conversion fails or browser slows | Try a smaller/shorter file or another modern desktop browser. Close memory-intensive tabs. |
| Can't reach worker from Vercel | Check public HTTPS URL, `CONVERTER_API_KEY`, worker health, host firewall, and deployment logs. |
| Lost a link-conversion job | Worker restarts clear in-memory jobs. The prototype intentionally does not offer durable job history. |

## Contributing

Fork the repository, create a topic branch, and open a pull request describing the change. Include tests for any behavior changes and run `npm run test`, `npm run typecheck`, and `npm run build` where possible. Do not include downloaded media, private credentials, or `.env.local` in pull requests.

Ideas for improvements: browser conversion tests, conversion job persistence, stricter worker authentication, a disk quota, download cleanup, and accessibility audits.

## Roadmap / verification status

- [x] Responsive UI, URL parsing, and YouTube metadata API implemented.
- [x] File conversion code and optional worker API implemented.
- [x] URL validation tests passed.
- [ ] Verify the production web build and perform a real File → MP3 browser smoke test.
- [ ] Publish a GitHub repository and connect it to Vercel.
- [ ] Verify a deployed, authorized YouTube URL → MP3 workflow end to end.
- [ ] Complete production security and scaling work before offering public conversions.

## License

Licensed under the **[Apache License, Version 2.0](LICENSE)** (`Apache-2.0`). You may use, modify, fork and redistribute this application, including for commercial purposes, as long as you meet the license conditions such as preserving required notices and identifying modified files. Third-party dependencies have their own licenses.

AudioLift is an independent project and is **not affiliated with or endorsed by YouTube or Google**. The license to the application source code does **not** grant rights to download or redistribute third-party media.
