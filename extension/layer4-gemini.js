/**
 * Layer 4: Gemini Validation (Fixed)
 * Only runs when preliminary score is 40-80% (uncertain range)
 * Validates findings from earlier layers and provides semantic analysis
 */

export class GeminiValidator {
  constructor() {
    this.minScore = 25;
    this.maxScore = 80;
    this.apiKey = null;
    console.log('[Layer4-Gemini] GeminiValidator initialized (40-80% range)');
  }

  /**
   * Initialize with API key
   */
  async initialize() {
    try {
      // Get API key from background script
      const credentials = await chrome.runtime.sendMessage({
        type: 'GET_API_CREDENTIALS'
      });

      this.apiKey = credentials?.geminiApiKey || null;

      if (!this.apiKey) {
        console.log('[Layer4-Gemini] No API key available - validation will be skipped');
      } else {
        console.log('[Layer4-Gemini] API key loaded successfully');
      }
    } catch (error) {
      console.error('[Layer4-Gemini] Failed to initialize:', error);
      this.apiKey = null;
    }
  }

  /**
   * Check if validation should run based on preliminary score
   */
  shouldRun(preliminaryScore) {
    if (!this.apiKey) {
      return false;
    }
    return preliminaryScore >= this.minScore && preliminaryScore <= this.maxScore;
  }

  /**
   * Main validation entry point
   */
  async validate(imageElement, preliminaryScore, previousArtifacts = []) {
    const startTime = performance.now();

    // Ensure API key is loaded
    if (!this.apiKey) {
      await this.initialize();
    }

    // Skip if no API key or score is outside validation range
    if (!this.shouldRun(preliminaryScore)) {
      return this._skipResult(preliminaryScore);
    }

    console.log('[Layer4-Gemini] Running validation for score:', preliminaryScore);

    try {
      // Convert image to base64
      const base64Image = await this._imageToBase64(imageElement);

      // Build enhanced prompt
      const prompt = this._buildEnhancedPrompt(previousArtifacts);

      // Call Gemini Vision API through background script
      const response = await chrome.runtime.sendMessage({
        type: 'CALL_GEMINI_VISION_API',
        data: {
          base64Image: base64Image,
          apiKey: this.apiKey,
          prompt: prompt
        }
      });

      if (!response) {
        console.error('[Layer4-Gemini] No response from background script');
        return this._errorResult('No response from background script');
      }

      if (!response.success) {
        const errorMsg = response.error || response.data?.error?.message || 'Unknown API error';
        console.error('[Layer4-Gemini] API call failed:', errorMsg, response);
        return this._errorResult(errorMsg);
      }

      // Process response
      return this._processGeminiResult(response.data, performance.now() - startTime);

    } catch (error) {
      console.error('[Layer4-Gemini] Validation error:', error);
      return this._errorResult(error.message);
    }
  }

