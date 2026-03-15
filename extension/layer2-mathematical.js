/**
 * Layer 2: Mathematical Analysis (with Background CORS Bypass)
 * Runs heavy mathematical analysis with CORS handling
 *
 * Analysis performed:
 * - FFT Analysis (40% weight) - GAN artifacts, diffusion signature, spectral slope
 * - Noise Analysis (30% weight) - PRNU patterns, noise uniformity
 * - Color Histogram (30% weight) - entropy, gaps, smoothness
 */

const ANALYSIS_SIZE = 512;

export class MathematicalAnalyzer {
  constructor() {
    this.canvas = null;
    this.ctx = null;
    this.initialized = false;
    console.log('[Layer2-Math] MathematicalAnalyzer created (main thread mode)');
  }

  async initialize() {
    if (this.initialized) {
      console.log('[Layer2-Math] Already initialized');
      return;
    }

    this.canvas = document.createElement('canvas');
    this.ctx = this.canvas.getContext('2d', { willReadFrequently: true });
    this.initialized = true;
    console.log('[Layer2-Math] Initialized successfully (main thread mode)');
  }

  async analyze(imageElement) {
    const startTime = performance.now();

    if (!this.initialized) await this.initialize();

    try {
      const imageData = await this._getImageData(imageElement);
      if (!imageData) {
        console.log('[Layer2-Math] Failed to get image data');
        return this._createEmptyResult(performance.now() - startTime);
      }

      const result = this._analyzeImage(imageData.data, imageData.width, imageData.height);

      const processingTime = performance.now() - startTime;
      console.log(`[Layer2-Math] Analysis complete: score=${result.score}, time=${processingTime.toFixed(2)}ms`);

      return {
        score: result.score,
        frequencyStats: result.frequencyStats,
        noiseStats: result.noiseStats,
        artifacts: result.artifacts,
        layer: 'mathematical',
        processingTime: processingTime
      };
    } catch (error) {
      console.error('[Layer2-Math] Analysis error:', error);
      return this._createEmptyResult(performance.now() - startTime);
    }
  }

  async _getImageData(img) {
    try {
      const width = img.naturalWidth || img.width;
      const height = img.naturalHeight || img.height;
      if (width < 50 || height < 50) {
        console.log('[Layer2-Math] Image too small for analysis');
        return null;
      }

      this.canvas.width = ANALYSIS_SIZE;
      this.canvas.height = ANALYSIS_SIZE;

      const scale = Math.max(ANALYSIS_SIZE / width, ANALYSIS_SIZE / height);
      const sw = width * scale;
      const sh = height * scale;
      const ox = (ANALYSIS_SIZE - sw) / 2;
      const oy = (ANALYSIS_SIZE - sh) / 2;

      // Method 1: Try direct draw
      try {
        this.ctx.drawImage(img, ox, oy, sw, sh);
        const imageData = this.ctx.getImageData(0, 0, ANALYSIS_SIZE, ANALYSIS_SIZE);
        console.log('[Layer2-Math] Direct draw successful');
        return imageData;
      } catch (corsError) {
        console.log('[Layer2-Math] Direct draw failed, trying background fetch...');
      }

      // Method 2: Fetch through background script
      try {
        const imageUrl = img.src || img.currentSrc;

        if (!imageUrl || imageUrl.startsWith('data:')) {
          console.log('[Layer2-Math] No valid URL for background fetch');
          return null;
        }

        const response = await chrome.runtime.sendMessage({
          type: 'FETCH_IMAGE_AS_BASE64',
          data: { imageUrl }
        });

        if (!response || !response.success || !response.base64) {
          console.log('[Layer2-Math] Background fetch failed:', response?.error);
          return null;
        }

        const fetchedImg = await this._loadBase64Image(response.base64);
        if (!fetchedImg) {
          console.log('[Layer2-Math] Failed to load fetched image');
          return null;
        }

        const fw = fetchedImg.naturalWidth || fetchedImg.width;
        const fh = fetchedImg.naturalHeight || fetchedImg.height;
        const fScale = Math.max(ANALYSIS_SIZE / fw, ANALYSIS_SIZE / fh);
        const fsw = fw * fScale;
        const fsh = fh * fScale;
        const fox = (ANALYSIS_SIZE - fsw) / 2;
        const foy = (ANALYSIS_SIZE - fsh) / 2;

        this.canvas.width = ANALYSIS_SIZE;
        this.canvas.height = ANALYSIS_SIZE;
        this.ctx.drawImage(fetchedImg, fox, foy, fsw, fsh);

        console.log('[Layer2-Math] Successfully loaded via background fetch');
        return this.ctx.getImageData(0, 0, ANALYSIS_SIZE, ANALYSIS_SIZE);

      } catch (error) {
        console.error('[Layer2-Math] Background fetch error:', error);
        return null;
      }

    } catch (error) {
      console.error('[Layer2-Math] Error getting image data:', error);
      return null;
    }
  }

