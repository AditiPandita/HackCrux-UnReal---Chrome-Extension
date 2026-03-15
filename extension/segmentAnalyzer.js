// ShareSafe - Segment Extraction & Scoring Module
// Splits content into logical segments and analyzes each independently

import { analyzeTextStatistics } from './statisticalAnalyzer.js';

const MIN_SEGMENT_WORDS_DEFAULT = 14;
const MAX_SEGMENT_WORDS_DEFAULT = 500;
const MIN_SEGMENT_CHARS_DEFAULT = 55;

let textBackendAvailabilityCache = {
  checkedAt: 0,
  available: null
};

function normalizeSegmentText(text) {
  return (text || '')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .replace(/[^\w\s]/g, '')
    .trim();
}

function cleanSegmentText(text) {
  return (text || '').replace(/\s+/g, ' ').trim();
}

function incrementCounter(map, key) {
  map[key] = (map[key] || 0) + 1;
}

function isElementVisible(element) {
  if (!element) return false;
  const style = window.getComputedStyle(element);
  if (element.offsetParent === null && style.position !== 'fixed') return false;
  return style.display !== 'none' && style.visibility !== 'hidden' && style.opacity !== '0';
}

function getMainContentRoot(rootElement = document.body) {
  const contentSelectors = [
    'article',
    'main',
    '[role="main"]',
    '.post-content',
    '.article-content',
    '.entry-content',
    '.content',
    '#content'
  ];

  for (const selector of contentSelectors) {
    const candidate = rootElement.querySelector(selector);
    if (candidate && countWords(candidate.innerText || '') > 120) {
      return candidate;
    }
  }

  return rootElement;
}

async function checkTextBackendAvailability() {
  const now = Date.now();
  if (textBackendAvailabilityCache.available !== null && (now - textBackendAvailabilityCache.checkedAt) < 20000) {
    return textBackendAvailabilityCache.available;
  }

  const probeText = 'This is a backend health-check probe sentence used by ShareSafe text analysis module to validate text detection connectivity.';

  try {
    const response = await chrome.runtime.sendMessage({
      type: 'TEXT_BACKEND_REQUEST',
      text: probeText
    });

    const available = Boolean(response && response.success && response.data && response.data.ai_score !== undefined);
    textBackendAvailabilityCache = { checkedAt: now, available };
    return available;
  } catch (error) {
    textBackendAvailabilityCache = { checkedAt: now, available: false };
    return false;
  }
}

async function callTextBackend(text, context = 'segment') {
  const payloadText = text || '';
  console.log(`[TextPipeline] Sending backend payload (${context}) length: ${payloadText.length}`);

  try {
    const response = await chrome.runtime.sendMessage({
      type: 'TEXT_BACKEND_REQUEST',
      text: payloadText
    });

    if (response && response.success && response.data && response.data.ai_score !== undefined) {
      console.log('[TextPipeline] Backend response payload:', {
        context,
        ai_score: response.data.ai_score,
        confidence: response.data.confidence,
        note: response.data.note,
        method: response.data.method
      });
      return response.data;
    }

    console.warn('[TextPipeline] Backend response missing data:', { context, response });
    return null;
  } catch (error) {
    console.warn('[TextPipeline] Backend request failed:', context, error?.message || error);
    return null;
  }
}

function toUserFacingReason(reason) {
  const lower = (reason || '').toLowerCase();

  if (lower.includes('predictable')) return 'Predictable word patterns';
  if (lower.includes('regular grammatical') || lower.includes('grammar')) return 'Overly regular grammatical structure';
  if (lower.includes('lexical') || lower.includes('limited vocabulary')) return 'Low lexical diversity';
  if (lower.includes('repetitive') || lower.includes('repetition')) return 'Repetitive phrasing';
  if (lower.includes('self-identification') || lower.includes('explicitly marked') || lower.includes('tool authorship') || lower.includes('ai tool mentioned')) {
    return 'Explicit AI marker detected';
  }
  if (lower.includes('transition') || lower.includes('connectors') || lower.includes('formal') || lower.includes('ai cliche')) {
    return 'Formal transition-heavy writing';
  }

  return (reason || '')
    .replace(/^\[[^\]]+\]\s*/, '')
    .replace(/\(\d+×\)/, '')
    .trim();
}

