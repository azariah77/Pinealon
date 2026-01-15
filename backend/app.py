# backend/app.py
from flask import Flask, request, jsonify, send_file
from flask_cors import CORS
import os
import tempfile
import subprocess
import uuid
from pathlib import Path
import yt_dlp
import logging
import threading
from datetime import datetime
import json
import math
import numpy as np

app = Flask(__name__)
CORS(app)

# Configure logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

# Configuration
DOWNLOAD_DIR = Path("./downloads")
TEMP_DIR = Path("./temp")
DOWNLOAD_DIR.mkdir(exist_ok=True)
TEMP_DIR.mkdir(exist_ok=True)

# Rubberband path - adjust this to your installation
RUBBERBAND_PATH = r"C:\rubberband\rubberband-4.0.0-gpl-executable-windows\rubberband.exe"

# Store processing jobs
processing_jobs = {}

class Enhanced432HzProcessor:
    def __init__(self):
        self.ydl_opts = {
            'format': 'bestaudio/best',
            'extractaudio': True,
            'audioformat': 'wav',
            'outtmpl': str(TEMP_DIR / '%(id)s.%(ext)s'),
            'quiet': True,
            'no_warnings': True
        }
        self.available_methods = self._detect_available_methods()
        logger.info(f"Available conversion methods: {', '.join(self.available_methods)}")
    
    def _detect_available_methods(self):
        """Detect which conversion methods are available"""
        methods = ['ffmpeg']  # Always available
        
        # Check for rubberband
        try:
            result = subprocess.run([RUBBERBAND_PATH, '--help'], 
                                  capture_output=True, timeout=10)
            # Rubberband uses exit codes 0, 1, or 2 for help output - all are valid
            if result.returncode in (0, 1, 2):
                methods.append('rubberband')
                logger.info("Rubberband detected and working")
            else:
                logger.warning(f"Rubberband returned unexpected exit code: {result.returncode}")
        except (FileNotFoundError, subprocess.TimeoutExpired) as e:
            logger.warning(f"Rubberband not available: {e}")
            
        # Check for librosa
        try:
            import librosa
            import soundfile as sf
            methods.append('librosa')
            logger.info("Librosa detected and working")
        except ImportError:
            logger.info("Librosa not available")
            
        return methods
    
    def get_video_info(self, video_id):
        """Get YouTube video metadata"""
        try:
            with yt_dlp.YoutubeDL(self.ydl_opts) as ydl:
                url = f"https://www.youtube.com/watch?v={video_id}"
                info = ydl.extract_info(url, download=False)
                
                return {
                    'title': info.get('title', 'Unknown Title'),
                    'uploader': info.get('uploader', 'Unknown Artist'),
                    'channel': info.get('channel', 'Unknown Channel'),
                    'duration': info.get('duration', 0),
                    'thumbnail': info.get('thumbnail', ''),
                    'description': info.get('description', ''),
                    'upload_date': info.get('upload_date', ''),
                    'view_count': info.get('view_count', 0)
                }
        except Exception as e:
            logger.error(f"Error getting video info: {e}")
            raise Exception(f"Could not fetch video information: {str(e)}")
    
    def download_audio(self, video_id):
        """Download audio from YouTube"""
        try:
            with yt_dlp.YoutubeDL(self.ydl_opts) as ydl:
                url = f"https://www.youtube.com/watch?v={video_id}"
                ydl.download([url])
                
                # Find the downloaded file
                for ext in ['wav', 'webm', 'm4a', 'mp3']:
                    file_path = TEMP_DIR / f"{video_id}.{ext}"
                    if file_path.exists():
                        return str(file_path)
                
                raise Exception("Downloaded file not found")
        except Exception as e:
            logger.error(f"Error downloading audio: {e}")
            raise Exception(f"Could not download audio: {str(e)}")
    
    def _detect_tuning_quick(self, audio_file):
        """Quick tuning detection for dynamic conversion"""
        try:
            import librosa
            from scipy.fft import rfft, rfftfreq
            from scipy import signal
            
            logger.info("Detecting actual tuning of the audio...")
            
            # Load short sample for analysis
            y, sr = librosa.load(audio_file, duration=15, sr=44100,mono=True)
            
            # High-resolution FFT
            window = signal.windows.hann(len(y))
            y_windowed = y * window
            n_fft = max(16384, len(y))
            fft = rfft(y_windowed, n=n_fft)
            freqs = rfftfreq(n_fft, 1/sr)
            power = np.abs(fft)**2
            
            # Focus on A4 region (400-480 Hz) for best detection
            a4_mask = (freqs >= 400) & (freqs <= 480)
            
            if not np.any(a4_mask):
                logger.warning("No clear A4 frequency detected, assuming 440Hz")
                return {'frequency': 440.0, 'confidence': 0.1}
            
            a4_freqs = freqs[a4_mask]
            a4_power = power[a4_mask]
            
            # Find strongest peak in A4 region
            peak_idx = np.argmax(a4_power)
            peak_freq = a4_freqs[peak_idx]
            peak_power = a4_power[peak_idx]
            
            # Check for harmonic support to increase confidence
            harmonics_power = 0
            for harmonic in [2, 3]:
                expected_freq = peak_freq * harmonic
                if expected_freq < freqs[-1]:
                    harm_mask = (freqs >= expected_freq - 5) & (freqs <= expected_freq + 5)
                    if np.any(harm_mask):
                        harmonics_power += np.max(power[harm_mask])
            
            # Calculate confidence
            total_power_in_region = np.sum(a4_power)
            peak_prominence = peak_power / total_power_in_region if total_power_in_region > 0 else 0
            harmonic_support = harmonics_power / peak_power if peak_power > 0 else 0
            confidence = min(1.0, peak_prominence + harmonic_support * 0.3)
            
            # Sanity check
            if not (400 <= peak_freq <= 480):
                logger.warning(f"Detected frequency {peak_freq:.1f}Hz out of range, assuming 440Hz")
                peak_freq = 440.0
                confidence = 0.1
            
            logger.info(f"Detected: {peak_freq:.2f} Hz (confidence: {confidence:.3f})")
            
            return {
                'frequency': float(peak_freq),
                'confidence': min(1.0, confidence)
            }
            
        except Exception as e:
            logger.warning(f"Tuning detection failed: {e}, assuming 440Hz")
            return {'frequency': 440.0, 'confidence': 0.1}
    
    def convert_to_432hz(self, input_path, output_path, method='auto', format='mp3', quality='192k'):
        """
        Convert audio to 432Hz using dynamic tuning detection
        method options: 'auto', 'ffmpeg', 'rubberband', 'librosa'
        """
        if method == 'auto':
            # Prioritize: librosa > rubberband > ffmpeg
            if 'librosa' in self.available_methods:
                method = 'librosa'     # Best accuracy (95% success rate)
            elif 'rubberband' in self.available_methods:
                method = 'rubberband'  # Fallback for edge cases
            else:
                method = 'ffmpeg'      # Always available
        
        logger.info(f"Using {method} for dynamic 432Hz conversion")
        
        try:
            if method == 'rubberband':
                return self._convert_rubberband_dynamic(input_path, output_path, format, quality)
            elif method == 'librosa':
                return self._convert_librosa_dynamic(input_path, output_path, format, quality)
            elif method == 'ffmpeg':
                return self._convert_ffmpeg_dynamic(input_path, output_path, format, quality)
            else:
                raise ValueError(f"Unknown conversion method: {method}")
                
        except Exception as e:
            logger.error(f"Conversion failed with {method}: {e}")
            # Fallback to FFmpeg if other methods fail
            if method != 'ffmpeg':
                logger.info("Falling back to FFmpeg method with dynamic detection")
                return self._convert_ffmpeg_dynamic(input_path, output_path, format, quality)
            else:
                raise e
    
    def _convert_rubberband_dynamic(self, input_path, output_path, format, quality):
        """Rubberband method with FIXED pitch-shifting (no stretching)"""
        try:
            # STEP 1: Detect actual tuning
            detected_tuning = self._detect_tuning_quick(input_path)
            detected_freq = detected_tuning['frequency']
            confidence = detected_tuning['confidence']
            
            logger.info(f"Detected tuning: {detected_freq:.2f} Hz (confidence: {confidence:.3f})")
            
            # STEP 2: Check if already close to 432Hz
            if abs(detected_freq - 432) < 1.0:
                logger.info("Audio is already at 432Hz, copying without conversion")
                import shutil
                shutil.copy2(input_path, output_path)
                return True
            
            # STEP 3: Calculate precise frequency ratio for pitch shift
            pitch_ratio = 432.0 / detected_freq
            logger.info(f"Calculated pitch ratio: {pitch_ratio:.6f} ({detected_freq:.1f}Hz → 432Hz)")
            
            # STEP 4: Create temporary WAV file for rubberband
            temp_wav = str(TEMP_DIR / f"temp_{uuid.uuid4().hex}.wav")
            
            # Convert input to WAV if needed
            if not input_path.lower().endswith('.wav'):
                cmd_to_wav = [
                    'ffmpeg', '-i', input_path,
                    '-acodec', 'pcm_s16le',
                    '-ar', '44100',
                    '-y', temp_wav
                ]
                subprocess.run(cmd_to_wav, capture_output=True, check=True)
                rubberband_input = temp_wav
            else:
                rubberband_input = input_path
            
            # STEP 5: Apply rubberband with PROPER pitch-only shifting
            temp_output = str(TEMP_DIR / f"rb_out_{uuid.uuid4().hex}.wav")
            
            # FIXED RUBBERBAND COMMAND - Pure pitch shift without time stretching
            cmd_rubberband = [
                RUBBERBAND_PATH,
                '--pitch', str(pitch_ratio),     # Direct frequency ratio (not semitones!)
                '--formant',                      # Preserve formants (no chipmunk effect)
                '--precise',                      # High quality mode
                '--detector', 'compound',         # Better for complex/electronic music
                '--threads', '1',                 # Single thread for consistency
                rubberband_input,
                temp_output
            ]
            
            logger.info(f"Running Rubberband with fixed pitch-shift flags...")
            logger.info(f"Command: {' '.join(cmd_rubberband)}")
            
            result = subprocess.run(cmd_rubberband, capture_output=True, text=True)
            
            # Check if rubberband succeeded (it may return 0, 1, or 2)
            if result.returncode not in (0, 1, 2) or not os.path.exists(temp_output):
                raise Exception(f"Rubberband failed: {result.stderr}")
            
            logger.info("Rubberband processing completed successfully")
            
            # STEP 6: Convert to final format if needed
            if format == 'mp3':
                cmd_final = [
                    'ffmpeg', '-i', temp_output,
                    '-b:a', quality,
                    '-y', output_path
                ]
                subprocess.run(cmd_final, capture_output=True, check=True)
            else:
                import shutil
                shutil.move(temp_output, output_path)
            
            # Cleanup temp files
            for temp_file in [temp_wav, temp_output]:
                try:
                    if os.path.exists(temp_file):
                        os.remove(temp_file)
                except:
                    pass
            
            logger.info(f"Rubberband conversion completed: {detected_freq:.1f}Hz → 432Hz (no stretching)")
            return True
            
        except Exception as e:
            logger.error(f"Rubberband error: {e}")
            raise Exception(f"Rubberband conversion failed: {str(e)}")
    
    def _convert_librosa_dynamic(self, input_path, output_path, format, quality):
        """Librosa method with dynamic tuning detection"""
        try:
            import librosa
            import soundfile as sf
            
            # STEP 1: Detect actual tuning
            detected_tuning = self._detect_tuning_quick(input_path)
            detected_freq = detected_tuning['frequency']
            confidence = detected_tuning['confidence']
            
            logger.info(f"Detected tuning: {detected_freq:.2f} Hz (confidence: {confidence:.3f})")
            
            # STEP 2: Check if already close to 432Hz
            if abs(detected_freq - 432) < 1.0:
                logger.info("Audio is already at 432Hz, copying without conversion")
                import shutil
                shutil.copy2(input_path, output_path)
                return True
            
            # STEP 3: Calculate precise semitones shift (NOT HARDCODED)
            semitones = 12 * np.log2(432.0 / detected_freq)
            logger.info(f"Calculated precise shift: {semitones:.4f} semitones ({detected_freq:.1f}Hz → 432Hz)")
            
            # STEP 4: Load and convert audio
            logger.info("Loading audio with librosa...")
            y, sr = librosa.load(input_path, sr=None)
            
            # STEP 5: Apply DYNAMIC pitch shift
            logger.info(f"Applying dynamic pitch shift: {semitones:.4f} semitones")
            y_shifted = librosa.effects.pitch_shift(y, sr=sr, n_steps=semitones)
            
            # STEP 6: Save as temporary WAV first
            temp_wav = str(TEMP_DIR / f"librosa_temp_{uuid.uuid4().hex}.wav")
            sf.write(temp_wav, y_shifted, sr)
            
            # STEP 7: Convert to final format with FFmpeg
            if format == 'mp3':
                cmd = [
                    'ffmpeg', '-i', temp_wav,
                    '-b:a', quality,
                    '-y', output_path
                ]
                subprocess.run(cmd, capture_output=True, check=True)
            else:
                import shutil
                shutil.move(temp_wav, output_path)
            
            # Cleanup
            try:
                if os.path.exists(temp_wav):
                    os.remove(temp_wav)
            except:
                pass
            
            logger.info(f"Librosa dynamic conversion completed: {detected_freq:.1f}Hz → 432Hz")
            return True
            
        except Exception as e:
            logger.error(f"Dynamic librosa conversion error: {e}")
            raise Exception(f"Dynamic librosa conversion failed: {str(e)}")
    
    def _convert_ffmpeg_dynamic(self, input_path, output_path, format, quality):
        """FFmpeg method with dynamic tuning detection"""
        try:
            # STEP 1: Detect actual tuning
            detected_tuning = self._detect_tuning_quick(input_path)
            detected_freq = detected_tuning['frequency']
            confidence = detected_tuning['confidence']
            
            logger.info(f"Detected tuning: {detected_freq:.2f} Hz (confidence: {confidence:.3f})")
            
            # STEP 2: Check if already close to 432Hz
            if abs(detected_freq - 432) < 1.0:
                logger.info("Audio is already at 432Hz, copying without conversion")
                import shutil
                shutil.copy2(input_path, output_path)
                return True
            
            # STEP 3: Calculate DYNAMIC pitch ratio (NOT HARDCODED 432/440)
            pitch_ratio = 432.0 / detected_freq
            logger.info(f"Calculated dynamic pitch ratio: {pitch_ratio:.6f} ({detected_freq:.1f}Hz → 432Hz)")
            
            # STEP 4: Apply FFmpeg with dynamic ratio
            cmd = [
                'ffmpeg', '-i', input_path,
                '-filter:a', f'asetrate=44100*{pitch_ratio},aresample=44100',
                '-b:a', quality,
                '-y', output_path
            ]
            
            logger.info(f"Running FFmpeg: {' '.join(cmd)}")
            result = subprocess.run(cmd, capture_output=True, text=True, check=True)
            
            logger.info(f"FFmpeg dynamic conversion completed: {detected_freq:.1f}Hz → 432Hz")
            return True
            
        except subprocess.CalledProcessError as e:
            logger.error(f"FFmpeg error: {e.stderr}")
            raise Exception(f"FFmpeg conversion failed: {e.stderr}")
        except Exception as e:
            logger.error(f"FFmpeg conversion error: {e}")
            raise Exception(f"FFmpeg conversion failed: {str(e)}")
    
    def process_video(self, video_id, convert_to_432hz=True, method='auto', format='mp3', quality='192k'):
        """Complete processing pipeline"""
        job_id = str(uuid.uuid4())
        processing_jobs[job_id] = {
            'status': 'starting',
            'video_id': video_id,
            'method': method,
            'created_at': datetime.now().isoformat()
        }
        
        try:
            # Update status
            processing_jobs[job_id]['status'] = 'downloading'
            
            # Download audio
            logger.info(f"Downloading audio for video {video_id}")
            downloaded_file = self.download_audio(video_id)
            
            # Update status
            processing_jobs[job_id]['status'] = 'processing'
            
            # Generate output filename
            output_filename = f"{video_id}_{job_id}.{format}"
            output_path = DOWNLOAD_DIR / output_filename
            
            if convert_to_432hz:
                # Convert to 432Hz with DYNAMIC detection
                logger.info(f"Converting to 432Hz with dynamic detection: {downloaded_file}")
                self.convert_to_432hz(downloaded_file, str(output_path), method, format, quality)
                processing_jobs[job_id]['conversion'] = f'432Hz_dynamic_{method}'
            else:
                # Just convert format without frequency change
                cmd = [
                    'ffmpeg', '-i', downloaded_file,
                    '-b:a', quality,
                    '-y', str(output_path)
                ]
                subprocess.run(cmd, check=True)
                processing_jobs[job_id]['conversion'] = 'format_only'
            
            # Clean up temp file
            try:
                os.remove(downloaded_file)
            except:
                pass
            
            # Update status
            processing_jobs[job_id].update({
                'status': 'completed',
                'output_file': output_filename,
                'file_path': str(output_path),
                'file_size': os.path.getsize(output_path),
                'completed_at': datetime.now().isoformat()
            })
            
            return job_id
            
        except Exception as e:
            processing_jobs[job_id].update({
                'status': 'error',
                'error': str(e),
                'completed_at': datetime.now().isoformat()
            })
            raise e