  _loadBase64Image(base64) {
    return new Promise((resolve) => {
      const img = new Image();

      img.onload = () => resolve(img);
      img.onerror = () => {
        console.error('[Layer2-Math] Failed to load base64 image');
        resolve(null);
      };

      if (!base64.startsWith('data:')) {
        base64 = 'data:image/jpeg;base64,' + base64;
      }

      img.src = base64;

      setTimeout(() => {
        if (!img.complete) {
          console.error('[Layer2-Math] Base64 image load timeout');
          resolve(null);
        }
      }, 10000);
    });
  }

  _analyzeImage(imageData, width, height) {
    const artifacts = [];

    const gray = new Float32Array(width * height);
    for (let i = 0; i < width * height; i++) {
      const idx = i * 4;
      gray[i] = 0.299 * imageData[idx] + 0.587 * imageData[idx + 1] + 0.114 * imageData[idx + 2];
    }

    const fftResult = this._analyzeFFT(gray, width, height);
    const noiseResult = this._analyzeNoise(imageData, width, height);
    const histogramResult = this._analyzeColorHistogram(imageData, width * height);

    artifacts.push(...fftResult.artifacts);
    artifacts.push(...noiseResult.artifacts);
    artifacts.push(...histogramResult.artifacts);

    const score = Math.round(
      fftResult.score * 0.40 +
      noiseResult.score * 0.30 +
      histogramResult.score * 0.30
    );

    return {
      score: Math.min(100, Math.max(0, score)),
      frequencyStats: fftResult.stats,
      noiseStats: noiseResult.stats,
      colorStats: histogramResult.stats,
      artifacts: artifacts
    };
  }

  // ==================== FFT ANALYSIS (40%) ====================

  _analyzeFFT(gray, width, height) {
    const artifacts = [];
    let score = 0;

    try {
      const { real, imag } = this._fft2d(gray, width, height);
      const magnitude = this._computeMagnitude(real, imag);
      const shifted = this._fftShift(magnitude, width, height);

      const ganResult = this._detectGANArtifacts(shifted, width, height);
      if (ganResult.detected) {
        score += 40;
        artifacts.push({
          type: 'frequency',
          subtype: 'gan_grid',
          description: 'GAN grid artifacts detected in frequency domain',
          confidence: ganResult.confidence
        });
      }

      const diffusionResult = this._detectDiffusionSignature(shifted, width, height);
      if (diffusionResult.detected) {
        score += 35;
        artifacts.push({
          type: 'frequency',
          subtype: 'diffusion_signature',
          description: 'Diffusion model signature detected',
          confidence: diffusionResult.confidence
        });
      }

      const slopeResult = this._analyzeSpectralSlope(shifted, width, height);
      if (slopeResult.anomaly) {
        score += 25;
        artifacts.push({
          type: 'frequency',
          subtype: 'spectral_slope',
          description: `Unnatural spectral slope: ${slopeResult.slope.toFixed(2)}`,
          confidence: slopeResult.confidence
        });
      }

      return {
        score: Math.min(100, score),
        stats: {
          ganArtifacts: ganResult.detected,
          diffusionSignature: diffusionResult.detected,
          spectralSlope: slopeResult.slope,
          slopeAnomaly: slopeResult.anomaly
        },
        artifacts
      };

    } catch (error) {
      console.error('[Layer2-Math] FFT analysis error:', error);
      return {
        score: 0,
        stats: { ganArtifacts: false, diffusionSignature: false, spectralSlope: 0, slopeAnomaly: false },
        artifacts: []
      };
    }
  }

