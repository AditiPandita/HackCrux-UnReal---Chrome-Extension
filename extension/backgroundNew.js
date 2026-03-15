// ShareSafe - Background Service Worker v2.2
// Fixed version with CORS bypass for image fetching
// Added text detection backend support

// ═══════════════════════════════════════════════════════════════
// CONFIGURATION
// ═══════════════════════════════════════════════════════════════

let DEMO_MODE = false;
let lastAnalysis = null;
let lastAnalysisTimestamp = 0;
let backendStatus = {
  image: false,
  text: false,
  lastCheck: 0
};

// Check if API key exists
chrome.storage.sync.get(['geminiApiKey'], (data) => {
  if (!data.geminiApiKey) {
    console.log('ShareSafe: No API key found, statistical analysis only');
    DEMO_MODE = true;
  } else {
    console.log('ShareSafe: API key found, LLM available for tie-breaking');
    DEMO_MODE = false;
  }
});

// ═══════════════════════════════════════════════════════════════
// MESSAGE HANDLERS
// ═══════════════════════════════════════════════════════════════

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {

  // ========== FETCH IMAGE AS BASE64 (CORS Bypass) ==========
  if (message.type === 'FETCH_IMAGE_AS_BASE64') {
    (async () => {
      try {
        const { imageUrl } = message.data;

        if (!imageUrl) {
          sendResponse({ success: false, error: 'No image URL provided' });
          return;
        }

        // Don't try to fetch data URLs
        if (imageUrl.startsWith('data:')) {
          sendResponse({ success: false, error: 'Cannot fetch data URLs' });
          return;
        }

        console.log('[Background] Fetching image:', imageUrl.substring(0, 80) + '...');

        // Fetch with timeout
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 15000);

        const response = await fetch(imageUrl, {
          method: 'GET',
          headers: {
            'Accept': 'image/webp,image/apng,image/*,*/*;q=0.8'
          },
          signal: controller.signal
        });

        clearTimeout(timeoutId);

        if (!response.ok) {
          console.error('[Background] Image fetch failed:', response.status);
          sendResponse({ success: false, error: `HTTP ${response.status}` });
          return;
        }

        const blob = await response.blob();

        // Validate it's actually an image
        if (!blob.type.startsWith('image/')) {
          console.error('[Background] Response is not an image:', blob.type);
          sendResponse({ success: false, error: 'Not an image' });
          return;
        }

        // Convert blob to base64
        const base64Promise = new Promise((resolve, reject) => {
          const reader = new FileReader();
          reader.onloadend = () => resolve(reader.result);
          reader.onerror = () => reject(new Error('FileReader error'));
          reader.readAsDataURL(blob);
        });

        const base64Data = await base64Promise;

        console.log('[Background] Image fetched successfully, size:', Math.round(base64Data.length / 1024), 'KB');

        sendResponse({
          success: true,
          base64: base64Data,
          mimeType: blob.type,
          size: blob.size
        });

      } catch (error) {
        if (error.name === 'AbortError') {
          console.error('[Background] Image fetch timeout');
          sendResponse({ success: false, error: 'Timeout' });
        } else {
          console.error('[Background] Image fetch error:', error);
          sendResponse({ success: false, error: error.message });
        }
      }
    })();
    return true;
  }

  // ========== ML BACKEND PROXY (Layer 3) ==========
  if (message.type === 'ML_BACKEND_REQUEST') {
    (async () => {
      try {
        const { endpoint, method, body } = message;
        const backendUrl = 'http://localhost:8000';

        console.log('[Background] ML Backend request:', endpoint);

        const fetchOptions = {
          method: method || 'GET',
          headers: {
            'Content-Type': 'application/json',
            'Accept': 'application/json'
          }
        };

        if (body) {
          fetchOptions.body = JSON.stringify(body);
        }

        const response = await fetch(`${backendUrl}${endpoint}`, fetchOptions);

        if (!response.ok) {
          sendResponse({
            success: false,
            error: `Backend returned ${response.status}`
          });
          return;
        }

        const data = await response.json();
        console.log('[Background] ML Backend response:', data);
        sendResponse({ success: true, data });

      } catch (error) {
        console.log('[Background] ML Backend error:', error.message);
        sendResponse({
          success: false,
          error: error.message
        });
      }
    })();
    return true;
  }

  // ========== TEXT BACKEND PROXY (Text Detection) ==========
  if (message.type === 'TEXT_BACKEND_REQUEST') {
    (async () => {
      try {
        const { text } = message;
        const backendUrl = 'http://localhost:8001';

        console.log('[Background] Text Backend request, text length:', text?.length || 0);

        const response = await fetch(`${backendUrl}/detect`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Accept': 'application/json'
          },
          body: JSON.stringify({ text })
        });

        if (!response.ok) {
          sendResponse({
            success: false,
            error: `Text backend returned ${response.status}`
          });
          return;
        }

        const data = await response.json();
        console.log('[Background] Text Backend response:', data);
        sendResponse({ success: true, data });

      } catch (error) {
        console.log('[Background] Text Backend error:', error.message);
        sendResponse({
          success: false,
          error: error.message
        });
      }
    })();
    return true;
  }

  // ========== FETCH IMAGE FOR ANALYSIS (Used by Layer 3 & 4) ==========
  if (message.type === 'FETCH_IMAGE_FOR_ANALYSIS') {
    (async () => {
      try {
        const imageUrl = message.url;

        if (!imageUrl) {
          sendResponse({ success: false, error: 'No image URL provided' });
          return;
        }

        // Don't try to fetch data URLs
        if (imageUrl.startsWith('data:')) {
          sendResponse({ success: true, base64: imageUrl });
          return;
        }

        console.log('[Background] FETCH_IMAGE_FOR_ANALYSIS:', imageUrl.substring(0, 60) + '...');

        // Fetch with timeout
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 15000);

        const response = await fetch(imageUrl, {
          method: 'GET',
          headers: {
            'Accept': 'image/webp,image/apng,image/*,*/*;q=0.8'
          },
          signal: controller.signal
        });

        clearTimeout(timeoutId);

        if (!response.ok) {
          console.error('[Background] Image fetch failed:', response.status);
          sendResponse({ success: false, error: `HTTP ${response.status}` });
          return;
        }

        const blob = await response.blob();

        // Validate it's actually an image
        if (!blob.type.startsWith('image/')) {
          console.error('[Background] Response is not an image:', blob.type);
          sendResponse({ success: false, error: 'Not an image' });
          return;
        }

        // Convert blob to base64
        const base64Promise = new Promise((resolve, reject) => {
          const reader = new FileReader();
          reader.onloadend = () => resolve(reader.result);
          reader.onerror = () => reject(new Error('FileReader error'));
          reader.readAsDataURL(blob);
        });

        const base64Data = await base64Promise;

        console.log('[Background] Image fetched for analysis, size:', Math.round(base64Data.length / 1024), 'KB');

        sendResponse({
          success: true,
          base64: base64Data
        });

      } catch (error) {
        if (error.name === 'AbortError') {
          console.error('[Background] Image fetch timeout');
          sendResponse({ success: false, error: 'Timeout' });
        } else {
          console.error('[Background] Image fetch error:', error);
          sendResponse({ success: false, error: error.message });
        }
      }
    })();
    return true;
  }


  // ========== GEMINI VISION API PROXY ==========
  if (message.type === 'CALL_GEMINI_VISION_API') {
    (async () => {
      try {
        const { base64Image, apiKey, prompt } = message.data;

        if (!apiKey) {
          sendResponse({ success: false, error: 'No API key provided' });
          return;
        }

        const cleanBase64 = base64Image.includes(',') ? base64Image.split(',')[1] : base64Image;

        const requestBody = {
          contents: [{
            parts: [
              { text: prompt },
              {
                inline_data: {
                  mime_type: 'image/jpeg',
                  data: cleanBase64
                }
              }
            ]
          }],
          generationConfig: {
            temperature: 0.1,
            maxOutputTokens: 1024
          }
        };

        const response = await fetch(
          `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-lite:generateContent?key=${apiKey}`,
          {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(requestBody)
          }
        );

        const data = await response.json();
        sendResponse({ success: response.ok, data, status: response.status });
      } catch (error) {
        console.error('[Background] Gemini Vision API error:', error);
        sendResponse({ success: false, error: error.message });
      }
    })();
    return true;
  }

  // ========== GET API CREDENTIALS ==========
  if (message.type === 'GET_API_CREDENTIALS') {
    (async () => {
      try {
        const data = await chrome.storage.sync.get(['geminiApiKey']);
        sendResponse({
          geminiApiKey: data.geminiApiKey || null
        });
      } catch (error) {
        console.error('[Background] Error getting credentials:', error);
        sendResponse({
          geminiApiKey: null
        });
      }
    })();
    return true;
  }

  // ========== SEGMENT LLM TIE-BREAKER ==========
  if (message.type === 'ANALYZE_SEGMENT_LLM') {
    (async () => {
      try {
        const settings = await chrome.storage.sync.get(['llmTiebreaker', 'geminiApiKey']);

        if (!settings.llmTiebreaker || !settings.geminiApiKey || DEMO_MODE) {
          sendResponse(null);
          return;
        }

        const statScore = message.statScore || 50;
        if (statScore < 25 || statScore > 75) {
          sendResponse(null);
          return;
        }

        console.log('ShareSafe: Using LLM tie-breaker for uncertain segment (score:', statScore, ')');

        const result = await analyzeSegmentWithGemini(message.text, settings.geminiApiKey);
        sendResponse(result);
      } catch (error) {
        console.error('ShareSafe: Segment LLM analysis error', error);
        sendResponse(null);
      }
    })();
    return true;
  }

  // ========== PAGE ANALYSIS ==========
  if (message.type === 'GET_PAGE_ANALYSIS' || message.type === 'GET_LAST_ANALYSIS') {
    (async () => {
      try {
        const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
        const activeUrl = tabs[0]?.url || '';

        const isFresh = (Date.now() - lastAnalysisTimestamp) < 300000;
        const isSameUrl = Boolean(lastAnalysis?.url && activeUrl && lastAnalysis.url === activeUrl);

        if (lastAnalysis && isFresh && isSameUrl) {
          console.log('[Background] Returning in-memory analysis for current tab:', activeUrl);
          sendResponse(lastAnalysis);
          return;
        }

        if (lastAnalysis && isFresh && !isSameUrl) {
          console.log('[Background] Ignoring stale in-memory analysis from different URL:', {
            lastAnalysisUrl: lastAnalysis.url,
            activeUrl
          });
        }

        const cached = await getLastPageAnalysis();
        sendResponse(cached);
      } catch (error) {
        console.error('ShareSafe: Error getting page analysis', error);
        sendResponse(null);
      }
    })();
    return true;
  }

  // ========== STORE ANALYSIS ==========
  if (message.type === 'STORE_ANALYSIS') {
    (async () => {
      try {
        lastAnalysis = message.data;
        lastAnalysisTimestamp = Date.now();
        sendResponse({ success: true });
      } catch (error) {
        console.error('ShareSafe: Error storing analysis', error);
        sendResponse({ success: false });
      }
    })();
    return true;
  }

  // ========== STORE VIDEO ANALYSIS ==========
  if (message.type === 'STORE_VIDEO_ANALYSIS') {
    (async () => {
      try {
        // Store video analysis results
        const videoResults = (await chrome.storage.local.get(['videoAnalysisResults'])).videoAnalysisResults || [];
        videoResults.push({
          ...message.data,
          timestamp: Date.now()
        });
        // Keep only last 20 results
        const trimmed = videoResults.slice(-20);
        await chrome.storage.local.set({ videoAnalysisResults: trimmed });
        console.log('[Background] Stored video analysis:', message.data.riskLevel);
        sendResponse({ success: true });
      } catch (error) {
        console.error('ShareSafe: Error storing video analysis', error);
        sendResponse({ success: false });
      }
    })();
    return true;
  }

  // ========== STORE FAKE NEWS ANALYSIS ==========
  if (message.type === 'STORE_FAKE_NEWS_ANALYSIS') {
    (async () => {
      try {
        // Store fake news analysis results
        const fakeNewsResults = (await chrome.storage.local.get(['fakeNewsAnalysisResults'])).fakeNewsAnalysisResults || [];
        fakeNewsResults.push({
          ...message.data,
          timestamp: Date.now()
        });
        // Keep only last 15 results to save storage
        const trimmed = fakeNewsResults.slice(-15);
        await chrome.storage.local.set({ fakeNewsAnalysisResults: trimmed });
        console.log('[Background] Stored fake news analysis:', message.data.riskLevel, '-', message.data.summary);
        sendResponse({ success: true });
      } catch (error) {
        console.error('ShareSafe: Error storing fake news analysis', error);
        sendResponse({ success: false });
      }
    })();
    return true;
  }

  return false;
});

