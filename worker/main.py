"""AudioLift optional single-instance worker.

Accepts authorized jobs from Vercel, converts with yt-dlp + FFmpeg, and serves
short-lived downloads. Deploy in a controlled environment with network egress.
Designed for a portfolio MVP; use a persistent queue + shared object storage
before scaling beyond one worker instance.
"""
from __future__ import annotations

import asyncio
import hmac
import os
import re
import secrets
import shutil
import tempfile
import time
import uuid
from collections import defaultdict
from pathlib import Path
from urllib.parse import parse_qs, urlparse

import yt_dlp
from fastapi import FastAPI, Header, HTTPException, Request
from fastapi.responses import FileResponse
from pydantic import BaseModel, Field

API_KEY = os.environ.get("CONVERTER_API_KEY", "")
BASE_URL = os.environ.get("PUBLIC_BASE_URL", "").rstrip("/")
DATA_DIR = Path(os.environ.get("DATA_DIR", "/tmp/audiolift"))
MAX_DURATION = int(os.environ.get("MAX_DURATION_SECONDS", "2700"))
MAX_BYTES = int(os.environ.get("MAX_SOURCE_BYTES", str(100 * 1024 * 1024)))
RETENTION = 20 * 60
RATE_LIMIT = 3
RATE_PERIOD = 60 * 60
ALLOWED_BITRATES = {128, 192, 256, 320}
VIDEO_ID = re.compile(r"^[A-Za-z0-9_-]{11}$")
ALLOWED_YT = {"youtube.com", "www.youtube.com", "m.youtube.com", "music.youtube.com", "youtube-nocookie.com", "www.youtube-nocookie.com"}
SHORT_YT = {"youtu.be", "www.youtu.be"}

app = FastAPI(title="AudioLift conversion worker", docs_url=None, redoc_url=None, openapi_url=None)
limiter = asyncio.Semaphore(1)
jobs: dict[str, dict] = {}
requests_by_ip: dict[str, list[float]] = defaultdict(list)

class JobRequest(BaseModel):
    url: str = Field(max_length=2048)
    bitrate: int
    permission: bool


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


def clean_expired():
    now = time.monotonic()
    for job_id, job in list(jobs.items()):
        if now - job["created"] > RETENTION:
            path = job.get("dir")
            if path: shutil.rmtree(path, ignore_errors=True)
            jobs.pop(job_id, None)
    for ip, timestamps in list(requests_by_ip.items()):
        kept = [t for t in timestamps if now - t < RATE_PERIOD]
        if kept: requests_by_ip[ip] = kept
        else: requests_by_ip.pop(ip, None)


@app.get("/health")
def health():
    return {"ok": True, "worker": "audiolift"}


@app.post("/jobs", status_code=202)
async def start_job(body: JobRequest, request: Request, x_api_key: str | None = Header(None), x_client_ip: str | None = Header(None)):
    require_api_key(x_api_key)
    clean_expired()
    id_ = video_id_from_url(body.url)
    if not id_ or body.bitrate not in ALLOWED_BITRATES or body.permission is not True:
        raise HTTPException(400, detail="Invalid input or missing media permission")
    ip = (x_client_ip or request.client.host if request.client else "unknown")[:96]
    now = time.monotonic()
    if len(requests_by_ip[ip]) >= RATE_LIMIT:
        raise HTTPException(429, detail="Too many conversions. Try again later.")
    active = sum(1 for j in jobs.values() if j["status"] in {"queued", "processing"})
    if active >= 3:
        raise HTTPException(503, detail="Converter is at capacity. Try again shortly.")
    requests_by_ip[ip].append(now)
    job_id = str(uuid.uuid4())
    jobs[job_id] = {
        "status": "queued", "created": now, "progress": 0, "error": None,
        "title": None, "filename": None, "downloadToken": secrets.token_urlsafe(32), "path": None, "dir": None
    }
    asyncio.create_task(execute_job(job_id, f"https://www.youtube.com/watch?v={id_}", body.bitrate))
    return {"jobId": job_id, "status": "queued"}