  /**
   * Build enhanced prompt with previous findings
   */
  _buildEnhancedPrompt(previousArtifacts) {
    const artifactSummary = previousArtifacts.length > 0
      ? previousArtifacts.slice(0, 10).map(a => `- [${a.type || a.layer}] ${a.description}`).join('\n')
      : '- No significant artifacts detected by automated analysis';

    return `You are an expert AI image forensics validator. Your task is to determine if this image is AI-generated or a real photograph.

CRITICAL WARNING - DO NOT RELY ON THESE ALONE:
- Hands and fingers - Modern AI (2024+) generates perfect hands
- Eyes and pupils - Modern AI generates realistic eyes
- Anatomical proportions - AI has largely fixed these issues
These are NO LONGER reliable indicators of AI generation!

AUTOMATED FINDINGS FROM EARLIER ANALYSIS:
${artifactSummary}

YOUR VALIDATION TASKS - Focus on these RELIABLE indicators:

1. TEXTURE REALISM (Most Important):
   - Skin texture: Are there real pores, fine wrinkles, natural imperfections?
   - Fabric/material: Does clothing have realistic weave, threads, texture variation?
   - Hair: Individual strands, natural flyaways, or AI's typical smooth hair masses?
   - Surfaces: Real photos have dust, scratches, imperfections - AI is too clean

2. PHYSICS & LIGHTING LOGIC:
   - Light source consistency: Do shadows match light direction?
   - Reflection accuracy: Do mirrors/water/eyes reflect correctly?
   - Depth of field: Is bokeh natural or artificially perfect?
   - Material properties: Does metal look metallic? Does glass refract?

3. BACKGROUND & CONTEXT LOGIC:
   - Background coherence: Does the background make sense and connect logically?
   - Edge transitions: Smooth, natural blending or AI's harsh/soft cutoffs?
   - Object relationships: Do objects interact realistically with each other?
   - Environmental consistency: Weather, time of day, location all match?

4. TEXT AND SYMBOLS:
   - Any visible text: Is it readable and makes sense?
   - Logos and signs: Properly rendered or distorted?
   - Numbers: Correct format and legible?

5. THE "TOO PERFECT" TEST:
   - Real photos have noise, compression artifacts, slight blur
   - AI often produces unnaturally clean, smooth, or perfect images
   - Real lighting is complex; AI lighting is often flat or studio-perfect

RESPOND IN THIS EXACT JSON FORMAT (NO MARKDOWN CODE BLOCKS):
{
  "isAIGenerated": true or false,
  "confidence": 0-100,
  "verifiedFindings": ["list of confirmed automated findings"],
  "refutedFindings": ["list of automated findings you disagree with"],
  "newFindings": [
    {
      "category": "texture" | "physics" | "background" | "text" | "too_perfect" | "other",
      "description": "specific issue found",
      "severity": "high" | "medium" | "low"
    }
  ],
  "reasoning": "2-3 sentences explaining your overall conclusion based on TEXTURE and PHYSICS, not anatomy"
}

Remember: Modern AI generates perfect hands and eyes. Focus on TEXTURE, PHYSICS, and BACKGROUNDS to detect AI.`
  }

  /**
   * Convert image element to base64 (with CORS bypass)
   */
  async _imageToBase64(imageElement) {
    const maxSize = 1024;
    let width = imageElement.naturalWidth || imageElement.width;
    let height = imageElement.naturalHeight || imageElement.height;

    if (width > maxSize || height > maxSize) {
      const scale = Math.min(maxSize / width, maxSize / height);
      width = Math.floor(width * scale);
      height = Math.floor(height * scale);
    }

    // Try direct draw first
    try {
      const canvas = document.createElement('canvas');
      canvas.width = width;
      canvas.height = height;
      const ctx = canvas.getContext('2d');
      ctx.drawImage(imageElement, 0, 0, width, height);
      const base64 = canvas.toDataURL('image/jpeg', 0.85);
      // Remove data URL prefix
      return base64.replace(/^data:image\/(png|jpeg|jpg);base64,/, '');
    } catch (corsError) {
      // CORS error - try fetching via background script
      console.log('[Layer4-Gemini] Direct canvas failed, trying background fetch...');

      const imgSrc = imageElement.src || imageElement.currentSrc;
      if (!imgSrc) {
        throw new Error('No image source available');
      }

      try {
        const response = await chrome.runtime.sendMessage({
          type: 'FETCH_IMAGE_FOR_ANALYSIS',
          url: imgSrc
        });

        if (response && response.success && response.base64) {
          // The background fetch returns a data URL, just extract the base64 part
          console.log('[Layer4-Gemini] Successfully loaded via background fetch');
          const base64Data = response.base64;
          return base64Data.replace(/^data:image\/(png|jpeg|jpg|webp);base64,/, '');
        } else {
          throw new Error(response?.error || 'Background fetch failed');
        }
      } catch (bgError) {
        console.error('[Layer4-Gemini] Background fetch error:', bgError);
        throw bgError;
      }
    }
  }

