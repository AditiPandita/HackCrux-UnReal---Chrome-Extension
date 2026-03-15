/**
 * ShareSafe - News Verifier Module
 * Performs Google searches and verifies news claims against trusted sources
 * 
 * Features:
 * - Google search integration (no API required)
 * - Trusted news source database
 * - Cross-reference verification
 * - Result caching to minimize requests
 * - Rate limiting and error handling
 */

// ═══════════════════════════════════════════════════════════════════════════════
// TRUSTED NEWS SOURCES DATABASE
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Comprehensive list of trusted news sources organized by tier
 * Tier 1: Most trusted, international credibility
 * Tier 2: Well-established, generally reliable
 * Tier 3: Regional/specialized but credible
 */
export const TRUSTED_NEWS_SOURCES = {
    tier1: [
        // Wire services and international
        'reuters.com', 'apnews.com', 'bbc.com', 'bbc.co.uk',
        
        // Major newspapers
        'nytimes.com', 'washingtonpost.com','thehindu.com', 'wsj.com', 'ft.com',
        'theguardian.com', 'economist.com', 'usatoday.com',
        
        // Government and official
        'gov.uk', 'gov.au', 'gov.ca', 'europa.eu', 'who.int', 'un.org',
        
        // Fact checkers
        'snopes.com', 'factcheck.org', 'politifact.com', 'fullfact.org',
        'factcheckni.org', 'checkyourfact.com', 'truthorfiction.com'
    ],
    
    tier2: [
        // Major broadcasters
        'cnn.com', 'abcnews.go.com', 'cbsnews.com', 'nbcnews.com',
        'npr.org', 'pbs.org', 'cbc.ca', 'abc.net.au',
        
        // Established newspapers
        'latimes.com', 'chicagotribune.com', 'bostonglobe.com',
        'seattletimes.com', 'denverpost.com', 'miamiherald.com',
        
        // International
        'lemonde.fr', 'spiegel.de', 'elpais.com', 'corriere.it',
        'asahi.com', 'scmp.com', 'straits-times.com',
        
        // News magazines
        'time.com', 'newsweek.com', 'theatlantic.com', 'newyorker.com'
    ],
    
    tier3: [
        // Regional and specialized
        'politico.com', 'axios.com', 'thehill.com', 'rollcall.com',
        'propublica.org', 'vox.com', 'buzzfeednews.com',
        'localwins.com', 'patch.com', 'stateline.org',
        
        // International regional
        'thelocal.com', 'france24.com', 'dw.com', 'euronews.com',
        'aljazeera.com', 'trtworld.com', 'channelnewsasia.com'
    ]
};

/**
 * Known unreliable or satirical sources
 */
export const UNRELIABLE_SOURCES = [
    'theonion.com', 'babylonbee.com', 'clickhole.com', 'satirewire.com',
    'infowars.com', 'naturalnews.com', 'beforeitsnews.com',
    'worldnewsdailyreport.com', 'nationalenquirer.com', 'weeklyworldnews.com',
    'empirenews.net', 'huzlers.com', 'newslo.com', 'worldnewsbureau.com'
];

// ═══════════════════════════════════════════════════════════════════════════════
// GOOGLE SEARCH INTEGRATION
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Cache for search results to minimize requests
 */
let searchCache = new Map();
let lastSearchTime = 0;
const SEARCH_DELAY = 2000; // 2 seconds between searches
const CACHE_DURATION = 30 * 60 * 1000; // 30 minutes

/**
 * Perform Google search for a headline/claim
 * @param {string} query - Search query
 * @param {Object} options - Search options
 * @returns {Promise<Object>} Search results
 */