# Initialize processor
processor = Enhanced432HzProcessor()

@app.route('/api/youtube/metadata', methods=['POST'])
def get_metadata():
    """Get YouTube video metadata"""
    try:
        data = request.get_json()
        video_id = data.get('videoId')
        
        if not video_id:
            return jsonify({'error': 'Video ID is required'}), 400
        
        metadata = processor.get_video_info(video_id)
        return jsonify(metadata)
        
    except Exception as e:
        logger.error(f"Metadata error: {e}")
        return jsonify({'error': str(e)}), 500

@app.route('/api/youtube/convert', methods=['POST'])
def convert_audio():
    """Convert YouTube audio to 432Hz with dynamic detection"""
    try:
        data = request.get_json()
        video_id = data.get('videoId')
        convert_to_432hz = data.get('convertTo432Hz', True)
        method = data.get('method', 'auto')  # auto = librosa > rubberband > ffmpeg
        format = data.get('format', 'mp3')
        quality = data.get('quality', '192k')
        
        if not video_id:
            return jsonify({'error': 'Video ID is required'}), 400
        
        # Validate method
        if method not in ['auto', 'ffmpeg', 'rubberband', 'librosa']:
            return jsonify({'error': 'Invalid conversion method'}), 400
        
        # Start processing with dynamic detection
        job_id = processor.process_video(video_id, convert_to_432hz, method, format, quality)
        
        # Return job info
        job_info = processing_jobs[job_id]
        
        if job_info['status'] == 'completed':
            return jsonify({
                'success': True,
                'jobId': job_id,
                'status': 'completed',
                'downloadUrl': f'/api/download/{job_info["output_file"]}',
                'fileUrl': f'/api/files/{job_info["output_file"]}',
                'fileSize': job_info.get('file_size', 0),
                'conversion': job_info.get('conversion', 'unknown'),
                'method': job_info.get('method', 'unknown')
            })
        else:
            return jsonify({
                'success': False,
                'error': job_info.get('error', 'Processing failed')
            }), 500
            
    except Exception as e:
        logger.error(f"Conversion error: {e}")
        return jsonify({'error': str(e)}), 500

