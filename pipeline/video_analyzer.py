"""
Video Analyzer — Download/Load + Frame Extraction + Audio Transcription for Prompt Lab.

Two input modes:
  --url URL         Downloads via yt-dlp (YouTube, TikTok, X... — Instagram may be
                     unreliable due to data-center IP blocking, see _download()).
  --file-path PATH  Uses an already-uploaded local video file directly, no download.

In both modes: extracts a generous number of evenly-spaced frames as base64 JPEGs,
and transcribes the actual spoken audio track via Groq's Whisper API (large-v3) —
not just platform captions, which are often absent, low quality, or unavailable
entirely in file-upload mode.

Usage:
    python -m pipeline.video_analyzer --url URL [--num-frames N]
    python -m pipeline.video_analyzer --file-path PATH [--num-frames N]

Output (stdout, single JSON line):
    {"frames": [{"base64": "data:image/jpeg;base64,...", "timestamp": "00:02"}...],
     "transcript": "text or empty string",
     "metadata": {"title": "...", "duration": 12.5}}
"""

import argparse
import asyncio
import base64
import json
import mimetypes
import os
import shutil
import sys
import tempfile
import urllib.error
import urllib.request
import uuid
from pathlib import Path

from pipeline.metadata_optimizer import _find_ffmpeg

GROQ_WHISPER_ENDPOINT = "https://api.groq.com/openai/v1/audio/transcriptions"
GROQ_MODEL = "whisper-large-v3"
MAX_UPLOAD_BYTES = 24 * 1024 * 1024  # stay under Groq's 25MB limit


async def _get_duration(ffprobe_path: str, video_path: str) -> float:
    proc = await asyncio.create_subprocess_exec(
        ffprobe_path,
        "-v", "quiet", "-print_format", "json", "-show_format",
        video_path,
        stdout=asyncio.subprocess.PIPE,
        stderr=asyncio.subprocess.DEVNULL,
    )
    try:
        out, _ = await asyncio.wait_for(proc.communicate(), timeout=30.0)
    except asyncio.TimeoutError:
        proc.kill()
        return 10.0
    try:
        return float(json.loads(out)["format"]["duration"])
    except Exception:
        return 10.0


def _auto_frame_count(duration: float) -> int:
    """Generous frame budget — favors detail over token cost (Sonnet handles it fine)."""
    if duration <= 8:
        return 16
    elif duration <= 20:
        return 28
    elif duration <= 45:
        return 36
    return 40


def _fmt_ts(seconds: float) -> str:
    m = int(seconds) // 60
    s = int(seconds) % 60
    return f"{m:02d}:{s:02d}"


async def _download(video_url: str, output_dir: str) -> tuple[str, str]:
    """Returns (video_path, title). URL mode only."""
    import yt_dlp

    ydl_opts = {
        "outtmpl": str(Path(output_dir) / "video.%(ext)s"),
        "quiet": True,
        "no_warnings": True,
        "noprogress": True,
        "format": "bv*[height<=720]+ba/b[height<=720]/b",
        "noplaylist": True,
        "merge_output_format": "mp4",
        "socket_timeout": 30,
        # Retry policy: Instagram frequently rate-limits/blocks data-center IPs
        # (Railway) regardless of cookies. Retries + realistic headers improve
        # odds without requiring login, though reliability stays imperfect —
        # this is a well-documented, unresolved yt-dlp/Instagram limitation.
        # For unreliable sources, prefer the --file-path upload mode instead.
        "retries": 3,
        "fragment_retries": 3,
        "extractor_retries": 2,
        "http_headers": {
            "User-Agent": (
                "Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) "
                "AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1"
            ),
        },
    }

    cookies_tmp: str | None = None
    ig_cookies = os.environ.get("INSTAGRAM_COOKIES", "").strip()
    if ig_cookies:
        tmp = tempfile.NamedTemporaryFile(mode="w", suffix=".txt", delete=False)
        tmp.write(ig_cookies)
        tmp.close()
        cookies_tmp = tmp.name
        ydl_opts["cookiefile"] = cookies_tmp

    title = "Video"
    try:
        with yt_dlp.YoutubeDL(ydl_opts) as ydl:
            info = ydl.extract_info(video_url, download=True)
            if info:
                title = info.get("title", "Video") or "Video"
    finally:
        if cookies_tmp:
            Path(cookies_tmp).unlink(missing_ok=True)

    video_path: str | None = None
    for ext in ("mp4", "mov", "webm", "mkv"):
        p = Path(output_dir) / f"video.{ext}"
        if p.exists() and p.stat().st_size > 0:
            video_path = str(p)
            break

    if not video_path:
        raise FileNotFoundError(f"Video file not found in {output_dir}")

    return video_path, title


