// ShareSafe Content Script v2.5 - Unified AI Detection
// Integrates text and image detection with social media scanning
// Added overlay toggle support

// NOTE: Pipeline is loaded dynamically - Chrome content scripts cannot use static imports
// All modules use chrome.runtime.getURL() for dynamic imports

// ═══════════════════════════════════════════════════════════════
// TEXT DETECTION MODULES (Dynamically Loaded)
// ═══════════════════════════════════════════════════════════════
let patternDatabase = null;
let socialMediaScanner = null;
let headlineExtractor = null;
let newsVerifier = null;
let textDetectionEnabled = false;
let fakeNewsDetectionEnabled = false;
let overlaysVisible = true; // Global flag for overlay visibility

// ═══════════════════════════════════════════════════════════════
// MESSAGE HANDLERS (Global scope for popup communication)
// ═══════════════════════════════════════════════════════════════
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type === 'TOGGLE_OVERLAYS') {
    overlaysVisible = message.visible;
    toggleAllOverlays(message.visible);
    sendResponse({ success: true });
    return true;
  }
  
  if (message.type === 'SETTINGS_CHANGED') {
    if (message.setting === 'extensionEnabled' && !message.value) {
      // Hide all overlays when extension is disabled
      toggleAllOverlays(false);
    }
    sendResponse({ success: true });
    return true;
  }
  
  return false;
});

// Toggle visibility of all overlays
function toggleAllOverlays(visible) {
  // Image badges
  document.querySelectorAll('.unreal-image-badge, .unreal-spinner-overlay').forEach(el => {
    el.style.display = visible ? '' : 'none';
  });
  
  // Image borders
  document.querySelectorAll('.unreal-image-border-high, .unreal-image-border-medium, .unreal-image-border-low').forEach(el => {
    if (!visible) {
      el.classList.remove('unreal-image-border-high', 'unreal-image-border-medium', 'unreal-image-border-low');
    }
  });
  
  // Text highlights and badges
  document.querySelectorAll('.sharesafe-segment-highlight, .sharesafe-segment-badge, .sharesafe-text-indicator').forEach(el => {
    el.style.display = visible ? '' : 'none';
  });
  
  // Summary panel
  document.querySelectorAll('.sharesafe-summary-panel, #sharesafe-floating-badge').forEach(el => {
    el.style.display = visible ? '' : 'none';
  });
  
  // Details popups
  document.querySelectorAll('.unreal-details-popup, .unreal-overlay-backdrop').forEach(el => {
    el.remove();
  });
  
  console.log(`[ShareSafe] Overlays ${visible ? 'shown' : 'hidden'}`);
}

