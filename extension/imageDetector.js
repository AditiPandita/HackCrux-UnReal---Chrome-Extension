// imageDetector.js - AI Image Detection Module for UnReal Chrome Extension
// Multi-layered detection system: Local signals + Sightengine API + Gemini Vision API

// ============================================
// CONFIGURATION CONSTANTS
// ============================================

// API credentials are managed through Chrome storage
// Use settings.html to configure or load from .env during development

const AI_URL_PATTERNS = [
  'midjourney', 'mj-gallery', 'dalle', 'openai.com/dall-e', 'stability.ai',
  'stablediffusion', 'dreamstudio', 'leonardo.ai', 'nightcafe', 'artbreeder',
  'runwayml', 'pika.art', 'ideogram', 'playground.ai', 'lexica.art',
  'craiyon', 'deepai.org', 'tensor.art', 'civitai', 'prompthero', 'adobe.firefly'
];

const AI_FILENAME_PATTERNS = [
  'generated', 'ai_', '_ai', 'synthetic', 'diffusion', 'gan_', 'deepfake',
  'midjourney', 'dalle', 'stable_diffusion', 'sd_', 'mj_', 'artificial', 
  'fake_', 'created_', 'prompt_'
];

const AI_COMMON_SIZES = [
  [512, 512], [768, 768], [1024, 1024], [1024, 1792], [1792, 1024],
  [1456, 816], [816, 1456], [2048, 2048], [1536, 1536]
];

// ============================================
// LAYER 1: LOCAL PATTERN CHECKS
// ============================================

/**
 * Check local signals for AI-generated images (no API calls)
 * @param {string} imageUrl - URL of the image
 * @param {number} width - Image width in pixels
 * @param {number} height - Image height in pixels
 * @returns {Object} Detection result with score and signals
 */
function checkLocalSignals(imageUrl, width, height) {
  let score = 0;
  const signals = [];

  // Check URL for AI platform names
  const urlLower = imageUrl.toLowerCase();
  for (const pattern of AI_URL_PATTERNS) {
    if (urlLower.includes(pattern.toLowerCase())) {
      score += 40;
      signals.push(`AI platform detected in URL: ${pattern}`);
      break; // Only count once
    }
  }

  // Check filename for AI keywords
  const filename = imageUrl.split('/').pop().split('?')[0].toLowerCase();
  for (const pattern of AI_FILENAME_PATTERNS) {
    if (filename.includes(pattern.toLowerCase())) {
      score += 30;
      signals.push(`AI keyword in filename: ${pattern}`);
      break; // Only count once
    }
  }

  // Check if dimensions match common AI outputs
  if (width >= 512) {
    for (const [aiWidth, aiHeight] of AI_COMMON_SIZES) {
      if (width === aiWidth && height === aiHeight) {
        score += 15;
        signals.push(`Common AI dimensions: ${width}x${height}`);
        break;
      }
    }
  }

  // Check for perfect aspect ratios typical of AI
  if (width >= 512) {
    const aspectRatio = width / height;
    const commonRatios = [
      { ratio: 1.0, name: '1:1' },
      { ratio: 16/9, name: '16:9' },
      { ratio: 9/16, name: '9:16' },
      { ratio: 3/2, name: '3:2' },
      { ratio: 2/3, name: '2:3' }
    ];

    for (const { ratio, name } of commonRatios) {
      if (Math.abs(aspectRatio - ratio) < 0.01) {
        score += 5;
        signals.push(`Perfect AI aspect ratio: ${name}`);
        break;
      }
    }
  }

  // Cap score at 100
  score = Math.min(score, 100);

  return {
    score,
    signals,
    method: 'local'
  };
}

// ============================================
// LAYER 2A: SIGHTENGINE API INTEGRATION
// ============================================

/**
 * Analyze image using Sightengine API (URL-based)
 * @param {string} imageUrl - URL of the image
 * @param {string} apiUser - Sightengine API user ID
 * @param {string} apiSecret - Sightengine API secret
 * @returns {Promise<Object>} Detection result
 */