async def _extract_frames(ffmpeg_path: str, video_path: str, duration: float, num_frames: int) -> list[dict]:
    frames_dir = Path(video_path).parent / "frames"
    frames_dir.mkdir(exist_ok=True)

    fps = min(2.0, num_frames / max(duration, 1.0))

    proc = await asyncio.create_subprocess_exec(
        ffmpeg_path,
        "-i", video_path,
        "-vf", f"fps={fps:.4f},scale=512:-2",
        "-q:v", "3",
        str(frames_dir / "frame_%04d.jpg"),
        "-y",
        stdout=asyncio.subprocess.DEVNULL,
        stderr=asyncio.subprocess.DEVNULL,
    )
    try:
        await asyncio.wait_for(proc.communicate(), timeout=60.0)
    except asyncio.TimeoutError:
        proc.kill()
        raise RuntimeError(f"ffmpeg timed out after 60s extracting frames from {video_path}")

    files = sorted(frames_dir.glob("frame_*.jpg"))[:num_frames]
    result = []
    for i, f in enumerate(files):
        if f.stat().st_size < 512:
            continue
        data = base64.b64encode(f.read_bytes()).decode("ascii")
        ts = (i / max(len(files) - 1, 1)) * duration if len(files) > 1 else i / max(fps, 0.001)
        result.append({"base64": f"data:image/jpeg;base64,{data}", "timestamp": _fmt_ts(ts)})
    return result


async def _extract_audio(ffmpeg_path: str, video_path: str, output_dir: str) -> str | None:
    """Extracts mono 16kHz mp3 audio track. Returns path, or None if no audio stream."""
    audio_path = str(Path(output_dir) / "audio.mp3")
    proc = await asyncio.create_subprocess_exec(
        ffmpeg_path,
        "-i", video_path,
        "-vn", "-acodec", "libmp3lame", "-ar", "16000", "-ac", "1", "-b:a", "64k",
        audio_path,
        "-y",
        stdout=asyncio.subprocess.DEVNULL,
        stderr=asyncio.subprocess.DEVNULL,
    )
    try:
        await asyncio.wait_for(proc.communicate(), timeout=30.0)
    except asyncio.TimeoutError:
        proc.kill()
        return None

    p = Path(audio_path)
    if not p.exists() or p.stat().st_size < 1024:
        return None
    return audio_path


def _multipart_body(fields: dict, file_field: str, file_path: str) -> tuple[bytes, str]:
    boundary = uuid.uuid4().hex
    parts: list[bytes] = []
    for key, value in fields.items():
        parts.append(f"--{boundary}\r\n".encode())
        parts.append(f'Content-Disposition: form-data; name="{key}"\r\n\r\n'.encode())
        parts.append(f"{value}\r\n".encode())

    filename = Path(file_path).name
    mime = mimetypes.guess_type(filename)[0] or "audio/mpeg"
    parts.append(f"--{boundary}\r\n".encode())
    parts.append(
        f'Content-Disposition: form-data; name="{file_field}"; filename="{filename}"\r\n'.encode()
    )
    parts.append(f"Content-Type: {mime}\r\n\r\n".encode())
    parts.append(Path(file_path).read_bytes())
    parts.append(b"\r\n")
    parts.append(f"--{boundary}--\r\n".encode())

    return b"".join(parts), boundary


