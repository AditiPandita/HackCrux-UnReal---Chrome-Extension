// ShareSafe Settings Script v2.5 - Fixed Cache Management

document.addEventListener('DOMContentLoaded', async () => {
  const apiKeyInput = document.getElementById('api-key');
  const saveBtn = document.getElementById('save-btn');
  const statusMsg = document.getElementById('status-msg');
  const currentKeyDiv = document.getElementById('current-key');
  const maskedKeySpan = document.getElementById('masked-key');

  // New settings controls
  const enabledToggle = document.getElementById('enabled-toggle');
  const segmentAnalysisToggle = document.getElementById('segment-analysis-toggle');
  const imageAnalysisToggle = document.getElementById('image-analysis-toggle');
  const llmTiebreakerToggle = document.getElementById('llm-tiebreaker-toggle');
  const excludeListTextarea = document.getElementById('exclude-list');
  const includeListTextarea = document.getElementById('include-list');
  const clearCacheBtn = document.getElementById('clear-cache-btn');
  const cacheStatsDiv = document.getElementById('cache-stats');

  // Add LLM status indicator
  const llmStatusDiv = document.createElement('div');
  llmStatusDiv.id = 'llm-status';
  llmStatusDiv.style.cssText = `
    margin-top: 12px;
    padding: 10px 14px;
    border-radius: 8px;
    font-size: 13px;
    font-weight: 600;
  `;

  // Load all settings
  try {
    const data = await chrome.storage.sync.get([
      'geminiApiKey',
      'extensionEnabled',
      'segmentAnalysis',
      'imageAnalysis',
      'llmTiebreaker',
      'excludeList',
      'includeList'
    ]);

    // API Key
    if (data.geminiApiKey) {
      const key = data.geminiApiKey;
      const masked = '••••••••' + key.slice(-4);
      maskedKeySpan.textContent = masked;
      currentKeyDiv.style.display = 'block';

      // Show LLM available status
      llmStatusDiv.style.background = '#dcfce7';
      llmStatusDiv.style.color = '#16a34a';
      llmStatusDiv.innerHTML = '✅ LLM Tie-Breaker Available - API key configured';
    } else {
      // Show statistical only status
      llmStatusDiv.style.background = '#eff6ff';
      llmStatusDiv.style.color = '#3b82f6';
      llmStatusDiv.innerHTML = '📊 Statistical Analysis Mode - Works great without API key!';
    }

    // Insert status after save button
    saveBtn.parentElement.insertBefore(llmStatusDiv, saveBtn.nextSibling);

    // Extension enabled (default: true)
    enabledToggle.checked = data.extensionEnabled !== false;

    // Segment analysis (default: true)
    segmentAnalysisToggle.checked = data.segmentAnalysis !== false;

    // Image analysis (default: true)
    imageAnalysisToggle.checked = data.imageAnalysis !== false;

    // LLM tiebreaker (default: false - only use when uncertain)
    llmTiebreakerToggle.checked = data.llmTiebreaker === true;

    // Exclude/Include lists
    excludeListTextarea.value = (data.excludeList || []).join('\n');
    includeListTextarea.value = (data.includeList || []).join('\n');

  } catch (e) {
    console.error('Error loading settings:', e);
  }

  // Load cache stats
  updateCacheStats();

  // Save API Key
  saveBtn.addEventListener('click', async () => {
    const key = apiKeyInput.value.trim();

    // Validate Gemini API key if provided
    if (key && key.length < 20) {
      showStatus('Gemini API key seems too short', 'error');
      return;
    }

    try {
      const dataToSave = {};

      // Save Gemini API key if provided
      if (key) {
        dataToSave.geminiApiKey = key;
      }

      await chrome.storage.sync.set(dataToSave);

      // Update UI for Gemini key
      if (key) {
        const masked = '••••••••' + key.slice(-4);
        maskedKeySpan.textContent = masked;
        currentKeyDiv.style.display = 'block';
        apiKeyInput.value = '';

        // Update LLM status
        llmStatusDiv.style.background = '#dcfce7';
        llmStatusDiv.style.color = '#16a34a';
        llmStatusDiv.innerHTML = '✅ LLM Tie-Breaker Available - API key configured';
      }

      showStatus('API credentials saved successfully!', 'success');
    } catch (e) {
      console.error('Error saving API credentials:', e);
      showStatus('Failed to save API credentials', 'error');
    }
  });

  // Save settings on change
  enabledToggle.addEventListener('change', async () => {
    await chrome.storage.sync.set({ extensionEnabled: enabledToggle.checked });
    showStatus('Settings saved', 'success');
  });

  segmentAnalysisToggle.addEventListener('change', async () => {
    await chrome.storage.sync.set({ segmentAnalysis: segmentAnalysisToggle.checked });
    showStatus('Settings saved', 'success');
  });

  imageAnalysisToggle.addEventListener('change', async () => {
    await chrome.storage.sync.set({ imageAnalysis: imageAnalysisToggle.checked });
    showStatus('Settings saved', 'success');
  });

  llmTiebreakerToggle.addEventListener('change', async () => {
    await chrome.storage.sync.set({ llmTiebreaker: llmTiebreakerToggle.checked });
    showStatus('Settings saved', 'success');
  });

  // Save exclude/include lists
  document.getElementById('save-lists-btn').addEventListener('click', async () => {
    const excludeList = excludeListTextarea.value
      .split('\n')
      .map(s => s.trim())
      .filter(s => s.length > 0);

    const includeList = includeListTextarea.value
      .split('\n')
      .map(s => s.trim())
      .filter(s => s.length > 0);

    await chrome.storage.sync.set({ excludeList, includeList });
    showStatus('Lists saved successfully!', 'success');
  });

  // Clear cache - FIXED to handle both old and new cache key formats
  clearCacheBtn.addEventListener('click', async () => {
    try {
      // Clear ALL cache keys (both old and new formats)
      await chrome.storage.local.remove([
        // New format (used by cacheManager.js)
        'cache_page', 
        'cache_segment', 
        'cache_image',
        // Old format (legacy)
        'pageCache', 
        'segmentCache', 
        'imageCache',
        // Analysis results
        'fakeNewsAnalysisResults',
        'videoAnalysisResults',
        'backendStatus'
      ]);
      
      showStatus('Cache cleared successfully!', 'success');
      updateCacheStats();
      
      // Update button temporarily
      clearCacheBtn.textContent = '✓ Cache Cleared!';
      clearCacheBtn.style.background = '#dcfce7';
      clearCacheBtn.style.color = '#166534';
      
      setTimeout(() => {
        clearCacheBtn.textContent = 'Clear All Caches';
        clearCacheBtn.style.background = '';
        clearCacheBtn.style.color = '';
      }, 2000);
    } catch (e) {
      console.error('Error clearing cache:', e);
      showStatus('Failed to clear cache', 'error');
    }
  });

  async function updateCacheStats() {
    try {
      // Get both old and new format caches
      const data = await chrome.storage.local.get([
        'cache_page', 'cache_segment', 'cache_image',
        'pageCache', 'segmentCache', 'imageCache',
        'fakeNewsAnalysisResults', 'videoAnalysisResults'
      ]);
      
      // Count entries from both formats
      const pageCount = Object.keys(data.cache_page || {}).length + Object.keys(data.pageCache || {}).length;
      const segmentCount = Object.keys(data.cache_segment || {}).length + Object.keys(data.segmentCache || {}).length;
      const imageCount = Object.keys(data.cache_image || {}).length + Object.keys(data.imageCache || {}).length;
      const fakeNewsCount = (data.fakeNewsAnalysisResults || []).length;
      const videoCount = (data.videoAnalysisResults || []).length;

      cacheStatsDiv.innerHTML = `
        <div style="display: grid; grid-template-columns: repeat(3, 1fr); gap: 12px; margin-bottom: 12px;">
          <div style="background: #f9fafb; padding: 12px; border-radius: 8px; text-align: center;">
            <div style="font-size: 24px; font-weight: 700; color: #4f46e5;">${pageCount}</div>
            <div style="font-size: 11px; color: #6b7280; text-transform: uppercase;">Pages</div>
          </div>
          <div style="background: #f9fafb; padding: 12px; border-radius: 8px; text-align: center;">
            <div style="font-size: 24px; font-weight: 700; color: #4f46e5;">${segmentCount}</div>
            <div style="font-size: 11px; color: #6b7280; text-transform: uppercase;">Segments</div>
          </div>
          <div style="background: #f9fafb; padding: 12px; border-radius: 8px; text-align: center;">
            <div style="font-size: 24px; font-weight: 700; color: #4f46e5;">${imageCount}</div>
            <div style="font-size: 11px; color: #6b7280; text-transform: uppercase;">Images</div>
          </div>
        </div>
        <div style="font-size: 12px; color: #6b7280;">
          Also cached: ${fakeNewsCount} news analyses, ${videoCount} video analyses
        </div>
      `;
    } catch (e) {
      console.error('Error loading cache stats:', e);
      cacheStatsDiv.innerHTML = '<div style="color: #dc2626;">Error loading cache stats</div>';
    }
  }

  function showStatus(message, type) {
    statusMsg.textContent = message;
    statusMsg.className = 'status ' + type;

    setTimeout(() => {
      statusMsg.className = 'status';
    }, 3000);
  }

  apiKeyInput.addEventListener('keypress', (e) => {
    if (e.key === 'Enter') {
      saveBtn.click();
    }
  });
});
