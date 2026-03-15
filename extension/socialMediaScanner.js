// ShareSafe - Social Media Scanner Module
// Platform-specific DOM scanning for Twitter/X, Instagram, Reddit, LinkedIn

// ═══════════════════════════════════════════════════════════════
// PLATFORM DETECTION
// ═══════════════════════════════════════════════════════════════

/**
 * Detect the current social media platform
 * @returns {'twitter' | 'instagram' | 'reddit' | 'linkedin' | 'generic'}
 */
export function detectPlatform() {
    const host = location.hostname.toLowerCase();

    if (host.includes('twitter.com') || host.includes('x.com')) return 'twitter';
    if (host.includes('instagram.com')) return 'instagram';
    if (host.includes('reddit.com')) return 'reddit';
    if (host.includes('linkedin.com')) return 'linkedin';

    return 'generic';
}

// ═══════════════════════════════════════════════════════════════
// PLATFORM-SPECIFIC SELECTORS
// ═══════════════════════════════════════════════════════════════

export const PLATFORM_SELECTORS = {
    twitter: [
        'div[data-testid="tweetText"]',
        'article div[lang]'
    ],
    instagram: [
        'span._ap3a._aaco._aacu._aacx._aad7._aade',
        'h1._ap3a._aaco._aacu._aacx._aad7._aade',
        'div._a9zr span',
        'span[dir="auto"]'
    ],
    reddit: [
        'div[data-testid="post-content"]',
        'div.RichTextJSON-root',
        'div[data-click-id="text"]',
        'p._1qeIAgB0cPwnLhDF9XSiJM'
    ],
    linkedin: [
        'div.feed-shared-update-v2__description span[dir="ltr"]',
        'div.feed-shared-inline-show-more-text span[dir="ltr"]',
        'span.break-words'
    ],
    generic: [
        'article p',
        'main p',
        '.content p',
        '.post-content p'
    ]
};

// Elements to skip (ads, timestamps, usernames, etc.)
const SKIP_SELECTORS = [
    '[data-testid="User-Name"]',
    '[data-testid="socialContext"]',
    'time',
    '[role="link"]',
    '.css-1qaijid', // Twitter username
    'a[role="link"]',
    '[data-ad-preview]',
    '.ad-badge',
    '.promoted'
];

// ═══════════════════════════════════════════════════════════════
// POST CONTENT EXTRACTION
// ═══════════════════════════════════════════════════════════════

/**
 * Check if element should be skipped
 */
function shouldSkipElement(element) {
    if (!element) return true;

    // Skip if already processed
    if (element.dataset && element.dataset.sharesafeProcessed === 'true') return true;

    // Skip if matches skip selectors
    for (const sel of SKIP_SELECTORS) {
        try {
            if (element.matches && element.matches(sel)) return true;
            if (element.closest && element.closest(sel)) return true;
        } catch (e) { }
    }

    return false;
}

/**
 * Extract and clean text content from a post element
 * @param {Element} element
 * @returns {{ text: string, wordCount: number } | null}
 */
