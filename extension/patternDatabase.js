/**
 * ShareSafe - Enhanced Pattern Detection Database
 * Comprehensive AI content detection patterns for 85-90%+ accuracy
 * 
 * Categories:
 * 1. AI Phrase Database (expanded)
 * 2. Markdown & Formatting Artifacts
 * 3. Emoji Patterns
 * 4. Self-Disclosure Detection
 * 5. Template Phrases
 * 6. New Detection Methods (structure, flow, tone)
 */

// ═══════════════════════════════════════════════════════════════════════════════
// SECTION 1: EXPANDED AI PHRASE DATABASE
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Comprehensive AI-specific phrases categorized by type and risk level
 */
export const AI_PHRASES = {

    // ─────────────────────────────────────────────────────────────────────────────
    // 1.1 SELF-DISCLOSURE (Definitive AI signals)
    // ─────────────────────────────────────────────────────────────────────────────
    selfDisclosure: [
        {
            pattern: /\b(as an ai|as an artificial intelligence|as a language model|as an llm)\b/i,
            score: 95,
            msg: 'Explicit AI self-identification',
            category: 'self-disclosure',
            falsePositiveRisk: 'low',
            contextHint: 'Almost always definitive'
        },
        {
            pattern: /\bi('m| am) (just |only )?(an? )?(ai|artificial intelligence|language model|chatbot|virtual assistant)\b/i,
            score: 95,
            msg: 'AI identity statement',
            category: 'self-disclosure',
            falsePositiveRisk: 'low',
            contextHint: 'Definitive when first-person'
        },
        {
            pattern: /\bi (don't|do not|cannot|can't) have (personal |my own )?(feelings|emotions|opinions|experiences|consciousness)\b/i,
            score: 90,
            msg: 'AI limitation disclosure',
            category: 'self-disclosure',
            falsePositiveRisk: 'low',
            contextHint: 'Strong signal in first-person context'
        },
        {
            pattern: /\bi (don't|do not|cannot|can't) (browse|access|search) (the )?(internet|web|online)\b/i,
            score: 85,
            msg: 'AI capability limitation',
            category: 'self-disclosure',
            falsePositiveRisk: 'low',
            contextHint: 'Context-dependent'
        },
        {
            pattern: /\bmy (training|knowledge) (data |cutoff |was )?(is |ends |stops )?(in |at |around )?(september|january|april)?\s*\d{4}\b/i,
            score: 92,
            msg: 'Knowledge cutoff reference',
            category: 'self-disclosure',
            falsePositiveRisk: 'low',
            contextHint: 'Definitive AI signal'
        },
        {
            pattern: /\bi (was |am )?(created|developed|trained|built) by (openai|anthropic|google|meta|microsoft)\b/i,
            score: 95,
            msg: 'AI creator disclosure',
            category: 'self-disclosure',
            falsePositiveRisk: 'low',
            contextHint: 'Definitive'
        },
        {
            pattern: /\bi('m| am) not able to (provide|give|offer) (medical|legal|financial) advice\b/i,
            score: 75,
            msg: 'AI safety disclaimer',
            category: 'self-disclosure',
            falsePositiveRisk: 'medium',
            contextHint: 'Could be human professional too'
        },
        {
            pattern: /\b(generated|created|written) (by|with|using) (chatgpt|gpt-?4|claude|gemini|copilot|llama|mistral)\b/i,
            score: 95,
            msg: 'Tool attribution',
            category: 'self-disclosure',
            falsePositiveRisk: 'low',
            contextHint: 'Explicit tool mention'
        }
    ],

    // ─────────────────────────────────────────────────────────────────────────────
    // 1.2 HEDGING & UNCERTAINTY LANGUAGE
    // ─────────────────────────────────────────────────────────────────────────────
    hedging: [
        {
            pattern: /\bit('s| is) (important|worth|crucial|essential|vital) to (note|mention|remember|understand|consider|keep in mind)\b/i,
            score: 65,
            msg: 'AI-typical emphasis phrase',
            category: 'hedging',
            falsePositiveRisk: 'medium',
            contextHint: 'Very common in AI, but also formal writing'
        },
        {
            pattern: /\bit('s| is) worth (noting|mentioning|pointing out|highlighting)\b/i,
            score: 55,
            msg: 'Formal hedging phrase',
            category: 'hedging',
            falsePositiveRisk: 'medium',
            contextHint: 'Common in AI and academic writing'
        },
        {
            pattern: /\b(can|could|may|might) (potentially|possibly|perhaps|arguably)\b/i,
            score: 40,
            msg: 'Double hedging',
            category: 'hedging',
            falsePositiveRisk: 'high',
            contextHint: 'Only suspicious if repeated multiple times'
        },
        {
            pattern: /\bhowever,? it('s| is) (important|essential|crucial) to\b/i,
            score: 60,
            msg: 'Transitional hedging',
            category: 'hedging',
            falsePositiveRisk: 'medium',
            contextHint: 'AI transition pattern'
        },
        {
            pattern: /\b(that (being )?said|having said that|with that (being )?said)\b/i,
            score: 45,
            msg: 'Hedging transition',
            category: 'hedging',
            falsePositiveRisk: 'high',
            contextHint: 'Common in both AI and human'
        },
        {
            pattern: /\bit (should|must) be (noted|mentioned|emphasized|stressed) that\b/i,
            score: 55,
            msg: 'Passive emphasis',
            category: 'hedging',
            falsePositiveRisk: 'medium',
            contextHint: 'Academic/AI style'
        }
    ],

    // ─────────────────────────────────────────────────────────────────────────────
    // 1.3 FORMAL TRANSITIONS (AI loves these)
    // ─────────────────────────────────────────────────────────────────────────────
    formalTransitions: [
        {
            pattern: /\b(moreover|furthermore|additionally|consequently|subsequently|accordingly)\b/gi,
            score: 0,
            count: true,
            threshold: 3,
            scoreMulti: 15,
            msg: 'Excessive formal connectors',
            category: 'transitions',
            falsePositiveRisk: 'medium',
            contextHint: 'Suspicious when 3+ in short text'
        },
        {
            pattern: /\bin (conclusion|summary|closing|short)\b/i,
            score: 35,
            msg: 'Formulaic conclusion',
            category: 'transitions',
            falsePositiveRisk: 'medium',
            contextHint: 'Common in structured writing'
        },
        {
            pattern: /\bto (summarize|conclude|sum up|wrap up)\b/i,
            score: 35,
            msg: 'Summary transition',
            category: 'transitions',
            falsePositiveRisk: 'medium',
            contextHint: 'Common but AI-typical'
        },
        {
            pattern: /\bfirst(ly)?[,.]?\s*(second(ly)?|next)[,.]?\s*(third(ly)?|finally|lastly)/i,
            score: 55,
            msg: 'Numbered sequence pattern',
            category: 'transitions',
            falsePositiveRisk: 'medium',
            contextHint: 'AI loves explicit ordering'
        },
        {
            pattern: /\bon (the )?one hand\b.*\bon the other hand\b/is,
            score: 50,
            msg: 'Balanced argument structure',
            category: 'transitions',
            falsePositiveRisk: 'medium',
            contextHint: 'Very AI-like phrasing'
        },
        {
            pattern: /\blet('s| us) (dive|delve|explore|examine|take a look|break down|unpack)\b/i,
            score: 60,
            msg: 'AI exploration phrase',
            category: 'transitions',
            falsePositiveRisk: 'low',
            contextHint: 'Strong AI signal'
        },
        {
            pattern: /\bnow,? let('s| us) (move on|turn|shift) to\b/i,
            score: 55,
            msg: 'AI section transition',
            category: 'transitions',
            falsePositiveRisk: 'low',
            contextHint: 'Structured AI response'
        }
    ],

    // ─────────────────────────────────────────────────────────────────────────────
    // 1.4 CORPORATE/MARKETING JARGON
    // ─────────────────────────────────────────────────────────────────────────────
    corporateJargon: [
        {
            pattern: /\b(leverage|utilize|optimize|streamline|synergize|facilitate)\b/gi,
            score: 0,
            count: true,
            threshold: 2,
            scoreMulti: 12,
            msg: 'Corporate buzzwords',
            category: 'jargon',
            falsePositiveRisk: 'medium',
            contextHint: 'AI and marketing overlap'
        },
        {
            pattern: /\b(cutting[- ]edge|state[- ]of[- ]the[- ]art|next[- ]generation|revolutionary|groundbreaking)\b/i,
            score: 35,
            msg: 'Hype vocabulary',
            category: 'jargon',
            falsePositiveRisk: 'medium',
            contextHint: 'Marketing and AI overlap'
        },
        {
            pattern: /\b(robust|scalable|seamless|holistic|comprehensive|innovative)\b/gi,
            score: 0,
            count: true,
            threshold: 2,
            scoreMulti: 10,
            msg: 'Generic qualifiers',
            category: 'jargon',
            falsePositiveRisk: 'medium',
            contextHint: 'Suspicious when clustered'
        },
        {
            pattern: /\b(empower|transform|revolutionize|unlock|unleash|elevate) (your|the|our)\b/i,
            score: 50,
            msg: 'AI motivational phrasing',
            category: 'jargon',
            falsePositiveRisk: 'low',
            contextHint: 'Strong AI marketing signal'
        },
        {
            pattern: /\btake (your|it|things) to the next level\b/i,
            score: 45,
            msg: 'Cliché phrase',
            category: 'jargon',
            falsePositiveRisk: 'medium',
            contextHint: 'AI and marketing cliché'
        },
        {
            pattern: /\b(game[- ]changer|paradigm shift|best practices|value proposition|low[- ]hanging fruit)\b/i,
            score: 40,
            msg: 'Business cliché',
            category: 'jargon',
            falsePositiveRisk: 'medium',
            contextHint: 'May be human business writing'
        }
    ],

    // ─────────────────────────────────────────────────────────────────────────────
    // 1.5 RESPONSE STRUCTURE PHRASES
    // ─────────────────────────────────────────────────────────────────────────────
    responseStructure: [
        {
            pattern: /^(certainly|absolutely|of course|sure|great question)[!,.:]/im,
            score: 55,
            msg: 'AI acknowledgment opener',
            category: 'structure',
            falsePositiveRisk: 'medium',
            contextHint: 'Very common AI response start'
        },
        {
            pattern: /\bhappy to (help|assist|answer|explain|clarify)\b/i,
            score: 50,
            msg: 'AI helpfulness phrase',
            category: 'structure',
            falsePositiveRisk: 'medium',
            contextHint: 'Customer service also uses this'
        },
        {
            pattern: /\bhope (this|that|I) (helps|answered|clarifies|addresses)\b/i,
            score: 45,
            msg: 'AI closing phrase',
            category: 'structure',
            falsePositiveRisk: 'medium',
            contextHint: 'Common AI sign-off'
        },
        {
            pattern: /\bfeel free to (ask|reach out|let me know|contact)\b/i,
            score: 40,
            msg: 'AI offer for more help',
            category: 'structure',
            falsePositiveRisk: 'high',
            contextHint: 'Used by humans in support'
        },
        {
            pattern: /\bif you (have|need) (any )?(more |further |additional )?(questions|help|clarification|assistance)\b/i,
            score: 45,
            msg: 'AI follow-up offer',
            category: 'structure',
            falsePositiveRisk: 'medium',
            contextHint: 'Common AI closing'
        },
        {
            pattern: /\bhere('s| is) (a |an )?(brief |quick )?(overview|summary|breakdown|explanation|guide)\b/i,
            score: 50,
            msg: 'AI content introduction',
            category: 'structure',
            falsePositiveRisk: 'low',
            contextHint: 'AI loves to announce structure'
        },
        {
            pattern: /\blet me (explain|break down|walk you through|clarify)\b/i,
            score: 45,
            msg: 'AI explanation opener',
            category: 'structure',
            falsePositiveRisk: 'medium',
            contextHint: 'Teaching context'
        },
        {
            pattern: /\bi('ll| will) (explain|cover|discuss|address|outline) (the following|these points|this|each)\b/i,
            score: 55,
            msg: 'AI structural announcement',
            category: 'structure',
            falsePositiveRisk: 'low',
            contextHint: 'Strong structure signal'
        }
    ],

    // ─────────────────────────────────────────────────────────────────────────────
    // 1.6 DOMAIN-SPECIFIC PHRASES
    // ─────────────────────────────────────────────────────────────────────────────
    domainSpecific: {
        academic: [
            {
                pattern: /\b(studies|research) (show|suggest|indicate|demonstrate|reveal) that\b/i,
                score: 35,
                msg: 'Citation-style claim',
                category: 'academic',
                falsePositiveRisk: 'high',
                contextHint: 'Only suspicious without actual citation'
            },
            {
                pattern: /\baccording to (experts|researchers|studies|recent research)\b/i,
                score: 40,
                msg: 'Vague authority reference',
                category: 'academic',
                falsePositiveRisk: 'medium',
                contextHint: 'AI often uses without specific source'
            },
            {
                pattern: /\b(empirical evidence|scholarly consensus|peer-reviewed) (suggests|indicates|shows)\b/i,
                score: 45,
                msg: 'Academic authority claim',
                category: 'academic',
                falsePositiveRisk: 'medium',
                contextHint: 'May be legitimate academic writing'
            }
        ],
        technical: [
            {
                pattern: /\bunder the hood\b/i,
                score: 35,
                msg: 'AI technical metaphor',
                category: 'technical',
                falsePositiveRisk: 'medium',
                contextHint: 'Common in tech explanations'
            },
            {
                pattern: /\b(at its core|fundamentally|essentially|basically)\b/i,
                score: 25,
                msg: 'Simplification phrase',
                category: 'technical',
                falsePositiveRisk: 'high',
                contextHint: 'Very common in all writing'
            }
        ],
        business: [
            {
                pattern: /\b(key takeaway|bottom line|main point|in a nutshell)\b/i,
                score: 40,
                msg: 'Business summary phrase',
                category: 'business',
                falsePositiveRisk: 'medium',
                contextHint: 'AI and business writing overlap'
            },
            {
                pattern: /\bmoving forward\b/i,
                score: 30,
                msg: 'Corporate transition',
                category: 'business',
                falsePositiveRisk: 'high',
                contextHint: 'Very common in business'
            }
        ]
    },

    // ─────────────────────────────────────────────────────────────────────────────
    // 1.7 INDIRECT AI MARKERS (Subtle signals)
    // ─────────────────────────────────────────────────────────────────────────────
    indirectMarkers: [
        {
            pattern: /\bthis (is|seems|appears) (to be )?(a |an )?(common|important|interesting|great|excellent) question\b/i,
            score: 50,
            msg: 'AI question acknowledgment',
            category: 'indirect',
            falsePositiveRisk: 'medium',
            contextHint: 'AI often validates questions'
        },
        {
            pattern: /\bi (appreciate|understand) (your|the) (question|concern|interest)\b/i,
            score: 45,
            msg: 'AI appreciation phrase',
            category: 'indirect',
            falsePositiveRisk: 'medium',
            contextHint: 'Customer service uses too'
        },
        {
            pattern: /\b(to (directly )?answer your question|to address (your|this) (question|concern))\b/i,
            score: 50,
            msg: 'AI direct answer pattern',
            category: 'indirect',
            falsePositiveRisk: 'low',
            contextHint: 'Strong AI response pattern'
        },
        {
            pattern: /\b(the short answer is|in short|simply put|put simply)\b/i,
            score: 40,
            msg: 'AI simplification phrase',
            category: 'indirect',
            falsePositiveRisk: 'medium',
            contextHint: 'AI loves to offer summaries'
        },
        {
            pattern: /\b(while|although) (this|it|there) (may|might|could) (seem|appear|look|be)\b/i,
            score: 35,
            msg: 'AI nuance pattern',
            category: 'indirect',
            falsePositiveRisk: 'high',
            contextHint: 'Very common construction'
        }
    ]
};


// ═══════════════════════════════════════════════════════════════════════════════
// SECTION 2: MARKDOWN & FORMATTING ARTIFACTS
// ═══════════════════════════════════════════════════════════════════════════════

export const MARKDOWN_PATTERNS = {

    headers: [
        {
            pattern: /^#{1,6}\s+.+$/gm,
            score: 45,
            msg: 'Markdown header syntax',
            category: 'markdown',
            falsePositiveRisk: 'low',
            contextHint: 'Strong signal in non-markdown context'
        }
    ],

    emphasis: [
        {
            pattern: /\*\*[^*\n]+\*\*/g,
            score: 0,
            count: true,
            threshold: 2,
            scoreMulti: 20,
            msg: 'Bold markdown formatting',
            category: 'markdown',
            falsePositiveRisk: 'low',
            contextHint: 'Very suspicious in casual text'
        },
        {
            pattern: /(?<!\*)\*[^*\n]+\*(?!\*)/g,
            score: 0,
            count: true,
            threshold: 3,
            scoreMulti: 15,
            msg: 'Italic markdown formatting',
            category: 'markdown',
            falsePositiveRisk: 'medium',
            contextHint: 'Could be emphasis asterisks'
        },
        {
            pattern: /__[^_\n]+__/g,
            score: 40,
            msg: 'Underscore bold syntax',
            category: 'markdown',
            falsePositiveRisk: 'low',
            contextHint: 'Uncommon in human writing'
        },
        {
            pattern: /~~[^~\n]+~~/g,
            score: 45,
            msg: 'Strikethrough syntax',
            category: 'markdown',
            falsePositiveRisk: 'low',
            contextHint: 'Markdown artifact'
        }
    ],

    lists: [
        {
            pattern: /^[\t ]*[-*+]\s+.+$/gm,
            score: 0,
            count: true,
            threshold: 3,
            scoreMulti: 15,
            msg: 'Bulleted list in plain text',
            category: 'markdown',
            falsePositiveRisk: 'medium',
            contextHint: 'Suspicious in non-formatted context'
        },
        {
            pattern: /^\s*\d+\.\s+[A-Z]/gm,
            score: 0,
            count: true,
            threshold: 3,
            scoreMulti: 18,
            msg: 'Numbered list pattern',
            category: 'markdown',
            falsePositiveRisk: 'low',
            contextHint: 'AI loves numbered lists'
        }
    ],

    codeBlocks: [
        {
            pattern: /```[\s\S]*?```/g,
            score: 50,
            msg: 'Fenced code block',
            category: 'markdown',
            falsePositiveRisk: 'low',
            contextHint: 'Strong AI artifact'
        },
        {
            pattern: /`[^`\n]+`/g,
            score: 0,
            count: true,
            threshold: 4,
            scoreMulti: 10,
            msg: 'Inline code formatting',
            category: 'markdown',
            falsePositiveRisk: 'medium',
            contextHint: 'Could be intentional backticks'
        }
    ],

    links: [
        {
            pattern: /\[([^\]]+)\]\(([^)]+)\)/g,
            score: 35,
            msg: 'Markdown link syntax',
            category: 'markdown',
            falsePositiveRisk: 'medium',
            contextHint: 'May be intentional in some contexts'
        }
    ],

    blockquotes: [
        {
            pattern: /^>\s+.+$/gm,
            score: 0,
            count: true,
            threshold: 2,
            scoreMulti: 15,
            msg: 'Blockquote syntax',
            category: 'markdown',
            falsePositiveRisk: 'medium',
            contextHint: 'Email quote style also uses this'
        }
    ],

    htmlArtifacts: [
        {
            pattern: /<(strong|em|b|i|u|code|pre|h[1-6])>/gi,
            score: 40,
            msg: 'HTML tag in plain text',
            category: 'html',
            falsePositiveRisk: 'low',
            contextHint: 'Strong copy-paste artifact'
        },
        {
            pattern: /<\/?[a-z]+[^>]*>/gi,
            score: 0,
            count: true,
            threshold: 3,
            scoreMulti: 15,
            msg: 'Multiple HTML tags',
            category: 'html',
            falsePositiveRisk: 'low',
            contextHint: 'Copy-paste artifact'
        },
        {
            pattern: /&(nbsp|amp|lt|gt|quot|apos);/g,
            score: 35,
            msg: 'HTML entities',
            category: 'html',
            falsePositiveRisk: 'low',
            contextHint: 'Encoding artifact'
        }
    ]
};


// ═══════════════════════════════════════════════════════════════════════════════
// SECTION 3: EMOJI PATTERN DETECTION
// ═══════════════════════════════════════════════════════════════════════════════

export const EMOJI_PATTERNS = {

    // Emoji at end of sentences (AI pattern)
    terminalEmoji: {
        pattern: /[.!?]\s*[\u{1F300}-\u{1FAFF}](\s|$)/gu,
        score: 45,
        msg: 'Terminal emoji placement',
        category: 'emoji',
        falsePositiveRisk: 'medium',
        contextHint: 'AI typically places emoji at sentence end'
    },

    // Emoji at start (header-style, AI pattern)
    headerEmoji: {
        pattern: /^[\u{1F300}-\u{1FAFF}]\s+[A-Z]/gmu,
        score: 50,
        msg: 'Emoji as header/bullet',
        category: 'emoji',
        falsePositiveRisk: 'low',
        contextHint: 'Strong AI formatting pattern'
    },

    // Clustered emojis (AI pattern)
    emojiClustering: {
        pattern: /[\u{1F300}-\u{1FAFF}]{3,}/gu,
        score: 30,
        msg: 'Emoji clustering',
        category: 'emoji',
        falsePositiveRisk: 'high',
        contextHint: 'Humans also cluster emojis'
    },

    // AI-favored emojis (professional/motivational)
    aiFavoredEmojis: {
        pattern: /[\u{1F4A1}\u{1F680}\u{2728}\u{1F31F}\u{1F525}\u{1F389}\u{1F4AF}\u{2705}\u{1F4CA}\u{1F3AF}]/gu,
        // 💡🚀✨🌟🔥🎉💯✅📊🎯
        score: 0,
        count: true,
        threshold: 2,
        scoreMulti: 15,
        msg: 'AI-favored emoji types',
        category: 'emoji',
        falsePositiveRisk: 'medium',
        contextHint: 'Common in AI motivational content'
    },

    // Human-typical emoji patterns (reduces score)
    humanEmojiPatterns: {
        pattern: /[\u{1F602}\u{1F62D}\u{1F923}\u{1F629}\u{1F644}]/gu,
        // 😂😭🤣😩🙄
        score: -10,
        msg: 'Human-typical emotional emojis',
        category: 'emoji',
        falsePositiveRisk: 'low',
        contextHint: 'Reduces AI suspicion'
    },

    // Mid-sentence emoji (human pattern)
    midSentenceEmoji: {
        pattern: /\w+\s*[\u{1F300}-\u{1FAFF}]\s*\w+/gu,
        score: -5,
        msg: 'Mid-sentence emoji (human style)',
        category: 'emoji',
        falsePositiveRisk: 'low',
        contextHint: 'Humans scatter emojis naturally'
    }
};


// ═══════════════════════════════════════════════════════════════════════════════
// SECTION 4: SELF-DISCLOSURE DETECTION (Expanded)
// ═══════════════════════════════════════════════════════════════════════════════

export const SELF_DISCLOSURE_PATTERNS = {

    // Direct capability limitations
    capabilityLimitations: [
        {
            pattern: /\bi (cannot|can't|am unable to|am not able to) (provide|access|browse|search|view|see|process)\b/i,
            score: 70,
            msg: 'Capability limitation statement',
            category: 'disclosure',
            falsePositiveRisk: 'low',
            contextHint: 'AI explaining what it cannot do'
        },
        {
            pattern: /\bi (don't|do not) have (access to|the ability to|real-?time|current)\b/i,
            score: 65,
            msg: 'Access limitation',
            category: 'disclosure',
            falsePositiveRisk: 'low',
            contextHint: 'AI capability boundary'
        },
        {
            pattern: /\b(my|i) (programming|training|guidelines|design) (prevents?|doesn't allow|restricts?)\b/i,
            score: 85,
            msg: 'Behavioral constraint reference',
            category: 'disclosure',
            falsePositiveRisk: 'low',
            contextHint: 'Strong AI signal'
        }
    ],

    // Knowledge boundaries
    knowledgeBoundaries: [
        {
            pattern: /\b(as of my|based on my) (last |latest )?(training|knowledge|information)\b/i,
            score: 80,
            msg: 'Knowledge boundary reference',
            category: 'disclosure',
            falsePositiveRisk: 'low',
            contextHint: 'Definitive AI signal'
        },
        {
            pattern: /\bi (don't|do not) have (information|knowledge|data) (about|on|regarding) (events|things) after\b/i,
            score: 85,
            msg: 'Temporal knowledge limit',
            category: 'disclosure',
            falsePositiveRisk: 'low',
            contextHint: 'AI discussing training cutoff'
        }
    ],

    // Subtle nature admissions
    subtleAdmissions: [
        {
            pattern: /\b(from|based on) (what|the information) (i('ve| have)|my training) (learned|been trained on)\b/i,
            score: 60,
            msg: 'Training-based knowledge reference',
            category: 'disclosure',
            falsePositiveRisk: 'low',
            contextHint: 'AI referencing training'
        },
        {
            pattern: /\bi (process|analyze|generate|produce) (text|responses|content)\b/i,
            score: 55,
            msg: 'Processing capability mention',
            category: 'disclosure',
            falsePositiveRisk: 'medium',
            contextHint: 'Could be human describing work'
        }
    ],

    // Safety guideline hints
    safetyHints: [
        {
            pattern: /\bi('m| am) (designed|programmed|built|meant) to be (helpful|harmless|honest)\b/i,
            score: 90,
            msg: 'AI safety principle reference',
            category: 'disclosure',
            falsePositiveRisk: 'low',
            contextHint: 'Definitive Anthropic/OpenAI signal'
        },
        {
            pattern: /\bi (strive|aim|try) to (be|remain|stay) (neutral|unbiased|objective|balanced)\b/i,
            score: 45,
            msg: 'Neutrality statement',
            category: 'disclosure',
            falsePositiveRisk: 'medium',
            contextHint: 'Could be human journalist'
        }
    ]
};


// ═══════════════════════════════════════════════════════════════════════════════
// SECTION 5: TEMPLATE PHRASES (Expanded)
// ═══════════════════════════════════════════════════════════════════════════════

export const TEMPLATE_PHRASES = {

    // Opening phrases
    openings: [
        {
            pattern: /^(hi there|hello|hey there|greetings)[!,.]?\s*(thanks? for|i('d| would) be happy)/i,
            score: 55,
            msg: 'AI greeting + helpfulness combo',
            category: 'opening',
            falsePositiveRisk: 'medium'
        },
        {
            pattern: /^(great|excellent|good|interesting|wonderful) question[!.]/i,
            score: 50,
            msg: 'AI question validation',
            category: 'opening',
            falsePositiveRisk: 'medium'
        },
        {
            pattern: /^(thanks? for (sharing|asking|your question|reaching out))[!.]/i,
            score: 45,
            msg: 'AI appreciation opener',
            category: 'opening',
            falsePositiveRisk: 'high'
        },
        {
            pattern: /^i('d| would) be happy to (help|assist|explain|answer)/i,
            score: 50,
            msg: 'AI helpfulness opener',
            category: 'opening',
            falsePositiveRisk: 'medium'
        }
    ],

    // Closing phrases
    closings: [
        {
            pattern: /\b(hope (this|that)|i hope (this|i)('ve| have)) (helps?|answered|clarified|addressed)/i,
            score: 45,
            msg: 'AI closing hope statement',
            category: 'closing',
            falsePositiveRisk: 'medium'
        },
        {
            pattern: /\b(let me know if you (have|need)|feel free to (ask|reach out|contact))/i,
            score: 40,
            msg: 'AI follow-up offer',
            category: 'closing',
            falsePositiveRisk: 'high'
        },
        {
            pattern: /\bis there anything else (i can|you('d| would) like me to)/i,
            score: 55,
            msg: 'AI continuation offer',
            category: 'closing',
            falsePositiveRisk: 'low'
        },
        {
            pattern: /\b(happy|glad) to (help|assist|elabor|clarify|provide more)/i,
            score: 45,
            msg: 'AI assistance offer',
            category: 'closing',
            falsePositiveRisk: 'medium'
        },
        {
            pattern: /\bgood luck( with| on)?\b/i,
            score: 30,
            msg: 'AI well-wish closing',
            category: 'closing',
            falsePositiveRisk: 'high'
        }
    ],

    // Structural phrases
    structural: [
        {
            pattern: /\bhere('s| is| are) (a |an |the |some )?(key |main |important )?(point|thing|factor|reason|step|tip)/i,
            score: 45,
            msg: 'AI content introduction',
            category: 'structural',
            falsePositiveRisk: 'medium'
        },
        {
            pattern: /\b(there are (several|many|multiple|a few|some) (key |important |main )?(factors|reasons|points|things|ways))/i,
            score: 50,
            msg: 'AI enumeration introduction',
            category: 'structural',
            falsePositiveRisk: 'low'
        },
        {
            pattern: /\b(let('s| us) (start|begin) (with|by)|first,? let('s| me))/i,
            score: 45,
            msg: 'AI structural opener',
            category: 'structural',
            falsePositiveRisk: 'medium'
        },
        {
            pattern: /\b(to (better )?understand this|to put (this|it) (in|into) (perspective|context))/i,
            score: 40,
            msg: 'AI context-setting phrase',
            category: 'structural',
            falsePositiveRisk: 'medium'
        }
    ]
};


// ═══════════════════════════════════════════════════════════════════════════════
// SECTION 6: NEW DETECTION METHODS
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Analyze sentence structure patterns
 */
export function analyzeStructurePatterns(text) {
    const signals = [];
    let score = 0;

    // Parallel structure (AI loves this)
    const parallelPattern = /\b(is|are|was|were)\s+\w+,\s+\w+,?\s+(and|or)\s+\w+\b/gi;
    const parallelMatches = text.match(parallelPattern) || [];
    if (parallelMatches.length >= 2) {
        signals.push('Excessive parallel structure');
        score += 15;
    }

    // Question-then-answer format
    if (/\?[\s\n]+[A-Z](?!.*\?)/.test(text)) {
        const qaPairs = text.match(/\?\s*\n?\s*[A-Z][^?]+[.!]/g) || [];
        if (qaPairs.length >= 2) {
            signals.push('Q&A format structure');
            score += 25;
        }
    }

    // Colon-list pattern (AI loves this)
    const colonList = /:\s*\n?\s*([-•*]|\d+\.)/g;
    if ((text.match(colonList) || []).length >= 2) {
        signals.push('Colon followed by list pattern');
        score += 20;
    }

    // Sentence complexity uniformity
    const sentences = text.split(/[.!?]+/).filter(s => s.trim().length > 10);
    if (sentences.length >= 4) {
        const complexities = sentences.map(s => s.split(/,|;|:/).length);
        const avgComplexity = complexities.reduce((a, b) => a + b, 0) / complexities.length;
        const variance = complexities.reduce((sum, c) => sum + Math.pow(c - avgComplexity, 2), 0) / complexities.length;
        if (variance < 0.5) {
            signals.push('Uniform sentence complexity');
            score += 15;
        }
    }

    return { score: Math.min(100, score), signals };
}

/**
 * Analyze logical flow patterns
 */
export function analyzeLogicalFlow(text) {
    const signals = [];
    let score = 0;

    // "First... Second... Third" pattern
    const explicitOrdering = /\b(first(ly)?|1\.|one:?)[\s\S]{20,200}(second(ly)?|2\.|two:?)[\s\S]{20,200}(third(ly)?|3\.|three:?)/i;
    if (explicitOrdering.test(text)) {
        signals.push('Explicit numbered sequence');
        score += 25;
    }

    // Cause-effect transitions
    const causalTransitions = /\b(therefore|thus|hence|consequently|as a result|because of this)\b/gi;
    const causalCount = (text.match(causalTransitions) || []).length;
    if (causalCount >= 3) {
        signals.push('Excessive causal transitions');
        score += 20;
    }

    // Balanced pros/cons structure
    const prosConsPattern = /\b(pros?|advantages?|benefits?)[\s\S]{20,300}(cons?|disadvantages?|drawbacks?)/i;
    if (prosConsPattern.test(text)) {
        signals.push('Pros/cons structure');
        score += 30;
    }

    // "On one hand... on the other hand" pattern
    if (/on (the )?one hand[\s\S]{20,300}on the other hand/i.test(text)) {
        signals.push('Balanced argument structure');
        score += 25;
    }

    return { score: Math.min(100, score), signals };
}

/**
 * Analyze response format patterns
 */
export function analyzeResponseFormat(text) {
    const signals = [];
    let score = 0;

    // Title: content pattern (AI loves clear headers)
    const titlePattern = /^[A-Z][A-Za-z\s]{2,30}:\s*\n/gm;
    const titleMatches = text.match(titlePattern) || [];
    if (titleMatches.length >= 2) {
        signals.push('Section title pattern');
        score += 20;
    }

    // Key: value pairs
    const keyValuePattern = /^\s*\**[A-Z][a-z]+(\s[A-Z][a-z]+)?:\**\s+[A-Z]/gm;
    if ((text.match(keyValuePattern) || []).length >= 3) {
        signals.push('Key-value format');
        score += 25;
    }

    // TL;DR pattern
    if (/\b(tl;?dr|in short|in summary|key takeaway|bottom line)\s*:/i.test(text)) {
        signals.push('Summary section pattern');
        score += 20;
    }

    // Numbered step format
    const stepsPattern = /\bstep\s+\d+:?\s+/gi;
    if ((text.match(stepsPattern) || []).length >= 3) {
        signals.push('Step-by-step format');
        score += 30;
    }

    // FAQ format
    const faqPattern = /\b(q:|question:|a:|answer:)\s/gi;
    if ((text.match(faqPattern) || []).length >= 4) {
        signals.push('FAQ format detected');
        score += 35;
    }

    return { score: Math.min(100, score), signals };
}

/**
 * Analyze tone consistency
 */
export function analyzeToneConsistency(text) {
    const signals = [];
    let score = 0;

    // Check for tone markers
    const formalMarkers = (text.match(/\b(therefore|furthermore|moreover|consequently|nevertheless|notwithstanding)\b/gi) || []).length;
    const casualMarkers = (text.match(/\b(gonna|wanna|gotta|kinda|sorta|yeah|nope|lol|btw|tbh|imo)\b/gi) || []).length;
    const exclamations = (text.match(/!/g) || []).length;
    const questions = (text.match(/\?/g) || []).length;

    // Pure formal (AI-like)
    if (formalMarkers >= 3 && casualMarkers === 0 && exclamations === 0) {
        signals.push('Consistently formal tone');
        score += 20;
    }

    // Check for emotional word absence
    const emotionalWords = /\b(love|hate|amazing|awful|terrible|fantastic|horrible|wonderful|disgusting|beautiful)\b/gi;
    const emotionalCount = (text.match(emotionalWords) || []).length;
    const wordCount = text.split(/\s+/).length;

    if (wordCount > 100 && emotionalCount === 0 && formalMarkers >= 2) {
        signals.push('Neutral/unemotional tone');
        score += 15;
    }

    // Uniform sentence starters
    const sentenceStarters = text.match(/[.!?]\s+([A-Z][a-z]+)/g) || [];
    if (sentenceStarters.length >= 5) {
        const uniqueStarters = new Set(sentenceStarters.map(s => s.replace(/[.!?]\s+/, '').toLowerCase()));
        if (uniqueStarters.size < sentenceStarters.length * 0.5) {
            signals.push('Repetitive sentence starters');
            score += 20;
        }
    }

    return { score: Math.min(100, score), signals };
}

/**
 * Main pattern detection function
 */
export function detectAllPatterns(text) {
    const results = {
        totalScore: 0,
        reasons: [],
        details: {
            phrases: [],
            markdown: [],
            emoji: [],
            disclosure: [],
            template: [],
            structure: null,
            flow: null,
            format: null,
            tone: null
        }
    };

    if (!text || text.length < 20) {
        return results;
    }

    const wordCount = text.split(/\s+/).filter(w => w.length > 0).length;

    // ─── Check AI Phrases ───
    for (const [category, phrases] of Object.entries(AI_PHRASES)) {
        if (Array.isArray(phrases)) {
            for (const phrase of phrases) {
                if (phrase.count) {
                    const matches = text.match(phrase.pattern) || [];
                    if (matches.length >= phrase.threshold) {
                        const addScore = phrase.scoreMulti * Math.min(matches.length, 5);
                        results.totalScore += addScore;
                        results.reasons.push(`${phrase.msg} (${matches.length}×)`);
                        results.details.phrases.push({ ...phrase, matches: matches.length });
                    }
                } else {
                    if (phrase.pattern.test(text)) {
                        results.totalScore += phrase.score;
                        results.reasons.push(phrase.msg);
                        results.details.phrases.push(phrase);
                    }
                }
            }
        }
    }

    // ─── Check Domain-Specific Phrases ───
    for (const [domain, phrases] of Object.entries(AI_PHRASES.domainSpecific || {})) {
        for (const phrase of phrases) {
            if (phrase.pattern.test(text)) {
                results.totalScore += phrase.score;
                results.reasons.push(phrase.msg);
                results.details.phrases.push({ ...phrase, domain });
            }
        }
    }

    // ─── Check Markdown Patterns ───
    for (const [category, patterns] of Object.entries(MARKDOWN_PATTERNS)) {
        const patternList = Array.isArray(patterns) ? patterns : [patterns];
        for (const pattern of patternList) {
            if (!pattern.pattern) continue;
            if (pattern.count) {
                const matches = text.match(pattern.pattern) || [];
                if (matches.length >= pattern.threshold) {
                    const addScore = pattern.scoreMulti * Math.min(matches.length, 5);
                    results.totalScore += addScore;
                    results.reasons.push(`${pattern.msg} (${matches.length}×)`);
                    results.details.markdown.push({ ...pattern, matches: matches.length });
                }
            } else {
                if (pattern.pattern.test(text)) {
                    results.totalScore += pattern.score;
                    results.reasons.push(pattern.msg);
                    results.details.markdown.push(pattern);
                }
            }
        }
    }

    // ─── Check Emoji Patterns ───
    for (const [key, pattern] of Object.entries(EMOJI_PATTERNS)) {
        if (!pattern.pattern) continue;
        if (pattern.count) {
            const matches = text.match(pattern.pattern) || [];
            if (matches.length >= pattern.threshold) {
                const addScore = pattern.scoreMulti * matches.length;
                results.totalScore += addScore;
                results.reasons.push(`${pattern.msg} (${matches.length}×)`);
                results.details.emoji.push({ ...pattern, matches: matches.length });
            }
        } else {
            const matches = text.match(pattern.pattern) || [];
            if (matches.length > 0) {
                results.totalScore += pattern.score * (pattern.score < 0 ? matches.length : 1);
                if (pattern.score > 0) {
                    results.reasons.push(pattern.msg);
                }
                results.details.emoji.push({ ...pattern, matches: matches.length });
            }
        }
    }

    // ─── Check Self-Disclosure Patterns ───
    for (const [category, patterns] of Object.entries(SELF_DISCLOSURE_PATTERNS)) {
        for (const pattern of patterns) {
            if (pattern.pattern.test(text)) {
                results.totalScore += pattern.score;
                results.reasons.push(pattern.msg);
                results.details.disclosure.push(pattern);
            }
        }
    }

    // ─── Check Template Phrases ───
    for (const [category, phrases] of Object.entries(TEMPLATE_PHRASES)) {
        for (const phrase of phrases) {
            if (phrase.pattern.test(text)) {
                results.totalScore += phrase.score;
                results.reasons.push(phrase.msg);
                results.details.template.push({ ...phrase, category });
            }
        }
    }

    // ─── Run Structure Analysis (for longer text) ───
    if (wordCount >= 50) {
        const structureResult = analyzeStructurePatterns(text);
        results.totalScore += structureResult.score;
        results.reasons.push(...structureResult.signals);
        results.details.structure = structureResult;

        const flowResult = analyzeLogicalFlow(text);
        results.totalScore += flowResult.score;
        results.reasons.push(...flowResult.signals);
        results.details.flow = flowResult;

        const formatResult = analyzeResponseFormat(text);
        results.totalScore += formatResult.score;
        results.reasons.push(...formatResult.signals);
        results.details.format = formatResult;

        const toneResult = analyzeToneConsistency(text);
        results.totalScore += toneResult.score;
        results.reasons.push(...toneResult.signals);
        results.details.tone = toneResult;
    }

    // Cap and deduplicate
    results.totalScore = Math.min(100, Math.max(0, results.totalScore));
    results.reasons = [...new Set(results.reasons)];

    return results;
}

// Export for use
export default {
    AI_PHRASES,
    MARKDOWN_PATTERNS,
    EMOJI_PATTERNS,
    SELF_DISCLOSURE_PATTERNS,
    TEMPLATE_PHRASES,
    detectAllPatterns,
    analyzeStructurePatterns,
    analyzeLogicalFlow,
    analyzeResponseFormat,
    analyzeToneConsistency
};
