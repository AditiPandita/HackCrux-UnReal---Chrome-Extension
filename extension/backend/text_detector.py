"""
UnReal - Ensemble AI Text Detection API
Backend service for text analysis using an ensemble of signals.

Signals combined:
  1. RoBERTa classifier probability  (openai-community/roberta-base-openai-detector)
  2. Perplexity score                 (GPT-2 language model — optional, graceful degradation)
  3. Stylometric features             (sentence-length variance, lexical diversity, punctuation)
  4. N-gram repetition detection      (4-gram overlap ratio)

Confidence is calculated from:
  - Segment-prediction variance
  - Segment consensus ratio
  - Model probability entropy

Usage:
    python text_detector.py

Endpoint:
    POST http://localhost:8001/detect
    { "text": "Content to analyze..." }
"""

import math
import re
import string
import logging
import os
from collections import Counter

import torch
from flask import Flask, request, jsonify
from flask_cors import CORS
from transformers import (
    AutoTokenizer,
    AutoModelForSequenceClassification,
    GPT2LMHeadModel,
    GPT2TokenizerFast,
)

# ---------------------------------------------------------------------------
# Configuration
# ---------------------------------------------------------------------------
MODEL_NAME = "roberta-base-openai-detector"
PERPLEXITY_MODEL_NAME = "gpt2"
PORT = 8001
HOST = "127.0.0.1"
MIN_WORDS = 15
MIN_TOKENS_FOR_HIGH_CONFIDENCE = 100  # flag low-context texts

# Weight given to supporting signals in the final score blend.
# RoBERTa (primary) contributes (1 - SUPPORT_BLEND_WEIGHT) of the final score.
# Keep this ≤ 0.20 to preserve the original score distribution and frontend
# risk-threshold calibration (High Risk ≥ 60, Medium Risk 35-59).
SUPPORT_BLEND_WEIGHT = 0.15

# Local / fallback model paths
SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))
MODEL_PATH = os.path.join(SCRIPT_DIR, "text_model")
FALLBACK_MODEL_ID = "openai-community/roberta-base-openai-detector"

# ---------------------------------------------------------------------------
# Logging & Flask setup
# ---------------------------------------------------------------------------
logging.basicConfig(level=logging.INFO, format="%(asctime)s - %(levelname)s - %(message)s")
logger = logging.getLogger(__name__)

app = Flask(__name__)
CORS(app)

# ---------------------------------------------------------------------------
# Global model handles
# ---------------------------------------------------------------------------
tokenizer = None
model = None
perplexity_tokenizer = None
perplexity_model = None


# ---------------------------------------------------------------------------
# Model loading
# ---------------------------------------------------------------------------
def load_model():
    """Load RoBERTa classifier and (optionally) GPT-2 perplexity estimator."""
    global tokenizer, model, perplexity_tokenizer, perplexity_model

    # --- RoBERTa classifier --------------------------------------------------
    try:
        if os.path.isdir(MODEL_PATH):
            logger.info(f"Loading classifier from local path: {MODEL_PATH}...")
            tokenizer = AutoTokenizer.from_pretrained(MODEL_PATH, local_files_only=True)
            model = AutoModelForSequenceClassification.from_pretrained(MODEL_PATH, local_files_only=True)
        else:
            logger.info(f"Local text model not found. Downloading {FALLBACK_MODEL_ID} from HuggingFace...")
            tokenizer = AutoTokenizer.from_pretrained(FALLBACK_MODEL_ID)
            model = AutoModelForSequenceClassification.from_pretrained(FALLBACK_MODEL_ID)
        model.eval()
        logger.info("RoBERTa classifier loaded successfully.")
    except Exception as exc:
        logger.error(f"Failed to load RoBERTa classifier: {exc}")
        raise

    # --- GPT-2 perplexity estimator (optional) --------------------------------
    try:
        logger.info("Loading GPT-2 for perplexity scoring...")
        perplexity_tokenizer = GPT2TokenizerFast.from_pretrained(PERPLEXITY_MODEL_NAME)
        perplexity_model = GPT2LMHeadModel.from_pretrained(PERPLEXITY_MODEL_NAME)
        perplexity_model.eval()
        logger.info("GPT-2 perplexity model loaded successfully.")
    except Exception as exc:
        logger.warning(f"GPT-2 unavailable ({exc}). Perplexity weight will be redistributed to other signals.")
        perplexity_tokenizer = None
        perplexity_model = None


