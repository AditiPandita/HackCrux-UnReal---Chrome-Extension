"""
UnReal Audio Deepfake Detector
Analyzes audio from videos to detect synthetic/AI-generated voices

Run with: python audio_detector.py
API endpoint: POST http://localhost:8002/analyze-audio
"""

from flask import Flask, request, jsonify
from flask_cors import CORS
import librosa
import numpy as np
import tempfile
import subprocess
import os
import warnings

# Suppress librosa warnings
warnings.filterwarnings('ignore')

app = Flask(__name__)
CORS(app)

# ═══════════════════════════════════════════════════════════════
# AUDIO FEATURE EXTRACTION
# ═══════════════════════════════════════════════════════════════

def extract_audio_from_video(video_url: str, temp_dir: str) -> str:
    """
    Extract audio track from video URL using yt-dlp and FFmpeg
    Returns path to extracted audio file
    """
    audio_path = os.path.join(temp_dir, "audio.wav")
    
    try:
        # Use yt-dlp to download and extract audio
        cmd = [
            "yt-dlp",
            "-x",  # Extract audio
            "--audio-format", "wav",
            "--audio-quality", "0",
            "-o", os.path.join(temp_dir, "audio.%(ext)s"),
            "--no-playlist",
            "--max-filesize", "50M",
            video_url
        ]
        
        result = subprocess.run(
            cmd,
            capture_output=True,
            text=True,
            timeout=120
        )
        
        if result.returncode != 0:
            print(f"[AudioDetector] yt-dlp error: {result.stderr}")
            return None
            
        # Check if audio file was created
        if os.path.exists(audio_path):
            return audio_path
            
        # Try alternate extension
        for ext in ['.wav', '.m4a', '.mp3', '.webm']:
            alt_path = os.path.join(temp_dir, f"audio{ext}")
            if os.path.exists(alt_path):
                # Convert to wav if needed
                if ext != '.wav':
                    subprocess.run([
                        "ffmpeg", "-y", "-i", alt_path,
                        "-ar", "16000", "-ac", "1",
                        audio_path
                    ], capture_output=True, timeout=60)
                    if os.path.exists(audio_path):
                        return audio_path
                else:
                    return alt_path
                    
        return None
        
    except subprocess.TimeoutExpired:
        print("[AudioDetector] Audio extraction timeout")
        return None
    except Exception as e:
        print(f"[AudioDetector] Audio extraction error: {e}")
        return None


def extract_audio_features(audio_path: str) -> dict:
    """
    Extract audio features using Librosa for deepfake detection
    """
    try:
        # Load audio at 16kHz mono
        y, sr = librosa.load(audio_path, sr=16000, mono=True, duration=60)
        
        if len(y) < sr:  # Less than 1 second of audio
            return None
            
        features = {}
        
        # 1. MFCC Analysis (Mel-frequency cepstral coefficients)
        # AI voices often have distinct MFCC patterns
        mfccs = librosa.feature.mfcc(y=y, sr=sr, n_mfcc=13)
        features['mfcc_mean'] = float(np.mean(mfccs))
        features['mfcc_std'] = float(np.std(mfccs))
        features['mfcc_variance'] = float(np.var(mfccs))
        
        # 2. Spectral Centroid (brightness of sound)
        # Synthetic voices often have unnatural spectral distribution
        spectral_centroid = librosa.feature.spectral_centroid(y=y, sr=sr)
        features['spectral_centroid_mean'] = float(np.mean(spectral_centroid))
        features['spectral_centroid_std'] = float(np.std(spectral_centroid))
        
        # 3. Spectral Bandwidth
        spectral_bandwidth = librosa.feature.spectral_bandwidth(y=y, sr=sr)
        features['spectral_bandwidth_mean'] = float(np.mean(spectral_bandwidth))
        features['spectral_bandwidth_std'] = float(np.std(spectral_bandwidth))
        
        # 4. Spectral Rolloff
        spectral_rolloff = librosa.feature.spectral_rolloff(y=y, sr=sr)
        features['spectral_rolloff_mean'] = float(np.mean(spectral_rolloff))
        
        # 5. Zero Crossing Rate
        # AI voices tend to have more uniform ZCR
        zcr = librosa.feature.zero_crossing_rate(y)
        features['zcr_mean'] = float(np.mean(zcr))
        features['zcr_std'] = float(np.std(zcr))
        features['zcr_variance'] = float(np.var(zcr))
        
        # 6. RMS Energy
        rms = librosa.feature.rms(y=y)
        features['rms_mean'] = float(np.mean(rms))
        features['rms_std'] = float(np.std(rms))
        
        # 7. Pitch Analysis (Fundamental Frequency)
        # AI voices often have unnaturally consistent pitch
        pitches, magnitudes = librosa.piptrack(y=y, sr=sr)
        pitch_values = pitches[pitches > 0]
        if len(pitch_values) > 0:
            features['pitch_mean'] = float(np.mean(pitch_values))
            features['pitch_std'] = float(np.std(pitch_values))
            features['pitch_variance'] = float(np.var(pitch_values))
        else:
            features['pitch_mean'] = 0
            features['pitch_std'] = 0
            features['pitch_variance'] = 0
            
        # 8. Spectral Flatness (how noise-like vs tonal)
        spectral_flatness = librosa.feature.spectral_flatness(y=y)
        features['spectral_flatness_mean'] = float(np.mean(spectral_flatness))
        
        # 9. Chroma Features
        chroma = librosa.feature.chroma_stft(y=y, sr=sr)
        features['chroma_mean'] = float(np.mean(chroma))
        features['chroma_std'] = float(np.std(chroma))
        
        # 10. Tempo consistency
        tempo, _ = librosa.beat.beat_track(y=y, sr=sr)
        features['tempo'] = float(tempo) if not np.isnan(tempo) else 0
        
        return features
        
    except Exception as e:
        print(f"[AudioDetector] Feature extraction error: {e}")
        return None


