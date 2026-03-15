// ShareSafe - Visual Segment Highlighter
// Highlights suspicious segments on the page with detailed explanations

// ═══════════════════════════════════════════════════════════════
// HIGHLIGHTING STYLES
// ═══════════════════════════════════════════════════════════════

export function injectHighlightStyles() {
  if (document.getElementById('sharesafe-highlight-styles')) return;
  
  const style = document.createElement('style');
  style.id = 'sharesafe-highlight-styles';
  style.textContent = `
    .sharesafe-segment-highlight {
      position: relative;
      transition: all 0.3s ease;
      cursor: help;
      border-radius: 4px;
      padding: 4px;
      margin: -4px;
    }
    
    .sharesafe-segment-highlight.high {
      background: linear-gradient(90deg, 
        rgba(239, 68, 68, 0.15) 0%,
        rgba(239, 68, 68, 0.08) 100%);
      border-left: 3px solid #ef4444;
      box-shadow: 0 0 0 1px rgba(239, 68, 68, 0.2);
    }
    
    .sharesafe-segment-highlight.medium {
      background: linear-gradient(90deg,
        rgba(249, 115, 22, 0.12) 0%,
        rgba(249, 115, 22, 0.05) 100%);
      border-left: 3px solid #f97316;
      box-shadow: 0 0 0 1px rgba(249, 115, 22, 0.15);
    }
    
    .sharesafe-segment-highlight.low {
      background: linear-gradient(90deg,
        rgba(59, 130, 246, 0.08) 0%,
        rgba(59, 130, 246, 0.03) 100%);
      border-left: 2px solid #3b82f6;
      box-shadow: 0 0 0 1px rgba(59, 130, 246, 0.1);
    }
    
    .sharesafe-segment-highlight:hover {
      transform: translateX(2px);
      box-shadow: 0 2px 8px rgba(0, 0, 0, 0.1);
    }
    
    .sharesafe-segment-highlight.high:hover {
      background: rgba(239, 68, 68, 0.2);
    }
    
    .sharesafe-segment-highlight.medium:hover {
      background: rgba(249, 115, 22, 0.18);
    }
    
    .sharesafe-segment-highlight.low:hover {
      background: rgba(59, 130, 246, 0.12);
    }
    
    /* Inline badge */
    .sharesafe-segment-badge {
      display: inline-flex;
      align-items: center;
      gap: 4px;
      padding: 2px 8px;
      border-radius: 10px;
      font-size: 11px;
      font-weight: 600;
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      margin-left: 8px;
      vertical-align: middle;
      cursor: pointer;
      transition: all 0.2s;
    }
    
    .sharesafe-segment-badge.high {
      background: #ef4444;
      color: white;
    }
    
    .sharesafe-segment-badge.medium {
      background: #f97316;
      color: white;
    }
    
    .sharesafe-segment-badge.low {
      background: #3b82f6;
      color: white;
    }
    
    .sharesafe-segment-badge:hover {
      transform: scale(1.05);
      box-shadow: 0 2px 8px rgba(0, 0, 0, 0.2);
    }
    
    /* Explanation tooltip */
    .sharesafe-explanation-tooltip {
      position: fixed;
      background: white;
      border-radius: 12px;
      padding: 16px;
      box-shadow: 0 8px 30px rgba(0, 0, 0, 0.15);
      z-index: 2147483646;
      min-width: 300px;
      max-width: 400px;
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      font-size: 13px;
      color: #1f2937;
      border: 1px solid #e5e7eb;
      animation: tooltip-fade-in 0.2s ease-out;
      pointer-events: auto;
    }

    .unreal-text-popup {
      z-index: 2147483646 !important;
    }
    
    @keyframes tooltip-fade-in {
      from {
        opacity: 0;
        transform: translateY(-10px);
      }
      to {
        opacity: 1;
        transform: translateY(0);
      }
    }
    
    .sharesafe-explanation-header {
      display: flex;
      align-items: center;
      gap: 10px;
      margin-bottom: 12px;
      padding-bottom: 12px;
      border-bottom: 2px solid #f3f4f6;
    }
    
    .sharesafe-explanation-icon {
      font-size: 24px;
    }
    
    .sharesafe-explanation-title {
      flex: 1;
      font-weight: 700;
      font-size: 14px;
    }
    
    .sharesafe-explanation-score {
      padding: 4px 10px;
      border-radius: 12px;
      font-weight: 700;
      font-size: 12px;
    }
    
    .sharesafe-explanation-score.high {
      background: #fef2f2;
      color: #ef4444;
      border: 1px solid #fecaca;
    }
    
    .sharesafe-explanation-score.medium {
      background: #fff7ed;
      color: #f97316;
      border: 1px solid #fed7aa;
    }
    
    .sharesafe-explanation-score.low {
      background: #eff6ff;
      color: #3b82f6;
      border: 1px solid #bfdbfe;
    }
    
    .sharesafe-explanation-reasons {
      margin-bottom: 12px;
    }
    
    .sharesafe-explanation-reason {
      display: flex;
      align-items: flex-start;
      gap: 8px;
      margin-bottom: 8px;
      padding: 8px;
      background: #f9fafb;
      border-radius: 6px;
      font-size: 12px;
      line-height: 1.5;
    }
    
    .sharesafe-explanation-reason-icon {
      flex-shrink: 0;
      margin-top: 2px;
    }
    
    .sharesafe-explanation-confidence {
      display: flex;
      align-items: center;
      gap: 10px;
      padding: 10px;
      background: #f9fafb;
      border-radius: 6px;
      margin-bottom: 12px;
    }
    
    .sharesafe-confidence-bar {
      flex: 1;
      height: 6px;
      background: #e5e7eb;
      border-radius: 3px;
      overflow: hidden;
    }
    
    .sharesafe-confidence-fill {
      height: 100%;
      background: linear-gradient(90deg, #3b82f6, #8b5cf6);
      transition: width 0.3s ease;
    }
    
    .sharesafe-confidence-label {
      font-size: 11px;
      font-weight: 600;
      color: #6b7280;
    }
    
    .sharesafe-explanation-footer {
      padding-top: 12px;
      border-top: 1px solid #e5e7eb;
      font-size: 11px;
      color: #9ca3af;
      text-align: center;
    }
    
    .sharesafe-close-tooltip {
      position: absolute;
      top: 12px;
      right: 12px;
      background: #f3f4f6;
      border: none;
      border-radius: 6px;
      width: 24px;
      height: 24px;
      display: flex;
      align-items: center;
      justify-content: center;
      cursor: pointer;
      font-size: 16px;
      color: #6b7280;
      transition: all 0.2s;
    }
    
    .sharesafe-close-tooltip:hover {
      background: #e5e7eb;
      color: #1f2937;
    }
    
    /* Summary panel */
    .sharesafe-summary-panel {
      position: fixed;
      top: 80px;
      right: 20px;
      background: rgba(255, 255, 255, 0.85);
      backdrop-filter: blur(10px);
      border-radius: 12px;
      padding: 16px;
      box-shadow: 0 8px 30px rgba(0, 0, 0, 0.12);
      z-index: 999998;
      min-width: 280px;
      max-width: 320px;
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      border: 1px solid rgba(229, 231, 235, 0.8);
      color: #000000;
    }
    
    .sharesafe-summary-panel.minimized {
      padding: 12px 16px;
    }
    
    .sharesafe-summary-panel.minimized .sharesafe-summary-content {
      display: none;
    }
    
    .sharesafe-summary-header {
      font-weight: 700;
      font-size: 15px;
      margin-bottom: 12px;
      display: flex;
      align-items: center;
      gap: 8px;
      color: #000000;
    }
    
    .sharesafe-panel-controls {
      display: flex;
      gap: 6px;
      margin-left: auto;
    }
    
    .sharesafe-panel-btn {
      width: 24px;
      height: 24px;
      border-radius: 6px;
      border: none;
      background: rgba(243, 244, 246, 0.9);
      color: #000000;
      font-size: 16px;
      font-weight: bold;
      cursor: pointer;
      display: flex;
      align-items: center;
      justify-content: center;
      transition: all 0.2s;
    }
    
    .sharesafe-panel-btn:hover {
      background: rgba(229, 231, 235, 1);
      transform: scale(1.05);
    }
    
    .sharesafe-segment-stats {
      display: grid;
      grid-template-columns: repeat(3, 1fr);
      gap: 8px;
      margin-bottom: 12px;
    }
    
    .sharesafe-stat-box {
      background: #f9fafb;
      padding: 10px;
      border-radius: 8px;
      text-align: center;
    }
    
    .sharesafe-stat-number {
      font-size: 20px;
      font-weight: 700;
      display: block;
    }
    
    .sharesafe-stat-number.high {
      color: #ef4444;
    }
    
    .sharesafe-stat-number.medium {
      color: #f97316;
    }
    
    .sharesafe-stat-number.low {
      color: #22c55e;
    }
    
    .sharesafe-stat-label {
      font-size: 10px;
      color: #000000;
      text-transform: uppercase;
      letter-spacing: 0.5px;
      margin-top: 4px;
    }
    
    .sharesafe-toggle-highlights {
      width: 100%;
      padding: 8px 12px;
      background: #4f46e5;
      color: white;
      border: none;
      border-radius: 8px;
      font-size: 12px;
      font-weight: 600;
      cursor: pointer;
      transition: all 0.2s;
    }
    
    .sharesafe-toggle-highlights:hover {
      background: #4338ca;
      transform: translateY(-1px);
      box-shadow: 0 4px 12px rgba(79, 70, 229, 0.3);
    }
    
    .sharesafe-toggle-highlights.off {
      background: #6b7280;
    }
    
    .sharesafe-toggle-highlights.off:hover {
      background: #4b5563;
    }
  `;
  
  document.head.appendChild(style);
}

