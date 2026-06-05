# backend/app.py — Pinealon v2: Search + Stream + Async Convert + Cache
from flask import Flask, request, jsonify, send_file, Response
from flask_cors import CORS
import os
import subprocess
import uuid
from pathlib import Path
import yt_dlp
import logging
import threading
import requests as req_lib
from datetime import datetime
import json
import math
import numpy as np

app = Flask(__name__)
CORS(app, resources={r"/api/*": {"origins": "*"}})

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

# ---------------------------------------------------------------------------
# Config
# ---------------------------------------------------------------------------
DOWNLOAD_DIR = Path("./downloads")
TEMP_DIR = Path("./temp")
DOWNLOAD_DIR.mkdir(exist_ok=True)
TEMP_DIR.mkdir(exist_ok=True)

RUBBERBAND_PATH = r"C:\rubberband\rubberband-4.0.0-gpl-executable-windows\rubberband.exe"

# In-memory job store  {job_id: {...}}
processing_jobs = {}

# ---------------------------------------------------------------------------
# Cache helpers
# ---------------------------------------------------------------------------

def get_cached_filename(video_id: str) -> str | None:
    """Return the filename of a cached 432Hz file, or None."""
    for ext in ["mp3", "wav"]:
        fname = f"{video_id}_432hz.{ext}"
        if (DOWNLOAD_DIR / fname).exists():
            return fname
    return None


def is_cached(video_id: str) -> bool:
    return get_cached_filename(video_id) is not None


# ---------------------------------------------------------------------------
# Core 432Hz processor
# ---------------------------------------------------------------------------

