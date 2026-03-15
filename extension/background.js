// ShareSafe - Background Service Worker
// Intelligent content analysis with Gemini AI integration

import { analyzeWithGemini } from './gemini.js';

// ═══════════════════════════════════════════════════════════════
// CONFIGURATION
// ═══════════════════════════════════════════════════════════════

let DEMO_MODE = false; // Set to false to use real Gemini API (gemini-2.5-flash)
const CACHE_DURATION_MS = 10 * 60 * 1000; // 10 minutes

// Clear old cache on startup
chrome.storage.local.remove(['analysisCache']);

// Check if API key exists, if not enable demo mode
chrome.storage.sync.get(['geminiApiKey'], (data) => {
  if (!data.geminiApiKey) {
    console.log('ShareSafe: No API key found, using demo mode');
    DEMO_MODE = true;
  } else {
    console.log('ShareSafe: API key found, using Gemini 2.5 Flash');
    DEMO_MODE = false;
  }
});

// ═══════════════════════════════════════════════════════════════
// CONTENT ANALYSIS ENGINE
// Analyzes page content for misinformation, AI generation, manipulation
// ═══════════════════════════════════════════════════════════════

function analyzeContent(url, content = {}) {
  const lowerUrl = url.toLowerCase();
  const title = (content.title || '').toLowerCase();
  const headline = (content.headline || '').toLowerCase();
  const bodyText = (content.bodyText || '').toLowerCase();
  const allText = `${title} ${headline} ${bodyText}`;
  const imageUrl = (content.imageUrl || '').toLowerCase();
  const hasImage = !!content.imageUrl;
  const hasVideo = content.hasVideo || false;

  // Scoring system
  const findings = {
    issues: [],
    positives: [],
    score: 0
  };

  // ─────────────────────────────────────────────────────────────
  // 1. AI-GENERATED CONTENT DETECTION
  // ─────────────────────────────────────────────────────────────

  // AI platforms in URL
  const aiPlatformUrl = /chatgpt|openai\.com\/|dall-?e|midjourney|runway|pika\.art|heygen|synthesia|d-id\.com|sora|leonardo\.ai|playground\.ai|ideogram|stability\.ai|replicate\.com/i;
  if (aiPlatformUrl.test(lowerUrl)) {
    findings.issues.push('AI content generation platform');
    findings.score += 40;
  }

  // AI mentions in content
  const aiMentions = /\b(ai[- ]?generated|made with (ai|dall-?e|midjourney)|created by (ai|chatgpt)|stable diffusion|#aiart|artificial intelligence generated|synthetic (image|video|media)|gpt-?4 (generated|created))\b/i;
  if (aiMentions.test(allText)) {
    findings.issues.push('AI-generated content indicators');
    findings.score += 35;
  }

  // AI indicators in image URL
  const aiImageUrl = /dall-?e|midjourney|stable[_-]?diffusion|openai|_sd_|_mj_|ai[_-]?gen|synthetic|generated/i;
  if (hasImage && aiImageUrl.test(imageUrl)) {
    findings.issues.push('Image URL suggests AI generation');
    findings.score += 30;
  }

  // Deepfake indicators
  const deepfakePattern = /deepfake|face[- ]?swap|synthetic face|ai avatar|digital human|virtual human/i;
  if (deepfakePattern.test(allText)) {
    findings.issues.push('Potential deepfake or synthetic media');
    findings.score += 45;
  }

  // ─────────────────────────────────────────────────────────────
  // 2. MANIPULATED/EDITED CONTENT DETECTION
  // ─────────────────────────────────────────────────────────────

  const manipulationTerms = /\b(photoshop(ped)?|edited|manipulated|doctored|altered|faked?|morphed|retouched|digitally altered|not real|fabricated|staged)\b/i;
  if (manipulationTerms.test(allText)) {
    findings.issues.push('Content mentions manipulation or editing');
    findings.score += 28;
  }

  // Out of context content
  const outOfContext = /\b(old (video|photo|image)|from \d{4}|years? ago|not recent|out of context|misleading|actually from|originally posted|resurfaced|viral again)\b/i;
  if (outOfContext.test(allText)) {
    findings.issues.push('May be outdated or out of context');
    findings.score += 25;
  }

  // ─────────────────────────────────────────────────────────────
  // 3. MISINFORMATION & FAKE NEWS DETECTION
  // ─────────────────────────────────────────────────────────────

  // Known unreliable sources
  const unreliableSites = /theonion|babylonbee|clickhole|infowars|naturalnews|beforeitsnews|worldnewsdailyreport/i;
  if (unreliableSites.test(lowerUrl)) {
    findings.issues.push('Known satire or unreliable source');
    findings.score += 50;
  }

  // Clickbait headlines
  const clickbait = /\b(shocking|unbelievable|you won't believe|mind[- ]?blow|what happens next|doctors hate|one weird trick|secret revealed|exposed|truth about)\b/i;
  if (clickbait.test(title) || clickbait.test(headline)) {
    findings.issues.push('Clickbait headline detected');
    findings.score += 22;
  }

  // Emotional manipulation
  const emotional = /\b(terrifying|horrifying|disgusting|outrageous|furious|evil|corrupt|destroyed|wake up|sheeple)\b/i;
  if (emotional.test(allText)) {
    findings.issues.push('Emotional manipulation language');
    findings.score += 18;
  }

  // Conspiracy theories
  const conspiracy = /\b(cover[- ]?up|hidden truth|they don't want you|mainstream media lies|big pharma|deep state|new world order|illuminati|cabal|plandemic|controlled opposition)\b/i;
  if (conspiracy.test(allText)) {
    findings.issues.push('Conspiracy theory language');
    findings.score += 35;
  }

  // Unverified claims
  const unverified = /\b(sources say|reportedly|allegedly|rumor has it|unconfirmed|anonymous source|some people say|many believe)\b/i;
  if (unverified.test(allText)) {
    findings.issues.push('Unverified or anonymous claims');
    findings.score += 12;
  }

  // ─────────────────────────────────────────────────────────────
  // 4. HEALTH & FINANCIAL SCAM DETECTION
  // ─────────────────────────────────────────────────────────────

  const healthScam = /\b(miracle cure|big pharma hiding|vaccine (danger|injury|death)|doctors don't want|natural cure for|cures? (cancer|diabetes|everything)|they don't want you to know)\b/i;
  if (healthScam.test(allText)) {
    findings.issues.push('Potential health misinformation');
    findings.score += 38;
  }

  const financialScam = /\b(get rich (quick|fast)|guaranteed returns|secret (investment|method)|become a millionaire|passive income secret|crypto opportunity|limited time offer|act now)\b/i;
  if (financialScam.test(allText)) {
    findings.issues.push('Potential financial scam');
    findings.score += 32;
  }

  // ─────────────────────────────────────────────────────────────
  // 5. VIDEO CONTENT ANALYSIS
  // ─────────────────────────────────────────────────────────────

  if (hasVideo) {
    const videoManipulation = /\b(fake video|edited video|manipulated video|ai video|generated video|synthetic video|cgi|vfx fake)\b/i;
    if (videoManipulation.test(allText)) {
      findings.issues.push('Video manipulation indicators');
      findings.score += 30;
    }
  }

  // ─────────────────────────────────────────────────────────────
  // 6. TRUSTED SOURCE BONUS (reduces score)
  // ─────────────────────────────────────────────────────────────

  const trustedNews = /reuters\.com|bbc\.com|bbc\.co\.uk|apnews\.com|npr\.org|pbs\.org|nytimes\.com|washingtonpost\.com|theguardian\.com|wsj\.com|economist\.com/i;
  const factCheckers = /snopes\.com|factcheck\.org|politifact\.com|fullfact\.org|leadstories\.com/i;
  const official = /\.gov\/|\.edu\/|who\.int|un\.org|europa\.eu/i;

  if (factCheckers.test(lowerUrl)) {
    findings.positives.push('Verified fact-checking source');
    findings.score -= 40;
  } else if (trustedNews.test(lowerUrl)) {
    findings.positives.push('Established news organization');
    findings.score -= 25;
  } else if (official.test(lowerUrl)) {
    findings.positives.push('Official institutional source');
    findings.score -= 20;
  }

  // Wikipedia
  if (/wikipedia\.org/i.test(lowerUrl)) {
    findings.positives.push('Wikipedia (check cited sources)');
    findings.score -= 15;
  }

  // ─────────────────────────────────────────────────────────────
  // 7. CALCULATE FINAL RESULT
  // ─────────────────────────────────────────────────────────────

  // Normalize score to 0-100
  findings.score = Math.min(100, Math.max(0, findings.score));

  // Determine risk level
  let riskLevel, summary;
  
  if (findings.score >= 55) {
    riskLevel = 'high';
    summary = 'Multiple red flags detected. Verify with trusted sources before sharing.';
  } else if (findings.score >= 25) {
    riskLevel = 'medium';
    summary = 'Some concerns found. Consider fact-checking before sharing.';
  } else {
    riskLevel = 'low';
    summary = findings.positives.length > 0 
      ? 'Source appears credible. Standard verification recommended.'
      : 'No major concerns detected. Always verify important claims.';
  }

  // Build reasons list
  let reasons = [...findings.issues];
  if (findings.positives.length > 0 && findings.issues.length === 0) {
    reasons = findings.positives;
  }

  // Ensure we always have at least one reason
  if (reasons.length === 0) {
    reasons = ['Content analysis complete'];
  }

  return {
    riskLevel,
    score: findings.score,
    reasons: reasons.slice(0, 4),
    summary
  };
}

// ═══════════════════════════════════════════════════════════════
// CACHING SYSTEM
// ═══════════════════════════════════════════════════════════════

async function getCachedResult(url) {
  try {
    const data = await chrome.storage.local.get(['analysisCache']);
    const cache = data.analysisCache || {};
    const entry = cache[url];
    
    if (entry && Date.now() - entry.timestamp < CACHE_DURATION_MS) {
      return entry.result;
    }
  } catch (e) {
    console.error('ShareSafe: Cache read error', e);
  }
  return null;
}

async function setCachedResult(url, result) {
  try {
    const data = await chrome.storage.local.get(['analysisCache']);
    const cache = data.analysisCache || {};
    
    // Clean expired entries
    const now = Date.now();
    Object.keys(cache).forEach(key => {
      if (now - cache[key].timestamp > CACHE_DURATION_MS) {
        delete cache[key];
      }
    });
    
    cache[url] = { result, timestamp: now };
    await chrome.storage.local.set({ analysisCache: cache });
  } catch (e) {
    console.error('ShareSafe: Cache write error', e);
  }
}

// ═══════════════════════════════════════════════════════════════
// MAIN ANALYSIS HANDLER
// ═══════════════════════════════════════════════════════════════

async function handleAnalysis(content) {
  const url = content.url || '';

  // Check cache first
  const cached = await getCachedResult(url);
  if (cached) {
    console.log('ShareSafe: Using cached result for', url);
    return cached;
  }

  let result;

  if (DEMO_MODE) {
    // Demo mode: Use local analysis
    console.log('ShareSafe: Using DEMO MODE (local analysis)');
    await new Promise(r => setTimeout(r, 600)); // Simulate processing
    result = analyzeContent(url, content);
  } else {
    // Production mode: Try Gemini API
    console.log('ShareSafe: Using Gemini 2.5 Flash API');
    try {
      const data = await chrome.storage.sync.get(['geminiApiKey']);
      const apiKey = data.geminiApiKey;
      
      if (apiKey) {
        console.log('ShareSafe: API key found, calling Gemini...');
        result = await analyzeWithGemini(content, apiKey);
        console.log('ShareSafe: Gemini response:', result);
      } else {
        // No API key, fall back to local analysis
        console.log('ShareSafe: No API key, falling back to local analysis');
        result = analyzeContent(url, content);
      }
    } catch (error) {
      console.error('ShareSafe: Gemini API error', error);
      result = analyzeContent(url, content);
    }
  }

  // Cache the result
  await setCachedResult(url, result);
  
  return result;
}

// ═══════════════════════════════════════════════════════════════
// MESSAGE HANDLERS
// ═══════════════════════════════════════════════════════════════

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  
  // Main analysis request (page-level)
  if (message.type === 'ANALYZE') {
    handleAnalysis(message.content)
      .then(sendResponse)
      .catch(err => {
        console.error('ShareSafe: Analysis failed', err);
        sendResponse({
          riskLevel: 'medium',
          score: 50,
          reasons: ['Analysis temporarily unavailable'],
          summary: 'Could not complete analysis. Please try again.'
        });
      });
    return true; // Keep channel open for async response
  }

  // Analyze individual post (for social media feeds)
  if (message.type === 'ANALYZE_POST') {
    // Only use Gemini if we have API key and not in demo mode
    if (DEMO_MODE) {
      // In demo mode, return null to let content script use local analysis
      sendResponse(null);
      return false;
    }
    
    // Use Gemini for post analysis
    (async () => {
      try {
        const data = await chrome.storage.sync.get(['geminiApiKey']);
        if (data.geminiApiKey) {
          const result = await analyzeWithGemini(message.content, data.geminiApiKey);
          sendResponse(result);
        } else {
          sendResponse(null);
        }
      } catch (error) {
        console.error('ShareSafe: Post analysis error', error);
        sendResponse(null);
      }
    })();
    return true; // Keep channel open for async response
  }

  // Get demo mode status
  if (message.type === 'GET_DEMO_MODE') {
    sendResponse({ demoMode: DEMO_MODE });
    return false;
  }

  // Set demo mode
  if (message.type === 'SET_DEMO_MODE') {
    DEMO_MODE = message.enabled;
    chrome.storage.local.remove(['analysisCache']); // Clear cache on mode change
    sendResponse({ success: true, demoMode: DEMO_MODE });
    return false;
  }

  // Get last analysis for popup
  if (message.type === 'GET_LAST_ANALYSIS') {
    chrome.tabs.query({ active: true, currentWindow: true }, async (tabs) => {
      if (tabs[0]?.url) {
        const cached = await getCachedResult(tabs[0].url);
        sendResponse(cached || null);
      } else {
        sendResponse(null);
      }
    });
    return true;
  }
});

console.log('ShareSafe: Service worker initialized. Demo mode:', DEMO_MODE);