export async function searchGoogle(query, options = {}) {
    const searchKey = `${query.toLowerCase().trim()}`;
    
    // Check cache first
    const cached = searchCache.get(searchKey);
    if (cached && (Date.now() - cached.timestamp < CACHE_DURATION)) {
        console.log('[NewsVerifier] Using cached search result');
        return cached.data;
    }
    
    // Rate limiting
    const timeSinceLastSearch = Date.now() - lastSearchTime;
    if (timeSinceLastSearch < SEARCH_DELAY) {
        await new Promise(resolve => setTimeout(resolve, SEARCH_DELAY - timeSinceLastSearch));
    }
    
    try {
        console.log('[NewsVerifier] Searching Google for:', query.substring(0, 80) + '...');
        
        // Construct search URL
        const searchUrl = buildGoogleSearchUrl(query, options);
        
        // Perform search
        const response = await fetchWithRetry(searchUrl, {
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
                'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
                'Accept-Language': 'en-US,en;q=0.5',
                'Accept-Encoding': 'gzip, deflate, br',
                'Connection': 'keep-alive',
                'Upgrade-Insecure-Requests': '1'
            }
        });
        
        if (!response.ok) {
            throw new Error(`Search failed: ${response.status}`);
        }
        
        const html = await response.text();
        const results = parseGoogleResults(html, query);
        
        // Cache the results
        searchCache.set(searchKey, {
            data: results,
            timestamp: Date.now()
        });
        
        lastSearchTime = Date.now();
        
        console.log('[NewsVerifier] Search completed, found', results.results.length, 'results');
        
        return results;
        
    } catch (error) {
        console.error('[NewsVerifier] Search error:', error);
        return {
            query: query,
            results: [],
            error: error.message,
            timestamp: Date.now()
        };
    }
}

/**
 * Build Google search URL
 * @param {string} query - Search query
 * @param {Object} options - Search options
 * @returns {string} Search URL
 */
function buildGoogleSearchUrl(query, options = {}) {
    const baseUrl = 'https://www.google.com/search';
    const params = new URLSearchParams();
    
    // Add query
    params.append('q', query);
    
    // Add news-specific parameters
    if (options.newsOnly !== false) {
        params.append('tbm', 'nws'); // News search
    }
    
    // Restrict to recent results
    if (options.timeframe) {
        params.append('tbs', options.timeframe); // qdr:w (week), qdr:m (month), qdr:y (year)
    } else {
        params.append('tbs', 'qdr:m'); // Default to last month
    }
    
    // Number of results
    params.append('num', options.numResults || '20');
    
    // Language
    params.append('hl', options.language || 'en');
    
    return `${baseUrl}?${params.toString()}`;
}

/**
 * Parse Google search results HTML
 * @param {string} html - HTML response
 * @param {string} originalQuery - Original search query
 * @returns {Object} Parsed results
 */
function parseGoogleResults(html, originalQuery) {
    const results = {
        query: originalQuery,
        results: [],
        trustedSources: [],
        unreliableSources: [],
        totalFound: 0,
        timestamp: Date.now()
    };
    
    try {
        // Parse search result items
        // Google uses various selectors, try multiple patterns
        const patterns = [
            /<div class="g"[^>]*>.*?<h3[^>]*>.*?<a[^>]*href="([^"]+)"[^>]*>.*?<\/a>.*?<\/h3>.*?<span[^>]*>(.*?)<\/span>/gs,
            /<div class="yuRUbf">.*?<a[^>]*href="([^"]+)"[^>]*>.*?<h3[^>]*>(.*?)<\/h3>/gs,
            /<div[^>]*data-ved[^>]*>.*?<a[^>]*href="([^"]+)"[^>]*>.*?<h3[^>]*>(.*?)<\/h3>/gs
        ];
        
        let matchFound = false;
        for (const pattern of patterns) {
            const matches = html.matchAll(pattern);
            
            for (const match of matches) {
                matchFound = true;
                const url = match[1];
                let title = match[2];
                
                // Clean up title
                title = title
                    .replace(/<[^>]*>/g, '') // Remove HTML tags
                    .replace(/&quot;/g, '"')
                    .replace(/&amp;/g, '&')
                    .replace(/&lt;/g, '<')
                    .replace(/&gt;/g, '>')
                    .trim();
                
                if (url && title && !url.includes('google.com') && !url.includes('youtube.com/watch')) {
                    const domain = extractDomain(url);
                    const trustLevel = getTrustLevel(domain);
                    
                    const result = {
                        title,
                        url,
                        domain,
                        trustLevel,
                        isReliable: trustLevel !== 'unknown' && trustLevel !== 'unreliable'
                    };
                    
                    results.results.push(result);
                    
                    // Categorize by trust level
                    if (['tier1', 'tier2', 'tier3'].includes(trustLevel)) {
                        results.trustedSources.push(result);
                    } else if (trustLevel === 'unreliable') {
                        results.unreliableSources.push(result);
                    }
                    
                    if (results.results.length >= 30) break;
                }
            }
            
            if (matchFound) break;
        }
        
        // If no structured results found, try a simpler pattern
        if (!matchFound) {
            const simplePattern = /<a[^>]*href="(https?:\/\/[^"]+)"[^>]*>([^<]+)<\/a>/g;
            const matches = html.matchAll(simplePattern);
            
            for (const match of matches) {
                const url = match[1];
                const title = match[2];
                
                if (!url.includes('google.com') && !url.includes('youtube.com') && title.length > 10) {
                    const domain = extractDomain(url);
                    const trustLevel = getTrustLevel(domain);
                    
                    results.results.push({
                        title: title.trim(),
                        url,
                        domain,
                        trustLevel,
                        isReliable: trustLevel !== 'unknown' && trustLevel !== 'unreliable'
                    });
                    
                    if (results.results.length >= 10) break;
                }
            }
        }
        
        results.totalFound = results.results.length;
        
    } catch (error) {
        console.error('[NewsVerifier] Parse error:', error);
    }
    
    return results;
}