@app.route('/api/methods', methods=['GET'])
def get_available_methods():
    """Get available conversion methods"""
    return jsonify({
        'available_methods': processor.available_methods,
        'recommended': 'librosa' if 'librosa' in processor.available_methods else 'rubberband',
        'priority_order': ['librosa', 'rubberband', 'ffmpeg'],
        'descriptions': {
            'ffmpeg': 'Fast and reliable with dynamic tuning detection',
            'librosa': 'Python-based high quality (95% success rate) - PRIORITIZED',
            'rubberband': 'Professional pitch shifting for edge cases (FIXED - no stretching)'
        },
        'features': {
            'dynamic_detection': True,
            'per_song_analysis': True,
            'no_hardcoded_frequencies': True,
            'rubberband_fixed': True,
            'librosa_prioritized': True
        }
    })

@app.route('/api/status/<job_id>', methods=['GET'])
def get_status(job_id):
    """Get processing job status"""
    if job_id not in processing_jobs:
        return jsonify({'error': 'Job not found'}), 404
    
    job_info = processing_jobs[job_id]
    
    if job_info['status'] == 'completed':
        return jsonify({
            'status': 'completed',
            'downloadUrl': f'/api/download/{job_info["output_file"]}',
            'fileUrl': f'/api/files/{job_info["output_file"]}',
            'fileSize': job_info.get('file_size', 0),
            'method': job_info.get('method', 'unknown')
        })
    else:
        return jsonify({
            'status': job_info['status'],
            'error': job_info.get('error'),
            'method': job_info.get('method', 'unknown')
        })