// ═══════════════════════════════════════════════════════════════
// SEGMENT HIGHLIGHTING
// ═══════════════════════════════════════════════════════════════

export function highlightSegment(segmentScore, options = {}) {
  const { showBadge = true, showTooltipOnClick = true } = options;
  const segment = segmentScore.segment;
  const element = segment.element;

  if (!element) {
    console.log('[TextPopup] Skipped segment highlight: missing element', segmentScore?.segmentId);
    return;
  }

  if (element.dataset.sharesafeHighlighted === 'true') {
    console.log('[TextPopup] Skipped segment highlight: already highlighted', segmentScore?.segmentId);
    return;
  }
  
  // Skip if low risk and below threshold
  if (segmentScore.riskLevel === 'low' && segmentScore.score < 25) {
    console.log('[TextPopup] Skipped segment highlight: below low-risk threshold', segmentScore?.segmentId);
    return;
  }
  
  // Mark as highlighted
  element.dataset.sharesafeHighlighted = 'true';
  element.dataset.sharesafeScore = segmentScore.score;
  element.dataset.sharesafeRisk = segmentScore.riskLevel;
  element.dataset.sharesafeSegmentId = segment.id;

  // Backward-compatible flagged markup/data attributes.
  element.classList.add('unreal-flagged-text');
  element.dataset.aiScore = String(segmentScore.score ?? 0);
  element.dataset.aiRisk = String(segmentScore.riskLevel ?? 'low');
  element.dataset.aiReasons = JSON.stringify(segmentScore.reasons || []);
  element.dataset.aiMethod = String(segmentScore.methodLabel || segmentScore.method || 'Statistical + Pattern Analysis');
  
  // Add highlight class
  element.classList.add('sharesafe-segment-highlight', segmentScore.riskLevel);
  
  // Add inline badge
  if (showBadge && segmentScore.score >= 35) {
    const badge = createSegmentBadge(segmentScore);
    
    // Insert badge at start or end of element
    if (element.firstChild) {
      element.insertBefore(badge, element.firstChild);
    } else {
      element.appendChild(badge);
    }
  }
  
  // Add tooltip on click/hover
  if (showTooltipOnClick) {
    if (element.dataset.sharesafePopupListenersAttached !== 'true') {
      element.dataset.sharesafePopupListenersAttached = 'true';

      let hoverTimeout;

      // Restore hover behavior for medium/high/flagged segments.
      element.addEventListener('mouseenter', () => {
        hoverTimeout = setTimeout(() => {
          console.log('[TextPopup] mouseenter -> show tooltip', segmentScore.segmentId);
          showExplanationTooltip(element, segmentScore);
        }, 220);
      });

      element.addEventListener('mouseleave', () => {
        clearTimeout(hoverTimeout);
        hideExplanationTooltip('mouseleave');
      });

      element.addEventListener('click', (e) => {
        e.stopPropagation();
        console.log('[TextPopup] click -> show tooltip', segmentScore.segmentId);
        showExplanationTooltip(element, segmentScore);
      });
    }

    console.log('[TextPopup] Listeners attached to flagged segment:', {
      segmentId: segmentScore.segmentId,
      score: segmentScore.score,
      riskLevel: segmentScore.riskLevel,
      method: segmentScore.methodLabel
    });
  }
}

