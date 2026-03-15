# UnReal - AI Content Detection Browser Extension

<div align="center">

**Advanced AI-Powered Misinformation & Synthetic Media Detector**

*Detect AI-generated content, deepfakes, manipulated media, and misinformation in real-time*

[![Chrome Extension](https://img.shields.io/badge/Chrome-Extension-blue?logo=google-chrome)](https://chrome.google.com)
[![Manifest V3](https://img.shields.io/badge/Manifest-V3-green)](https://developer.chrome.com/docs/extensions/mv3/)
[![Version](https://img.shields.io/badge/version-2.0.0-brightgreen)](.)

</div>

---

## 📖 Overview

**UnReal** is a sophisticated Chrome extension that analyzes web content to detect AI-generated text and images, manipulated media, fake news, and misinformation. It uses a multi-layered analysis approach combining statistical pattern matching, segment-based analysis, and optional AI-powered verification through Google Gemini.

### 🎯 Key Capabilities

- **AI Text Detection** - Identifies content from ChatGPT, GPT-4, Claude using RoBERTa ML model
- **AI Image Detection** - Multi-layer analysis for DALL-E, Midjourney, Stable Diffusion images
- **Fake News Detection** - Cross-references claims with trusted sources
- **Manipulated Media** - Detects edited, photoshopped, or doctored content  
- **Social Media Scanner** - Real-time scanning on Twitter/X, Facebook, Instagram, LinkedIn, Reddit, TikTok

**🔗 Repository:** 
---

## 🚀 Quick Start

### Installation

1. **Clone or download this repository**
   ```bash
   git clone <repository-url>
   cd sharesafe
   ```

2. **Load in Chrome**
   - Open Chrome and navigate to `chrome://extensions/`
   - Enable **Developer mode** (top-right toggle)
   - Click **Load unpacked**
   - Select the `/extension` folder
   - Pin the extension for easy access

3. **Start browsing!** The extension works immediately in demo mode

### Optional: Enable AI Analysis

For enhanced accuracy using Google Gemini AI:


## ✨ Features

### 🔍 Multi-Layer Analysis Engine

**1. Statistical Analysis (Always Active)**
- Pattern matching for AI signatures
- Keyword detection for misinformation markers
- URL reputation checking
- Image and video metadata analysis

**2. Segment-Based Analysis**
- Breaks content into logical segments
- Per-segment risk scoring
- Visual highlighting of suspicious sections
- Granular analysis for long-form contentz

### 📊 Dynamic Trust Scoring

Risk scores range from **0-100**:

| Score Range | Risk Level | Badge Color | Indicator |
|-------------|-----------|-------------|-----------|
| 0-24 | **Low Risk** | 🟢 Green | ✓ Safe |
| 25-54 | **Medium Risk** | 🟠 Orange | ⚠️ Caution |
| 55-100 | **High Risk** | 🔴 Red | 🚨 Warning |

### 🎨 Visual Indicators

- **Floating Badge** - Non-intrusive badge in bottom-right corner
- **Auto Notifications** - Toast alerts for high-risk content
- **Inline Warnings** - Social media posts get per-item badges
- **Segment Highlighting** - Click badge to see risky sections highlighted

### 📱 Social Media Integration

Real-time feed scanning on:
- Twitter/X
- Facebook  
- Instagram
- LinkedIn
- Reddit
- TikTok

Posts are analyzed as you scroll with inline risk indicators.

---


## 🗂️ Project Structure

```bash

UnReal-Extension-main
│
├── .qodo
│   ├── agents
│   └── workflows
│
├── .venv
│   ├── Include
│   ├── Lib
│   ├── Scripts
│   └── share
│
├── docs
│
├── extension
│   │
│   ├── backend
│   │
│   ├── icons
│   │
│   ├── .env.example
│   ├── .gitignore
│   ├── BACKEND_SETUP.md
│   │
│   ├── background.js
│   ├── backgroundNew.js
│   ├── cacheManager.js
│   ├── config.js
│   ├── content.js
│   ├── contentNew.js
│   │
│   ├── gemini.js
│   ├── headlineExtractor.js
│   │
│   ├── imageAnalysisPipeline.js
│   ├── imageDetector.js
│   │
│   ├── layer0-metadata.js
│   ├── layer1-forensic.js
│   ├── layer2-mathematical.js
│   ├── layer3-local-ml.js
│   ├── layer4-gemini.js
│   │
│   ├── manifest.json
│   │
│   ├── newsVerifier.js
│   ├── patternDatabase.js
│   │
│   ├── popup.html
│   ├── popup.js
│   │
│   ├── segmentAnalyzer.js
│   ├── settings.html
│   ├── settings.js
│   │
│   ├── setupCredentials.js
│   ├── socialMediaScanner.js
│   ├── statisticalAnalyzer.js
│   │
│   ├── videoAnalysisPipeline.js
│   └── visualHighlighter.js
│
├── README.md
├── LICENSE
├── .gitignore
│
├── test-fake-news.html
└── test-legitimate-news.html

---

## 🔧 Configuration

### Extension Settings

Access settings by clicking the UnReal icon → **Settings (⚙️)**

| Setting | Description | Default |
|---------|-------------|---------|
| **Extension Enabled** | Master on/off switch | ON |
| **Segment Analysis** | Enable per-segment breakdown | ON |
| **Image Analysis** | Analyze images for manipulation | ON |
| **LLM Tie-breaker** | Use AI for uncertain cases | OFF |

### API Key Setup

1. Visit [Google AI Studio](https://aistudio.google.com/app/apikey)
2. Sign in with your Google account
3. Create a new API key
4. Copy the key
5. Open extension settings → Paste key → Save
6. Enable "LLM Tie-breaker" toggle

**Note:** LLM is only used for scores between 35-65 to save API quota.
---

## 🧠 How It Works

### Analysis Pipeline

```bash
Page Load
    ↓
Extract Content (Text, Images, URLs)
    ↓
Statistical Analysis (Pattern Matching)
    ↓
Calculate Base Score (0-100)
    ↓
Score Between 35-65? ──No──→ Show Result
    ↓ Yes
LLM Enabled? ──No──→ Show Result
    ↓ Yes
AI Tie-breaker (Gemini)
    ↓
Final Score & Verdict
    ↓
Display Badge + Notification
```

### Detection Patterns

#### AI-Generated Content
- "Made with Midjourney", "Generated by AI"
- "Stable Diffusion", "DALL-E"
- Watermarks from AI tools

#### Manipulated Media
- "Photoshopped", "Edited", "Manipulated"
- "Doctored", "Altered", "Fake"


#### Misinformation Markers
- "Shocking truth", "They don't want you to know"
- "Secret revealed", "This one trick"
- Conspiracy keywords, anti-science claims

#### Out-of-Context Content
- "Old video", "From 2019"
- "Resurfaced", "Not what it seems"

#### Trusted Sources (Score Reduction)
- Reuters, AP News, BBC, Times of India, News 18, MoneyControl
- Snopes, FactCheck.org
- Academic journals (.edu, .gov)

---

## 🎮 Usage Examples

### Basic Usage

1. **Browse normally** - Extension analyzes every page automatically
2. **Check the badge** - Appears in bottom-right corner with risk level
3. **Read details** - Click extension icon for full analysis report
4. **View segments** - Click badge to highlight risky text sections

### Clear Cache

If you notice stale results:
1. Click extension icon
2. Open settings
3. Click **Clear Cache**

---

## 🛠️ Development

### Prerequisites

- Google Chrome (latest version)
- Text editor (VS Code recommended)
- Basic knowledge of JavaScript

### Setup Development Environment

```bash
# Clone repository
git clone <repository-url>
cd /extension

# Make changes to files
# Edit contentNew.js, backgroundNew.js, etc.

# Reload extension
# Go to chrome://extensions
# Click refresh icon on UnReal extension

# Test on any webpage
# Open a news site or social media
```

### Testing

1. **Test Statistical Analysis**
   - Visit pages with known AI-generated content or visit ai generated image (person does not exist)
   - Check if badges appear with appropriate scores

2. **Test AI Integration**
   - Visit ambiguous content
   - Verify AI tie-breaker activates (check console logs)



### Debugging

Enable detailed logging:
```javascript
// In backgroundNew.js or contentNew.js
console.log('[UnReal]', 'Your debug message');
```

Check console:
- Right-click page → Inspect → Console tab
- Look for `[UnReal]` prefixed messages

---

## 📊 Performance

### Efficiency Features

- **Caching** - Results cached for 10 minutes
- **Debouncing** - Prevents over-analysis on dynamic pages
- **Lazy Loading** - Modules loaded only when needed
- **Quota Management** - LLM only used for uncertain cases

### Resource Usage

- **Memory** - ~5-10 MB per tab
- **CPU** - Minimal impact (runs on page idle)
- **Network** - API calls only when LLM enabled
- **Storage** - <1 MB (settings + cache)

---

## 🔒 Privacy & Security

### Data Handling

✅ **Local-First Analysis** - Statistical analysis runs entirely in browser  
✅ **No Tracking** - Zero analytics or user behavior tracking  
✅ **No External Servers** - No data sent to third-party servers  
✅ **Optional AI** - Gemini API only used if you enable it  
✅ **Secure Storage** - API keys stored in Chrome's encrypted storage  

### What Gets Sent to Gemini?

Only when LLM tie-breaker is enabled AND score is 35-65:
- Text content of the page (up to 4000 characters)
- Image data URLs (if image analysis enabled)
- No personal information, cookies, or browsing history

### Permissions Explained

- `activeTab` - Access current page content for analysis
- `storage` - Save settings and cache results
- `scripting` - Inject content scripts for badge display
- `host_permissions` - Analyze any website you visit

---

## 🐛 Troubleshooting

### Badge Not Appearing

- Check if extension is enabled in settings
- Verify page has loaded completely
- Try refreshing the page
- Check console for errors

### Low Accuracy

- Enable LLM tie-breaker with valid API key
- Check if domain is in trusted sources list
- Some pages may need segment analysis enabled

### API Key Issues

- Verify key is correct (no extra spaces)
- Check API key is active in Google AI Studio
- Ensure you have available quota
- Try regenerating the key

### High CPU Usage

- Disable segment analysis for better performance
- Disable image analysis if not needed
- Clear cache regularly

---

## 🤝 Contributing

Contributions are welcome! Here's how to help:

1. **Fork the repository**
2. **Create a feature branch**
   ```bash
   git checkout -b feature/AmazingFeature
   ```
3. **Make your changes**
4. **Test thoroughly**
5. **Commit with clear messages**
   ```bash
   git commit -m 'Add AI pattern for XYZ detection'
   ```
6. **Push to your fork**
   ```bash
   git push origin feature/AmazingFeature
   ```
7. **Open a Pull Request**

### Areas for Contribution

- 🔍 New detection patterns
- 🌐 Social media platform support
- 🎨 UI/UX improvements
- 🌍 Internationalization
- 📚 Documentation
- 🧪 Test coverage

---

## 📝 Changelog

### Version 2.0.0 (Current)
- ✨ Segment-based analysis
- 🎯 AI tie-breaker mode
- 🎨 Visual highlighting
- 📱 Enhanced social media scanning
- ⚡ Performance optimizations
- 🔧 Improved settings panel

### Version 1.0.0
- 🎉 Initial release
- 🔍 Basic content analysis
- 📊 Trust scoring system
- 🔔 Notification system


---

## 🙏 Acknowledgments

- Google Gemini AI for advanced analysis capabilities
- Chrome Extensions team for Manifest V3 documentation
- Open-source community for inspiration and support

---

## 📧 Support

For issues, questions, or suggestions:
- 🐛 **Bug Reports**: [Open an issue](../../issues)
- 💡 **Feature Requests**: [Submit an idea](../../issues)
- 📖 **Documentation**: Check [extension/README.md](extension/README.md)

---

## 🔗 Links

- **Extension Documentation**: [extension/README.md](extension/README.md)
- **Landing Page**: [docs/index.html](docs/index.html)
- **Google AI Studio**: https://aistudio.google.com/
- **Chrome Extensions**: https://developer.chrome.com/docs/extensions/

---

<div align="center">

**Built with ❤️ by Team CodeCrafters. for GDG hackathon**

Making the internet more trustworthy, one webpage at a time

</div>
