/**
 * Video Analysis Pipeline v1.2
 * Orchestrates video frame extraction, merging, and analysis
 * 
 * v1.2: Fixed video display issue - uses thumbnail fallback for cross-origin,
 *       never seeks the visible video element
 */

// Risk thresholds
const VIDEO_RISK_THRESHOLDS = {
    low: 40,
    high: 75
};

// Frame extraction configuration based on video duration
function getFrameConfig(durationSec) {
    if (durationSec > 60) {
        return { segmentSize: 6, targetFrames: 10, framesPerSegment: 12 };
    } else if (durationSec > 30) {
        return { segmentSize: 3, targetFrames: 10, framesPerSegment: 6 };
    } else if (durationSec > 10) {
        return { segmentSize: 2, targetFrames: Math.ceil(durationSec / 2), framesPerSegment: 4 };
    } else {
        return { segmentSize: 1, targetFrames: Math.min(10, Math.ceil(durationSec)), framesPerSegment: 2 };
    }
}

export class VideoAnalysisPipeline {
    constructor() {
        this.imagePipeline = null;
        this.imagePipelineModule = null;
        this.initialized = false;
        this.canvas = null;
        this.ctx = null;

        console.log('[VideoAnalysisPipeline] Created');
    }

    async initialize() {
        if (this.initialized) return true;

        try {
            console.log('[VideoAnalysisPipeline] Initializing...');

            this.canvas = document.createElement('canvas');
            this.ctx = this.canvas.getContext('2d', { willReadFrequently: true });

            this.imagePipelineModule = await import(chrome.runtime.getURL('imageAnalysisPipeline.js'));
            this.imagePipeline = new this.imagePipelineModule.ImageAnalysisPipeline();
            await this.imagePipeline.initialize();

            this.initialized = true;
            console.log('[VideoAnalysisPipeline] Initialized successfully');
            return true;
        } catch (error) {
            console.error('[VideoAnalysisPipeline] Initialization failed:', error);
            return false;
        }
    }

    /**
     * Check if video is cross-origin
     */
    checkCrossOrigin(video) {
        const videoSrc = video.src || video.currentSrc;
        if (!videoSrc) return true;

        try {
            const videoUrl = new URL(videoSrc, window.location.href);
            return videoUrl.origin !== window.location.origin;
        } catch {
            return true;
        }
    }

    /**
     * Main analysis entry point - NEVER modifies the visible video
     */
    async analyze(videoElement) {
        const startTime = performance.now();

        try {
            if (!this.initialized) {
                await this.initialize();
            }

            // Validate video
            if (!videoElement || !videoElement.duration || videoElement.duration === Infinity) {
                return this._errorResult('Invalid or streaming video', startTime);
            }

            const duration = videoElement.duration;
            console.log('[VideoAnalysisPipeline] Analyzing video, duration:', duration.toFixed(1), 'sec');

            // Check if cross-origin
            const isCrossOrigin = this.checkCrossOrigin(videoElement);

            // For cross-origin videos (99% of cases), use thumbnail/poster analysis
            // This avoids the white screen issue from seeking
            if (isCrossOrigin) {
                console.log('[VideoAnalysisPipeline] Cross-origin video - using thumbnail analysis');
                const fallbackResult = await this.analyzeThumbnail(videoElement, startTime);
                if (fallbackResult) {
                    return fallbackResult;
                }
                // If no thumbnail found, try current frame only (no seeking)
                return await this.analyzeCurrentFrame(videoElement, startTime);
            }

            // For same-origin videos, we can safely extract frames
            // But still don't seek the original - use a hidden clone
            console.log('[VideoAnalysisPipeline] Same-origin video - attempting frame extraction');

            const config = getFrameConfig(duration);
            const composites = await this.extractFramesSafely(videoElement, config);

            if (composites.length === 0) {
                console.log('[VideoAnalysisPipeline] Frame extraction failed, using current frame');
                return await this.analyzeCurrentFrame(videoElement, startTime);
            }

            console.log('[VideoAnalysisPipeline] Extracted', composites.length, 'composite frames');

            const frameResults = await this.analyzeCompositeFrames(composites);
            const videoFactors = this.analyzeVideoFactors(composites, frameResults);
            const result = this._calculateFinalResult(frameResults, videoFactors, startTime);

            console.log('[VideoAnalysisPipeline] Final result:', result.riskLevel, 'score:', result.score);
            return result;

        } catch (error) {
            console.error('[VideoAnalysisPipeline] Analysis error:', error);
            return this._errorResult(error.message, startTime);
        }
    }

