import os
import math
import shutil
import subprocess
import uuid
import logging
from pathlib import Path

logger = logging.getLogger(__name__)

# Try to find rubberband in system PATH or default Windows location
RUBBERBAND_PATH = "rubberband" 
if os.path.exists(r"C:\rubberband\rubberband.exe"):
    RUBBERBAND_PATH = r"C:\rubberband\rubberband.exe"

TEMP_DIR = Path("./temp")
TEMP_DIR.mkdir(exist_ok=True)
DOWNLOAD_DIR = Path("./downloads")
DOWNLOAD_DIR.mkdir(exist_ok=True)

# ─────────────────────────────────────────
# TUNING DETECTION
# ─────────────────────────────────────────

def detect_tuning(audio_file) -> float:
    """
    Returns detected A4 frequency.
    Falls back to 440.0 if detection fails or is unreliable.
    """
    try:
        import librosa
        import soundfile as sf

        info = sf.info(audio_file)
        total = info.duration
        offset = total * 0.20
        duration = min(60.0, total * 0.6)

        y, sr = librosa.load(audio_file, offset=offset, duration=duration, sr=22050, mono=True)
        offset_semitones = librosa.estimate_tuning(y=y, sr=sr)
        detected = 440.0 * (2 ** (offset_semitones / 12))

        if not (400.0 <= detected <= 480.0):
            return 440.0

        return float(detected)

    except Exception as e:
        logger.error(f"Tuning detection failed: {e}")
        return 440.0  # safe fallback

def get_tuning_info(audio_file) -> dict:
    """Wrapper to format the result for the frontend."""
    detected_hz = detect_tuning(audio_file)
    is_432 = abs(detected_hz - 432.0) < 1.0
    return {
        "tuning": "432Hz" if is_432 else "440Hz",
        "detected_hz": detected_hz,
        "confidence": 0.9 if is_432 else 0.5, # Simplified confidence
        "reasoning": f"librosa.estimate_tuning detected A4 = {detected_hz:.2f} Hz"
    }

# ─────────────────────────────────────────
# CONVERSION METHODS
# ─────────────────────────────────────────

def _convert_rubberband(input_path: str, output_path: str, semitones: float, quality: str) -> bool:
    """Primary — Rubberband CLI. Best quality, fast."""
    temp_wav = str(TEMP_DIR / f"rb_out_{uuid.uuid4().hex}.wav")
    try:
        cmd = [
            RUBBERBAND_PATH,
            "--pitch-semitones", str(semitones),
            "--time-ratio", "1.0",
            "--crisp", "6",
            "--fine",
            input_path, temp_wav
        ]
        subprocess.run(cmd, capture_output=True, check=True)

        # encode to mp3
        subprocess.run([
            "ffmpeg", "-i", temp_wav,
            "-b:a", quality,
            "-y", output_path
        ], capture_output=True, check=True)

        return True

    except Exception as e:
        logger.warning(f"Rubberband CLI failed: {e}")
        return False

    finally:
        if os.path.exists(temp_wav):
            os.remove(temp_wav)


def _convert_ffmpeg_rubberband(input_path: str, output_path: str, semitones: float, quality: str) -> bool:
    """Fallback 1 — FFmpeg rubberband filter. No tempo change, good quality."""
    try:
        pitch_scale = 2 ** (semitones / 12)
        cmd = [
            "ffmpeg", "-i", input_path,
            "-af", f"rubberband=pitch={pitch_scale}",
            "-b:a", quality,
            "-y", output_path
        ]
        subprocess.run(cmd, capture_output=True, check=True)
        return True

    except Exception as e:
        logger.warning(f"FFmpeg rubberband filter failed: {e}")
        return False


def _convert_ffmpeg_atempo(input_path: str, output_path: str, semitones: float, quality: str) -> bool:
    """
    Fallback 2 — FFmpeg asetrate + atempo.
    asetrate shifts pitch but also changes speed.
    atempo corrects the speed back to 1x.
    Not perfect but works without rubberband.
    """
    try:
        pitch_ratio = 2 ** (semitones / 12)
        base_rate = 44100
        new_rate = int(base_rate * pitch_ratio)

        cmd = [
            "ffmpeg", "-i", input_path,
            "-af", f"aresample={base_rate},asetrate={new_rate},aresample={base_rate},atempo={1/pitch_ratio}",
            "-b:a", quality,
            "-y", output_path
        ]
        subprocess.run(cmd, capture_output=True, check=True)
        return True

    except Exception as e:
        logger.warning(f"FFmpeg atempo fallback failed: {e}")
        return False


# ─────────────────────────────────────────
# MAIN ENTRY POINT
# ─────────────────────────────────────────

def convert_to_432(input_path: str, output_path: str, quality: str = "192k") -> dict:
    """
    Full pipeline:
    1. Check cache
    2. Detect tuning
    3. Try rubberband CLI → ffmpeg rubberband filter → ffmpeg atempo
    """

    # Already 432Hz — skip
    if os.path.exists(output_path):
        return {"status": "cached", "method": "cache"}

    # Detect tuning
    detected_a4 = detect_tuning(input_path)

    # Already at 432Hz
    if abs(detected_a4 - 432.0) < 1.0:
        shutil.copy2(input_path, output_path)
        return {"status": "ok", "method": "copy", "detected_hz": detected_a4}

    semitones = 12 * math.log2(432.0 / detected_a4)

    # Try methods in order
    methods = [
        ("rubberband_cli",     lambda: _convert_rubberband(input_path, output_path, semitones, quality)),
        ("ffmpeg_rubberband",  lambda: _convert_ffmpeg_rubberband(input_path, output_path, semitones, quality)),
        ("ffmpeg_atempo",      lambda: _convert_ffmpeg_atempo(input_path, output_path, semitones, quality)),
    ]

    for method_name, method_fn in methods:
        logger.info(f"Attempting conversion using {method_name}...")
        if method_fn():
            return {
                "status": "ok",
                "method": method_name,
                "detected_hz": detected_a4,
                "semitones": semitones
            }

    return {"status": "error", "message": "All conversion methods failed"}
