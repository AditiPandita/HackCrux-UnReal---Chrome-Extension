"""
UnReal ML Backend Server
Hosts the AI image detection model and provides API for Chrome extension

Run with: python server.py
API endpoint: POST http://localhost:8000/analyze
Video API: POST http://localhost:8000/analyze-video
"""

from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
import torch
from transformers import AutoModelForImageClassification, AutoImageProcessor
from PIL import Image
import base64
import io
import uvicorn
import time
import tempfile
import subprocess
import os
import cv2
import numpy as np
import sqlite3
import hashlib
import json
import httpx
import asyncio
from datetime import datetime
from typing import Optional

app = FastAPI(title="UnReal ML Backend", version="1.1.0")

# Enable CORS for Chrome extension
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # Allow all origins for local dev
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Global model variables
model = None
processor = None
device = None

# Use local model path (relative to this script)
SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))
# Using the available model in the model directory
MODEL_PATH = os.path.join(SCRIPT_DIR, "model")
MODEL_NAME = "unreal-social-media-tuned"  # Custom fine-tuned model
FALLBACK_MODEL_ID = "dima806/ai_vs_real_image_detection"
loaded_model_name = MODEL_NAME
CACHE_DB_PATH = os.path.join(SCRIPT_DIR, "video_cache.db")


# ═══════════════════════════════════════════════════════════════
# VIDEO CACHE FUNCTIONS
# ═══════════════════════════════════════════════════════════════

def init_cache_db():
    """Initialize SQLite cache database"""
    conn = sqlite3.connect(CACHE_DB_PATH)
    cursor = conn.cursor()
    cursor.execute('''
        CREATE TABLE IF NOT EXISTS video_cache (
            url_hash TEXT PRIMARY KEY,
            url TEXT NOT NULL,
            score INTEGER NOT NULL,
            confidence INTEGER NOT NULL,
            frames_analyzed INTEGER NOT NULL,
            frame_scores TEXT NOT NULL,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )
    ''')
    conn.commit()
    conn.close()
    print(f"[Cache] Database initialized at {CACHE_DB_PATH}")


def get_url_hash(url: str) -> str:
    """Generate MD5 hash of URL for cache key"""
    return hashlib.md5(url.encode()).hexdigest()


def get_video_cache(url: str) -> Optional[dict]:
    """Check if video URL exists in cache, return cached result or None"""
    try:
        url_hash = get_url_hash(url)
        conn = sqlite3.connect(CACHE_DB_PATH)
        cursor = conn.cursor()
        cursor.execute(
            'SELECT score, confidence, frames_analyzed, frame_scores, created_at FROM video_cache WHERE url_hash = ?',
            (url_hash,)
        )
        row = cursor.fetchone()
        conn.close()
        
        if row:
            return {
                'score': row[0],
                'confidence': row[1],
                'framesAnalyzed': row[2],
                'frameScores': json.loads(row[3]),
                'createdAt': row[4]
            }
        return None
    except Exception as e:
        print(f"[Cache] Error reading cache: {e}")
        return None


def set_video_cache(url: str, score: int, confidence: int, frames_analyzed: int, frame_scores: list) -> bool:
    """Store video analysis result in cache"""
    try:
        url_hash = get_url_hash(url)
        conn = sqlite3.connect(CACHE_DB_PATH)
        cursor = conn.cursor()
        cursor.execute('''
            INSERT OR REPLACE INTO video_cache 
            (url_hash, url, score, confidence, frames_analyzed, frame_scores, created_at)
            VALUES (?, ?, ?, ?, ?, ?, ?)
        ''', (url_hash, url, score, confidence, frames_analyzed, json.dumps(frame_scores), datetime.now().isoformat()))
        conn.commit()
        conn.close()
        print(f"[Cache] Stored result for {url[:50]}...")
        return True
    except Exception as e:
        print(f"[Cache] Error writing cache: {e}")
        return False


def get_cache_stats() -> dict:
    """Get cache statistics"""
    try:
        conn = sqlite3.connect(CACHE_DB_PATH)
        cursor = conn.cursor()
        cursor.execute('SELECT COUNT(*) FROM video_cache')
        count = cursor.fetchone()[0]
        cursor.execute('SELECT url, score, created_at FROM video_cache ORDER BY created_at DESC LIMIT 5')
        recent = [{'url': row[0][:60] + '...' if len(row[0]) > 60 else row[0], 'score': row[1], 'createdAt': row[2]} for row in cursor.fetchall()]
        conn.close()
        return {'count': count, 'recent': recent}
    except Exception as e:
        print(f"[Cache] Error getting stats: {e}")
        return {'count': 0, 'recent': [], 'error': str(e)}


class ImageRequest(BaseModel):
    image: str  # Base64 encoded image
    

class VideoRequest(BaseModel):
    url: str  # Video URL to analyze
    max_duration: int = 30  # Max seconds to analyze


class AnalysisResponse(BaseModel):
    success: bool
    score: int  # 0-100, AI likelihood
    confidence: int
    realScore: int
    fakeScore: int
    processingTime: int  # milliseconds
    modelName: str
    error: str = None