/**
 * Create inline badge for segment
 */
function createSegmentBadge(segmentScore) {
  const badge = document.createElement('span');
  badge.className = `sharesafe-segment-badge ${segmentScore.riskLevel}`;
  
    const icon = segmentScore.riskLevel === 'high' ? '⚠' : 
               segmentScore.riskLevel === 'medium' ? '!' : 'i';
  
  const label = segmentScore.riskLevel === 'high' ? 'High AI' :
                segmentScore.riskLevel === 'medium' ? 'Check' : 'Info';
  
  badge.innerHTML = `${icon} ${label}`;
  badge.title = `AI Score: ${segmentScore.score}/100 - Click for details`;
  
  badge.addEventListener('click', (e) => {
    e.stopPropagation();
    showExplanationTooltip(badge, segmentScore);
  });
  
  return badge;
}

/**
 * Show detailed explanation tooltip
 */
export function showExplanationTooltip(anchorElement, segmentScore) {
  if (!anchorElement) {
    console.log('[TextPopup] Skipped popup creation: missing anchor element');
    return;
  }

  // Remove existing tooltips
  document.querySelectorAll('.sharesafe-explanation-tooltip').forEach(t => t.remove());
  
  const tooltip = document.createElement('div');
  tooltip.className = 'sharesafe-explanation-tooltip unreal-text-popup';
  
  const icon = segmentScore.riskLevel === 'high' ? '⚠' :
               segmentScore.riskLevel === 'medium' ? '!' : 'i';
  
  const title = segmentScore.riskLevel === 'high' ? 'Likely AI-Generated' :
                segmentScore.riskLevel === 'medium' ? 'Uncertain - Verify Source' :
                'Flagged for Review';
  
  const confidencePercent = segmentScore.confidence;
  const methodLabel = segmentScore.methodLabel || 'Statistical + Pattern Analysis';

  console.log('[TextPopup] Creating popup card:', {
    segmentId: segmentScore.segmentId,
    score: segmentScore.score,
    riskLevel: segmentScore.riskLevel,
    reasonsCount: (segmentScore.reasons || []).length,
    methodLabel
  });
  
  tooltip.innerHTML = `
    <button class="sharesafe-close-tooltip" title="Close">×</button>
    
    <div class="sharesafe-explanation-header">
      <span class="sharesafe-explanation-icon">${icon}</span>
      <div class="sharesafe-explanation-title">${title}</div>
      <div class="sharesafe-explanation-score ${segmentScore.riskLevel}">
        ${segmentScore.score}/100
      </div>
    </div>
    
    <div class="sharesafe-explanation-confidence">
      <span class="sharesafe-confidence-label">Confidence:</span>
      <div class="sharesafe-confidence-bar">
        <div class="sharesafe-confidence-fill" style="width: ${confidencePercent}%"></div>
      </div>
      <span class="sharesafe-confidence-label">${confidencePercent}%</span>
    </div>
    
    <div class="sharesafe-explanation-reasons">
      <div style="font-weight: 600; font-size: 12px; margin-bottom: 8px; color: #4b5563;">
        Why this was flagged:
      </div>
      ${segmentScore.reasons.map(reason => `
        <div class="sharesafe-explanation-reason">
          <span class="sharesafe-explanation-reason-icon">•</span>
          <span>${reason}</span>
        </div>
      `).join('')}
    </div>
    
    <div class="sharesafe-explanation-footer">
      ${methodLabel} · Not Definitive
    </div>
  `;
  
  // Position tooltip
  document.body.appendChild(tooltip);
  positionTooltip(tooltip, anchorElement);
  
  // Close button
  tooltip.querySelector('.sharesafe-close-tooltip').addEventListener('click', () => {
    hideExplanationTooltip('close-button');
  });
  
  // Close on click outside
  setTimeout(() => {
    const closeOnOutside = (e) => {
      if (!tooltip.contains(e.target)) {
        hideExplanationTooltip('outside-click');
        document.removeEventListener('click', closeOnOutside);
      }
    };
    document.addEventListener('click', closeOnOutside);
  }, 100);
}