# ═══════════════════════════════════════════════════════════════
# DEEPFAKE DETECTION SCORING
# ═══════════════════════════════════════════════════════════════

def calculate_deepfake_score(features: dict) -> dict:
    """
    Calculate deepfake probability score based on audio features
    Returns score 0-100 (higher = more likely AI-generated)
    """
    if not features:
        return {'score': 50, 'confidence': 0, 'indicators': ['No audio features extracted']}
    
    indicators = []
    score_components = []
    
    # 1. Pitch Consistency Check (Weight: 25%)
    # AI voices have unnaturally consistent pitch (low variance)
    pitch_std = features.get('pitch_std', 0)
    if pitch_std < 20:  # Very consistent pitch
        pitch_score = 85
        indicators.append("Very consistent pitch (AI signature)")
    elif pitch_std < 40:
        pitch_score = 60
        indicators.append("Low pitch variation")
    elif pitch_std < 80:
        pitch_score = 40
    else:
        pitch_score = 20
        indicators.append("Natural pitch variation")
    score_components.append(('pitch', pitch_score, 0.25))
    
    # 2. Spectral Smoothness (Weight: 20%)
    # AI audio often has smoother spectral characteristics
    spectral_bandwidth_std = features.get('spectral_bandwidth_std', 0)
    if spectral_bandwidth_std < 200:
        spectral_score = 80
        indicators.append("Unnaturally smooth spectrum")
    elif spectral_bandwidth_std < 400:
        spectral_score = 55
    else:
        spectral_score = 25
        indicators.append("Natural spectral variation")
    score_components.append(('spectral', spectral_score, 0.20))
    
    # 3. MFCC Variance (Weight: 20%)
    # Low MFCC variance can indicate synthetic speech
    mfcc_variance = features.get('mfcc_variance', 0)
    if mfcc_variance < 50:
        mfcc_score = 75
        indicators.append("Low vocal tract variation")
    elif mfcc_variance < 150:
        mfcc_score = 50
    else:
        mfcc_score = 25
    score_components.append(('mfcc', mfcc_score, 0.20))
    
    # 4. Zero-Crossing Rate Uniformity (Weight: 15%)
    # AI audio tends to have more uniform ZCR
    zcr_std = features.get('zcr_std', 0)
    if zcr_std < 0.01:
        zcr_score = 80
        indicators.append("Uniform zero-crossing (synthetic pattern)")
    elif zcr_std < 0.03:
        zcr_score = 50
    else:
        zcr_score = 25
    score_components.append(('zcr', zcr_score, 0.15))
    
    # 5. Energy Consistency (Weight: 10%)
    # AI voices may have more consistent energy levels
    rms_std = features.get('rms_std', 0)
    if rms_std < 0.01:
        energy_score = 70
        indicators.append("Very consistent energy levels")
    elif rms_std < 0.03:
        energy_score = 45
    else:
        energy_score = 25
    score_components.append(('energy', energy_score, 0.10))
    
    # 6. Spectral Flatness (Weight: 10%)
    # Synthetic audio may have unusual flatness characteristics
    spectral_flatness = features.get('spectral_flatness_mean', 0)
    if spectral_flatness < 0.01 or spectral_flatness > 0.5:
        flatness_score = 65
        indicators.append("Unusual spectral flatness")
    else:
        flatness_score = 30
    score_components.append(('flatness', flatness_score, 0.10))
    
    # Calculate weighted final score
    final_score = sum(score * weight for _, score, weight in score_components)
    
    # Calculate confidence based on feature availability and clarity
    confidence = min(95, 60 + len([i for i in indicators if 'signature' in i.lower() or 'synthetic' in i.lower()]) * 15)
    
    return {
        'score': int(round(final_score)),
        'confidence': confidence,
        'indicators': indicators,
        'component_scores': {name: score for name, score, _ in score_components}
    }