# ---------------------------------------------------------------------------
# Signal 1: RoBERTa classifier
# ---------------------------------------------------------------------------
def _run_roberta(text: str) -> float:
    """
    Run RoBERTa on a single text string and return the AI probability.

    Uses the exact inference pipeline from the original working detector:
        tokenizer(text, return_tensors="pt", truncation=True, max_length=512)
        → model(**inputs)
        → softmax
        → probs[0][0]   (Label 0 = "Fake" / AI-generated)
        → probs[0][1]   (Label 1 = "Real" / human-written)

    IMPORTANT — label mapping for openai-community/roberta-base-openai-detector:
        id2label = {"0": "Fake", "1": "Real"}
    So index 0 is the AI/Fake probability.
    """
    inputs = tokenizer(text, return_tensors="pt", truncation=True, max_length=512)
    with torch.no_grad():
        outputs = model(**inputs)
        logits = outputs.logits
        probs = torch.softmax(logits, dim=1)
        ai_prob = probs[0][0].item()   # Label 0 = Fake (AI-generated)
    return ai_prob


def compute_roberta_probability(text: str) -> tuple:
    """
    Compute RoBERTa AI probability, with a sentence-based sliding window for
    texts that exceed 512 tokens so that every chunk is a properly-formed
    piece of prose (not a raw mid-sentence token slice).

    Returns:
        (mean_ai_probability: float, per_chunk_ai_probs: list[float])
    """
    CHUNK_WORDS = 300  # ~400 tokens; each chunk well within 512-token limit

    token_count = len(tokenizer(text, truncation=False, add_special_tokens=True)["input_ids"])
    if token_count <= 512:
        ai_prob = _run_roberta(text)
        return ai_prob, [ai_prob]

    # Build sentence-level chunks so special tokens are always at boundaries
    sentences = re.split(r"(?<=[.!?])\s+", text.strip())
    chunks, current, current_wc = [], [], 0
    for sent in sentences:
        current.append(sent)
        current_wc += len(sent.split())
        if current_wc >= CHUNK_WORDS:
            chunks.append(" ".join(current))
            current, current_wc = [], 0
    if current:
        chunks.append(" ".join(current))

    if not chunks:
        ai_prob = _run_roberta(text)
        return ai_prob, [ai_prob]

    segment_probs = [_run_roberta(ch) for ch in chunks if ch.strip()]
    if not segment_probs:
        ai_prob = _run_roberta(text)
        return ai_prob, [ai_prob]

    mean_ai_prob = sum(segment_probs) / len(segment_probs)
    return mean_ai_prob, segment_probs


# ---------------------------------------------------------------------------
# Signal 2: Perplexity via GPT-2
# ---------------------------------------------------------------------------
def compute_perplexity(text: str) -> float:
    """
    Estimate text perplexity with GPT-2.

    AI-generated text tends to be more predictable → lower perplexity.

    Returns:
        Normalised AI-likelihood score in [0, 1].
        Higher value means more AI-like (lower raw perplexity).
    """
    if perplexity_model is None or perplexity_tokenizer is None:
        return 0.5  # Neutral fallback when model is unavailable

    GPT2_MAX_LEN = 1024
    STRIDE = 512

    try:
        enc = perplexity_tokenizer(text, return_tensors="pt", truncation=True, max_length=GPT2_MAX_LEN * 2)
        input_ids = enc.input_ids
        seq_len = input_ids.size(1)

        if seq_len < 2:
            return 0.5

        nlls = []
        prev_end = 0
        for begin in range(0, seq_len, STRIDE):
            end = min(begin + GPT2_MAX_LEN, seq_len)
            trg_len = end - prev_end
            chunk = input_ids[:, begin:end]
            labels = chunk.clone()
            labels[:, :-trg_len] = -100  # mask context tokens from loss

            with torch.no_grad():
                outputs = perplexity_model(chunk, labels=labels)
                nlls.append(outputs.loss)

            prev_end = end
            if end == seq_len:
                break

        ppl = math.exp(torch.stack(nlls).mean().item())

        # Empirical normalisation:
        # AI text perplexity typically ~20-80, human text ~80-400+.
        # Map ppl=20 → 1.0 (very AI-like), ppl=400 → 0.0 (human-like).
        normalized = 1.0 - min(1.0, max(0.0, (ppl - 20.0) / 380.0))
        return round(normalized, 4)

    except Exception as exc:
        logger.warning(f"Perplexity computation failed: {exc}")
        return 0.5