// ═══════════════════════════════════════════════════════════════
// SEGMENT ANALYSIS WITH GEMINI
// ═══════════════════════════════════════════════════════════════

async function analyzeSegmentWithGemini(text, apiKey) {
  const prompt = `
Analyze this text segment for AI-generated characteristics.

Text: "${text}"

Focus on:
1. Stylistic consistency and naturalness
2. Pattern repetition (AI tends to repeat phrases/structures)
3. Synthetic or formulaic language
4. Lack of personal voice or genuine emotion
5. Overly formal or corporate tone
6. Generic, vague, or padding language

Respond in valid JSON only:
{
  "score": number 0-100 (100 = definitely AI-generated),
  "confidence": number 0-100,
  "reasons": ["specific issue 1", "specific issue 2", "specific issue 3"],
  "interpretation": "one sentence assessment"
}
`;

  try {
    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-lite:generateContent?key=${apiKey}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{ parts: [{ text: prompt }] }],
          generationConfig: { temperature: 0.1, maxOutputTokens: 512 }
        })
      }
    );

    const data = await response.json();
    const textContent = data?.candidates?.[0]?.content?.parts?.[0]?.text;

    if (!textContent) return null;

    const jsonMatch = textContent.match(/\{[\s\S]*\}/);
    if (!jsonMatch) return null;

    const result = JSON.parse(jsonMatch[0]);

    return {
      score: result.score || 50,
      confidence: 70,
      reasons: result.reasons || [],
      interpretation: result.interpretation || 'AI analysis complete',
      method: 'gemini'
    };
  } catch (error) {
    console.error('ShareSafe: Gemini segment analysis failed', error);
    return null;
  }
}