    /**
     * Analyze using video thumbnail/poster (for cross-origin videos)
     */
    async analyzeThumbnail(video, startTime) {
        console.log('[VideoAnalysisPipeline] Looking for thumbnail...');

        try {
            // Try 1: Video poster
            if (video.poster) {
                console.log('[VideoAnalysisPipeline] Using poster:', video.poster);
                const img = await this.loadImageCORS(video.poster);
                if (img) return await this.analyzeSingleImage(img, startTime, 'poster');
            }

            // Try 2: Look for sibling/nearby img element (common for video players)
            const container = video.closest('[class*="video"]') ||
                video.closest('[data-testid]') ||
                video.parentElement?.parentElement;

            if (container) {
                // Common patterns for video thumbnails
                const thumbSelectors = [
                    'img[src*="video"]',
                    'img[src*="thumb"]',
                    'img[src*="poster"]',
                    'img[src*="pbs.twimg.com"]',  // Twitter
                    'img[src*="preview"]',
                    'img[class*="poster"]',
                    'img[class*="thumb"]',
                    'img:not([class*="avatar"]):not([class*="emoji"])'
                ];

                for (const selector of thumbSelectors) {
                    const thumb = container.querySelector(selector);
                    if (thumb && thumb.src && thumb.naturalWidth > 100) {
                        console.log('[VideoAnalysisPipeline] Found thumbnail:', thumb.src.substring(0, 60) + '...');
                        const img = await this.loadImageCORS(thumb.src);
                        if (img) return await this.analyzeSingleImage(img, startTime, 'thumbnail');
                    }
                }
            }

            // Try 3: Twitter-specific - video thumbnail in URL pattern
            const videoSrc = video.src || video.currentSrc || '';
            if (videoSrc.includes('twimg.com') || videoSrc.includes('twitter.com') || videoSrc.includes('x.com')) {
                // Search more broadly for Twitter thumbnails
                const twitterContainer = video.closest('[data-testid="videoPlayer"]') ||
                    video.closest('[data-testid="videoComponent"]') ||
                    video.closest('article') ||
                    document.querySelector('[data-testid="tweet"]');

                if (twitterContainer) {
                    const allImages = twitterContainer.querySelectorAll('img[src*="twimg.com"]');
                    for (const img of allImages) {
                        if (img.src && img.naturalWidth > 200 && !img.src.includes('profile') && !img.src.includes('emoji')) {
                            console.log('[VideoAnalysisPipeline] Found Twitter image:', img.src.substring(0, 60) + '...');
                            const loadedImg = await this.loadImageCORS(img.src);
                            if (loadedImg) return await this.analyzeSingleImage(loadedImg, startTime, 'twitter_thumbnail');
                        }
                    }
                }
            }

            console.log('[VideoAnalysisPipeline] No thumbnail found');
            return null;

        } catch (error) {
            console.warn('[VideoAnalysisPipeline] Thumbnail analysis failed:', error);
            return null;
        }
    }

    /**
     * Analyze the current visible frame without seeking
     */
    async analyzeCurrentFrame(video, startTime) {
        console.log('[VideoAnalysisPipeline] Analyzing current visible frame...');

        try {
            const width = video.videoWidth || 640;
            const height = video.videoHeight || 360;

            this.canvas.width = Math.min(width, 512);
            this.canvas.height = Math.min(height, 512);

            // Try to draw current frame
            this.ctx.drawImage(video, 0, 0, this.canvas.width, this.canvas.height);

            // Try to get image data (will fail for CORS)
            try {
                const imageData = this.ctx.getImageData(0, 0, this.canvas.width, this.canvas.height);

                // Check if frame is valid (not blank)
                if (!this.isValidFrame(imageData)) {
                    console.log('[VideoAnalysisPipeline] Current frame is blank (CORS restricted)');
                    return this._errorResult('Cannot access video frames (cross-origin)', startTime);
                }

                // Convert to image and analyze
                const dataUrl = this.canvas.toDataURL('image/jpeg', 0.9);
                const img = await this.loadImage(dataUrl);

                return await this.analyzeSingleImage(img, startTime, 'current_frame');

            } catch (securityError) {
                console.log('[VideoAnalysisPipeline] Canvas tainted (CORS)');
                return this._errorResult('Cannot access video frames (cross-origin)', startTime);
            }

        } catch (error) {
            console.error('[VideoAnalysisPipeline] Current frame analysis failed:', error);
            return this._errorResult('Frame capture failed', startTime);
        }
    }

