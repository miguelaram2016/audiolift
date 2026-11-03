"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { ArrowDownToLine, ArrowLeftRight, ArrowRight, AudioLines, Check, CheckCircle2, CircleHelp, ClipboardPaste, CloudOff, ExternalLink, FileAudio2, FileUp, Gauge, Headphones, Link2, LoaderCircle, Music2, Play, ShieldCheck, Sparkles, Waves, X } from "lucide-react";
import { getYoutubeVideoId } from "@/lib/youtube";

type Mode = "link" | "file";
type Preview = { videoId: string; title: string; author: string; thumbnail: string; videoUrl: string };
type Stage = "idle" | "working" | "ready" | "error";
const bitrates = ["128", "192", "256", "320"] as const;
const MAX_FILE_BYTES = 100 * 1024 * 1024;

function safeFilename(name: string) {
  return (name.replace(/\.[^.]+$/, "").replace(/[^a-zA-Z0-9 _()-]+/g, "").trim().slice(0, 90) || "audiolift") + ".mp3";
}

export default function Home() {
  const [mode, setMode] = useState<Mode>("link");
  const [url, setUrl] = useState("");
  const [preview, setPreview] = useState<Preview | null>(null);
  const [previewing, setPreviewing] = useState(false);
  const [bitrate, setBitrate] = useState<(typeof bitrates)[number]>("192");
  const [permission, setPermission] = useState(false);
  const [file, setFile] = useState<File | null>(null);
  const [stage, setStage] = useState<Stage>("idle");
  const [progress, setProgress] = useState(0);
  const [error, setError] = useState("");
  const [downloadHref, setDownloadHref] = useState("");
  const [fileName, setFileName] = useState("audiolift.mp3");
  const [jobId, setJobId] = useState<string | null>(null);
  const [workerConnected, setWorkerConnected] = useState<boolean | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const objectUrlRef = useRef<string | null>(null);
  const videoId = getYoutubeVideoId(url);

  const resetResult = useCallback(() => {
    setError(""); setStage("idle"); setProgress(0); setDownloadHref(""); setJobId(null);
    if (objectUrlRef.current) { URL.revokeObjectURL(objectUrlRef.current); objectUrlRef.current = null; }
  }, []);

  useEffect(() => {
    fetch("/api/status").then(r => r.json()).then(x => setWorkerConnected(Boolean(x.linkConversionAvailable))).catch(() => setWorkerConnected(false));
    return () => { if (objectUrlRef.current) URL.revokeObjectURL(objectUrlRef.current); };
  }, []);

  useEffect(() => {
    if (!videoId || mode !== "link") { setPreview(null); setPreviewing(false); return; }
    let cancelled = false;
    setPreview(null); setPreviewing(true);
    const timer = setTimeout(async () => {
      try {
        const res = await fetch(`/api/metadata?url=${encodeURIComponent(url.trim())}`);
        if (!res.ok) throw new Error("Preview unavailable");
        const data = await res.json();
        if (!cancelled) setPreview(data);
      } catch {
        if (!cancelled) setPreview({ videoId, title: "YouTube video", author: "Preview unavailable", thumbnail: `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg`, videoUrl: `https://www.youtube.com/watch?v=${videoId}` });
      } finally { if (!cancelled) setPreviewing(false); }
    }, 350);
    return () => { cancelled = true; clearTimeout(timer); };
  }, [videoId, url, mode]);

  useEffect(() => {
    if (!jobId) return;
    let alive = true;
    let timer: ReturnType<typeof setTimeout> | undefined;
    async function poll() {
      try {
        const res = await fetch(`/api/jobs/${jobId}`, { cache: "no-store" });
        if (!res.ok) throw new Error("Unable to check conversion status.");
        const data = await res.json() as { status: string; progress?: number; downloadUrl?: string; filename?: string; error?: string };
        if (!alive) return;
        setProgress(Math.min(95, Math.max(0, data.progress || 0)));
        if (data.status === "completed" && data.downloadUrl) {
          setDownloadHref(data.downloadUrl); setFileName(data.filename || "audiolift.mp3"); setProgress(100); setStage("ready"); setJobId(null); return;
        }
        if (data.status === "failed") throw new Error(data.error || "Could not convert this video.");
        timer = setTimeout(poll, 1700);
      } catch (err) {
        if (!alive) return;
        setError(err instanceof Error ? err.message : "Conversion failed."); setStage("error"); setJobId(null);
      }
    }
    timer = setTimeout(poll, 900);
    return () => { alive = false; if (timer) clearTimeout(timer); };
  }, [jobId]);

  const changeMode = (next: Mode) => { resetResult(); setMode(next); };
  const useClipboard = async () => {
    try { const text = await navigator.clipboard.readText(); setUrl(text); resetResult(); }
    catch { setError("Paste a link using your keyboard instead."); setStage("error"); }
  };
  const encodeAudio = async (sourceData: Blob, originalName: string, isLink: boolean) => {
    if (sourceData.size > MAX_FILE_BYTES) throw new Error("Source media is too large for in-browser conversion.");
    const [{ FFmpeg }, { fetchFile, toBlobURL }] = await Promise.all([import("@ffmpeg/ffmpeg"), import("@ffmpeg/util")]);
    const ffmpeg = new FFmpeg();
    try {
      ffmpeg.on("progress", ({ progress: value }) => {
        setProgress(Math.min(95, Math.round((isLink ? 50 : 0) + value * (isLink ? 45 : 95))));
      });
      const base = "https://unpkg.com/@ffmpeg/core@0.12.10/dist/umd";
      await ffmpeg.load({
        coreURL: await toBlobURL(`${base}/ffmpeg-core.js`, "text/javascript"),
        wasmURL: await toBlobURL(`${base}/ffmpeg-core.wasm`, "application/wasm")
      });
      const ext = (originalName.split(".").pop() || "bin").replace(/[^a-z0-9]/gi, "").slice(0, 8) || "bin";
      const source = `source.${ext}`;
      await ffmpeg.writeFile(source, await fetchFile(sourceData));
      const status = await ffmpeg.exec(["-i", source, "-vn", "-codec:a", "libmp3lame", "-b:a", `${bitrate}k`, "output.mp3"]);
      if (status !== 0) throw new Error("This audio could not be encoded as MP3.");
      const result = await ffmpeg.readFile("output.mp3");
      if (!(result instanceof Uint8Array)) throw new Error("Unexpected encoder output.");
      const bytes = new Uint8Array(result.byteLength); bytes.set(result);
      const blob = new Blob([bytes], { type: "audio/mpeg" });
      if (!blob.size) throw new Error("No MP3 output was generated.");
      const href = URL.createObjectURL(blob);
      objectUrlRef.current = href;
      setDownloadHref(href);
      setFileName(safeFilename(originalName));
      setProgress(100);
      setStage("ready");
    } finally {
      ffmpeg.terminate();
    }
  };
  const convertLink = async () => {
    if (!videoId || !permission) return;
    resetResult(); setStage("working"); setProgress(5);
    try {
      const res = await fetch("/api/audio-source", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ url, permission: true })
      });
      if (!res.ok) {
        const data = await res.json().catch(() => null) as { error?: string } | null;
        throw new Error(data?.error || "Could not retrieve audio from this link.");
      }
      const reader = res.body?.getReader();
      if (!reader) throw new Error("Your browser does not support streaming downloads.");
      const chunks: ArrayBuffer[] = [];
      let received = 0;
      const maxBytes = 25 * 1024 * 1024;
      try {
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          received += value.byteLength;
          if (received > maxBytes) throw new Error("Source audio exceeded the free 25 MB limit.");
          const bytes = new Uint8Array(value.byteLength); bytes.set(value);
          chunks.push(bytes.buffer);
          setProgress(Math.min(48, 10 + Math.round(received / maxBytes * 38)));
        }
      } catch (err) {
        await reader.cancel().catch(() => {});
        throw err;
      }
      if (!received) throw new Error("The source did not return audio.");
      setProgress(50);
      await encodeAudio(new Blob(chunks), `youtube-${videoId}.bin`, true);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Link conversion failed.");
      setStage("error"); setProgress(0);
    }
  };
  const convertFile = async () => {
    if (!file) return;
    resetResult(); setStage("working"); setProgress(1);
    try {
      if (file.size > MAX_FILE_BYTES) throw new Error("Choose a file smaller than 100 MB for in-browser conversion.");
      await encodeAudio(file, file.name, false);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Browser conversion failed.");
      setStage("error"); setProgress(0);
    }
  };

  return (
    <div className="app-shell">
      <div className="ambient ambient-one" /><div className="ambient ambient-two" />
      <header className="site-header wrap">
        <a href="/" className="brand" aria-label="AudioLift home"><span className="brand-mark"><AudioLines size={22} strokeWidth={2.6}/></span><span>audio<span className="brand-heavy">lift</span><span className="brand-dot">.</span></span></a>
        <div className="header-actions"><span className="status"><span className="status-pulse"/> BUILT FOR THE LOVE OF SOUND</span><a className="header-link" href="#how-it-works">How it works <ArrowRight size={14}/></a></div>
      </header>

      <main className="wrap main-wrap">
        <section className="hero">
          <div className="hero-copy">
            <div className="eyebrow"><Sparkles size={14}/> A BETTER WAY TO SAVE SOUND <span className="eyebrow-line"/></div>
            <h1>Good audio.<br/><span>Anywhere.</span></h1>
            <p>Make your own media library sound incredible. Convert files to MP3 in your browser or convert permitted YouTube audio links without an account.</p>
            <div className="hero-details"><span><CheckCircle2 size={16}/> No account required</span><span><ShieldCheck size={16}/> Local file conversion</span></div>
          </div>
          <div className="hero-art" aria-hidden="true"><div className="record-orbit orbit-outer"><div className="record-orbit orbit-inner"><div className="record-disc"><div className="disc-glare"/><div className="disc-center"><Waves size={35}/></div></div></div></div><div className="floating-note note-one"><Music2 size={20}/></div><div className="floating-note note-two"><Headphones size={18}/></div><div className="art-caption">PRESS PLAY ON POSSIBILITY <span>↗</span></div></div>
        </section>

        <section className="workspace" aria-label="Audio converter">
          <div className="workspace-heading"><div><div className="tiny-label">THE CONVERSION STUDIO</div><h2>From source to sound.</h2></div><span className="workspace-badge"><span/> AUDIO WORKSPACE</span></div>
          <div className="workspace-content">
            <div className="source-side">
              <div className="mode-tabs" role="tablist" aria-label="Choose source type"><button role="tab" aria-selected={mode === "link"} className={mode === "link" ? "active" : ""} onClick={() => changeMode("link")}><Link2 size={17}/> YouTube link</button><button role="tab" aria-selected={mode === "file"} className={mode === "file" ? "active" : ""} onClick={() => changeMode("file")}><FileUp size={17}/> Local file <span className="live-pill">LIVE</span></button></div>
              {mode === "link" ? <>
                <label className="field-label" htmlFor="url-input">PASTE YOUR YOUTUBE URL</label>
                <div className={`url-field ${url && !videoId ? "invalid" : ""}`}><Link2 size={18}/><input id="url-input" value={url} onChange={e => { setUrl(e.target.value); resetResult(); }} placeholder="https://youtube.com/watch?v=..." autoCapitalize="off" autoComplete="off" spellCheck={false}/><button type="button" onClick={useClipboard} aria-label="Paste from clipboard"><ClipboardPaste size={18}/></button></div>
                {url && !videoId ? <p className="input-hint error-color">That doesn&apos;t look like a supported YouTube video link.</p> : <p className="input-hint">Supports youtube.com, youtu.be, Shorts and Live links.</p>}
                <div className="preview-panel"><span className="field-label preview-caption">VIDEO PREVIEW</span>{preview ? <div className="preview-inner"><div className="video-thumb"><img src={preview.thumbnail} alt="YouTube video thumbnail"/><Play size={20} fill="currentColor"/></div><div className="preview-meta"><strong title={preview.title}>{preview.title}</strong><span>{preview.author}</span><a href={preview.videoUrl} target="_blank" rel="noopener noreferrer">View on YouTube <ExternalLink size={12}/></a></div><CheckCircle2 size={19} className="preview-check"/></div> : <div className="preview-empty"><span className="placeholder-icon">{previewing ? <LoaderCircle size={21} className="spin"/> : <Play size={20} fill="currentColor"/>}</span><div><strong>{previewing ? "Finding your video..." : "Your video will appear here"}</strong><span>Paste a valid link to see its details</span></div></div>}</div>
                <label className="permission"><input type="checkbox" checked={permission} onChange={e => setPermission(e.target.checked)}/><span>I own this media or have permission to download and convert it.</span></label>
              </> : <>
                <label className="field-label" htmlFor="media-file">SELECT YOUR AUDIO OR VIDEO FILE</label>
                <input ref={inputRef} id="media-file" className="sr-only" type="file" accept="audio/*,video/*,.m4a,.mp4,.mov,.webm,.mkv,.wav,.ogg,.flac" onChange={e => {setFile(e.target.files?.[0] || null); resetResult(); }}/>
                <button className={`upload-zone ${file ? "with-file" : ""}`} onClick={() => inputRef.current?.click()} type="button"><span className="upload-icon">{file ? <FileAudio2 size={24}/> : <FileUp size={24}/>}</span><strong>{file ? file.name : "Choose a file to convert"}</strong><span>{file ? `${(file.size / 1024 / 1024).toFixed(1)} MB · Click to change file` : "MP4, MOV, WAV, WEBM, FLAC and more"}</span><span className="upload-link">Browse files <ArrowRight size={14}/></span></button>
                <div className="local-note"><ShieldCheck size={17}/><div><strong>Private by design</strong><p>Your file stays on your device. Audio conversion runs in your browser using WebAssembly. 100 MB file limit.</p></div></div>
              </>}
            </div>
            <div className="settings-side">
              <div className="settings-header"><div className="settings-icon"><Gauge size={19}/></div><div><span className="tiny-label">PERSONALIZE YOUR EXPORT</span><h3>Output settings</h3></div></div>
              <label className="field-label" htmlFor="format-value">FILE FORMAT</label><div className="format-value" id="format-value"><div><Music2 size={18}/> MP3 <span>Universal audio</span></div><span className="format-extension">.mp3</span></div>
              <div className="quality-head"><label className="field-label">AUDIO QUALITY</label><span>{bitrate} kbps</span></div>
              <div className="quality-options" role="group" aria-label="MP3 bitrate">{bitrates.map(value => <button type="button" aria-pressed={bitrate === value} key={value} className={bitrate === value ? "selected" : ""} onClick={() => {setBitrate(value); resetResult();}}>{value}{bitrate === value ? <Check size={12}/> : null}</button>)}</div>
              <div className="quality-scale"><span>SMALLER FILE</span><span>HIGHER QUALITY</span></div>
              <div className="settings-divider"/>
              <div className="conversion-info"><div className="info-icon">{mode === "file" ? <ShieldCheck size={18}/> : <CloudOff size={18}/>}</div><div><strong>{mode === "file" ? "On-device processing" : workerConnected ? "Free conversion preview" : "Converter unavailable"}</strong><span>{mode === "file" ? "Nothing is uploaded to a server." : workerConnected ? "Authorized requests are processed by a separate audio worker." : "Link-to-MP3 download requires the processing service, which isn't connected yet."}</span></div></div>
              {stage === "working" ? <div className="progress-box" role="status" aria-live="polite"><div className="progress-title"><span><LoaderCircle size={16} className="spin"/> {mode === "file" ? "Encoding audio" : "Preparing audio"}</span><strong>{progress}%</strong></div><div className="progress-track"><span style={{width: `${progress}%`}}/></div><small>Keep this tab open until the conversion finishes.</small></div> : null}
              {stage === "error" && error ? <div className="alert-error" role="alert"><CircleHelp size={17}/><span>{error}</span><button onClick={() => setError("")} aria-label="Dismiss message"><X size={14}/></button></div> : null}
              {stage === "ready" && downloadHref ? <a className="primary-button ready-button" href={downloadHref} download={fileName} target={downloadHref.startsWith("blob:") ? undefined : "_blank"} rel="noopener noreferrer"><ArrowDownToLine size={20}/> Download {fileName}</a> : <button className="primary-button" onClick={mode === "link" ? convertLink : convertFile} disabled={stage === "working" || (mode === "link" ? !videoId || !permission || !workerConnected : !file)}>{stage === "working" ? <><LoaderCircle size={19} className="spin"/> Converting...</> : <><ArrowDownToLine size={19}/> {mode === "file" ? "Convert to MP3" : "Convert link to MP3"}<ArrowRight size={18} className="button-arrow"/></>}</button>}
              <div className="button-note"><ShieldCheck size={13}/>{mode === "file" ? "Files never leave your browser" : !workerConnected ? "Link download is temporarily unavailable" : "10-minute limit · Own media or permitted downloads only"}</div>
            </div>
          </div>
        </section>

        <section className="benefits" id="how-it-works"><div className="benefits-title"><span className="tiny-label">WHY AUDIOLIFT?</span><h2>Nothing between you<br/>and your audio.</h2></div><div className="benefit"><span className="benefit-num">01</span><div className="benefit-icon"><ArrowLeftRight size={20}/></div><h3>Simple by design</h3><p>Clean inputs, sensible defaults, and a download flow that makes sense.</p></div><div className="benefit"><span className="benefit-num">02</span><div className="benefit-icon"><Headphones size={20}/></div><h3>Sound your way</h3><p>Choose the bitrate that fits your needs, from compact to high quality.</p></div><div className="benefit"><span className="benefit-num">03</span><div className="benefit-icon"><ShieldCheck size={20}/></div><h3>Your files stay yours</h3><p>Local conversion happens in the browser, without an account or server upload.</p></div></section>
      </main>
      <footer className="footer wrap"><div className="footer-logo"><AudioLines size={18}/> audiolift<span>.</span></div><span>Made for makers, creators & curious ears.</span><span>Convert only content you have rights to use. <a href="https://www.youtube.com/t/terms" target="_blank" rel="noopener noreferrer">YouTube terms ↗</a></span></footer>
    </div>
  );
}
