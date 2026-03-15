# ShareSafe - AI-Powered Misinformation Detector

A Chrome Extension (Manifest V3) that detects fake news, AI-generated content, manipulated media, and misinformation in real-time.

## Features

### 🔍 **Smart Content Analysis**
- **AI-Generated Content Detection** - Identifies DALL-E, Midjourney, Stable Diffusion, ChatGPT content
- **Deepfake & Synthetic Media** - Flags potential deepfakes and AI avatars  
- **Manipulated Media** - Detects edited, photoshopped, or doctored content
- **Fake News Detection** - Identifies clickbait, conspiracy theories, and misinformation
- **Health & Financial Scams** - Warns about miracle cures and get-rich-quick schemes

### 📱 **Social Media Feed Scanner**
Works on Twitter/X, Facebook, Instagram, LinkedIn, Reddit, TikTok:
- **Real-time scanning** as you scroll
- **Per-post warnings** injected directly into the feed
- **Automatic alerts** when risky content detected

### 🎯 **Dynamic Trust Scoring**
- Score: 0-100 (0 = most trustworthy, 100 = highest risk)
- **Low Risk** (0-24): Green badge ✓
- **Medium Risk** (25-54): Orange badge ⚠️
- **High Risk** (55-100): Red badge 🚨

### 🔔 **Auto Notifications**
- Toast notification slides in automatically
- Risk label shows next to badge
- Badge pulses for high-risk content
- No clicking needed!

## Installation

1. Open Chrome → `chrome://extensions/`
2. Enable **Developer mode** (top-right toggle)
3. Click **Load unpacked**
4. Select the `sharesafe` folder
5. Pin the extension for easy access

## Usage

### Automatic Mode (Default)
Just browse! The extension automatically:
1. Analyzes every page you visit
2. Shows floating badge (bottom-right)
3. Displays risk level and score
4. On social media, scans posts as you scroll

### Using Gemini AI (Optional)
1. Get API key: [Google AI Studio](https://aistudio.google.com/app/apikey)
2. Click ShareSafe icon → **Settings**
3. Paste API key → **Save**
4. Triple-click popup header → Disable Demo Mode

## What Gets Detected

| Category | Examples |
|----------|----------|
| **AI Content** | "Made with Midjourney", "AI generated", DALL-E images |
| **Fake/Edited** | "Photoshopped", "manipulated", "doctored" |
| **Clickbait** | "You won't believe", "Shocking truth", "Secret revealed" |
| **Misinformation** | Conspiracy theories, anti-vax content, scams |
| **Out of Context** | "Old video", "From 2019", "Resurfaced" |
| **Trusted Sources** | Reuters, BBC, AP News, fact-checkers get bonus |

## Files

| File | Purpose |
|------|---------|
| `manifest.json` | Extension configuration |
| `content.js` | Page analysis + floating badge + social feed scanner |
| `background.js` | Analysis engine + caching + API handler |
| `gemini.js` | Google Gemini AI integration |
| `popup.html/js` | Extension popup UI |
| `settings.html/js` | API key configuration |
| `icons/` | Extension icons |

## Demo Mode

Demo mode is **ON by default** and works without an API key. It analyzes content locally using pattern matching. The scoring is dynamic based on:

- Keywords detected in content
- URL patterns  
- Image/video presence
- Multiple factors combined

## Privacy

- **Local analysis** by default (Demo Mode)
- API calls only if you add a Gemini key
- No data sent to external servers
- No tracking or analytics

## Development

```bash
# Make changes
# Go to chrome://extensions
# Click refresh icon on ShareSafe
# Test on any webpage
```

## License

MIT

---

Built for GDG Hackathon 2025 🚀