async function analyzeWithSightengine(imageUrl, apiUser, apiSecret) {
  try {
    // Use message passing to background script to avoid CORS
    const response = await chrome.runtime.sendMessage({
      type: 'CALL_SIGHTENGINE_API',
      data: {
        imageUrl,
        base64Image: null,
        apiUser: apiUser,
        apiSecret: apiSecret
      }
    });
    
    if (!response.success) {
      console.error('[Sightengine] API request failed:', response.status || response.error);
      return {
        success: false,
        error: response.error || `HTTP ${response.status}`,
        method: 'sightengine'
      };
    }

    const data = response.data;

    // Null-safe parsing
    if (data.status !== 'success') {
      console.error('[Sightengine] API status not success:', data.status);
      return {
        success: false,
        error: `Status: ${data.status}`,
        method: 'sightengine'
      };
    }

    if (!data.type) {
      console.error('[Sightengine] Missing type field in response');
      return {
        success: false,
        error: 'Missing fields',
        method: 'sightengine'
      };
    }

    const aiGenerated = data.type.ai_generated ?? 0;
    const aiGeneratedType = data.type.ai_generated_type ?? 'unknown';

    return {
      success: true,
      confidence: Math.round(aiGenerated * 100),
      isAIGenerated: aiGenerated > 0.5,
      aiType: aiGeneratedType,
      method: 'sightengine'
    };

  } catch (error) {
    console.error('[Sightengine] Error:', error.message);
    return {
      success: false,
      error: error.message,
      method: 'sightengine'
    };
  }
}

/**
 * Analyze image using Sightengine API (base64-based)
 * @param {string} base64Image - Base64-encoded image data
 * @param {string} apiUser - Sightengine API user ID
 * @param {string} apiSecret - Sightengine API secret
 * @returns {Promise<Object>} Detection result
 */
async function analyzeWithSightengineBase64(base64Image, apiUser, apiSecret) {
  try {
    // Use message passing to background script to avoid CORS
    const response = await chrome.runtime.sendMessage({
      type: 'CALL_SIGHTENGINE_API',
      data: {
        imageUrl: null,
        base64Image,
        apiUser: apiUser,
        apiSecret: apiSecret
      }
    });
    
    if (!response.success) {
      console.error('[Sightengine] API request failed:', response.status || response.error);
      return {
        success: false,
        error: response.error || `HTTP ${response.status}`,
        method: 'sightengine'
      };
    }

    const data = response.data;

    // Null-safe parsing
    if (data.status !== 'success') {
      console.error('[Sightengine] API status not success:', data.status);
      return {
        success: false,
        error: `Status: ${data.status}`,
        method: 'sightengine'
      };
    }

    if (!data.type) {
      console.error('[Sightengine] Missing type field in response');
      return {
        success: false,
        error: 'Missing fields',
        method: 'sightengine'
      };
    }

    const aiGenerated = data.type.ai_generated ?? 0;
    const aiGeneratedType = data.type.ai_generated_type ?? 'unknown';

    return {
      success: true,
      confidence: Math.round(aiGenerated * 100),
      isAIGenerated: aiGenerated > 0.5,
      aiType: aiGeneratedType,
      method: 'sightengine'
    };

  } catch (error) {
    console.error('[Sightengine] Error:', error.message);
    return {
      success: false,
      error: error.message,
      method: 'sightengine'
    };
  }
}

// ============================================
// LAYER 2B: GEMINI VISION API INTEGRATION
// ============================================

/**
 * Analyze image using Gemini Vision API
 * @param {string} base64Image - Base64-encoded image data
 * @param {string} apiKey - Gemini API key
 * @returns {Promise<Object>} Detection result
 */
