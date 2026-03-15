/**
 * Layer 0: Metadata Analysis
 * Fast, synchronous analysis of image metadata (URL, filename, dimensions, aspect ratio)
 * Target: < 5ms processing time
 * Max Score: 30 points (capped)
 */

// AI Platform URL patterns (moved from imageDetector.js)
const AI_URL_PATTERNS = [
    'midjourney', 'mj-gallery', 'dalle', 'openai.com/dall-e', 'stability.ai',
    'stablediffusion', 'dreamstudio', 'leonardo.ai', 'nightcafe', 'artbreeder',
    'runwayml', 'pika.art', 'ideogram', 'playground.ai', 'lexica.art',
    'craiyon', 'deepai.org', 'tensor.art', 'civitai', 'prompthero', 'adobe.firefly'
];

// AI-related filename patterns (moved from imageDetector.js)
const AI_FILENAME_PATTERNS = [
    'generated', 'ai_', '_ai', 'synthetic', 'diffusion', 'gan_', 'deepfake',
    'midjourney', 'dalle', 'stable_diffusion', 'sd_', 'mj_', 'artificial',
    'fake_', 'created_', 'prompt_'
];

// Common AI-generated image dimensions (moved from imageDetector.js)
const AI_COMMON_SIZES = [
    [512, 512], [768, 768], [1024, 1024], [1024, 1792], [1792, 1024],
    [1456, 816], [816, 1456], [2048, 2048], [1536, 1536]
];

// Perfect aspect ratios commonly used by AI generators
const PERFECT_ASPECT_RATIOS = [
    { ratio: 1, name: '1:1' },           // Square
    { ratio: 16 / 9, name: '16:9' },       // Widescreen
    { ratio: 9 / 16, name: '9:16' },       // Portrait widescreen
    { ratio: 3 / 2, name: '3:2' },         // Classic photo
    { ratio: 2 / 3, name: '2:3' },         // Portrait classic
    { ratio: 4 / 3, name: '4:3' },         // Standard
    { ratio: 3 / 4, name: '3:4' },         // Portrait standard
    { ratio: 21 / 9, name: '21:9' },       // Ultra-wide
    { ratio: 9 / 21, name: '9:21' },       // Ultra-tall
    { ratio: 7 / 4, name: '7:4' },         // Midjourney default
    { ratio: 4 / 7, name: '4:7' }          // Midjourney portrait
];

// Scoring constants
const SCORES = {
    URL_PATTERN: 15,
    FILENAME_PATTERN: 10,
    AI_DIMENSIONS: 10,
    PERFECT_ASPECT_RATIO: 5,
    MAX_TOTAL: 30
};

// Tolerance for aspect ratio matching (to handle rounding)
const ASPECT_RATIO_TOLERANCE = 0.01;

export class MetadataAnalyzer {
    constructor() {
        this.urlPatterns = AI_URL_PATTERNS;
        this.filenamePatterns = AI_FILENAME_PATTERNS;
        this.commonSizes = AI_COMMON_SIZES;
        this.aspectRatios = PERFECT_ASPECT_RATIOS;

        console.log('[Layer0-Metadata] MetadataAnalyzer initialized');
    }

    /**
     * Analyze an image element for AI-generated metadata signals
     * @param {HTMLImageElement} imageElement - The image element to analyze
     * @returns {Object} Analysis result with score, signals, layer, and processingTime
     */
    analyze(imageElement) {
        const startTime = performance.now();
        const signals = [];
        let totalScore = 0;

        try {
            // Get image properties
            const src = imageElement?.src || imageElement?.currentSrc || '';
            const width = imageElement?.naturalWidth || imageElement?.width || 0;
            const height = imageElement?.naturalHeight || imageElement?.height || 0;

            // Check URL patterns
            const urlResult = this._checkUrlPatterns(src);
            if (urlResult) {
                signals.push(urlResult);
                totalScore += urlResult.points;
            }

            // Check filename patterns
            const filename = this._extractFilename(src);
            const filenameResult = this._checkFilenamePatterns(filename);
            if (filenameResult) {
                signals.push(filenameResult);
                totalScore += filenameResult.points;
            }

            // Check dimensions (only if we have valid dimensions)
            if (width > 0 && height > 0) {
                const dimensionResult = this._checkDimensions(width, height);
                if (dimensionResult) {
                    signals.push(dimensionResult);
                    totalScore += dimensionResult.points;
                }

                // Check aspect ratio
                const aspectResult = this._checkAspectRatio(width, height);
                if (aspectResult) {
                    signals.push(aspectResult);
                    totalScore += aspectResult.points;
                }
            }

            // Check for data URL size (base64 encoded images)
            if (src.startsWith('data:')) {
                const dataUrlResult = this._analyzeDataUrl(src);
                if (dataUrlResult) {
                    signals.push(dataUrlResult);
                    totalScore += dataUrlResult.points;
                }
            }

        } catch (error) {
            console.error('[Layer0-Metadata] Error during analysis:', error);
        }

        // Cap the total score
        const cappedScore = Math.min(totalScore, SCORES.MAX_TOTAL);
        const processingTime = performance.now() - startTime;

        const result = {
            score: cappedScore,
            signals: signals,
            layer: 'metadata',
            processingTime: processingTime
        };

        console.log(`[Layer0-Metadata] Analysis complete: score=${cappedScore}, signals=${signals.length}, time=${processingTime.toFixed(2)}ms`);

        return result;
    }

