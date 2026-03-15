// ShareSafe - Statistical Text Analysis Module
// Non-LLM feature extraction for AI-generated content detection

/**
 * Compute statistical features for text segments
 * These features form the foundation of explainable AI detection
 */

// ═══════════════════════════════════════════════════════════════
// SENTENCE ANALYSIS
// ═══════════════════════════════════════════════════════════════

function analyzeSentences(text) {
  // Split into sentences (handle multiple punctuation patterns)
  const sentences = text
    .split(/[.!?]+/)
    .map(s => s.trim())
    .filter(s => s.length > 0);
  
  if (sentences.length === 0) return { mean: 0, variance: 0, count: 0 };
  
  const lengths = sentences.map(s => s.split(/\s+/).length);
  const mean = lengths.reduce((a, b) => a + b, 0) / lengths.length;
  
  // Calculate variance
  const variance = lengths.reduce((sum, len) => sum + Math.pow(len - mean, 2), 0) / lengths.length;
  
  return {
    mean,
    variance,
    stdDev: Math.sqrt(variance),
    count: sentences.length,
    minLength: Math.min(...lengths),
    maxLength: Math.max(...lengths),
    lengths
  };
}

// ═══════════════════════════════════════════════════════════════
// TOKEN ENTROPY (Measures predictability)
// ═══════════════════════════════════════════════════════════════

function calculateTokenEntropy(text) {
  const tokens = text.toLowerCase()
    .replace(/[^\w\s]/g, ' ')
    .split(/\s+/)
    .filter(t => t.length > 0);
  
  if (tokens.length === 0) return 0;
  
  // Count token frequencies
  const frequencies = {};
  tokens.forEach(token => {
    frequencies[token] = (frequencies[token] || 0) + 1;
  });
  
  // Calculate Shannon entropy
  const totalTokens = tokens.length;
  let entropy = 0;
  
  Object.values(frequencies).forEach(count => {
    const probability = count / totalTokens;
    entropy -= probability * Math.log2(probability);
  });
  
  return entropy;
}

// ═══════════════════════════════════════════════════════════════
// N-GRAM REPETITION RATE
// ═══════════════════════════════════════════════════════════════

function analyzeNgramRepetition(text, n = 3) {
  const words = text.toLowerCase()
    .replace(/[^\w\s]/g, ' ')
    .split(/\s+/)
    .filter(w => w.length > 0);
  
  if (words.length < n) return { repetitionRate: 0, uniqueRatio: 1 };
  
  const ngrams = [];
  for (let i = 0; i <= words.length - n; i++) {
    ngrams.push(words.slice(i, i + n).join(' '));
  }
  
  const uniqueNgrams = new Set(ngrams);
  const repetitionRate = 1 - (uniqueNgrams.size / ngrams.length);
  
  // Find most repeated n-grams
  const ngramCounts = {};
  ngrams.forEach(ng => {
    ngramCounts[ng] = (ngramCounts[ng] || 0) + 1;
  });
  
  const repeated = Object.entries(ngramCounts)
    .filter(([_, count]) => count > 1)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5);
  
  return {
    repetitionRate,
    uniqueRatio: uniqueNgrams.size / ngrams.length,
    totalNgrams: ngrams.length,
    uniqueNgrams: uniqueNgrams.size,
    mostRepeated: repeated
  };
}

// ═══════════════════════════════════════════════════════════════
// READABILITY SCORE (Flesch-Kincaid Grade Level)
// ═══════════════════════════════════════════════════════════════

function calculateReadability(text) {
  const sentences = text.split(/[.!?]+/).filter(s => s.trim().length > 0);
  const words = text.split(/\s+/).filter(w => w.length > 0);
  const syllables = countSyllables(text);
  
  if (sentences.length === 0 || words.length === 0) {
    return { grade: 0, score: 0 };
  }
  
  // Flesch-Kincaid Grade Level
  const avgWordsPerSentence = words.length / sentences.length;
  const avgSyllablesPerWord = syllables / words.length;
  const fleschKincaid = 0.39 * avgWordsPerSentence + 11.8 * avgSyllablesPerWord - 15.59;
  
  // Flesch Reading Ease
  const fleschEase = 206.835 - 1.015 * avgWordsPerSentence - 84.6 * avgSyllablesPerWord;
  
  return {
    grade: Math.max(0, fleschKincaid),
    readingEase: fleschEase,
    avgWordsPerSentence,
    avgSyllablesPerWord,
    interpretation: interpretReadability(fleschEase)
  };
}