class VideoAnalysisResponse(BaseModel):
    success: bool
    score: int
    confidence: int
    framesAnalyzed: int
    frameScores: list
    processingTime: int
    cached: bool = False
    # Audio analysis fields (Optional - can be None when audio unavailable)
    audioScore: Optional[int] = None
    audioConfidence: Optional[int] = None
    audioIndicators: Optional[list] = None
    hasAudio: bool = False
    error: Optional[str] = None


@app.on_event("startup")
async def load_model():
    """Load the ML model on server startup"""
    global model, processor, device, loaded_model_name
    
    print(f"[ML Backend] Loading model: {MODEL_NAME}")
    start_time = time.time()
    
    try:
        # Determine device
        # NOTE: Forcing CPU mode because RTX 5050 (Blackwell/SM 12.x) requires 
        # CUDA 12.8+ and PyTorch doesn't have pre-built binaries for it yet.
        # Once PyTorch adds Blackwell support, this can be changed back.
        device = torch.device("cpu")
        print("[ML Backend] Using CPU (CUDA disabled for RTX 5050 compatibility)")
        
        # Load local fine-tuned model when available, otherwise download fallback.
        if os.path.isdir(MODEL_PATH):
            print(f"[ML Backend] Loading from local path: {MODEL_PATH}")
            model = AutoModelForImageClassification.from_pretrained(
                MODEL_PATH,
                local_files_only=True
            )
            processor = AutoImageProcessor.from_pretrained(
                MODEL_PATH,
                local_files_only=True
            )
            loaded_model_name = MODEL_NAME
        else:
            print(f"[ML Backend] Local model not found at {MODEL_PATH}")
            print(f"[ML Backend] Falling back to Hugging Face model: {FALLBACK_MODEL_ID}")
            model = AutoModelForImageClassification.from_pretrained(FALLBACK_MODEL_ID)
            processor = AutoImageProcessor.from_pretrained(FALLBACK_MODEL_ID)
            loaded_model_name = FALLBACK_MODEL_ID
        
        # Move model to device
        model = model.to(device)
        model.eval()
        
        load_time = time.time() - start_time
        print(f"[ML Backend] Model loaded successfully in {load_time:.2f}s")
        print(f"[ML Backend] Model labels: {model.config.id2label}")
        
    except Exception as e:
        print(f"[ML Backend] Failed to load model: {e}")
        raise e
    
    # Initialize video cache database
    init_cache_db()


@app.get("/")
async def root():
    """Health check endpoint"""
    return {
        "status": "running",
        "model": loaded_model_name,
        "device": str(device) if device else "not loaded",
        "endpoints": ["/analyze", "/analyze-video", "/health", "/cache/stats"]
    }


@app.get("/health")
async def health():
    """Health check for the extension"""
    return {
        "status": "ok",
        "modelLoaded": model is not None,
        "model": loaded_model_name
    }


def _normalize_image_for_processor(image: Image.Image) -> Image.Image:
    """Match image channel count to the loaded processor expectations."""
    expected_channels = len(getattr(processor, "image_mean", []) or [])
    if expected_channels == 1:
        return image.convert("L")
    return image.convert("RGB")


@app.post("/analyze", response_model=AnalysisResponse)
async def analyze_image(request: ImageRequest):
    """
    Analyze an image for AI-generated content
    
    Expects base64 encoded image in request body
    Returns score 0-100 where higher = more likely AI-generated
    """
    start_time = time.time()
    
    if model is None or processor is None:
        raise HTTPException(status_code=503, detail="Model not loaded")
    
    try:
        # Decode base64 image
        image_data = request.image
        
        # Handle data URL format
        if "," in image_data:
            image_data = image_data.split(",")[1]
        
        # Decode and open image
        image_bytes = base64.b64decode(image_data)
        image = Image.open(io.BytesIO(image_bytes))
        image = _normalize_image_for_processor(image)
        
        # Preprocess image
        inputs = processor(images=image, return_tensors="pt")
        inputs = {k: v.to(device) for k, v in inputs.items()}
        
        # Run inference
        with torch.no_grad():
            outputs = model(**inputs)
            logits = outputs.logits
            
            # Apply softmax
            probs = torch.nn.functional.softmax(logits, dim=-1)
            probs = probs.cpu().numpy()[0]
        
        # Get scores (label 0 = Real, label 1 = Fake)
        real_prob = float(probs[0])
        fake_prob = float(probs[1])
        
        # Calculate scores
        score = int(fake_prob * 100)  # AI likelihood score
        confidence = int(abs(fake_prob - real_prob) * 100)
        
        processing_time = int((time.time() - start_time) * 1000)
        
        print(f"[ML Backend] Analysis complete: score={score}%, confidence={confidence}%, time={processing_time}ms")
        
        return AnalysisResponse(
            success=True,
            score=score,
            confidence=confidence,
            realScore=int(real_prob * 100),
            fakeScore=int(fake_prob * 100),
            processingTime=processing_time,
            modelName=loaded_model_name
        )
        
    except Exception as e:
        print(f"[ML Backend] Analysis error: {e}")
        return AnalysisResponse(
            success=False,
            score=0,
            confidence=0,
            realScore=0,
            fakeScore=0,
            processingTime=int((time.time() - start_time) * 1000),
            modelName=loaded_model_name,
            error=str(e)
        )