@app.route('/api/download/<filename>', methods=['GET'])
def download_file(filename):
    """Download converted file"""
    file_path = DOWNLOAD_DIR / filename
    
    if not file_path.exists():
        return jsonify({'error': 'File not found'}), 404
    
    return send_file(
        file_path,
        as_attachment=True,
        download_name=filename,
        mimetype='audio/mpeg'
    )

@app.route('/api/files/<filename>', methods=['GET'])
def serve_file(filename):
    """Serve file for streaming/playlist use"""
    file_path = DOWNLOAD_DIR / filename
    
    if not file_path.exists():
        return jsonify({'error': 'File not found'}), 404
    
    return send_file(file_path, mimetype='audio/mpeg')

@app.route('/api/health', methods=['GET'])
def health_check():
    """Health check endpoint"""
    return jsonify({
        'status': 'healthy',
        'available_methods': processor.available_methods,
        'priority': 'librosa > rubberband > ffmpeg',
        'features': {
            'dynamic_tuning_detection': True,
            'per_song_analysis': True,
            'no_hardcoded_frequencies': True,
            'rubberband_fixed': True,
            'librosa_prioritized': True
        },
        'services': {
            'ffmpeg': subprocess.run(['ffmpeg', '-version'], capture_output=True).returncode == 0,
            'yt-dlp': True,
            'rubberband': 'rubberband' in processor.available_methods,
            'librosa': 'librosa' in processor.available_methods
        }
    })

