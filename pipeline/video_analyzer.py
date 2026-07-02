"""
Video Analyzer — Download + Frame Extraction for Prompt Lab.

Downloads a video from URL, extracts evenly-spaced frames as base64 JPEGs,
and tries to get a transcript via native captions (yt-dlp).

Usage:
    python -m pipeline.video_analyzer --url URL [--num-frames N]

Output (stdout, single JSON line):
    {"frames": [{"base64": "data:image/jpeg;base64,...", "timestamp": "00:02"}...],
     "transcript": "text or empty string",
     "metadata": {"title": "...", "duration": 12.5}}
"""

import argparse
import asyncio
import base64
import json
import os
import re
import shutil
import sys
import tempfile
from pathlib import Path

from pipeline.metadata_optimizer import _find_ffmpeg


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
    if duration <= 10:
        return 8
    elif duration <= 30:
        return 12
    return 15


def _fmt_ts(seconds: float) -> str:
    m = int(seconds) // 60
    s = int(seconds) % 60
    return f"{m:02d}:{s:02d}"


async def _download(video_url: str, output_dir: str) -> tuple[str, str | None, str]:
    """Returns (video_path, subtitle_path|None, title)."""
    import yt_dlp

    ydl_opts = {
        "outtmpl": str(Path(output_dir) / "video.%(ext)s"),
        "quiet": True,
        "no_warnings": True,
        "noprogress": True,
        "format": "bv*[height<=720]+ba/b[height<=720]/b",
        "noplaylist": True,
        "merge_output_format": "mp4",
        "writeautomaticsub": True,
        "writesubtitles": True,
        "subtitlesformat": "vtt",
        "subtitleslangs": ["en", "fr"],
        "socket_timeout": 30,
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

    subtitle_path: str | None = None
    for f in sorted(Path(output_dir).glob("video.*.vtt")):
        subtitle_path = str(f)
        break

    return video_path, subtitle_path, title


def _parse_vtt(vtt_path: str) -> str:
    try:
        content = Path(vtt_path).read_text(encoding="utf-8", errors="ignore")
        seen: set[str] = set()
        texts: list[str] = []
        for line in content.split("\n"):
            line = line.strip()
            if not line or line.startswith("WEBVTT") or "-->" in line or line.isdigit():
                continue
            clean = re.sub(r"<[^>]+>", "", line).strip()
            if clean and clean not in seen and len(clean) > 3:
                seen.add(clean)
                texts.append(clean)
        return " ".join(texts)
    except Exception:
        return ""


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


async def analyze(video_url: str, num_frames: int | None = None) -> dict:
    ffmpeg = _find_ffmpeg()
    if not ffmpeg:
        raise RuntimeError("ffmpeg not found — ensure ffmpeg is installed on the server")

    ffprobe_candidate = Path(ffmpeg).parent / "ffprobe"
    ffprobe = str(ffprobe_candidate) if ffprobe_candidate.exists() else (shutil.which("ffprobe") or "ffprobe")

    work_dir = tempfile.mkdtemp(prefix="vid_analyzer_")
    try:
        print("Downloading video...", file=sys.stderr, flush=True)
        video_path, subtitle_path, title = await _download(video_url, work_dir)
        print(f"Download complete: {video_path}", file=sys.stderr, flush=True)

        duration = await _get_duration(ffprobe, video_path)
        n = num_frames or _auto_frame_count(duration)
        print(f"Duration: {duration:.1f}s", file=sys.stderr, flush=True)

        print(f"Extracting {n} frames ({duration:.1f}s)...", file=sys.stderr, flush=True)
        frames = await _extract_frames(ffmpeg, video_path, duration, n)
        print(f"Frames extracted: {len(frames)}", file=sys.stderr, flush=True)

        transcript = _parse_vtt(subtitle_path) if subtitle_path else ""
        if transcript:
            print(f"Transcript: {len(transcript)} chars", file=sys.stderr, flush=True)

        return {"frames": frames, "transcript": transcript, "metadata": {"title": title, "duration": duration}}
    finally:
        shutil.rmtree(work_dir, ignore_errors=True)


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--url", required=True)
    parser.add_argument("--num-frames", type=int, default=None)
    args = parser.parse_args()

    result = asyncio.run(analyze(args.url, args.num_frames))
    print(json.dumps(result), flush=True)


if __name__ == "__main__":
    main()