# ═══════════════════════════════════════════════════════════════
# API ENDPOINTS
# ═══════════════════════════════════════════════════════════════

@app.route('/health', methods=['GET'])
def health_check():
    """Health check endpoint"""
    return jsonify({
        'status': 'healthy',
        'service': 'UnReal Audio Detector',
        'version': '1.0.0'
    })


@app.route('/analyze-audio', methods=['POST'])
def analyze_audio():
    """
    Analyze audio from video URL for deepfake detection
    
    Request body:
    {
        "url": "https://twitter.com/user/status/123..."
    }
    
    Response:
    {
        "success": true,
        "score": 75,
        "confidence": 80,
        "indicators": ["Very consistent pitch (AI signature)", ...],
        "has_audio": true
    }
    """
    try:
        data = request.get_json()
        if not data or 'url' not in data:
            return jsonify({
                'success': False,
                'error': 'Missing url parameter'
            }), 400
            
        video_url = data['url']
        print(f"[AudioDetector] Analyzing: {video_url[:80]}...")
        
        # Create temp directory for audio extraction
        with tempfile.TemporaryDirectory() as temp_dir:
            # Extract audio from video
            audio_path = extract_audio_from_video(video_url, temp_dir)
            
            if not audio_path:
                print("[AudioDetector] No audio track found")
                return jsonify({
                    'success': True,
                    'score': 50,  # Neutral score when no audio
                    'confidence': 0,
                    'indicators': ['No audio track found'],
                    'has_audio': False
                })
            
            print(f"[AudioDetector] Audio extracted: {audio_path}")
            
            # Extract features
            features = extract_audio_features(audio_path)
            
            if not features:
                return jsonify({
                    'success': True,
                    'score': 50,
                    'confidence': 0,
                    'indicators': ['Audio too short or corrupted'],
                    'has_audio': False
                })
            
            # Calculate deepfake score
            result = calculate_deepfake_score(features)
            
            print(f"[AudioDetector] Score: {result['score']}%, Confidence: {result['confidence']}%")
            
            return jsonify({
                'success': True,
                'score': result['score'],
                'confidence': result['confidence'],
                'indicators': result['indicators'],
                'component_scores': result.get('component_scores', {}),
                'has_audio': True
            })
            
    except Exception as e:
        print(f"[AudioDetector] Error: {e}")
        return jsonify({
            'success': False,
            'error': str(e)
        }), 500


# ═══════════════════════════════════════════════════════════════
# MAIN
# ═══════════════════════════════════════════════════════════════

if __name__ == '__main__':
    print("=" * 60)
    print("UnReal Audio Deepfake Detector v1.0.0")
    print("=" * 60)
    print("Endpoints:")
    print("  POST http://localhost:8002/analyze-audio")
    print("  GET  http://localhost:8002/health")
    print("=" * 60)
    
    app.run(host='0.0.0.0', port=8002, debug=False)