    /**
     * Extract frames using a hidden clone (for same-origin videos only)
     */
    async extractFramesSafely(originalVideo, config) {
        const composites = [];

        try {
            // Create a hidden video clone
            const clone = document.createElement('video');
            clone.src = originalVideo.src || originalVideo.currentSrc;
            clone.crossOrigin = 'anonymous';
            clone.muted = true;
            clone.style.position = 'absolute';
            clone.style.left = '-9999px';
            clone.style.visibility = 'hidden';
            document.body.appendChild(clone);

            // Wait for clone to be ready
            await new Promise((resolve, reject) => {
                const timeout = setTimeout(() => reject(new Error('Clone load timeout')), 5000);
                clone.onloadedmetadata = () => {
                    clearTimeout(timeout);
                    resolve();
                };
                clone.onerror = () => {
                    clearTimeout(timeout);
                    reject(new Error('Clone load failed'));
                };
                clone.load();
            });

            const { segmentSize, targetFrames, framesPerSegment } = config;
            const duration = clone.duration;
            const numSegments = Math.min(targetFrames, Math.ceil(duration / segmentSize));

            for (let i = 0; i < numSegments; i++) {
                const segmentStart = i * segmentSize;
                const segmentEnd = Math.min(segmentStart + segmentSize, duration);

                try {
                    const frames = await this.extractFramesFromClone(clone, segmentStart, segmentEnd, framesPerSegment);
                    if (frames.length > 0) {
                        const composite = this.mergeFrames(frames);
                        if (composite && this.isValidFrame(composite)) {
                            composites.push({
                                composite,
                                segmentStart,
                                segmentEnd,
                                frameCount: frames.length
                            });
                        }
                    }
                } catch (error) {
                    console.warn('[VideoAnalysisPipeline] Segment', i, 'failed:', error.message);
                }
            }

            // Cleanup clone
            document.body.removeChild(clone);

        } catch (error) {
            console.warn('[VideoAnalysisPipeline] Safe frame extraction failed:', error);
        }

        return composites;
    }

    async extractFramesFromClone(clone, startTime, endTime, maxFrames) {
        const frames = [];
        const interval = (endTime - startTime) / maxFrames;

        this.canvas.width = Math.min(clone.videoWidth || 512, 512);
        this.canvas.height = Math.min(clone.videoHeight || 512, 512);

        for (let i = 0; i < maxFrames; i++) {
            const targetTime = startTime + (i * interval);

            try {
                // Seek clone
                await new Promise((resolve) => {
                    const timeout = setTimeout(resolve, 1000);
                    clone.onseeked = () => {
                        clearTimeout(timeout);
                        resolve();
                    };
                    clone.currentTime = targetTime;
                });

                // Capture frame
                this.ctx.drawImage(clone, 0, 0, this.canvas.width, this.canvas.height);
                const imageData = this.ctx.getImageData(0, 0, this.canvas.width, this.canvas.height);

                if (this.isValidFrame(imageData)) {
                    frames.push(imageData);
                }
            } catch (error) {
                // Skip failed frame
            }
        }

        return frames;
    }

    isValidFrame(imageData) {
        if (!imageData || !imageData.data) return false;

        const data = imageData.data;
        const sampleSize = Math.min(500, data.length / 4);
        let variance = 0;
        let prev = data[0];

        for (let i = 0; i < sampleSize; i++) {
            const idx = Math.floor((i / sampleSize) * (data.length / 4)) * 4;
            variance += Math.abs(data[idx] - prev);
            prev = data[idx];
        }

        return variance / sampleSize > 3;
    }