# ---------------------------------------------------------------------------
# Signal 3: Stylometric features
# ---------------------------------------------------------------------------
def compute_stylometric_features(text: str) -> tuple:
    """
    Extract writing-style features that distinguish AI from human text.

    AI text hallmarks:
      - Low sentence-length variance (uniform sentence rhythm)
      - Low lexical diversity (repetitive vocabulary)
      - Lower casual punctuation density
      - Consistent moderate sentence length (~18-22 words)

    Returns:
        (stylometric_ai_score: float in [0,1], feature_dict: dict)
    """
    sentences = [s.strip() for s in re.split(r"(?<=[.!?])\s+", text.strip()) if s.strip()]
    words = text.split()

    # 1. Sentence-length variance -------------------------------------------
    if len(sentences) > 1:
        sent_lens = [len(s.split()) for s in sentences]
        mean_len = sum(sent_lens) / len(sent_lens)
        variance = sum((l - mean_len) ** 2 for l in sent_lens) / len(sent_lens)
        sent_length_variance = round(variance, 2)
        # Low variance (< 10) → AI-like (score near 1); high (> 100) → human-like (score near 0)
        variance_ai_score = max(0.0, 1.0 - variance / 100.0)
    else:
        sent_length_variance = 0.0
        variance_ai_score = 0.5

    # 2. Lexical diversity (type-token ratio, TTR) ---------------------------
    if words:
        clean_words = [w.lower().strip(string.punctuation) for w in words if w.strip(string.punctuation)]
        ttr = len(set(clean_words)) / len(clean_words) if clean_words else 0.5
        lexical_diversity = round(ttr, 4)
        # Low TTR → repetitive → AI-like; high TTR → diverse → human-like
        diversity_ai_score = max(0.0, 1.0 - ttr)
    else:
        lexical_diversity = 0.5
        diversity_ai_score = 0.5

    # 3. Punctuation frequency -----------------------------------------------
    punct_count = sum(1 for c in text if c in string.punctuation)
    punct_ratio = punct_count / max(len(text), 1)
    punct_ai_score = max(0.0, 1.0 - punct_ratio / 0.10)  # < 3 % punctuation is AI-like

    # 4. Average sentence length ---------------------------------------------
    avg_sent_len = sum(len(s.split()) for s in sentences) / max(len(sentences), 1)
    if 15 <= avg_sent_len <= 25:
        sent_len_ai_score = 0.70      # Classic AI "sweet spot"
    elif 10 <= avg_sent_len < 15 or 25 < avg_sent_len <= 35:
        sent_len_ai_score = 0.40
    else:
        sent_len_ai_score = 0.20

    # Weighted combination
    stylometric_score = round(
        0.35 * variance_ai_score +
        0.35 * diversity_ai_score +
        0.15 * punct_ai_score +
        0.15 * sent_len_ai_score,
        4,
    )

    features = {
        "sentence_length_variance": sent_length_variance,
        "lexical_diversity": lexical_diversity,
        "avg_sentence_length": round(avg_sent_len, 2),
        "punctuation_ratio": round(punct_ratio, 4),
    }
    return stylometric_score, features