function buildReasonList(stats, patterns, mlResult) {
  const rawReasons = [
    ...(Array.isArray(mlResult?.explanations) ? mlResult.explanations : []),
    ...(Array.isArray(patterns?.reasons) ? patterns.reasons : []),
    ...(Array.isArray(stats?.reasons) ? stats.reasons : [])
  ].filter(Boolean);

  const dedup = [];
  const seen = new Set();

  rawReasons.forEach((reason) => {
    const normalized = toUserFacingReason(reason);
    if (!normalized) return;
    const key = normalized.toLowerCase();
    if (seen.has(key)) return;
    seen.add(key);
    dedup.push(normalized);
  });

  if (dedup.length === 0) {
    dedup.push('Overly regular grammatical structure');
  }

  return dedup.slice(0, 5);
}

// ═══════════════════════════════════════════════════════════════
// SEGMENT EXTRACTION
// ═══════════════════════════════════════════════════════════════

/**
 * Extract logical text segments from a document
 * Returns: paragraphs, headings+body blocks, list items
 */
export function extractSegments(rootElement = document.body) {
  const segments = [];
  let segmentId = 0;
  const contentRoot = getMainContentRoot(rootElement);
  const seenSegmentKeys = new Set();
  const seenElements = new Set();

  const debug = {
    totalCandidates: 0,
    validSegments: 0,
    skipped: {}
  };

  // Include article text + search-result snippets/headings to avoid over-filtering.
  const candidateSelectors = [
    'p',
    'blockquote',
    'li',
    'h2',
    'h3',
    '.VwiC3b',
    '.BNeawe',
    '[class*="snippet"]',
    '[class*="description"]',
    '[class*="result"] p'
  ];

  const candidates = [];
  candidateSelectors.forEach((selector) => {
    contentRoot.querySelectorAll(selector).forEach((el) => {
      if (seenElements.has(el)) return;
      seenElements.add(el);
      candidates.push(el);
    });
  });

  debug.totalCandidates = candidates.length;

  candidates.forEach((element) => {
    if (!isElementVisible(element)) {
      incrementCounter(debug.skipped, 'not_visible');
      return;
    }
    if (isNavigationElement(element)) {
      incrementCounter(debug.skipped, 'nav_or_ui');
      return;
    }

    let rawText = cleanSegmentText(element.innerText || '');
    let wordCount = countWords(rawText);

    // For short headings, append nearby description/snippet text.
    if (/^H[1-3]$/.test(element.tagName || '') && wordCount < 18) {
      const siblingTexts = [];
      let sibling = element.nextElementSibling;
      let hops = 0;
      while (sibling && hops < 2) {
        if (!isNavigationElement(sibling)) {
          const siblingText = cleanSegmentText(sibling.innerText || '');
          if (countWords(siblingText) >= 8) {
            siblingTexts.push(siblingText);
          }
        }
        sibling = sibling.nextElementSibling;
        hops += 1;
      }
      if (siblingTexts.length > 0) {
        rawText = cleanSegmentText(`${rawText} ${siblingTexts.join(' ')}`);
        wordCount = countWords(rawText);
      }
    }

    if (wordCount < 8) {
      incrementCounter(debug.skipped, 'too_short_words');
      return;
    }
    if (wordCount > MAX_SEGMENT_WORDS_DEFAULT) {
      incrementCounter(debug.skipped, 'too_long_words');
      return;
    }
    if (rawText.length < MIN_SEGMENT_CHARS_DEFAULT) {
      incrementCounter(debug.skipped, 'too_short_chars');
      return;
    }
    if (!/[a-zA-Z]{3,}/.test(rawText)) {
      incrementCounter(debug.skipped, 'non_linguistic');
      return;
    }

    const dedupeKey = normalizeSegmentText(rawText).slice(0, 260);
    if (!dedupeKey) {
      incrementCounter(debug.skipped, 'empty_after_normalization');
      return;
    }
    if (seenSegmentKeys.has(dedupeKey)) {
      incrementCounter(debug.skipped, 'duplicate');
      return;
    }
    seenSegmentKeys.add(dedupeKey);

    const tag = (element.tagName || '').toLowerCase();
    const type = tag === 'blockquote' ? 'blockquote' :
      tag === 'li' ? 'list-item' :
        tag === 'h2' || tag === 'h3' ? 'heading-snippet' :
          'paragraph';

    segments.push({
      id: segmentId++,
      type,
      text: rawText.slice(0, 2500),
      fullText: rawText,
      element,
      wordCount
    });
    debug.validSegments += 1;
  });

  // Sort by DOM position
  segments.sort((a, b) => {
    if (a.element && b.element) {
      return a.element.compareDocumentPosition(b.element) & Node.DOCUMENT_POSITION_FOLLOWING ? -1 : 1;
    }
    return 0;
  });
  
  // Re-assign sequential IDs after sorting
  segments.forEach((seg, idx) => seg.id = idx);

  const concatenatedText = segments.map((s) => s.fullText).join(' ');
  console.log('[TextExtraction] total candidate elements found:', debug.totalCandidates);
  console.log('[TextExtraction] total valid segments kept:', segments.length);
  console.log('[TextExtraction] skipped segments by reason:', debug.skipped);
  console.log('[TextExtraction] final concatenated text length:', concatenatedText.length);
  
  return segments;
}

