"""Single-instance, zero-cost AudioLift Render experiment.

Only the Vercel preview can create/read jobs using a shared backend API key.
Download capability tokens travel in POST bodies, never query strings or logs.
This worker keeps no durable data and is not designed for public-scale traffic.
"""
from __future__ import annotations

import asyncio
from contextlib import asynccontextmanager, suppress
import hmac
import os
from pathlib import Path
import re
import secrets
import shutil
import tempfile
import time
import uuid
from collections import defaultdict
from urllib.parse import parse_qs, urlparse

import yt_dlp
from fastapi import FastAPI, Header, HTTPException, Request
from fastapi.responses import FileResponse
from pydantic import BaseModel, Field

API_KEY = os.environ.get("CONVERTER_API_KEY", "")
BASE_URL = (os.environ.get("PUBLIC_BASE_URL") or os.environ.get("RENDER_EXTERNAL_URL") or "").rstrip("/")
DATA_DIR = Path(os.environ.get("DATA_DIR", "/tmp/audiolift"))
MAX_DURATION = min(int(os.environ.get("MAX_DURATION_SECONDS", "600")), 600)
MAX_BYTES = min(int(os.environ.get("MAX_SOURCE_BYTES", str(25 * 1024 * 1024))), 25 * 1024 * 1024)
MAX_OUTPUT_BYTES = 30 * 1024 * 1024
MAX_TEMP_BYTES = 80 * 1024 * 1024
RETENTION = 8 * 60
RATE_LIMIT = 2
GLOBAL_RATE_LIMIT = 3
RATE_PERIOD = 60 * 60
MAX_JOBS = 2
ALLOWED_BITRATES = {128, 192, 256, 320}
VIDEO_ID = re.compile(r"^[A-Za-z0-9_-]{11}$")
ALLOWED_YT = {
    "youtube.com", "www.youtube.com", "m.youtube.com", "music.youtube.com",
    "youtube-nocookie.com", "www.youtube-nocookie.com"
}
SHORT_YT = {"youtu.be", "www.youtu.be"}

limiter = asyncio.Semaphore(1)
jobs: dict[str, dict] = {}
requests_by_ip: dict[str, list[float]] = defaultdict(list)
requests_all: list[float] = []


class QuietYDLLogger:
    """Never print upstream yt-dlp details, which can contain signed URLs."""
    def debug(self, message): pass
    def warning(self, message): pass
    def error(self, message): pass


class JobRequest(BaseModel):
    url: str = Field(max_length=2048)
    bitrate: int


def video_id_from_url(value: str) -> str | None:
    try:
        parsed = urlparse(value)
        if parsed.scheme != "https" or parsed.username or parsed.password or parsed.port:
            return None
        host = (parsed.hostname or "").lower()
        parts = [p for p in parsed.path.split("/") if p]
        if host in SHORT_YT:
            candidate = parts[0] if parts else None
        elif host in ALLOWED_YT and parsed.path == "/watch":
            candidate = parse_qs(parsed.query).get("v", [None])[0]
        elif host in ALLOWED_YT and parts and parts[0] in {"shorts", "live", "embed"}:
            candidate = parts[1] if len(parts) > 1 else None
        else:
            return None
        return candidate if candidate and VIDEO_ID.fullmatch(candidate) else None
    except ValueError:
        return None


def require_api_key(value: str | None):
    if not API_KEY or not value or not hmac.compare_digest(value, API_KEY):
        raise HTTPException(401, detail="Unauthorized")


def safe_base_url() -> str:
    """Never construct download destinations from untrusted Host headers."""
    parsed = urlparse(BASE_URL)
    if parsed.scheme == "https" and parsed.hostname and not parsed.username and not parsed.password and not parsed.query and not parsed.fragment:
        return BASE_URL
    if parsed.scheme == "http" and parsed.hostname in {"localhost", "127.0.0.1"}:
        return BASE_URL
    raise HTTPException(503, detail="Download origin is not configured")


def directory_usage() -> int:
    return sum(p.stat().st_size for p in DATA_DIR.glob("job-*/*") if p.is_file())