# ---------------------------------------------------------------------------
# Signal 4: N-gram repetition
# ---------------------------------------------------------------------------
def compute_ngram_repetition(text: str, n: int = 4) -> tuple:
    """
    Detect repeated n-grams as a proxy for formulaic AI phrasing.

    Returns:
        (repetition_score: float in [0,1], repeated_phrases: list[str])
    """
    words = [w.lower().strip(string.punctuation) for w in text.split()]
    if len(words) < n:
        return 0.0, []

    ngrams = [tuple(words[i : i + n]) for i in range(len(words) - n + 1)]
    counts = Counter(ngrams)
    repeated = {gram: cnt for gram, cnt in counts.items() if cnt > 1}

    repeated_token_count = sum(cnt * n for cnt in repeated.values())
    repetition_score = min(1.0, repeated_token_count / max(len(words), 1))

    top_phrases = [" ".join(gram) for gram, _ in sorted(repeated.items(), key=lambda x: -x[1])[:5]]
    return round(repetition_score, 4), top_phrases


# ---------------------------------------------------------------------------
# Segment consensus (paragraph-level agreement)
# ---------------------------------------------------------------------------
def compute_segment_consensus(text: str) -> tuple:
    """
    Split text into meaningful segments, run RoBERTa on each, and compute
    how many agree that the text is AI-generated.

    Returns:
        (consensus_ratio: float, segment_scores: list[float], variance: float)
    """
    # Try paragraph splits first, then fall back to sentence-chunk splits
    paragraphs = [p.strip() for p in re.split(r"\n\n+|\n(?=[A-Z])", text) if len(p.strip().split()) >= 10]

    if len(paragraphs) <= 1:
        sentences = re.split(r"(?<=[.!?])\s+", text)
        chunk, chunk_words, paragraphs = [], 0, []
        for sent in sentences:
            chunk.append(sent)
            chunk_words += len(sent.split())
            if chunk_words >= 40:
                paragraphs.append(" ".join(chunk))
                chunk, chunk_words = [], 0
        if chunk:
            paragraphs.append(" ".join(chunk))

    # Filter trivially short segments
    segments = [p for p in paragraphs if len(p.split()) >= 10]

    if len(segments) <= 1:
        ai_prob = _run_roberta(text)
        return (1.0 if ai_prob >= 0.5 else 0.0), [ai_prob], 0.0

    segment_scores = [_run_roberta(seg) for seg in segments]

    if not segment_scores:
        ai_prob = _run_roberta(text)
        return (1.0 if ai_prob >= 0.5 else 0.0), [ai_prob], 0.0

    ai_count = sum(1 for s in segment_scores if s >= 0.5)
    consensus_ratio = ai_count / len(segment_scores)

    mean = sum(segment_scores) / len(segment_scores)
    variance = sum((s - mean) ** 2 for s in segment_scores) / len(segment_scores)

    return consensus_ratio, segment_scores, variance


# ---------------------------------------------------------------------------
# Entropy helper
# ---------------------------------------------------------------------------
def _binary_entropy(p: float) -> float:
    """Compute binary entropy H(p). Returns value in [0, 1]."""
    p = max(1e-9, min(1.0 - 1e-9, p))
    q = 1.0 - p
    return -(p * math.log2(p) + q * math.log2(q))


