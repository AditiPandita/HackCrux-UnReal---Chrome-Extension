/**
 * Layer 3: Local ML Analyzer (Backend API Version)
 * Calls local Python backend server for AI image detection via background script
 * Backend URL: http://localhost:8000/analyze (proxied through background script)
 */

export class LocalMLAnalyzer {
  constructor() {
    this.initialized = false;
    this.available = false;

    console.log('[Layer3-ML] LocalMLAnalyzer created (Backend API mode)');
  }

  /**
   * Check if the analyzer is ready for inference
   */
  isReady() {
    return this.initialized && this.available;
  }

  /**
   * Initialize - check if backend is running via background script
   * @returns {Promise<boolean>} True if backend is available
   */
  async initialize() {
    if (this.initialized) {
      return this.available;
    }

    try {
      console.log('[Layer3-ML] Checking backend availability...');

      // Check if backend is running via background script (bypasses CORS)
      const response = await chrome.runtime.sendMessage({
        type: 'ML_BACKEND_REQUEST',
        endpoint: '/health',
        method: 'GET'
      });

      if (response && response.success && response.data) {
        this.available = response.data.modelLoaded === true;
        this.initialized = true;
        console.log('[Layer3-ML] Backend available:', this.available);
        if (this.available) {
          console.log('[Layer3-ML] Model loaded and ready!');
        }
        return this.available;
      } else {
        throw new Error(response?.error || 'Backend check failed');
      }

    } catch (error) {
      console.log('[Layer3-ML] Backend not available:', error.message);
      console.log('[Layer3-ML] To enable Layer 3, start the backend server:');
      console.log('[Layer3-ML]   cd backend && python server.py');
      this.initialized = true;
      this.available = false;
      return false;
    }
  }

  /**
   * Analyze an image for AI-generated content
   * @param {HTMLImageElement} imageElement - The image to analyze
   * @returns {Promise<Object>} Analysis results
   */
  async analyze(imageElement) {
    const startTime = performance.now();

    try {
      // Initialize if not ready
      if (!this.initialized) {
        await this.initialize();
      }

      if (!this.available) {
        return this._createUnavailableResult(startTime);
      }

      console.log('[Layer3-ML] Analyzing image via backend...');

      // Convert image to base64
      const base64Image = await this._imageToBase64(imageElement);

      if (!base64Image) {
        return this._createErrorResult('Failed to convert image to base64', startTime);
      }

      // Call backend API via background script
      const response = await chrome.runtime.sendMessage({
        type: 'ML_BACKEND_REQUEST',
        endpoint: '/analyze',
        method: 'POST',
        body: { image: base64Image }
      });

      if (!response || !response.success) {
        throw new Error(response?.error || 'Backend analysis failed');
      }

      const result = response.data;

      if (!result.success) {
        throw new Error(result.error || 'Model inference failed');
      }

      const processingTime = Math.round(performance.now() - startTime);

      console.log('[Layer3-ML] Backend result: score=' + result.score + '%, confidence=' + result.confidence + '%');
      console.log('[Layer3-ML] Total time:', processingTime, 'ms (backend:', result.processingTime, 'ms)');

      return {
        score: result.score,
        confidence: result.confidence,
        realScore: result.realScore,
        fakeScore: result.fakeScore,
        artifacts: this._generateArtifacts(result.fakeScore / 100, result.realScore / 100),
        layer: 'local-ml',
        available: true,
        processingTime: processingTime,
        details: {
          modelName: result.modelName,
          backendTime: result.processingTime,
          probabilities: {
            real: result.realScore / 100,
            fake: result.fakeScore / 100
          }
        }
      };

    } catch (error) {
      console.error('[Layer3-ML] Analysis error:', error);
      return this._createErrorResult(error.message, startTime);
    }
  }

  /**
   * Convert image element to base64 (with CORS bypass)
   */
  async _imageToBase64(imageElement) {
    try {
      const canvas = document.createElement('canvas');
      const maxSize = 512; // Backend can handle larger, but limit for speed

      let width = imageElement.naturalWidth || imageElement.width;
      let height = imageElement.naturalHeight || imageElement.height;

      if (width > maxSize || height > maxSize) {
        const scale = Math.min(maxSize / width, maxSize / height);
        width = Math.floor(width * scale);
        height = Math.floor(height * scale);
      }

      canvas.width = width;
      canvas.height = height;
      const ctx = canvas.getContext('2d');

      // Try direct draw
      try {
        ctx.drawImage(imageElement, 0, 0, width, height);
        return canvas.toDataURL('image/jpeg', 0.9);
      } catch (corsError) {
        // CORS error - fetch via background
        console.log('[Layer3-ML] CORS issue, fetching via background...');

        const imgSrc = imageElement.src || imageElement.currentSrc;
        if (!imgSrc) return null;

        const response = await chrome.runtime.sendMessage({
          type: 'FETCH_IMAGE_FOR_ANALYSIS',
          url: imgSrc
        });

        if (response && response.success && response.base64) {
          return response.base64;
        }
        return null;
      }
    } catch (error) {
      console.error('[Layer3-ML] Image conversion error:', error);
      return null;
    }
  }

  /**
   * Generate artifact descriptions based on results
   */
  _generateArtifacts(fakeProb, realProb) {
    const artifacts = [];

    if (fakeProb > 0.7) {
      artifacts.push({
        type: 'ml-classification',
        description: 'Neural network strongly indicates AI-generated content',
        confidence: Math.round(fakeProb * 100),
        severity: 'high'
      });
    } else if (fakeProb > 0.5) {
      artifacts.push({
        type: 'ml-classification',
        description: 'Neural network suggests possible AI-generated content',
        confidence: Math.round(fakeProb * 100),
        severity: 'medium'
      });
    } else if (realProb > 0.7) {
      artifacts.push({
        type: 'ml-classification',
        description: 'Neural network indicates likely authentic image',
        confidence: Math.round(realProb * 100),
        severity: 'low'
      });
    } else {
      artifacts.push({
        type: 'ml-classification',
        description: 'Neural network analysis inconclusive',
        confidence: Math.round(Math.abs(fakeProb - realProb) * 100),
        severity: 'medium'
      });
    }

    return artifacts;
  }

  /**
   * Create unavailable result
   */
  _createUnavailableResult(startTime) {
    return {
      score: 0,
      confidence: 0,
      realScore: 0,
      fakeScore: 0,
      artifacts: [],
      layer: 'local-ml',
      available: false,
      error: 'Backend server not running. Start with: cd backend && python server.py',
      processingTime: Math.round(performance.now() - startTime)
    };
  }

  /**
   * Create error result object
   */
  _createErrorResult(message, startTime) {
    return {
      score: 0,
      confidence: 0,
      realScore: 0,
      fakeScore: 0,
      artifacts: [],
      layer: 'local-ml',
      available: false,
      error: message,
      processingTime: Math.round(performance.now() - startTime)
    };
  }

  /**
   * Dispose of resources
   */
  dispose() {
    this.initialized = false;
    this.available = false;
    console.log('[Layer3-ML] Disposed');
  }
}

console.log('[Layer3-ML] Module loaded (Backend API mode via background script)');