def clean_expired():
    now = time.monotonic()
    for job_id, job in list(jobs.items()):
        finished = job.get("completed_at")
        # Never delete the working directory of an active conversion.
        if finished is not None and now - finished > RETENTION:
            if job.get("dir"):
                shutil.rmtree(job["dir"], ignore_errors=True)
            jobs.pop(job_id, None)
    for ip, values in list(requests_by_ip.items()):
        current = [t for t in values if now - t < RATE_PERIOD]
        if current:
            requests_by_ip[ip] = current
        else:
            requests_by_ip.pop(ip, None)
    requests_all[:] = [t for t in requests_all if now - t < RATE_PERIOD]


async def expire_loop():
    while True:
        await asyncio.sleep(30)
        clean_expired()


@asynccontextmanager
async def lifespan(_app: FastAPI):
    DATA_DIR.mkdir(parents=True, exist_ok=True)
    # Previous-process jobs cannot be recovered; remove only our own job directories.
    for old_dir in DATA_DIR.glob("job-*"):
        if old_dir.is_dir():
            shutil.rmtree(old_dir, ignore_errors=True)
    cleaner = asyncio.create_task(expire_loop())
    try:
        yield
    finally:
        cleaner.cancel()
        with suppress(asyncio.CancelledError):
            await cleaner


app = FastAPI(title="AudioLift trial worker", lifespan=lifespan, docs_url=None, redoc_url=None, openapi_url=None)


@app.get("/health")
def health():
    return {"ok": True, "worker": "audiolift"}


@app.post("/jobs", status_code=202)
async def start_job(
    body: JobRequest, request: Request,
    x_api_key: str | None = Header(None),
    x_client_ip: str | None = Header(None)
):
    require_api_key(x_api_key)
    clean_expired()
    video_id = video_id_from_url(body.url)
    if not video_id or body.bitrate not in ALLOWED_BITRATES:
        raise HTTPException(400, detail="Invalid video URL or bitrate")

    ip = (x_client_ip or (request.client.host if request.client else "unknown"))[:96]
    now = time.monotonic()
    if len(requests_by_ip[ip]) >= RATE_LIMIT or len(requests_all) >= GLOBAL_RATE_LIMIT:
        raise HTTPException(429, detail="Trial conversion limit reached for this hour")
    if len(jobs) >= MAX_JOBS or any(j["status"] in {"queued", "processing"} for j in jobs.values()):
        raise HTTPException(503, detail="Trial converter is busy; retry later")
    if directory_usage() > MAX_TEMP_BYTES - MAX_BYTES:
        raise HTTPException(507, detail="Trial converter's temporary storage limit reached")

    requests_by_ip[ip].append(now)
    requests_all.append(now)
    job_id = str(uuid.uuid4())
    jobs[job_id] = {
        "status": "queued", "created": now, "completed_at": None, "progress": 0,
        "error": None, "title": None, "filename": None,
        "downloadToken": secrets.token_urlsafe(32), "path": None, "dir": None
    }
    # Always build the exact validated URL; never fetch a caller-controlled host.
    asyncio.create_task(execute_job(job_id, f"https://www.youtube.com/watch?v={video_id}", body.bitrate))
    return {"jobId": job_id, "status": "queued"}