  _fft2d(gray, width, height) {
    const n = width;

    const real = new Float32Array(n * n);
    const imag = new Float32Array(n * n);

    for (let i = 0; i < n * n; i++) {
      real[i] = gray[i];
      imag[i] = 0;
    }

    const rowReal = new Float32Array(n);
    const rowImag = new Float32Array(n);

    for (let y = 0; y < n; y++) {
      for (let x = 0; x < n; x++) {
        rowReal[x] = real[y * n + x];
        rowImag[x] = imag[y * n + x];
      }
      this._fft1d(rowReal, rowImag);
      for (let x = 0; x < n; x++) {
        real[y * n + x] = rowReal[x];
        imag[y * n + x] = rowImag[x];
      }
    }

    const colReal = new Float32Array(n);
    const colImag = new Float32Array(n);

    for (let x = 0; x < n; x++) {
      for (let y = 0; y < n; y++) {
        colReal[y] = real[y * n + x];
        colImag[y] = imag[y * n + x];
      }
      this._fft1d(colReal, colImag);
      for (let y = 0; y < n; y++) {
        real[y * n + x] = colReal[y];
        imag[y * n + x] = colImag[y];
      }
    }

    return { real, imag };
  }

  _fft1d(real, imag) {
    const n = real.length;

    let j = 0;
    for (let i = 0; i < n - 1; i++) {
      if (i < j) {
        let tempR = real[i];
        let tempI = imag[i];
        real[i] = real[j];
        imag[i] = imag[j];
        real[j] = tempR;
        imag[j] = tempI;
      }
      let k = n >> 1;
      while (k <= j) {
        j -= k;
        k >>= 1;
      }
      j += k;
    }

    for (let len = 2; len <= n; len <<= 1) {
      const halfLen = len >> 1;
      const angle = -2 * Math.PI / len;

      for (let i = 0; i < n; i += len) {
        for (let k = 0; k < halfLen; k++) {
          const theta = angle * k;
          const cosT = Math.cos(theta);
          const sinT = Math.sin(theta);

          const evenIdx = i + k;
          const oddIdx = i + k + halfLen;

          const tReal = cosT * real[oddIdx] - sinT * imag[oddIdx];
          const tImag = sinT * real[oddIdx] + cosT * imag[oddIdx];

          real[oddIdx] = real[evenIdx] - tReal;
          imag[oddIdx] = imag[evenIdx] - tImag;
          real[evenIdx] = real[evenIdx] + tReal;
          imag[evenIdx] = imag[evenIdx] + tImag;
        }
      }
    }
  }

  _computeMagnitude(real, imag) {
    const n = real.length;
    const magnitude = new Float32Array(n);

    for (let i = 0; i < n; i++) {
      magnitude[i] = Math.sqrt(real[i] * real[i] + imag[i] * imag[i]);
    }

    return magnitude;
  }