class Enhanced432HzProcessor:
    def __init__(self):
        self.ydl_opts = {
            "format": "bestaudio/best",
            "extractaudio": True,
            "audioformat": "wav",
            "outtmpl": str(TEMP_DIR / "%(id)s.%(ext)s"),
            "quiet": True,
            "no_warnings": True,
            "legacyserverconnect": True,
            "source_address": "0.0.0.0",
            "http_headers": {"User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"}
        }
        self.available_methods = self._detect_available_methods()
        logger.info(f"Available conversion methods: {', '.join(self.available_methods)}")

    def _detect_available_methods(self):
        methods = ["ffmpeg"]
        try:
            result = subprocess.run([RUBBERBAND_PATH, "--help"], capture_output=True, timeout=10)
            if result.returncode in (0, 1, 2):
                methods.append("rubberband")
        except (FileNotFoundError, subprocess.TimeoutExpired):
            pass
        try:
            import librosa  # noqa: F401
            import soundfile  # noqa: F401
            methods.append("librosa")
        except ImportError:
            pass
        return methods

    def get_video_info(self, video_id: str) -> dict:
        with yt_dlp.YoutubeDL(self.ydl_opts) as ydl:
            url = f"https://www.youtube.com/watch?v={video_id}"
            info = ydl.extract_info(url, download=False)
            return {
                "title": info.get("title", "Unknown Title"),
                "uploader": info.get("uploader", "Unknown Artist"),
                "channel": info.get("channel", "Unknown Channel"),
                "duration": info.get("duration", 0),
                "thumbnail": info.get("thumbnail", ""),
                "description": info.get("description", ""),
                "upload_date": info.get("upload_date", ""),
                "view_count": info.get("view_count", 0),
            }

    def get_stream_url(self, video_id: str) -> str:
        """Return a direct audio stream URL (no download)."""
        ydl_opts = {
            "format": "bestaudio/best",
            "quiet": True,
            "no_warnings": True,
            "legacyserverconnect": True,
            "source_address": "0.0.0.0",
            "http_headers": {"User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"}
        }
        with yt_dlp.YoutubeDL(ydl_opts) as ydl:
            info = ydl.extract_info(
                f"https://www.youtube.com/watch?v={video_id}", download=False
            )
            # For dash/hls formats, url may be in requested_formats
            if "url" in info:
                return info["url"]
            if info.get("requested_formats"):
                return info["requested_formats"][0]["url"]
            raise Exception("No stream URL found")

    def download_audio(self, video_id: str) -> str:
        with yt_dlp.YoutubeDL(self.ydl_opts) as ydl:
            url = f"https://www.youtube.com/watch?v={video_id}"
            ydl.download([url])
        for ext in ["wav", "webm", "m4a", "mp3", "opus"]:
            fp = TEMP_DIR / f"{video_id}.{ext}"
            if fp.exists():
                return str(fp)
        raise Exception("Downloaded file not found")

    # ---- tuning detection ----

    def _detect_tuning_quick(self, audio_file: str) -> dict:
        try:
            import librosa
            from scipy.fft import rfft, rfftfreq
            from scipy import signal

            y, sr = librosa.load(audio_file, duration=15, sr=44100, mono=True)
            window = signal.windows.hann(len(y))
            y_windowed = y * window
            n_fft = max(16384, len(y))
            fft = rfft(y_windowed, n=n_fft)
            freqs = rfftfreq(n_fft, 1 / sr)
            power = np.abs(fft) ** 2

            a4_mask = (freqs >= 400) & (freqs <= 480)
            if not np.any(a4_mask):
                return {"frequency": 440.0, "confidence": 0.1}

            a4_freqs = freqs[a4_mask]
            a4_power = power[a4_mask]
            peak_idx = np.argmax(a4_power)
            peak_freq = float(a4_freqs[peak_idx])
            peak_power = float(a4_power[peak_idx])

            harmonics_power = 0.0
            for h in [2, 3]:
                ef = peak_freq * h
                if ef < freqs[-1]:
                    hm = (freqs >= ef - 5) & (freqs <= ef + 5)
                    if np.any(hm):
                        harmonics_power += float(np.max(power[hm]))

            total = float(np.sum(a4_power))
            prominence = peak_power / total if total > 0 else 0
            h_support = harmonics_power / peak_power if peak_power > 0 else 0
            confidence = min(1.0, prominence + h_support * 0.3)

            if not (400 <= peak_freq <= 480):
                peak_freq = 440.0
                confidence = 0.1

            return {"frequency": peak_freq, "confidence": confidence}
        except Exception as e:
            logger.warning(f"Tuning detection failed: {e}")
            return {"frequency": 440.0, "confidence": 0.1}

    # ---- conversion methods ----

    def _convert_librosa_dynamic(self, input_path, output_path, fmt, quality):
        import librosa
        import soundfile as sf

        det = self._detect_tuning_quick(input_path)
        freq, conf = det["frequency"], det["confidence"]
        logger.info(f"Detected tuning: {freq:.2f} Hz (conf: {conf:.3f})")

        if abs(freq - 432) < 1.0:
            import shutil; shutil.copy2(input_path, output_path); return True

        semitones = 12 * np.log2(432.0 / freq)
        logger.info(f"Shifting {semitones:.4f} semitones")
        y, sr = librosa.load(input_path, sr=None)
        y_shifted = librosa.effects.pitch_shift(y, sr=sr, n_steps=semitones)

        tmp = str(TEMP_DIR / f"lib_{uuid.uuid4().hex}.wav")
        sf.write(tmp, y_shifted, sr)
        if fmt == "mp3":
            subprocess.run(["ffmpeg", "-i", tmp, "-b:a", quality, "-y", output_path],
                           capture_output=True, check=True)
        else:
            import shutil; shutil.move(tmp, output_path)
        try: os.remove(tmp)
        except: pass
        return True

    def _convert_rubberband_dynamic(self, input_path, output_path, fmt, quality):
        det = self._detect_tuning_quick(input_path)
        freq = det["frequency"]
        if abs(freq - 432) < 1.0:
            import shutil; shutil.copy2(input_path, output_path); return True

        ratio = 432.0 / freq
        tmp_wav = str(TEMP_DIR / f"rb_in_{uuid.uuid4().hex}.wav")
        if not input_path.lower().endswith(".wav"):
            subprocess.run(["ffmpeg", "-i", input_path, "-acodec", "pcm_s16le",
                            "-ar", "44100", "-y", tmp_wav], capture_output=True, check=True)
            rb_in = tmp_wav
        else:
            rb_in = input_path

        tmp_out = str(TEMP_DIR / f"rb_out_{uuid.uuid4().hex}.wav")
        res = subprocess.run([RUBBERBAND_PATH, "--pitch", str(ratio), "--formant",
                              "--precise", "--detector", "compound", "--threads", "1",
                              rb_in, tmp_out], capture_output=True, text=True)
        if res.returncode not in (0, 1, 2) or not os.path.exists(tmp_out):
            raise Exception(f"Rubberband failed: {res.stderr}")

        if fmt == "mp3":
            subprocess.run(["ffmpeg", "-i", tmp_out, "-b:a", quality, "-y", output_path],
                           capture_output=True, check=True)
        else:
            import shutil; shutil.move(tmp_out, output_path)
        for f in [tmp_wav, tmp_out]:
            try:
                if os.path.exists(f): os.remove(f)
            except: pass
        return True

    def _convert_ffmpeg_dynamic(self, input_path, output_path, fmt, quality):
        det = self._detect_tuning_quick(input_path)
        freq = det["frequency"]
        if abs(freq - 432) < 1.0:
            import shutil; shutil.copy2(input_path, output_path); return True

        ratio = 432.0 / freq
        subprocess.run(
            ["ffmpeg", "-i", input_path,
             "-filter:a", f"asetrate=44100*{ratio},aresample=44100",
             "-b:a", quality, "-y", output_path],
            capture_output=True, text=True, check=True,
        )
        return True

    def convert_to_432hz(self, input_path, output_path, method="auto", fmt="mp3", quality="192k"):
        if method == "auto":
            if "librosa" in self.available_methods:
                method = "librosa"
            elif "rubberband" in self.available_methods:
                method = "rubberband"
            else:
                method = "ffmpeg"
        logger.info(f"Using {method} for 432Hz conversion")
        try:
            if method == "librosa":
                return self._convert_librosa_dynamic(input_path, output_path, fmt, quality)
            elif method == "rubberband":
                return self._convert_rubberband_dynamic(input_path, output_path, fmt, quality)
            else:
                return self._convert_ffmpeg_dynamic(input_path, output_path, fmt, quality)
        except Exception as e:
            logger.error(f"Conversion failed with {method}: {e}")
            if method != "ffmpeg":
                logger.info("Falling back to FFmpeg")
                return self._convert_ffmpeg_dynamic(input_path, output_path, fmt, quality)
            raise

    def process_video(self, job_id: str, video_id: str,
                      convert_to_432hz: bool = True,
                      method: str = "auto",
                      fmt: str = "mp3",
                      quality: str = "192k"):
        """Full pipeline — runs in background thread."""
        try:
            processing_jobs[job_id]["status"] = "downloading"

            # Check cache before downloading
            cached = get_cached_filename(video_id)
            if cached and convert_to_432hz:
                processing_jobs[job_id].update({
                    "status": "completed",
                    "output_file": cached,
                    "file_path": str(DOWNLOAD_DIR / cached),
                    "file_size": os.path.getsize(DOWNLOAD_DIR / cached),
                    "from_cache": True,
                    "completed_at": datetime.now().isoformat(),
                })
                logger.info(f"Cache hit for {video_id}: {cached}")
                return

            downloaded = self.download_audio(video_id)
            processing_jobs[job_id]["status"] = "converting"

            # Use stable naming: {video_id}_432hz.mp3
            output_filename = f"{video_id}_432hz.{fmt}" if convert_to_432hz else f"{video_id}_raw.{fmt}"
            output_path = DOWNLOAD_DIR / output_filename

            if convert_to_432hz:
                self.convert_to_432hz(downloaded, str(output_path), method, fmt, quality)
                processing_jobs[job_id]["conversion"] = f"432Hz_{method}"
            else:
                subprocess.run(["ffmpeg", "-i", downloaded, "-b:a", quality, "-y", str(output_path)],
                                check=True, capture_output=True)
                processing_jobs[job_id]["conversion"] = "format_only"

            try: os.remove(downloaded)
            except: pass

            processing_jobs[job_id].update({
                "status": "completed",
                "output_file": output_filename,
                "file_path": str(output_path),
                "file_size": os.path.getsize(output_path),
                "from_cache": False,
                "completed_at": datetime.now().isoformat(),
            })

        except Exception as e:
            logger.error(f"Job {job_id} failed: {e}")
            processing_jobs[job_id].update({
                "status": "error",
                "error": str(e),
                "completed_at": datetime.now().isoformat(),
            })