def analyze_frame(frame_image):
    """Analyze a single frame (PIL Image) and return score"""
    global model, processor, device
    
    try:
        processed_image = _normalize_image_for_processor(frame_image)
        inputs = processor(images=processed_image, return_tensors="pt")
        inputs = {k: v.to(device) for k, v in inputs.items()}
        
        with torch.no_grad():
            outputs = model(**inputs)
            probs = torch.nn.functional.softmax(outputs.logits, dim=-1)
            probs = probs.cpu().numpy()[0]
        
        return int(probs[1] * 100)  # Fake probability as score
    except Exception as e:
        print(f"[ML Backend] Frame analysis error: {e}")
        return 50  # Default to uncertain


@app.post("/analyze-video", response_model=VideoAnalysisResponse)
async def analyze_video(request: VideoRequest):
    """
    Analyze a video for AI-generated content
    
    1. Downloads first N seconds of video using yt-dlp
    2. Extracts frames using OpenCV
    3. Analyzes each frame with ML model
    4. Returns average score
    """
    start_time = time.time()
    
    if model is None or processor is None:
        raise HTTPException(status_code=503, detail="Model not loaded")
    
    print(f"[ML Backend] Analyzing video: {request.url[:60]}...")
    
    # Check cache first
    cached_result = get_video_cache(request.url)
    if cached_result:
        print(f"[ML Backend] Cache HIT for video!")
        return VideoAnalysisResponse(
            success=True,
            score=cached_result['score'],
            confidence=cached_result['confidence'],
            framesAnalyzed=cached_result['framesAnalyzed'],
            frameScores=cached_result['frameScores'],
            processingTime=0,
            cached=True
        )
    
    print(f"[ML Backend] Cache MISS - downloading and analyzing...")
    
    temp_dir = None
    try:
        # Create temp directory
        temp_dir = tempfile.mkdtemp(prefix="unreal_video_")
        video_path = os.path.join(temp_dir, "video.mp4")
        
        # Download video using yt-dlp (first 30 seconds)
        print("[ML Backend] Downloading video...")
        download_cmd = [
            "yt-dlp",
            "--no-playlist",
            "--format", "best[ext=mp4]/best",
            "--output", video_path,
            "--no-warnings",
            "--quiet",
            # Limit duration (yt-dlp doesn't have exact limit, but we'll handle in CV2)
            request.url
        ]
        
        result = subprocess.run(
            download_cmd, 
            capture_output=True, 
            text=True, 
            timeout=60  # 60 second timeout for download
        )
        
        if not os.path.exists(video_path):
            # Try with different format
            download_cmd[3] = "best"
            result = subprocess.run(download_cmd, capture_output=True, text=True, timeout=60)
        
        if not os.path.exists(video_path):
            print(f"[ML Backend] yt-dlp failed: {result.stderr}")
            return VideoAnalysisResponse(
                success=False,
                score=0,
                confidence=0,
                framesAnalyzed=0,
                frameScores=[],
                processingTime=int((time.time() - start_time) * 1000),
                error=f"Failed to download video: {result.stderr[:200]}"
            )
        
        print(f"[ML Backend] Video downloaded: {os.path.getsize(video_path)} bytes")
        
        # Start audio analysis IMMEDIATELY in parallel (don't wait for frame analysis)
        audio_task = None
        try:
            print("[ML Backend] Starting audio analysis in parallel...")
            async def fetch_audio_analysis():
                try:
                    async with httpx.AsyncClient(timeout=90.0) as client:
                        resp = await client.post(
                            "http://localhost:8002/analyze-audio",
                            json={"url": request.url}
                        )
                        if resp.status_code == 200:
                            return resp.json()
                except Exception as e:
                    print(f"[ML Backend] Audio fetch error: {e}")
                return None
            audio_task = asyncio.create_task(fetch_audio_analysis())
        except Exception as e:
            print(f"[ML Backend] Could not start audio task: {e}")
        
        # Open video with OpenCV
        cap = cv2.VideoCapture(video_path)
        if not cap.isOpened():
            return VideoAnalysisResponse(
                success=False,
                score=0,
                confidence=0,
                framesAnalyzed=0,
                frameScores=[],
                processingTime=int((time.time() - start_time) * 1000),
                error="Could not open video file"
            )
        
        fps = cap.get(cv2.CAP_PROP_FPS) or 30
        total_frames = int(cap.get(cv2.CAP_PROP_FRAME_COUNT))
        duration = total_frames / fps
        
        print(f"[ML Backend] Video info: {duration:.1f}s, {fps:.1f}fps, {total_frames} frames")
        
        # Extract frames at 5-second intervals (max 6 frames from first 30s)
        max_time = min(duration, request.max_duration)
        frame_times = [i * 5 for i in range(int(max_time / 5) + 1)]
        frame_times = [t for t in frame_times if t < max_time][:6]  # Max 6 frames
        
        print(f"[ML Backend] Extracting frames at: {frame_times} seconds")
        
        frame_scores = []
        for t in frame_times:
            frame_num = int(t * fps)
            cap.set(cv2.CAP_PROP_POS_FRAMES, frame_num)
            ret, frame = cap.read()
            
            if ret:
                # Convert BGR to RGB, then to PIL
                frame_rgb = cv2.cvtColor(frame, cv2.COLOR_BGR2RGB)
                pil_image = Image.fromarray(frame_rgb)
                
                # Analyze frame
                score = analyze_frame(pil_image)
                frame_scores.append({"time": t, "score": score})
                print(f"[ML Backend] Frame at {t}s: score={score}%")
        
        cap.release()
        
        if not frame_scores:
            return VideoAnalysisResponse(
                success=False,
                score=0,
                confidence=0,
                framesAnalyzed=0,
                frameScores=[],
                processingTime=int((time.time() - start_time) * 1000),
                error="Could not extract any frames"
            )
        
        # Calculate frame score (average of all frame scores)
        avg_frame_score = sum(f["score"] for f in frame_scores) / len(frame_scores)
        
        # Calculate confidence based on score variance
        scores = [f["score"] for f in frame_scores]
        variance = np.var(scores)
        frame_confidence = max(0, min(100, 100 - int(variance / 2)))
        
        # Get audio analysis result (was running in parallel)
        audio_score = None
        audio_confidence = None
        audio_indicators = None
        has_audio = False
        
        if audio_task:
            try:
                audio_data = await audio_task
                if audio_data and audio_data.get('success'):
                    audio_score = audio_data.get('score')
                    audio_confidence = audio_data.get('confidence')
                    audio_indicators = audio_data.get('indicators', [])
                    has_audio = audio_data.get('has_audio', False)
                    print(f"[ML Backend] Audio analysis complete: score={audio_score}%, confidence={audio_confidence}%")
            except Exception as audio_error:
                print(f"[ML Backend] Audio analysis failed: {audio_error}")
        
        # Calculate final combined score
        if has_audio and audio_score is not None:
            # Combined: 60% frame analysis + 40% audio analysis
            final_score = int(avg_frame_score * 0.6 + audio_score * 0.4)
            # Combined confidence
            final_confidence = int(frame_confidence * 0.6 + audio_confidence * 0.4)
        else:
            # No audio - use frame score only
            final_score = int(avg_frame_score)
            final_confidence = frame_confidence
        
        processing_time = int((time.time() - start_time) * 1000)
        
        print(f"[ML Backend] Video analysis complete: score={final_score}%, confidence={final_confidence}%, time={processing_time}ms")
        
        # Store in cache
        set_video_cache(request.url, final_score, final_confidence, len(frame_scores), frame_scores)
        
        return VideoAnalysisResponse(
            success=True,
            score=final_score,
            confidence=final_confidence,
            framesAnalyzed=len(frame_scores),
            frameScores=frame_scores,
            processingTime=processing_time,
            cached=False,
            audioScore=audio_score,
            audioConfidence=audio_confidence,
            audioIndicators=audio_indicators,
            hasAudio=has_audio
        )
        
    except subprocess.TimeoutExpired:
        return VideoAnalysisResponse(
            success=False,
            score=0,
            confidence=0,
            framesAnalyzed=0,
            frameScores=[],
            processingTime=int((time.time() - start_time) * 1000),
            error="Video download timed out"
        )
    except Exception as e:
        print(f"[ML Backend] Video analysis error: {e}")
        return VideoAnalysisResponse(
            success=False,
            score=0,
            confidence=0,
            framesAnalyzed=0,
            frameScores=[],
            processingTime=int((time.time() - start_time) * 1000),
            error=str(e)
        )
    finally:
        # Cleanup temp files
        if temp_dir and os.path.exists(temp_dir):
            try:
                import shutil
                shutil.rmtree(temp_dir)
            except:
                pass