async function analyzeWithGemini(base64Image, apiKey) {
  try {
    if (!apiKey) {
      console.error('[Gemini Vision] No API key provided');
      return {
        success: false,
        error: 'No API key',
        method: 'gemini'
      };
    }

    const prompt = `You are an expert forensic analyst specializing in detecting AI-generated images.

Analyze this image for signs of artificial generation.

CHECK FOR THESE ARTIFACTS:

1. ANATOMICAL ERRORS
   - Count fingers on each visible hand (should be exactly 5)
   - Check facial symmetry and proportions
   - Look for impossible body positions or proportions

2. PHYSICS VIOLATIONS
   - Do shadows match the apparent light source direction?
   - Are reflections consistent with the scene?
   - Is lighting coherent across the entire image?

3. TEXTURE ANOMALIES
   - Is skin unnaturally smooth or plastic-looking?
   - Does hair merge with background unnaturally?
   - Are fabric textures consistent?

4. TEXT ISSUES
   - Is any visible text readable and makes sense?
   - Do signs, labels contain gibberish or distorted letters?

5. BACKGROUND PROBLEMS
   - Are there warping or melting effects?
   - Do straight lines remain straight?
   - Are there repeating patterns that don't make sense?

6. EYES AND DETAILS
   - Are irises perfectly circular and matching?
   - Is there the "dead eye" look common in AI?
   - Are accessories like earrings symmetrical and logical?

RESPOND WITH ONLY VALID JSON. NO MARKDOWN. NO EXPLANATION OUTSIDE JSON.

{
  "isAIGenerated": boolean,
  "confidence": number (0-100),
  "artifacts": [
    {"type": "category_name", "description": "specific issue found"}
  ],
  "reasoning": "2-3 sentence explanation"
}`;

    // Use message passing to background script to avoid CORS
    const response = await chrome.runtime.sendMessage({
      type: 'CALL_GEMINI_VISION_API',
      data: {
        base64Image,
        apiKey,
        prompt
      }
    });

    if (!response.success) {
      // Special handling for rate limit errors (429)
      if (response.status === 429) {
        console.warn('[Gemini Vision] Rate limit hit (429) - skipping this image');
        return {
          success: false,
          error: 'Rate limit exceeded',
          method: 'gemini',
          rateLimited: true
        };
      }
      console.error('[Gemini Vision] API request failed:', response.status || response.error);
      return {
        success: false,
        error: response.error || `HTTP ${response.status}`,
        method: 'gemini'
      };
    }

    const data = response.data;

    // Extract text from response
    if (!data.candidates || !data.candidates[0] || 
        !data.candidates[0].content || !data.candidates[0].content.parts ||
        !data.candidates[0].content.parts[0]) {
      console.error('[Gemini Vision] Invalid response structure');
      return {
        success: false,
        error: 'Invalid response structure',
        method: 'gemini'
      };
    }

    const text = data.candidates[0].content.parts[0].text;

    // Extract JSON from response (handle markdown code blocks)
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      console.error('[Gemini Vision] No JSON found in response');
      return {
        success: false,
        error: 'No JSON found',
        method: 'gemini'
      };
    }

    let result;
    try {
      result = JSON.parse(jsonMatch[0]);
    } catch (parseError) {
      console.error('[Gemini Vision] JSON parse failed:', parseError.message);
      return {
        success: false,
        error: 'JSON parse failed',
        method: 'gemini'
      };
    }

    // Validate and use defaults for missing fields
    const isAIGenerated = typeof result.isAIGenerated === 'boolean' 
      ? result.isAIGenerated 
      : false;
    const confidence = typeof result.confidence === 'number' 
      ? result.confidence 
      : 0;
    const artifacts = Array.isArray(result.artifacts) 
      ? result.artifacts 
      : [];
    const reasoning = typeof result.reasoning === 'string' 
      ? result.reasoning 
      : '';

    return {
      success: true,
      confidence,
      isAIGenerated,
      artifacts,
      reasoning,
      method: 'gemini'
    };

  } catch (error) {
    console.error('[Gemini Vision] Error:', error.message);
    return {
      success: false,
      error: error.message,
      method: 'gemini'
    };
  }
}

// ============================================
// COMBINE RESULTS FUNCTION
// ============================================

/**
 * Combine results from all detection methods using weighted scoring
 * @param {Object} localResult - Result from local checks
 * @param {Object} sightengineResult - Result from Sightengine API
 * @param {Object} geminiResult - Result from Gemini Vision API
 * @returns {Object} Combined detection result
 */