    /**
     * Check if URL contains AI platform patterns
     * @param {string} url - The image URL
     * @returns {Object|null} Signal object if match found
     */
    _checkUrlPatterns(url) {
        if (!url || typeof url !== 'string') {
            return null;
        }

        const lowerUrl = url.toLowerCase();

        for (const pattern of this.urlPatterns) {
            if (lowerUrl.includes(pattern.toLowerCase())) {
                return {
                    type: 'url',
                    matched: pattern,
                    description: 'URL contains AI platform identifier',
                    points: SCORES.URL_PATTERN
                };
            }
        }

        return null;
    }

    /**
     * Check if filename contains AI-related patterns
     * @param {string} filename - The extracted filename
     * @returns {Object|null} Signal object if match found
     */
    _checkFilenamePatterns(filename) {
        if (!filename || typeof filename !== 'string') {
            return null;
        }

        const lowerFilename = filename.toLowerCase();

        for (const pattern of this.filenamePatterns) {
            if (lowerFilename.includes(pattern.toLowerCase())) {
                return {
                    type: 'filename',
                    matched: pattern,
                    description: 'Filename contains AI-related pattern',
                    points: SCORES.FILENAME_PATTERN
                };
            }
        }

        return null;
    }

    /**
     * Check if dimensions match common AI output sizes
     * @param {number} width - Image width
     * @param {number} height - Image height
     * @returns {Object|null} Signal object if match found
     */
    _checkDimensions(width, height) {
        if (!width || !height || width <= 0 || height <= 0) {
            return null;
        }

        for (const [w, h] of this.commonSizes) {
            if ((width === w && height === h) || (width === h && height === w)) {
                return {
                    type: 'dimensions',
                    matched: `${width}x${height}`,
                    description: 'Common AI output size',
                    points: SCORES.AI_DIMENSIONS
                };
            }
        }

        return null;
    }

    /**
     * Check if aspect ratio matches perfect AI ratios
     * @param {number} width - Image width
     * @param {number} height - Image height
     * @returns {Object|null} Signal object if match found
     */
    _checkAspectRatio(width, height) {
        if (!width || !height || width <= 0 || height <= 0) {
            return null;
        }

        const imageRatio = width / height;

        for (const { ratio, name } of this.aspectRatios) {
            if (Math.abs(imageRatio - ratio) < ASPECT_RATIO_TOLERANCE) {
                return {
                    type: 'aspectRatio',
                    matched: name,
                    description: 'Perfect aspect ratio commonly used by AI generators',
                    points: SCORES.PERFECT_ASPECT_RATIO
                };
            }
        }

        return null;
    }

    /**
     * Extract filename from URL
     * @param {string} url - The image URL
     * @returns {string} The extracted filename or empty string
     */
    _extractFilename(url) {
        if (!url || typeof url !== 'string') {
            return '';
        }

        // Handle data URLs - no filename
        if (url.startsWith('data:')) {
            return '';
        }

        try {
            // Try to parse as URL
            const urlObj = new URL(url);
            const pathname = urlObj.pathname;

            // Get the last segment of the path
            const segments = pathname.split('/');
            const lastSegment = segments[segments.length - 1];

            // Remove query parameters if any leaked through
            const filename = lastSegment.split('?')[0];

            return filename || '';
        } catch (error) {
            // If URL parsing fails, try simple extraction
            try {
                const parts = url.split('/');
                const lastPart = parts[parts.length - 1];
                return lastPart.split('?')[0] || '';
            } catch {
                return '';
            }
        }
    }

    /**
     * Analyze data URL for potential AI generation signals
     * @param {string} dataUrl - The data URL
     * @returns {Object|null} Signal object if suspicious patterns found
     */
    _analyzeDataUrl(dataUrl) {
        if (!dataUrl || !dataUrl.startsWith('data:')) {
            return null;
        }

        try {
            // Get the base64 portion
            const base64Match = dataUrl.match(/base64,(.+)/);
            if (!base64Match) {
                return null;
            }

            const base64Data = base64Match[1];
            const estimatedBytes = (base64Data.length * 3) / 4;
            const estimatedKB = estimatedBytes / 1024;

            // Large embedded images (> 500KB) are unusual for regular web use
            // and might indicate programmatically generated content
            if (estimatedKB > 500) {
                return {
                    type: 'dataUrl',
                    matched: `${Math.round(estimatedKB)}KB embedded`,
                    description: 'Large embedded data URL (unusual for web images)',
                    points: 5
                };
            }
        } catch (error) {
            console.error('[Layer0-Metadata] Error analyzing data URL:', error);
        }

        return null;
    }

    /**
     * Get all patterns for external use/debugging
     * @returns {Object} All pattern arrays
     */
    getPatterns() {
        return {
            urlPatterns: [...this.urlPatterns],
            filenamePatterns: [...this.filenamePatterns],
            commonSizes: [...this.commonSizes],
            aspectRatios: [...this.aspectRatios]
        };
    }
}

// Export patterns for use by other modules if needed
export { AI_URL_PATTERNS, AI_FILENAME_PATTERNS, AI_COMMON_SIZES, PERFECT_ASPECT_RATIOS, SCORES };