# ---------------------------------------------------------------------------
# Singleton processor
# ---------------------------------------------------------------------------
processor = Enhanced432HzProcessor()


# ---------------------------------------------------------------------------
# API Routes
# ---------------------------------------------------------------------------

# ── Search ──────────────────────────────────────────────────────────────────

@app.route("/api/search", methods=["GET"])
def search_youtube():
    """Search YouTube — powers in-app discovery."""
    query = request.args.get("q", "").strip()
    limit = min(int(request.args.get("limit", 12)), 25)

    if not query:
        return jsonify({"error": "Query is required"}), 400

    ydl_opts = {
        "quiet": True,
        "no_warnings": True,
        "extract_flat": True,
        "skip_download": True,
        "default_search": "ytsearch",
    }

    try:
        with yt_dlp.YoutubeDL(ydl_opts) as ydl:
            raw = ydl.extract_info(f"ytsearch{limit}:{query}", download=False)

        results = []
        for entry in (raw.get("entries") or []):
            vid_id = entry.get("id") or entry.get("url", "").split("v=")[-1]
            if not vid_id:
                continue
            results.append({
                "videoId": vid_id,
                "title": entry.get("title", "Unknown"),
                "artist": entry.get("uploader") or entry.get("channel") or "Unknown Artist",
                "duration": entry.get("duration") or 0,
                "thumbnail": (
                    entry.get("thumbnail")
                    or f"https://img.youtube.com/vi/{vid_id}/hqdefault.jpg"
                ),
                "cached": is_cached(vid_id),
            })

        return jsonify({"results": results, "query": query, "count": len(results)})

    except Exception as e:
        logger.error(f"Search error: {e}")
        return jsonify({"error": str(e)}), 500