/**
 * Check if element is navigation/UI (not content)
 */
function isNavigationElement(element) {
  if (!element) return true;

  const blockedSelectors = [
    'nav',
    'header',
    'footer',
    'aside',
    'form',
    'button',
    'label',
    'select',
    'option',
    '.menu',
    '.navigation',
    '.sidebar',
    '.toolbar',
    '.comments',
    '.comment',
    '.cookie',
    '.consent',
    '.promo',
    '.advert',
    '.ads',
    '[role="navigation"]',
    '[role="banner"]',
    '[role="menu"]',
    '[role="complementary"]',
    '[role="contentinfo"]'
  ];
  
  for (const selector of blockedSelectors) {
    if (element.matches?.(selector) || element.closest?.(selector)) {
      return true;
    }
  }
  
  // Check aria roles
  const role = element.getAttribute?.('role');
  if (['navigation', 'banner', 'complementary', 'contentinfo'].includes(role)) {
    return true;
  }
  
  return false;
}

function countWords(text) {
  return text.split(/\s+/).filter(w => w.length > 0).length;
}

// ═══════════════════════════════════════════════════════════════
// SEGMENT SCORING
// ═══════════════════════════════════════════════════════════════

/**
 * Analyze a single segment for AI-generated characteristics
 */
export async function scoreSegment(segment, options = {}) {
  const {
    useLLMTiebreaker = false,
    backendAvailable = true
  } = options;
  const text = segment.fullText || segment.text;
  
  // 1) Statistical analysis
  const stats = analyzeTextStatistics(text);

  // 2) Pattern-based analysis
  const patterns = detectAIPatterns(text);

  // 3) ML backend (primary signal when available)
  const mlResult = backendAvailable ? await callTextBackend(text, `segment-${segment.id}`) : null;

  // Combine scores with conservative calibration
  const statScore = stats.score;
  const patternScore = patterns.score;
  const supportScore = (patternScore * 0.6) + (statScore * 0.4);

  let finalScore = 0;
  let confidence = Math.round(stats.confidence);
  let method = 'statistical+pattern';
  let methodLabel = 'Statistical + Pattern Analysis';

  if (mlResult && mlResult.ai_score !== undefined) {
    // Keep ML as primary driver so score distribution stays calibrated.
    const baseAi = Number(mlResult.ai_score) || 0;
    finalScore = (baseAi * 0.85) + (supportScore * 0.15);
    confidence = Number(mlResult.confidence || confidence);
    method = 'ml+pattern';
    methodLabel = 'ML + Pattern Analysis';
  } else {
    // Graceful fallback when backend is unavailable.
    finalScore = (statScore * 0.55) + (patternScore * 0.45);
  }

  if (patterns.hasStrongSignal && finalScore < 65) {
    finalScore = 65;
  }

  finalScore = Math.max(0, Math.min(100, finalScore));

  let reasons = buildReasonList(stats, patterns, mlResult);
  
  let llmUsed = false;
  
  // ─── LLM TIE-BREAKER (Only for uncertain fallback cases) ───
  if (useLLMTiebreaker && finalScore >= 25 && finalScore <= 75) {
    try {
      // Call background script for LLM analysis
      const llmResult = await new Promise((resolve) => {
        chrome.runtime.sendMessage({
          type: 'ANALYZE_SEGMENT_LLM',
          text: text.slice(0, 1000), // Limit to 1000 chars
          statScore: finalScore
        }, (response) => {
          if (chrome.runtime.lastError || !response) {
            resolve(null);
          } else {
            resolve(response);
          }
        });
      });
      
      if (llmResult && method !== 'ml+pattern') {
        // Blend statistical and LLM results
        // 60% statistical, 40% LLM (statistical is more reliable)
        finalScore = (finalScore * 0.6) + (llmResult.score * 0.4);
        
        // Add LLM reasons
        if (llmResult.reasons && llmResult.reasons.length > 0) {
          reasons = [...reasons, ...llmResult.reasons.map(r => `🤖 ${r}`)];
        }
        
        llmUsed = true;
        console.log('ShareSafe: LLM tie-breaker used for segment', segment.id, '→', llmResult.score);
      }
    } catch (error) {
      console.error('ShareSafe: LLM tie-breaker failed', error);
    }
  }
  
  // Determine risk level
  let riskLevel = 'low';
  if (finalScore >= 60) riskLevel = 'high';
  else if (finalScore >= 35) riskLevel = 'medium';
  
  return {
    segmentId: segment.id,
    score: Math.round(finalScore),
    mlScore: mlResult && mlResult.ai_score !== undefined ? Math.round(mlResult.ai_score) : null,
    statScore: Math.round(statScore),
    patternScore: Math.round(patternScore),
    confidence: Math.max(10, Math.min(100, Math.round(confidence))),
    riskLevel,
    reasons: reasons.slice(0, 5), // Top 5 reasons
    method,
    methodLabel,
    statistics: stats,
    patterns,
    mlDetails: mlResult,
    wordCount: segment.wordCount,
    type: segment.type,
    shouldReview: finalScore >= 35 || patterns.hasStrongSignal,
    llmUsed // Track if LLM was used
  };
}