/**
 * Extract domain from URL
 * @param {string} url - Full URL
 * @returns {string} Domain name
 */
function extractDomain(url) {
    try {
        const urlObj = new URL(url);
        return urlObj.hostname.toLowerCase().replace(/^www\./, '');
    } catch {
        return '';
    }
}

/**
 * Get trust level for a domain
 * @param {string} domain - Domain name
 * @returns {string} Trust level
 */
function getTrustLevel(domain) {
    if (TRUSTED_NEWS_SOURCES.tier1.includes(domain)) return 'tier1';
    if (TRUSTED_NEWS_SOURCES.tier2.includes(domain)) return 'tier2';
    if (TRUSTED_NEWS_SOURCES.tier3.includes(domain)) return 'tier3';
    if (UNRELIABLE_SOURCES.includes(domain)) return 'unreliable';
    
    // Check for government domains
    if (domain.endsWith('.gov') || domain.endsWith('.mil') || domain.endsWith('.edu')) {
        return 'tier1';
    }
    
    return 'unknown';
}

/**
 * Fetch with retry logic
 * @param {string} url - URL to fetch
 * @param {Object} options - Fetch options
 * @returns {Promise<Response>} Response
 */
async function fetchWithRetry(url, options = {}, maxRetries = 3) {
    let lastError;
    
    for (let i = 0; i < maxRetries; i++) {
        try {
            const response = await fetch(url, {
                ...options,
                signal: AbortSignal.timeout(15000) // 15 second timeout
            });
            
            if (response.ok) {
                return response;
            }
            
            if (response.status === 429) {
                // Rate limited, wait longer
                await new Promise(resolve => setTimeout(resolve, 5000 * (i + 1)));
                continue;
            }
            
            throw new Error(`HTTP ${response.status}`);
            
        } catch (error) {
            lastError = error;
            if (i < maxRetries - 1) {
                await new Promise(resolve => setTimeout(resolve, 1000 * (i + 1)));
            }
        }
    }
    
    throw lastError;
}

// ═══════════════════════════════════════════════════════════════════════════════
// VERIFICATION ANALYSIS
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Verify a claim against search results
 * @param {string} claim - The claim to verify
 * @param {Object} searchResults - Google search results
 * @returns {Object} Verification analysis
 */