# ── Cache check ──────────────────────────────────────────────────────────────

@app.route("/api/cache/<video_id>", methods=["GET"])
def check_cache(video_id):
    """Quickly check if a 432Hz version is already cached."""
    fname = get_cached_filename(video_id)
    if fname:
        return jsonify({
            "cached": True,
            "filename": fname,
            "fileUrl": f"/api/files/{fname}",
            "size": os.path.getsize(DOWNLOAD_DIR / fname),
        })
    return jsonify({"cached": False})


# ── Stream proxy ─────────────────────────────────────────────────────────────

@app.route("/api/stream/<video_id>", methods=["GET", "OPTIONS"])
def stream_audio(video_id):
    """Proxy YouTube audio — enables instant play before conversion."""
    # Handle CORS preflight
    if request.method == "OPTIONS":
        resp = app.make_default_options_response()
        resp.headers["Access-Control-Allow-Origin"] = "*"
        resp.headers["Access-Control-Allow-Methods"] = "GET, OPTIONS"
        resp.headers["Access-Control-Allow-Headers"] = "Range"
        return resp

    try:
        logger.info(f"Stream request for video: {video_id}")
        stream_url = processor.get_stream_url(video_id)
        logger.info(f"Got stream URL for {video_id}, proxying...")
        headers = {
            "User-Agent": (
                "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
                "AppleWebKit/537.36 (KHTML, like Gecko) "
                "Chrome/120.0.0.0 Safari/537.36"
            ),
            "Range": request.headers.get("Range", "bytes=0-"),
        }
        upstream = req_lib.get(stream_url, headers=headers, stream=True, timeout=60)
        resp_headers = {
            "Content-Type": upstream.headers.get("Content-Type", "audio/webm"),
            "Accept-Ranges": "bytes",
            "Access-Control-Allow-Origin": "*",
            "Access-Control-Allow-Methods": "GET, OPTIONS",
            "Access-Control-Allow-Headers": "Range",
            "Access-Control-Expose-Headers": "Content-Range, Content-Length",
        }
        if "Content-Range" in upstream.headers:
            resp_headers["Content-Range"] = upstream.headers["Content-Range"]
        if "Content-Length" in upstream.headers:
            resp_headers["Content-Length"] = upstream.headers["Content-Length"]

        return Response(
            upstream.iter_content(chunk_size=8192),
            status=upstream.status_code,
            headers=resp_headers,
        )
    except Exception as e:
        logger.error(f"Stream error for {video_id}: {e}")
        return jsonify({"error": str(e)}), 500


# ── Metadata ─────────────────────────────────────────────────────────────────

@app.route("/api/metadata", methods=["POST"])
def get_metadata():
    data = request.get_json()
    video_id = data.get("videoId")
    if not video_id:
        return jsonify({"error": "videoId required"}), 400
    try:
        meta = processor.get_video_info(video_id)
        meta["cached"] = is_cached(video_id)
        return jsonify(meta)
    except Exception as e:
        return jsonify({"error": str(e)}), 500


# ── Convert (async, non-blocking) ────────────────────────────────────────────