@app.get("/cache/stats")
async def cache_stats():
    """Get video cache statistics"""
    stats = get_cache_stats()
    return {
        "status": "ok",
        "videoCacheCount": stats['count'],
        "recentVideos": stats['recent']
    }


# ═══════════════════════════════════════════════════════════════
# NEWS VERIFICATION - GOOGLE SEARCH
# ═══════════════════════════════════════════════════════════════

# Trusted news sources database
TRUSTED_NEWS_SOURCES = {
    'tier1': [
        # Wire services
        'reuters.com', 'apnews.com', 'afp.com', 'pti.com', 'ptinews.com',
        # Major international
        'bbc.com', 'bbc.co.uk', 'nytimes.com', 'washingtonpost.com',
        'theguardian.com', 'economist.com', 'ft.com', 'wsj.com',
        # Indian - Major national dailies
        'thehindu.com', 'indianexpress.com', 'hindustantimes.com',
        'timesofindia.indiatimes.com', 'economictimes.indiatimes.com',
        'livemint.com', 'business-standard.com', 'deccanherald.com',
        'telegraphindia.com', 'thestatesman.com', 'tribuneindia.com',
        # Indian - TV News
        'ndtv.com', 'news18.com', 'indiatoday.in', 'aajtak.in',
        # Government & official
        'gov.uk', 'gov.in', 'pib.gov.in', 'who.int', 'un.org', 'europa.eu',
        # Fact checkers
        'snopes.com', 'factcheck.org', 'politifact.com', 'fullfact.org',
        'altnews.in', 'boomlive.in', 'factchecker.in', 'thequint.com/news/webqoof'
    ],
    'tier2': [
        # Major broadcasters
        'cnn.com', 'nbcnews.com', 'cbsnews.com', 'abcnews.go.com',
        'npr.org', 'pbs.org', 'cbc.ca', 'abc.net.au',
        # Newspapers
        'usatoday.com', 'latimes.com', 'chicagotribune.com',
        # International
        'dw.com', 'france24.com', 'aljazeera.com', 'scmp.com',
        # Magazines
        'time.com', 'newsweek.com', 'theatlantic.com', 'newyorker.com',
        # Indian - Digital & Regional
        'firstpost.com', 'scroll.in', 'thewire.in', 'theprint.in',
        'thequint.com', 'moneycontrol.com', 'outlookindia.com',
        'deccanchronicle.com', 'newindianexpress.com', 'dnaindia.com',
        'mid-day.com', 'mumbaimirror.indiatimes.com', 'bangaloremirror.indiatimes.com'
    ],
    'tier3': [
        'politico.com', 'axios.com', 'thehill.com', 'vox.com',
        'buzzfeednews.com', 'vice.com', 'huffpost.com',
        'euronews.com', 'channelnewsasia.com'
    ]
}