/**
 * Detect AI patterns using keyword/phrase analysis
 */
function detectAIPatterns(text) {
  const lower = text.toLowerCase();
  const reasons = [];
  let score = 0;
  let hasStrongSignal = false;
  
  // ─── Direct AI Mentions ───
  if (/\b(ai[- ]generated|generated by ai|created (by|with) ai|made (by|with) ai)\b/i.test(text)) {
    reasons.push('[AI] Explicitly marked as AI-generated');
    score += 90;
    hasStrongSignal = true;
  }
  
  if (/\b(chatgpt|gpt-?[34]|gpt-?4o?|claude|gemini|copilot|dall[- ]?e|midjourney|stable diffusion)\b/i.test(text)) {
    reasons.push('[AI] AI tool mentioned');
    score += 70;
    hasStrongSignal = true;
  }
  
  if (/\b(chatgpt|gpt-4|claude|gemini|copilot) (generated|created|wrote|made|produced)\b/i.test(text)) {
    reasons.push('[AI] Tool authorship indicated');
    score += 85;
    hasStrongSignal = true;
  }
  
  // ─── Common AI Phrases ───
  const aiPhrases = [
    { pattern: /\b(it'?s worth noting|it'?s important to note)\b/gi, score: 0, count: true, threshold: 2, scoreMulti: 8, msg: '[Style] Common AI transitional phrase' },
    { pattern: /\b(as an ai|as a language model|i don'?t have personal)\b/i, score: 95, msg: '[AI] Self-identification', strong: true },
    { pattern: /\b(in (conclusion|summary|today'?s|this))\b/gi, score: 0, count: true, threshold: 3, scoreMulti: 6, msg: '[Style] Formulaic transitions' },
    { pattern: /\b(delve|leverage|utilize|facilitate|enhance|optimize)\b/gi, score: 0, count: true, threshold: 4, scoreMulti: 8, msg: '[Vocab] Overuse of formal vocabulary' },
    { pattern: /\b(comprehensive|holistic|robust|seamless|cutting[- ]edge)\b/gi, score: 0, count: true, threshold: 3, scoreMulti: 6, msg: '[Vocab] Corporate jargon' },
    { pattern: /\b(it is (important|crucial|essential|vital) to (note|understand|remember))\b/gi, score: 0, count: true, threshold: 2, scoreMulti: 10, msg: '[Style] AI emphasis pattern' },
    { pattern: /\b(moreover|furthermore|additionally|consequently|therefore)\b/gi, score: 0, count: true, threshold: 4, scoreMulti: 10, msg: '[Style] Excessive formal connectors' },
    { pattern: /\b(can be (seen|viewed|considered|understood) as)\b/gi, score: 0, count: true, threshold: 2, scoreMulti: 8, msg: '[Style] Hedging language' },
    { pattern: /\b(range of|variety of|number of|series of)\b/gi, score: 0, count: true, threshold: 3, scoreMulti: 6, msg: '[Style] Generic quantifiers' },
    { pattern: /\b(plays a (crucial|vital|key|important|significant) role)\b/gi, score: 0, count: true, threshold: 2, scoreMulti: 10, msg: '[Style] AI cliche phrase' }
  ];
  
  aiPhrases.forEach(({ pattern, score: patternScore, msg, strong, count, threshold, scoreMulti }) => {
    if (count) {
      const matches = text.match(pattern);
      if (matches && matches.length >= threshold) {
        reasons.push(`${msg} (${matches.length}×)`);
        score += scoreMulti * Math.min(matches.length, 5);
      }
    } else {
      if (pattern.test(text)) {
        reasons.push(msg);
        score += patternScore;
        if (strong) hasStrongSignal = true;
      }
    }
  });
  
  // ─── Structure Patterns ───
  const sentences = text.split(/[.!?]+/).filter(s => s.trim().length > 0);
  
  // Check for overly balanced structure (multiple sentences starting same way)
  if (sentences.length >= 3) {
    const firstWords = sentences.map(s => s.trim().split(/\s+/)[0]?.toLowerCase());
    const uniqueStarts = new Set(firstWords);
    if (uniqueStarts.size < sentences.length * 0.6) {
      reasons.push('Repetitive sentence beginnings');
      score += 10;
    }
  }
  
  // Check for numbered lists in paragraphs (AI loves numbered lists)
  const numberedPoints = text.match(/\b\d+\.\s+[A-Z]/g);
  if (numberedPoints && numberedPoints.length >= 3) {
    reasons.push('Structured list format');
    score += 8;
  }
  
  // ─── Tone Indicators ───
  // AI tends to be overly neutral and balanced
  const emotionalWords = text.match(/\b(love|hate|amazing|terrible|angry|happy|sad|excited)\b/gi);
  const emotionalRatio = emotionalWords ? emotionalWords.length / countWords(text) : 0;
  
  if (emotionalRatio < 0.01 && countWords(text) > 50) {
    reasons.push('Unusually neutral tone');
    score += 12;
  }
  
  return {
    score: Math.min(100, score),
    reasons,
    hasStrongSignal
  };
}

// ═══════════════════════════════════════════════════════════════
// PAGE-LEVEL AGGREGATION
// ═══════════════════════════════════════════════════════════════

/**
 * Aggregate segment scores into page-level score
 */
export function aggregatePageScore(segmentScores) {
  if (segmentScores.length === 0) {
    return {
      pageScore: 0,
      confidence: 0,
      riskLevel: 'low',
      summary: 'No content to analyze',
      segmentCount: 0,
      highRiskSegments: [],
      reasons: []
    };
  }
  
  // Weighted average based on word count and confidence
  let totalWeight = 0;
  let weightedSum = 0;
  
  segmentScores.forEach(seg => {
    // Weight by word count (longer segments are more reliable)
    const lengthWeight = Math.min(seg.wordCount / 100, 1.0);
    // Weight by confidence
    const confidenceWeight = seg.confidence / 100;
    // Combined weight
    const weight = lengthWeight * confidenceWeight;
    
    weightedSum += seg.score * weight;
    totalWeight += weight;
  });

  const averageScore = segmentScores.reduce((sum, s) => sum + s.score, 0) / segmentScores.length;
  const pageScore = totalWeight > 0 ? weightedSum / totalWeight : averageScore;
  
  // Calculate overall confidence
  const avgConfidence = segmentScores.reduce((sum, s) => sum + s.confidence, 0) / segmentScores.length;
  
  // Determine risk level
  let riskLevel = 'low';
  if (pageScore >= 60) riskLevel = 'high';
  else if (pageScore >= 35) riskLevel = 'medium';
  
  // Find high-risk segments
  const highRiskSegments = segmentScores
    .filter(s => s.score >= 50)
    .sort((a, b) => b.score - a.score)
    .slice(0, 10);
  
  // Collect top reasons across all segments
  const allReasons = {};
  segmentScores.forEach(seg => {
    seg.reasons.forEach(reason => {
      allReasons[reason] = (allReasons[reason] || 0) + 1;
    });
  });
  
  const topReasons = Object.entries(allReasons)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5)
    .map(([reason, count]) => count > 1 ? `${reason} (${count} segments)` : reason);
  
  // Generate summary
  const highRiskCount = segmentScores.filter(s => s.riskLevel === 'high').length;
  const mediumRiskCount = segmentScores.filter(s => s.riskLevel === 'medium').length;
  
  let summary = '';
  if (highRiskCount > 0) {
    summary = `Found ${highRiskCount} segment${highRiskCount > 1 ? 's' : ''} with high AI likelihood`;
  } else if (mediumRiskCount > 0) {
    summary = `Found ${mediumRiskCount} segment${mediumRiskCount > 1 ? 's' : ''} with moderate AI likelihood`;
  } else {
    summary = 'Content appears mostly human-written';
  }

  console.log('[Overview] score computation inputs:', {
    segmentCount: segmentScores.length,
    weightedSum: Number(weightedSum.toFixed(2)),
    totalWeight: Number(totalWeight.toFixed(4)),
    averageScore: Number(averageScore.toFixed(2)),
    pageScore: Number(pageScore.toFixed(2)),
    highRiskCount,
    mediumRiskCount
  });
  
  return {
    pageScore: Math.round(pageScore),
    confidence: Math.round(avgConfidence),
    riskLevel,
    summary,
    segmentCount: segmentScores.length,
    highRiskCount,
    mediumRiskCount,
    lowRiskCount: segmentScores.length - highRiskCount - mediumRiskCount,
    highRiskSegments,
    reasons: topReasons,
    distribution: {
      high: highRiskCount,
      medium: mediumRiskCount,
      low: segmentScores.length - highRiskCount - mediumRiskCount
    }
  };
}

// ═══════════════════════════════════════════════════════════════
// MAIN ANALYSIS PIPELINE
// ═══════════════════════════════════════════════════════════════

/**
 * Complete segment-based analysis of a page
 */
export async function analyzePageSegments(rootElement = document.body, options = {}) {
  const {
    minWordCount = MIN_SEGMENT_WORDS_DEFAULT,
    maxSegments = 50,
    skipTypes = [],
    useLLMTiebreaker = false
  } = options;
  
  // Extract segments
  const segments = extractSegments(rootElement);
  
  console.log(`ShareSafe: Extracted ${segments.length} segments`);
  
  // Filter segments
  const validSegments = segments
    .filter(seg => seg.wordCount >= minWordCount)
    .filter(seg => !skipTypes.includes(seg.type))
    .slice(0, maxSegments);

  console.log('[TextPipeline] valid segments kept after filter:', validSegments.length);
  if (validSegments.length > 0) {
    const validCombinedText = validSegments.map((s) => s.fullText).join(' ');
    console.log('[TextPipeline] final concatenated text length (valid segments):', validCombinedText.length);
  }

  let scoringSegments = validSegments;
  if (scoringSegments.length === 0 && segments.length > 0) {
    const snippetPool = segments
      .filter((seg) => seg.wordCount >= 8)
      .slice(0, 12);

    const combinedText = snippetPool.map((s) => s.fullText).join(' ');
    const combinedWords = countWords(combinedText);

    console.log('[TextPipeline] No segment passed minWordCount; combining snippets fallback:', {
      snippetsUsed: snippetPool.length,
      combinedWords,
      combinedLength: combinedText.length
    });

    if (snippetPool.length > 0 && combinedWords >= 18) {
      scoringSegments = [{
        id: 'combined-snippets',
        type: 'combined-snippets',
        text: combinedText.slice(0, 7000),
        fullText: combinedText.slice(0, 7000),
        element: null,
        wordCount: countWords(combinedText.slice(0, 7000))
      }];
    }
  }
  
  const backendAvailable = await checkTextBackendAvailability();
  console.log(`[TextPipeline] Backend ${backendAvailable ? 'available' : 'unavailable'} for segment scoring`);
  console.log(`ShareSafe: Analyzing ${scoringSegments.length} valid segments (LLM tie-breaker: ${useLLMTiebreaker})`);
  
  // Score each segment (async now because of LLM tie-breaker)
  const segmentScores = await Promise.all(
    scoringSegments.map(async seg => {
      const score = await scoreSegment(seg, { useLLMTiebreaker, backendAvailable });
      console.log(
        `[TextPipeline] Segment #${seg.id} (${seg.type}) -> ${score.score}/100 (${score.riskLevel}) via ${score.methodLabel}`,
        score.reasons
      );
      return {
        ...score,
        segment: seg // Keep reference to original segment
      };
    })
  );
  
  // Count LLM usage
  const llmUsedCount = segmentScores.filter(s => s.llmUsed).length;
  if (llmUsedCount > 0) {
    console.log(`ShareSafe: LLM tie-breaker used for ${llmUsedCount} uncertain segments`);
  }
  
  // Aggregate to page level
  const pageAnalysis = aggregatePageScore(segmentScores);
  
  return {
    ...pageAnalysis,
    segments: segmentScores,
    llmUsedCount
  };
}