function hideExplanationTooltip(reason = 'unknown') {
  const tooltips = document.querySelectorAll('.sharesafe-explanation-tooltip');
  if (tooltips.length === 0) return;
  console.log('[TextPopup] Hiding popup:', reason);
  tooltips.forEach((tooltip) => tooltip.remove());
}

/**
 * Position tooltip relative to anchor element
 */
function positionTooltip(tooltip, anchor) {
  const anchorRect = anchor.getBoundingClientRect();
  const tooltipRect = tooltip.getBoundingClientRect();

  // Restore left-side card behavior while keeping it near hovered content.
  let top = Math.max(12, Math.min(window.innerHeight - tooltipRect.height - 12, anchorRect.top));
  let left = 14;

  // If viewport is very narrow, fall back to near-anchor placement.
  if (window.innerWidth < 720) {
    left = Math.max(10, Math.min(window.innerWidth - tooltipRect.width - 10, anchorRect.left));
  }

  tooltip.style.top = `${top}px`;
  tooltip.style.left = `${left}px`;

  console.log('[TextPopup] Popup shown:', {
    top,
    left,
    viewportWidth: window.innerWidth,
    viewportHeight: window.innerHeight
  });
}

// ═══════════════════════════════════════════════════════════════
// SUMMARY PANEL
// ═══════════════════════════════════════════════════════════════