UNRELIABLE_SOURCES = [
    'theonion.com', 'babylonbee.com', 'clickhole.com',
    'infowars.com', 'naturalnews.com', 'beforeitsnews.com',
    'worldnewsdailyreport.com', 'empirenews.net', 'huzlers.com'
]

# News search cache
news_cache = {}
NEWS_CACHE_DURATION = 30 * 60  # 30 minutes


class NewsSearchRequest(BaseModel):
    headline: str
    max_results: int = 15


class NewsVerificationResponse(BaseModel):
    success: bool
    headline: str
    verified: bool
    confidence: int
    trusted_sources: list
    unreliable_sources: list
    all_sources: list
    recommendation: str
    reasoning: list
    cached: bool = False
    error: Optional[str] = None


def get_trust_tier(domain: str) -> str:
    """Get the trust tier for a domain"""
    domain = domain.lower().replace('www.', '')
    
    if domain in TRUSTED_NEWS_SOURCES['tier1']:
        return 'tier1'
    if domain in TRUSTED_NEWS_SOURCES['tier2']:
        return 'tier2'
    if domain in TRUSTED_NEWS_SOURCES['tier3']:
        return 'tier3'
    if domain in UNRELIABLE_SOURCES:
        return 'unreliable'
    if domain.endswith('.gov') or domain.endswith('.edu') or domain.endswith('.mil'):
        return 'tier1'
    return 'unknown'


def extract_domain(url: str) -> str:
    """Extract domain from URL"""
    try:
        from urllib.parse import urlparse
        parsed = urlparse(url)
        domain = parsed.netloc.lower()
        if domain.startswith('www.'):
            domain = domain[4:]
        return domain
    except:
        return ''


