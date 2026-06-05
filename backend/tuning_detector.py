import librosa
import numpy as np
from scipy.fft import rfft, rfftfreq
from scipy import signal

def detect_tuning_simple(filename, duration=30):
    """
    Simple, reliable tuning detection that actually works
    """
    print(f"Analyzing: {filename}")
    
    # Load audio
    y, sr = librosa.load(filename, duration=duration, sr=22050)
    print(f"Loaded {len(y)/sr:.1f} seconds of audio at {sr} Hz")
    
    # Method 1: Direct frequency analysis (most reliable)
    result1 = frequency_peak_analysis(y, sr)
    
    # Method 2: Harmonic content analysis
    result2 = harmonic_content_analysis(y, sr)
    
    # Method 3: Multiple A-note analysis
    result3 = multiple_a_note_analysis(y, sr)
    
    # Combine results intelligently
    final_result = combine_results_smart(result1, result2, result3)
    
    return final_result

def frequency_peak_analysis(y, sr):
    """
    Look for the strongest peak in the A4 region and nearby harmonics
    """
    # Apply window for better frequency resolution
    window = signal.windows.hann(len(y))
    y_windowed = y * window
    
    # High-resolution FFT
    n_fft = max(16384, len(y))
    fft = rfft(y_windowed, n=n_fft)
    freqs = rfftfreq(n_fft, 1/sr)
    power = np.abs(fft)**2
    
    # Find the peak in A4 region (425-450 Hz)
    a4_mask = (freqs >= 425) & (freqs <= 450)
    
    if not np.any(a4_mask):
        return {'method': 'frequency_peak', 'result': 'no_peak', 'confidence': 0}
    
    a4_freqs = freqs[a4_mask]
    a4_power = power[a4_mask]
    peak_idx = np.argmax(a4_power)
    peak_freq = a4_freqs[peak_idx]
    peak_power = a4_power[peak_idx]
    
    # Check how close it is to 440 vs 432
    diff_440 = abs(peak_freq - 440)
    diff_432 = abs(peak_freq - 432)
    
    # Also check for harmonics to increase confidence
    harmonics_440_score = 0
    harmonics_432_score = 0
    
    # Check 2nd and 3rd harmonics
    for harmonic in [2, 3]:
        expected_440 = 440 * harmonic
        expected_432 = 432 * harmonic
        
        if expected_440 < freqs[-1]:  # Within frequency range
            harm_mask = (freqs >= expected_440 - 10) & (freqs <= expected_440 + 10)
            if np.any(harm_mask):
                harmonics_440_score += np.max(power[harm_mask])
        
        if expected_432 < freqs[-1]:
            harm_mask = (freqs >= expected_432 - 10) & (freqs <= expected_432 + 10)
            if np.any(harm_mask):
                harmonics_432_score += np.max(power[harm_mask])
    
    # Make decision
    if diff_440 < diff_432:
        tuning = '440Hz'
        confidence = max(0.1, min(1.0, (diff_432 - diff_440) / 10))
    else:
        tuning = '432Hz' 
        confidence = max(0.1, min(1.0, (diff_440 - diff_432) / 10))
    
    # Boost confidence if harmonics agree
    if harmonics_440_score > harmonics_432_score and tuning == '440Hz':
        confidence *= 1.5
    elif harmonics_432_score > harmonics_440_score and tuning == '432Hz':
        confidence *= 1.5
    
    confidence = min(confidence, 1.0)
    
    return {
        'method': 'frequency_peak',
        'result': tuning,
        'confidence': confidence,
        'peak_freq': float(peak_freq),
        'peak_power': float(peak_power),
        'diff_440': float(diff_440),
        'diff_432': float(diff_432),
        'harmonics_440': float(harmonics_440_score),
        'harmonics_432': float(harmonics_432_score)
    }