export function verifyClaimAgainstResults(claim, searchResults) {
    const verification = {
        claim: claim,
        verified: false,
        confidence: 0,
        trustLevel: 'unknown',
        sources: {
            tier1: [],
            tier2: [],
            tier3: [],
            unreliable: []
        },
        analysis: {
            totalSources: searchResults.results.length,
            trustedSourceCount: searchResults.trustedSources.length,
            unreliableSourceCount: searchResults.unreliableSources.length,
            coverageScore: 0,
            consensusScore: 0
        },
        recommendation: 'unknown',
        reasoning: []
    };
    
    // Categorize sources
    for (const result of searchResults.results) {
        if (result.trustLevel && verification.sources[result.trustLevel]) {
            verification.sources[result.trustLevel].push(result);
        }
    }
    
    // Calculate coverage score (how many trusted sources cover this)
    const trustedCount = verification.sources.tier1.length + 
                        verification.sources.tier2.length + 
                        verification.sources.tier3.length;
    
    verification.analysis.coverageScore = Math.min(100, (trustedCount / 3) * 100);
    
    // Analyze trust pattern
    if (verification.sources.tier1.length >= 2) {
        verification.trustLevel = 'high';
        verification.confidence = 85 + Math.min(15, verification.sources.tier1.length * 3);
        verification.verified = true;
        verification.reasoning.push(`Confirmed by ${verification.sources.tier1.length} tier-1 sources`);
        verification.recommendation = 'likely_true';
        
    } else if (verification.sources.tier1.length >= 1 && 
               (verification.sources.tier2.length + verification.sources.tier3.length) >= 2) {
        verification.trustLevel = 'medium-high';
        verification.confidence = 75 + Math.min(10, trustedCount);
        verification.verified = true;
        verification.reasoning.push('Confirmed by multiple trusted sources');
        verification.recommendation = 'likely_true';
        
    } else if (trustedCount >= 3) {
        verification.trustLevel = 'medium';
        verification.confidence = 60 + Math.min(15, trustedCount * 2);
        verification.verified = true;
        verification.reasoning.push(`Covered by ${trustedCount} trusted sources`);
        verification.recommendation = 'possibly_true';
        
    } else if (trustedCount >= 1) {
        verification.trustLevel = 'low-medium';
        verification.confidence = 40 + Math.min(20, trustedCount * 5);
        verification.reasoning.push('Limited coverage by trusted sources');
        verification.recommendation = 'unverified';
        
    } else if (verification.sources.unreliable.length > trustedCount) {
        verification.trustLevel = 'low';
        verification.confidence = 25;
        verification.reasoning.push('Primarily covered by unreliable sources');
        verification.recommendation = 'likely_false';
        
    } else {
        verification.trustLevel = 'unknown';
        verification.confidence = 30;
        verification.reasoning.push('No coverage by known trusted sources');
        verification.recommendation = 'unverified';
    }
    
    // Boost confidence if tier-1 fact-checkers are involved
    const factCheckers = verification.sources.tier1.filter(source => 
        ['snopes.com', 'factcheck.org', 'politifact.com', 'fullfact.org'].includes(source.domain)
    );
    
    if (factCheckers.length > 0) {
        verification.confidence = Math.min(95, verification.confidence + 15);
        verification.reasoning.push(`Fact-checked by ${factCheckers.length} professional fact-checker(s)`);
        if (verification.recommendation === 'unverified') {
            verification.recommendation = 'likely_true';
        }
    }
    
    return verification;
}

/**
 * Batch verify multiple claims
 * @param {Array} claims - Array of claims to verify
 * @param {Object} options - Verification options
 * @returns {Promise<Array>} Verification results
 */
export async function batchVerifyClaims(claims, options = {}) {
    const results = [];
    const maxConcurrent = options.maxConcurrent || 3;
    const delay = options.delay || 3000;
    
    for (let i = 0; i < claims.length; i += maxConcurrent) {
        const batch = claims.slice(i, i + maxConcurrent);
        
        const batchPromises = batch.map(async (claim, index) => {
            // Stagger requests within batch
            if (index > 0) {
                await new Promise(resolve => setTimeout(resolve, delay * index));
            }
            
            try {
                const searchResults = await searchGoogle(claim.query, {
                    newsOnly: true,
                    timeframe: 'qdr:m', // Last month
                    numResults: 20
                });
                
                const verification = verifyClaimAgainstResults(claim.query, searchResults);
                
                return {
                    ...verification,
                    originalClaim: claim,
                    searchResults: searchResults
                };
                
            } catch (error) {
                console.error('[NewsVerifier] Batch verification error:', error);
                return {
                    claim: claim.query,
                    verified: false,
                    confidence: 0,
                    error: error.message,
                    originalClaim: claim
                };
            }
        });
        
        const batchResults = await Promise.allSettled(batchPromises);
        
        for (const result of batchResults) {
            if (result.status === 'fulfilled') {
                results.push(result.value);
            } else {
                console.error('[NewsVerifier] Batch item failed:', result.reason);
                results.push({
                    verified: false,
                    confidence: 0,
                    error: 'Verification failed'
                });
            }
        }
        
        // Wait between batches
        if (i + maxConcurrent < claims.length) {
            await new Promise(resolve => setTimeout(resolve, delay * 2));
        }
    }
    
    return results;
}