async def search_google_news(headline: str, max_results: int = 15) -> dict:
    """
    Search for a headline using multiple search engines
    Returns list of sources that covered the story
    """
    import re
    from urllib.parse import quote_plus, urlparse, parse_qs, unquote
    
    results = {
        'headline': headline,
        'sources': [],
        'trusted_sources': [],
        'unreliable_sources': [],
        'total_found': 0,
        'search_engine': 'none'
    }
    
    headers = {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
        'Accept-Language': 'en-US,en;q=0.9',
    }
    
    async with httpx.AsyncClient(follow_redirects=True, timeout=20.0) as client:
        
        # Try DuckDuckGo first (more reliable, no CAPTCHA)
        try:
            print(f"[NewsSearch] Searching DuckDuckGo for: {headline[:60]}...")
            ddg_query = quote_plus(headline)
            ddg_url = f"https://html.duckduckgo.com/html/?q={ddg_query}"
            
            response = await client.get(ddg_url, headers=headers)
            
            if response.status_code == 200:
                html = response.text
                results['search_engine'] = 'duckduckgo'
                
                # Extract URLs from DuckDuckGo results
                # DDG uses uddg= parameter for actual URLs
                url_pattern = r'uddg=(https?%3A%2F%2F[^&"]+)'
                matches = re.findall(url_pattern, html)
                
                found_urls = set()
                for match in matches:
                    url = unquote(match)
                    if any(skip in url for skip in ['duckduckgo.com', 'youtube.com/watch', 'google.com']):
                        continue
                    found_urls.add(url)
                
                # Also try direct href patterns
                href_pattern = r'href="(https?://[^"]+)"'
                for url in re.findall(href_pattern, html):
                    if any(skip in url for skip in ['duckduckgo.com', 'youtube.com/watch', 'google.com', 'bing.com']):
                        continue
                    found_urls.add(url)
                
                # Process found URLs
                for url in list(found_urls)[:max_results]:
                    domain = extract_domain(url)
                    if not domain:
                        continue
                    
                    tier = get_trust_tier(domain)
                    source_info = {
                        'url': url,
                        'domain': domain,
                        'tier': tier,
                        'trusted': tier in ['tier1', 'tier2', 'tier3']
                    }
                    
                    if not any(s['domain'] == domain for s in results['sources']):
                        results['sources'].append(source_info)
                        if tier in ['tier1', 'tier2', 'tier3']:
                            results['trusted_sources'].append(source_info)
                        elif tier == 'unreliable':
                            results['unreliable_sources'].append(source_info)
                
                results['total_found'] = len(results['sources'])
                print(f"[NewsSearch] DuckDuckGo found {results['total_found']} sources, {len(results['trusted_sources'])} trusted")
                
                if results['total_found'] > 0:
                    return results
                    
        except Exception as e:
            print(f"[NewsSearch] DuckDuckGo error: {e}")
        
        # Try Bing as backup
        try:
            print(f"[NewsSearch] Trying Bing...")
            bing_query = quote_plus(headline)
            bing_url = f"https://www.bing.com/news/search?q={bing_query}&FORM=HDRSC6"
            
            response = await client.get(bing_url, headers=headers)
            
            if response.status_code == 200:
                html = response.text
                results['search_engine'] = 'bing'
                
                # Extract URLs from Bing news
                url_pattern = r'href="(https?://[^"]+)"'
                found_urls = set()
                
                for url in re.findall(url_pattern, html):
                    if any(skip in url for skip in ['bing.com', 'microsoft.com', 'msn.com/click', 'youtube.com/watch', 'google.com']):
                        continue
                    found_urls.add(url)
                
                for url in list(found_urls)[:max_results]:
                    domain = extract_domain(url)
                    if not domain:
                        continue
                    
                    tier = get_trust_tier(domain)
                    source_info = {
                        'url': url,
                        'domain': domain,
                        'tier': tier,
                        'trusted': tier in ['tier1', 'tier2', 'tier3']
                    }
                    
                    if not any(s['domain'] == domain for s in results['sources']):
                        results['sources'].append(source_info)
                        if tier in ['tier1', 'tier2', 'tier3']:
                            results['trusted_sources'].append(source_info)
                        elif tier == 'unreliable':
                            results['unreliable_sources'].append(source_info)
                
                results['total_found'] = len(results['sources'])
                print(f"[NewsSearch] Bing found {results['total_found']} sources, {len(results['trusted_sources'])} trusted")
                
        except Exception as e:
            print(f"[NewsSearch] Bing error: {e}")
    
    return results


def detect_negation_manipulation(headline: str) -> dict:
    """
    Detect if headline contains negation words that might flip meaning
    Returns info about potential manipulation
    IMPORTANT: Only matches WHOLE WORDS to avoid false positives like "another" matching "not"
    """
    import re
    
    headline_lower = headline.lower()
    
    # Negation patterns - must be WHOLE WORDS (using word boundaries)
    # These are words that typically flip the meaning of a statement
    negation_patterns = [
        r'\bnot\b',           # "not" but not "another", "nothing", "notice"
        r'\bnever\b',
        r'\bno\b',            # "no" but not "now", "know", "another"
        r'\bnone\b',
        r"\bdoesn'?t\b",
        r"\bdon'?t\b", 
        r"\bdidn'?t\b",
        r"\bwon'?t\b",
        r"\bwouldn'?t\b",
        r"\bcouldn'?t\b",
        r"\bshouldn'?t\b",
        r"\bisn'?t\b",
        r"\baren'?t\b",
        r"\bwasn'?t\b",
        r"\bweren'?t\b",
        r"\bhasn'?t\b",
        r"\bhaven'?t\b",
        r"\bhadn'?t\b",
        r'\bdenies\b',
        r'\bdenied\b',
        r'\bfalse\b',
        r'\bfake\b',
        r'\bhoax\b',
        r'\bdebunked\b',
        r'\buntrue\b',
        r'\bincorrect\b',
        r'\bwrong\b',
        r'\bfails\b',
        r'\bfailed\b',
        r'\brefuses\b',
        r'\brejected\b',
        r'\brejects\b',
        r'\bdid not\b',
        r'\bdoes not\b',
        r'\bwill not\b',
        r'\bcannot\b',
        r'\bcan not\b',
    ]
    
    found_negations = []
    
    # Check for negation patterns using proper word boundaries
    for pattern in negation_patterns:
        match = re.search(pattern, headline_lower)
        if match:
            found_word = match.group()
            if found_word not in found_negations:
                found_negations.append(found_word)
    
    return {
        'has_negation': len(found_negations) > 0,
        'negation_words': found_negations,
        'risk_level': 'high' if len(found_negations) > 0 else 'low'
    }


