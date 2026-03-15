// ShareSafe - Gemini API Helper
// Analyzes content and images for misinformation using Google Gemini

const GEMINI_MODEL = 'gemini-2.5-flash';
const GEMINI_ENDPOINT = `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent`;
const TIMEOUT_MS = 15000;

/**
 * Analyze webpage content for misinformation signals using Gemini
 * @param {Object} content - { title, headline, description, bodyText, imageUrl }
 * @param {string} apiKey - Gemini API key
 * @returns {Promise<Object>} - { riskLevel, score, reasons, summary }
 */
export async function analyzeWithGemini(content, apiKey) {
  const defaultResponse = {
    riskLevel: 'medium',
    score: 50,
    reasons: ['Analysis unavailable - API error'],
    summary: 'Could not complete analysis. Please try again.'
  };

  if (!apiKey) {
    console.log('ShareSafe: No API key provided');
    return defaultResponse;
  }

  console.log('ShareSafe: Analyzing with Gemini 2.5 Flash...');

  const hasImage = !!content.imageUrl;

  const prompt = `
You are an expert fact-checker and misinformation analyst. Analyze this webpage for ALL types of false, misleading, or manipulated content.

Title: ${content.title || 'N/A'}
Headline: ${content.headline || 'N/A'}
Description: ${content.description || 'N/A'}
Content: ${content.bodyText || 'N/A'}
${hasImage ? 'Image URL: ' + content.imageUrl : 'No main image found'}
${content.hasVideo ? 'Video detected on page' : ''}

ANALYZE FOR ALL THESE ISSUES:

1. FAKE NEWS / MISINFORMATION:
   - False or unverified claims
   - Missing sources or citations
   - Claims contradicted by known facts

2. EDITED / MANIPULATED MEDIA:
   - Photoshopped or doctored images
   - Edited or spliced videos
   - Face swaps or morphing
   - Misleading cropping or framing

3. AI-GENERATED CONTENT:
   - AI-generated images (DALL-E, Midjourney, etc.)
   - AI-generated videos (Sora, Runway, etc.)
   - Deepfakes or synthetic faces
   - AI-written text

4. CLICKBAIT / MANIPULATION:
   - Sensational or exaggerated headlines
   - Emotional manipulation tactics
   - Fear-mongering or outrage bait

5. OUT OF CONTEXT:
   - Old content presented as new
   - Real media with false caption
   - Misleading framing of real events

6. SATIRE MISREPRESENTED:
   - Satirical content that could be mistaken as real

Respond in valid JSON only (no markdown):
{
  "riskLevel": "low" or "medium" or "high",
  "score": number 0-100 (100 = highest risk),
  "reasons": ["specific issue 1", "specific issue 2", "specific issue 3"],
  "summary": "one sentence assessment",
  "detectedIssues": {
    "fakeNews": true/false,
    "editedMedia": true/false,
    "aiGenerated": true/false,
    "clickbait": true/false,
    "outOfContext": true/false
  }
}
`;

  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), TIMEOUT_MS);

    // Build request parts
    const parts = [{ text: prompt }];

    // If there's an image, try to include it (Gemini can analyze image URLs)
    // Note: This works best with publicly accessible image URLs

    const response = await fetch(`${GEMINI_ENDPOINT}?key=${apiKey}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        contents: [{
          parts: parts
        }],
        generationConfig: {
          temperature: 0.2,
          maxOutputTokens: 600
        }
      }),
      signal: controller.signal
    });

    clearTimeout(timeoutId);

    if (!response.ok) {
      console.error('Gemini API error:', response.status);
      return defaultResponse;
    }

    const data = await response.json();
    
    // Extract text from Gemini response
    const text = data?.candidates?.[0]?.content?.parts?.[0]?.text;
    if (!text) {
      console.error('No text in Gemini response');
      return defaultResponse;
    }

    // Parse JSON from response (handle potential markdown code blocks)
    let jsonStr = text.trim();
    if (jsonStr.startsWith('```')) {
      jsonStr = jsonStr.replace(/```json?\n?/g, '').replace(/```/g, '');
    }

    const result = JSON.parse(jsonStr);

    // Validate required fields
    if (!result.riskLevel || typeof result.score !== 'number') {
      return defaultResponse;
    }

    // If AI-generated content detected, ensure high risk
    if (result.isAIGenerated && result.riskLevel !== 'high') {
      result.riskLevel = 'high';
      result.score = Math.max(result.score, 75);
      if (!result.reasons.some(r => r.toLowerCase().includes('ai'))) {
        result.reasons.unshift('AI-generated content detected');
      }
    }

    return {
      riskLevel: result.riskLevel,
      score: Math.min(100, Math.max(0, result.score)),
      reasons: Array.isArray(result.reasons) ? result.reasons.slice(0, 5) : [],
      summary: result.summary || 'Analysis complete'
    };

  } catch (error) {
    if (error.name === 'AbortError') {
      console.error('Gemini API timeout');
    } else {
      console.error('Gemini analysis error:', error);
    }
    return defaultResponse;
  }
}