    async loadImageCORS(url) {
        try {
            return new Promise((resolve) => {
                const img = new Image();
                img.crossOrigin = 'anonymous';
                img.onload = () => resolve(img);
                img.onerror = async () => {
                    // Try via background script
                    try {
                        const response = await chrome.runtime.sendMessage({
                            type: 'FETCH_IMAGE_AS_BASE64',
                            url: url
                        });
                        if (response?.success && response.base64) {
                            const img2 = new Image();
                            img2.onload = () => resolve(img2);
                            img2.onerror = () => resolve(null);
                            img2.src = response.base64;
                        } else {
                            resolve(null);
                        }
                    } catch {
                        resolve(null);
                    }
                };
                img.src = url;
            });
        } catch {
            return null;
        }
    }

    async analyzeSingleImage(img, startTime, source) {
        try {
            const result = await this.imagePipeline.analyze(img);

            return {
                success: true,
                score: result.score,
                confidence: Math.round(result.confidence * 0.85),
                riskLevel: result.riskLevel,
                processingTime: Math.round(performance.now() - startTime),
                frameAnalysis: {
                    frameCount: 1,
                    avgScore: result.score,
                    scores: [{ segment: 0, score: result.score }],
                    source: source
                },
                videoFactors: {
                    consistency: 0,
                    flickering: 0,
                    visualDrift: 0,
                    overall: 0,
                    note: 'Single frame analysis'
                },
                reasons: result.score >= 60
                    ? [`${source} analysis indicates AI generation (${result.score.toFixed(0)}%)`]
                    : [],
                artifacts: result.artifacts || [],
                fallbackUsed: true,
                fallbackSource: source
            };
        } catch (error) {
            console.error('[VideoAnalysisPipeline] Single image analysis failed:', error);
            return null;
        }
    }

    loadImage(dataUrl) {
        return new Promise((resolve, reject) => {
            const img = new Image();
            img.onload = () => resolve(img);
            img.onerror = reject;
            img.src = dataUrl;
        });
    }

    mergeFrames(frames) {
        if (frames.length === 0) return null;
        if (frames.length === 1) return frames[0];

        const width = frames[0].width;
        const height = frames[0].height;
        const mergedData = new Uint8ClampedArray(width * height * 4);

        for (let i = 0; i < mergedData.length; i++) {
            let sum = 0;
            for (const frame of frames) {
                sum += frame.data[i];
            }
            mergedData[i] = Math.round(sum / frames.length);
        }

        return new ImageData(mergedData, width, height);
    }

    async analyzeCompositeFrames(composites) {
        const results = [];

        for (const comp of composites) {
            try {
                this.canvas.width = comp.composite.width;
                this.canvas.height = comp.composite.height;
                this.ctx.putImageData(comp.composite, 0, 0);

                const dataUrl = this.canvas.toDataURL('image/jpeg', 0.9);
                const img = await this.loadImage(dataUrl);
                const result = await this.imagePipeline.analyze(img);

                results.push({
                    segmentStart: comp.segmentStart,
                    segmentEnd: comp.segmentEnd,
                    score: result.score,
                    confidence: result.confidence,
                    riskLevel: result.riskLevel,
                    artifacts: result.artifacts || []
                });
            } catch (error) {
                console.warn('[VideoAnalysisPipeline] Composite analysis failed:', error);
                results.push({
                    segmentStart: comp.segmentStart,
                    segmentEnd: comp.segmentEnd,
                    score: 50,
                    confidence: 0,
                    riskLevel: 'unknown',
                    error: error.message
                });
            }
        }

        return results;
    }