def create_search_variants(headline: str, negation_info: dict) -> list:
    """
    Create search variants - one with negation, one without
    to check if the claim contradicts actual news
    """
    import re
    
    variants = [headline]  # Original
    
    if negation_info['has_negation']:
        # Create a version WITHOUT the negation to search for the "positive" version
        clean_headline = headline
        for neg in negation_info['negation_words']:
            # Remove negation words carefully
            clean_headline = re.sub(r'\b' + re.escape(neg) + r'\b', '', clean_headline, flags=re.IGNORECASE)
        
        # Clean up extra spaces
        clean_headline = ' '.join(clean_headline.split())
        
        if clean_headline and len(clean_headline) > 10:
            variants.append(clean_headline)
    
    return variants


def analyze_news_results(headline: str, search_results: dict) -> dict:
    """
    Analyze search results to determine if headline is likely real or fake
    Now includes negation/manipulation detection
    """
    analysis = {
        'headline': headline,
        'verified': False,
        'confidence': 0,
        'recommendation': 'unverified',
        'reasoning': [],
        'manipulation_detected': False
    }
    
    # Check for negation manipulation
    negation_info = detect_negation_manipulation(headline)
    
    trusted = search_results.get('trusted_sources', [])
    unreliable = search_results.get('unreliable_sources', [])
    all_sources = search_results.get('sources', [])
    
    tier1_count = len([s for s in trusted if s['tier'] == 'tier1'])
    tier2_count = len([s for s in trusted if s['tier'] == 'tier2'])
    tier3_count = len([s for s in trusted if s['tier'] == 'tier3'])
    total_trusted = len(trusted)
    
    # If headline has negation AND we found sources, the sources likely
    # report the OPPOSITE (the original true story)
    if negation_info['has_negation'] and total_trusted > 0:
        analysis['manipulation_detected'] = True
        analysis['verified'] = False
        analysis['confidence'] = 75
        analysis['recommendation'] = 'likely_manipulated'
        analysis['reasoning'].append(
            f"⚠️ CAUTION: This headline contains negation words ({', '.join(negation_info['negation_words'])})"
        )
        analysis['reasoning'].append(
            "⚠️ We found news coverage, but it likely reports the OPPOSITE of your claim"
        )
        analysis['reasoning'].append(
            "💡 Common misinformation tactic: Taking real news and adding 'NOT' or negation"
        )
        return analysis
    
    # Determine verification status (normal flow)
    if tier1_count >= 2:
        analysis['verified'] = True
        analysis['confidence'] = min(95, 80 + tier1_count * 5)
        analysis['recommendation'] = 'verified_true'
        analysis['reasoning'].append(f"✓ Confirmed by {tier1_count} top-tier sources (Reuters, AP, BBC, etc.)")
    
    elif tier1_count >= 1 and (tier2_count + tier3_count) >= 2:
        analysis['verified'] = True
        analysis['confidence'] = min(90, 70 + total_trusted * 3)
        analysis['recommendation'] = 'likely_true'
        analysis['reasoning'].append(f"✓ Reported by {tier1_count} top-tier and {tier2_count + tier3_count} other trusted sources")
    
    elif total_trusted >= 3:
        analysis['verified'] = True
        analysis['confidence'] = min(80, 55 + total_trusted * 5)
        analysis['recommendation'] = 'likely_true'
        analysis['reasoning'].append(f"✓ Covered by {total_trusted} trusted news outlets")
    
    elif total_trusted >= 3:
        analysis['confidence'] = min(60, 35 + total_trusted * 10)
        analysis['recommendation'] = 'possibly_true'
        analysis['reasoning'].append(f"○ Found in {total_trusted} trusted source(s) - limited coverage")
    
    elif len(unreliable) > 0 and total_trusted == 0:
        analysis['confidence'] = 70
        analysis['recommendation'] = 'likely_false'
        analysis['reasoning'].append(f"⚠ Only found in {len(unreliable)} unreliable source(s), no trusted coverage")
    
    elif len(all_sources) == 0:
        analysis['confidence'] = 40
        analysis['recommendation'] = 'no_coverage'
        analysis['reasoning'].append("✗ No news coverage found - may be false, satirical, or very recent")
    
    else:
        analysis['confidence'] = 30
        analysis['recommendation'] = 'unverified'
        analysis['reasoning'].append(f"○ Found in {len(all_sources)} source(s), but none are established news outlets")
    
    # Add warning if negation detected but no sources found
    if negation_info['has_negation'] and total_trusted == 0:
        analysis['reasoning'].append(
            f"⚠️ Note: Headline contains negation words ({', '.join(negation_info['negation_words'])}) - verify carefully"
        )
    
    # Check for fact-checkers
    fact_checkers = [s for s in trusted if any(fc in s['domain'] for fc in 
                    ['snopes.com', 'factcheck.org', 'politifact.com', 'fullfact.org', 'altnews.in', 'boomlive.in'])]
    if fact_checkers:
        analysis['confidence'] = min(95, analysis['confidence'] + 15)
        analysis['reasoning'].append(f"★ Fact-checked by {len(fact_checkers)} professional fact-checker(s)")
    
    return analysis