// ═══════════════════════════════════════════════════════════════
// HELPER FUNCTIONS
// ═══════════════════════════════════════════════════════════════

async function getLastPageAnalysis() {
  try {
    const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
    if (!tabs[0]?.url) return null;

    const data = await chrome.storage.local.get(['cache_page']);
    const cache = data.cache_page || {};

    const entries = Object.entries(cache);
    const matching = entries.filter(([key]) => key.includes(new URL(tabs[0].url).hostname));

    if (matching.length > 0) {
      const sorted = matching.sort((a, b) => b[1].timestamp - a[1].timestamp);
      return sorted[0][1].data;
    }

    return null;
  } catch (error) {
    console.error('ShareSafe: Error getting last analysis', error);
    return null;
  }
}

console.log('ShareSafe v2.2: Background worker initialized with CORS bypass. LLM tie-breaker mode:', !DEMO_MODE);

// ═══════════════════════════════════════════════════════════════
// BACKEND HEALTH CHECK
// ═══════════════════════════════════════════════════════════════

async function checkBackendHealth() {
  const now = Date.now();

  // Only check every 30 seconds
  if (now - backendStatus.lastCheck < 30000) {
    return backendStatus;
  }

  console.log('[Background] Checking backend health...');

  // Check image backend (port 8000)
  try {
    const imageResponse = await fetch('http://localhost:8000/health', {
      method: 'GET',
      signal: AbortSignal.timeout(2000)
    });
    backendStatus.image = imageResponse.ok;
  } catch (error) {
    backendStatus.image = false;
  }

  // Check text backend (port 8001)
  try {
    const textResponse = await fetch('http://localhost:8001/detect', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text: 'health check' }),
      signal: AbortSignal.timeout(2000)
    });
    backendStatus.text = textResponse.ok;
  } catch (error) {
    backendStatus.text = false;
  }

  backendStatus.lastCheck = now;

  // Store in chrome.storage for popup access
  chrome.storage.local.set({ backendStatus });

  console.log('[Background] Backend status:', backendStatus);
  return backendStatus;
}

// Check backend health on startup
checkBackendHealth();

// Check periodically (every 60 seconds)
setInterval(checkBackendHealth, 60000);