function combineResults(localResult, sightengineResult, geminiResult) {
  let totalScore = 0;
  let activeWeight = 0;

  // Local checks: 20% weight
  totalScore += localResult.score * 0.2;
  activeWeight += 0.2;

  // Sightengine: 40% weight
  if (sightengineResult && sightengineResult.success) {
    totalScore += sightengineResult.confidence * 0.4;
    activeWeight += 0.4;
  }

  // Gemini: 40% weight
  if (geminiResult && geminiResult.success) {
    totalScore += geminiResult.confidence * 0.4;
    activeWeight += 0.4;
  }

  // Calculate final confidence
  const finalConfidence = Math.round(totalScore / activeWeight);

  // Determine risk level
  let riskLevel;
  if (finalConfidence >= 70) {
    riskLevel = 'high';
  } else if (finalConfidence >= 40) {
    riskLevel = 'medium';
  } else {
    riskLevel = 'low';
  }

  // Collect signals from all sources
  const signals = [...localResult.signals];
  if (sightengineResult && sightengineResult.success) {
    signals.push(`Sightengine confidence: ${sightengineResult.confidence}%`);
  }
  if (geminiResult && geminiResult.success) {
    signals.push(`Gemini confidence: ${geminiResult.confidence}%`);
  }

  // Get AI type from Sightengine or Gemini if available
  const aiType = (geminiResult && geminiResult.success && geminiResult.aiType) 
    ? geminiResult.aiType 
    : (sightengineResult && sightengineResult.success) 
    ? sightengineResult.aiType 
    : 'unknown';

  // Build comprehensive artifacts from all sources
  const artifacts = [];
  
  // Add Gemini artifacts
  if (geminiResult && geminiResult.success && geminiResult.artifacts && geminiResult.artifacts.length > 0) {
    artifacts.push(...geminiResult.artifacts);
  }
  
  // Add local pattern artifacts
  if (localResult.signals.length > 0) {
    artifacts.push(...localResult.signals.map(s => ({
      type: 'Local Pattern',
      description: s
    })));
  }
  
  // Add Sightengine result as artifact
  if (sightengineResult && sightengineResult.success && sightengineResult.confidence > 50) {
    artifacts.push({
      type: 'ML Detection',
      description: `Sightengine AI model detected ${sightengineResult.confidence}% likelihood of AI generation`
    });
  }
  
  // Ensure at least one artifact exists
  if (artifacts.length === 0) {
    artifacts.push({
      type: 'Analysis',
      description: 'Multi-layer statistical and pattern analysis completed'
    });
  }

  // Determine which sources were used (MUST BE BEFORE reasoning generation)
  const sources = ['local'];
  if (sightengineResult && sightengineResult.success) {
    sources.push('sightengine');
  }
  if (geminiResult && geminiResult.success) {
    sources.push('gemini');
  }

  // Build comprehensive reasoning
  let reasoning = '';
  if (geminiResult && geminiResult.success && geminiResult.reasoning) {
    reasoning = geminiResult.reasoning;
  } else {
    // Generate reasoning based on scores
    if (finalConfidence >= 70) {
      const activeAnalyzers = sources.filter(s => s !== 'local').join(' and ') || 'local patterns';
      reasoning = `High confidence AI detection based on ${activeAnalyzers} analysis. ${signals.length > 1 ? 'Multiple indicators including: ' + signals.slice(0, 2).join(', ') + '.' : ''}`;
    } else if (finalConfidence >= 40) {
      reasoning = `Moderate confidence AI detection. Several indicators suggest possible AI generation. Analysis combined ${sources.length} detection method${sources.length > 1 ? 's' : ''}.`;
    } else {
      reasoning = `Low confidence - likely authentic content. ${sources.length > 1 ? 'Multiple analysis methods' : 'Analysis'} found minimal AI characteristics.`;
    }
  }
  
  // Ensure signals are never empty
  const finalSignals = signals.length > 0 ? signals : ['Analysis completed'];

  return {
    isAIGenerated: finalConfidence >= 40,
    confidence: finalConfidence,
    riskLevel,
    aiType,
    artifacts,
    reasoning,
    signals: finalSignals,
    sources,
    details: {
      local: localResult,
      sightengine: sightengineResult,
      gemini: geminiResult
    }
  };
}

// ============================================
// MAIN FUNCTION: analyzeImage()
// ============================================

/**
 * Main function to analyze an image for AI generation
 * @param {string} imageUrl - URL of the image
 * @param {string} base64Image - Base64-encoded image data
 * @param {number} width - Image width in pixels
 * @param {number} height - Image height in pixels
 * @param {string} geminiApiKey - Gemini API key (optional)
 * @param {string} sightengineUser - Sightengine API user ID (optional)
 * @param {string} sightengineSecret - Sightengine API secret (optional)
 * @returns {Promise<Object>} Comprehensive detection result
 */