# ---------------------------------------------------------------------------
# Flask endpoint
# ---------------------------------------------------------------------------
@app.route("/detect", methods=["POST"])
def detect():
    """
    RoBERTa-primary AI text detection with lightweight supporting signals.

    Score architecture:
      final_ai_score = 0.85 * roberta_probability
                     + 0.15 * avg(perplexity, stylometric, repetition)

    This keeps the score distribution faithful to the original RoBERTa-only
    baseline so existing frontend risk thresholds (High ≥ 60, Medium 35-59)
    continue to work as expected.  Supporting signals provide a gentle nudge
    and enrich the explanation output without overriding the primary model.

    Confidence is stability-based (segment agreement + entropy) and does NOT
    affect ai_score magnitude — it is a separate trustworthiness indicator.

    Request body (JSON):
        { "text": "<content to analyse>" }

    Response (JSON) — backward-compat keys preserved:
        {
            "ai_score":          0-100,  # final blended, RoBERTa-primary
            "human_score":       0-100,
            "confidence":        0-100,  # stability-based
            "note":              string, # human-readable verdict
            "model_probability": 0-100,  # raw RoBERTa AI probability
            "perplexity_score":  0-100,
            "stylometric_score": 0-100,
            "segment_consensus": 0-100,  # % segments voting AI
            "is_formal_style":   bool,
            "ml_warning":        string,
            "explanations":      [...],
            ...
        }
    """
    try:
        data = request.get_json(force=True)
        if not data or "text" not in data:
            return jsonify({"error": "Missing 'text' field"}), 400

        text = data["text"]
        word_count = len(text.split())

        if word_count < MIN_WORDS:
            return jsonify(
                {
                    "ai_score": 0,
                    "human_score": 100,
                    "confidence": 0,
                    "note": "Insufficient text for reliable ML inference",
                    "model_probability": 0,
                    "perplexity_score": 0,
                    "stylometric_score": 0,
                    "segment_consensus": 0,
                    "model": MODEL_NAME,
                    "method": "roberta_primary",
                    "is_formal_style": False,
                    "ml_warning": "",
                    "text_length": word_count,
                    "explanations": ["Insufficient text for reliable analysis."],
                }
            )

        explanations = []

        # ── Token count check ───────────────────────────────────────────────
        token_count = len(tokenizer(text, truncation=False)["input_ids"])
        low_context = token_count < MIN_TOKENS_FOR_HIGH_CONFIDENCE
        if low_context:
            explanations.append("Low confidence due to limited text length.")

        # ── PRIMARY: RoBERTa classifier ─────────────────────────────────────
        # Sliding-window mean over 512-token chunks for long texts.
        roberta_ai_prob, _ = compute_roberta_probability(text)
        base_ai_score = roberta_ai_prob * 100.0  # the dominant score driver

        # ── SUPPORTING signals ──────────────────────────────────────────────
        perplexity_ai_score = compute_perplexity(text)
        stylometric_ai_score, style_features = compute_stylometric_features(text)
        repetition_score, repeated_phrases = compute_ngram_repetition(text, n=4)

        support_avg = (perplexity_ai_score + stylometric_ai_score + repetition_score) / 3.0

        # ── FINAL AI SCORE (RoBERTa-primary blend) ──────────────────────────
        # RoBERTa drives 85 % of the score; supporting signals contribute 15 %.
        # At neutral support (~0.33 avg), a RoBERTa score of 80 becomes ~72 —
        # still firmly High Risk.  Threshold crossings are preserved.
        final_ai = (1.0 - SUPPORT_BLEND_WEIGHT) * base_ai_score + SUPPORT_BLEND_WEIGHT * support_avg * 100.0
        final_ai = max(0.0, min(100.0, final_ai))
        ai_score    = round(final_ai, 2)
        human_score = round(100.0 - ai_score, 2)

        # ── SEGMENT CONSENSUS (confidence only, no score override) ──────────
        consensus_ratio, segment_scores, segment_variance = compute_segment_consensus(text)

        # Soft mean probability across segments (continuous, avoids hard 0/1 flip at p=0.5)
        mean_seg_prob = sum(segment_scores) / len(segment_scores) if segment_scores else roberta_ai_prob
        # Distance from the maximum-uncertainty midpoint (0 = toss-up, 1 = unanimous)
        soft_consensus = abs(mean_seg_prob - 0.5) * 2.0

        # ── CONFIDENCE ───────────────────────────────────────────────────────
        # Based on two independent signals:
        #   • Model certainty — entropy of roberta probabilities (70 % weight)
        #     entropy = 0 → model is decisive, confidence contribution = 70
        #     entropy = 1 → model is maximally uncertain, contribution = 0
        #   • Text length adequacy (30 % weight)
        #     < 100 tokens → partial credit; ≥ 100 tokens → full credit
        # Clamped to [15, 100] so we never report 0 % confidence on real output.
        entropy_h    = _binary_entropy(roberta_ai_prob)          # range [0, 1]
        length_factor = min(1.0, token_count / MIN_TOKENS_FOR_HIGH_CONFIDENCE)
        confidence = round(
            min(100.0, max(15.0, (1.0 - entropy_h) * 70.0 + length_factor * 30.0)),
            2,
        )

        # ── BACKWARD-COMPAT FIELDS ──────────────────────────────────────────
        words = text.split()
        avg_word_len = sum(len(w) for w in words) / len(words) if words else 0
        text_lower = text.lower()
        has_first_person = any(t in text_lower.split() for t in ["i", "me", "my", "we", "our", "us"])
        is_formal_style = (avg_word_len > 5.2) and (not has_first_person)
        ml_warning = "Formal writing may resemble AI" if is_formal_style else ""

        if low_context:
            note = "Low confidence due to limited text length."
        elif confidence < 35:
            note = "Uncertain result"
        else:
            note = "Analysis complete"

        # ── EXPLANATIONS ────────────────────────────────────────────────────
        if repeated_phrases:
            explanations.append(
                f"Detected repetitive phrases: {', '.join(repr(p) for p in repeated_phrases[:3])}"
            )

        diversity = style_features["lexical_diversity"]
        explanations.append(
            f"Lexical diversity (TTR): {diversity:.3f}"
            + (" — low, possibly AI-generated" if diversity < 0.40 else " — adequate")
        )

        slv = style_features["sentence_length_variance"]
        explanations.append(
            f"Sentence length variance: {slv:.1f}"
            + (" — uniform sentences, possibly AI" if slv < 15.0 else " — varied sentence lengths")
        )

        if perplexity_model is not None:
            ppl_label = (
                "low perplexity — AI-like"    if perplexity_ai_score > 0.60 else
                "moderate"                    if perplexity_ai_score > 0.30 else
                "high perplexity — human-like"
            )
            explanations.append(f"Perplexity signal: {perplexity_ai_score:.3f} ({ppl_label})")
        else:
            explanations.append("Perplexity signal: unavailable (GPT-2 not loaded)")

        if len(segment_scores) > 1:
            ai_seg_count = sum(1 for s in segment_scores if s >= 0.5)
            explanations.append(
                f"Segment consensus: {int(consensus_ratio * 100)}% of segments classified as AI "
                f"({ai_seg_count}/{len(segment_scores)} segments)"
            )

        response = {
            # ── Core keys — extension depends on these ──
            "ai_score":       ai_score,
            "human_score":    human_score,
            "confidence":     confidence,
            "note":           note,
            "model":          MODEL_NAME,
            "method":         "roberta_primary",
            "is_formal_style": is_formal_style,
            "ml_warning":     ml_warning,
            "text_length":    word_count,
            # ── Extended diagnostic fields ──
            "model_probability": round(roberta_ai_prob * 100.0, 2),
            "perplexity_score":  round(perplexity_ai_score * 100.0, 2),
            "stylometric_score": round(stylometric_ai_score * 100.0, 2),
            "repetition_score":  round(repetition_score * 100.0, 2),
            "segment_consensus": round(consensus_ratio * 100.0, 2),
            "token_count":       token_count,
            "style_features":    style_features,
            "segment_scores":    [round(s * 100.0, 2) for s in segment_scores],
            "explanations":      explanations,
        }

        logger.info(
            f"Analyzed {word_count} words | Final AI: {ai_score:.1f}% "
            f"(RoBERTa base: {base_ai_score:.1f}%) | Confidence: {confidence:.1f}%"
        )
        return jsonify(response)

    except Exception as exc:
        logger.error(f"Error during detection: {exc}")
        return jsonify({"error": str(exc)}), 500


@app.route("/health", methods=["GET"])
def health():
    return jsonify(
        {
            "status": "ok",
            "model": MODEL_NAME,
            "perplexity_model": PERPLEXITY_MODEL_NAME if perplexity_model is not None else "unavailable",
            "method": "ensemble",
        }
    )


# ---------------------------------------------------------------------------
# Entry point
# ---------------------------------------------------------------------------
if __name__ == "__main__":
    load_model()
    logger.info(f"Starting ensemble text detection server at http://{HOST}:{PORT}")
    app.run(host=HOST, port=PORT, debug=False)