  _fftShift(data, width, height) {
    const shifted = new Float32Array(width * height);
    const halfW = width >> 1;
    const halfH = height >> 1;

    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        const srcX = (x + halfW) % width;
        const srcY = (y + halfH) % height;
        shifted[y * width + x] = data[srcY * width + srcX];
      }
    }

    return shifted;
  }

  _detectGANArtifacts(spectrum, width, height) {
    const centerX = width >> 1;
    const centerY = height >> 1;

    const quarterPos = [
      [centerX + (width >> 2), centerY],
      [centerX - (width >> 2), centerY],
      [centerX, centerY + (height >> 2)],
      [centerX, centerY - (height >> 2)]
    ];

    let totalMag = 0;
    for (let i = 0; i < spectrum.length; i++) {
      totalMag += spectrum[i];
    }
    const avgMag = totalMag / spectrum.length;

    let spikeCount = 0;
    let maxSpikeRatio = 0;

    for (const [x, y] of quarterPos) {
      if (x >= 0 && x < width && y >= 0 && y < height) {
        const mag = spectrum[y * width + x];
        const ratio = mag / avgMag;

        if (ratio > 5) {
          spikeCount++;
          maxSpikeRatio = Math.max(maxSpikeRatio, ratio);
        }
      }
    }

    return {
      detected: spikeCount >= 2,
      confidence: Math.min(90, spikeCount * 20 + Math.min(30, maxSpikeRatio * 2))
    };
  }

  _detectDiffusionSignature(spectrum, width, height) {
    const centerX = width >> 1;
    const centerY = height >> 1;

    const maxRadius = Math.min(centerX, centerY);
    const radialProfile = new Float32Array(maxRadius);
    const radialCounts = new Float32Array(maxRadius);

    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        const dx = x - centerX;
        const dy = y - centerY;
        const r = Math.floor(Math.sqrt(dx * dx + dy * dy));

        if (r < maxRadius) {
          radialProfile[r] += Math.log1p(spectrum[y * width + x]);
          radialCounts[r]++;
        }
      }
    }

    for (let r = 0; r < maxRadius; r++) {
      if (radialCounts[r] > 0) {
        radialProfile[r] /= radialCounts[r];
      }
    }

    let variance = 0;
    let count = 0;

    for (let r = 2; r < maxRadius - 2; r++) {
      if (radialCounts[r] > 0 && radialCounts[r - 1] > 0 && radialCounts[r + 1] > 0) {
        const secondDeriv = radialProfile[r - 1] - 2 * radialProfile[r] + radialProfile[r + 1];
        variance += secondDeriv * secondDeriv;
        count++;
      }
    }

    if (count > 0) {
      variance /= count;
    }

    const isSmooth = variance < 0.001;

    return {
      detected: isSmooth,
      confidence: isSmooth ? Math.min(75, 50 + (0.001 - variance) * 25000) : 0
    };
  }

  _analyzeSpectralSlope(spectrum, width, height) {
    const centerX = width >> 1;
    const centerY = height >> 1;

    const dataPoints = [];

    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        const dx = x - centerX;
        const dy = y - centerY;
        const freq = Math.sqrt(dx * dx + dy * dy);

        if (freq > 5 && freq < Math.min(centerX, centerY) * 0.8) {
          const mag = spectrum[y * width + x];
          if (mag > 0) {
            dataPoints.push({
              logFreq: Math.log(freq),
              logMag: Math.log(mag)
            });
          }
        }
      }
    }

    if (dataPoints.length < 100) {
      return { slope: -1.0, anomaly: false, confidence: 0 };
    }

    const sampleStep = Math.max(1, Math.floor(dataPoints.length / 1000));
    let sumX = 0, sumY = 0, sumXY = 0, sumXX = 0;
    let n = 0;

    for (let i = 0; i < dataPoints.length; i += sampleStep) {
      const { logFreq, logMag } = dataPoints[i];
      sumX += logFreq;
      sumY += logMag;
      sumXY += logFreq * logMag;
      sumXX += logFreq * logFreq;
      n++;
    }

    const slope = (n * sumXY - sumX * sumY) / (n * sumXX - sumX * sumX);
    const anomaly = slope > -0.5 || slope < -2.5;

    return {
      slope: slope,
      anomaly: anomaly,
      confidence: anomaly ? Math.min(70, 40 + Math.abs(slope - (-1.25)) * 20) : 0
    };
  }

  // ==================== NOISE ANALYSIS (30%) ====================

  _analyzeNoise(imageData, width, height) {
    const artifacts = [];
    let score = 0;

    try {
      const noise = this._extractNoiseResidual(imageData, width, height);

      const prnuResult = this._analyzePRNU(noise, width, height);
      if (prnuResult.absent) {
        score += 50;
        artifacts.push({
          type: 'noise',
          subtype: 'prnu_absent',
          description: 'Camera sensor fingerprint (PRNU) not detected',
          confidence: prnuResult.confidence
        });
      }

      const uniformityResult = this._analyzeNoiseUniformity(noise, width, height);
      if (uniformityResult.tooUniform) {
        score += 35;
        artifacts.push({
          type: 'noise',
          subtype: 'uniform_noise',
          description: 'Noise pattern is unnaturally uniform',
          confidence: uniformityResult.confidence
        });
      }

      return {
        score: Math.min(100, score),
        stats: {
          prnuCorrelation: prnuResult.correlation,
          prnuAbsent: prnuResult.absent,
          uniformityCV: uniformityResult.cv,
          tooUniform: uniformityResult.tooUniform
        },
        artifacts
      };

    } catch (error) {
      console.error('[Layer2-Math] Noise analysis error:', error);
      return {
        score: 0,
        stats: { prnuCorrelation: 0, prnuAbsent: false, uniformityCV: 0, tooUniform: false },
        artifacts: []
      };
    }
  }

  _extractNoiseResidual(imageData, width, height) {
    const noise = new Float32Array(width * height);

    for (let y = 1; y < height - 1; y++) {
      for (let x = 1; x < width - 1; x++) {
        let center = 0;
        let neighbors = 0;

        for (let dy = -1; dy <= 1; dy++) {
          for (let dx = -1; dx <= 1; dx++) {
            const idx = ((y + dy) * width + (x + dx)) * 4;
            const gray = 0.299 * imageData[idx] + 0.587 * imageData[idx + 1] + 0.114 * imageData[idx + 2];

            if (dx === 0 && dy === 0) {
              center = gray;
            } else {
              neighbors += gray;
            }
          }
        }

        noise[y * width + x] = center - neighbors / 8;
      }
    }

    return noise;
  }

  _analyzePRNU(noise, width, height) {
    const halfW = width >> 1;
    const halfH = height >> 1;

    const q1 = [], q2 = [], q3 = [], q4 = [];

    for (let y = 0; y < halfH; y++) {
      for (let x = 0; x < halfW; x++) {
        q1.push(noise[y * width + x]);
        q2.push(noise[y * width + (x + halfW)]);
        q3.push(noise[(y + halfH) * width + x]);
        q4.push(noise[(y + halfH) * width + (x + halfW)]);
      }
    }

    const corr13 = this._pearsonCorrelation(q1, q3);
    const corr24 = this._pearsonCorrelation(q2, q4);
    const corr12 = this._pearsonCorrelation(q1, q2);

    const avgCorrelation = (Math.abs(corr13) + Math.abs(corr24) + Math.abs(corr12)) / 3;
    const absent = avgCorrelation < 0.05;

    return {
      correlation: avgCorrelation,
      absent: absent,
      confidence: absent ? Math.min(80, 50 + (0.05 - avgCorrelation) * 600) : 0
    };
  }

  _pearsonCorrelation(x, y) {
    const n = Math.min(x.length, y.length);
    if (n < 10) return 0;

    let sumX = 0, sumY = 0, sumXY = 0, sumXX = 0, sumYY = 0;
    const step = Math.max(1, Math.floor(n / 1000));
    let count = 0;

    for (let i = 0; i < n; i += step) {
      sumX += x[i];
      sumY += y[i];
      sumXY += x[i] * y[i];
      sumXX += x[i] * x[i];
      sumYY += y[i] * y[i];
      count++;
    }

    const meanX = sumX / count;
    const meanY = sumY / count;

    let cov = 0, varX = 0, varY = 0;

    for (let i = 0; i < n; i += step) {
      const dx = x[i] - meanX;
      const dy = y[i] - meanY;
      cov += dx * dy;
      varX += dx * dx;
      varY += dy * dy;
    }

    const denom = Math.sqrt(varX * varY);
    return denom > 0 ? cov / denom : 0;
  }

  _analyzeNoiseUniformity(noise, width, height) {
    const gridSize = 4;
    const cellWidth = Math.floor(width / gridSize);
    const cellHeight = Math.floor(height / gridSize);
    const cellVariances = [];

    for (let gy = 0; gy < gridSize; gy++) {
      for (let gx = 0; gx < gridSize; gx++) {
        const startX = gx * cellWidth;
        const startY = gy * cellHeight;

        let sum = 0, sumSq = 0, count = 0;

        for (let y = startY; y < startY + cellHeight && y < height; y++) {
          for (let x = startX; x < startX + cellWidth && x < width; x++) {
            const val = noise[y * width + x];
            sum += val;
            sumSq += val * val;
            count++;
          }
        }

        if (count > 0) {
          const mean = sum / count;
          const variance = (sumSq / count) - (mean * mean);
          cellVariances.push(Math.max(0, variance));
        }
      }
    }

    if (cellVariances.length < 4) {
      return { cv: 0, tooUniform: false, confidence: 0 };
    }

    const meanVar = cellVariances.reduce((a, b) => a + b, 0) / cellVariances.length;
    if (meanVar < 0.001) {
      return { cv: 0, tooUniform: true, confidence: 70 };
    }

    const varOfVar = cellVariances.reduce((sum, v) => sum + Math.pow(v - meanVar, 2), 0) / cellVariances.length;
    const stdVar = Math.sqrt(varOfVar);
    const cv = stdVar / meanVar;

    const tooUniform = cv < 0.3;

    return {
      cv: cv,
      tooUniform: tooUniform,
      confidence: tooUniform ? Math.min(75, 50 + (0.3 - cv) * 80) : 0
    };
  }

  // ==================== COLOR HISTOGRAM ANALYSIS (30%) ====================

  _analyzeColorHistogram(imageData, pixelCount) {
    const artifacts = [];
    let score = 0;

    try {
      const rHist = new Uint32Array(256);
      const gHist = new Uint32Array(256);
      const bHist = new Uint32Array(256);

      for (let i = 0; i < pixelCount; i++) {
        const idx = i * 4;
        rHist[imageData[idx]]++;
        gHist[imageData[idx + 1]]++;
        bHist[imageData[idx + 2]]++;
      }

      const rEntropy = this._calculateEntropy(rHist, pixelCount);
      const gEntropy = this._calculateEntropy(gHist, pixelCount);
      const bEntropy = this._calculateEntropy(bHist, pixelCount);
      const avgEntropy = (rEntropy + gEntropy + bEntropy) / 3;

      const rGaps = this._countHistogramGaps(rHist);
      const gGaps = this._countHistogramGaps(gHist);
      const bGaps = this._countHistogramGaps(bHist);
      const totalGaps = rGaps + gGaps + bGaps;

      const rSmoothness = this._calculateHistogramSmoothness(rHist);
      const gSmoothness = this._calculateHistogramSmoothness(gHist);
      const bSmoothness = this._calculateHistogramSmoothness(bHist);
      const avgSmoothness = (rSmoothness + gSmoothness + bSmoothness) / 3;

      if (avgEntropy < 5.0) {
        score += 30;
        artifacts.push({
          type: 'histogram',
          subtype: 'low_entropy',
          description: 'Limited color variation detected',
          confidence: Math.min(70, 40 + (5.0 - avgEntropy) * 6)
        });
      }

      if (totalGaps > 50) {
        score += 25;
        artifacts.push({
          type: 'histogram',
          subtype: 'color_banding',
          description: 'Color banding detected',
          confidence: Math.min(75, 50 + totalGaps / 5)
        });
      }

      if (avgSmoothness > 0.9) {
        score += 20;
        artifacts.push({
          type: 'histogram',
          subtype: 'smooth_histogram',
          description: 'Unnaturally smooth color distribution',
          confidence: Math.min(65, 45 + avgSmoothness * 20)
        });
      }

      return {
        score: Math.min(100, score),
        stats: {
          entropy: avgEntropy,
          gaps: totalGaps,
          smoothness: avgSmoothness
        },
        artifacts
      };

    } catch (error) {
      console.error('[Layer2-Math] Histogram analysis error:', error);
      return { score: 0, stats: { entropy: 0, gaps: 0, smoothness: 0 }, artifacts: [] };
    }
  }

  _calculateEntropy(histogram, total) {
    let entropy = 0;

    for (let i = 0; i < 256; i++) {
      if (histogram[i] > 0) {
        const p = histogram[i] / total;
        entropy -= p * Math.log2(p);
      }
    }

    return entropy;
  }

  _countHistogramGaps(histogram) {
    let gaps = 0;
    let inGap = false;

    for (let i = 10; i < 245; i++) {
      if (histogram[i] === 0) {
        if (!inGap) {
          gaps++;
          inGap = true;
        }
      } else {
        inGap = false;
      }
    }

    return gaps;
  }

  _calculateHistogramSmoothness(histogram) {
    let sum1 = 0, sum2 = 0, sumProd = 0;
    let count = 0;

    for (let i = 0; i < 255; i++) {
      if (histogram[i] > 0 || histogram[i + 1] > 0) {
        const v1 = Math.log1p(histogram[i]);
        const v2 = Math.log1p(histogram[i + 1]);
        sum1 += v1;
        sum2 += v2;
        sumProd += v1 * v2;
        count++;
      }
    }

    if (count < 10) return 0;

    const mean1 = sum1 / count;
    const mean2 = sum2 / count;
    const cov = sumProd / count - mean1 * mean2;

    let var1 = 0, var2 = 0;
    for (let i = 0; i < 255; i++) {
      if (histogram[i] > 0 || histogram[i + 1] > 0) {
        const v1 = Math.log1p(histogram[i]);
        const v2 = Math.log1p(histogram[i + 1]);
        var1 += (v1 - mean1) * (v1 - mean1);
        var2 += (v2 - mean2) * (v2 - mean2);
      }
    }

    const denom = Math.sqrt((var1 / count) * (var2 / count));
    return denom > 0 ? Math.abs(cov / denom) : 0;
  }

  _createEmptyResult(processingTime) {
    return {
      score: 0,
      frequencyStats: {
        ganArtifacts: false,
        diffusionSignature: false,
        spectralSlope: 0,
        slopeAnomaly: false
      },
      noiseStats: {
        prnuCorrelation: 0,
        prnuAbsent: false,
        uniformityCV: 0,
        tooUniform: false
      },
      artifacts: [],
      layer: 'mathematical',
      processingTime: processingTime
    };
  }

  terminate() {
    console.log('[Layer2-Math] Cleanup complete (no worker)');
  }
}

console.log('[Layer2-Math] Module loaded with background CORS bypass');