function countSyllables(text) {
  const words = text.toLowerCase().replace(/[^\w\s]/g, '').split(/\s+/);
  let totalSyllables = 0;
  
  words.forEach(word => {
    if (word.length === 0) return;
    
    // Basic syllable counting algorithm
    word = word.replace(/(?:[^laeiouy]es|ed|[^laeiouy]e)$/, '');
    word = word.replace(/^y/, '');
    const matches = word.match(/[aeiouy]{1,2}/g);
    totalSyllables += matches ? matches.length : 1;
  });
  
  return totalSyllables;
}

function interpretReadability(score) {
  if (score >= 90) return 'Very Easy';
  if (score >= 80) return 'Easy';
  if (score >= 70) return 'Fairly Easy';
  if (score >= 60) return 'Standard';
  if (score >= 50) return 'Fairly Difficult';
  if (score >= 30) return 'Difficult';
  return 'Very Difficult';
}

// ═══════════════════════════════════════════════════════════════
// POS TAG REGULARITY (Simplified heuristic-based)
// ═══════════════════════════════════════════════════════════════

function analyzePOSRegularity(text) {
  const words = text.split(/\s+/).filter(w => w.length > 0);
  
  if (words.length === 0) return { regularity: 0, diversity: 0 };
  
  // Simplified POS detection using word patterns
  const patterns = {
    determiners: /^(the|a|an|this|that|these|those|my|your|his|her|its|our|their)$/i,
    prepositions: /^(in|on|at|to|for|of|with|by|from|up|about|into|through|during|before|after|above|below|between|under|over)$/i,
    conjunctions: /^(and|but|or|nor|for|yet|so|because|although|unless|while|if|when|where)$/i,
    pronouns: /^(i|you|he|she|it|we|they|me|him|her|us|them|who|what|which)$/i,
    modals: /^(can|could|may|might|must|shall|should|will|would)$/i,
    beVerbs: /^(am|is|are|was|were|be|been|being)$/i
  };
  
  const posCounts = {
    determiners: 0,
    prepositions: 0,
    conjunctions: 0,
    pronouns: 0,
    modals: 0,
    beVerbs: 0,
    other: 0
  };
  
  words.forEach(word => {
    const lower = word.toLowerCase();
    let matched = false;
    
    for (const [pos, pattern] of Object.entries(patterns)) {
      if (pattern.test(lower)) {
        posCounts[pos]++;
        matched = true;
        break;
      }
    }
    
    if (!matched) posCounts.other++;
  });
  
  // Calculate regularity (variance in POS distribution)
  const counts = Object.values(posCounts);
  const mean = counts.reduce((a, b) => a + b, 0) / counts.length;
  const variance = counts.reduce((sum, c) => sum + Math.pow(c - mean, 2), 0) / counts.length;
  
  // AI text tends to have more regular POS patterns
  const regularity = 1 / (1 + variance / mean); // Normalize to [0,1]
  
  return {
    regularity,
    diversity: Object.values(posCounts).filter(c => c > 0).length / Object.keys(posCounts).length,
    distribution: posCounts,
    totalWords: words.length
  };
}

// ═══════════════════════════════════════════════════════════════
// PUNCTUATION ANALYSIS
// ═══════════════════════════════════════════════════════════════