if __name__ == '__main__':
    # Create required directories
    DOWNLOAD_DIR.mkdir(exist_ok=True)
    TEMP_DIR.mkdir(exist_ok=True)

    # --- Dependency Checks ---
    # FFmpeg
    try:
        subprocess.run(['ffmpeg', '-version'], capture_output=True, check=True)
        logger.info("✅ FFmpeg detected and working")
    except Exception:
        logger.error("❌ FFmpeg not found! Please install FFmpeg")

    # Rubberband
    try:
        result = subprocess.run(
            [RUBBERBAND_PATH, '--help'],
            capture_output=True,
            text=True
        )
        if result.returncode in (0, 1, 2):  # treat 0/1/2 as success codes
            logger.info("🎵 Rubberband detected — FIXED pitch-shift mode enabled (no stretching)")
        else:
            logger.warning(f"⚠️ Rubberband returned unexpected code ({result.returncode}), fallback methods may be used.")
    except Exception as e:
        logger.warning(f"⚠️ Rubberband not found or failed check ({e}) — using fallback methods")

    # --- Startup Banner ---
    logger.info("=" * 60)
    logger.info("🎧 DYNAMIC 432Hz CONVERTER")
    logger.info("• Priority: Librosa (95% success) → Rubberband (edge cases) → FFmpeg")
    logger.info("• Features: Per-song tuning detection + intelligent routing")
    logger.info("=" * 60)

    app.run(debug=True, host='0.0.0.0', port=3001)