async function analyzeImage(imageUrl, base64Image, width, height, geminiApiKey, sightengineUser, sightengineSecret) {
  try {
    // Step 1: Run Layer 1 (Local Checks) - ALWAYS runs first
    console.log('[ImageDetector] Running local pattern checks...');
    const localResult = checkLocalSignals(imageUrl, width, height);
    console.log('[ImageDetector] Local result:', localResult);

    // Step 2: EARLY RETURN CHECK
    if (localResult.score >= 70) {
      console.log('[ImageDetector] High local score detected, skipping API calls');
      return {
        isAIGenerated: true,
        confidence: localResult.score,
        riskLevel: 'high',
        aiType: 'unknown',
        artifacts: localResult.signals.length > 0 ? localResult.signals.map(s => ({
          type: 'Local Pattern',
          description: s
        })) : [{ type: 'Pattern Match', description: 'Strong AI platform indicators detected' }],
        reasoning: localResult.signals.length > 0 ? 
          `Strong local signals detected: ${localResult.signals.join(', ')}` : 
          'Multiple AI platform indicators detected in image metadata and characteristics',
        signals: localResult.signals.length > 0 ? localResult.signals : ['AI platform detected'],
        sources: ['local'],
        details: {
          local: localResult,
          sightengine: null,
          gemini: null
        }
      };
    }

    // Step 3: Run Layer 2 APIs in parallel
    console.log('[ImageDetector] Running API-based detection...');
    
    const apiPromises = [];

    // Sightengine: prefer URL if available, fallback to base64 (only if credentials provided)
    if (sightengineUser && sightengineSecret) {
      if (imageUrl && !imageUrl.startsWith('data:')) {
        apiPromises.push(analyzeWithSightengine(imageUrl, sightengineUser, sightengineSecret));
      } else if (base64Image) {
        apiPromises.push(analyzeWithSightengineBase64(base64Image, sightengineUser, sightengineSecret));
      } else {
        apiPromises.push(Promise.resolve({ success: false, error: 'No image data', method: 'sightengine' }));
      }
    } else {
      console.log('[ImageDetector] Sightengine credentials not provided, skipping');
      apiPromises.push(Promise.resolve({ success: false, error: 'No credentials', method: 'sightengine' }));
    }

    // Gemini: requires base64 and API key
    if (base64Image && geminiApiKey) {
      apiPromises.push(analyzeWithGemini(base64Image, geminiApiKey));
    } else {
      apiPromises.push(Promise.resolve({ success: false, error: 'No API key or base64', method: 'gemini' }));
    }

    const [sightengineResult, geminiResult] = await Promise.all(apiPromises);
    
    console.log('[ImageDetector] Sightengine result:', sightengineResult);
    console.log('[ImageDetector] Gemini result:', geminiResult);

    // Step 4: Combine all results
    const finalResult = combineResults(localResult, sightengineResult, geminiResult);
    console.log('[ImageDetector] Final result:', finalResult);

    return finalResult;

  } catch (error) {
    console.error('[ImageDetector] Error in analyzeImage:', error.message);
    
    // Return result based on local checks only
    const localResult = checkLocalSignals(imageUrl, width, height);
    return {
      isAIGenerated: localResult.score >= 40,
      confidence: localResult.score,
      riskLevel: localResult.score >= 70 ? 'high' : localResult.score >= 40 ? 'medium' : 'low',
      aiType: 'unknown',
      artifacts: [],
      reasoning: 'API detection failed, using local signals only',
      signals: localResult.signals,
      sources: ['local'],
      details: {
        local: localResult,
        sightengine: null,
        gemini: null
      }
    };
  }
}

// ============================================
// HELPER FUNCTIONS
// ============================================

/**
 * Convert image element to base64
 * @param {HTMLImageElement} imgElement - Image element
 * @returns {Promise<string>} Base64-encoded image data
 */
function imageToBase64(imgElement) {
  return new Promise((resolve, reject) => {
    try {
      const canvas = document.createElement('canvas');
      canvas.width = imgElement.naturalWidth || imgElement.width;
      canvas.height = imgElement.naturalHeight || imgElement.height;
      
      const ctx = canvas.getContext('2d');
      ctx.drawImage(imgElement, 0, 0);
      
      const base64 = canvas.toDataURL('image/jpeg', 0.8);
      resolve(base64);
    } catch (error) {
      reject(error);
    }
  });
}

/**
 * Get Gemini API key from Chrome storage
 * @returns {Promise<string|null>} API key or null
 */
function getGeminiApiKey() {
  return new Promise((resolve) => {
    if (typeof chrome === 'undefined' || !chrome.storage) {
      resolve(null);
      return;
    }

    chrome.storage.sync.get(['geminiApiKey', 'apiKey'], (result) => {
      resolve(result.geminiApiKey || result.apiKey || null);
    });
  });
}

// ============================================
// EXPORTS
// ============================================

// ES6 module exports (for Chrome extension)
export {
  analyzeImage,
  checkLocalSignals,
  analyzeWithSightengine,
  analyzeWithSightengineBase64,
  analyzeWithGemini,
  combineResults,
  imageToBase64,
  getGeminiApiKey
};