@app.post("/verify-news", response_model=NewsVerificationResponse)
async def verify_news(request: NewsSearchRequest):
    """
    Verify a news headline by searching Google News
    
    Returns verification status with confidence and sources
    """
    headline = request.headline.strip()
    
    if not headline:
        return NewsVerificationResponse(
            success=False,
            headline="",
            verified=False,
            confidence=0,
            trusted_sources=[],
            unreliable_sources=[],
            all_sources=[],
            recommendation="error",
            reasoning=["No headline provided"],
            error="Empty headline"
        )
    
    # Check cache
    cache_key = hashlib.md5(headline.lower().encode()).hexdigest()
    if cache_key in news_cache:
        cached = news_cache[cache_key]
        if time.time() - cached['timestamp'] < NEWS_CACHE_DURATION:
            print(f"[NewsVerify] Using cached result for: {headline[:40]}...")
            result = cached['result']
            result['cached'] = True
            return NewsVerificationResponse(**result)
    
    # Search Google
    search_results = await search_google_news(headline, request.max_results)
    
    if 'error' in search_results and search_results.get('total_found', 0) == 0:
        return NewsVerificationResponse(
            success=False,
            headline=headline,
            verified=False,
            confidence=0,
            trusted_sources=[],
            unreliable_sources=[],
            all_sources=[],
            recommendation="error",
            reasoning=[f"Search failed: {search_results.get('error', 'Unknown error')}"],
            error=search_results.get('error')
        )
    
    # Analyze results
    analysis = analyze_news_results(headline, search_results)
    
    result = {
        'success': True,
        'headline': headline,
        'verified': analysis['verified'],
        'confidence': analysis['confidence'],
        'trusted_sources': search_results['trusted_sources'],
        'unreliable_sources': search_results['unreliable_sources'],
        'all_sources': search_results['sources'],
        'recommendation': analysis['recommendation'],
        'reasoning': analysis['reasoning'],
        'cached': False
    }
    
    # Cache the result
    news_cache[cache_key] = {
        'result': result,
        'timestamp': time.time()
    }
    
    return NewsVerificationResponse(**result)


@app.post("/extract-headlines")
async def extract_headlines(request: dict):
    """
    Extract potential headlines from HTML content
    Returns list of headlines that should be verified
    """
    html = request.get('html', '')
    url = request.get('url', '')
    
    if not html:
        return {'success': False, 'headlines': [], 'error': 'No HTML provided'}
    
    import re
    from html import unescape
    
    headlines = []
    
    # Extract from common headline selectors
    patterns = [
        # H1 tags
        r'<h1[^>]*>([^<]+)</h1>',
        r'<h1[^>]*class="[^"]*title[^"]*"[^>]*>([^<]+)</h1>',
        # Article headlines
        r'<h2[^>]*class="[^"]*headline[^"]*"[^>]*>([^<]+)</h2>',
        r'<h2[^>]*class="[^"]*title[^"]*"[^>]*>([^<]+)</h2>',
        # Meta tags
        r'<meta[^>]*property="og:title"[^>]*content="([^"]+)"',
        r'<meta[^>]*name="twitter:title"[^>]*content="([^"]+)"',
        # Article title tags
        r'<title>([^<]+)</title>',
    ]
    
    for pattern in patterns:
        matches = re.findall(pattern, html, re.IGNORECASE)
        for match in matches:
            # Clean up the headline
            headline = unescape(match.strip())
            headline = re.sub(r'\s+', ' ', headline)  # Normalize whitespace
            headline = re.sub(r'<[^>]+>', '', headline)  # Remove any remaining HTML
            
            # Filter out non-headlines
            if len(headline) > 20 and len(headline) < 300:
                if headline not in headlines:
                    headlines.append(headline)
    
    # Remove duplicates and site names
    clean_headlines = []
    for h in headlines:
        # Remove common suffixes like "| Site Name" or "- News Site"
        h = re.sub(r'\s*[\|\-–—]\s*[^|\-–—]+$', '', h).strip()
        if h and len(h) > 15 and h not in clean_headlines:
            clean_headlines.append(h)
    
    return {
        'success': True,
        'headlines': clean_headlines[:10],  # Return top 10
        'source_url': url
    }


if __name__ == "__main__":
    print("=" * 60)
    print("UnReal ML Backend Server v1.2")
    print("=" * 60)
    print(f"Model: {MODEL_NAME}")
    print("Starting server on http://localhost:8000")
    print("Image API: POST http://localhost:8000/analyze")
    print("Video API: POST http://localhost:8000/analyze-video")
    print("News API:  POST http://localhost:8000/verify-news")
    print("Cache API: GET  http://localhost:8000/cache/stats")
    print("=" * 60)
    
    uvicorn.run(app, host="0.0.0.0", port=8000)

