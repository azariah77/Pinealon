# backend/app.py — Pinealon v2: Search + Stream + Async Convert + Cache (Refactored for Client-Side 432Hz)
from flask import Flask, request, jsonify, Response, send_file, after_this_request
from flask_cors import CORS
import os
import subprocess
import uuid
from pathlib import Path
import yt_dlp
import logging
import requests as req_lib
from tuning_detector import quick_check_only, detect_tuning_simple

app = Flask(__name__)
CORS(app, resources={r"/api/*": {"origins": "*"}})

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

TEMP_DIR = Path("./temp")
TEMP_DIR.mkdir(exist_ok=True)

class YouTubeAPI:
    def __init__(self):
        self.ydl_opts = {
            "quiet": True,
            "no_warnings": True,
            "legacyserverconnect": True,
            "source_address": "0.0.0.0",
            "http_headers": {"User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36"}
        }

    def get_stream_url(self, video_id: str) -> str:
        opts = dict(self.ydl_opts)
        opts["format"] = "bestaudio/best"
        with yt_dlp.YoutubeDL(opts) as ydl:
            info = ydl.extract_info(f"https://www.youtube.com/watch?v={video_id}", download=False)
            if "url" in info:
                return info["url"]
            if info.get("requested_formats"):
                return info["requested_formats"][0]["url"]
            raise Exception("No stream URL found")

    def detect_tuning(self, video_id: str) -> dict:
        try:
            stream_url = self.get_stream_url(video_id)
            tmp_wav = str(TEMP_DIR / f"tune_{uuid.uuid4().hex}.wav")
            
            # Download exactly 10 seconds of the stream using ffmpeg
            logger.info(f"Downloading 10s chunk for tuning detection: {video_id}")
            subprocess.run(["ffmpeg", "-i", stream_url, "-t", "10", "-y", tmp_wav], 
                           capture_output=True, check=True)
            
            # Run the tuning detector
            logger.info("Running librosa-based estimate_tuning...")
            result = detect_tuning_simple(tmp_wav)
            
            # Cleanup
            try: os.remove(tmp_wav)
            except: pass
            
            return result
        except Exception as e:
            logger.error(f"Tuning detection failed: {e}")
            return {"tuning": "Unknown", "confidence": 0, "error": str(e)}

yt_api = YouTubeAPI()


# ── Search ──────────────────────────────────────────────────────────────────
@app.route("/api/search", methods=["GET"])
def search_youtube():
    """Search YouTube"""
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
                "thumbnail": entry.get("thumbnail") or f"https://img.youtube.com/vi/{vid_id}/hqdefault.jpg"
            })

        return jsonify({"results": results, "query": query, "count": len(results)})

    except Exception as e:
        logger.error(f"Search error: {e}")
        return jsonify({"error": str(e)}), 500


# ── Tuning Detection ────────────────────────────────────────────────────────
@app.route("/api/tuning/<video_id>", methods=["GET"])
def get_tuning(video_id):
    """Downloads 10s and returns whether it's 432Hz or 440Hz"""
    logger.info(f"Tuning detection request for {video_id}")
    result = yt_api.detect_tuning(video_id)
    return jsonify(result)


# ── Stream proxy ─────────────────────────────────────────────────────────────
@app.route("/api/stream/<video_id>", methods=["GET", "OPTIONS"])
def stream_audio(video_id):
    """Proxy YouTube audio"""
    if request.method == "OPTIONS":
        resp = app.make_default_options_response()
        resp.headers["Access-Control-Allow-Origin"] = "*"
        resp.headers["Access-Control-Allow-Methods"] = "GET, OPTIONS"
        resp.headers["Access-Control-Allow-Headers"] = "Range"
        return resp

    try:
        logger.info(f"Stream request for video: {video_id}")
        stream_url = yt_api.get_stream_url(video_id)
        
        headers = {
            "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko)",
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


# ── Health check ─────────────────────────────────────────────────────────────
@app.route("/api/health", methods=["GET"])
def health_check():
    return jsonify({
        "status": "healthy",
        "features": {
            "search": True,
            "stream_proxy": True,
            "tuning_detection": True,
            "client_side_conversion": True
        }
    })


if __name__ == "__main__":
    TEMP_DIR.mkdir(exist_ok=True)
    logger.info("=" * 60)
    logger.info("🎧 PINEALON v2 — Client-Side 432Hz Refactoring")
    logger.info("=" * 60)
    app.run(debug=True, host="0.0.0.0", port=3001)