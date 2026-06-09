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

    def get_stream_url(self, video_id: str) -> tuple[str, dict]:
        opts = dict(self.ydl_opts)
        opts["format"] = "bestaudio/best"
        with yt_dlp.YoutubeDL(opts) as ydl:
            info = ydl.extract_info(f"https://www.youtube.com/watch?v={video_id}", download=False)
            url = info.get("url")
            if not url and info.get("requested_formats"):
                url = info["requested_formats"][0]["url"]
            if not url:
                raise Exception("No stream URL found")
            return url, info.get("http_headers", {})

    def detect_tuning(self, video_id: str) -> dict:
        try:
            stream_url, yt_headers = self.get_stream_url(video_id)
            tmp_wav = str(TEMP_DIR / f"tune_{uuid.uuid4().hex}.wav")
            
            # Prepare headers for ffmpeg to bypass throttling
            header_args = []
            if yt_headers:
                header_str = "".join(f"{k}: {v}\r\n" for k, v in yt_headers.items())
                header_args = ["-headers", header_str]

            # Download exactly 10 seconds of the stream using ffmpeg
            logger.info(f"Downloading 10s chunk for tuning detection: {video_id}")
            subprocess.run(["ffmpeg", *header_args, "-i", stream_url, "-t", "10", "-y", tmp_wav], 
                           capture_output=True, check=True)
            
            # Run the highly optimized rubberband-compatible detection
            logger.info("Running librosa-based estimate_tuning...")
            from audio_processor import get_tuning_info
            result = get_tuning_info(tmp_wav)
            
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
    """Search YouTube using InnerTube API to bypass IP blocks"""
    query = request.args.get("q", "").strip()
    limit = min(int(request.args.get("limit", 12)), 25)

    if not query:
        return jsonify({"error": "Query is required"}), 400

    try:
        # We use the internal YouTube API (InnerTube) instead of yt-dlp to bypass bot protections
        payload = {
            "context": {"client": {"clientName": "WEB", "clientVersion": "2.20210721.00.00"}},
            "query": query
        }
        r = req_lib.post("https://www.youtube.com/youtubei/v1/search", json=payload, timeout=10)
        r.raise_for_status()
        
        data = r.json()
        contents = data.get('contents', {}).get('twoColumnSearchResultsRenderer', {}).get('primaryContents', {}).get('sectionListRenderer', {}).get('contents', [])
        
        items = []
        if contents:
            items = contents[0].get('itemSectionRenderer', {}).get('contents', [])

        results = []
        for i in items:
            if len(results) >= limit:
                break
            if 'videoRenderer' in i:
                v = i['videoRenderer']
                if not v.get('lengthText'):
                    continue
                
                duration_text = v['lengthText'].get('simpleText')
                if not duration_text and 'runs' in v['lengthText']:
                    duration_text = v['lengthText']['runs'][0]['text']
                    
                artist_text = v['ownerText'].get('simpleText')
                if not artist_text and 'runs' in v['ownerText']:
                    artist_text = v['ownerText']['runs'][0]['text']
                    
                title_text = v['title'].get('simpleText')
                if not title_text and 'runs' in v['title']:
                    title_text = v['title']['runs'][0]['text']

                results.append({
                    "videoId": v['videoId'],
                    "title": title_text or "Unknown",
                    "artist": artist_text or "Unknown Artist",
                    "duration": duration_text or "0:00",
                    "thumbnail": v['thumbnail']['thumbnails'][-1]['url'] if v.get('thumbnail') and v['thumbnail'].get('thumbnails') else f"https://img.youtube.com/vi/{v['videoId']}/hqdefault.jpg"
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
        stream_url, yt_headers = yt_api.get_stream_url(video_id)
        
        headers = {**yt_headers}
        if "Range" in request.headers:
            headers["Range"] = request.headers["Range"]
            
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

# ── Download ─────────────────────────────────────────────────────────────────
@app.route("/api/download/<video_id>", methods=["GET"])
def download_432hz(video_id):
    """Downloads, converts to 432Hz via audio_processor, and returns the MP3"""
    logger.info(f"Download request for {video_id}")
    try:
        from audio_processor import convert_to_432, DOWNLOAD_DIR
        
        final_mp3 = str(DOWNLOAD_DIR / f"{video_id}_432hz.mp3")
        if os.path.exists(final_mp3):
            logger.info("Serving from cache.")
            return send_file(
                final_mp3,
                as_attachment=True,
                download_name=f"pinealon_432hz_{video_id}.mp3",
                mimetype="audio/mpeg"
            )

        stream_url, yt_headers = yt_api.get_stream_url(video_id)
        
        # Download stream to a temporary full-length audio file
        tmp_input = str(TEMP_DIR / f"dl_input_{video_id}_{uuid.uuid4().hex}.mp3")
        logger.info("Downloading full stream to temp file...")
        
        header_args = []
        if yt_headers:
            header_str = "".join(f"{k}: {v}\r\n" for k, v in yt_headers.items())
            header_args = ["-headers", header_str]

        subprocess.run([
            "ffmpeg", *header_args, "-i", stream_url, 
            "-b:a", "192k", "-y", tmp_input
        ], capture_output=True, check=True)
        
        # Convert to 432Hz using the advanced fallback logic (Rubberband -> FFmpeg)
        logger.info("Running audio_processor convert_to_432...")
        result = convert_to_432(tmp_input, final_mp3)
        
        # Cleanup temp input
        try: os.remove(tmp_input)
        except: pass
        
        if result.get("status") in ["ok", "cached", "copy"]:
            return send_file(
                final_mp3,
                as_attachment=True,
                download_name=f"pinealon_432hz_{video_id}.mp3",
                mimetype="audio/mpeg"
            )
        else:
            return jsonify({"error": result.get("message")}), 500
            
    except Exception as e:
        logger.error(f"Download failed: {e}")
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