function analyzePunctuation(text) {
  const punctuationMarks = text.match(/[.,!?;:'"()—–-]/g) || [];
  const words = text.split(/\s+/).filter(w => w.length > 0);
  
  const punctuationTypes = {
    periods: (text.match(/\./g) || []).length,
    commas: (text.match(/,/g) || []).length,
    exclamation: (text.match(/!/g) || []).length,
    question: (text.match(/\?/g) || []).length,
    semicolon: (text.match(/;/g) || []).length,
    colon: (text.match(/:/g) || []).length,
    quotes: (text.match(/['"]/g) || []).length,
    dashes: (text.match(/[—–-]/g) || []).length
  };
  
  return {
    total: punctuationMarks.length,
    ratio: words.length > 0 ? punctuationMarks.length / words.length : 0,
    diversity: Object.values(punctuationTypes).filter(c => c > 0).length,
    distribution: punctuationTypes
  };
}

// ═══════════════════════════════════════════════════════════════
// LEXICAL DIVERSITY (Type-Token Ratio)
// ═══════════════════════════════════════════════════════════════

function calculateLexicalDiversity(text) {
  const words = text.toLowerCase()
    .replace(/[^\w\s]/g, ' ')
    .split(/\s+/)
    .filter(w => w.length > 0);
  
  if (words.length === 0) return { ttr: 0, uniqueWords: 0 };
  
  const uniqueWords = new Set(words);
  const ttr = uniqueWords.size / words.length;
  
  // Moving-average type-token ratio (MATTR) for longer texts
  const windowSize = Math.min(100, words.length);
  let mattr = 0;
  
  if (words.length >= windowSize) {
    let windows = 0;
    for (let i = 0; i <= words.length - windowSize; i += 10) {
      const window = words.slice(i, i + windowSize);
      const windowUnique = new Set(window);
      mattr += windowUnique.size / windowSize;
      windows++;
    }
    mattr /= windows;
  } else {
    mattr = ttr;
  }
  
  return {
    ttr,
    mattr,
    uniqueWords: uniqueWords.size,
    totalWords: words.length,
    interpretation: ttr > 0.7 ? 'High diversity' : ttr > 0.5 ? 'Moderate diversity' : 'Low diversity'
  };
}

// ═══════════════════════════════════════════════════════════════
// NORMALIZE FEATURES (Z-score normalization)
// ═══════════════════════════════════════════════════════════════

// Human baseline values (estimated from diverse human-written content)
const HUMAN_BASELINES = {
  sentenceLengthMean: { mean: 18, stdDev: 6 },
  sentenceLengthVariance: { mean: 45, stdDev: 25 },
  tokenEntropy: { mean: 8.5, stdDev: 1.5 },
  ngramRepetition: { mean: 0.15, stdDev: 0.1 },
  readabilityGrade: { mean: 10, stdDev: 3 },
  posRegularity: { mean: 0.45, stdDev: 0.15 },
  lexicalDiversity: { mean: 0.65, stdDev: 0.15 }
};

function normalizeFeature(value, baseline) {
  // Z-score normalization
  const z = (value - baseline.mean) / baseline.stdDev;
  
  // Convert to [0,1] where higher = more AI-like
  // AI text tends to be more regular, so high/low extremes indicate AI
  const normalized = Math.abs(z) / 3; // 3 standard deviations covers ~99.7%
  return Math.min(1, Math.max(0, normalized));
}

// ═══════════════════════════════════════════════════════════════
// COMPREHENSIVE STATISTICAL ANALYSIS
// ═══════════════════════════════════════════════════════════════

export function analyzeTextStatistics(text) {
  if (!text || text.trim().length < 10) {
    return {
      score: 0,
      confidence: 0,
      features: {},
      reasons: ['Text too short for analysis']
    };
  }
  
  // Extract all features
  const sentences = analyzeSentences(text);
  const entropy = calculateTokenEntropy(text);
  const ngrams = analyzeNgramRepetition(text, 3);
  const readability = calculateReadability(text);
  const pos = analyzePOSRegularity(text);
  const punctuation = analyzePunctuation(text);
  const lexical = calculateLexicalDiversity(text);
  
  // Normalize features
  const normalizedFeatures = {
    sentenceLengthVariance: normalizeFeature(sentences.variance, HUMAN_BASELINES.sentenceLengthVariance),
    sentenceLengthMean: normalizeFeature(sentences.mean, HUMAN_BASELINES.sentenceLengthMean),
    tokenEntropy: normalizeFeature(entropy, HUMAN_BASELINES.tokenEntropy),
    ngramRepetition: normalizeFeature(ngrams.repetitionRate, HUMAN_BASELINES.ngramRepetition),
    readabilityGrade: normalizeFeature(readability.grade, HUMAN_BASELINES.readabilityGrade),
    posRegularity: normalizeFeature(pos.regularity, HUMAN_BASELINES.posRegularity),
    lexicalDiversity: normalizeFeature(1 - lexical.ttr, { mean: 0.35, stdDev: 0.15 }) // Inverted - low diversity is AI-like
  };
  
  // Weighted scoring (sum to 1.0)
  const weights = {
    sentenceLengthVariance: 0.20, // Very important - AI has consistent length
    ngramRepetition: 0.18,         // AI repeats patterns
    lexicalDiversity: 0.15,        // AI uses limited vocabulary
    tokenEntropy: 0.15,            // AI is more predictable
    posRegularity: 0.15,           // AI has regular grammar
    readabilityGrade: 0.10,        // Less important but still useful
    sentenceLengthMean: 0.07       // Least important
  };
  
  // Calculate weighted score
  let score = 0;
  Object.keys(normalizedFeatures).forEach(feature => {
    score += normalizedFeatures[feature] * weights[feature];
  });
  
  // Convert to 0-100 scale
  score = score * 100;
  
  // Generate reasons based on strongest signals
  const reasons = [];
  const threshold = 0.6; // Features above this are notable
  
  if (normalizedFeatures.sentenceLengthVariance > threshold) {
    if (sentences.variance < HUMAN_BASELINES.sentenceLengthVariance.mean * 0.5) {
      reasons.push('Unusually uniform sentence lengths');
    } else {
      reasons.push('Highly variable sentence structure');
    }
  }
  
  if (normalizedFeatures.ngramRepetition > threshold) {
    reasons.push(`Repetitive phrasing (${(ngrams.repetitionRate * 100).toFixed(0)}% repeated)`);
  }
  
  if (normalizedFeatures.lexicalDiversity > threshold) {
    reasons.push(`Limited vocabulary diversity (TTR: ${(lexical.ttr * 100).toFixed(0)}%)`);
  }
  
  if (normalizedFeatures.tokenEntropy > threshold) {
    if (entropy < HUMAN_BASELINES.tokenEntropy.mean) {
      reasons.push('Predictable word patterns');
    } else {
      reasons.push('Unusually random word distribution');
    }
  }
  
  if (normalizedFeatures.posRegularity > threshold) {
    reasons.push('Overly regular grammatical structure');
  }
  
  // Calculate confidence based on text length and feature agreement
  const wordCount = text.split(/\s+/).length;
  let confidence = Math.min(1, wordCount / 100); // More words = higher confidence
  
  // Feature agreement: how many features agree on AI-likeness
  const featuresCount = Object.values(normalizedFeatures).length;
  const aiLikeFeatures = Object.values(normalizedFeatures).filter(v => v > 0.4).length;
  const agreement = aiLikeFeatures / featuresCount;
  confidence *= agreement;
  
  return {
    score,
    confidence: confidence * 100,
    normalizedFeatures,
    rawFeatures: {
      sentences,
      entropy,
      ngrams,
      readability,
      pos,
      punctuation,
      lexical
    },
    reasons,
    interpretation: score > 65 ? 'Likely AI-generated' : 
                   score > 35 ? 'Uncertain - mixed signals' : 
                   'Likely human-written'
  };
}

// ═══════════════════════════════════════════════════════════════
// EXPORT FOR USE IN OTHER MODULES
// ═══════════════════════════════════════════════════════════════

export {
  analyzeSentences,
  calculateTokenEntropy,
  analyzeNgramRepetition,
  calculateReadability,
  analyzePOSRegularity,
  analyzePunctuation,
  calculateLexicalDiversity,
  normalizeFeature,
  HUMAN_BASELINES
};