def harmonic_content_analysis(y, sr):
    """
    Analyze overall harmonic content for A notes across octaves
    """
    # Get power spectrum
    fft = rfft(y)
    freqs = rfftfreq(len(y), 1/sr)
    power = np.abs(fft)**2
    
    # Define A note frequencies for different octaves
    a_notes_440 = [55, 110, 220, 440, 880, 1760]  # A1 to A6
    a_notes_432 = [54, 108, 216, 432, 864, 1728]
    
    score_440 = 0
    score_432 = 0
    matches_440 = []
    matches_432 = []
    
    for freq_440, freq_432 in zip(a_notes_440, a_notes_432):
        if freq_440 < freqs[-1]:  # Within our frequency range
            # Check 440Hz tuning
            mask_440 = (freqs >= freq_440 - 3) & (freqs <= freq_440 + 3)
            if np.any(mask_440):
                power_440 = np.max(power[mask_440])
                score_440 += power_440
                peak_freq = freqs[mask_440][np.argmax(power[mask_440])]
                matches_440.append((peak_freq, power_440))
        
        if freq_432 < freqs[-1]:
            # Check 432Hz tuning
            mask_432 = (freqs >= freq_432 - 3) & (freqs <= freq_432 + 3)
            if np.any(mask_432):
                power_432 = np.max(power[mask_432])
                score_432 += power_432
                peak_freq = freqs[mask_432][np.argmax(power[mask_432])]
                matches_432.append((peak_freq, power_432))
    
    total_score = score_440 + score_432
    if total_score == 0:
        return {'method': 'harmonic_content', 'result': 'no_harmonics', 'confidence': 0}
    
    confidence = abs(score_440 - score_432) / total_score
    tuning = '440Hz' if score_440 > score_432 else '432Hz'
    
    return {
        'method': 'harmonic_content',
        'result': tuning,
        'confidence': confidence,
        'score_440': float(score_440),
        'score_432': float(score_432),
        'matches_440': len(matches_440),
        'matches_432': len(matches_432)
    }

def multiple_a_note_analysis(y, sr):
    """
    Look for multiple A notes and see which tuning they're closer to on average
    """
    # Use chromagram to find note content
    chroma = librosa.feature.chroma_stft(y=y, sr=sr, hop_length=2048)
    
    # A is index 9 in chromagram
    a_strength = np.mean(chroma[9])
    overall_strength = np.mean(chroma)
    
    if overall_strength == 0:
        return {'method': 'multiple_a_note', 'result': 'no_notes', 'confidence': 0}
    
    a_prominence = a_strength / overall_strength
    
    # Simple heuristic based on A note prominence
    if a_prominence > 0.15:  # A notes are prominent
        confidence = min(a_prominence, 0.8)
        # This method can't distinguish 440 vs 432, so we return neutral
        return {
            'method': 'multiple_a_note',
            'result': 'a_notes_present',
            'confidence': confidence,
            'a_prominence': float(a_prominence)
        }
    else:
        return {'method': 'multiple_a_note', 'result': 'weak_a_notes', 'confidence': 0}

def combine_results_smart(result1, result2, result3):
    """
    Intelligently combine the three analysis results
    """
    # Method 1: Frequency peak (most reliable)
    if result1['confidence'] > 0.3 and result1['result'] in ['440Hz', '432Hz']:
        final_result = result1['result']
        final_confidence = result1['confidence']
        reason = "High confidence frequency peak analysis"
    
    # If method 1 has medium confidence and method 2 agrees, combine them
    elif (result1['confidence'] > 0.1 and result1['result'] in ['440Hz', '432Hz'] and 
          result2['result'] == result1['result'] and result2['confidence'] > 0.1):
        final_result = result1['result']
        final_confidence = (result1['confidence'] + result2['confidence']) / 2
        reason = "Agreement between frequency peak and harmonic analysis"
    
    # If method 1 has any confidence, use it
    elif result1['confidence'] > 0.05 and result1['result'] in ['440Hz', '432Hz']:
        final_result = result1['result']
        final_confidence = result1['confidence']
        reason = "Frequency peak analysis (low confidence)"
    
    # Fall back to harmonic analysis
    elif result2['confidence'] > 0.1 and result2['result'] in ['440Hz', '432Hz']:
        final_result = result2['result']
        final_confidence = result2['confidence']
        reason = "Harmonic content analysis"
    
    else:
        final_result = "Unable to determine"
        final_confidence = 0
        reason = "Insufficient reliable data"
    
    return {
        'tuning': final_result,
        'confidence': final_confidence,
        'reasoning': reason,
        'method_results': {
            'frequency_peak': result1,
            'harmonic_content': result2,
            'multiple_a_note': result3
        }
    }

def quick_check_only(filename):
    """
    Just the quick check for speed
    """
    y, sr = librosa.load(filename, duration=10, sr=16000)
    
    fft = rfft(y)
    freqs = rfftfreq(len(y), 1/sr)
    power = np.abs(fft)**2
    
    # Check A4 region
    a4_mask = (freqs >= 425) & (freqs <= 450)
    if not np.any(a4_mask):
        return "No A4 frequency detected"
    
    peak_freq = freqs[a4_mask][np.argmax(power[a4_mask])]
    
    if abs(peak_freq - 432) < abs(peak_freq - 440):
        return f"432Hz"
    else:
        return f"440Hz"
