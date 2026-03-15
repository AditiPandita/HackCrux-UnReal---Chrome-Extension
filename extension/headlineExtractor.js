/**
 * ShareSafe - Headline Extractor Module
 * Extracts potential headlines, claims, and newsworthy statements for fact-checking
 * 
 * Features:
 * - News headline detection
 * - Factual claim extraction  
 * - Quote identification
 * - Breaking news indicators
 * - Statistical claim detection
 */

// ═══════════════════════════════════════════════════════════════════════════════
// HEADLINE DETECTION PATTERNS
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Patterns to identify potential headlines and newsworthy claims
 */
export const HEADLINE_PATTERNS = {
    
    // Headlines with news indicators
    newsHeadlines: [
        {
            pattern: /^(BREAKING|URGENT|UPDATE|EXCLUSIVE|REPORT):\s*(.{20,150})/im,
            weight: 0.95,
            type: 'breaking_news',
            extractGroup: 2
        },
        {
            pattern: /^(.{20,150})\s*-\s*(Reuters|AP|BBC|CNN|Fox|NBC|CBS|ABC)/im,
            weight: 0.9,
            type: 'news_headline',
            extractGroup: 1
        },
        {
            pattern: /^\s*["""](.{20,150})["""]\s*$/m,
            weight: 0.7,
            type: 'quoted_statement',
            extractGroup: 1
        }
    ],

    // Claims with factual assertions
    factualClaims: [
        {
            pattern: /(\w+(?:\s+\w+)*)\s+(said|claims?|states?|announces?|reports?|confirms?|denies?|admits?)\s+(.{10,200})/gi,
            weight: 0.8,
            type: 'attributed_claim',
            extractGroup: 3
        },
        {
            pattern: /(study|research|report|survey|poll)\s+(shows?|finds?|reveals?|indicates?|suggests?)\s+(.{15,200})/gi,
            weight: 0.85,
            type: 'research_claim',
            extractGroup: 3
        },
        {
            pattern: /(\d+(?:,\d{3})*(?:\.\d+)?)\s*(percent|%|people|cases|deaths|infections|dollars?|million|billion)\s+(.{10,150})/gi,
            weight: 0.75,
            type: 'statistical_claim'
        }
    ],

    // Event-based claims
    eventClaims: [
        {
            pattern: /(?:happened|occurred|took place|broke out|began|started|ended)\s+(?:in|at|on|during)\s+(.{5,100})/gi,
            weight: 0.7,
            type: 'event_claim'
        },
        {
            pattern: /(yesterday|today|this week|last week|recently|earlier)\s+(.{20,200})/gi,
            weight: 0.6,
            type: 'recent_event',
            extractGroup: 2
        }
    ],

    // Authority figures and sources
    authorityQuotes: [
        {
            pattern: /(president|prime minister|minister|secretary|director|ceo|dr\.?|prof\.?|senator|congressman|judge)\s+(\w+(?:\s+\w+)?)\s+(said|stated|announced|declared|warned|promised)\s*[:""](.{10,300})["""]/gi,
            weight: 0.85,
            type: 'authority_quote',
            extractGroup: 4
        }
    ]
};

// ═══════════════════════════════════════════════════════════════════════════════
// CONTEXT ANALYSIS
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Keywords that increase headline credibility
 */
export const CREDIBILITY_INDICATORS = {
    high: [
        'according to', 'sources confirm', 'official statement', 'press release',
        'government', 'ministry', 'department', 'agency', 'official',
        'published study', 'peer-reviewed', 'journal', 'research institute'
    ],
    medium: [
        'reportedly', 'sources say', 'insider', 'unnamed source',
        'investigation reveals', 'documents show', 'leaked'
    ],
    low: [
        'rumor', 'allegedly', 'unconfirmed', 'speculation', 'gossip',
        'anonymous tip', 'social media claims', 'viral post'
    ]
};

/**
 * Keywords that indicate potentially false or misleading content
 */
export const MISINFORMATION_INDICATORS = [
    'mainstream media won\'t tell you', 'they don\'t want you to know',
    'shocking truth', 'hidden agenda', 'cover-up', 'conspiracy',
    'wake up sheeple', 'do your own research', 'question everything',
    'big pharma', 'deep state', 'fake news media', 'propaganda'
];

// ═══════════════════════════════════════════════════════════════════════════════
// MAIN EXTRACTION FUNCTIONS
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Extract headlines and claims from text content
 * @param {string} text - The text to analyze
 * @param {string} title - Page title (optional)
 * @param {string} url - Page URL (optional)
 * @returns {Object} Extracted headlines and analysis
 */
export function extractHeadlines(text, title = '', url = '') {
    const results = {
        headlines: [],
        claims: [],
        quotes: [],
        metadata: {
            totalExtracted: 0,
            highConfidenceCount: 0,
            credibilityScore: 0,
            misinformationRisk: 0
        }
    };

    if (!text || text.length < 50) {
        return results;
    }

    // Clean and normalize text
    const cleanText = cleanTextForAnalysis(text);
    
    // Extract different types of content
    results.headlines = extractByPatterns(cleanText, HEADLINE_PATTERNS.newsHeadlines);
    results.claims = extractByPatterns(cleanText, HEADLINE_PATTERNS.factualClaims);
    results.quotes = extractByPatterns(cleanText, HEADLINE_PATTERNS.authorityQuotes);

    // Add title as potential headline if it looks newsworthy
    if (title && isNewsyTitle(title)) {
        results.headlines.unshift({
            text: title.trim(),
            confidence: 0.8,
            type: 'page_title',
            source: 'title'
        });
    }

    // Analyze credibility
    results.metadata = analyzeCredibility(cleanText, results);
    
    // Sort by confidence
    results.headlines.sort((a, b) => b.confidence - a.confidence);
    results.claims.sort((a, b) => b.confidence - a.confidence);
    results.quotes.sort((a, b) => b.confidence - a.confidence);

    // Limit results to prevent spam
    results.headlines = results.headlines.slice(0, 10);
    results.claims = results.claims.slice(0, 8);
    results.quotes = results.quotes.slice(0, 5);

    results.metadata.totalExtracted = results.headlines.length + results.claims.length + results.quotes.length;
    results.metadata.highConfidenceCount = [...results.headlines, ...results.claims, ...results.quotes]
        .filter(item => item.confidence >= 0.8).length;

    return results;
}

/**
 * Extract content using pattern groups
 * @param {string} text - Text to analyze
 * @param {Array} patterns - Pattern definitions
 * @returns {Array} Extracted items
 */
function extractByPatterns(text, patterns) {
    const results = [];
    
    for (const patternDef of patterns) {
        const matches = [...text.matchAll(patternDef.pattern)];
        
        for (const match of matches) {
            let extractedText;
            
            if (patternDef.extractGroup && match[patternDef.extractGroup]) {
                extractedText = match[patternDef.extractGroup];
            } else {
                extractedText = match[0];
            }
            
            extractedText = extractedText.trim();
            
            // Filter out very short or very long extracts
            if (extractedText.length < 15 || extractedText.length > 500) continue;
            
            // Skip if it's just a URL or email
            if (/^https?:\/\//.test(extractedText) || /^\w+@\w+\.\w+$/.test(extractedText)) continue;
            
            results.push({
                text: extractedText,
                confidence: patternDef.weight,
                type: patternDef.type,
                source: 'pattern_match',
                fullMatch: match[0].trim()
            });
        }
    }
    
    // Remove duplicates
    const seen = new Set();
    return results.filter(item => {
        const normalized = item.text.toLowerCase().trim();
        if (seen.has(normalized)) return false;
        seen.add(normalized);
        return true;
    });
}

/**
 * Clean text for better analysis
 * @param {string} text - Raw text
 * @returns {string} Cleaned text
 */
function cleanTextForAnalysis(text) {
    return text
        // Remove extra whitespace
        .replace(/\s+/g, ' ')
        // Remove HTML tags if any leaked through
        .replace(/<[^>]*>/g, '')
        // Fix common encoding issues
        .replace(/&quot;/g, '"')
        .replace(/&amp;/g, '&')
        .replace(/&lt;/g, '<')
        .replace(/&gt;/g, '>')
        // Clean up quotes
        .replace(/[""'']/g, '"')
        .trim();
}

/**
 * Check if a title looks like news
 * @param {string} title - Page title
 * @returns {boolean} Whether it's newsy
 */
function isNewsyTitle(title) {
    const newsyWords = /\b(breaking|exclusive|report|study|poll|survey|announces|confirms|denies|reveals|investigation|death|dies|killed|injured|arrested|sentenced|elected|wins|loses|crisis|emergency|outbreak|pandemic|war|conflict|peace|deal|agreement|law|bill|court|judge|trial|guilty|innocent|verdict)\b/i;
    
    const hasDate = /\b(today|yesterday|this week|monday|tuesday|wednesday|thursday|friday|saturday|sunday|january|february|march|april|may|june|july|august|september|october|november|december|\d{4}|\d{1,2}\/\d{1,2})\b/i;
    
    return newsyWords.test(title) || hasDate.test(title);
}

/**
 * Analyze text credibility and misinformation risk
 * @param {string} text - Text to analyze
 * @param {Object} results - Extracted results
 * @returns {Object} Metadata analysis
 */
function analyzeCredibility(text, results) {
    const lowerText = text.toLowerCase();
    let credibilityScore = 50; // Start neutral
    let misinformationRisk = 0;
    
    // Check credibility indicators
    for (const indicator of CREDIBILITY_INDICATORS.high) {
        if (lowerText.includes(indicator.toLowerCase())) {
            credibilityScore += 15;
        }
    }
    
    for (const indicator of CREDIBILITY_INDICATORS.medium) {
        if (lowerText.includes(indicator.toLowerCase())) {
            credibilityScore += 5;
        }
    }
    
    for (const indicator of CREDIBILITY_INDICATORS.low) {
        if (lowerText.includes(indicator.toLowerCase())) {
            credibilityScore -= 10;
        }
    }
    
    // Check misinformation indicators
    for (const indicator of MISINFORMATION_INDICATORS) {
        if (lowerText.includes(indicator.toLowerCase())) {
            misinformationRisk += 20;
            credibilityScore -= 15;
        }
    }
    
    // Normalize scores
    credibilityScore = Math.max(0, Math.min(100, credibilityScore));
    misinformationRisk = Math.max(0, Math.min(100, misinformationRisk));
    
    return {
        totalExtracted: 0, // Will be set by caller
        highConfidenceCount: 0, // Will be set by caller
        credibilityScore,
        misinformationRisk
    };
}

/**
 * Get searchable keywords from extracted content
 * @param {Object} extractedContent - Results from extractHeadlines()
 * @returns {Array} Array of search terms
 */
export function getSearchableKeywords(extractedContent) {
    const searchTerms = [];
    
    // Add high-confidence headlines
    extractedContent.headlines
        .filter(h => h.confidence >= 0.7)
        .forEach(headline => {
            searchTerms.push({
                query: headline.text,
                type: headline.type,
                confidence: headline.confidence,
                priority: headline.type === 'breaking_news' ? 'high' : 'medium'
            });
        });
    
    // Add important claims
    extractedContent.claims
        .filter(c => c.confidence >= 0.8)
        .forEach(claim => {
            searchTerms.push({
                query: claim.text,
                type: claim.type,
                confidence: claim.confidence,
                priority: claim.type === 'research_claim' ? 'high' : 'medium'
            });
        });
    
    // Add authority quotes
    extractedContent.quotes
        .filter(q => q.confidence >= 0.8)
        .forEach(quote => {
            searchTerms.push({
                query: quote.text,
                type: quote.type,
                confidence: quote.confidence,
                priority: 'high'
            });
        });
    
    // Sort by priority and confidence
    searchTerms.sort((a, b) => {
        const priorityWeight = { high: 3, medium: 2, low: 1 };
        const priorityDiff = priorityWeight[b.priority] - priorityWeight[a.priority];
        if (priorityDiff !== 0) return priorityDiff;
        return b.confidence - a.confidence;
    });
    
    // Limit to top search terms to avoid spam
    return searchTerms.slice(0, 15);
}