@app.route("/api/convert", methods=["POST"])
def convert_audio():
    """Start background 432Hz conversion. Returns immediately with job_id."""
    data = request.get_json()
    video_id = data.get("videoId")
    convert_to_432hz = data.get("convertTo432Hz", True)
    method = data.get("method", "auto")
    fmt = data.get("format", "mp3")
    quality = data.get("quality", "192k")

    if not video_id:
        return jsonify({"error": "videoId required"}), 400

    # Fast-path: already cached
    if convert_to_432hz:
        cached = get_cached_filename(video_id)
        if cached:
            return jsonify({
                "status": "completed",
                "fromCache": True,
                "fileUrl": f"/api/files/{cached}",
                "downloadUrl": f"/api/download/{cached}",
                "fileName": cached,
            })

    # Create job and start background thread
    job_id = str(uuid.uuid4())
    processing_jobs[job_id] = {
        "status": "queued",
        "video_id": video_id,
        "method": method,
        "created_at": datetime.now().isoformat(),
    }

    thread = threading.Thread(
        target=processor.process_video,
        args=(job_id, video_id, convert_to_432hz, method, fmt, quality),
        daemon=True,
    )
    thread.start()

    return jsonify({"status": "processing", "jobId": job_id})


# ── Job status ───────────────────────────────────────────────────────────────

@app.route("/api/status/<job_id>", methods=["GET"])
def get_status(job_id):
    if job_id not in processing_jobs:
        return jsonify({"error": "Job not found"}), 404

    job = processing_jobs[job_id]

    if job["status"] == "completed":
        return jsonify({
            "status": "completed",
            "fileUrl": f"/api/files/{job['output_file']}",
            "downloadUrl": f"/api/download/{job['output_file']}",
            "fileName": job["output_file"],
            "fileSize": job.get("file_size", 0),
            "fromCache": job.get("from_cache", False),
        })

    return jsonify({
        "status": job["status"],
        "error": job.get("error"),
    })


# ── File serve & download ────────────────────────────────────────────────────

@app.route("/api/files/<filename>", methods=["GET"])
def serve_file(filename):
    fp = DOWNLOAD_DIR / filename
    if not fp.exists():
        return jsonify({"error": "File not found"}), 404
    return send_file(fp, mimetype="audio/mpeg")


@app.route("/api/download/<filename>", methods=["GET"])
def download_file(filename):
    fp = DOWNLOAD_DIR / filename
    if not fp.exists():
        return jsonify({"error": "File not found"}), 404
    return send_file(fp, as_attachment=True, download_name=filename, mimetype="audio/mpeg")


# ── Available methods ────────────────────────────────────────────────────────

@app.route("/api/methods", methods=["GET"])
def get_available_methods():
    return jsonify({
        "available_methods": processor.available_methods,
        "recommended": "librosa" if "librosa" in processor.available_methods else "rubberband",
        "priority_order": ["librosa", "rubberband", "ffmpeg"],
    })


# ── Health check ─────────────────────────────────────────────────────────────

@app.route("/api/health", methods=["GET"])
def health_check():
    return jsonify({
        "status": "healthy",
        "available_methods": processor.available_methods,
        "features": {
            "search": True,
            "stream_proxy": True,
            "async_convert": True,
            "smart_cache": True,
            "dynamic_tuning_detection": True,
        },
        "services": {
            "ffmpeg": subprocess.run(["ffmpeg", "-version"], capture_output=True).returncode == 0,
            "yt_dlp": True,
            "rubberband": "rubberband" in processor.available_methods,
            "librosa": "librosa" in processor.available_methods,
        },
    })


# ── Startup ──────────────────────────────────────────────────────────────────

if __name__ == "__main__":
    DOWNLOAD_DIR.mkdir(exist_ok=True)
    TEMP_DIR.mkdir(exist_ok=True)

    try:
        subprocess.run(["ffmpeg", "-version"], capture_output=True, check=True)
        logger.info("✅ FFmpeg ready")
    except Exception:
        logger.error("❌ FFmpeg not found")

    logger.info("=" * 60)
    logger.info("🎧 PINEALON v2 — Dynamic 432Hz Converter")
    logger.info("  ✨ YouTube search      → /api/search?q=")
    logger.info("  ▶️  Instant stream      → /api/stream/<video_id>")
    logger.info("  🔄 Async conversion    → /api/convert  (non-blocking)")
    logger.info("  💾 Smart cache         → /api/cache/<video_id>")
    logger.info("=" * 60)

    app.run(debug=True, host="0.0.0.0", port=3001)