// Check if extension is enabled
(async function () {
  // Prevent multiple injections
  if (window.__sharesafe_injected__) return;
  window.__sharesafe_injected__ = true;

  // Check if extension is enabled
  const settings = await chrome.storage.sync.get([
    'extensionEnabled',
    'showOverlays',
    'segmentAnalysis',
    'imageAnalysis',
    'llmTiebreaker',
    'excludeList',
    'includeList'
  ]);
  
  // Set initial overlay visibility
  overlaysVisible = settings.showOverlays !== false;

  // Check if extension is disabled
  if (settings.extensionEnabled === false) {
    console.log('ShareSafe: Extension is disabled');
    return;
  }

  // Check exclude/include lists
  const currentDomain = location.hostname;

  if (settings.excludeList && settings.excludeList.length > 0) {
    if (settings.excludeList.some(domain => currentDomain.includes(domain))) {
      console.log('ShareSafe: Domain excluded');
      return;
    }
  }

  if (settings.includeList && settings.includeList.length > 0) {
    if (!settings.includeList.some(domain => currentDomain.includes(domain))) {
      console.log('ShareSafe: Domain not in include list');
      return;
    }
  }

  // Don't run on browser internal pages
  if (location.protocol === 'chrome:' || location.protocol === 'chrome-extension:') return;

  console.log('%c[ShareSafe v2.2] Unified AI Detection Active', 'color: #4f46e5; font-weight: bold; font-size: 14px;');

  // ═══════════════════════════════════════════════════════════════
  // TEXT DETECTION - Load Modules
  // ═══════════════════════════════════════════════════════════════

  async function initTextDetection() {
    try {
      console.log('[TextDetection] Initializing text detection...');

      // Load pattern database
      const patternModule = await import(chrome.runtime.getURL('patternDatabase.js'));
      patternDatabase = patternModule.AI_PHRASES;
      console.log('[TextDetection] Pattern database loaded, categories:', Object.keys(patternDatabase));

      // Load social media scanner
      const scannerModule = await import(chrome.runtime.getURL('socialMediaScanner.js'));
      socialMediaScanner = scannerModule;
      console.log('[TextDetection] Social media scanner loaded');

      // Load fake news detection modules (optional - we have built-in fallback)
      try {
        const extractorModule = await import(chrome.runtime.getURL('headlineExtractor.js'));
        headlineExtractor = extractorModule;
        console.log('[FakeNewsDetection] Headline extractor loaded');

        const verifierModule = await import(chrome.runtime.getURL('newsVerifier.js'));
        newsVerifier = verifierModule;
        console.log('[FakeNewsDetection] News verifier loaded');
      } catch (error) {
        console.warn('[FakeNewsDetection] Optional modules not loaded, using built-in extraction:', error.message);
      }
      
      // Always enable fake news detection - we have built-in headline extraction and backend verification
      fakeNewsDetectionEnabled = true;
      console.log('[FakeNewsDetection] Fake news detection enabled');

      textDetectionEnabled = true;
      console.log('[TextDetection] Modules loaded successfully');

      // Detect platform
      const platform = socialMediaScanner.detectPlatform();
      console.log('[TextDetection] Platform detected:', platform);

      // Start scanning for all platforms (including generic)
      startSocialMediaScanning(platform);

    } catch (error) {
      console.error('[TextDetection] Failed to load modules:', error);
      console.error('[TextDetection] Error stack:', error.stack);
      textDetectionEnabled = false;
    }
  }

  // ═══════════════════════════════════════════════════════════════
  // TEXT ANALYSIS FUNCTIONS
  // ═══════════════════════════════════════════════════════════════

  async function analyzeTextForAI(text) {
    if (!text || text.length < 50) return null;

    try {
      // Step 1: Pattern-based detection (fast, provides quick signals)
      const patternScore = checkTextPatterns(text);

      // Step 2: ALWAYS call ML backend for better accuracy
      const mlResult = await callTextDetectionAPI(text);

      if (mlResult && mlResult.ai_score !== undefined) {
        // Combine ML score with pattern score for best accuracy
        // ML is more reliable, so weight it higher (70% ML, 30% pattern)
        const combinedScore = (mlResult.ai_score * 0.7) + (patternScore * 0.3);

        console.log(`[TextDetection] Combined: ML=${mlResult.ai_score.toFixed(1)}%, Pattern=${patternScore.toFixed(1)}%, Final=${combinedScore.toFixed(1)}%`);

        return {
          score: combinedScore,
          confidence: mlResult.confidence || 70,
          method: 'ml+pattern',
          details: {
            mlScore: mlResult.ai_score,
            patternScore: patternScore,
            ...mlResult
          }
        };
      }

      // Fallback: Pattern-based result if ML unavailable
      return {
        score: patternScore,
        confidence: Math.min(70, Math.abs(patternScore - 50) * 2),
        method: 'pattern',
        matchCount: 0
      };
    } catch (error) {
      console.error('[TextDetection] Analysis error:', error);
      return null;
    }
  }

  function checkTextPatterns(text) {
    if (!patternDatabase) {
      console.warn('[TextDetection] Pattern database not loaded');
      return 0;
    }

    let totalScore = 0;
    let matchCount = 0;

    // Recursive function to process patterns at any depth
    function processPatterns(patterns) {
      if (!patterns) return;

      if (Array.isArray(patterns)) {
        // Array of pattern objects
        for (const phrase of patterns) {
          if (phrase.pattern && typeof phrase.pattern.test === 'function') {
            try {
              if (phrase.pattern.test(text)) {
                totalScore += phrase.score || 50;
                matchCount++;
                console.log('[TextDetection] Pattern match:', phrase.msg || 'Unknown');
              }
            } catch (e) {
              // Regex error, skip
            }
          }
        }
      } else if (typeof patterns === 'object') {
        // Nested object (like domainSpecific.academic)
        for (const key in patterns) {
          processPatterns(patterns[key]);
        }
      }
    }

    // Process all categories
    for (const category in patternDatabase) {
      processPatterns(patternDatabase[category]);
    }

    // Return average score if matches found, otherwise 0
    const result = matchCount > 0 ? Math.min(100, totalScore / matchCount) : 0;

    if (matchCount > 0) {
      console.log(`[TextDetection] Found ${matchCount} patterns, avg score: ${result.toFixed(1)}`);
    }

    return result;
  }

  async function callTextDetectionAPI(text) {
    try {
      // Use background script to bypass CORS/Private Network Access restrictions
      const response = await chrome.runtime.sendMessage({
        type: 'TEXT_BACKEND_REQUEST',
        text: text
      });

      if (response && response.success && response.data) {
        console.log('[TextDetection] ML API result:', response.data);
        return response.data;
      }

      if (response && response.error) {
        console.warn('[TextDetection] ML API error:', response.error);
      }

      return null;
    } catch (error) {
      console.warn('[TextDetection] ML API not available:', error.message);
      return null;
    }
  }

  // ═══════════════════════════════════════════════════════════════
  // SOCIAL MEDIA SCANNING
  // ═══════════════════════════════════════════════════════════════

  function startSocialMediaScanning(platform) {
    if (!socialMediaScanner) return;

    const selectors = socialMediaScanner.PLATFORM_SELECTORS[platform];
    if (!selectors || selectors.length === 0) return;

    console.log('[SocialScanner] Starting scan for platform:', platform);

    // Scan existing content
    scanSocialMediaPosts(selectors);

    // Watch for new posts
    const observer = new MutationObserver(() => {
      scanSocialMediaPosts(selectors);
    });

    observer.observe(document.body, {
      childList: true,
      subtree: true
    });
  }

  function scanSocialMediaPosts(selectors) {
    for (const selector of selectors) {
      try {
        const elements = document.querySelectorAll(selector);
        elements.forEach(element => {
          // Skip if already processed
          if (element.dataset?.sharesafeTextProcessed === 'true') return;

          const content = socialMediaScanner.extractPostContent(element);
          if (content && content.text && content.wordCount > 15) {
            analyzeTextForAI(content.text).then(result => {
              if (result && result.score > 70) {
                highlightTextElement(element, result);
              }
              element.dataset.sharesafeTextProcessed = 'true';
            });
          }
        });
      } catch (e) {
        // Ignore selector errors
      }
    }
  }

  function highlightTextElement(element, result) {
    // Add subtle indicator for AI-detected text
    if (!element.style.position || element.style.position === 'static') {
      element.style.position = 'relative';
    }

    const indicator = document.createElement('div');
    indicator.className = 'sharesafe-text-indicator';
    indicator.innerHTML = '🤖';
    indicator.title = `AI Detection: ${result.score.toFixed(0)}% (${result.method})`;
    indicator.style.cssText = `
      position: absolute;
      top: 4px;
      right: 4px;
      width: 20px;
      height: 20px;
      background: rgba(239, 68, 68, 0.9);
      border-radius: 50%;
      display: flex;
      align-items: center;
      justify-content: center;
      font-size: 12px;
      cursor: pointer;
      z-index: 9999;
      box-shadow: 0 2px 4px rgba(0,0,0,0.2);
    `;

    element.appendChild(indicator);
  }

  // ═══════════════════════════════════════════════════════════════
  // MAIN ANALYSIS FUNCTION
  // ═══════════════════════════════════════════════════════════════

  async function analyzePageWithSegments() {
    const segmentAnalysisEnabled = settings.segmentAnalysis !== false;

    if (!segmentAnalysisEnabled) {
      console.log('ShareSafe: Segment analysis disabled, using legacy mode');
      return;
    }

    // Skip analysis for very short content
    const pageText = document.body.innerText;
    if (pageText.length < 300) {
      console.log('ShareSafe: Content too short (<300 chars), skipping analysis');
      return;
    }

    console.log('ShareSafe: Starting segment-based analysis...');

    try {
      // Import modules dynamically
      const { analyzePageSegments } = await import(chrome.runtime.getURL('segmentAnalyzer.js'));
      const {
        injectHighlightStyles,
        highlightSegment,
        createSummaryPanel
      } = await import(chrome.runtime.getURL('visualHighlighter.js'));
      const {
        getCached,
        setCached,
        generatePageCacheKey
      } = await import(chrome.runtime.getURL('cacheManager.js'));

      // Inject styles
      injectHighlightStyles();

      // Check cache
      const pageContent = document.body.innerText.slice(0, 500);
      const cacheKey = generatePageCacheKey(location.href, pageContent);
      const cached = await getCached(cacheKey, 'page');

      let pageAnalysis;

      if (cached) {
        console.log('ShareSafe: Using cached analysis');
        pageAnalysis = cached;
      } else {
        // Perform fresh analysis
        pageAnalysis = await analyzePageSegments(document.body, {
          // Keep segment size meaningful to avoid UI/boilerplate snippets.
          minWordCount: 14,
          maxSegments: 28,
          useLLMTiebreaker: settings.llmTiebreaker === true
        });

        // Cache result
        await setCached(cacheKey, pageAnalysis, 'page');
      }

      console.log('ShareSafe: Page analysis complete:', pageAnalysis);
      if (pageAnalysis.llmUsedCount > 0) {
        console.log(`ShareSafe: LLM was used for ${pageAnalysis.llmUsedCount} uncertain segments`);
      } else {
        console.log('ShareSafe: Pure statistical analysis (no LLM calls)');
      }

      // Send results to background for popup
      const flaggedReasons = pageAnalysis.segments
        .filter(s => s.shouldReview)
        .slice(0, 5)
        .map(s => s.reasons[0])
        .filter(Boolean);

      const overviewReasons = flaggedReasons.length > 0
        ? flaggedReasons
        : (pageAnalysis.reasons || []).slice(0, 5);

      const overviewSummary = pageAnalysis.summary ||
        (pageAnalysis.segmentCount > 0
          ? `Analyzed ${pageAnalysis.segmentCount} text segments`
          : 'No content to analyze');

      console.log('[Overview] score computation inputs:', {
        pageScore: pageAnalysis.pageScore,
        riskLevel: pageAnalysis.riskLevel,
        segmentCount: pageAnalysis.segmentCount,
        reasonsCount: overviewReasons.length,
        summary: overviewSummary
      });

      chrome.runtime.sendMessage({
        type: 'STORE_ANALYSIS',
        data: {
          riskLevel: pageAnalysis.riskLevel,
          score: pageAnalysis.pageScore,
          reasons: overviewReasons,
          summary: overviewSummary,
          segmentCount: pageAnalysis.segmentCount,
          url: location.href
        }
      });

      // Highlight segments
      const flaggedSegments = pageAnalysis.segments.filter(segScore => segScore.shouldReview || segScore.score >= 35);
      console.log('[TextPopup] Number of flagged segments:', flaggedSegments.length);

      pageAnalysis.segments.forEach(segScore => {
        if (segScore.shouldReview || segScore.score >= 35) {
          console.log(
            `[TextDetection] Flagged segment #${segScore.segmentId} ${segScore.score}/100 (${segScore.riskLevel}) via ${segScore.methodLabel}`,
            segScore.reasons
          );
          highlightSegment(segScore, {
            showBadge: segScore.score >= 40,
            showTooltipOnClick: true
          });
        } else {
          console.log(`[TextPopup] Segment not flagged #${segScore.segmentId}: score=${segScore.score} risk=${segScore.riskLevel}`);
        }
      });

      // Create summary panel
      if (pageAnalysis.highRiskCount > 0 || pageAnalysis.mediumRiskCount > 0) {
        createSummaryPanel(pageAnalysis);
      }

    } catch (error) {
      console.error('ShareSafe: Segment analysis error:', error);
    }
  }

  // ═══════════════════════════════════════════════════════════════
  // FAKE NEWS DETECTION ANALYSIS
  // ═══════════════════════════════════════════════════════════════

  // Backend URL for news verification
  const NEWS_BACKEND_URL = 'http://localhost:8000';

  /**
   * Verify a headline using the backend Google search
   */
  async function verifyHeadlineWithBackend(headline) {
    try {
      const response = await fetch(`${NEWS_BACKEND_URL}/verify-news`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ headline: headline, max_results: 15 })
      });
      
      if (!response.ok) {
        throw new Error(`Backend returned ${response.status}`);
      }
      
      return await response.json();
    } catch (error) {
      console.warn('[FakeNewsDetection] Backend verification failed:', error.message);
      return null;
    }
  }

  /**
   * Extract headlines from the current page
   */
  function extractPageHeadlines() {
    const headlines = [];
    
    // Get main title
    const pageTitle = document.title;
    if (pageTitle && pageTitle.length > 15) {
      // Clean up common suffixes
      let cleanTitle = pageTitle.replace(/\s*[\|\-–—]\s*[^|\-–—]+$/, '').trim();
      if (cleanTitle.length > 15) {
        headlines.push({ text: cleanTitle, source: 'title', priority: 1 });
      }
    }
    
    // Get Open Graph title
    const ogTitle = document.querySelector('meta[property="og:title"]')?.content;
    if (ogTitle && ogTitle.length > 15) {
      let cleanOg = ogTitle.replace(/\s*[\|\-–—]\s*[^|\-–—]+$/, '').trim();
      if (cleanOg.length > 15 && !headlines.find(h => h.text === cleanOg)) {
        headlines.push({ text: cleanOg, source: 'og:title', priority: 1 });
      }
    }
    
    // Get H1 headlines
    document.querySelectorAll('h1').forEach(h1 => {
      const text = h1.innerText?.trim();
      if (text && text.length > 20 && text.length < 300) {
        if (!headlines.find(h => h.text === text)) {
          headlines.push({ text: text, source: 'h1', priority: 2 });
        }
      }
    });
    
    // Get article headlines (common classes)
    const articleSelectors = [
      'article h2', '.article-title', '.entry-title', '.post-title',
      '.headline', '[class*="headline"]', '[class*="title"]'
    ];
    
    articleSelectors.forEach(selector => {
      try {
        document.querySelectorAll(selector).forEach(el => {
          const text = el.innerText?.trim();
          if (text && text.length > 20 && text.length < 300) {
            if (!headlines.find(h => h.text === text)) {
              headlines.push({ text: text, source: selector, priority: 3 });
            }
          }
        });
      } catch (e) {}
    });
    
    // Sort by priority and return top headlines
    return headlines.sort((a, b) => a.priority - b.priority).slice(0, 5);
  }

  async function analyzePageForFakeNews() {
    // Suppress news analysis on Google Images pages — irrelevant there and
    // causes "No News Coverage" toast to appear while browsing image results.
    {
      const _host = location.hostname.toLowerCase();
      const _search = location.search.toLowerCase();
      const _path = location.pathname.toLowerCase();
      if (_host.includes('google.') && (_search.includes('tbm=isch') || _host.startsWith('images.google.') || _path.includes('/imghp'))) {
        console.log('[FakeNewsDetection] Skipped — Google Images page detected');
        return null;
      }
    }

    console.log('[FakeNewsDetection] Starting fake news analysis...');

    try {
      const pageTitle = document.title || '';
      const pageText = document.body?.innerText || '';
      const pageUrl = location.href;

      // Skip if content is too short
      if (pageText.length < 200) {
        console.log('[FakeNewsDetection] Content too short for analysis');
        return null;
      }

      // Extract headlines from page
      const extractedHeadlines = extractPageHeadlines();
      console.log(`[FakeNewsDetection] Extracted ${extractedHeadlines.length} headlines`);
      
      if (extractedHeadlines.length === 0) {
        console.log('[FakeNewsDetection] No headlines found');
        return {
          analyzed: true,
          hasNewsContent: false,
          riskLevel: 'none',
          confidence: 0
        };
      }

      // Try to verify the main headline with backend
      let backendResult = null;
      const mainHeadline = extractedHeadlines[0]?.text;
      
      if (mainHeadline) {
        console.log(`[FakeNewsDetection] Verifying headline with backend: "${mainHeadline.substring(0, 50)}..."`);
        backendResult = await verifyHeadlineWithBackend(mainHeadline);
        
        if (backendResult && backendResult.success) {
          console.log('[FakeNewsDetection] Backend verification result:', backendResult.recommendation);
        }
      }

      // Also do pattern-based analysis as fallback/supplement
      const patternAnalysis = analyzeContentForMisinformation(pageText, pageTitle, { headlines: extractedHeadlines });
      
      // Combine results
      let finalAnalysis;
      
      if (backendResult && backendResult.success) {
        // Use backend result as primary, augment with pattern analysis
        finalAnalysis = {
          analyzed: true,
          hasNewsContent: true,
          method: 'google_search',
          headline: mainHeadline,
          verified: backendResult.verified,
          riskLevel: mapRecommendationToRisk(backendResult.recommendation),
          confidence: backendResult.confidence,
          recommendation: backendResult.recommendation,
          trustedSources: backendResult.trusted_sources || [],
          unreliableSources: backendResult.unreliable_sources || [],
          allSources: backendResult.all_sources || [],
          reasoning: backendResult.reasoning || [],
          cached: backendResult.cached,
          patternAnalysis: {
            misinfoScore: patternAnalysis.misinfoScore,
            credibleScore: patternAnalysis.credibleScore,
            flags: patternAnalysis.flags
          }
        };
        
        // If pattern analysis found strong red flags, add them
        if (patternAnalysis.flags && patternAnalysis.flags.length > 0) {
          finalAnalysis.reasoning.push(`Pattern analysis found: ${patternAnalysis.flags.join(', ')}`);
        }
      } else {
        // Fall back to pattern analysis only
        finalAnalysis = {
          analyzed: true,
          hasNewsContent: true,
          method: 'pattern_analysis',
          headline: mainHeadline,
          verified: false,
          riskLevel: patternAnalysis.riskLevel,
          confidence: patternAnalysis.confidence,
          recommendation: patternAnalysis.recommendation,
          trustedSources: [],
          unreliableSources: [],
          allSources: [],
          reasoning: [`Pattern-based analysis (backend unavailable)`, ...patternAnalysis.flags.map(f => `⚠ ${f}`)],
          patternAnalysis: patternAnalysis
        };
      }

      // Store results for popup
      try {
        chrome.runtime.sendMessage({
          type: 'STORE_FAKE_NEWS_ANALYSIS',
          data: {
            ...finalAnalysis,
            url: pageUrl,
            extractedHeadlines: extractedHeadlines,
            timestamp: Date.now()
          }
        });
      } catch (msgError) {
        console.warn('[FakeNewsDetection] Could not store results:', msgError);
      }

      // Show visual indicator on page for significant findings
      // Show badge always for manipulated/false content (important warnings)
      // For other cases, respect the overlay visibility setting
      const isSignificant = ['likely_manipulated', 'likely_false', 'verified_true'].includes(finalAnalysis.recommendation);
      if (overlaysVisible || isSignificant) {
        showNewsVerificationBadge(finalAnalysis);
      }

      console.log('[FakeNewsDetection] Analysis complete:', finalAnalysis.recommendation);
      
      return finalAnalysis;

    } catch (error) {
      console.error('[FakeNewsDetection] Analysis error:', error);
      return {
        analyzed: true,
        error: error.message,
        riskLevel: 'unknown',
        confidence: 0
      };
    }
  }

  /**
   * Map backend recommendation to risk level
   */
  function mapRecommendationToRisk(recommendation) {
    const mapping = {
      'verified_true': 'low',
      'likely_true': 'low',
      'possibly_true': 'medium',
      'unverified': 'medium',
      'no_coverage': 'high',
      'likely_false': 'high',
      'error': 'unknown'
    };
    return mapping[recommendation] || 'unknown';
  }

  /**
   * Pattern-based misinformation analysis (fallback when backend unavailable)
   */
  function analyzeContentForMisinformation(text, title, extractedContent) {
    const combinedText = `${title} ${text}`.toLowerCase();
    
    // Misinformation patterns with weights
    const misinfoPatterns = [
      { pattern: /\b(shocking|bombshell|explosive|jaw.?dropping)\b/gi, weight: 15, flag: 'Sensationalist language' },
      { pattern: /\b(they don'?t want you to know|what .+ don'?t want you to see|banned|censored)\b/gi, weight: 25, flag: 'Conspiracy framing' },
      { pattern: /\b(exposed!?|revealed!?|leaked!?|cover.?up)\b/gi, weight: 12, flag: 'Exposé language' },
      { pattern: /\b(secret|hidden truth|suppressed)\b/gi, weight: 15, flag: 'Conspiracy language' },
      { pattern: /\b(miracle|cure[sd]?|breakthrough).{0,20}(cancer|covid|diabetes|disease)\b/gi, weight: 30, flag: 'Medical misinformation' },
      { pattern: /\b(mainstream media|MSM|fake news media).{0,20}(won'?t|refuses?|hiding)\b/gi, weight: 25, flag: 'Media conspiracy' },
      { pattern: /\b(big pharma|government coverup|deep state|new world order)\b/gi, weight: 30, flag: 'Conspiracy theory' },
      { pattern: /\b(100%|guaranteed|proven|scientifically proven).{0,10}(cure|works|effective)\b/gi, weight: 20, flag: 'Unverifiable claims' },
      { pattern: /\b(doctors hate|scientists baffled|experts stunned)\b/gi, weight: 25, flag: 'Clickbait language' },
      { pattern: /\b(share before.{0,10}deleted|going viral|must see|act now)\b/gi, weight: 18, flag: 'Urgency manipulation' },
      { pattern: /\b(wake up|sheeple|open your eyes|truth they)\b/gi, weight: 20, flag: 'Conspiracy rhetoric' },
      { pattern: /\bDO YOUR (OWN )?RESEARCH\b/gi, weight: 15, flag: 'Anti-expertise stance' },
      { pattern: /\b(illuminati|rothschild|soros|gates).{0,20}(control|plan|agenda)\b/gi, weight: 30, flag: 'Conspiracy theory' },
      { pattern: /\b(plandemic|scamdemic|hoax)\b/gi, weight: 35, flag: 'Misinformation term' }
    ];

    // Credibility patterns
    const crediblePatterns = [
      { pattern: /\b(according to|as reported by|sources (say|confirm))\b/gi, weight: 12 },
      { pattern: /\b(study|research|analysis).{0,15}(published|conducted|found|shows)\b/gi, weight: 15 },
      { pattern: /\b(researchers|scientists|experts|officials).{0,10}(say|report|confirm|found)\b/gi, weight: 12 },
      { pattern: /\b(university|institute|journal|peer.?reviewed)\b/gi, weight: 10 },
      { pattern: /\b(data shows?|statistics indicate|evidence suggests?)\b/gi, weight: 10 },
      { pattern: /\b(reuters|associated press|ap news|bbc|npr|official)\b/gi, weight: 15 },
      { pattern: /\b(spokesperson|press (release|secretary)|statement)\b/gi, weight: 10 }
    ];

    let misinfoScore = 0;
    let credibleScore = 0;
    const flags = [];

    // Check misinformation patterns
    for (const { pattern, weight, flag } of misinfoPatterns) {
      const matches = combinedText.match(pattern);
      if (matches) {
        misinfoScore += weight * Math.min(matches.length, 3);
        if (flag && !flags.includes(flag)) flags.push(flag);
      }
    }

    // Check credible patterns
    for (const { pattern, weight } of crediblePatterns) {
      const matches = combinedText.match(pattern);
      if (matches) {
        credibleScore += weight * Math.min(matches.length, 3);
      }
    }

    // Determine risk level
    let riskLevel, confidence, summary;

    if (misinfoScore >= 60) {
      riskLevel = 'high';
      confidence = Math.min(90, 50 + misinfoScore);
      summary = 'Multiple misinformation indicators detected';
    } else if (misinfoScore >= 30) {
      riskLevel = 'medium-high';
      confidence = Math.min(75, 40 + misinfoScore);
      summary = 'Some misinformation indicators present';
    } else if (misinfoScore >= 15 && credibleScore < 20) {
      riskLevel = 'medium';
      confidence = Math.min(60, 30 + misinfoScore);
      summary = 'Potentially misleading content';
    } else if (credibleScore >= 30) {
      riskLevel = 'low';
      confidence = Math.min(75, 40 + credibleScore);
      summary = 'Content appears to use credible sourcing patterns';
    } else {
      riskLevel = 'unknown';
      confidence = 30;
      summary = 'Insufficient patterns for automated analysis';
    }

    return {
      analyzed: true,
      hasNewsContent: (extractedContent?.metadata?.totalExtracted || 0) > 0,
      riskLevel,
      confidence,
      summary,
      flags,
      details: {
        misinfoScore,
        credibleScore,
        extractedItems: extractedContent?.metadata?.totalExtracted || 0
      }
    };
  }

  /**
   * Show a floating badge on the page with news verification result
   */
  function showNewsVerificationBadge(analysis) {
    // Always clear stale badge first.
    const existingBadge = document.getElementById('sharesafe-news-badge');
    if (existingBadge) existingBadge.remove();

    // Suppress on Google Images pages — news/article toasts are not relevant there.
    {
      const _h = location.hostname.toLowerCase();
      const _s = location.search.toLowerCase();
      const _p = location.pathname.toLowerCase();
      if (_h.includes('google.') && (_s.includes('tbm=isch') || _h.startsWith('images.google.') || _p.includes('/imghp'))) {
        console.log('[NewsToast] Suppressed on image search page');
        return;
      }
    }

    // Only show for meaningful results
    if (!analysis || !analysis.recommendation) return;

    // Determine badge style based on recommendation
    let bgColor, icon, text;
    switch (analysis.recommendation) {
      case 'verified_true':
        bgColor = '#22c55e'; // green
        icon = '✓';
        text = 'Verified News';
        break;
      case 'likely_true':
        bgColor = '#22c55e';
        icon = '✓';
        text = 'Likely True';
        break;
      case 'possibly_true':
        bgColor = '#3b82f6'; // blue
        icon = '○';
        text = 'Possibly True';
        break;
      case 'likely_manipulated':
        bgColor = '#ef4444'; // red
        icon = '🚨';
        text = 'Manipulation Detected!';
        break;
      case 'likely_false':
        bgColor = '#ef4444';
        icon = '⚠';
        text = 'Likely False';
        break;
      case 'no_coverage':
        bgColor = '#f59e0b'; // amber
        icon = '?';
        text = 'No News Coverage';
        break;
      default:
        bgColor = '#6b7280'; // gray
        icon = 'ℹ';
        text = 'Unverified';
    }

    // Create badge element
    const badge = document.createElement('div');
    badge.id = 'sharesafe-news-badge';
    badge.innerHTML = `
      <div style="display: flex; align-items: center; gap: 8px;">
        <span style="font-size: 18px;">${icon}</span>
        <div>
          <div style="font-weight: 600; font-size: 13px;">${text}</div>
          <div style="font-size: 11px; opacity: 0.9;">${analysis.confidence}% confidence</div>
        </div>
        <button id="sharesafe-badge-close" style="
          background: none;
          border: none;
          color: white;
          font-size: 18px;
          cursor: pointer;
          padding: 0 4px;
          opacity: 0.7;
        ">×</button>
      </div>
      ${analysis.trustedSources?.length > 0 ? `
        <div style="font-size: 10px; margin-top: 6px; opacity: 0.85;">
          Found in: ${analysis.trustedSources.slice(0, 3).map(s => s.domain).join(', ')}
          ${analysis.trustedSources.length > 3 ? ` +${analysis.trustedSources.length - 3} more` : ''}
        </div>
      ` : ''}
    `;

    badge.style.cssText = `
      position: fixed;
      bottom: 20px;
      right: 20px;
      background: ${bgColor};
      color: white;
      padding: 12px 16px;
      border-radius: 10px;
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      box-shadow: 0 4px 20px rgba(0,0,0,0.3);
      z-index: 2147483647;
      max-width: 300px;
      cursor: pointer;
      transition: transform 0.2s, opacity 0.2s;
    `;

    // Add hover effect
    badge.addEventListener('mouseenter', () => {
      badge.style.transform = 'scale(1.02)';
    });
    badge.addEventListener('mouseleave', () => {
      badge.style.transform = 'scale(1)';
    });

    // Close button
    badge.addEventListener('click', (e) => {
      if (e.target.id === 'sharesafe-badge-close') {
        badge.style.opacity = '0';
        setTimeout(() => badge.remove(), 200);
      }
    });

    document.body.appendChild(badge);

    // Auto-hide after 10 seconds for verified/likely true
    if (['verified_true', 'likely_true'].includes(analysis.recommendation)) {
      setTimeout(() => {
        if (badge.parentNode) {
          badge.style.opacity = '0';
          setTimeout(() => badge.remove(), 200);
        }
      }, 10000);
    }
  }

  /**
   * Analyze fake news verification results (legacy - kept for compatibility)
   */
  function analyzeFakeNewsResults(extractedContent, verificationResults) {
    const analysis = {
      analyzed: true,
      hasNewsContent: true,
      hasVerifiableClaims: true,
      extractedContent: extractedContent,
      verificationResults: verificationResults,
      riskLevel: 'unknown',
      confidence: 0,
      summary: '',
      details: {
        totalClaims: verificationResults.length,
        verifiedClaims: 0,
        likelyTrueClaims: 0,
        likelyFalseClaims: 0,
        unverifiedClaims: 0,
        trustedSourceCount: 0,
        unreliableSourceCount: 0
      },
      flags: []
    };

    // Count verification outcomes
    for (const result of verificationResults) {
      if (result.verified && result.confidence >= 60) {
        analysis.details.verifiedClaims++;
        if (result.recommendation === 'likely_true') {
          analysis.details.likelyTrueClaims++;
        } else if (result.recommendation === 'likely_false') {
          analysis.details.likelyFalseClaims++;
        }
      } else {
        analysis.details.unverifiedClaims++;
      }

      // Count source quality
      if (result.sources) {
        analysis.details.trustedSourceCount += 
          (result.sources.tier1 || []).length + 
          (result.sources.tier2 || []).length + 
          (result.sources.tier3 || []).length;
        analysis.details.unreliableSourceCount += (result.sources.unreliable || []).length;
      }
    }

    // Determine overall risk level
    const falseRatio = analysis.details.likelyFalseClaims / Math.max(1, analysis.details.totalClaims);
    const verifiedRatio = analysis.details.verifiedClaims / Math.max(1, analysis.details.totalClaims);
    const misinformationRisk = extractedContent.metadata.misinformationRisk || 0;

    if (analysis.details.likelyFalseClaims >= 2 || falseRatio >= 0.5) {
      analysis.riskLevel = 'high';
      analysis.confidence = 80;
      analysis.summary = 'Multiple false claims detected';
      analysis.flags.push('Multiple unverified or false claims');
    } else if (analysis.details.unreliableSourceCount > analysis.details.trustedSourceCount) {
      analysis.riskLevel = 'medium-high';
      analysis.confidence = 70;
      analysis.summary = 'Primarily unreliable sources';
      analysis.flags.push('Content mainly from unreliable sources');
    } else if (misinformationRisk >= 60) {
      analysis.riskLevel = 'medium-high';
      analysis.confidence = 65;
      analysis.summary = 'Language patterns suggest misinformation';
      analysis.flags.push('Contains misinformation language patterns');
    } else if (verifiedRatio >= 0.6 && analysis.details.trustedSourceCount >= 2) {
      analysis.riskLevel = 'low';
      analysis.confidence = 75;
      analysis.summary = 'Claims verified by trusted sources';
    } else if (analysis.details.verifiedClaims >= 1) {
      analysis.riskLevel = 'medium';
      analysis.confidence = 50;
      analysis.summary = 'Some claims verified, others uncertain';
    } else {
      analysis.riskLevel = 'medium';
      analysis.confidence = 40;
      analysis.summary = 'Claims could not be verified';
      analysis.flags.push('Unable to verify claims with trusted sources');
    }

    return analysis;
  }

  // ═══════════════════════════════════════════════════════════════
  // IMAGE SCANNER CLASS - Automatic AI Image Detection
  // ═══════════════════════════════════════════════════════════════

  class ImageScanner {
    constructor() {
      this.queue = [];
      this.processing = 0;
      this.maxConcurrent = 2;
      this.checkedImages = new Set();
      this.analysisResults = new Map();
      this.mutationObserver = null;
      this.intersectionObserver = null;
      this.geminiApiKey = null;
      this.sightengineUser = null;
      this.sightengineSecret = null;
      this.aiImageCount = 0;
      this.isEnabled = true;
      this.processDelay = 800;
      this.lastProcessTime = 0;

      // NEW: Image Analysis Pipeline (layers 0-4)
      // Pipeline is loaded dynamically to avoid import issues
      this.pipeline = null;
      this.pipelineInitialized = false;
      this.pipelineLoading = null;

      // Gemini rate limiting (free tier: 15 requests per minute)
      this.geminiRequestTimes = [];
      this.geminiMaxPerMinute = 2;
      this.geminiMinDelay = 6000;
      this.gridRescanTimer = null;
      this.gridScrollTimer = null;
      this.processedCardKeys = new Set();
      this.queuedCardKeys = new Set();
      this.cardIdCounter = 0;
      this.gridOverlayAttached = 0;
      this.gridProcessedSinceLastScan = 0;
      this.gridFinalStateUpdates = 0;
      this.gridRetryCount = 0;
      this.gridAnalyzedCount = 0;
      this.isImageGridPage = this.detectImageGridPage();
      this.gridScanMode = this.isImageGridPage ? this.getGridModeType() : null;
      this.scrollHandler = null;

      // Card state machine for Google Images grid mode.
      // States: none | checking | analyzed-ai | analyzed-maybe | analyzed-real | review
      this.cardStates = new Map();
      this.cardStateTimeouts = new Map();
      this.STUCK_CARD_TIMEOUT_MS = 15000;

      // Trusted domains to skip
      this.trustedDomains = [
        'google.com/images',
        'gstatic.com',
        'googleusercontent.com',
        'googleapis.com',
        'chrome.google.com'
      ];

      this.platformSelectors = {
        'twitter.com': 'article img[src*="twimg"], [data-testid="tweetPhoto"] img',
        'x.com': 'article img[src*="twimg"], [data-testid="tweetPhoto"] img',
        'facebook.com': '[data-pagelet] img, .x1ey2m1c img',
        'instagram.com': 'article img, ._aagv img',
        'linkedin.com': '.feed-shared-image img, .update-components-image img',
        'reddit.com': '[data-testid="post-container"] img, .media-element'
      };

      console.log('[ImageScanner] Grid mode status:', {
        enabled: this.isImageGridPage,
        mode: this.gridScanMode,
        hostname: location.hostname,
        pathname: location.pathname,
        search: location.search
      });
    }

    detectImageGridPage() {
      const host = location.hostname.toLowerCase();
      const path = location.pathname.toLowerCase();
      const search = location.search.toLowerCase();

      const isGoogleImages = host.includes('google.') && (search.includes('tbm=isch') || host.startsWith('images.google.') || path.includes('/imghp'));
      if (isGoogleImages) return true;

      // Generic gallery/grid page heuristics.
      const galleryLikeContainers = document.querySelectorAll('[role="grid"] img, .gallery img, .masonry img, [class*="image-grid"] img').length;
      return galleryLikeContainers >= 12;
    }

    getGridModeType() {
      const host = location.hostname.toLowerCase();
      const search = location.search.toLowerCase();
      if (host.includes('google.') && search.includes('tbm=isch')) return 'google-images';
      return 'generic-image-grid';
    }

    getGoogleImageCards() {
      const cards = new Set();

      // Always union known Google Images variants instead of using fallback-only logic.
      const selectors = [
        'div[data-ri]',
        'div.isv-r',
        'div[jsname="dTDiAc"]',
        'div[data-docid]',
        '[role="listitem"][data-docid]',
        'a[href*="/imgres"]'
      ];

      selectors.forEach((selector) => {
        try {
          document.querySelectorAll(selector).forEach((el) => {
            const card = el.closest('div[data-ri], div.isv-r, div[jsname="dTDiAc"], div[data-docid], [role="listitem"]') || el;
            if (card?.querySelector?.('img')) cards.add(card);
          });
        } catch (e) {
          // Ignore selector compatibility issues.
        }
      });

      // Image-first recovery path for DOM variants where card wrappers differ.
      document.querySelectorAll('img[src], img[srcset], img[data-src]').forEach((img) => {
        const card = img.closest('div[data-ri], div.isv-r, div[jsname="dTDiAc"], div[data-docid], [role="gridcell"], [role="listitem"], figure');
        if (card) cards.add(card);
      });

      console.log('[Grid] getGoogleImageCards found:', cards.size, 'cards');
      return Array.from(cards);
    }

    getGenericGridCards() {
      const cards = new Set();
      const selectors = [
        '[role="grid"] [role="gridcell"]',
        '.gallery-item',
        '.masonry-item',
        '[class*="image-grid"] > *',
        'figure',
        'a:has(img)'
      ];

      selectors.forEach((selector) => {
        try {
          document.querySelectorAll(selector).forEach((el) => cards.add(el));
        } catch (e) {
          // Ignore unsupported selector syntax in some contexts.
        }
      });

      return Array.from(cards);
    }

    getImageGridCards() {
      return this.gridScanMode === 'google-images' ? this.getGoogleImageCards() : this.getGenericGridCards();
    }

    isVisibleElement(el) {
      if (!el || !el.isConnected) return false;
      const style = getComputedStyle(el);
      if (style.display === 'none' || style.visibility === 'hidden' || parseFloat(style.opacity) === 0) return false;
      const rect = el.getBoundingClientRect();
      if (rect.width < 40 || rect.height < 40) return false;
      // In grid mode, include cards within 300px of the viewport (partially scrolled-in tiles).
      if (this.isImageGridPage) {
        const margin = 300;
        if (rect.right < -margin || rect.bottom < -margin || rect.left > window.innerWidth + margin || rect.top > window.innerHeight + margin) return false;
      }
      return true;
    }

    getPrimaryImageFromCard(card) {
      if (!card) return null;
      const images = Array.from(card.querySelectorAll('img'));
      if (images.length === 0) return null;

      let best = null;
      let bestScore = -1;

      const isLikelyUiAsset = (img) => {
        const srcLower = (img.currentSrc || img.src || '').toLowerCase();
        return srcLower.includes('favicon') || srcLower.includes('sprite') || srcLower.includes('/icon');
      };

      images.forEach((img) => {
        const rect = img.getBoundingClientRect();
        const naturalArea = (img.naturalWidth || 0) * (img.naturalHeight || 0);
        const renderedArea = Math.max(0, rect.width) * Math.max(0, rect.height);
        const visibilityBoost = this.isVisibleElement(img) ? 1.2 : 1;
        const uiPenalty = isLikelyUiAsset(img) ? 0.25 : 1;
        const score = Math.max(naturalArea, renderedArea) * visibilityBoost * uiPenalty;

        if (score > bestScore) {
          best = img;
          bestScore = score;
        }
      });

      if (best) return best;

      // Fallback for cards where source is still stabilizing.
      const loaded = images.find((img) => img.complete && (img.naturalWidth || 0) > 0);
      if (loaded) return loaded;

      return images[0] || null;
    }

    ensureCardIdentity(card, idx = 0) {
      if (!card) return `grid-card-${idx}`;
      if (card.dataset.unrealCardId) return card.dataset.unrealCardId;

      const anchor = card.querySelector('a[href]');
      const href = anchor?.getAttribute('href') || '';
      const ri = card.getAttribute('data-ri') || '';
      const docId = card.getAttribute('data-docid') || card.getAttribute('data-id') || '';
      const ariaLabel = (card.getAttribute('aria-label') || '').slice(0, 80);
      const base = `${location.hostname}|${location.pathname}|${ri}|${docId}|${href.slice(0, 220)}|${ariaLabel}`;
      this.cardIdCounter += 1;
      card.dataset.unrealCardId = `${base}|uid:${this.cardIdCounter}|idx:${idx}`;
      return card.dataset.unrealCardId;
    }

    getCardIdentity(card, idx = 0) {
      return this.ensureCardIdentity(card, idx);
    }

    getStableImageKey(img, card = null, idx = 0) {
      const src = (img?.currentSrc || img?.src || '').slice(0, 280);
      const cardKey = this.getCardIdentity(card || img?.closest('div.isv-r, div[data-ri], div[jsname="dTDiAc"]'), idx);
      const sizeKey = `${img?.naturalWidth || img?.width || 0}x${img?.naturalHeight || img?.height || 0}`;
      return `${cardKey}|${src}|${sizeKey}`;
    }

    sanitizeBadgeKey(key) {
      return (key || 'unreal-badge').replace(/[^a-zA-Z0-9_-]/g, '_').slice(0, 180);
    }

    getBadgeHost(img) {
      if (this.isImageGridPage) {
        const card = img.closest('div.isv-r, div[data-ri], div[jsname="dTDiAc"]') || img.closest('[role="gridcell"], figure, [class*="gallery"]');
        if (card) {
          if (getComputedStyle(card).position === 'static') {
            card.style.position = 'relative';
          }
          return card;
        }
      }

      this.wrapImage(img);
      return img.closest('.unreal-image-wrapper') || img.parentElement;
    }

    // Card state machine for Google Images tiles.

    setCardState(card, cardKey, state) {
      if (!cardKey) return;
      this.cardStates.set(cardKey, state);
      if (card) {
        card.dataset.unrealState = state;
      }

      const existingTimer = this.cardStateTimeouts.get(cardKey);
      if (existingTimer) {
        clearTimeout(existingTimer);
        this.cardStateTimeouts.delete(cardKey);
      }

      // Stuck fallback: if a tile stays in checking too long, force Review state.
      if (state === 'checking') {
        const t = setTimeout(() => {
          if (this.cardStates.get(cardKey) === 'checking' && card?.isConnected) {
            this.cardStates.set(cardKey, 'review');
            card.dataset.unrealState = 'review';
            card.querySelectorAll('.unreal-image-badge').forEach((b) => b.remove());
            const badge = document.createElement('div');
            badge.className = 'unreal-image-badge error';
            badge.innerHTML = `<span style="font-size:11px">🔘</span><span>Review</span>`;
            card.style.position = card.style.position || 'relative';
            card.appendChild(badge);
            this.gridFinalStateUpdates += 1;
            console.log('[Grid] Stuck checking tile forced to Review:', cardKey.slice(0, 70));
          }
        }, this.STUCK_CARD_TIMEOUT_MS);
        this.cardStateTimeouts.set(cardKey, t);
      }
    }

    getCardState(cardKey) {
      return this.cardStates.get(cardKey) || 'none';
    }

    cardHasVisualState(card, cardKey) {
      if (!card) return false;
      // Hard coverage guarantee is visual: a visible tile must have a badge marker.
      return Boolean(card.querySelector('.unreal-image-badge'));
    }

    // Suppress irrelevant global article/news toasts while in image-grid mode.
    suppressGridNewsToasts() {
      if (!this.isImageGridPage) return;
      document.getElementById('sharesafe-news-badge')?.remove();
    }

    // Keep valid-card rules permissive for result tiles; only reject obvious non-results.
    isValidGridCard(card, img) {
      if (!card || !img) return { ok: false, reason: 'no_image' };
      if (!this.isVisibleElement(card)) return { ok: false, reason: 'not_visible' };

      const cardRect = card.getBoundingClientRect();
      if (cardRect.width < 40 || cardRect.height < 40) return { ok: false, reason: 'tiny_or_zero_card' };

      const imgRect = img.getBoundingClientRect();
      const width = img.complete
        ? (img.naturalWidth || img.width || imgRect.width || 0)
        : (img.width || imgRect.width || cardRect.width || 0);
      const height = img.complete
        ? (img.naturalHeight || img.height || imgRect.height || 0)
        : (img.height || imgRect.height || cardRect.height || 0);

      if (img.complete && (((img.naturalWidth || 0) === 0) || ((img.naturalHeight || 0) === 0))) {
        return { ok: false, reason: 'broken_image' };
      }

      if (width < 24 || height < 24) return { ok: false, reason: 'tiny_ui_asset' };

      const srcLower = (img.currentSrc || img.src || '').toLowerCase();
      if ((srcLower.includes('favicon') || srcLower.includes('sprite') || srcLower.includes('/icon')) && width < 96 && height < 96) {
        return { ok: false, reason: 'non_result_control_asset' };
      }

      return { ok: true, reason: null };
    }

    _getImageSourceSignature(img) {
      if (!img) return '';
      return String(
        img.currentSrc ||
        img.src ||
        img.getAttribute('src') ||
        img.getAttribute('data-src') ||
        img.getAttribute('srcset') ||
        ''
      ).trim().slice(0, 520);
    }

    _clearImageProcessingState(img, reason = 'state-reset') {
      if (!img) return;
      const staleKey = img.dataset.unrealStableKey;
      if (staleKey) {
        this.checkedImages.delete(staleKey);
      }
      delete img.dataset.unrealChecked;
      delete img.dataset.unrealAnalyzedSrc;
      delete img.dataset.unrealStableKey;
      console.log('[Grid] Cleared image processing state:', {
        reason,
        src: (img.currentSrc || img.src || '').slice(0, 120)
      });
    }

    _ensureGridImageLifecycleHooks(img, card, cardKey) {
      if (!this.isImageGridPage || !img || img.dataset.unrealGridLifecycleHooked === 'true') return;

      img.dataset.unrealGridLifecycleHooked = 'true';

      img.addEventListener('load', () => {
        if (!this.isEnabled) return;
        const resolvedCard = (card && card.isConnected) ? card : (
          img.closest('div[data-ri], div.isv-r, div[jsname="dTDiAc"], div[data-docid], [role="gridcell"], [role="listitem"], figure') || img.parentElement
        );
        if (!resolvedCard) return;
        const resolvedKey = cardKey || img.dataset.unrealCardKey || this.ensureCardIdentity(resolvedCard);

        const latestSig = this._getImageSourceSignature(img);
        if (img.dataset.unrealAnalyzedSrc && latestSig && img.dataset.unrealAnalyzedSrc !== latestSig) {
          this._clearImageProcessingState(img, 'source-changed-on-load');
        }

        if (img.dataset.unrealChecked !== 'true') {
          this.queueGridImage(img, resolvedCard, resolvedKey);
        }

        this.scheduleGridRescan('image-load');
      }, { passive: true });

      img.addEventListener('error', () => {
        if (!this.isEnabled) return;
        const resolvedCard = (card && card.isConnected) ? card : (
          img.closest('div[data-ri], div.isv-r, div[jsname="dTDiAc"], div[data-docid], [role="gridcell"], [role="listitem"], figure') || img.parentElement
        );
        if (!resolvedCard) return;
        const resolvedKey = cardKey || img.dataset.unrealCardKey || this.ensureCardIdentity(resolvedCard);
        this._scheduleGridRetry(img, resolvedCard, resolvedKey, 'image-error');
        this.scheduleGridRescan('image-error');
      }, { passive: true });
    }

    _scheduleGridRetry(img, card, cardKey, reason = 'retry') {
      if (!this.isImageGridPage || !img || !card || !cardKey) return false;

      const retries = Number(img.dataset.unrealRetryCount || '0');
      if (retries >= 3) {
        console.log('[Grid] Retry skipped (max attempts reached):', { reason, cardKey: cardKey.slice(0, 60) });
        return false;
      }

      const nextRetry = retries + 1;
      img.dataset.unrealRetryCount = String(nextRetry);
      this.gridRetryCount += 1;

      const delay = Math.min(2500, 350 * nextRetry + 120);

      setTimeout(() => {
        if (!this.isEnabled || !img.isConnected) return;
        if (img.dataset.unrealChecked === 'true') return;
        this.queueGridImage(img, card, cardKey);
        this.scheduleGridRescan(`retry-${reason}`);
      }, delay);

      console.log('[Grid] Retry scheduled:', {
        reason,
        retryAttempt: nextRetry,
        delay,
        cardKey: cardKey.slice(0, 60)
      });

      return true;
    }

    queueGridCardForAnalysis(card, img, cardKey, trigger = 'scan') {
      if (!img) {
        return { queued: false, skippedReason: 'no_image', retried: false, alreadyBadged: false };
      }

      this._ensureGridImageLifecycleHooks(img, card, cardKey);

      const latestSourceSig = this._getImageSourceSignature(img);
      const analyzedSourceSig = img.dataset.unrealAnalyzedSrc || '';

      // Source changed after prior analysis (placeholder -> final image or dynamic swap).
      if (img.dataset.unrealChecked === 'true' && analyzedSourceSig && latestSourceSig && analyzedSourceSig !== latestSourceSig) {
        this._clearImageProcessingState(img, 'source-changed-before-queue');
      }

      // Keep stage-1 coverage independent from analysis dedupe.
      if (!this.cardHasVisualState(card, cardKey)) {
        this.attachCheckingBadge(card, cardKey);
      }

      // If not fully loaded yet, retry later instead of permanently marking as processed.
      if (!img.complete || (img.naturalWidth || 0) === 0) {
        const retried = this._scheduleGridRetry(img, card, cardKey, 'not-loaded');
        return { queued: false, skippedReason: 'not_loaded', retried, alreadyBadged: this.cardHasVisualState(card, cardKey) };
      }

      // Refresh stable key with latest source.
      img.dataset.unrealStableKey = this.getStableImageKey(img, card, 0);
      img.dataset.unrealCardKey = cardKey;

      // If analysis already completed for this source, restore final badge if needed.
      if (img.dataset.unrealChecked === 'true') {
        this.queueGridImage(img, card, cardKey);
        const hasFinalBadge = Boolean(card.querySelector('.unreal-image-badge:not(.checking)'));
        return { queued: false, skippedReason: 'already_checked', retried: false, alreadyBadged: hasFinalBadge };
      }

      if (this.queue.includes(img)) {
        return { queued: false, skippedReason: 'already_queued', retried: false, alreadyBadged: this.cardHasVisualState(card, cardKey) };
      }

      this.queueGridImage(img, card, cardKey);
      return { queued: true, skippedReason: null, retried: false, alreadyBadged: this.cardHasVisualState(card, cardKey) };
    }

    // Attach a pulsing "Checking..." badge to a card container immediately (grid mode).
    // This guarantees every visible valid tile shows an indicator before analysis finishes.
    attachCheckingBadge(card, cardKey) {
      if (!card) return;
      // If there's already a FINAL (non-checking) badge, leave it alone.
      const existing = card.querySelector('.unreal-image-badge');
      if (existing && !existing.classList.contains('checking')) return;
      // If there's already a checking badge, nothing more to do.
      if (existing) return;

      const badge = document.createElement('div');
      badge.className = 'unreal-image-badge checking';
      badge.dataset.unrealCheckingBadge = 'true';
      const sanitizedKey = this.sanitizeBadgeKey(cardKey || 'grid-card');
      badge.dataset.unrealBadgeKey = sanitizedKey;
      badge.innerHTML = `<span class="unreal-checking-dot"></span><span>Checking...</span>`;

      if (getComputedStyle(card).position === 'static') card.style.position = 'relative';
      card.appendChild(badge);
      this.gridOverlayAttached += 1;
      this.setCardState(card, cardKey, 'checking');
      console.log('[Grid] Checking badge attached:', cardKey?.slice(0, 70));
    }

    // Replace the card's current badge (checking or stale) with the analysis result.
    updateCardBadge(card, cardKey, result) {
      if (!card) return;
      card.querySelectorAll('.unreal-image-badge').forEach(b => b.remove());

      // Map confidence/riskLevel → compact label, icon, state.
      // Thresholds: 0–34 → Real, 35–59 → Maybe AI, 60+ → AI
      let compactLabel, badgeClass, icon, newState;
      const conf = typeof result.confidence === 'number' ? result.confidence : -1;
      if (result.riskLevel === 'high' || conf >= 60) {
        compactLabel = 'AI';       badgeClass = 'high-risk';   icon = '🔴'; newState = 'analyzed-ai';
      } else if (result.riskLevel === 'medium' || conf >= 35) {
        compactLabel = 'Maybe AI'; badgeClass = 'medium-risk'; icon = '🟡'; newState = 'analyzed-maybe';
      } else {
        compactLabel = 'Real';     badgeClass = 'low-risk';    icon = '🟢'; newState = 'analyzed-real';
      }

      const badge = document.createElement('div');
      badge.className = `unreal-image-badge ${badgeClass}`;
      const sanitizedKey = this.sanitizeBadgeKey(cardKey || 'grid-card');
      badge.dataset.unrealBadgeKey = sanitizedKey;
      badge.innerHTML = `<span style="font-size:11px">${icon}</span><span>${compactLabel}</span>`;

      badge.addEventListener('click', (e) => {
        e.stopPropagation();
        e.preventDefault();
        const img = card.querySelector('img');
        if (img) this.showDetails(img, result);
      });

      card.style.position = card.style.position || 'relative';
      card.appendChild(badge);
      this.setCardState(card, cardKey, newState);
      this.gridFinalStateUpdates += 1;
      console.log('[ImageScanner][BadgeDebug][Grid]', {
        pipelineConfidence: conf,
        pipelineRiskLevel: result.riskLevel,
        displayedLabel: compactLabel,
        selectedBucket: badgeClass,
        cardKey: cardKey?.slice(0, 60)
      });
      console.log('[Grid] Badge updated:', { label: compactLabel, state: newState, key: cardKey?.slice(0, 60) });
    }

    // Legacy wrapper — resolves card container from img and delegates to attachCheckingBadge.
    attachQueuedGridBadge(img) {
      if (!this.isImageGridPage) return;
      const card = img.closest('div[data-ri], div.isv-r, div[jsname="dTDiAc"]') ||
                   img.closest('[role="gridcell"], figure, [class*="gallery"]') ||
                   img.parentElement;
      if (!card) return;
      const cardKey = this.ensureCardIdentity(card);
      this.attachCheckingBadge(card, cardKey);
    }

    scheduleGridRescan(reason = 'unknown') {
      if (!this.isImageGridPage) return;
      if (this.gridRescanTimer) clearTimeout(this.gridRescanTimer);

      this.gridRescanTimer = setTimeout(() => {
        this.scanImageGridResults(reason);
      }, 160);
    }

    scanImageGridResults(reason = 'initial') {
      if (!this.isEnabled || !this.isImageGridPage) return;

      this.suppressGridNewsToasts();
      const cards = this.getImageGridCards();
      const totalCards = cards.length;
      let totalCandidateImages = 0;
      let visibleCards = 0;
      let validVisibleCards = 0;
      let cardsAlreadyWithState = 0;
      let cardsAlreadyWithStateMap = 0;
      let cardsMissingStateBeforeGap = 0;
      let cardsFixedByGapFiller = 0;
      let cardsQueuedForAnalysis = 0;
      let cardsRetried = 0;
      const skipReasons = {};

      cards.forEach((card, idx) => {
        if (!this.isVisibleElement(card)) return;
        visibleCards += 1;

        const cardKey = this.ensureCardIdentity(card, idx);
        const img = this.getPrimaryImageFromCard(card);
        if (img) totalCandidateImages += 1;
        const validity = this.isValidGridCard(card, img);
        if (!validity.ok) {
          skipReasons[validity.reason] = (skipReasons[validity.reason] || 0) + 1;
          return;
        }
        validVisibleCards += 1;

        const hasVisualState = this.cardHasVisualState(card, cardKey);
        const hasStateMap = this.getCardState(cardKey) !== 'none';
        if (hasStateMap) cardsAlreadyWithStateMap += 1;

        if (hasVisualState) {
          cardsAlreadyWithState += 1;
          // Normalize tiles that already have a badge but no tracked state yet.
          if (!hasStateMap) {
            this.setCardState(card, cardKey, 'checking');
          }
        } else {
          cardsMissingStateBeforeGap += 1;
          this.attachCheckingBadge(card, cardKey);
          cardsFixedByGapFiller += 1;
        }

        const queueDecision = this.queueGridCardForAnalysis(card, img, cardKey, reason);
        if (queueDecision.queued) {
          cardsQueuedForAnalysis += 1;
        } else if (queueDecision.skippedReason) {
          skipReasons[queueDecision.skippedReason] = (skipReasons[queueDecision.skippedReason] || 0) + 1;
        }
        if (queueDecision.retried) {
          cardsRetried += 1;
        }
      });

      this.gridProcessedSinceLastScan = cardsFixedByGapFiller;

      console.log('[Grid] coverage scan:', {
        reason,
        totalCardsDetected: totalCards,
        totalCandidateImages,
        totalVisibleCards: visibleCards,
        totalValidVisibleCards: validVisibleCards,
        skippedByReason: skipReasons,
        cardsAlreadyWithState,
        cardsAlreadyBadged: cardsAlreadyWithState,
        cardsAlreadyWithStateMap,
        cardsMissingStateBeforeGap,
        cardsFixedByGapFiller,
        cardsQueuedForAnalysis,
        cardsRetried,
        totalRetriesScheduled: this.gridRetryCount,
        totalProcessedAnalyses: this.gridAnalyzedCount,
        cardsUpdatedWithFinalState: this.gridFinalStateUpdates,
        queueLength: this.queue.length
      });

      // Gap-filler pass after each scan cycle.
      setTimeout(() => this.coverageEnforcementPass('post-scan-gap-filler'), 0);
    }

    coverageEnforcementPass(trigger = 'gap-filler') {
      if (!this.isEnabled || !this.isImageGridPage) return;

      this.suppressGridNewsToasts();
      const cards = this.getImageGridCards();
      let totalCandidateImages = 0;
      let visibleCards = 0;
      let validVisibleCards = 0;
      let cardsAlreadyWithState = 0;
      let cardsAlreadyWithStateMap = 0;
      let cardsMissingStateBeforeGap = 0;
      let cardsFixedByGapFiller = 0;
      let cardsQueuedForAnalysis = 0;
      let cardsRetried = 0;
      const skipReasons = {};

      cards.forEach((card, idx) => {
        if (!this.isVisibleElement(card)) return;
        visibleCards += 1;

        const cardKey = this.ensureCardIdentity(card, idx);
        const img = this.getPrimaryImageFromCard(card);
        if (img) totalCandidateImages += 1;
        const validity = this.isValidGridCard(card, img);
        if (!validity.ok) {
          skipReasons[validity.reason] = (skipReasons[validity.reason] || 0) + 1;
          return;
        }
        validVisibleCards += 1;

        const hasVisualState = this.cardHasVisualState(card, cardKey);
        const hasStateMap = this.getCardState(cardKey) !== 'none';
        if (hasStateMap) cardsAlreadyWithStateMap += 1;

        if (hasVisualState) {
          cardsAlreadyWithState += 1;
          if (!hasStateMap) {
            this.setCardState(card, cardKey, 'checking');
          }
        } else {
          cardsMissingStateBeforeGap += 1;
          this.attachCheckingBadge(card, cardKey);
          cardsFixedByGapFiller += 1;
        }

        const queueDecision = this.queueGridCardForAnalysis(card, img, cardKey, trigger);
        if (queueDecision.queued) {
          cardsQueuedForAnalysis += 1;
        } else if (queueDecision.skippedReason) {
          skipReasons[queueDecision.skippedReason] = (skipReasons[queueDecision.skippedReason] || 0) + 1;
        }
        if (queueDecision.retried) {
          cardsRetried += 1;
        }
      });

      console.log('[Grid] gap-filler pass:', {
        trigger,
        totalCandidateImages,
        totalVisibleCards: visibleCards,
        totalValidVisibleCards: validVisibleCards,
        skippedByReason: skipReasons,
        cardsAlreadyWithState,
        cardsAlreadyBadged: cardsAlreadyWithState,
        cardsAlreadyWithStateMap,
        cardsMissingStateBeforeGap,
        cardsFixedByGapFiller,
        cardsQueuedForAnalysis,
        cardsRetried,
        totalRetriesScheduled: this.gridRetryCount,
        totalProcessedAnalyses: this.gridAnalyzedCount,
        cardsUpdatedWithFinalState: this.gridFinalStateUpdates,
        queueLength: this.queue.length
      });
    }

    // Queue a single grid-card image for analysis, bypassing the generic
    // shouldProcessImage filter which uses article-page thresholds.
    queueGridImage(img, card, cardKey) {
      if (!img) return;

      const latestSourceSig = this._getImageSourceSignature(img);
      const analyzedSourceSig = img.dataset.unrealAnalyzedSrc || '';

      if (img.dataset.unrealChecked === 'true' && analyzedSourceSig && latestSourceSig && analyzedSourceSig !== latestSourceSig) {
        this._clearImageProcessingState(img, 'source-changed-before-restore');
      }

      if (!img.complete || (img.naturalWidth || 0) === 0) {
        this._scheduleGridRetry(img, card, cardKey, 'queue-not-loaded');
        return;
      }

      // If already analyzed — check if we just need to restore the result badge.
      if (img.dataset.unrealChecked === 'true') {
        const staleKey = img.dataset.unrealStableKey || this.getStableImageKey(img, card, 0);
        const existingResult = this.analysisResults.get(staleKey) || this.analysisResults.get(analyzedSourceSig) || this.analysisResults.get(img.src);
        if (existingResult) {
          const hasFinalBadge = Boolean(card.querySelector('.unreal-image-badge:not(.checking)'));
          if (!hasFinalBadge) {
            this.updateCardBadge(card, cardKey, existingResult);
          }
        } else {
          this._clearImageProcessingState(img, 'checked-without-result');
        }
        return;
      }

      // Stamp stable key on the image element (always refresh for latest currentSrc/src).
      img.dataset.unrealStableKey = this.getStableImageKey(img, card, 0);
      img.dataset.unrealCardKey = cardKey;

      // Guard against duplicate queue entries.
      if (this.queue.includes(img)) return;

      console.log('[Grid] Queued for analysis:', cardKey?.slice(0, 60));
      this.queue.push(img);
      this.processQueue();
    }

    // ═══════════════════════════════════════════════════════════════
    // PIPELINE LOADER (Dynamic Import)
    // ═══════════════════════════════════════════════════════════════

    async loadPipeline() {
      // Return existing promise if already loading
      if (this.pipelineLoading) {
        return this.pipelineLoading;
      }

      // Return immediately if already initialized
      if (this.pipelineInitialized && this.pipeline) {
        return this.pipeline;
      }

      // Start loading
      this.pipelineLoading = (async () => {
        try {
          console.log('[ImageScanner] Loading analysis pipeline...');

          // Dynamic import using chrome.runtime.getURL
          const pipelineModule = await import(chrome.runtime.getURL('imageAnalysisPipeline.js'));

          this.pipeline = new pipelineModule.ImageAnalysisPipeline();
          await this.pipeline.initialize();
          this.pipelineInitialized = true;

          console.log('[ImageScanner] Pipeline loaded successfully');
          return this.pipeline;
        } catch (error) {
          console.error('[ImageScanner] Failed to load pipeline:', error);
          this.pipelineLoading = null; // Allow retry
          this.pipeline = null;
          this.pipelineInitialized = false;
          throw error;
        }
      })();

      return this.pipelineLoading;
    }

    // ═══════════════════════════════════════════════════════════════
    // INITIALIZATION
    // ═══════════════════════════════════════════════════════════════

    async init() {
      console.log('[ImageScanner] Initializing automatic image detection...');

      try {
        // Import imageDetector module (for fallback)
        const imageDetectorModule = await import(chrome.runtime.getURL('imageDetector.js'));
        this.imageDetector = imageDetectorModule;

        // Get API keys
        this.geminiApiKey = await this.getGeminiApiKey();
        console.log('[ImageScanner] Gemini API key loaded:', this.geminiApiKey ? 'Yes' : 'No');

        // Get Sightengine credentials
        const sightengineCredentials = await this.getSightengineCredentials();
        this.sightengineUser = sightengineCredentials.user;
        this.sightengineSecret = sightengineCredentials.secret;
        console.log('[ImageScanner] Sightengine credentials loaded:',
          (this.sightengineUser && this.sightengineSecret) ? 'Yes' : 'No');

        // Inject styles
        this.injectStyles();

        // Start observers
        this.observeNewImages();
        this.observeVisibleImages();

        if (this.isImageGridPage) {
          this.scrollHandler = () => {
            if (this.gridScrollTimer) clearTimeout(this.gridScrollTimer);
            this.gridScrollTimer = setTimeout(() => this.scanImageGridResults('scroll'), 160);
          };
          window.addEventListener('scroll', this.scrollHandler, { passive: true });
          this.suppressGridNewsToasts();
          // Kick a hard coverage sweep immediately on init.
          setTimeout(() => this.coverageEnforcementPass('init'), 0);
        }

        // Scan existing images
        this.scanExistingImages();

        console.log('[ImageScanner] Initialization complete');
      } catch (error) {
        console.error('[ImageScanner] Initialization error:', error);
      }
    }

    // ═══════════════════════════════════════════════════════════════
    // API KEY RETRIEVAL
    // ═══════════════════════════════════════════════════════════════

    async getGeminiApiKey() {
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

    async getSightengineCredentials() {
      return new Promise((resolve) => {
        if (typeof chrome === 'undefined' || !chrome.storage) {
          resolve({ user: null, secret: null });
          return;
        }
        chrome.storage.sync.get(['sightengineUser', 'sightengineSecret'], (result) => {
          resolve({
            user: result.sightengineUser || null,
            secret: result.sightengineSecret || null
          });
        });
      });
    }

    // ═══════════════════════════════════════════════════════════════
    // RATE LIMITING
    // ═══════════════════════════════════════════════════════════════

    canMakeGeminiRequest() {
      if (!this.geminiApiKey) return false;

      const now = Date.now();
      const oneMinuteAgo = now - 60000;

      // Remove old timestamps
      this.geminiRequestTimes = this.geminiRequestTimes.filter(time => time > oneMinuteAgo);

      // Check if we've hit the rate limit
      if (this.geminiRequestTimes.length >= this.geminiMaxPerMinute) {
        console.log('[ImageScanner] Gemini rate limit reached, skipping');
        return false;
      }

      // Check minimum delay between requests
      const lastRequest = this.geminiRequestTimes[this.geminiRequestTimes.length - 1] || 0;
      if (now - lastRequest < this.geminiMinDelay) {
        console.log('[ImageScanner] Gemini minimum delay not met, skipping');
        return false;
      }

      return true;
    }

    recordGeminiRequest() {
      this.geminiRequestTimes.push(Date.now());
    }

    // ═══════════════════════════════════════════════════════════════
    // STYLE INJECTION
    // ═══════════════════════════════════════════════════════════════

    injectStyles() {
      if (document.getElementById('unreal-image-scanner-styles')) {
        console.log('[ImageScanner] Styles already injected');
        return;
      }

      console.log('[ImageScanner] Injecting styles');
      const style = document.createElement('style');
      style.id = 'unreal-image-scanner-styles';
      style.textContent = `
        .unreal-image-wrapper {
          position: relative !important;
          display: inline-block !important;
        }

        .unreal-spinner-overlay {
          position: absolute !important;
          top: 0 !important;
          left: 0 !important;
          right: 0 !important;
          bottom: 0 !important;
          background: rgba(0, 0, 0, 0.3) !important;
          display: flex !important;
          align-items: center !important;
          justify-content: center !important;
          z-index: 999998 !important;
          pointer-events: none !important;
        }

        .unreal-spinner {
          width: 32px !important;
          height: 32px !important;
          border: 3px solid rgba(255, 255, 255, 0.3) !important;
          border-top-color: #fff !important;
          border-radius: 50% !important;
          animation: unreal-spin 0.8s linear infinite !important;
        }

        @keyframes unreal-spin {
          to { transform: rotate(360deg); }
        }

        .unreal-image-badge {
          position: absolute !important;
          top: 8px !important;
          right: 8px !important;
          background: rgba(0, 0, 0, 0.85) !important;
          backdrop-filter: blur(10px) !important;
          color: white !important;
          padding: 6px 10px !important;
          border-radius: 8px !important;
          font-size: 11px !important;
          font-weight: 600 !important;
          font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif !important;
          display: flex !important;
          align-items: center !important;
          gap: 6px !important;
          z-index: 999999 !important;
          cursor: pointer !important;
          transition: all 0.2s ease !important;
          box-shadow: 0 2px 12px rgba(0, 0, 0, 0.3) !important;
          max-width: 200px !important;
          white-space: nowrap !important;
        }

        .unreal-image-badge:hover {
          transform: scale(1.05) !important;
          box-shadow: 0 4px 16px rgba(0, 0, 0, 0.4) !important;
        }

        .unreal-image-badge.high-risk {
          border-left: 3px solid #ef4444 !important;
        }

        .unreal-image-badge.medium-risk {
          border-left: 3px solid #f97316 !important;
        }

        .unreal-image-badge.low-risk {
          border-left: 3px solid #22c55e !important;
        }

        .unreal-image-badge.error {
          border-left: 3px solid #6b7280 !important;
        }

        .unreal-image-badge.checking {
          border-left: 3px solid #6b7280 !important;
          opacity: 0.88 !important;
        }

        @keyframes unreal-checking-pulse {
          0%, 100% { transform: scale(0.75); opacity: 0.35; }
          50% { transform: scale(1); opacity: 1; }
        }

        .unreal-checking-dot {
          display: inline-block !important;
          width: 8px !important;
          height: 8px !important;
          border-radius: 50% !important;
          background: #9ca3af !important;
          animation: unreal-checking-pulse 1.4s ease-in-out infinite !important;
          flex-shrink: 0 !important;
        }

        .unreal-image-border-high {
          outline: 3px solid #ef4444 !important;
          outline-offset: -3px !important;
        }

        .unreal-image-border-medium {
          outline: 3px solid #f97316 !important;
          outline-offset: -3px !important;
        }

        .unreal-image-border-low {
          outline: 3px solid #22c55e !important;
          outline-offset: -3px !important;
        }

        .unreal-details-popup {
          position: fixed !important;
          background: white !important;
          border-radius: 12px !important;
          box-shadow: 0 10px 40px rgba(0, 0, 0, 0.5), 0 0 0 9999px rgba(0, 0, 0, 0) !important;
          z-index: 2147483647 !important;
          max-width: 380px !important;
          min-width: 300px !important;
          font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif !important;
          overflow: hidden !important;
          pointer-events: auto !important;
        }

        .unreal-details-header {
          padding: 16px 20px !important;
          color: white !important;
          display: flex !important;
          align-items: center !important;
          gap: 10px !important;
        }

        .unreal-details-header.high-risk {
          background: linear-gradient(135deg, #ef4444, #dc2626) !important;
        }

        .unreal-details-header.medium-risk {
          background: linear-gradient(135deg, #f97316, #ea580c) !important;
        }

        .unreal-details-header.low-risk {
          background: linear-gradient(135deg, #22c55e, #16a34a) !important;
        }

        .unreal-details-title {
          font-size: 16px !important;
          font-weight: 700 !important;
          margin: 0 !important;
        }

        .unreal-details-close {
          position: absolute !important;
          top: 12px !important;
          right: 12px !important;
          background: rgba(255, 255, 255, 0.2) !important;
          border: none !important;
          color: white !important;
          width: 28px !important;
          height: 28px !important;
          border-radius: 50% !important;
          cursor: pointer !important;
          display: flex !important;
          align-items: center !important;
          justify-content: center !important;
          font-size: 18px !important;
          transition: background 0.2s !important;
        }

        .unreal-details-close:hover {
          background: rgba(255, 255, 255, 0.3) !important;
        }

        .unreal-details-content {
          padding: 16px 20px !important;
          max-height: 400px !important;
          overflow-y: auto !important;
        }

        .unreal-details-section {
          margin-bottom: 16px !important;
        }

        .unreal-details-section:last-child {
          margin-bottom: 0 !important;
        }

        .unreal-details-label {
          font-size: 11px !important;
          font-weight: 600 !important;
          color: #6b7280 !important;
          text-transform: uppercase !important;
          letter-spacing: 0.5px !important;
          margin-bottom: 6px !important;
        }

        .unreal-details-value {
          font-size: 14px !important;
          color: #1f2937 !important;
          line-height: 1.5 !important;
        }

        .unreal-confidence-bar {
          height: 8px !important;
          background: #e5e7eb !important;
          border-radius: 4px !important;
          overflow: hidden !important;
          margin-top: 6px !important;
        }

        .unreal-confidence-fill {
          height: 100% !important;
          border-radius: 4px !important;
          transition: width 0.3s ease !important;
        }

        .unreal-confidence-fill.high {
          background: linear-gradient(90deg, #ef4444, #dc2626) !important;
        }

        .unreal-confidence-fill.medium {
          background: linear-gradient(90deg, #f97316, #ea580c) !important;
        }

        .unreal-confidence-fill.low {
          background: linear-gradient(90deg, #22c55e, #16a34a) !important;
        }

        .unreal-artifact-list {
          list-style: none !important;
          padding: 0 !important;
          margin: 0 !important;
        }

        .unreal-artifact-item {
          padding: 8px 12px !important;
          background: #f9fafb !important;
          border-radius: 6px !important;
          margin-bottom: 6px !important;
          font-size: 13px !important;
          color: #374151 !important;
        }

        .unreal-artifact-item:last-child {
          margin-bottom: 0 !important;
        }

        .unreal-signal-tag {
          display: inline-block !important;
          padding: 4px 8px !important;
          background: #f3f4f6 !important;
          border-radius: 4px !important;
          font-size: 11px !important;
          color: #4b5563 !important;
          margin: 2px !important;
        }

        .unreal-sources-list {
          display: flex !important;
          gap: 8px !important;
          flex-wrap: wrap !important;
        }

        .unreal-source-tag {
          padding: 4px 10px !important;
          background: #e0e7ff !important;
          color: #4f46e5 !important;
          border-radius: 12px !important;
          font-size: 11px !important;
          font-weight: 500 !important;
        }

        .unreal-dismiss-btn {
          width: 100% !important;
          padding: 12px !important;
          background: #f3f4f6 !important;
          border: none !important;
          color: #4b5563 !important;
          font-size: 14px !important;
          font-weight: 600 !important;
          cursor: pointer !important;
          transition: background 0.2s !important;
        }

        .unreal-dismiss-btn:hover {
          background: #e5e7eb !important;
        }

        .unreal-overlay-backdrop {
          position: fixed !important;
          top: 0 !important;
          left: 0 !important;
          right: 0 !important;
          bottom: 0 !important;
          background: rgba(0, 0, 0, 0.5) !important;
          z-index: 2147483646 !important;
          pointer-events: auto !important;
        }
      `;
      document.head.appendChild(style);
      console.log('[ImageScanner] Styles injected successfully');
    }

    // ═══════════════════════════════════════════════════════════════
    // IMAGE DISCOVERY
    // ═══════════════════════════════════════════════════════════════

    scanExistingImages() {
      console.log('[ImageScanner] Scanning existing images...');

      if (this.isImageGridPage) {
        this.scanImageGridResults('initial');
        return;
      }

      // Get all standard images
      const images = document.querySelectorAll('img');

      // Get platform-specific images if on social media
      const platformImages = this.getPlatformImages();

      // Combine and dedupe
      const allImages = new Set([...images, ...platformImages]);

      console.log(`[ImageScanner] Found ${allImages.size} images on page`);

      allImages.forEach(img => {
        if (this.shouldProcessImage(img)) {
          this.observeImage(img);
        }
      });

      // Also scan for background images
      this.scanBackgroundImages();
    }

    getPlatformImages() {
      const hostname = location.hostname;
      const images = [];

      for (const [platform, selector] of Object.entries(this.platformSelectors)) {
        if (hostname.includes(platform.replace('.com', ''))) {
          const platformImgs = document.querySelectorAll(selector);
          images.push(...platformImgs);
          console.log(`[ImageScanner] Found ${platformImgs.length} images on ${platform}`);
        }
      }

      return images;
    }

    scanBackgroundImages() {
      // Find elements with background images
      const elements = document.querySelectorAll('*');
      elements.forEach(el => {
        const style = getComputedStyle(el);
        const bgImage = style.backgroundImage;

        if (bgImage && bgImage !== 'none' && bgImage.includes('url(')) {
          const urlMatch = bgImage.match(/url\(['"]?([^'"]+)['"]?\)/);
          if (urlMatch && urlMatch[1]) {
            const bgUrl = urlMatch[1];
            // Skip data URIs and tiny images
            if (!bgUrl.startsWith('data:') || bgUrl.length > 1000) {
              // Create a virtual image element for tracking
              el.dataset.unrealBgImage = bgUrl;
            }
          }
        }
      });
    }

    // ═══════════════════════════════════════════════════════════════
    // IMAGE FILTERING
    // ═══════════════════════════════════════════════════════════════

    evaluateImageCandidate(img, options = {}) {
      const {
        gridMode = false,
        card = null,
        idx = 0
      } = options;

      if (!img) return { ok: false, reason: 'no_image' };

      if (img.dataset.unrealChecked === 'true') {
        return { ok: false, reason: 'already_checked' };
      }

      if (!this.isVisibleElement(img)) {
        return { ok: false, reason: 'not_visible' };
      }

      if (!img.complete || (img.naturalWidth || 0) === 0) {
        return { ok: false, reason: 'not_loaded' };
      }

      const stableKey = this.getStableImageKey(img, card, idx);
      img.dataset.unrealStableKey = stableKey;

      if (this.checkedImages.has(stableKey)) {
        return { ok: false, reason: 'stable_key_checked' };
      }

      const rect = img.getBoundingClientRect();
      const width = img.naturalWidth || img.width || rect.width || 0;
      const height = img.naturalHeight || img.height || rect.height || 0;
      const minSize = gridMode ? 72 : 200;
      if (width < minSize || height < minSize) {
        return { ok: false, reason: 'below_size_threshold' };
      }

      if (img.src && img.src.includes('.svg')) {
        return { ok: false, reason: 'svg' };
      }

      if (img.src && img.src.startsWith('data:') && img.src.length < 500) {
        return { ok: false, reason: 'tiny_data_uri' };
      }

      const classAndId = `${img.className || ''} ${img.id || ''} ${img.alt || ''}`.toLowerCase();
      const uiPatterns = gridMode
        ? ['avatar', 'profile', 'icon', 'emoji', 'favicon', 'sprite']
        : ['avatar', 'profile', 'icon', 'logo', 'emoji', 'badge', 'button', 'favicon', 'sprite', 'thumb'];
      if (uiPatterns.some(pattern => classAndId.includes(pattern))) {
        return { ok: false, reason: 'ui_pattern' };
      }

      const srcLower = (img.currentSrc || img.src || '').toLowerCase();
      const srcPatterns = gridMode
        ? ['/avatar', '/profile', '/icon', '/emoji', 'favicon', 'sprite']
        : ['/avatar', '/profile', '/icon', '/emoji', '/badge', 'favicon', 'sprite', '/logo', '/thumb'];
      if (srcPatterns.some(pattern => srcLower.includes(pattern))) {
        return { ok: false, reason: 'src_pattern' };
      }

      const parent = img.closest('nav, header, footer, [role="navigation"], [role="banner"], .navbar, .nav, .sidebar');
      if (parent && !gridMode) {
        return { ok: false, reason: 'inside_navigation' };
      }

      // On image-grid pages, do not skip because of google/gstatic hosting.
      if (!gridMode) {
        try {
          const url = new URL(img.currentSrc || img.src);
          if (this.trustedDomains.some(domain => url.hostname.includes(domain))) {
            return { ok: false, reason: 'trusted_domain' };
          }
        } catch (e) {
          return { ok: false, reason: 'invalid_url' };
        }
      }

      return { ok: true, reason: null, stableKey };
    }

    shouldProcessImage(img, options = {}) {
      return this.evaluateImageCandidate(img, options).ok;
    }

    // ═══════════════════════════════════════════════════════════════
    // MUTATION OBSERVER - Dynamic Content
    // ═══════════════════════════════════════════════════════════════

    observeNewImages() {
      this.mutationObserver = new MutationObserver((mutations) => {
        if (!this.isEnabled) return;

        if (this.isImageGridPage) {
          let addedNodeCount = 0;
          let sourceMutationCount = 0;

          mutations.forEach((mutation) => {
            if (mutation.type === 'childList') {
              addedNodeCount += mutation.addedNodes?.length || 0;
              mutation.addedNodes?.forEach((node) => {
                if (node.nodeType !== Node.ELEMENT_NODE) return;
                if (node.tagName === 'IMG') {
                  const img = node;
                  const card = img.closest('div[data-ri], div.isv-r, div[jsname="dTDiAc"], div[data-docid], [role="gridcell"], [role="listitem"], figure') || img.parentElement;
                  if (card) {
                    const cardKey = this.ensureCardIdentity(card);
                    this._ensureGridImageLifecycleHooks(img, card, cardKey);
                  }
                }
                const images = node.querySelectorAll?.('img');
                images?.forEach((img) => {
                  const card = img.closest('div[data-ri], div.isv-r, div[jsname="dTDiAc"], div[data-docid], [role="gridcell"], [role="listitem"], figure') || img.parentElement;
                  if (card) {
                    const cardKey = this.ensureCardIdentity(card);
                    this._ensureGridImageLifecycleHooks(img, card, cardKey);
                  }
                });
              });
            }

            if (mutation.type === 'attributes' && mutation.target?.tagName === 'IMG') {
              if (mutation.attributeName === 'src' || mutation.attributeName === 'srcset' || mutation.attributeName === 'data-src') {
                sourceMutationCount += 1;
                const img = mutation.target;
                const latestSourceSig = this._getImageSourceSignature(img);
                if (img.dataset.unrealAnalyzedSrc && latestSourceSig && img.dataset.unrealAnalyzedSrc !== latestSourceSig) {
                  this._clearImageProcessingState(img, `attribute-change:${mutation.attributeName}`);
                }
                const card = img.closest('div[data-ri], div.isv-r, div[jsname="dTDiAc"], div[data-docid], [role="gridcell"], [role="listitem"], figure') || img.parentElement;
                if (card) {
                  const cardKey = this.ensureCardIdentity(card);
                  this._ensureGridImageLifecycleHooks(img, card, cardKey);
                }
              }
            }
          });

          console.log('[Grid] Mutation summary:', {
            addedNodeCount,
            sourceMutationCount
          });

          this.scheduleGridRescan(sourceMutationCount > 0 ? 'mutation-source-change' : 'mutation');
          return;
        }

        mutations.forEach(mutation => {
          // Check added nodes
          mutation.addedNodes.forEach(node => {
            if (node.nodeType === Node.ELEMENT_NODE) {
              // Check if node is an image
              if (node.tagName === 'IMG') {
                this.handleNewImage(node);
              }
              // Check for images within the node
              const images = node.querySelectorAll?.('img');
              images?.forEach(img => this.handleNewImage(img));
            }
          });

          // Check for src attribute changes
          if (mutation.type === 'attributes' &&
            mutation.attributeName === 'src' &&
            mutation.target.tagName === 'IMG') {
            this.handleNewImage(mutation.target);
          }
        });
      });

      this.mutationObserver.observe(document.body, {
        childList: true,
        subtree: true,
        attributes: true,
        attributeFilter: ['src', 'srcset', 'data-src']
      });

      console.log('[ImageScanner] MutationObserver active');
    }

    handleNewImage(img) {
      if (this.shouldProcessImage(img, { gridMode: this.isImageGridPage })) {
        console.log('[ImageScanner] New image detected:', img.src?.substring(0, 50));
        this.observeImage(img);
      }
    }

    // ═══════════════════════════════════════════════════════════════
    // INTERSECTION OBSERVER - Viewport Detection
    // ═══════════════════════════════════════════════════════════════

    observeVisibleImages() {
      this.intersectionObserver = new IntersectionObserver(
        (entries) => {
          entries.forEach(entry => {
            if (entry.isIntersecting && this.isEnabled) {
              const img = entry.target;
              if (!img.dataset.unrealChecked) {
                this.queueImage(img);
              }
              // Stop observing once queued
              this.intersectionObserver.unobserve(img);
            }
          });
        },
        {
          root: null,
          rootMargin: '100px', // Start loading slightly before visible
          threshold: 0.1
        }
      );

      console.log('[ImageScanner] IntersectionObserver active');
    }

    observeImage(img) {
      // In grid mode images are queued via queueGridImage (called from scanImageGridResults).
      // The IntersectionObserver + shouldProcessImage path uses article-page thresholds
      // that are too restrictive for thumbnails, so we skip it for grid pages.
      if (this.isImageGridPage) return;

      // Wait for image to load if not yet loaded
      if (!img.complete || img.naturalWidth === 0) {
        img.addEventListener('load', () => {
          if (this.shouldProcessImage(img)) {
            this.intersectionObserver.observe(img);
          }
        }, { once: true });
      } else {
        this.intersectionObserver.observe(img);
      }
    }

    // ═══════════════════════════════════════════════════════════════
    // QUEUE SYSTEM
    // ═══════════════════════════════════════════════════════════════

    queueImage(img) {
      // Avoid duplicates in queue
      if (this.queue.includes(img)) return;
      if (img.dataset.unrealChecked === 'true') return;

      console.log('[ImageScanner] Queuing image:', img.src?.substring(0, 60), `${img.width}x${img.height}`);
      if (this.isImageGridPage) {
        try {
          this.attachQueuedGridBadge(img);
        } catch (e) {
          console.warn('[Grid] Could not attach badge in queueImage:', e.message);
        }
      }
      this.queue.push(img);
      this.processQueue();
    }

    async processQueue() {
      // Respect concurrency limit
      if (this.processing >= this.maxConcurrent) return;
      if (this.queue.length === 0) return;

      // Throttle: ensure minimum delay between starts
      const now = Date.now();
      const timeSinceLastProcess = now - this.lastProcessTime;
      if (timeSinceLastProcess < this.processDelay) {
        setTimeout(() => this.processQueue(), this.processDelay - timeSinceLastProcess);
        return;
      }

      const img = this.queue.shift();
      if (!img || img.dataset.unrealChecked === 'true') {
        this.processQueue();
        return;
      }

      this.processing++;
      this.lastProcessTime = Date.now();

      try {
        await this.processImage(img);
      } catch (error) {
        console.error('[ImageScanner] Error processing image:', error);
        try {
          this.showErrorBadge(img);
        } catch (badgeErr) {
          console.warn('[ImageScanner] Could not show error badge:', badgeErr.message);
        }
      } finally {
        // Always release the concurrency slot so the queue can continue.
        this.processing--;
      }

      // Process next in queue (use requestIdleCallback for non-urgent)
      if (typeof requestIdleCallback !== 'undefined') {
        requestIdleCallback(() => this.processQueue());
      } else {
        setTimeout(() => this.processQueue(), 100);
      }
    }

    // ═══════════════════════════════════════════════════════════════
    // IMAGE PROCESSING
    // ═══════════════════════════════════════════════════════════════

    async processImage(img) {
      console.log('[ImageScanner] Analysis started:', img.src?.substring(0, 60));

      // In grid mode, retry images that are still in a transient loading state.
      if (this.isImageGridPage && (!img.complete || (img.naturalWidth || 0) === 0)) {
        const card = img.closest('div[data-ri], div.isv-r, div[jsname="dTDiAc"], div[data-docid], [role="gridcell"], [role="listitem"], figure') || img.parentElement;
        const cardKey = img.dataset.unrealCardKey || (card ? this.ensureCardIdentity(card) : null);
        if (card && cardKey) {
          this._scheduleGridRetry(img, card, cardKey, 'process-not-loaded');
        }
        return null;
      }

      // Show spinner while analyzing
      const spinner = this.showSpinner(img);

      try {
        // Load pipeline dynamically if not already done
        await this.loadPipeline();

        // Check if pipeline loaded successfully
        if (!this.pipeline) {
          throw new Error('Pipeline not available');
        }

        // Use the new layered analysis pipeline
        const pipelineResult = await this.pipeline.analyze(img);

        // Convert pipeline result to format expected by existing UI code
        const result = this._convertPipelineResult(pipelineResult);

        // Record Gemini request if Layer 4 was used
        if (pipelineResult.layers?.layer4 && !pipelineResult.layers.layer4.skipped) {
          this.recordGeminiRequest();
        }

        // Store result
        this.analysisResults.set(img.src, result);
        this.analysisResults.set(img.dataset.unrealStableKey || img.src, result);
        img.dataset.unrealAnalyzedSrc = img.currentSrc || img.src || '';

        // Remove spinner
        spinner?.remove();

        console.log('[ImageScanner] Analysis complete:', {
          confidence: result.confidence + '%',
          riskLevel: result.riskLevel,
          isAIGenerated: result.isAIGenerated,
          sources: result.sources,
          signals: result.signals
        });

        // Show visual feedback
        this.showResults(img, result);

        // Mark as checked only after successful analysis and result rendering.
        img.dataset.unrealChecked = 'true';
        this.checkedImages.add(img.dataset.unrealStableKey || img.src);
        delete img.dataset.unrealRetryCount;
        if (this.isImageGridPage) {
          this.gridAnalyzedCount += 1;
        }

        // Notify background script if AI detected
        if (result.isAIGenerated) {
          this.aiImageCount++;
          this.notifyBackground(result);
        }

        return result;

      } catch (error) {
        console.error('[ImageScanner] Analysis error:', error);
        spinner?.remove();
        this.showErrorBadge(img);

        // Temporary failures should not permanently block retries.
        this._clearImageProcessingState(img, 'analysis-error');
        if (this.isImageGridPage) {
          const card = img.closest('div[data-ri], div.isv-r, div[jsname="dTDiAc"], div[data-docid], [role="gridcell"], [role="listitem"], figure') || img.parentElement;
          const cardKey = img.dataset.unrealCardKey || (card ? this.ensureCardIdentity(card) : null);
          if (card && cardKey) {
            this._scheduleGridRetry(img, card, cardKey, 'analysis-error');
          }
        }
        return null;
      }
    }

    // ═══════════════════════════════════════════════════════════════
    // PIPELINE RESULT CONVERSION
    // ═══════════════════════════════════════════════════════════════

    _dedupeArtifactsForDisplay(artifacts = []) {
      const seen = new Set();

      return artifacts.filter(artifact => {
        const key = [
          String(artifact.type || '').trim().toLowerCase(),
          String(artifact.subtype || '').trim().toLowerCase(),
          String(artifact.description || '').trim().toLowerCase()
        ].join('::');

        if (seen.has(key)) return false;
        seen.add(key);
        return true;
      });
    }

    _dedupeTextList(items = []) {
      const seen = new Set();
      const unique = [];

      items.forEach(item => {
        const normalized = String(item || '').trim().toLowerCase();
        if (!normalized || seen.has(normalized)) return;
        seen.add(normalized);
        unique.push(item);
      });

      return unique;
    }

    /**
     * Convert new pipeline output to format expected by existing displayResult/showBadge
     */
    _convertPipelineResult(pipelineResult) {
      const uniqueArtifacts = this._dedupeArtifactsForDisplay(pipelineResult.allArtifacts || []);

      return {
        isAIGenerated: pipelineResult.isAIGenerated,
        confidence: pipelineResult.finalScore,
        riskLevel: pipelineResult.riskLevel,
        artifacts: uniqueArtifacts,
        reasoning: pipelineResult.reasoning,
        sources: this._getSources(pipelineResult),
        signals: this._getSignals({
          ...pipelineResult,
          allArtifacts: uniqueArtifacts
        }),
        details: pipelineResult.layers,
        processingTime: pipelineResult.processingTime?.total || 0
      };
    }

    /**
     * Get list of sources used in analysis
     */
    _getSources(pipelineResult) {
      const sources = ['local'];  // Layers 0, 1, 2 are local analysis

      if (pipelineResult.layers?.layer4 && !pipelineResult.layers.layer4.skipped) {
        sources.push('gemini');
      }

      return sources;
    }

    /**
     * Extract signals from pipeline artifacts for backward compatibility
     */
    _getSignals(pipelineResult) {
      const signals = [];

      // Add layer 0 signals
      if (pipelineResult.layers?.layer0?.signals) {
        pipelineResult.layers.layer0.signals.forEach(s => {
          signals.push(s.description || s.matched || s.type);
        });
      }

      // Add high-confidence artifacts as signals
      (pipelineResult.allArtifacts || []).forEach(artifact => {
        if (artifact.confidence >= 60) {
          signals.push(artifact.description);
        }
      });

      return this._dedupeTextList(signals).slice(0, 5);
    }

    // ═══════════════════════════════════════════════════════════════
    // IMAGE TO BASE64 CONVERSION
    // ═══════════════════════════════════════════════════════════════

    imageToBase64(img) {
      return new Promise((resolve, reject) => {
        try {
          // Handle CORS
          const canvas = document.createElement('canvas');
          canvas.width = img.naturalWidth || img.width;
          canvas.height = img.naturalHeight || img.height;

          const ctx = canvas.getContext('2d');

          // Create a new image with crossOrigin for CORS images
          const corsImg = new Image();
          corsImg.crossOrigin = 'anonymous';

          corsImg.onload = () => {
            try {
              ctx.drawImage(corsImg, 0, 0);
              const base64 = canvas.toDataURL('image/jpeg', 0.8);
              resolve(base64);
            } catch (e) {
              // If CORS fails, try with original image
              try {
                ctx.drawImage(img, 0, 0);
                const base64 = canvas.toDataURL('image/jpeg', 0.8);
                resolve(base64);
              } catch (e2) {
                reject(e2);
              }
            }
          };

          corsImg.onerror = () => {
            // Fallback to original image
            try {
              ctx.drawImage(img, 0, 0);
              const base64 = canvas.toDataURL('image/jpeg', 0.8);
              resolve(base64);
            } catch (e) {
              reject(e);
            }
          };

          corsImg.src = img.src;

          // Timeout fallback
          setTimeout(() => {
            try {
              ctx.drawImage(img, 0, 0);
              const base64 = canvas.toDataURL('image/jpeg', 0.8);
              resolve(base64);
            } catch (e) {
              reject(new Error('Timeout converting image'));
            }
          }, 3000);

        } catch (error) {
          reject(error);
        }
      });
    }

    // ═══════════════════════════════════════════════════════════════
    // VISUAL FEEDBACK - SPINNER
    // ═══════════════════════════════════════════════════════════════

    showSpinner(img) {
      try {
        // Wrap image if needed
        this.wrapImage(img);

        const spinner = document.createElement('div');
        spinner.className = 'unreal-spinner-overlay';
        spinner.innerHTML = '<div class="unreal-spinner"></div>';

        const wrapper = img.closest('.unreal-image-wrapper') || img.parentElement;
        wrapper.appendChild(spinner);

        return spinner;
      } catch (e) {
        console.warn('[ImageScanner] Could not show spinner:', e);
        return null;
      }
    }

    wrapImage(img) {
      // Don't wrap if already wrapped
      if (img.closest('.unreal-image-wrapper')) {
        console.log('[ImageScanner] Image already wrapped');
        return;
      }

      // Don't wrap if it would break layout
      const parent = img.parentElement;
      if (!parent) {
        console.log('[ImageScanner] No parent element for image');
        return;
      }

      console.log('[ImageScanner] Wrapping image:', {
        src: img.src?.substring(0, 60),
        parentTag: parent.tagName,
        parentClass: parent.className
      });

      const wrapper = document.createElement('div');
      wrapper.className = 'unreal-image-wrapper';

      // Copy position styles
      const computedStyle = getComputedStyle(img);
      if (computedStyle.position === 'absolute' || computedStyle.position === 'fixed') {
        wrapper.style.position = computedStyle.position;
        wrapper.style.top = computedStyle.top;
        wrapper.style.left = computedStyle.left;
        wrapper.style.right = computedStyle.right;
        wrapper.style.bottom = computedStyle.bottom;
      }

      parent.insertBefore(wrapper, img);
      wrapper.appendChild(img);

      console.log('[ImageScanner] Image wrapped successfully');
    }

    // ═══════════════════════════════════════════════════════════════
    // VISUAL FEEDBACK - RESULTS
    // ═══════════════════════════════════════════════════════════════

    showResults(img, result) {
      console.log('[ImageScanner] showResults called:', {
        confidence: result.confidence,
        riskLevel: result.riskLevel,
        isAIGenerated: result.isAIGenerated,
        imgSrc: img.src?.substring(0, 60)
      });

      // Show badges for ANY analyzed image (even low confidence for debugging)
      // This helps users see the extension is working
      if (!this.isImageGridPage && result.confidence < 20 && result.signals.length === 0) {
        // Skip completely uninteresting images
        console.log('[ImageScanner] Skipping badge - too low confidence and no signals');
        return;
      }

      console.log('[ImageScanner] Proceeding to show result for confidence:', result.confidence);

      // ── Grid mode: update the card's badge rather than a floating img wrapper badge ──
      if (this.isImageGridPage) {
        const card = img.closest('div[data-ri], div.isv-r, div[jsname="dTDiAc"]') ||
                     img.closest('[role="gridcell"], figure, [class*="gallery"]') ||
                     img.parentElement;
        const cardKey = card?.dataset?.unrealCardId ||
                        img.dataset.unrealCardKey ||
                        this.sanitizeBadgeKey(img.dataset.unrealStableKey || img.src);
        if (card) {
          this.updateCardBadge(card, cardKey, result);
        }
        // Apply border to the img element for a subtle visual signal.
        img.classList.remove('unreal-image-border-high', 'unreal-image-border-medium', 'unreal-image-border-low');
        img.classList.add(`unreal-image-border-${result.riskLevel}`);
        return;
      }

      // ── Non-grid mode: existing border + floating badge approach ──
      img.classList.remove('unreal-image-border-high', 'unreal-image-border-medium', 'unreal-image-border-low');
      img.classList.add(`unreal-image-border-${result.riskLevel}`);

      console.log('[ImageScanner] Border added:', img.classList);

      // Show badge
      this.showBadge(img, result);
    }

    // ═══════════════════════════════════════════════════════════════
    // BADGE DISPLAY
    // ═══════════════════════════════════════════════════════════════

    showBadge(img, result) {
      console.log('[ImageScanner] showBadge called for:', img.src?.substring(0, 60));

      const host = this.getBadgeHost(img);
      if (!host) {
        console.error('[ImageScanner] No host found for image badge');
        return;
      }

      const badgeKey = this.sanitizeBadgeKey(img.dataset.unrealStableKey || this.getStableImageKey(img));

      // Remove existing badge for this exact card/image key.
      const existingBadge = host.querySelector(`.unreal-image-badge[data-unreal-badge-key="${badgeKey}"]`);
      if (existingBadge) {
        console.log('[ImageScanner] Removing existing badge');
        existingBadge.remove();
      }

      const badge = document.createElement('div');
      badge.className = `unreal-image-badge ${result.riskLevel}-risk`;
      badge.dataset.unrealBadgeKey = badgeKey;

      // Risk icon
      const riskIcons = {
        high: '🔴',
        medium: '🟡',
        low: '🟢'
      };

      // Build badge content — in grid mode, showResults already routes through updateCardBadge,
      // but this fallback ensures no percentage chips appear if showBadge is called directly.
      let badgeContent = '';
      if (this.isImageGridPage) {
        const conf = typeof result.confidence === 'number' ? result.confidence : -1;
        const compactLabel = conf >= 60 ? 'AI' : conf >= 35 ? 'Maybe AI' : 'Real';
        const icon = conf >= 60 ? '🔴' : conf >= 35 ? '🟡' : '🟢';
        badgeContent = `<span style="font-size:11px">${icon}</span><span>${compactLabel}</span>`;
      } else {
        badgeContent = `
          <span style="font-size: 12px;">${riskIcons[result.riskLevel] || '⚪'}</span>
          <span>${result.confidence}% AI</span>
        `;

        if (result.aiType && result.aiType !== 'unknown') {
          badgeContent += `<span style="opacity: 0.7; font-size: 10px;">• ${result.aiType}</span>`;
        }
      }

      badge.innerHTML = badgeContent;

      console.log('[ImageScanner][BadgeDebug]', {
        pipelineConfidence: result.confidence,
        pipelineRiskLevel: result.riskLevel,
        displayedBadgeText: badge.textContent?.trim(),
        isGridMode: this.isImageGridPage
      });

      // Click handler to show details
      badge.addEventListener('click', (e) => {
        e.stopPropagation();
        e.preventDefault();
        this.showDetails(img, result);
      });

      host.style.position = host.style.position || 'relative';
      host.appendChild(badge);

      console.log('[ImageScanner] Badge appended successfully:', {
        badgeClass: badge.className,
        wrapperClass: host.className,
        badgeParent: badge.parentElement?.tagName
      });
    }

    showErrorBadge(img) {
      if (this.isImageGridPage) {
        // In grid mode, find the card container and update its badge.
        const card = img.closest('div[data-ri], div.isv-r, div[jsname="dTDiAc"]') ||
                     img.closest('[role="gridcell"], figure, [class*="gallery"]') ||
                     img.parentElement;
        if (!card) return;
        // Replace checking badge with compact "Review" label.
        card.querySelectorAll('.unreal-image-badge').forEach(b => b.remove());
        const badge = document.createElement('div');
        badge.className = 'unreal-image-badge error';
        badge.innerHTML = `<span style="font-size:11px">🔘</span><span>Review</span>`;
        card.style.position = card.style.position || 'relative';
        card.appendChild(badge);
        const cardKey = card.dataset.unrealCardId || img.dataset.unrealCardKey || '';
        if (cardKey) this.setCardState(card, cardKey, 'review');
        this.gridFinalStateUpdates += 1;
        return;
      }

      const host = this.getBadgeHost(img);
      if (!host) return;

      const badge = document.createElement('div');
      badge.className = 'unreal-image-badge error';
      badge.innerHTML = `<span style="font-size: 12px;">⚠️</span><span>Analysis failed</span>`;

      host.style.position = host.style.position || 'relative';
      host.appendChild(badge);
    }

    // ═══════════════════════════════════════════════════════════════
    // DETAILS POPUP
    // ═══════════════════════════════════════════════════════════════

    normalizeAnalysisResultItem(item) {
      if (!item) return null;

      const displayLabel = String(
        item.displayLabel || item.displayType || item.type || item.label || item.title || item.layer || item.source?.type || 'artifact'
      )
        .trim()
        .replace(/\s+/g, ' ');
      const displayDescription = String(
        item.displayDescription || item.explanation || item.description || item.content || item.message || item.reason || item.source?.description || ''
      )
        .trim()
        .replace(/\s+/g, ' ');

      if (!displayDescription) return null;

      const normalizedLabel = displayLabel.toLowerCase();
      const normalizedDescription = displayDescription.toLowerCase();
      const looseDescription = normalizedDescription
        .replace(/[^a-z0-9\s]/g, ' ')
        .replace(/\s+/g, ' ')
        .trim();

      return {
        source: item,
        displayLabel,
        displayDescription,
        normalizedLabel,
        normalizedDescription,
        looseDescription,
        uniqueKey: `${normalizedLabel}::${normalizedDescription}`,
        duplicateCount: 1,
        confidence: typeof item.confidence === 'number' ? item.confidence : null
      };
    }

    areNearDuplicateDescriptions(a, b) {
      if (!a || !b) return false;
      if (a === b) return true;
      if (a.includes(b) || b.includes(a)) return true;

      const toTokens = (text) => new Set(
        String(text)
          .split(/\s+/)
          .filter((token) => token.length >= 4)
      );

      const ta = toTokens(a);
      const tb = toTokens(b);
      if (ta.size === 0 || tb.size === 0) return false;

      let overlap = 0;
      ta.forEach((token) => {
        if (tb.has(token)) overlap += 1;
      });
      const minTokenCount = Math.max(1, Math.min(ta.size, tb.size));
      return (overlap / minTokenCount) >= 0.7;
    }

    // Reusable cleanup for analysis points shown in the details popup.
    // Returns { rawArtifacts, normalizedArtifacts, uniqueArtifacts, ...stats }.
    dedupeAnalysisResults(results, options = {}) {
      const {
        mergeNearDuplicates = true,
        enableLogs = false,
        logPrefix = '[ImageScanner] Analysis dedup'
      } = options;

      const rawArtifacts = Array.isArray(results) ? results : [];
      const normalizedArtifacts = rawArtifacts
        .map((item) => this.normalizeAnalysisResultItem(item))
        .filter(Boolean);

      // STEP A: exact dedupe (same normalized label + same normalized description)
      const exactMap = new Map();
      normalizedArtifacts.forEach((item) => {
        const existing = exactMap.get(item.uniqueKey);
        if (existing) {
          existing.duplicateCount += 1;
          if ((item.confidence ?? -1) > (existing.confidence ?? -1)) {
            existing.confidence = item.confidence;
          }
        } else {
          exactMap.set(item.uniqueKey, { ...item });
        }
      });

      let uniqueArtifacts = Array.from(exactMap.values());
      const exactDeduplicatedCount = uniqueArtifacts.length;
      let mergedCategoriesCount = 0;

      // STEP B (optional): merge near-duplicates under the same label.
      if (mergeNearDuplicates) {
        const byLabel = new Map();
        uniqueArtifacts.forEach((item) => {
          const bucket = byLabel.get(item.normalizedLabel) || [];
          bucket.push(item);
          byLabel.set(item.normalizedLabel, bucket);
        });

        const mergedOutput = [];
        byLabel.forEach((items) => {
          if (items.length === 1) {
            mergedOutput.push(items[0]);
            return;
          }

          const clusters = [];
          items.forEach((item) => {
            const cluster = clusters.find((c) =>
              this.areNearDuplicateDescriptions(item.looseDescription, c.representative.looseDescription)
            );
            if (cluster) {
              cluster.items.push(item);
            } else {
              clusters.push({ representative: item, items: [item] });
            }
          });

          clusters.forEach((cluster) => {
            if (cluster.items.length === 1) {
              mergedOutput.push(cluster.items[0]);
              return;
            }

            const sorted = [...cluster.items].sort((a, b) => b.displayDescription.length - a.displayDescription.length);
            const representative = sorted[0];
            const mergedCount = cluster.items.reduce((sum, item) => sum + (item.duplicateCount || 1), 0);
            const distinctDescriptions = new Set(cluster.items.map((item) => item.normalizedDescription)).size;

            const mergedDescription = distinctDescriptions > 1
              ? `Multiple ${representative.displayLabel.toLowerCase()} inconsistencies detected`
              : representative.displayDescription;

            mergedOutput.push({
              ...representative,
              displayDescription: mergedDescription,
              normalizedDescription: mergedDescription.toLowerCase(),
              looseDescription: mergedDescription.toLowerCase().replace(/[^a-z0-9\s]/g, ' ').replace(/\s+/g, ' ').trim(),
              duplicateCount: mergedCount
            });

            mergedCategoriesCount += 1;
          });
        });

        uniqueArtifacts = mergedOutput;
      }

      const deduplicatedArtifactCount = uniqueArtifacts.length;
      const duplicatesRemovedCount = Math.max(0, normalizedArtifacts.length - deduplicatedArtifactCount);

      if (enableLogs) {
        console.log(logPrefix, {
          rawArtifactCount: rawArtifacts.length,
          normalizedArtifactCount: normalizedArtifacts.length,
          exactDeduplicatedCount,
          deduplicatedArtifactCount,
          duplicatesRemovedCount,
          mergedCategoriesCount,
          finalDeduplicatedArtifactArray: uniqueArtifacts.map((a) => ({
            label: a.displayLabel,
            description: a.displayDescription,
            duplicateCount: a.duplicateCount,
            key: a.uniqueKey
          }))
        });
      }

      return {
        rawArtifacts,
        normalizedArtifacts,
        uniqueArtifacts,
        exactDeduplicatedCount,
        deduplicatedArtifactCount,
        duplicatesRemovedCount,
        mergedCategoriesCount
      };
    }

    showDetails(img, result) {
      console.log('[ImageScanner] showDetails called for:', result);

      // Remove existing popup
      this.closeDetails();

      // Create backdrop
      const backdrop = document.createElement('div');
      backdrop.className = 'unreal-overlay-backdrop';
      backdrop.addEventListener('click', () => this.closeDetails());
      document.body.appendChild(backdrop);

      // Create popup
      const popup = document.createElement('div');
      popup.className = 'unreal-details-popup';
      popup.id = 'unreal-details-popup';

      // Position popup in center of viewport (fixed positioning)
      const imgRect = img.getBoundingClientRect();

      // Try to position next to image first
      let top = imgRect.top;
      let left = imgRect.right + 10;

      // Check if popup would go off screen horizontally
      if (left + 380 > window.innerWidth) {
        // Try positioning on the left side
        left = imgRect.left - 390;

        // If still off screen, center it
        if (left < 10) {
          left = (window.innerWidth - 380) / 2;
          top = (window.innerHeight - 500) / 2;
        }
      }

      // Check if popup would go off screen vertically
      if (top + 500 > window.innerHeight) {
        top = window.innerHeight - 510;
      }
      if (top < 10) {
        top = 10;
      }

      // Ensure left is within bounds
      if (left < 10) {
        left = 10;
      }
      if (left + 380 > window.innerWidth) {
        left = window.innerWidth - 390;
      }

      popup.style.top = `${top}px`;
      popup.style.left = `${left}px`;

      console.log('[ImageScanner] Popup positioned at:', { top, left });

      // Risk level text
      const riskText = {
        high: 'High Risk - Likely AI Generated',
        medium: 'Medium Risk - Possibly AI Generated',
        low: 'Low Risk - Minimal AI Indicators'
      };

      // Deduplicate artifacts/signals/sources before display
      const uniqueArtifacts = this._dedupeArtifactsForDisplay(result.artifacts || []);
      const uniqueSignals = this._dedupeTextList(result.signals || []);
      const uniqueSources = this._dedupeTextList(result.sources || []);

      // Build artifacts list
      let artifactsHtml = '<p style="color: #6b7280; font-style: italic;">No specific artifacts detected</p>';
      if (uniqueArtifacts.length > 0) {
        artifactsHtml = `<ul class="unreal-artifact-list">
          ${uniqueArtifacts.map(a => `
            <li class="unreal-artifact-item">
              <strong>${a.type}:</strong> ${a.description}
            </li>
          `).join('')}
        </ul>`;
      }

      // Build signals
      let signalsHtml = '';
      if (uniqueSignals.length > 0) {
        signalsHtml = uniqueSignals.map(s =>
          `<span class="unreal-signal-tag">${s}</span>`
        ).join('');
      }

      // Build sources
      let sourcesHtml = '';
      if (uniqueSources.length > 0) {
        sourcesHtml = uniqueSources.map(s =>
          `<span class="unreal-source-tag">${s}</span>`
        ).join('');
      }

      popup.innerHTML = `
        <div class="unreal-details-header ${result.riskLevel}-risk">
          <span style="font-size: 24px;">${result.riskLevel === 'high' ? '🔴' : result.riskLevel === 'medium' ? '🟡' : '🟢'}</span>
          <h3 class="unreal-details-title">${riskText[result.riskLevel]}</h3>
          <button class="unreal-details-close" onclick="document.getElementById('unreal-details-popup')?.remove(); document.querySelector('.unreal-overlay-backdrop')?.remove();">×</button>
        </div>
        
        <div class="unreal-details-content">
          <div class="unreal-details-section">
            <div class="unreal-details-label">Trust Score</div>
            <div class="unreal-details-value">
              <strong style="font-size: 24px;">${result.confidence}</strong>/100
              <div class="unreal-confidence-bar">
                <div class="unreal-confidence-fill ${result.riskLevel}" style="width: ${result.confidence}%;"></div>
              </div>
            </div>
          </div>

          ${result.aiType && result.aiType !== 'unknown' ? `
          <div class="unreal-details-section">
            <div class="unreal-details-label">AI Type Detected</div>
            <div class="unreal-details-value">${result.aiType}</div>
          </div>
          ` : ''}

          <div class="unreal-details-section">
            <div class="unreal-details-label">Artifacts Found</div>
            <div class="unreal-details-value">${artifactsHtml}</div>
          </div>

          ${result.reasoning ? `
          <div class="unreal-details-section">
            <div class="unreal-details-label">Analysis Reasoning</div>
            <div class="unreal-details-value">${result.reasoning}</div>
          </div>
          ` : ''}

          ${signalsHtml ? `
          <div class="unreal-details-section">
            <div class="unreal-details-label">Detection Signals</div>
            <div class="unreal-details-value">${signalsHtml}</div>
          </div>
          ` : ''}

          ${sourcesHtml ? `
          <div class="unreal-details-section">
            <div class="unreal-details-label">Sources Used</div>
            <div class="unreal-sources-list">${sourcesHtml}</div>
          </div>
          ` : ''}
        </div>

        <button class="unreal-dismiss-btn" onclick="document.getElementById('unreal-details-popup')?.remove(); document.querySelector('.unreal-overlay-backdrop')?.remove();">
          Dismiss
        </button>
      `;

      document.body.appendChild(popup);

      console.log('[ImageScanner] Popup added to DOM:', {
        popupExists: !!document.getElementById('unreal-details-popup'),
        backdropExists: !!document.querySelector('.unreal-overlay-backdrop'),
        popupVisible: popup.offsetHeight > 0,
        popupPosition: { top: popup.style.top, left: popup.style.left }
      });
    }

    closeDetails() {
      document.getElementById('unreal-details-popup')?.remove();
      document.querySelector('.unreal-overlay-backdrop')?.remove();
    }

    // ═══════════════════════════════════════════════════════════════
    // BACKGROUND COMMUNICATION
    // ═══════════════════════════════════════════════════════════════

    notifyBackground(result) {
      try {
        chrome.runtime.sendMessage({
          type: 'AI_IMAGE_DETECTED',
          data: {
            confidence: result.confidence,
            riskLevel: result.riskLevel,
            aiType: result.aiType,
            url: location.href,
            totalAIImages: this.aiImageCount
          }
        });
      } catch (e) {
        console.warn('[ImageScanner] Could not notify background:', e);
      }
    }

    // ═══════════════════════════════════════════════════════════════
    // CLEANUP
    // ═══════════════════════════════════════════════════════════════

    destroy() {
      console.log('[ImageScanner] Cleaning up...');
      this.isEnabled = false;

      this.mutationObserver?.disconnect();
      this.intersectionObserver?.disconnect();
      if (this.scrollHandler) {
        window.removeEventListener('scroll', this.scrollHandler);
      }
      if (this.gridRescanTimer) clearTimeout(this.gridRescanTimer);
      if (this.gridScrollTimer) clearTimeout(this.gridScrollTimer);

      this.queue = [];
      this.checkedImages.clear();
      this.analysisResults.clear();
      this.processedCardKeys.clear();
      this.queuedCardKeys.clear();
      this.gridOverlayAttached = 0;
      this.gridProcessedSinceLastScan = 0;
      this.gridFinalStateUpdates = 0;
      this.gridRetryCount = 0;
      this.gridAnalyzedCount = 0;
      // Cancel stuck-card timers and reset state machine.
      this.cardStateTimeouts.forEach(t => clearTimeout(t));
      this.cardStateTimeouts.clear();
      this.cardStates.clear();

      // Terminate pipeline
      if (this.pipeline) {
        this.pipeline.terminate();
      }

      // Remove all badges and wrappers
      document.querySelectorAll('.unreal-image-badge').forEach(el => el.remove());
      document.querySelectorAll('.unreal-spinner-overlay').forEach(el => el.remove());

      this.closeDetails();

      console.log('[ImageScanner] Cleanup complete');
    }
  }

  // Create global instance
  let imageScanner = null;

  async function analyzePageImages() {
    const imageAnalysisEnabled = settings.imageAnalysis !== false;

    if (!imageAnalysisEnabled) {
      console.log('[ImageScanner] Image analysis disabled in settings');
      return;
    }

    console.log('[ImageScanner] Starting automatic image detection...');

    try {
      imageScanner = new ImageScanner();
      await imageScanner.init();
    } catch (error) {
      console.error('[ImageScanner] Failed to initialize:', error);
    }
  }

  // Cleanup on page unload
  window.addEventListener('beforeunload', () => {
    imageScanner?.destroy();
    videoScanner?.destroy();
  });
  // ═══════════════════════════════════════════════════════════════
  // VIDEO SCANNER CLASS - Button-triggered Backend Video Analysis
  // ═══════════════════════════════════════════════════════════════

  class VideoScanner {
    constructor() {
      this.checkedVideos = new Set();
      this.analysisResults = new Map();
      this.mutationObserver = null;
      this.isEnabled = true;
      this.backendUrl = 'http://localhost:8000/analyze-video';
      this.minWidth = 200;
      this.minHeight = 150;
      this.minDuration = 2;
    }

    async init() {
      console.log('[VideoScanner] Initializing (button mode)...');
      this.injectStyles();
      this.observeNewVideos();
      this.scanExistingVideos();
      console.log('[VideoScanner] Initialized - click button to analyze videos');
    }

    injectStyles() {
      if (document.getElementById('unreal-video-scanner-styles')) return;
      const style = document.createElement('style');
      style.id = 'unreal-video-scanner-styles';
      style.textContent = `
        /* Analyze button on videos */
        .unreal-video-analyze-btn {
          position: absolute !important;
          top: 8px !important;
          left: 8px !important;
          background: linear-gradient(135deg, #667eea 0%, #764ba2 100%) !important;
          color: white !important;
          padding: 8px 14px !important;
          border-radius: 20px !important;
          font-size: 11px !important;
          font-weight: 600 !important;
          font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif !important;
          z-index: 999999 !important;
          cursor: pointer !important;
          display: flex !important;
          align-items: center !important;
          gap: 6px !important;
          border: none !important;
          box-shadow: 0 2px 8px rgba(0,0,0,0.3) !important;
          transition: transform 0.2s, box-shadow 0.2s !important;
        }
        .unreal-video-analyze-btn:hover {
          transform: scale(1.05) !important;
          box-shadow: 0 4px 12px rgba(0,0,0,0.4) !important;
        }
        .unreal-video-analyze-btn.analyzing {
          background: rgba(0,0,0,0.75) !important;
          pointer-events: none !important;
        }
        .unreal-video-analyze-btn.analyzing::after {
          content: '';
          width: 12px;
          height: 12px;
          border: 2px solid rgba(255,255,255,0.3);
          border-top-color: white;
          border-radius: 50%;
          animation: unreal-vid-spin 0.8s linear infinite;
          margin-left: 6px;
        }
        /* Result badge */
        .unreal-video-badge {
          position: absolute !important;
          top: 8px !important;
          left: 8px !important;
          background: rgba(0,0,0,0.85) !important;
          backdrop-filter: blur(10px) !important;
          color: white !important;
          padding: 6px 10px !important;
          border-radius: 8px !important;
          font-size: 11px !important;
          font-weight: 600 !important;
          z-index: 999999 !important;
          cursor: pointer !important;
          display: flex !important;
          align-items: center !important;
          gap: 6px !important;
          pointer-events: auto !important;
          font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif !important;
        }
        .unreal-video-badge.high-risk { border-left: 3px solid #ef4444 !important; }
        .unreal-video-badge.medium-risk { border-left: 3px solid #f97316 !important; }
        .unreal-video-badge.low-risk { border-left: 3px solid #22c55e !important; }
        @keyframes unreal-vid-spin {
          to { transform: rotate(360deg); }
        }
      `;
      document.head.appendChild(style);
    }

    scanExistingVideos() {
      const videos = document.querySelectorAll('video');
      console.log('[VideoScanner] Found', videos.length, 'videos');
      videos.forEach(v => this.addAnalyzeButton(v));
    }

    observeNewVideos() {
      this.mutationObserver = new MutationObserver((mutations) => {
        for (const m of mutations) {
          for (const node of m.addedNodes) {
            if (node.nodeName === 'VIDEO') this.addAnalyzeButton(node);
            else if (node.querySelectorAll) {
              node.querySelectorAll('video').forEach(v => this.addAnalyzeButton(v));
            }
          }
        }
      });
      this.mutationObserver.observe(document.body, { childList: true, subtree: true });
    }

    addAnalyzeButton(video) {
      if (!this.isEnabled) return;

      const id = video.src || video.currentSrc || '';
      if (!id || this.checkedVideos.has(id)) return;

      // Wait for metadata if not ready
      if (video.readyState < 1) {
        video.addEventListener('loadedmetadata', () => this.addAnalyzeButton(video), { once: true });
        return;
      }

      const w = video.videoWidth || video.clientWidth;
      const h = video.videoHeight || video.clientHeight;
      const d = video.duration || 0;

      if (w < this.minWidth || h < this.minHeight || d < this.minDuration || !isFinite(d)) return;

      this.checkedVideos.add(id);

      // Get video container
      const parent = video.parentElement;
      if (!parent) return;

      // Ensure parent has position
      const computedStyle = getComputedStyle(parent);
      if (computedStyle.position === 'static') {
        parent.style.position = 'relative';
      }

      // Remove existing buttons/badges
      parent.querySelectorAll('.unreal-video-analyze-btn, .unreal-video-badge').forEach(el => el.remove());

      // Create analyze button
      const btn = document.createElement('button');
      btn.className = 'unreal-video-analyze-btn';
      btn.innerHTML = '🔍 <span>Check AI</span>';
      btn.title = 'Click to analyze this video for AI generation';
      btn.onclick = (e) => {
        e.preventDefault();
        e.stopPropagation();
        this.analyzeVideo(video, btn);
      };

      parent.appendChild(btn);
    }

    /**
     * Get the actual downloadable URL for a video
     * For Twitter/X, blob URLs need to be converted to tweet URLs
     */
    getDownloadableUrl(video) {
      const videoUrl = video.src || video.currentSrc || '';

      // If it's a normal HTTP URL, use it directly
      if (videoUrl.startsWith('http://') || videoUrl.startsWith('https://')) {
        return videoUrl;
      }

      // For blob URLs (Twitter/X), try to find the tweet/post URL
      if (videoUrl.startsWith('blob:')) {
        // Method 1: Check current page URL (if on a single tweet)
        const pageUrl = window.location.href;
        if (pageUrl.includes('/status/')) {
          console.log('[VideoScanner] Using page URL for blob video:', pageUrl);
          return pageUrl;
        }

        // Method 2: Find the closest tweet container and get its link
        const article = video.closest('article');
        if (article) {
          // Look for the tweet permalink
          const timeLink = article.querySelector('a[href*="/status/"] time')?.closest('a');
          if (timeLink && timeLink.href) {
            console.log('[VideoScanner] Found tweet URL:', timeLink.href);
            return timeLink.href;
          }

          // Alternative: any link with /status/
          const statusLink = article.querySelector('a[href*="/status/"]');
          if (statusLink && statusLink.href && statusLink.href.includes('/status/')) {
            console.log('[VideoScanner] Found status link:', statusLink.href);
            return statusLink.href;
          }
        }

        // Method 3: For embedded videos, current page might work
        if (pageUrl.includes('twitter.com') || pageUrl.includes('x.com')) {
          console.log('[VideoScanner] Using current page as fallback:', pageUrl);
          return pageUrl;
        }
      }

      return null;
    }

    async analyzeVideo(video, btn) {
      const downloadUrl = this.getDownloadableUrl(video);

      if (!downloadUrl) {
        this.showErrorBadge(video, 'Could not find video URL');
        return;
      }

      console.log('[VideoScanner] Analyzing video via backend:', downloadUrl.substring(0, 80) + '...');

      // Update button to show analyzing state
      btn.classList.add('analyzing');
      btn.innerHTML = '<span>Analyzing...</span>';

      try {
        // Send URL to backend for analysis
        const response = await fetch(this.backendUrl, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ url: downloadUrl, max_duration: 30 })
        });

        if (!response.ok) {
          throw new Error(`Backend error: ${response.status}`);
        }

        const result = await response.json();

        console.log('[VideoScanner] Backend result:', result);

        // Remove button
        btn.remove();

        if (result.success) {
          this.showBadge(video, result);
          this.analysisResults.set(downloadUrl, result);
        } else {
          this.showErrorBadge(video, result.error || 'Analysis failed');
        }

      } catch (error) {
        console.error('[VideoScanner] Backend error:', error);
        btn.classList.remove('analyzing');
        btn.innerHTML = '❌ <span>Error</span>';
        btn.title = error.message;

        // Show error badge after delay
        setTimeout(() => {
          btn.remove();
          this.showErrorBadge(video, error.message || 'Backend unavailable');
        }, 2000);
      }
    }

    showBadge(video, result) {
      const parent = video.parentElement;
      if (!parent) return;

      parent.querySelectorAll('.unreal-video-badge, .unreal-video-analyze-btn').forEach(b => b.remove());

      const computedStyle = getComputedStyle(parent);
      if (computedStyle.position === 'static') {
        parent.style.position = 'relative';
      }

      const { score, confidence, framesAnalyzed, processingTime } = result;

      // Determine risk level based on score
      let riskLevel, icon, label, cls;
      if (score >= 75) {
        riskLevel = 'high';
        icon = '🎬';
        label = `AI Video ${score}%`;
        cls = 'high-risk';
      } else if (score >= 40) {
        riskLevel = 'medium';
        icon = '🎬';
        label = `Maybe AI ${score}%`;
        cls = 'medium-risk';
      } else {
        riskLevel = 'low';
        icon = '✓';
        label = `Real ${score}%`;
        cls = 'low-risk';
      }

      const badge = document.createElement('div');
      badge.className = `unreal-video-badge ${cls}`;
      badge.innerHTML = `<span>${icon}</span><span>${label}</span>`;
      badge.title = `Score: ${score}%\nConfidence: ${confidence}%\nFrames analyzed: ${framesAnalyzed}\nTime: ${processingTime}ms`;

      badge.onclick = (e) => {
        e.stopPropagation();
        e.preventDefault();
        this.showVideoDetails(video, result, riskLevel);
      };

      parent.appendChild(badge);
    }

    showVideoDetails(video, result, riskLevel) {
      // Remove existing popup
      document.getElementById('unreal-details-popup')?.remove();
      document.querySelector('.unreal-overlay-backdrop')?.remove();

      // Create backdrop
      const backdrop = document.createElement('div');
      backdrop.className = 'unreal-overlay-backdrop';
      backdrop.addEventListener('click', () => {
        document.getElementById('unreal-details-popup')?.remove();
        backdrop.remove();
      });
      document.body.appendChild(backdrop);

      // Create popup
      const popup = document.createElement('div');
      popup.className = 'unreal-details-popup';
      popup.id = 'unreal-details-popup';

      // Position popup in center of viewport
      const videoRect = video.getBoundingClientRect();
      let top = videoRect.top;
      let left = videoRect.right + 10;

      if (left + 380 > window.innerWidth) {
        left = videoRect.left - 390;
        if (left < 10) {
          left = (window.innerWidth - 380) / 2;
          top = (window.innerHeight - 500) / 2;
        }
      }
      if (top + 500 > window.innerHeight) top = window.innerHeight - 510;
      if (top < 10) top = 10;
      if (left < 10) left = 10;

      popup.style.top = `${top}px`;
      popup.style.left = `${left}px`;

      const { score, confidence, framesAnalyzed, processingTime, frameScores, cached, audioScore, audioConfidence, audioIndicators, hasAudio } = result;

      const riskText = {
        high: 'High Risk - Likely AI Generated',
        medium: 'Medium Risk - Possibly AI Generated',
        low: 'Low Risk - Likely Authentic'
      };

      const riskIcon = riskLevel === 'high' ? '🔴' : riskLevel === 'medium' ? '🟡' : '🟢';

      // Build frame scores HTML
      let frameScoresHtml = '<p style="color: #6b7280; font-style: italic;">No frame data available</p>';
      if (frameScores && frameScores.length > 0) {
        frameScoresHtml = `<div style="display: flex; flex-wrap: wrap; gap: 6px;">
          ${frameScores.map(f => `
            <span class="unreal-signal-tag" style="font-size: 10px;">
              ${f.time}s: ${f.score}%
            </span>
          `).join('')}
        </div>`;
      }

      // Build audio analysis section HTML
      let audioSectionHtml = '';
      if (hasAudio && audioScore !== null && audioScore !== undefined) {
        const audioRiskClass = audioScore >= 70 ? 'high' : audioScore >= 40 ? 'medium' : 'low';
        const audioIndicatorsHtml = audioIndicators && audioIndicators.length > 0
          ? audioIndicators.map(ind => `<span class="unreal-signal-tag" style="font-size: 10px;">${ind}</span>`).join('')
          : '<span style="color: #6b7280; font-style: italic;">No specific patterns detected</span>';

        audioSectionHtml = `
          <div class="unreal-details-section" style="border-top: 1px solid rgba(255,255,255,0.1); padding-top: 12px; margin-top: 8px;">
            <div class="unreal-details-label">🔊 Audio Analysis</div>
            <div class="unreal-details-value">
              <div style="margin-bottom: 8px;">
                <strong style="font-size: 18px;">${audioScore}</strong>/100 AI Voice Score
                <span style="opacity: 0.7; margin-left: 8px;">(${audioConfidence}% confidence)</span>
              </div>
              <div class="unreal-confidence-bar" style="height: 6px;">
                <div class="unreal-confidence-fill ${audioRiskClass}" style="width: ${audioScore}%;"></div>
              </div>
            </div>
          </div>
          <div class="unreal-details-section">
            <div class="unreal-details-label">Voice Indicators</div>
            <div class="unreal-details-value" style="display: flex; flex-wrap: wrap; gap: 6px;">
              ${audioIndicatorsHtml}
            </div>
          </div>
        `;
      } else {
        audioSectionHtml = `
          <div class="unreal-details-section" style="border-top: 1px solid rgba(255,255,255,0.1); padding-top: 12px; margin-top: 8px;">
            <div class="unreal-details-label">🔊 Audio Analysis</div>
            <div class="unreal-details-value" style="color: #6b7280; font-style: italic;">
              No audio track detected or audio service unavailable
            </div>
          </div>
        `;
      }

      popup.innerHTML = `
        <div class="unreal-details-header ${riskLevel}-risk">
          <span style="font-size: 24px;">${riskIcon}</span>
          <h3 class="unreal-details-title">${riskText[riskLevel]}</h3>
          <button class="unreal-details-close" onclick="document.getElementById('unreal-details-popup')?.remove(); document.querySelector('.unreal-overlay-backdrop')?.remove();">×</button>
        </div>
        
        <div class="unreal-details-content">
          <div class="unreal-details-section">
            <div class="unreal-details-label">Combined AI Score</div>
            <div class="unreal-details-value">
              <strong style="font-size: 24px;">${score}</strong>/100
              <div class="unreal-confidence-bar">
                <div class="unreal-confidence-fill ${riskLevel}" style="width: ${score}%;"></div>
              </div>
            </div>
          </div>

          <div class="unreal-details-section">
            <div class="unreal-details-label">Confidence</div>
            <div class="unreal-details-value">${confidence}%</div>
          </div>

          <div class="unreal-details-section">
            <div class="unreal-details-label">Analysis Details</div>
            <div class="unreal-details-value">
              <div style="display: flex; gap: 12px; flex-wrap: wrap;">
                <span class="unreal-source-tag">🎞️ ${framesAnalyzed} frames</span>
                <span class="unreal-source-tag">⏱️ ${processingTime}ms</span>
                ${cached ? '<span class="unreal-source-tag">💾 Cached</span>' : ''}
                ${hasAudio ? '<span class="unreal-source-tag">🔊 Audio Analyzed</span>' : ''}
              </div>
            </div>
          </div>

          <div class="unreal-details-section">
            <div class="unreal-details-label">Frame-by-Frame Scores</div>
            <div class="unreal-details-value">${frameScoresHtml}</div>
          </div>

          ${audioSectionHtml}

          <div class="unreal-details-section">
            <div class="unreal-details-label">Detection Methods</div>
            <div class="unreal-sources-list">
              <span class="unreal-source-tag">ML Backend</span>
              <span class="unreal-source-tag">Frame Extraction</span>
              <span class="unreal-source-tag">Video Analysis</span>
              ${hasAudio ? '<span class="unreal-source-tag">Audio Spectral Analysis</span>' : ''}
            </div>
          </div>
        </div>

        <button class="unreal-dismiss-btn" onclick="document.getElementById('unreal-details-popup')?.remove(); document.querySelector('.unreal-overlay-backdrop')?.remove();">
          Dismiss
        </button>
      `;

      document.body.appendChild(popup);
    }

    showErrorBadge(video, errorMsg = 'Error') {
      const parent = video.parentElement;
      if (!parent) return;

      const computedStyle = getComputedStyle(parent);
      if (computedStyle.position === 'static') {
        parent.style.position = 'relative';
      }

      parent.querySelectorAll('.unreal-video-badge, .unreal-video-analyze-btn').forEach(b => b.remove());

      const badge = document.createElement('div');
      badge.className = 'unreal-video-badge';
      badge.style.borderLeft = '3px solid #6b7280';
      badge.innerHTML = '<span>⚠️</span><span>Error</span>';
      badge.title = errorMsg;
      badge.onclick = () => alert(`Video Analysis Error\n\n${errorMsg}`);
      parent.appendChild(badge);
    }

    destroy() {
      this.mutationObserver?.disconnect();
      document.querySelectorAll('.unreal-video-badge, .unreal-video-analyze-btn').forEach(el => el.remove());
      console.log('[VideoScanner] Destroyed');
    }
  }

  let videoScanner = null;

  async function analyzePageVideos() {
    const enabled = settings.imageAnalysis !== false;
    if (!enabled) { console.log('[VideoScanner] Disabled'); return; }
    console.log('[VideoScanner] Starting...');
    try {
      videoScanner = new VideoScanner();
      await videoScanner.init();
    } catch (e) { console.error('[VideoScanner] Init failed:', e); }
  }


  // ═══════════════════════════════════════════════════════════════
  // FLOATING BADGE
  // ═══════════════════════════════════════════════════════════════


  let badgeContainer = null;

  function createFloatingBadge() {
    if (badgeContainer) return;

    badgeContainer = document.createElement('div');
    badgeContainer.id = 'sharesafe-floating-badge';
    badgeContainer.style.cssText = `
      position: fixed;
      bottom: 20px;
      right: 20px;
      background: white;
      border-radius: 50%;
      width: 56px;
      height: 56px;
      box-shadow: 0 4px 20px rgba(0,0,0,0.15);
      display: flex;
      align-items: center;
      justify-content: center;
      cursor: pointer;
      z-index: 999999;
      transition: all 0.3s ease;
    `;

    badgeContainer.innerHTML = `
      <svg viewBox="0 0 24 24" fill="none" stroke="#4f46e5" stroke-width="2" style="width: 28px; height: 28px;">
        <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/>
        <path d="M9 12l2 2 4-4"/>
      </svg>
    `;

    badgeContainer.addEventListener('mouseenter', () => {
      badgeContainer.style.transform = 'scale(1.1)';
      badgeContainer.style.boxShadow = '0 6px 25px rgba(0,0,0,0.2)';
    });

    badgeContainer.addEventListener('mouseleave', () => {
      badgeContainer.style.transform = 'scale(1)';
      badgeContainer.style.boxShadow = '0 4px 20px rgba(0,0,0,0.15)';
    });

    document.body.appendChild(badgeContainer);
  }

  function updateFloatingBadge(analysis) {
    if (!badgeContainer) createFloatingBadge();

    const { pageScore, riskLevel, highRiskCount } = analysis;

    // Update badge color based on risk
    let color = '#22c55e'; // Low
    if (riskLevel === 'high') color = '#ef4444';
    else if (riskLevel === 'medium') color = '#f97316';

    badgeContainer.style.border = `3px solid ${color}`;

    // Add counter if high risk segments found
    if (highRiskCount > 0) {
      let counter = badgeContainer.querySelector('.risk-counter');
      if (!counter) {
        counter = document.createElement('div');
        counter.className = 'risk-counter';
        counter.style.cssText = `
          position: absolute;
          top: -6px;
          right: -6px;
          background: #ef4444;
          color: white;
          border-radius: 50%;
          width: 22px;
          height: 22px;
          display: flex;
          align-items: center;
          justify-content: center;
          font-size: 11px;
          font-weight: 700;
          font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
          box-shadow: 0 2px 8px rgba(239, 68, 68, 0.4);
        `;
        badgeContainer.appendChild(counter);
      }
      counter.textContent = highRiskCount;
    }

    // Update title
    badgeContainer.title = `ShareSafe: ${analysis.summary}\nPage Score: ${pageScore}/100`;
  }

  // ═══════════════════════════════════════════════════════════════
  // INITIALIZATION
  // ═══════════════════════════════════════════════════════════════

  function init() {
    // Initialize text detection first
    initTextDetection();

    // Floating badge disabled - use popup instead
    // createFloatingBadge();

    // Run analysis after short delay to let page settle
    setTimeout(async () => {
      await analyzePageWithSegments();

      // Run fake news analysis in parallel with other analyses
      if (fakeNewsDetectionEnabled) {
        setTimeout(async () => {
          await analyzePageForFakeNews();
        }, 500); // Start fake news analysis 500ms after segment analysis
      }

      // Run image analysis after text analysis
      setTimeout(() => {
        analyzePageImages();

        // Run video analysis after image analysis
        setTimeout(() => {
          analyzePageVideos();
        }, 2000);
      }, 1000);
    }, 1000);
  }


  // Wait for DOM ready
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

})();