def run_conversion(job_id: str, url: str, bitrate: int):
    job = jobs.get(job_id)
    if not job:
        return
    workdir = Path(tempfile.mkdtemp(prefix="job-", dir=DATA_DIR))
    job["dir"] = str(workdir)
    try:
        common = {
            "quiet": True, "no_warnings": True, "noprogress": True,
            "logger": QuietYDLLogger(), "noplaylist": True,
            "socket_timeout": 15, "retries": 1, "extractor_retries": 1
        }
        with yt_dlp.YoutubeDL({**common, "skip_download": True}) as ydl:
            info = ydl.extract_info(url, download=False)
        if not isinstance(info, dict):
            raise ValueError("Metadata unavailable")
        duration = info.get("duration")
        if info.get("is_live") or info.get("live_status") in {"is_live", "is_upcoming"} or (
            not isinstance(duration, (int, float)) or not 0 < duration <= MAX_DURATION
        ):
            raise ValueError("Unsupported video duration or live stream")
        job["title"] = str(info.get("title") or "AudioLift audio")[:120]
        job["progress"] = 12

        def progress_hook(state):
            if state.get("status") == "downloading":
                amount = state.get("downloaded_bytes") or 0
                total = state.get("total_bytes") or state.get("total_bytes_estimate") or MAX_BYTES
                if amount > MAX_BYTES:
                    raise ValueError("Source size limit")
                job["progress"] = min(80, max(15, int(15 + 65 * amount / max(1, total))))
            elif state.get("status") == "finished":
                job["progress"] = 84

        download = {
            **common, "format": "bestaudio/best",
            "outtmpl": str(workdir / "media.%(ext)s"),
            "max_filesize": MAX_BYTES, "overwrites": False,
            "progress_hooks": [progress_hook],
            "postprocessors": [{
                "key": "FFmpegExtractAudio", "preferredcodec": "mp3",
                "preferredquality": str(bitrate)
            }]
        }
        with yt_dlp.YoutubeDL(download) as ydl:
            exit_status = ydl.download([url])
        if exit_status:
            raise ValueError("Media retrieval failed")
        output = workdir / "media.mp3"
        if not output.is_file() or not 0 < output.stat().st_size <= MAX_OUTPUT_BYTES:
            raise ValueError("Invalid MP3 output")
        job["path"] = str(output)
        job["filename"] = f"audiolift-{job_id[:8]}.mp3"
        job["progress"] = 100
        job["status"] = "completed"
    except Exception as exc:
        # Only the exception class is logged; never the raw exception text or URLs.
        error_type = type(exc).__name__
        if error_type not in {"ValueError", "DownloadError", "PostProcessingError", "OSError"}:
            error_type = "Other"
        print(f"AudioLift trial job failed: {error_type}", flush=True)
        job["error"] = "This video could not be retrieved or converted on the trial worker."
        job["status"] = "failed"
        shutil.rmtree(workdir, ignore_errors=True)
        job["dir"] = None
    finally:
        job["completed_at"] = time.monotonic()


async def execute_job(job_id: str, url: str, bitrate: int):
    async with limiter:
        job = jobs.get(job_id)
        if not job:
            return
        job["status"] = "processing"
        await asyncio.to_thread(run_conversion, job_id, url, bitrate)


@app.get("/jobs/{job_id}")
def get_job(job_id: str, x_api_key: str | None = Header(None)):
    require_api_key(x_api_key)
    clean_expired()
    job = jobs.get(job_id)
    if not job:
        raise HTTPException(404, detail="Job not found or expired")
    result = {k: job.get(k) for k in ("status", "progress", "error", "title", "filename")}
    if job["status"] == "completed":
        origin = safe_base_url()
        # Token is in JSON only. The UI submits it as a form POST body.
        # Never place capability tokens in the URL or in Referer headers.
        result["downloadUrl"] = f"{origin}/downloads/{job_id}"
        result["downloadToken"] = job["downloadToken"]
    return result


@app.post("/downloads/{job_id}")
async def download_post(job_id: str, request: Request):
    clean_expired()
    if not (request.headers.get("content-type") or "").startswith("application/x-www-form-urlencoded"):
        raise HTTPException(415, detail="Expected form submission")
    # Bounded body parsing: never log tokens or accept an unbounded request.
    raw = bytearray()
    async for chunk in request.stream():
        raw.extend(chunk)
        if len(raw) > 512:
            raise HTTPException(413, detail="Request too large")
    try:
        fields = parse_qs(raw.decode("ascii"), keep_blank_values=False)
        received = fields.get("token", [])
    except (UnicodeDecodeError, ValueError):
        received = []
    job = jobs.get(job_id)
    if not job or job.get("status") != "completed" or len(received) != 1 or (
        not hmac.compare_digest(received[0], job["downloadToken"])
    ):
        raise HTTPException(404, detail="Download is unavailable or expired")
    path = job.get("path")
    if not path or not Path(path).is_file():
        raise HTTPException(410, detail="File expired")
    return FileResponse(
        path, media_type="audio/mpeg", filename=job["filename"],
        headers={
            "Cache-Control": "private, no-store",
            "Referrer-Policy": "no-referrer",
            "X-Content-Type-Options": "nosniff"
        }
    )