    analyzeVideoFactors(composites, frameResults) {
        const factors = { consistency: 0, flickering: 0, visualDrift: 0, overall: 0 };

        if (frameResults.length < 2) return factors;

        const scores = frameResults.map(r => r.score);
        const avgScore = scores.reduce((a, b) => a + b, 0) / scores.length;
        const variance = scores.reduce((sum, s) => sum + Math.pow(s - avgScore, 2), 0) / scores.length;
        factors.consistency = Math.min(100, Math.sqrt(variance) * 3);

        let totalFlicker = 0;
        for (const comp of composites) {
            if (comp.composite) {
                totalFlicker += this._detectFlickering(comp.composite);
            }
        }
        factors.flickering = Math.min(100, (totalFlicker / composites.length) * 2);

        if (scores.length >= 3) {
            const first = scores.slice(0, Math.ceil(scores.length / 3));
            const last = scores.slice(-Math.ceil(scores.length / 3));
            factors.visualDrift = Math.min(100, Math.abs(
                first.reduce((a, b) => a + b, 0) / first.length -
                last.reduce((a, b) => a + b, 0) / last.length
            ) * 2);
        }

        factors.overall = factors.consistency * 0.4 + factors.flickering * 0.35 + factors.visualDrift * 0.25;
        return factors;
    }

    _detectFlickering(imageData) {
        const data = imageData.data;
        const width = imageData.width;
        let edgeVariance = 0;
        let count = 0;

        for (let y = 1; y < imageData.height - 1; y += 4) {
            for (let x = 1; x < width - 1; x += 4) {
                const idx = (y * width + x) * 4;
                const gx = Math.abs(data[idx + 4] - data[idx - 4]);
                const gy = Math.abs(data[idx + width * 4] - data[idx - width * 4]);
                edgeVariance += gx + gy;
                count++;
            }
        }

        return count > 0 ? edgeVariance / count : 0;
    }

    _calculateFinalResult(frameResults, videoFactors, startTime) {
        const processingTime = Math.round(performance.now() - startTime);
        const validResults = frameResults.filter(r => r.confidence > 0);
        const avgFrameScore = validResults.length > 0
            ? validResults.reduce((sum, r) => sum + r.score, 0) / validResults.length
            : 50;

        const finalScore = Math.round(avgFrameScore * 0.5 + videoFactors.overall * 0.5);

        let riskLevel;
        if (finalScore >= VIDEO_RISK_THRESHOLDS.high) riskLevel = 'high';
        else if (finalScore >= VIDEO_RISK_THRESHOLDS.low) riskLevel = 'medium';
        else riskLevel = 'low';

        const reasons = [];
        if (avgFrameScore >= 60) reasons.push(`Frame analysis indicates AI (${avgFrameScore.toFixed(0)}%)`);
        if (videoFactors.consistency > 30) reasons.push(`Quality inconsistency (${videoFactors.consistency.toFixed(0)}%)`);
        if (videoFactors.flickering > 30) reasons.push(`Visual artifacts (${videoFactors.flickering.toFixed(0)}%)`);
        if (videoFactors.visualDrift > 30) reasons.push(`Style drift (${videoFactors.visualDrift.toFixed(0)}%)`);

        return {
            success: true,
            score: finalScore,
            confidence: Math.round((validResults.reduce((sum, r) => sum + r.confidence, 0) / Math.max(1, validResults.length))),
            riskLevel,
            processingTime,
            frameAnalysis: {
                frameCount: frameResults.length,
                avgScore: avgFrameScore,
                scores: frameResults.map(r => ({ segment: r.segmentStart, score: r.score }))
            },
            videoFactors,
            reasons,
            artifacts: frameResults.flatMap(r => r.artifacts || [])
        };
    }

    _errorResult(message, startTime) {
        return {
            success: false,
            score: 0,
            confidence: 0,
            riskLevel: 'unknown',
            processingTime: Math.round(performance.now() - startTime),
            error: message,
            reasons: [message]
        };
    }

    terminate() {
        if (this.imagePipeline?.terminate) {
            this.imagePipeline.terminate();
        }
        this.canvas = null;
        this.ctx = null;
        this.initialized = false;
        console.log('[VideoAnalysisPipeline] Terminated');
    }
}

export async function analyzeVideo(videoElement) {
    const pipeline = new VideoAnalysisPipeline();
    await pipeline.initialize();
    return await pipeline.analyze(videoElement);
}

console.log('[VideoAnalysisPipeline] Module loaded v1.2 - No video seeking');
