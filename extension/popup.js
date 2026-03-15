// UnReal Popup Script v2.5 - Complete Overhaul
// Features: Tab-based UI, Manual Analysis, Overlay Controls, Fixed Cache

document.addEventListener('DOMContentLoaded', async () => {
  // ═══════════════════════════════════════════════════════════════
  // DOM ELEMENTS
  // ═══════════════════════════════════════════════════════════════

  const loadingStatus = document.getElementById('loading-status');
  const resultsDiv = document.getElementById('results');
  const pageUrl = document.getElementById('page-url');
  const riskBadge = document.getElementById('risk-badge');
  const scoreValue = document.getElementById('score-value');
  const reasonsList = document.getElementById('reasons-list');
  const summaryText = document.getElementById('summary-text');
  const settingsPanel = document.getElementById('settings-panel');
  const settingsToggle = document.getElementById('settings-toggle');
  const disabledNotice = document.getElementById('disabled-notice');
  const clearCacheBtn = document.getElementById('clear-cache-btn');
  const refreshBtn = document.getElementById('refresh-btn');

  // Settings toggles
  const enabledToggle = document.getElementById('enabled-toggle');
  const overlayToggle = document.getElementById('overlay-toggle');
  const segmentToggle = document.getElementById('segment-toggle');
  const imageToggle = document.getElementById('image-toggle');

  // Tab elements
  const tabButtons = document.querySelectorAll('.tab-btn');
  const tabContents = document.querySelectorAll('.tab-content');

  // Manual analysis elements
  const textInput = document.getElementById('text-input');
  const analyzeTextBtn = document.getElementById('analyze-text-btn');
  const textResult = document.getElementById('text-result');

  const imageInput = document.getElementById('image-input');
  const imageUrlInput = document.getElementById('image-url-input');
  const imageDropzone = document.getElementById('image-dropzone');
  const imagePreview = document.getElementById('image-preview');
  const previewImg = document.getElementById('preview-img');
  const analyzeImageBtn = document.getElementById('analyze-image-btn');
  const imageResult = document.getElementById('image-result');

  const newsInput = document.getElementById('news-input');
  const verifyNewsBtn = document.getElementById('verify-news-btn');
  const newsResult = document.getElementById('news-result');

  // Backend status
  const imageStatus = document.getElementById('image-status');
  const textStatus = document.getElementById('text-status');

  // Current state
  let currentTab = null;
  let selectedImageData = null;

  // ═══════════════════════════════════════════════════════════════
  // LOAD SETTINGS
  // ═══════════════════════════════════════════════════════════════

  const settings = await chrome.storage.sync.get([
    'extensionEnabled',
    'showOverlays',
    'segmentAnalysis',
    'imageAnalysis',
    'llmTiebreaker'
  ]);

  enabledToggle.checked = settings.extensionEnabled !== false;
  overlayToggle.checked = settings.showOverlays !== false;
  segmentToggle.checked = settings.segmentAnalysis !== false;
  imageToggle.checked = settings.imageAnalysis !== false;

  // Show disabled notice if extension is off
  if (settings.extensionEnabled === false) {
    disabledNotice.classList.add('visible');
  }

  // ═══════════════════════════════════════════════════════════════
  // TAB NAVIGATION
  // ═══════════════════════════════════════════════════════════════

  tabButtons.forEach(btn => {
    btn.addEventListener('click', () => {
      const tabId = btn.dataset.tab;

      // Update button states
      tabButtons.forEach(b => b.classList.remove('active'));
      btn.classList.add('active');

      // Update content visibility
      tabContents.forEach(content => {
        content.classList.remove('active');
        if (content.id === `tab-${tabId}`) {
          content.classList.add('active');
        }
      });
    });
  });

  // ═══════════════════════════════════════════════════════════════
  // SETTINGS PANEL
  // ═══════════════════════════════════════════════════════════════

  settingsToggle.addEventListener('click', () => {
    settingsPanel.classList.toggle('active');
  });

  // Handle setting changes
  enabledToggle.addEventListener('change', async () => {
    await chrome.storage.sync.set({ extensionEnabled: enabledToggle.checked });
    disabledNotice.classList.toggle('visible', !enabledToggle.checked);

    // Notify content script
    try {
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
      if (tab?.id) {
        chrome.tabs.sendMessage(tab.id, {
          type: 'SETTINGS_CHANGED',
          setting: 'extensionEnabled',
          value: enabledToggle.checked
        });
      }
    } catch (e) { /* Tab may not have content script */ }
  });

  overlayToggle.addEventListener('change', async () => {
    await chrome.storage.sync.set({ showOverlays: overlayToggle.checked });

    // Notify content script to show/hide overlays
    try {
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
      if (tab?.id) {
        chrome.tabs.sendMessage(tab.id, {
          type: 'TOGGLE_OVERLAYS',
          visible: overlayToggle.checked
        });
      }
    } catch (e) { /* Tab may not have content script */ }
  });

  segmentToggle.addEventListener('change', async () => {
    await chrome.storage.sync.set({ segmentAnalysis: segmentToggle.checked });
  });

  imageToggle.addEventListener('change', async () => {
    await chrome.storage.sync.set({ imageAnalysis: imageToggle.checked });
  });

  // ═══════════════════════════════════════════════════════════════
  // BACKEND STATUS
  // ═══════════════════════════════════════════════════════════════

  async function updateBackendStatus() {
    const { backendStatus } = await chrome.storage.local.get('backendStatus');

    if (backendStatus) {
      imageStatus.className = `status-badge ${backendStatus.image ? 'online' : 'offline'}`;
      imageStatus.textContent = backendStatus.image ? '✓ Online' : '✗ Offline';

      textStatus.className = `status-badge ${backendStatus.text ? 'online' : 'offline'}`;
      textStatus.textContent = backendStatus.text ? '✓ Online' : '✗ Offline';
    }
  }

  updateBackendStatus();
  setInterval(updateBackendStatus, 5000);

  // ═══════════════════════════════════════════════════════════════
  // CLEAR CACHE (FIXED)
  // ═══════════════════════════════════════════════════════════════

  clearCacheBtn.addEventListener('click', async () => {
    try {
      // Clear ALL cache keys (both old and new formats)
      await chrome.storage.local.remove([
        'cache_page', 'cache_segment', 'cache_image',  // New format
        'pageCache', 'segmentCache', 'imageCache',      // Old format
        'fakeNewsAnalysisResults', 'videoAnalysisResults'
      ]);

      clearCacheBtn.innerHTML = `
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <path d="M9 12l2 2 4-4"/>
          <circle cx="12" cy="12" r="10"/>
        </svg>
        Cache Cleared!
      `;
      clearCacheBtn.style.background = '#dcfce7';
      clearCacheBtn.style.color = '#166534';

      setTimeout(() => {
        clearCacheBtn.innerHTML = `
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <path d="M3 6h18M19 6v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6m3 0V4a2 2 0 012-2h4a2 2 0 012 2v2"/>
          </svg>
          Clear Page Cache
        `;
        clearCacheBtn.style.background = '';
        clearCacheBtn.style.color = '';
      }, 2000);
    } catch (e) {
      console.error('Error clearing cache:', e);
    }
  });

  // ═══════════════════════════════════════════════════════════════
  // REFRESH ANALYSIS
  // ═══════════════════════════════════════════════════════════════

  refreshBtn.addEventListener('click', async () => {
    try {
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
      if (tab?.id) {
        chrome.tabs.reload(tab.id);
        window.close();
      }
    } catch (e) {
      console.error('Error refreshing:', e);
    }
  });

  // ═══════════════════════════════════════════════════════════════
  // GET CURRENT TAB INFO
  // ═══════════════════════════════════════════════════════════════

  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    currentTab = tab;
    if (tab?.url) {
      const url = new URL(tab.url);
      const displayUrl = url.hostname + (url.pathname !== '/' ? url.pathname.slice(0, 25) : '');
      pageUrl.querySelector('span').textContent = displayUrl + (url.pathname.length > 25 ? '...' : '');
    }
  } catch (e) {
    pageUrl.querySelector('span').textContent = 'Unknown page';
  }

  // ═══════════════════════════════════════════════════════════════
  // LOAD EXISTING ANALYSIS
  // ═══════════════════════════════════════════════════════════════

  chrome.runtime.sendMessage({ type: 'GET_LAST_ANALYSIS' }, async (result) => {
    if (result && result.score !== undefined) {
      loadingStatus.style.display = 'none';
      resultsDiv.style.display = 'block';
      displayResults(result);
      loadFakeNewsResults();
      return;
    }

    // No cached result
    loadingStatus.innerHTML = `
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="width: 40px; height: 40px; margin: 0 auto 12px; stroke: #6b7280;">
        <circle cx="12" cy="12" r="10"/>
        <path d="M12 16v-4"/>
        <path d="M12 8h.01"/>
      </svg>
      <div style="color: #6b7280; font-size: 13px;">Refresh the page to analyze content</div>
    `;
  });

  // ═══════════════════════════════════════════════════════════════
  // DISPLAY RESULTS
  // ═══════════════════════════════════════════════════════════════

  function displayResults(result) {
    const { riskLevel, score, reasons, summary } = result;
    console.log('[Popup][Overview] score computation inputs:', {
      riskLevel,
      score,
      reasonsCount: Array.isArray(reasons) ? reasons.length : 0,
      summary
    });

    // Update risk badge
    riskBadge.className = `risk-badge risk-${riskLevel}`;
    riskBadge.textContent = riskLevel === 'high' ? 'High Risk' :
      riskLevel === 'medium' ? 'Medium Risk' :
        'Low Risk';

    // Update score
    scoreValue.textContent = score || 0;

    // Update reasons
    reasonsList.innerHTML = '';
    const normalizedReasons = Array.isArray(reasons) && reasons.length > 0
      ? reasons.slice(0, 5)
      : ((summary && !/no content to analyze/i.test(summary)) ? [summary] : []);

    if (normalizedReasons.length > 0) {
      normalizedReasons.forEach((reason, index) => {
        const li = document.createElement('li');
        li.className = 'reason-item';
        li.innerHTML = `
          <div class="reason-icon">${index + 1}</div>
          <span>${reason}</span>
        `;
        reasonsList.appendChild(li);
      });
    } else {
      reasonsList.innerHTML = `
        <div style="text-align: center; color: #16a34a; padding: 12px;">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="width: 24px; height: 24px; margin: 0 auto 8px;">
            <path d="M9 12l2 2 4-4"/>
            <circle cx="12" cy="12" r="10"/>
          </svg>
          <div style="font-weight: 600;">No significant AI indicators detected</div>
        </div>
      `;
    }

    // Update summary
    summaryText.textContent = summary || 'Analysis complete. Check the detection signals above for details.';
  }

  // ═══════════════════════════════════════════════════════════════
  // FAKE NEWS RESULTS
  // ═══════════════════════════════════════════════════════════════

  async function loadFakeNewsResults() {
    try {
      const { fakeNewsAnalysisResults } = await chrome.storage.local.get('fakeNewsAnalysisResults');

      if (!fakeNewsAnalysisResults || !currentTab?.url) return;

      const currentResult = fakeNewsAnalysisResults
        .filter(r => r.url === currentTab.url)
        .sort((a, b) => b.timestamp - a.timestamp)[0];

      if (currentResult && currentResult.analyzed && currentResult.hasNewsContent) {
        displayPageNewsResults(currentResult);
      }
    } catch (error) {
      console.error('Error loading fake news results:', error);
    }
  }

  function displayPageNewsResults(result) {
    const pageNewsCard = document.getElementById('page-news-card');
    const pageNewsContent = document.getElementById('page-news-content');

    pageNewsCard.style.display = 'block';

    let riskClass = 'info';
    let riskLabel = 'Unknown';

    if (result.riskLevel === 'low') {
      riskClass = 'success';
      riskLabel = 'Verified';
    } else if (result.riskLevel === 'medium') {
      riskClass = 'warning';
      riskLabel = 'Unverified';
    } else if (result.riskLevel === 'high' || result.riskLevel === 'medium-high') {
      riskClass = 'error';
      riskLabel = 'Likely False';
    }

    pageNewsContent.innerHTML = `
      <div class="result-box show ${riskClass}" style="margin-top: 0;">
        <div class="result-header">
          <span style="padding: 4px 10px; border-radius: 12px; font-size: 11px; font-weight: 600; background: ${riskClass === 'success' ? '#dcfce7' : riskClass === 'warning' ? '#fef3c7' : '#fecaca'}; color: ${riskClass === 'success' ? '#166534' : riskClass === 'warning' ? '#92400e' : '#991b1b'};">${riskLabel}</span>
          <span>${result.summary || 'Analysis complete'}</span>
        </div>
        ${result.details ? `
          <div class="verification-stats" style="display: flex; margin-top: 12px;">
            <div class="stat-item">
              <div class="stat-value">${result.details.totalClaims || 0}</div>
              <div class="stat-label">Claims</div>
            </div>
            <div class="stat-item">
              <div class="stat-value">${result.details.verifiedClaims || 0}</div>
              <div class="stat-label">Verified</div>
            </div>
            <div class="stat-item">
              <div class="stat-value">${result.details.trustedSourceCount || 0}</div>
              <div class="stat-label">Sources</div>
            </div>
          </div>
        ` : ''}
      </div>
    `;
  }

  // ═══════════════════════════════════════════════════════════════
  // MANUAL TEXT ANALYSIS
  // ═══════════════════════════════════════════════════════════════

  analyzeTextBtn.addEventListener('click', async () => {
    const text = textInput.value.trim();

    if (text.length < 50) {
      showTextResult('warning', 'Text Too Short', 'Please enter at least 50 characters for accurate analysis.', null);
      return;
    }

    analyzeTextBtn.disabled = true;
    analyzeTextBtn.innerHTML = `
      <div class="spinner" style="width: 18px; height: 18px; border-width: 2px; margin: 0;"></div>
      Analyzing...
    `;

    try {
      console.log('[Popup][Text] Sending payload text length:', text.length);

      // Send to backend via background script
      const response = await chrome.runtime.sendMessage({
        type: 'TEXT_BACKEND_REQUEST',
        text: text
      });

      console.log('[Popup][Text] Backend response payload:', response);

      if (response && response.success && response.data) {
        const payload = response.data;
        if (payload.ai_score === undefined || payload.ai_score === null) {
          throw new Error('Backend response missing ai_score');
        }

        const score = Number(payload.ai_score);
        if (Number.isNaN(score)) {
          throw new Error('Backend ai_score is not numeric');
        }

        const confidence = Number(payload.confidence || 0);
        const riskLevel = score >= 60 ? 'error' : score >= 35 ? 'warning' : 'success';
        const title = score >= 60 ? 'Likely AI-Generated' : score >= 35 ? 'Possibly AI-Generated' : 'Likely Human-Written';
        const reasons = Array.isArray(payload.explanations) ? payload.explanations.slice(0, 3) : [];

        const reasonsHtml = reasons.length > 0
          ? `<br><br><strong>Reasons:</strong><br>${reasons.map(r => `• ${r}`).join('<br>')}`
          : '';

        showTextResult(riskLevel, title, `
          Score: <strong>${score.toFixed(1)}/100</strong><br>
          Confidence: ${confidence.toFixed(0)}%<br>
          Mode: <strong>ML + Pattern Analysis</strong><br>
          ${payload.note ? `Note: ${payload.note}` : ''}
          ${reasonsHtml}
        `, score);
      } else {
        // Fallback to statistical + pattern analysis when ML backend is unavailable
        const fallback = await analyzeTextFallback(text);
        const riskLevel = fallback.score >= 60 ? 'error' : fallback.score >= 35 ? 'warning' : 'success';
        const title = fallback.score >= 60 ? 'Likely AI-Generated' : fallback.score >= 35 ? 'Possibly AI-Generated' : 'Likely Human-Written';
        const reasonLines = fallback.reasons.slice(0, 3).map(r => `• ${r}`).join('<br>');

        showTextResult(riskLevel, title, `
          Score: <strong>${fallback.score.toFixed(1)}/100</strong><br>
          Confidence: ${fallback.confidence.toFixed(0)}%<br>
          Mode: <strong>${fallback.mode}</strong><br>
          ${reasonLines ? `<br><strong>Reasons:</strong><br>${reasonLines}` : ''}
          <br><small style="color: #9ca3af;">ML backend unavailable - using local fallback.</small>
        `, fallback.score);
      }
    } catch (error) {
      showTextResult('error', 'Analysis Error', error.message, null);
    }

    analyzeTextBtn.disabled = false;
    analyzeTextBtn.innerHTML = `
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
        <circle cx="11" cy="11" r="8"/>
        <path d="M21 21l-4.35-4.35"/>
      </svg>
      Analyze Text
    `;
  });

  function showTextResult(type, title, details, score) {
    textResult.className = `result-box show ${type}`;
    document.getElementById('text-result-title').textContent = title;
    document.getElementById('text-result-score').textContent = score !== null ? `${score.toFixed(0)}%` : '';
    document.getElementById('text-result-score').style.display = score !== null ? 'block' : 'none';
    document.getElementById('text-result-details').innerHTML = details;
  }

  async function analyzeTextFallback(text) {
    let statScore = 0;
    let statConfidence = 45;
    let statReasons = [];

    try {
      const statsModule = await import(chrome.runtime.getURL('statisticalAnalyzer.js'));
      const stats = statsModule.analyzeTextStatistics(text);
      statScore = Number(stats.score || 0);
      statConfidence = Number(stats.confidence || 45);
      statReasons = Array.isArray(stats.reasons) ? stats.reasons.slice(0, 3) : [];
    } catch (error) {
      console.warn('[Popup][Text] Statistical fallback unavailable:', error.message);
    }

    const pattern = analyzeTextPatterns(text);
    const score = Math.max(0, Math.min(100, (statScore * 0.55) + (pattern.score * 0.45)));
    const confidence = Math.max(25, Math.min(80, statConfidence));

    return {
      score,
      confidence,
      reasons: [...pattern.reasons, ...statReasons],
      mode: 'Statistical + Pattern Analysis (Fallback)'
    };
  }

  function analyzeTextPatterns(text) {
    // Pattern support signal for fallback mode.
    let score = 0;
    const reasons = [];

    const aiPatterns = [
      { pattern: /\b(delve|leverage|facilitate|utilize|optimize|streamline)\b/gi, weight: 15 },
      { pattern: /\b(it'?s important to note|it'?s worth noting|in conclusion)\b/gi, weight: 20 },
      { pattern: /\b(furthermore|moreover|additionally|consequently)\b/gi, weight: 10 },
      { pattern: /\b(comprehensive|robust|seamless|innovative)\b/gi, weight: 12 },
      { pattern: /\b(in today'?s (world|society|age|digital))\b/gi, weight: 25 },
      { pattern: /\b(as an AI|I'?m an AI|language model)\b/gi, weight: 80 },
      { pattern: /\b(let me explain|allow me to)\b/gi, weight: 15 },
      { pattern: /\b(game.?changer|cutting.?edge|state.?of.?the.?art)\b/gi, weight: 18 }
    ];

    for (const { pattern, weight } of aiPatterns) {
      const found = text.match(pattern);
      if (found) {
        score += weight * Math.min(found.length, 3);
        if (pattern.toString().includes('as an AI') || pattern.toString().includes('language model')) {
          reasons.push('Explicit AI marker detected');
        } else if (pattern.toString().includes('furthermore') || pattern.toString().includes('moreover')) {
          reasons.push('Formal transition-heavy writing');
        } else {
          reasons.push('Predictable word patterns');
        }
      }
    }

    if (reasons.length === 0) {
      reasons.push('Overly regular grammatical structure');
    }

    return {
      score: Math.min(100, score),
      reasons: Array.from(new Set(reasons)).slice(0, 3)
    };
  }

  // ═══════════════════════════════════════════════════════════════
  // MANUAL IMAGE ANALYSIS
  // ═══════════════════════════════════════════════════════════════

  // File upload
  imageDropzone.addEventListener('click', () => imageInput.click());

  imageDropzone.addEventListener('dragover', (e) => {
    e.preventDefault();
    imageDropzone.classList.add('dragover');
  });

  imageDropzone.addEventListener('dragleave', () => {
    imageDropzone.classList.remove('dragover');
  });

  imageDropzone.addEventListener('drop', (e) => {
    e.preventDefault();
    imageDropzone.classList.remove('dragover');
    const file = e.dataTransfer.files[0];
    if (file && file.type.startsWith('image/')) {
      handleImageFile(file);
    }
  });

  imageInput.addEventListener('change', (e) => {
    const file = e.target.files[0];
    if (file) handleImageFile(file);
  });

  // URL input
  imageUrlInput.addEventListener('input', async () => {
    const url = imageUrlInput.value.trim();
    if (url && (url.startsWith('http://') || url.startsWith('https://'))) {
      previewImg.src = url;
      imagePreview.style.display = 'block';
      selectedImageData = { type: 'url', url: url };
    }
  });

  function handleImageFile(file) {
    const reader = new FileReader();
    reader.onload = (e) => {
      previewImg.src = e.target.result;
      imagePreview.style.display = 'block';
      selectedImageData = { type: 'base64', data: e.target.result };
    };
    reader.readAsDataURL(file);
  }

  function normalizeProbability(rawValue) {
    const numericValue = Number(rawValue ?? 0);
    const baseValue = Number.isFinite(numericValue)
      ? (numericValue >= 0 && numericValue <= 1 ? numericValue * 100 : numericValue)
      : 0;
    const probability = Math.max(0, Math.min(100, baseValue));

    console.log('Raw probability:', rawValue);
    console.log('Displayed probability:', probability);

    return probability;
  }

  analyzeImageBtn.addEventListener('click', async () => {
    if (!selectedImageData && !imageUrlInput.value.trim()) {
      showImageResult('warning', 'No Image Selected', 'Please upload an image or enter a URL.', null);
      return;
    }

    analyzeImageBtn.disabled = true;
    analyzeImageBtn.innerHTML = `
      <div class="spinner" style="width: 18px; height: 18px; border-width: 2px; margin: 0;"></div>
      Analyzing...
    `;

    try {
      let base64Data = null;

      if (selectedImageData?.type === 'base64') {
        base64Data = selectedImageData.data;
      } else {
        // Fetch image via background script
        const url = selectedImageData?.url || imageUrlInput.value.trim();
        const fetchResponse = await chrome.runtime.sendMessage({
          type: 'FETCH_IMAGE_AS_BASE64',
          data: { imageUrl: url }
        });

        if (fetchResponse.success) {
          base64Data = fetchResponse.base64;
        } else {
          throw new Error('Failed to fetch image: ' + fetchResponse.error);
        }
      }

      // Send to ML backend
      const response = await chrome.runtime.sendMessage({
        type: 'ML_BACKEND_REQUEST',
        endpoint: '/analyze',
        method: 'POST',
        body: {
          image: base64Data.split(',')[1] || base64Data
        }
      });

      if (response && response.success && response.data) {
        const rawProbability = response.data.ai_probability ?? response.data.score ?? 0;
        const probability = normalizeProbability(rawProbability);
        const riskLevel = probability >= 70 ? 'error' : probability >= 40 ? 'warning' : 'success';
        const title = probability >= 70 ? 'Likely AI-Generated' : probability >= 40 ? 'Possibly AI-Generated' : 'Likely Real Photo';

        showImageResult(riskLevel, title, `
          AI probability: ${probability.toFixed(1) + "%"}<br>
          ${response.data.classification ? `Classification: ${response.data.classification}` : ''}
        `, probability);
      } else {
        showImageResult('info', 'Backend Offline', 'The image detection server is not running. Start the backend server for ML analysis.', null);
      }
    } catch (error) {
      showImageResult('error', 'Analysis Error', error.message, null);
    }

    analyzeImageBtn.disabled = false;
    analyzeImageBtn.innerHTML = `
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
        <circle cx="11" cy="11" r="8"/>
        <path d="M21 21l-4.35-4.35"/>
      </svg>
      Analyze Image
    `;
  });

  function showImageResult(type, title, details, score) {
    imageResult.className = `result-box show ${type}`;
    document.getElementById('image-result-title').textContent = title;
    const displayScore = score !== null ? Math.max(0, Math.min(100, Number(score) || 0)) : null;
    document.getElementById('image-result-score').textContent = displayScore !== null ? `${displayScore.toFixed(1)}%` : '';
    document.getElementById('image-result-score').style.display = score !== null ? 'block' : 'none';
    document.getElementById('image-result-details').innerHTML = details;
  }

  // ═══════════════════════════════════════════════════════════════
  // MANUAL NEWS VERIFICATION
  // ═══════════════════════════════════════════════════════════════

  const NEWS_BACKEND_URL = 'http://localhost:8000';

  verifyNewsBtn.addEventListener('click', async () => {
    const claim = newsInput.value.trim();

    if (claim.length < 10) {
      showNewsResult('warning', 'Claim Too Short', 'Please enter a longer headline or claim to verify.', null);
      return;
    }

    verifyNewsBtn.disabled = true;
    verifyNewsBtn.innerHTML = `
      <div class="spinner" style="width: 18px; height: 18px; border-width: 2px; margin: 0;"></div>
      Searching Google...
    `;

    try {
      // Try backend first (actual Google search)
      let results = await verifyWithBackend(claim);

      if (results && results.success) {
        displayBackendNewsResults(results);
      } else {
        // Fall back to pattern analysis
        verifyNewsBtn.innerHTML = `
          <div class="spinner" style="width: 18px; height: 18px; border-width: 2px; margin: 0;"></div>
          Pattern Analysis...
        `;
        results = await searchGoogleForClaim(claim);
        displayNewsVerificationResults(results);
      }
    } catch (error) {
      showNewsResult('error', 'Verification Error', error.message, null);
    }

    verifyNewsBtn.disabled = false;
    verifyNewsBtn.innerHTML = `
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
        <path d="M9 12l2 2 4-4"/>
        <circle cx="12" cy="12" r="10"/>
      </svg>
      Verify Claim
    `;
  });

  /**
   * Verify headline using backend Google search
   */
  async function verifyWithBackend(headline) {
    try {
      const response = await fetch(`${NEWS_BACKEND_URL}/verify-news`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ headline: headline, max_results: 15 })
      });

      if (!response.ok) {
        console.log('[NewsVerify] Backend returned', response.status);
        return null;
      }

      return await response.json();
    } catch (error) {
      console.log('[NewsVerify] Backend unavailable:', error.message);
      return null;
    }
  }

  /**
   * Display results from backend verification (actual Google search)
   */
  function displayBackendNewsResults(result) {
    const newsStats = document.getElementById('news-stats');

    let type = 'info';
    let title = 'Analysis Complete';
    let details = '';

    switch (result.recommendation) {
      case 'verified_true':
        type = 'success';
        title = '✓ Verified - Multiple Trusted Sources';
        details = 'This headline was found in multiple top-tier news sources.';
        break;
      case 'likely_true':
        type = 'success';
        title = '✓ Likely True';
        details = 'This headline was reported by trusted news outlets.';
        break;
      case 'possibly_true':
        type = 'info';
        title = '○ Possibly True';
        details = 'Found in some sources, but limited coverage by major outlets.';
        break;
      case 'unverified':
        type = 'warning';
        title = '? Unverified';
        details = 'Could not confirm with trusted news sources. May be new, niche, or unverified.';
        break;
      case 'no_coverage':
        type = 'warning';
        title = '⚠ No News Coverage Found';
        details = 'This headline was not found in any news sources. It may be false, satirical, or very recent.';
        break;
      case 'likely_false':
        type = 'error';
        title = '⚠ Likely False/Misleading';
        details = 'Only found in unreliable sources, or no trusted coverage at all.';
        break;
      case 'likely_manipulated':
        type = 'error';
        title = '🚨 Possible Manipulation Detected';
        details = '<strong style="color:#ef4444">This claim appears to contradict actual news coverage!</strong><br><br>' +
          'Your headline contains negation words (like "not", "never", "denies") but we found news sources ' +
          'reporting the <em>opposite</em>. This is a common misinformation tactic.';
        break;
      default:
        type = 'info';
        title = 'ℹ Analysis Complete';
        details = 'Unable to make a strong determination.';
    }

    // Add reasoning
    if (result.reasoning && result.reasoning.length > 0) {
      details += '<br><br><strong>📊 Analysis:</strong><br>';
      details += result.reasoning.join('<br>');
    }

    // Show trusted sources found
    if (result.trusted_sources && result.trusted_sources.length > 0) {
      details += '<br><br><strong>✓ Found in trusted sources:</strong><br>';
      const sourceList = result.trusted_sources.slice(0, 5).map(s => {
        const tierLabel = s.tier === 'tier1' ? '⭐' : s.tier === 'tier2' ? '✓' : '○';
        return `${tierLabel} <a href="${s.url}" target="_blank" style="color:#3b82f6">${s.domain}</a>`;
      });
      details += sourceList.join('<br>');

      if (result.trusted_sources.length > 5) {
        details += `<br><em>...and ${result.trusted_sources.length - 5} more</em>`;
      }
    }

    // Show unreliable sources if found
    if (result.unreliable_sources && result.unreliable_sources.length > 0) {
      details += '<br><br><strong>⚠ Found in unreliable sources:</strong><br>';
      const unreliableList = result.unreliable_sources.slice(0, 3).map(s =>
        `⚠ <span style="color:#ef4444">${s.domain}</span>`
      );
      details += unreliableList.join('<br>');
    }

    // Show if result was cached
    if (result.cached) {
      details += '<br><br><small style="color:#6b7280">📦 Result from cache</small>';
    }

    newsResult.className = `result-box show ${type}`;
    document.getElementById('news-result-title').textContent = title;
    document.getElementById('news-result-details').innerHTML = details;

    // Show stats
    newsStats.style.display = 'flex';
    document.getElementById('news-sources-count').textContent = result.all_sources?.length || 0;
    document.getElementById('news-trusted-count').textContent = result.trusted_sources?.length || 0;
    document.getElementById('news-confidence').textContent = `${result.confidence || 0}%`;
  }

  /**
   * Pattern-based analysis (fallback when backend unavailable)
   */
  async function searchGoogleForClaim(claim) {
    const result = {
      claim: claim,
      verified: false,
      confidence: 0,
      sourcesFound: 0,
      trustedSourceCount: 0,
      unreliableSourceCount: 0,
      recommendation: 'unknown',
      flags: [],
      detectedSources: [],
      analysis: {}
    };

    // TRUSTED NEWS SOURCES to detect in claims (multiple variations)
    const trustedSources = {
      tier1: [
        'reuters', 'associated press', 'ap news', 'bbc', 'npr', 'pbs', 'afp',
        'the hindu', 'thehindu', 'new york times', 'nytimes', 'ny times',
        'washington post', 'wapo', 'wall street journal', 'wsj',
        'the guardian', 'guardian', 'economist', 'snopes', 'factcheck',
        'politifact', 'fact check', 'fact-check'
      ],
      tier2: [
        'cnn', 'nbc news', 'nbcnews', 'abc news', 'abcnews', 'cbs news', 'cbsnews',
        'fox news', 'msnbc', 'time magazine', 'newsweek', 'the atlantic',
        'new yorker', 'bloomberg', 'financial times', 'la times', 'los angeles times',
        'chicago tribune', 'usa today', 'huffpost', 'huffington post'
      ],
      tier3: [
        'politico', 'axios', 'the hill', 'vox', 'vice news', 'buzzfeed news',
        'al jazeera', 'france24', 'dw news', 'euronews', 'sky news',
        'daily mail', 'the sun', 'mirror', 'independent', 'telegraph'
      ]
    };

    // OFFICIAL/ACADEMIC/EXPERT SOURCES
    const officialSources = [
      'white house', 'congress', 'parliament', 'senate', 'government',
      'university', 'institute', 'professor', 'researcher', 'scientist',
      'cdc', 'who', 'world health', 'fda', 'nih', 'nasa', 'fbi', 'cia', 'pentagon',
      'journal', 'study shows', 'study finds', 'research shows', 'research finds',
      'peer-reviewed', 'peer reviewed', 'published in', 'experts say', 'officials say',
      'spokesperson', 'press release', 'official statement', 'confirmed by'
    ];

    // UNRELIABLE SOURCES to detect
    const unreliableSources = [
      'infowars', 'natural news', 'naturalnews', 'beforeitsnews', 'before its news',
      'worldtruth', 'world truth', 'dailybuzzlive', 'empirenews', 'empire news',
      'babylon bee', 'babylonbee', 'the onion', 'clickhole', 'worldnewsdailyreport',
      'nationalenquirer', 'national enquirer', 'weekly world news'
    ];

    // Detect sources mentioned in the claim
    const claimLower = claim.toLowerCase();

    // Check tier 1 sources
    for (const source of trustedSources.tier1) {
      if (claimLower.includes(source)) {
        if (!result.detectedSources.find(s => s.name === source)) {
          result.detectedSources.push({ name: source, tier: 'tier1', trusted: true });
          result.trustedSourceCount++;
        }
      }
    }
    // Check tier 2 sources
    for (const source of trustedSources.tier2) {
      if (claimLower.includes(source)) {
        if (!result.detectedSources.find(s => s.name === source)) {
          result.detectedSources.push({ name: source, tier: 'tier2', trusted: true });
          result.trustedSourceCount++;
        }
      }
    }
    // Check tier 3 sources
    for (const source of trustedSources.tier3) {
      if (claimLower.includes(source)) {
        if (!result.detectedSources.find(s => s.name === source)) {
          result.detectedSources.push({ name: source, tier: 'tier3', trusted: true });
          result.trustedSourceCount++;
        }
      }
    }
    // Check official/expert sources
    for (const source of officialSources) {
      if (claimLower.includes(source)) {
        if (!result.detectedSources.find(s => s.name === source)) {
          result.detectedSources.push({ name: source, tier: 'official', trusted: true });
          result.trustedSourceCount++;
        }
      }
    }
    // Check unreliable sources
    for (const source of unreliableSources) {
      if (claimLower.includes(source)) {
        if (!result.detectedSources.find(s => s.name === source)) {
          result.detectedSources.push({ name: source, tier: 'unreliable', trusted: false });
          result.unreliableSourceCount++;
        }
      }
    }

    result.sourcesFound = result.detectedSources.length;

    // MISINFORMATION PATTERNS - Strong indicators of false/misleading content
    const misinfoPatterns = [
      { pattern: /\b(shocking|bombshell|explosive|jaw.?dropping)\b/gi, weight: 15, flag: 'Sensationalist language' },
      { pattern: /\b(they don'?t want you to know|what .+ don'?t want you to see|banned|censored)\b/gi, weight: 25, flag: 'Conspiracy framing' },
      { pattern: /\b(exposed!?|revealed!?|leaked!?|cover.?up)\b/gi, weight: 12, flag: 'Exposé language' },
      { pattern: /\b(secret|hidden truth|suppressed)\b/gi, weight: 15, flag: 'Conspiracy language' },
      { pattern: /\b(miracle|cure[sd]?|breakthrough).{0,20}(cancer|covid|diabetes|disease)\b/gi, weight: 30, flag: 'Medical misinformation' },
      { pattern: /\b(mainstream media|MSM|fake news media).{0,20}(won'?t|refuses?|hiding)\b/gi, weight: 25, flag: 'Media conspiracy' },
      { pattern: /\b(big pharma|government coverup|deep state)\b/gi, weight: 30, flag: 'Conspiracy theory' },
      { pattern: /\b(100%|guaranteed|proven|scientifically proven).{0,10}(cure|works|effective)\b/gi, weight: 20, flag: 'Unverifiable claims' },
      { pattern: /\b(doctors hate|scientists baffled|experts stunned)\b/gi, weight: 25, flag: 'Clickbait language' },
      { pattern: /\b(share before.{0,10}deleted|going viral|must see)\b/gi, weight: 18, flag: 'Urgency manipulation' },
      { pattern: /\b(wake up|sheeple|open your eyes)\b/gi, weight: 20, flag: 'Conspiracy rhetoric' },
      { pattern: /\bDO YOUR (OWN )?RESEARCH\b/gi, weight: 15, flag: 'Anti-expertise stance' }
    ];

    // CREDIBILITY PATTERNS - Indicators of legitimate reporting
    const crediblePatterns = [
      { pattern: /\b(according to|as reported by|sources (say|confirm))\b/gi, weight: 12, flag: 'Source attribution' },
      { pattern: /\b(study|research|analysis).{0,15}(published|conducted|found|shows|finds)\b/gi, weight: 15, flag: 'Research reference' },
      { pattern: /\b(researchers|scientists|experts|officials).{0,10}(say|report|confirm|found)\b/gi, weight: 12, flag: 'Expert citation' },
      { pattern: /\b(university|institute|journal|peer.?reviewed)\b/gi, weight: 10, flag: 'Academic source' },
      { pattern: /\b(data shows?|statistics indicate|evidence suggests?)\b/gi, weight: 10, flag: 'Data-based claim' },
      { pattern: /\b(spokesperson|press (release|secretary)|official statement)\b/gi, weight: 10, flag: 'Official source' }
    ];

    let misinfoScore = 0;
    let credibleScore = 0;
    const flags = [];

    // Check misinformation patterns
    for (const { pattern, weight, flag } of misinfoPatterns) {
      const matches = claim.match(pattern);
      if (matches) {
        misinfoScore += weight * Math.min(matches.length, 2);
        if (!flags.includes(flag)) flags.push(flag);
      }
    }

    // Check credible patterns
    for (const { pattern, weight, flag } of crediblePatterns) {
      const matches = claim.match(pattern);
      if (matches) {
        credibleScore += weight * Math.min(matches.length, 2);
        if (!flags.includes(flag)) flags.push(flag);
      }
    }

    // Boost credibility score based on trusted sources found
    credibleScore += result.trustedSourceCount * 15;

    // Reduce credibility for unreliable sources
    misinfoScore += result.unreliableSourceCount * 25;

    // Calculate final assessment
    result.analysis = {
      misinfoScore,
      credibleScore,
      sourcesDetected: result.sourcesFound
    };
    result.flags = flags;

    // Determine recommendation based on scores
    if (misinfoScore >= 40 || result.unreliableSourceCount > 0) {
      result.recommendation = 'likely_false';
      result.confidence = Math.min(90, 50 + misinfoScore);
      result.verified = true;
    } else if (misinfoScore >= 20 && credibleScore < 15) {
      result.recommendation = 'suspicious';
      result.confidence = Math.min(75, 40 + misinfoScore);
    } else if ((credibleScore >= 30 || result.trustedSourceCount >= 2) && misinfoScore < 10) {
      result.recommendation = 'likely_true';
      result.confidence = Math.min(85, 45 + credibleScore);
      result.verified = true;
    } else if (credibleScore >= 20 || result.trustedSourceCount >= 3) {
      result.recommendation = 'possibly_true';
      result.confidence = Math.min(70, 35 + credibleScore);
    } else if (misinfoScore > credibleScore && misinfoScore >= 10) {
      result.recommendation = 'suspicious';
      result.confidence = Math.min(60, 30 + misinfoScore);
    } else if (credibleScore > 0) {
      result.recommendation = 'neutral';
      result.confidence = Math.min(50, 25 + credibleScore);
    } else {
      result.recommendation = 'needs_verification';
      result.confidence = 30;
    }

    // Store analysis scores for debugging
    result.analysis = {
      misinfoScore,
      credibleScore
    };

    return result;
  }

  function displayNewsVerificationResults(result) {
    const newsStats = document.getElementById('news-stats');

    let type = 'info';
    let title = 'Analysis Complete';
    let details = '';

    switch (result.recommendation) {
      case 'likely_true':
        type = 'success';
        title = '✓ Likely Credible';
        details = 'This claim uses language patterns consistent with credible, fact-based reporting.';
        break;
      case 'possibly_true':
        type = 'success';
        title = '✓ Possibly Credible';
        details = 'This claim shows some indicators of legitimate reporting. Consider verifying with additional sources.';
        break;
      case 'likely_false':
        type = 'error';
        title = '⚠ Likely Misinformation';
        details = 'This claim contains multiple language patterns commonly associated with misinformation or false content.';
        break;
      case 'suspicious':
        type = 'warning';
        title = '⚠ Suspicious Content';
        details = 'This claim shows some red flags. Exercise caution and verify with trusted sources before sharing.';
        break;
      case 'neutral':
        type = 'info';
        title = 'ℹ Neutral';
        details = 'This claim doesn\'t show strong indicators either way. Verify with trusted news sources.';
        break;
      case 'needs_verification':
        type = 'info';
        title = 'ℹ Needs Manual Verification';
        details = 'Not enough patterns detected for automated analysis. This is a limitation of pattern-based detection.<br><br>' +
          '<strong>💡 Tip:</strong> For better results, include the source in your claim, like:<br>' +
          '• "According to Reuters, [claim]"<br>' +
          '• "BBC reports that [claim]"<br>' +
          '• "A study published in Nature shows [claim]"';
        break;
      default:
        type = 'info';
        title = 'ℹ Analysis Complete';
        details = 'Unable to make a strong determination. Consider checking multiple trusted sources.';
    }

    // Add detected sources if present
    if (result.detectedSources && result.detectedSources.length > 0) {
      details += `<br><br><strong>🔍 Sources detected in your claim:</strong><br>`;
      details += result.detectedSources.map(s => {
        const icon = s.trusted ? '✓' : '⚠';
        const tierLabel = s.tier === 'tier1' ? '<span style="color:#22c55e">(Top tier - highly credible)</span>' :
          s.tier === 'tier2' ? '<span style="color:#3b82f6">(Major news outlet)</span>' :
            s.tier === 'tier3' ? '<span style="color:#6b7280">(News outlet)</span>' :
              s.tier === 'official' ? '<span style="color:#8b5cf6">(Official/Expert source)</span>' :
                s.tier === 'unreliable' ? '<span style="color:#ef4444">(⚠ Known unreliable source!)</span>' : '';
        return `${icon} <strong>${s.name}</strong> ${tierLabel}`;
      }).join('<br>');
    } else {
      // No sources detected - give helpful guidance
      if (result.recommendation === 'needs_verification') {
        // Already handled above
      } else {
        details += `<br><br><em>No specific news sources were mentioned in this claim. Analysis is based on language patterns only.</em>`;
      }
    }

    // Add flags if present
    if (result.flags && result.flags.length > 0) {
      details += `<br><br><strong>📊 Detected patterns:</strong><br>`;
      details += result.flags.map(f => `• ${f}`).join('<br>');
    }

    // Add score breakdown for transparency
    if (result.analysis) {
      details += `<br><br><small style="color:#6b7280">Pattern scores: Credibility +${result.analysis.credibleScore} | Red flags +${result.analysis.misinfoScore}</small>`;
    }

    newsResult.className = `result-box show ${type}`;
    document.getElementById('news-result-title').textContent = title;
    document.getElementById('news-result-details').innerHTML = details;

    // Show stats
    newsStats.style.display = 'flex';
    document.getElementById('news-sources-count').textContent = result.sourcesFound || 0;
    document.getElementById('news-trusted-count').textContent = result.trustedSourceCount || 0;
    document.getElementById('news-confidence').textContent = `${result.confidence || 0}%`;
  }

  function showNewsResult(type, title, details, confidence) {
    newsResult.className = `result-box show ${type}`;
    document.getElementById('news-result-title').textContent = title;
    document.getElementById('news-result-details').innerHTML = details;
    document.getElementById('news-stats').style.display = 'none';
  }
});