def run_conversion(job_id: str, url: str, bitrate: int):
    job = jobs.get(job_id)
    if not job: return
    DATA_DIR.mkdir(parents=True, exist_ok=True)
    workdir = Path(tempfile.mkdtemp(prefix="job-", dir=DATA_DIR))
    job["dir"] = str(workdir)
    try:
        opts = {
            "quiet": True, "no_warnings": True, "noplaylist": True,
            "skip_download": True, "socket_timeout": 15,
            "retries": 2, "extractor_retries": 2,
        }
        with yt_dlp.YoutubeDL(opts) as ydl:
            info = ydl.extract_info(url, download=False)
        if not isinstance(info, dict):
            raise ValueError("Video metadata was unavailable")
        duration = info.get("duration")
        if info.get("is_live") or duration is None or duration > MAX_DURATION:
            raise ValueError("Only non-live videos up to 45 minutes are supported")
        job["title"] = str(info.get("title") or "AudioLift audio")[:160]
        job["progress"] = 12

        def hook(state):
            if state.get("status") == "downloading":
                amount = state.get("downloaded_bytes") or 0
                total = state.get("total_bytes") or state.get("total_bytes_estimate") or MAX_BYTES
                if amount > MAX_BYTES:
                    raise ValueError("Source exceeds the size limit")
                job["progress"] = min(78, max(15, int(15 + 63 * amount / max(1, total))))
            elif state.get("status") == "finished":
                job["progress"] = 82

        download_opts = {
            "quiet": True, "no_warnings": True, "noplaylist": True,
            "format": "bestaudio/best", "outtmpl": str(workdir / "media.%(ext)s"),
            "socket_timeout": 15, "retries": 2, "extractor_retries": 2,
            "max_filesize": MAX_BYTES, "overwrites": False,
            "progress_hooks": [hook],
            "postprocessors": [{ "key": "FFmpegExtractAudio", "preferredcodec": "mp3", "preferredquality": str(bitrate) }],
        }
        with yt_dlp.YoutubeDL(download_opts) as ydl:
            exit_status = ydl.download([url])
        if exit_status:
            raise ValueError("Download service could not retrieve the source")
        output = workdir / "media.mp3"
        if not output.is_file() or output.stat().st_size == 0:
            raise ValueError("MP3 output not found")
        job["path"] = str(output)
        job["filename"] = f"audiolift-{job_id[:8]}.mp3"
        job["progress"] = 100
        job["status"] = "completed"
    except Exception:
        # Don't expose raw yt-dlp exceptions (may include private details or URLs).
        job["error"] = "This video could not be downloaded or converted. It may be restricted or unavailable."
        job["status"] = "failed"
        shutil.rmtree(workdir, ignore_errors=True)


async def execute_job(job_id: str, url: str, bitrate: int):
    async with limiter:
        job = jobs.get(job_id)
        if not job: return
        job["status"] = "processing"
        await asyncio.to_thread(run_conversion, job_id, url, bitrate)


@app.get("/jobs/{job_id}")
def get_job(job_id: str, request: Request, x_api_key: str | None = Header(None)):
    require_api_key(x_api_key)
    clean_expired()
    job = jobs.get(job_id)
    if not job: raise HTTPException(404, detail="Job not found")
    result = {k: job.get(k) for k in ("status", "progress", "error", "title", "filename")}
    if job["status"] == "completed":
        origin = BASE_URL or str(request.base_url).rstrip("/")
        result["downloadUrl"] = f"{origin}/downloads/{job_id}?token={job['downloadToken']}"
    return result


@app.get("/downloads/{job_id}")
def get_download(job_id: str, token: str = ""):
    clean_expired()
    job = jobs.get(job_id)
    if not job or job.get("status") != "completed" or not token or not hmac.compare_digest(token, job["downloadToken"]):
        raise HTTPException(404, detail="Download is unavailable or expired")
    path = job.get("path")
    if not path or not Path(path).is_file():
        raise HTTPException(410, detail="File expired")
    return FileResponse(path, media_type="audio/mpeg", filename=job["filename"], headers={"Cache-Control": "private, no-store"})