async def _transcribe_audio(audio_path: str, api_key: str) -> str:
    """Calls Groq Whisper large-v3. Splits into <24MB chunks for long audio."""
    size = Path(audio_path).stat().st_size
    if size <= MAX_UPLOAD_BYTES:
        return await _whisper_call(audio_path, api_key)

    # Split into N roughly-equal chunks by duration (stream-copy, no re-encode)
    ffmpeg = _find_ffmpeg()
    n_chunks = (size // MAX_UPLOAD_BYTES) + 1
    ffprobe_candidate = Path(ffmpeg).parent / "ffprobe" if ffmpeg else None
    ffprobe = str(ffprobe_candidate) if ffprobe_candidate and ffprobe_candidate.exists() else "ffprobe"
    total_duration = await _get_duration(ffprobe, audio_path)
    chunk_duration = total_duration / n_chunks

    texts = []
    for i in range(int(n_chunks)):
        chunk_path = str(Path(audio_path).parent / f"audio_chunk_{i}.mp3")
        proc = await asyncio.create_subprocess_exec(
            ffmpeg, "-ss", str(i * chunk_duration), "-i", audio_path,
            "-t", str(chunk_duration), "-c", "copy", chunk_path, "-y",
            stdout=asyncio.subprocess.DEVNULL, stderr=asyncio.subprocess.DEVNULL,
        )
        await asyncio.wait_for(proc.communicate(), timeout=30.0)
        if Path(chunk_path).exists():
            try:
                texts.append(await _whisper_call(chunk_path, api_key))
            except Exception as e:
                print(f"Whisper chunk {i} failed: {e}", file=sys.stderr, flush=True)

    return " ".join(t for t in texts if t)


async def _whisper_call(audio_path: str, api_key: str, max_attempts: int = 4) -> str:
    fields = {"model": GROQ_MODEL, "response_format": "verbose_json", "temperature": "0"}
    body, boundary = _multipart_body(fields, "file", audio_path)

    def _do_request() -> str:
        req = urllib.request.Request(
            GROQ_WHISPER_ENDPOINT,
            data=body,
            headers={
                "Authorization": f"Bearer {api_key}",
                "Content-Type": f"multipart/form-data; boundary={boundary}",
            },
            method="POST",
        )
        with urllib.request.urlopen(req, timeout=120) as resp:
            data = json.loads(resp.read())
        return data.get("text", "") or ""

    delay = 2.0
    last_err: Exception | None = None
    for attempt in range(max_attempts):
        try:
            return await asyncio.to_thread(_do_request)
        except urllib.error.HTTPError as e:
            last_err = e
            if 400 <= e.code < 500 and e.code != 429:
                raise  # client error, no point retrying
            print(f"Groq Whisper HTTP {e.code} — retry {attempt + 1}/{max_attempts} in {delay}s",
                  file=sys.stderr, flush=True)
        except Exception as e:
            last_err = e
            print(f"Groq Whisper error — retry {attempt + 1}/{max_attempts} in {delay}s: {e}",
                  file=sys.stderr, flush=True)
        await asyncio.sleep(delay)
        delay *= 2

    raise RuntimeError(f"Groq Whisper failed after {max_attempts} attempts: {last_err}")


async def analyze(
    video_url: str | None,
    file_path: str | None,
    num_frames: int | None,
    groq_api_key: str | None,
) -> dict:
    ffmpeg = _find_ffmpeg()
    if not ffmpeg:
        raise RuntimeError("ffmpeg not found — ensure ffmpeg is installed on the server")

    ffprobe_candidate = Path(ffmpeg).parent / "ffprobe"
    ffprobe = str(ffprobe_candidate) if ffprobe_candidate.exists() else (shutil.which("ffprobe") or "ffprobe")

    work_dir = tempfile.mkdtemp(prefix="vid_analyzer_")
    try:
        if file_path:
            print(f"Using uploaded file: {file_path}", file=sys.stderr, flush=True)
            video_path = file_path
            title = Path(file_path).stem
        else:
            print("Downloading video...", file=sys.stderr, flush=True)
            video_path, title = await _download(video_url, work_dir)
            print(f"Download complete: {video_path}", file=sys.stderr, flush=True)

        duration = await _get_duration(ffprobe, video_path)
        n = num_frames or _auto_frame_count(duration)
        print(f"Duration: {duration:.1f}s", file=sys.stderr, flush=True)

        print(f"Extracting {n} frames...", file=sys.stderr, flush=True)
        frames = await _extract_frames(ffmpeg, video_path, duration, n)
        print(f"Frames extracted: {len(frames)}", file=sys.stderr, flush=True)

        transcript = ""
        if groq_api_key:
            print("Extracting audio...", file=sys.stderr, flush=True)
            audio_path = await _extract_audio(ffmpeg, video_path, work_dir)
            if audio_path:
                print("Transcribing audio (Groq Whisper)...", file=sys.stderr, flush=True)
                try:
                    transcript = await _transcribe_audio(audio_path, groq_api_key)
                    print(f"Transcript: {len(transcript)} chars", file=sys.stderr, flush=True)
                except Exception as e:
                    print(f"Transcription failed, continuing without: {e}", file=sys.stderr, flush=True)
            else:
                print("No audio stream found, skipping transcription", file=sys.stderr, flush=True)
        else:
            print("No Groq API key — skipping audio transcription", file=sys.stderr, flush=True)

        return {"frames": frames, "transcript": transcript, "metadata": {"title": title, "duration": duration}}
    finally:
        shutil.rmtree(work_dir, ignore_errors=True)


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--url", default=None)
    parser.add_argument("--file-path", default=None)
    parser.add_argument("--num-frames", type=int, default=None)
    args = parser.parse_args()

    if not args.url and not args.file_path:
        raise SystemExit("Either --url or --file-path is required")

    groq_api_key = os.environ.get("GROQ_API_KEY", "").strip() or None

    result = asyncio.run(analyze(args.url, args.file_path, args.num_frames, groq_api_key))
    print(json.dumps(result), flush=True)


if __name__ == "__main__":
    main()