  /**
   * Load base64 string as Image element
   */
  _loadBase64Image(base64) {
    return new Promise((resolve, reject) => {
      const img = new Image();
      img.onload = () => resolve(img);
      img.onerror = () => reject(new Error('Failed to load base64 image'));

      // Handle both raw base64 and data URL formats
      if (base64.startsWith('data:')) {
        img.src = base64;
      } else {
        img.src = `data:image/jpeg;base64,${base64}`;
      }
    });
  }

  /**
   * Process Gemini API response
   */
  _processGeminiResult(geminiData, processingTime) {
    try {
      // Extract text from Gemini response
      if (!geminiData.candidates || !geminiData.candidates[0] ||
        !geminiData.candidates[0].content || !geminiData.candidates[0].content.parts ||
        !geminiData.candidates[0].content.parts[0]) {
        console.error('[Layer4-Gemini] Invalid response structure');
        return this._errorResult('Invalid response structure');
      }

      const text = geminiData.candidates[0].content.parts[0].text;

      // Extract JSON (handle markdown code blocks)
      const jsonMatch = text.match(/\{[\s\S]*\}/);
      if (!jsonMatch) {
        console.error('[Layer4-Gemini] No JSON found in response');
        return this._errorResult('No JSON found in response');
      }

      let parsedResult;
      try {
        parsedResult = JSON.parse(jsonMatch[0]);
      } catch (parseError) {
        console.error('[Layer4-Gemini] JSON parse failed:', parseError.message);
        return this._errorResult('JSON parse failed');
      }

      // Build artifacts array from findings
      const artifacts = [];

      // Add verified findings
      (parsedResult.verifiedFindings || []).forEach(finding => {
        artifacts.push({
          type: 'semantic',
          subtype: 'verified',
          description: `Confirmed: ${finding}`,
          confidence: 80
        });
      });

      // Add new findings
      (parsedResult.newFindings || []).forEach(finding => {
        artifacts.push({
          type: 'semantic',
          subtype: finding.category || 'other',
          description: finding.description,
          confidence: finding.severity === 'high' ? 90 : finding.severity === 'medium' ? 60 : 40
        });
      });

      console.log(`[Layer4-Gemini] Processed result: isAI=${parsedResult.isAIGenerated}, confidence=${parsedResult.confidence}`);

      return {
        confidence: parsedResult.confidence || 0,
        isAIGenerated: parsedResult.isAIGenerated || false,
        artifacts: artifacts,
        reasoning: parsedResult.reasoning || 'No reasoning provided',
        verifiedFindings: parsedResult.verifiedFindings || [],
        refutedFindings: parsedResult.refutedFindings || [],
        newFindings: parsedResult.newFindings || [],
        layer: 'gemini',
        skipped: false,
        processingTime: Math.round(processingTime)
      };

    } catch (error) {
      console.error('[Layer4-Gemini] Error processing result:', error);
      return this._errorResult('Failed to process Gemini response');
    }
  }

  /**
   * Return skip result when score is outside validation range
   */
  _skipResult(preliminaryScore) {
    const reason = !this.apiKey
      ? 'No API key available - Gemini validation skipped'
      : preliminaryScore < this.minScore
        ? `Score ${preliminaryScore}% is below ${this.minScore}% threshold - high confidence in human origin`
        : `Score ${preliminaryScore}% is above ${this.maxScore}% threshold - high confidence in AI generation`;

    console.log('[Layer4-Gemini] Skipped:', reason);

    return {
      confidence: 0,
      isAIGenerated: false,
      artifacts: [],
      reasoning: null,
      verifiedFindings: [],
      refutedFindings: [],
      newFindings: [],
      layer: 'gemini',
      skipped: true,
      skipReason: reason,
      processingTime: 0
    };
  }

  /**
   * Return error result
   */
  _errorResult(errorMessage) {
    return {
      confidence: 0,
      isAIGenerated: false,
      artifacts: [],
      reasoning: null,
      verifiedFindings: [],
      refutedFindings: [],
      newFindings: [],
      layer: 'gemini',
      skipped: false,
      error: errorMessage,
      processingTime: 0
    };
  }
}

console.log('[Layer4-Gemini] Module loaded - Gemini validation only (40-80% range)');