export function createSummaryPanel(pageAnalysis) {
  // Remove existing panel
  const existing = document.getElementById('sharesafe-summary-panel');
  if (existing) existing.remove();
  
  const panel = document.createElement('div');
  panel.id = 'sharesafe-summary-panel';
  panel.className = 'sharesafe-summary-panel';
  
  const { distribution, segmentCount } = pageAnalysis;
  
  panel.innerHTML = `
    <div class="sharesafe-summary-header">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="width: 18px; height: 18px; display: inline-block; vertical-align: middle; margin-right: 6px;">
        <circle cx="11" cy="11" r="8"/>
        <path d="M21 21l-4.35-4.35"/>
      </svg>
      <span style="flex: 1;">Segment Analysis</span>
      <div class="sharesafe-panel-controls">
        <button class="sharesafe-panel-btn" id="sharesafe-minimize-btn" title="Minimize">−</button>
        <button class="sharesafe-panel-btn" id="sharesafe-close-btn" title="Close">×</button>
      </div>
    </div>
    
    <div class="sharesafe-summary-content">
      <div class="sharesafe-segment-stats">
        <div class="sharesafe-stat-box">
          <span class="sharesafe-stat-number high">${distribution.high}</span>
          <span class="sharesafe-stat-label">High Risk</span>
        </div>
        <div class="sharesafe-stat-box">
          <span class="sharesafe-stat-number medium">${distribution.medium}</span>
          <span class="sharesafe-stat-label">Medium</span>
        </div>
        <div class="sharesafe-stat-box">
          <span class="sharesafe-stat-number low">${distribution.low}</span>
          <span class="sharesafe-stat-label">Low Risk</span>
        </div>
      </div>
      
      <div style="font-size: 12px; color: #000000; margin-bottom: 12px; line-height: 1.5;">
        Analyzed ${segmentCount} content segments
      </div>
      
      <button class="sharesafe-toggle-highlights" id="sharesafe-toggle-btn">
        Hide Highlights
      </button>
    </div>
  `;
  
  document.body.appendChild(panel);
  
  // Minimize button functionality
  const minimizeBtn = panel.querySelector('#sharesafe-minimize-btn');
  let isMinimized = false;
  
  minimizeBtn.addEventListener('click', () => {
    isMinimized = !isMinimized;
    panel.classList.toggle('minimized', isMinimized);
    minimizeBtn.textContent = isMinimized ? '+' : '−';
    minimizeBtn.title = isMinimized ? 'Expand' : 'Minimize';
  });
  
  // Close button functionality
  const closeBtn = panel.querySelector('#sharesafe-close-btn');
  closeBtn.addEventListener('click', () => {
    panel.remove();
  });
  
  // Toggle button functionality
  let highlightsVisible = true;
  const toggleBtn = panel.querySelector('#sharesafe-toggle-btn');
  
  toggleBtn.addEventListener('click', () => {
    highlightsVisible = !highlightsVisible;
    
    document.querySelectorAll('.sharesafe-segment-highlight').forEach(el => {
      el.style.display = highlightsVisible ? '' : 'none';
    });
    
    document.querySelectorAll('.sharesafe-segment-badge').forEach(el => {
      el.style.display = highlightsVisible ? '' : 'none';
    });
    
    toggleBtn.textContent = highlightsVisible ? 'Hide Highlights' : 'Show Highlights';
    toggleBtn.classList.toggle('off', !highlightsVisible);
  });
  
  return panel;
}

// ═══════════════════════════════════════════════════════════════
// CLEAR ALL HIGHLIGHTS
// ═══════════════════════════════════════════════════════════════

export function clearAllHighlights() {
  // Remove highlight classes
  document.querySelectorAll('.sharesafe-segment-highlight').forEach(el => {
    el.classList.remove('sharesafe-segment-highlight', 'high', 'medium', 'low');
    el.classList.remove('unreal-flagged-text');
    delete el.dataset.sharesafeHighlighted;
    delete el.dataset.sharesafeScore;
    delete el.dataset.sharesafeRisk;
    delete el.dataset.sharesafeSegmentId;
    delete el.dataset.aiScore;
    delete el.dataset.aiRisk;
    delete el.dataset.aiReasons;
    delete el.dataset.aiMethod;
    delete el.dataset.sharesafePopupListenersAttached;
  });
  
  // Remove badges
  document.querySelectorAll('.sharesafe-segment-badge').forEach(badge => {
    badge.remove();
  });
  
  // Remove tooltips
  document.querySelectorAll('.sharesafe-explanation-tooltip').forEach(tooltip => {
    tooltip.remove();
  });
  
  // Remove summary panel
  const panel = document.getElementById('sharesafe-summary-panel');
  if (panel) panel.remove();
}