export function extractPostContent(element) {
    if (shouldSkipElement(element)) return null;

    const text = (element.innerText || element.textContent || '').trim();

    // Remove common noise patterns
    const cleaned = text
        .replace(/^(Replying to|Retweeted|Shared)/i, '')
        .replace(/https?:\/\/t\.co\/\w+/g, '') // Twitter short URLs
        .replace(/pic\.twitter\.com\/\w+/g, '')
        .replace(/@\w+/g, '') // Remove @mentions from word count consideration
        .replace(/#\w+/g, '') // Remove hashtags from word count consideration
        .trim();

    const wordCount = cleaned.split(/\s+/).filter(w => w.length > 0).length;

    // Skip if too short (< 5 tokens as per requirement)
    if (wordCount < 5) return null;

    return { text, wordCount };
}

// ═══════════════════════════════════════════════════════════════
// PROCESSED NODES TRACKING
// ═══════════════════════════════════════════════════════════════

const processedNodes = new WeakSet();

/**
 * Check if node was already processed
 */
export function isProcessed(node) {
    return processedNodes.has(node);
}

/**
 * Mark node as processed
 */
export function markProcessed(node) {
    processedNodes.add(node);
    if (node.dataset) node.dataset.sharesafeProcessed = 'true';
}

// ═══════════════════════════════════════════════════════════════
// PLATFORM OBSERVER
// ═══════════════════════════════════════════════════════════════

/**
 * Create a debounced MutationObserver for a specific platform
 * @param {string} platform
 * @param {Function} onNewPosts - Callback with array of new post elements
 * @param {number} debounceMs - Debounce delay (default 400ms)
 */
export function createPlatformObserver(platform, onNewPosts, debounceMs = 400) {
    const selectors = PLATFORM_SELECTORS[platform] || PLATFORM_SELECTORS.generic;
    let debounceTimer = null;
    let pendingNodes = [];

    const observer = new MutationObserver((mutations) => {
        const newNodes = [];

        for (const mutation of mutations) {
            if (mutation.type !== 'childList' || !mutation.addedNodes) continue;

            for (const node of mutation.addedNodes) {
                if (node.nodeType !== 1) continue; // Element nodes only

                // Skip our own injected elements
                if (node.classList && Array.from(node.classList).some(c => c && c.startsWith('sharesafe-'))) {
                    continue;
                }

                // Check if node matches platform selectors
                for (const sel of selectors) {
                    try {
                        if (node.matches && node.matches(sel)) {
                            if (!isProcessed(node)) newNodes.push(node);
                        }
                        // Also check descendants
                        const descendants = node.querySelectorAll && node.querySelectorAll(sel);
                        if (descendants) {
                            for (const d of descendants) {
                                if (!isProcessed(d)) newNodes.push(d);
                            }
                        }
                    } catch (e) { }
                }
            }
        }

        if (newNodes.length === 0) return;

        // Add to pending and debounce
        pendingNodes.push(...newNodes);

        if (debounceTimer) clearTimeout(debounceTimer);
        debounceTimer = setTimeout(() => {
            const toProcess = [...new Set(pendingNodes)]; // Dedupe
            pendingNodes = [];

            if (toProcess.length > 0) {
                onNewPosts(toProcess);
            }
        }, debounceMs);
    });

    return {
        start: () => {
            if (document.body) {
                observer.observe(document.body, { childList: true, subtree: true });
            }
        },
        stop: () => {
            observer.disconnect();
            if (debounceTimer) clearTimeout(debounceTimer);
        },
        observer
    };
}

// ═══════════════════════════════════════════════════════════════
// INITIAL SCAN
// ═══════════════════════════════════════════════════════════════

/**
 * Scan page for existing posts on the current platform
 * @param {string} platform
 * @returns {Element[]}
 */
export function scanExistingPosts(platform) {
    const selectors = PLATFORM_SELECTORS[platform] || PLATFORM_SELECTORS.generic;
    const posts = [];

    for (const sel of selectors) {
        try {
            const found = document.querySelectorAll(sel);
            for (const el of found) {
                if (!isProcessed(el) && !shouldSkipElement(el)) {
                    posts.push(el);
                }
            }
        } catch (e) { }
    }

    return posts;
}

// ═══════════════════════════════════════════════════════════════
// PLATFORM-AWARE WEIGHT BOOSTS
// ═══════════════════════════════════════════════════════════════

/**
 * Get weight adjustments for a specific platform
 * @param {string} platform
 * @returns {Object} Weight multipliers
 */
export function getPlatformWeightBoosts(platform) {
    if (platform === 'twitter' || platform === 'instagram') {
        return {
            copyPasteArtifacts: 1.30,  // +30%
            emojiPlacement: 1.25,      // +25%
            fillerRatio: 1.20,         // +20%
            contractionRatio: 1.15,    // +15%
            hedgingDensity: 1.10,      // +10%
            firstPersonRatio: 1.10,    // +10%
            questionDensity: 1.10      // +10%
        };
    }

    if (platform === 'reddit') {
        return {
            copyPasteArtifacts: 1.25,
            fillerRatio: 1.15,
            contractionRatio: 1.10
        };
    }

    if (platform === 'linkedin') {
        return {
            fillerRatio: 1.25,         // LinkedIn posts are often formal
            hedgingDensity: 1.20,
            copyPasteArtifacts: 1.15
        };
    }

    return {}; // No boosts for generic
}
